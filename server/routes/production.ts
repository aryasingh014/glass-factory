import { RequestHandler, Response } from "express";
import { GlassItem, PIMaster, ProductionHistory, RejectRecord, ReworkRecord, DashboardStats, ProductionStage } from "@shared/api";
import { piDatabase, glassItemsDatabase, productionHistoryDatabase, rejectDatabase, reworkDatabase, saveDatabaseToDisk, loadDatabaseFromDisk } from "./pi";
import { logger } from "../lib/logger";

const sseClients: Response[] = [];

export const handleEventsStream: RequestHandler = (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  sseClients.push(res);

  req.on("close", () => {
    const idx = sseClients.indexOf(res);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
};

export function broadcastUpdate(eventType = "update", payload: Record<string, any> = {}) {
  const msg = `event: ${eventType}\ndata: ${JSON.stringify({ timestamp: new Date().toISOString(), ...payload })}\n\n`;
  for (let i = sseClients.length - 1; i >= 0; i--) {
    try {
      sseClients[i].write(msg);
    } catch {
      sseClients.splice(i, 1);
    }
  }
}

export function sanitizeString(input: unknown, maxLen = 500): string {
  if (typeof input !== "string") return "";
  return input.replace(/<[^>]*>?/gm, "").trim().slice(0, maxLen);
}

// Barcode / QR ID / Serial Lookup
export const handleScanLookup: RequestHandler = (req, res) => {
  const { code } = req.body;
  if (!code) {
    res.status(400).json({ message: "Code parameter is required" });
    return;
  }

  const query = String(code).trim().toLowerCase();
  const item = glassItemsDatabase.find(
    (g) =>
      g.barcode.toLowerCase() === query ||
      g.qrId.toLowerCase() === query ||
      g.serialNumber.toLowerCase() === query ||
      (g.qrId.toLowerCase().includes(query))
  );

  if (!item) {
    res.status(404).json({ message: `No glass item found for code: ${code}` });
    return;
  }

  const pi = piDatabase.find((p) => p.id === item.piId);
  const history = productionHistoryDatabase.filter((h) => h.serialNumber === item.serialNumber || h.barcode === item.barcode);

  res.json({ item, pi, history });
};

// Complete stage & advance to next stage in process route (Supports QTY-based piece-by-piece scanning)
export const handleAdvanceStage: RequestHandler = (req, res) => {
  const { serialNumbers, advanceQty = 1, advanceAll = false, operator = "Operator", remarks = "Stage completed" } = req.body;
  const cleanOperator = sanitizeString(operator || "Operator", 100);
  const cleanRemarks = sanitizeString(remarks || "Stage completed", 500);

  if (!Array.isArray(serialNumbers) || serialNumbers.length === 0) {
    res.status(400).json({ message: "serialNumbers array is required" });
    return;
  }

  const finalSerialNumbers = Array.from(new Set(serialNumbers.map((s) => String(s))));

  const updatedItems: GlassItem[] = [];
  const skippedItems: { serialNumber: string; reason: string }[] = [];
  const affectedPiIds = new Set<string>();
  let hasPairingItems = false;

  // Build fast O(1) index map preserving first-match semantics of Array.find
  const itemMap = new Map<string, GlassItem>();
  for (let i = 0; i < glassItemsDatabase.length; i++) {
    const g = glassItemsDatabase[i];
    if (g.id) itemMap.set(g.id, g);
    if (!itemMap.has(g.serialNumber)) itemMap.set(g.serialNumber, g);
    if (g.barcode && !itemMap.has(g.barcode)) itemMap.set(g.barcode, g);
  }

  for (const serial of finalSerialNumbers) {
    const item = itemMap.get(serial);
    if (!item) {
      skippedItems.push({ serialNumber: String(serial), reason: "Item not found" });
      continue;
    }
    if (item.status === "Rejected") {
      skippedItems.push({ serialNumber: item.serialNumber, reason: "Item is rejected" });
      continue;
    }

    const currentStage = item.currentStage;
    if (!item.completedStages.includes(currentStage)) {
      item.completedStages.push(currentStage);
    }

    // Determine next stage from processRoute
    const route = item.processRoute;
    let currentIndex = -1;
    if (currentStage === "Pairing") {
      if (item.completedStages.includes("Lamination")) {
        currentIndex = route.lastIndexOf("Pairing");
      } else {
        currentIndex = route.indexOf("Pairing");
      }
    } else {
      currentIndex = route.indexOf(currentStage);
    }
    const nextStage = currentIndex >= 0 && currentIndex < route.length - 1 ? route[currentIndex + 1] : "Finished";

    if (nextStage === "Pairing") {
      hasPairingItems = true;
      if (item.completedStages.includes("Lamination") || item.colorOrClear === "Colour" || !route.includes("Lamination")) {
        item.dlguPhase = "DguPairing";
      } else {
        item.dlguPhase = "LamPairing";
      }
    }

    const isDguStage = currentStage === "DGU";
    const currentQty = parseInt(String(item.qty || 1), 10) || 1;
    const qtyToAdvance = (advanceAll || isDguStage) ? currentQty : Math.min(parseInt(String(advanceQty || 1), 10) || 1, currentQty);

    // QTY Decrement & Per-Piece Scan Logic:
    // If the item has qty > 1 and we are scanning piece-by-piece (!advanceAll && !isDguStage)
    if (currentQty > qtyToAdvance && !advanceAll && !isDguStage) {
      // 1. Reduce remaining quantity in current stage
      const remainingQty = currentQty - qtyToAdvance;
      item.qty = remainingQty;
      item.lineQty = remainingQty;
      item.sqm = parseFloat(((item.width * item.height * remainingQty) / 1000000).toFixed(2));
      item.updatedAt = new Date().toISOString();

      // 2. Spawn the advanced item in nextStage with the scanned quantity
      const advancedItem: GlassItem = {
        ...item,
        id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        qty: qtyToAdvance,
        lineQty: qtyToAdvance,
        sqm: parseFloat(((item.width * item.height * qtyToAdvance) / 1000000).toFixed(2)),
        currentStage: nextStage,
        completedStages: [...item.completedStages],
        status: nextStage === "Finished" ? "Completed" : "In Production",
        updatedAt: new Date().toISOString(),
      };

      // DGU Stage Rule: After cutting process, DGU glass quantity is reduced to actual DGU unit quantity (standard DGU only)
      const descLower = `${advancedItem.glassType || ""} ${advancedItem.glassCode || ""}`.toLowerCase();
      const isDgu = advancedItem.processRoute.includes("DGU") || descLower.includes("dgu") || descLower.includes("igu") || descLower.includes("double") || descLower.includes("spacer");
      if (currentStage === "Cutting" && isDgu && !advancedItem.processRoute.includes("Lamination") && !(advancedItem as any).isDguReduced) {
        (advancedItem as any).isDguReduced = true;
      }

      glassItemsDatabase.push(advancedItem);
      updatedItems.push(advancedItem);

      // 3. Log history for the scanned piece
      productionHistoryDatabase.unshift({
        id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        serialNumber: item.serialNumber,
        barcode: item.barcode,
        piNumber: item.piNumber,
        itemOrBatch: item.serialNumber,
        action: nextStage === "Finished" ? "Dispatched to Finished" : `Advanced to ${nextStage}`,
        prevStatus: currentStage,
        newStatus: nextStage === "Finished" ? "Completed" : nextStage,
        stage: currentStage,
        status: "Completed",
        operator: cleanOperator,
        user: cleanOperator,
        timestamp: new Date().toISOString(),
        remarks: `${cleanRemarks} (${qtyToAdvance} pc scanned • ${remainingQty} pcs remaining in ${currentStage})`,
      });
    } else {
      // Full line item quantity advanced
      // DGU Stage Rule: After cutting process, standard DGU glass quantity is reduced to actual DGU unit quantity
      const descLower = `${item.glassType || ""} ${item.glassCode || ""}`.toLowerCase();
      const isDgu = item.processRoute.includes("DGU") || descLower.includes("dgu") || descLower.includes("igu") || descLower.includes("double") || descLower.includes("spacer");

      if (currentStage === "Cutting" && isDgu && !item.processRoute.includes("Lamination") && !(item as any).isDguReduced) {
        const dguUnitQty = Math.ceil((item.qty || 1) / 2);
        logger.info(`[DGU Rule] Reducing quantity for DGU glass ${item.serialNumber} after Cutting: ${item.qty} cut panes -> ${dguUnitQty} DGU units.`);
        item.qty = dguUnitQty;
        item.sqm = parseFloat(((item.width * item.height * item.qty) / 1000000).toFixed(2));
        (item as any).isDguReduced = true;
      }

      item.currentStage = nextStage;
      item.updatedAt = new Date().toISOString();

      if (nextStage === "Finished") {
        item.status = "Completed";

        // If this item is part of a DGU or DLGU unit, advance any partner pane currently in DGU as well
        if (item.glassCategory === "DLGU" || item.glassCategory === "DGU" || item.processRoute.includes("DGU")) {
          const itemPairId = (item as any).lamPairId;
          glassItemsDatabase.forEach((other) => {
            if (other.id !== item.id && other.currentStage === "DGU" && other.status !== "Completed" && other.status !== "Rejected") {
              const isPartner =
                (itemPairId && (other as any).lamPairId === itemPairId) ||
                (other.posNo === item.posNo &&
                  other.width === item.width &&
                  other.height === item.height &&
                  (other.piId === item.piId || other.piNumber === item.piNumber || other.orderNo === item.orderNo));
              if (isPartner) {
                other.currentStage = "Finished";
                other.status = "Completed";
                if (!other.completedStages.includes("DGU")) other.completedStages.push("DGU");
                other.updatedAt = new Date().toISOString();
                updatedItems.push(other);
              }
            }
          });
        }
      } else {
        item.status = "In Production";
      }

      // Log history
      productionHistoryDatabase.unshift({
        id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        serialNumber: item.serialNumber,
        barcode: item.barcode,
        piNumber: item.piNumber,
        itemOrBatch: item.serialNumber,
        action: nextStage === "Finished" ? "Dispatched to Finished" : `Advanced to ${nextStage}`,
        prevStatus: currentStage,
        newStatus: nextStage === "Finished" ? "Completed" : nextStage,
        stage: currentStage,
        status: "Completed",
        operator: cleanOperator,
        user: cleanOperator,
        timestamp: new Date().toISOString(),
        remarks: cleanRemarks,
      });

      updatedItems.push(item);
    }

    if (item.piId) {
      affectedPiIds.add(item.piId);
    }
  }

  // Update PI completion status across all batches
  for (const pi of piDatabase) {
    const cleanId = (pi.id || "").replace(/^STK-/i, "");
    const cleanPiNo = (pi.piNumber || "").replace(/^STK-/i, "");
    const piItems = glassItemsDatabase.filter(
      (i) =>
        i.piId === pi.id ||
        i.piNumber === pi.piNumber ||
        i.piId === cleanId ||
        i.piNumber === cleanPiNo ||
        i.batchNo === cleanPiNo ||
        i.batchNo === pi.piNumber ||
        (i.sfoNo && (i.sfoNo === pi.piNumber || i.sfoNo === cleanPiNo))
    );
    if (piItems.length === 0) continue;
    const completedCount = piItems.filter((i) => i.currentStage === "Finished" || i.status === "Completed").length;
    pi.completedItemsCount = completedCount;
    if (completedCount >= piItems.length && piItems.length > 0) {
      pi.status = "Completed";
    } else if (completedCount > 0 || piItems.some((i) => i.currentStage !== "Cutting" || i.completedStages?.length)) {
      pi.status = "In Production";
    }
  }

  if (hasPairingItems) {
    autoAdvancePairedDguItems();
    autoAdvancePairedLaminationItems();
    autoAdvancePairedDlguItems(); // Phase 2: Laminated + 8MM SN Grey → DGU
  }

  saveDatabaseToDisk();
  broadcastUpdate("stage_advanced", { count: updatedItems.length });

  res.json({
    message: updatedItems.length > 0 ? "Item(s) advanced successfully" : "No items were advanced",
    items: updatedItems,
    skippedItems,
    skippedCount: skippedItems.length,
  });
};

export function isDlguItem(item: any): boolean {
  if (!item) return false;
  if (item.glassCategory === "DLGU") return true;
  if (Array.isArray(item.processRoute)) {
    if (item.processRoute.includes("Lamination") && item.processRoute.includes("DGU")) return true;
  }
  const str = `${item.glassType || ""} ${item.glassCode || ""} ${item.itemCode || ""}`.toLowerCase();
  const hasSpacer = str.includes("spacer") || str.includes("dgu") || str.includes("igu");
  const hasLam = str.includes("lam") || str.includes("lamination") || str.includes("laminated") || str.includes("pvb") || str.includes("sgp");
  return hasSpacer && hasLam;
}

export function isDguItem(item: any): boolean {
  if (!item) return false;
  if (item.glassCategory === "DLGU") return false;
  if (item.glassCategory === "DGU") return true;
  if (item.glassCategory === "Lamination") return false;
  if (Array.isArray(item.processRoute)) {
    if (item.processRoute.includes("DGU") && !item.processRoute.includes("Lamination")) return true;
    if (item.processRoute.includes("Lamination")) return false;
  }
  const str = `${item.glassType || ""} ${item.glassCode || ""}`.toLowerCase();
  const hasSpacer = str.includes("dgu") || str.includes("igu") || str.includes("double") || str.includes("spacer");
  const hasLam = str.includes("lam") || str.includes("lamination") || str.includes("lgu") || str.includes("pvb") || str.includes("sgp");
  return hasSpacer && !hasLam;
}

export function isLaminationItem(item: any): boolean {
  if (!item) return false;
  if (item.glassCategory === "DLGU") return false;
  if (item.glassCategory === "Lamination") return true;
  if (item.glassCategory === "DGU") return false;
  if (Array.isArray(item.processRoute)) {
    if (item.processRoute.includes("Lamination") && !item.processRoute.includes("DGU")) return true;
    if (item.processRoute.includes("DGU")) return false;
  }
  const str = `${item.glassType || ""} ${item.glassCode || ""} ${item.itemCode || ""}`.toLowerCase();
  const hasSpacer = str.includes("dgu") || str.includes("igu") || str.includes("double") || str.includes("spacer");
  const hasLam = str.includes("lam") || str.includes("lamination") || str.includes("lgu") || str.includes("pvb") || str.includes("sgp");
  return hasLam && !hasSpacer;
}

export function isDlguStickerPairMatch(paneA: any, paneB: any): boolean {
  if (!paneA || !paneB) return false;
  if ((paneA.serialNumber && paneB.serialNumber && paneA.serialNumber === paneB.serialNumber) || (paneA.id && paneB.id && paneA.id === paneB.id)) return false;

  const isALamDone = Array.isArray(paneA.completedStages) && paneA.completedStages.includes("Lamination");
  const isBLamDone = Array.isArray(paneB.completedStages) && paneB.completedStages.includes("Lamination");
  const isAInLam = paneA.currentStage === "Lamination";
  const isBInLam = paneB.currentStage === "Lamination";

  const isAColour = paneA.colorOrClear === "Colour" || String(paneA.category || "").toLowerCase().includes("colour");
  const isBColour = paneB.colorOrClear === "Colour" || String(paneB.category || "").toLowerCase().includes("colour");

  // If one is Colour and one is Clear: Phase 2 (DGU Pairing)
  if (isAColour !== isBColour) {
    const clrPane = isAColour ? paneB : paneA;
    const isClrReady =
      clrPane.dlguPhase === "DguPairing" ||
      isAInLam ||
      isBInLam ||
      isALamDone ||
      isBLamDone ||
      (Array.isArray(clrPane.completedStages) && clrPane.completedStages.includes("Lamination"));
    if (!isClrReady) return false;
  } else {
    // Phase 1: Lamination Pairing (6mm Clear + 13.52mm Clear Lam partner)
    if (!paneA.glassType || !paneB.glassType) return false;
    if (paneA.glassType === paneB.glassType) return false; // Same lite, cannot pair with itself
  }

  // 1. Order No / PI # must match
  const orderA = String(paneA.orderNo || paneA.piNumber || paneA.piId || "").replace(/^STK-/i, "").trim().toLowerCase();
  const orderB = String(paneB.orderNo || paneB.piNumber || paneB.piId || "").replace(/^STK-/i, "").trim().toLowerCase();
  if (orderA && orderB && orderA !== orderB) return false;

  // 2. POS # must match
  const posA = String(paneA.posNo || "").trim();
  const posB = String(paneB.posNo || "").trim();
  if (posA && posB && posA !== posB) return false;

  // 3. Exact Dimensions
  const wA = Number(paneA.width);
  const wB = Number(paneB.width);
  const hA = Number(paneA.height);
  const hB = Number(paneB.height);
  if (isNaN(wA) || isNaN(wB) || wA !== wB) return false;
  if (isNaN(hA) || isNaN(hB) || hA !== hB) return false;

  return true;
}

export function isStickerPairMatch(col: any, clr: any): boolean {
  if (!col || !clr) return false;

  if (isDlguItem(col) && isDlguItem(clr)) {
    return isDlguStickerPairMatch(col, clr);
  }

  // STRICT RULE: Both panes must strictly be DGU glass and NEVER Lamination glass
  if (!isDguItem(col) || !isDguItem(clr)) return false;
  if (isLaminationItem(col) || isLaminationItem(clr)) return false;
  if (col.glassCategory === "Lamination" || clr.glassCategory === "Lamination") return false;

  // STRICT RULE: DGU requires 1 Colour outer lite + 1 Clear inner lite (cannot pair two Colour or two Clear panes)
  const isColFinishColour = (col.colorOrClear === "Colour" || col.colorOrClear === "Color" || String(col.category || "").toLowerCase().includes("colour"));
  const isClrFinishColour = (clr.colorOrClear === "Colour" || clr.colorOrClear === "Color" || String(clr.category || "").toLowerCase().includes("colour"));
  if (isColFinishColour === isClrFinishColour) return false;

  // 1. Order No / PI # must match
  const colOrder = String(col.orderNo || col.piNumber || col.piId || "").replace(/^STK-/i, "").trim().toLowerCase();
  const clrOrder = String(clr.orderNo || clr.piNumber || clr.piId || "").replace(/^STK-/i, "").trim().toLowerCase();
  if (colOrder && clrOrder && colOrder !== clrOrder) return false;

  // 2. POS # (Position Number) must match
  const colPos = String(col.posNo || "").trim();
  const clrPos = String(clr.posNo || "").trim();
  if (colPos && clrPos && colPos !== clrPos) return false;

  // 3. Exact Dimensions (Width & Height in mm) must match
  const colW = Number(col.width);
  const clrW = Number(clr.width);
  const colH = Number(col.height);
  const clrH = Number(clr.height);
  if (isNaN(colW) || isNaN(clrW) || colW !== clrW) return false;
  if (isNaN(colH) || isNaN(clrH) || colH !== clrH) return false;

  // 4. OB # must match (when present on both)
  const colOb = String(col.obNo || "").trim().toLowerCase();
  const clrOb = String(clr.obNo || "").trim().toLowerCase();
  if (colOb && clrOb && colOb !== clrOb) return false;

  // 5. Line QTY / Order Qty must match (when present on both)
  const colQty = col.lineQty || col.totalQty;
  const clrQty = clr.lineQty || clr.totalQty;
  if (colQty && clrQty && colQty !== clrQty) return false;

  // 6. Glass Code must match (when present on both)
  const colCode = String(col.glassCode || col.itemCode || "").trim().toLowerCase();
  const clrCode = String(clr.glassCode || clr.itemCode || "").trim().toLowerCase();
  if (colCode && clrCode && colCode !== clrCode) return false;

  // 7. Client Name must match (when present on both)
  const colCust = String(col.customerName || "").trim().toLowerCase();
  const clrCust = String(clr.customerName || "").trim().toLowerCase();
  if (colCust && clrCust && colCust !== clrCust) return false;

  // 8. Project Name must match (when present on both)
  const colProj = String(col.projectName || "").trim().toLowerCase();
  const clrProj = String(clr.projectName || "").trim().toLowerCase();
  if (colProj && clrProj && colProj !== clrProj) return false;

  return true;
}

export function autoAdvancePairedDguItems(): number {
  const pairingItems = glassItemsDatabase.filter(
    (i) => i.currentStage === "Pairing" && i.status !== "Completed" && i.status !== "Rejected"
  );
  if (pairingItems.length === 0) return 0;

  const isColour = (i: any) => {
    const typeStr = String(i.glassType || "").toLowerCase();
    const colorStr = String(i.glassColor || "").toLowerCase();
    const catStr = String(i.category || "").toLowerCase();

    const hasColourKeyword =
      typeStr.includes("grey") ||
      typeStr.includes("gray") ||
      typeStr.includes("bronze") ||
      typeStr.includes("blue") ||
      typeStr.includes("green") ||
      typeStr.includes("stopray") ||
      typeStr.includes("sunguard") ||
      typeStr.includes("sn grey") ||
      typeStr.includes("syp") ||
      typeStr.includes("tint") ||
      typeStr.includes("coated") ||
      colorStr.includes("colour") ||
      colorStr.includes("color") ||
      colorStr.includes("grey") ||
      colorStr.includes("bronze") ||
      colorStr.includes("blue") ||
      colorStr.includes("green") ||
      catStr.includes("colour") ||
      catStr.includes("color");

    if (typeStr.includes("clear") && !hasColourKeyword) return false;
    if (hasColourKeyword) return true;
    if (i.colorOrClear === "Colour" || i.colorOrClear === "Color") return true;
    if (i.colorOrClear === "Clear") return false;
    return false;
  };

  // Only consider items that are STRICTLY DGU (never Lamination)
  const dguPairingItems = pairingItems.filter(
    (i) => isDguItem(i) && !isLaminationItem(i) && i.glassCategory !== "Lamination"
  );
  const colourPanes = dguPairingItems.filter(isColour);
  const clearPanes = dguPairingItems.filter((i) => !isColour(i));

  const usedClear = new Set<string>();
  let advancedCount = 0;

  colourPanes.forEach((col) => {
    // Exact sticker match across all factory criteria (Order No, OB #, POS #, Width, Height, Glass Code, etc.)
    const match = clearPanes.find(
      (clr) => !usedClear.has(clr.serialNumber) && isStickerPairMatch(col, clr)
    );

    if (match) {
      usedClear.add(match.serialNumber);

      // Auto-advance both paired panes from "Pairing" to "DGU"
      col.currentStage = "DGU";
      if (!col.completedStages.includes("Pairing")) col.completedStages.push("Pairing");
      col.updatedAt = new Date().toISOString();

      match.currentStage = "DGU";
      if (!match.completedStages.includes("Pairing")) match.completedStages.push("Pairing");
      match.updatedAt = new Date().toISOString();

      productionHistoryDatabase.unshift({
        id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        serialNumber: col.serialNumber,
        barcode: col.barcode,
        piNumber: col.piNumber,
        stage: "Pairing",
        status: "Completed",
        operator: "Auto-Pairing Engine",
        timestamp: new Date().toISOString(),
        remarks: `Auto-paired with Clear Pane ${match.serialNumber} (${match.barcode}) and advanced to DGU Assembly Line`,
      });

      productionHistoryDatabase.unshift({
        id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        serialNumber: match.serialNumber,
        barcode: match.barcode,
        piNumber: match.piNumber,
        stage: "Pairing",
        status: "Completed",
        operator: "Auto-Pairing Engine",
        timestamp: new Date().toISOString(),
        remarks: `Auto-paired with Colour Pane ${col.serialNumber} (${col.barcode}) and advanced to DGU Assembly Line`,
      });

      advancedCount += 2;
      logger.info(`[Auto-Pairing] Paired Colour ${col.serialNumber} + Clear ${match.serialNumber} -> Automatically advanced to DGU!`);
    }
  });

  if (advancedCount > 0) {
    saveDatabaseToDisk();
  }

  return advancedCount;
}

export function isLaminationStickerPairMatch(paneA: any, paneB: any): boolean {
  if (!paneA || !paneB) return false;
  if (paneA.serialNumber === paneB.serialNumber || (paneA.id && paneB.id && paneA.id === paneB.id)) return false;

  // STRICT RULE: Both panes must strictly be Lamination glass and NEVER DGU glass
  if (!isLaminationItem(paneA) || !isLaminationItem(paneB)) return false;
  if (isDguItem(paneA) || isDguItem(paneB)) return false;
  if (paneA.glassCategory === "DGU" || paneB.glassCategory === "DGU") return false;

  // STRICT RULE: Two identical panes of the SAME lite/batch cannot pair with each other!
  // A laminated pair requires two complementary lites (e.g. 10MM + 12MM, or Batch 5301 + Batch 1620, or different layer/type).
  const barcodeA = String(paneA.barcode || "");
  const barcodeB = String(paneB.barcode || "");
  if (barcodeA && barcodeB && barcodeA === barcodeB) return false;

  const piA = String(paneA.piId || paneA.piNumber || "");
  const piB = String(paneB.piId || paneB.piNumber || "");
  const thickA = (paneA.thickness || paneA.glassType?.match(/^\d+(\.\d+)?\s*MM/i)?.[0] || "").toUpperCase().replace(/\s+/g, "");
  const thickB = (paneB.thickness || paneB.glassType?.match(/^\d+(\.\d+)?\s*MM/i)?.[0] || "").toUpperCase().replace(/\s+/g, "");

  // If from the same PI/Batch with the same thickness and same glassType, they are the same single lite and cannot pair!
  if (piA && piB && piA === piB && thickA && thickB && thickA === thickB && paneA.glassType === paneB.glassType) {
    return false;
  }

  // Must have a distinguishing lite characteristic (different thickness, different batch/PI, or different glassType)
  const isDifferentLite = (thickA && thickB && thickA !== thickB) || (piA && piB && piA !== piB) || (paneA.glassType !== paneB.glassType);
  if (!isDifferentLite) return false;

  // 1. Order No / PI # must match
  const orderA = String(paneA.orderNo || paneA.piNumber || paneA.piId || "").replace(/^STK-/i, "").trim().toLowerCase();
  const orderB = String(paneB.orderNo || paneB.piNumber || paneB.piId || "").replace(/^STK-/i, "").trim().toLowerCase();
  if (orderA && orderB && orderA !== orderB) return false;

  // 2. POS # (Position Number) must match
  const posA = String(paneA.posNo || "").trim();
  const posB = String(paneB.posNo || "").trim();
  if (posA && posB && posA !== posB) return false;

  // 3. Exact Dimensions (Width & Height in mm) must match
  const wA = Number(paneA.width);
  const wB = Number(paneB.width);
  const hA = Number(paneA.height);
  const hB = Number(paneB.height);
  if (isNaN(wA) || isNaN(wB) || wA !== wB) return false;
  if (isNaN(hA) || isNaN(hB) || hA !== hB) return false;

  // 4. OB # must match (when present on both)
  const obA = String(paneA.obNo || "").trim().toLowerCase();
  const obB = String(paneB.obNo || "").trim().toLowerCase();
  if (obA && obB && obA !== obB) return false;

  // 5. Line QTY / Order Qty must match (when present on both)
  const qtyA = paneA.lineQty || paneA.totalQty;
  const qtyB = paneB.lineQty || paneB.totalQty;
  if (qtyA && qtyB && qtyA !== qtyB) return false;

  // 6. Client Name must match (when present on both)
  const custA = String(paneA.customerName || "").trim().toLowerCase();
  const custB = String(paneB.customerName || "").trim().toLowerCase();
  if (custA && custB && custA !== custB) return false;

  // 7. Project Name must match (when present on both)
  const projA = String(paneA.projectName || "").trim().toLowerCase();
  const projB = String(paneB.projectName || "").trim().toLowerCase();
  if (projA && projB && projA !== projB) return false;

  return true;
}

export function autoAdvancePairedLaminationItems(filterPosNo?: string, filterPi?: string): number {
  let pairingItems = glassItemsDatabase.filter(
    (i) => i.currentStage === "Pairing" && i.status !== "Completed" && i.status !== "Rejected"
  );
  if (filterPosNo) {
    pairingItems = pairingItems.filter((i) => i.posNo === filterPosNo);
  }
  if (filterPi) {
    pairingItems = pairingItems.filter((i) => i.piNumber === filterPi || i.orderNo === filterPi || i.piId === filterPi);
  }
  if (pairingItems.length === 0) return 0;

  // Lamination items that are STRICTLY Lamination (never DGU)
  const lamPairingItems = pairingItems.filter(
    (i) => isLaminationItem(i) && !isDguItem(i) && i.glassCategory !== "DGU"
  );
  if (lamPairingItems.length === 0) return 0;

  const usedPanes = new Set<string>();
  let advancedCount = 0;

  for (let i = 0; i < lamPairingItems.length; i++) {
    const paneA = lamPairingItems[i];
    if (usedPanes.has(paneA.serialNumber)) continue;

    // Find matching partner pane B with identical PI, POS, Dimensions, and OB #
    const match = lamPairingItems.find((paneB) => {
      if (paneB.serialNumber === paneA.serialNumber || usedPanes.has(paneB.serialNumber)) return false;
      return isLaminationStickerPairMatch(paneA, paneB);
    });

    if (match) {
      usedPanes.add(paneA.serialNumber);
      usedPanes.add(match.serialNumber);

      // Auto-advance both paired panes from "Pairing" to "Lamination"
      paneA.currentStage = "Lamination";
      if (!paneA.completedStages.includes("Pairing")) paneA.completedStages.push("Pairing");
      paneA.updatedAt = new Date().toISOString();

      match.currentStage = "Lamination";
      if (!match.completedStages.includes("Pairing")) match.completedStages.push("Pairing");
      match.updatedAt = new Date().toISOString();

      productionHistoryDatabase.unshift({
        id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        serialNumber: paneA.serialNumber,
        barcode: paneA.barcode,
        piNumber: paneA.piNumber,
        stage: "Pairing",
        status: "Completed",
        operator: "Auto-Pairing Engine",
        timestamp: new Date().toISOString(),
        remarks: `Auto-paired with matching Lamination Lite ${match.serialNumber} (${match.barcode}) and advanced to Lamination Workstation`,
      });

      productionHistoryDatabase.unshift({
        id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        serialNumber: match.serialNumber,
        barcode: match.barcode,
        piNumber: match.piNumber,
        stage: "Pairing",
        status: "Completed",
        operator: "Auto-Pairing Engine",
        timestamp: new Date().toISOString(),
        remarks: `Auto-paired with matching Lamination Lite ${paneA.serialNumber} (${paneA.barcode}) and advanced to Lamination Workstation`,
      });

      advancedCount += 2;
      logger.info(`[Auto-Pairing] Paired Lamination Lite ${paneA.serialNumber} + ${match.serialNumber} -> Automatically advanced to Lamination!`);
    }
  }

  if (advancedCount > 0) {
    saveDatabaseToDisk();
  }

  return advancedCount;
}

// Handler to pair and advance lamination items directly from Glass Pairing & Buffer view
export const handlePairLamination: RequestHandler = (req, res) => {
  const { posNo, piNumber } = req.body || {};
  const advancedCount = autoAdvancePairedLaminationItems(posNo, piNumber);
  if (advancedCount > 0) {
    broadcastUpdate("stage_advanced", { count: advancedCount });
    res.json({
      success: true,
      message: `Successfully paired ${advancedCount / 2} set(s) (${advancedCount} panes) and advanced to Lamination!`,
      pairedSets: advancedCount / 2,
      advancedPanes: advancedCount,
    });
  } else {
    res.json({
      success: false,
      message: "No ready matching lites found in Pairing Buffer to pair.",
      pairedSets: 0,
      advancedPanes: 0,
    });
  }
};

export const handlePairDgu: RequestHandler = (req, res) => {
  const advancedCount = autoAdvancePairedDguItems();
  if (advancedCount > 0) {
    saveDatabaseToDisk();
    broadcastUpdate("stage_advanced", { count: advancedCount });
    res.json({
      success: true,
      message: `Successfully paired ${advancedCount / 2} DGU unit(s) (${advancedCount} panes) and advanced to DGU Workstation!`,
      pairedSets: advancedCount / 2,
      advancedPanes: advancedCount,
    });
  } else {
    res.json({
      success: false,
      message: "No ready matching DGU lites found in Pairing Buffer to pair.",
      pairedSets: 0,
      advancedPanes: 0,
    });
  }
};

export function autoAdvancePairedDlguItems(filterPosNo?: string, filterPi?: string): number {
  let advancedCount = 0;
  const usedSerials = new Set<string>();

  // 1. Phase 1: Lamination Pairing in Pairing Buffer (e.g. 6mm Clear + 13.52mm Clear partner)
  const lamPairingPanes = glassItemsDatabase.filter(
    (i) =>
      i.currentStage === "Pairing" &&
      i.status !== "Completed" &&
      i.status !== "Rejected" &&
      isDlguItem(i) &&
      i.processRoute.includes("Lamination") &&
      !i.completedStages.includes("Lamination") &&
      i.colorOrClear !== "Colour"
  );

  for (let i = 0; i < lamPairingPanes.length; i++) {
    const paneA = lamPairingPanes[i];
    if (usedSerials.has(paneA.serialNumber)) continue;

    const match = lamPairingPanes.find(
      (paneB) => !usedSerials.has(paneB.serialNumber) && isDlguStickerPairMatch(paneA, paneB)
    );

    if (match) {
      usedSerials.add(paneA.serialNumber);
      usedSerials.add(match.serialNumber);

      const pairId = `lam-${paneA.serialNumber}-${match.serialNumber}`;
      (paneA as any).lamPairId = pairId;
      (match as any).lamPairId = pairId;

      paneA.currentStage = "Lamination";
      if (!paneA.completedStages.includes("Pairing")) paneA.completedStages.push("Pairing");
      paneA.updatedAt = new Date().toISOString();

      match.currentStage = "Lamination";
      if (!match.completedStages.includes("Pairing")) match.completedStages.push("Pairing");
      match.updatedAt = new Date().toISOString();

      productionHistoryDatabase.unshift({
        id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        serialNumber: paneA.serialNumber,
        barcode: paneA.barcode,
        piNumber: paneA.piNumber,
        stage: "Pairing",
        status: "Completed",
        operator: "Auto-Pairing Engine",
        timestamp: new Date().toISOString(),
        remarks: `[DLGU Phase 1] Auto-paired with partner ${match.serialNumber} (${match.barcode}) and advanced to Lamination`,
      });

      productionHistoryDatabase.unshift({
        id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        serialNumber: match.serialNumber,
        barcode: match.barcode,
        piNumber: match.piNumber,
        stage: "Pairing",
        status: "Completed",
        operator: "Auto-Pairing Engine",
        timestamp: new Date().toISOString(),
        remarks: `[DLGU Phase 1] Auto-paired with partner ${paneA.serialNumber} (${paneA.barcode}) and advanced to Lamination`,
      });

      advancedCount += 2;
    }
  }

  // 2. Phase 2: DGU Pairing (Colour outer pane waiting in Pairing buffer + Laminated Clear pane available at Lamination or post-Lamination Pairing)
  const waitingColourPanes = glassItemsDatabase.filter(
    (i) =>
      i.currentStage === "Pairing" &&
      i.status !== "Completed" &&
      i.status !== "Rejected" &&
      isDlguItem(i) &&
      i.colorOrClear === "Colour" &&
      !usedSerials.has(i.serialNumber)
  );

  if (waitingColourPanes.length > 0) {
    // Available Laminated Clear panes: currently at Lamination stage OR in Pairing stage with Lamination completed
    const availableLamPanes = glassItemsDatabase.filter(
      (i) =>
        (i.currentStage === "Lamination" || (i.currentStage === "Pairing" && i.completedStages.includes("Lamination"))) &&
        i.status !== "Completed" &&
        i.status !== "Rejected" &&
        isDlguItem(i) &&
        i.colorOrClear !== "Colour" &&
        !usedSerials.has(i.serialNumber)
    );

    waitingColourPanes.forEach((col) => {
      if (usedSerials.has(col.serialNumber)) return;

      const match = availableLamPanes.find(
        (lam) => !usedSerials.has(lam.serialNumber) && isDlguStickerPairMatch(col, lam)
      );

      if (match) {
        usedSerials.add(col.serialNumber);
        usedSerials.add(match.serialNumber);

        // If match has a lamPairId, find any sibling panes with the same lamPairId and advance them together
        const matchPairId = (match as any).lamPairId;
        const siblingPanes = matchPairId
          ? availableLamPanes.filter(
              (p) => (p as any).lamPairId === matchPairId && p.serialNumber !== match.serialNumber && !usedSerials.has(p.serialNumber)
            )
          : [];

        siblingPanes.forEach((sib) => {
          usedSerials.add(sib.serialNumber);
          sib.currentStage = "DGU";
          if (!sib.completedStages.includes("Lamination")) sib.completedStages.push("Lamination");
          if (!sib.completedStages.includes("Pairing")) sib.completedStages.push("Pairing");
          sib.dlguPhase = "DguPairing";
          sib.updatedAt = new Date().toISOString();
        });

        col.currentStage = "DGU";
        if (!col.completedStages.includes("Pairing")) col.completedStages.push("Pairing");
        col.dlguPhase = "DguPairing";
        col.updatedAt = new Date().toISOString();

        match.currentStage = "DGU";
        if (!match.completedStages.includes("Lamination")) match.completedStages.push("Lamination");
        if (!match.completedStages.includes("Pairing")) match.completedStages.push("Pairing");
        match.dlguPhase = "DguPairing";
        match.updatedAt = new Date().toISOString();

        productionHistoryDatabase.unshift({
          id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          serialNumber: col.serialNumber,
          barcode: col.barcode,
          piNumber: col.piNumber,
          stage: "Pairing",
          status: "Completed",
          operator: "Auto-Pairing Engine",
          timestamp: new Date().toISOString(),
          remarks: `[DLGU Phase 2] Auto-paired with Laminated Clear Pane ${match.serialNumber} (${match.barcode}) and advanced to DGU Assembly Line`,
        });

        productionHistoryDatabase.unshift({
          id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          serialNumber: match.serialNumber,
          barcode: match.barcode,
          piNumber: match.piNumber,
          stage: "Pairing",
          status: "Completed",
          operator: "Auto-Pairing Engine",
          timestamp: new Date().toISOString(),
          remarks: `[DLGU Phase 2] Auto-paired with Colour Pane ${col.serialNumber} (${col.barcode}) and advanced to DGU Assembly Line`,
        });

        advancedCount += 2 + siblingPanes.length;
        logger.info(`[DLGU Phase 2] Paired Colour ${col.serialNumber} + Laminated Clear ${match.serialNumber} -> Advanced to DGU!`);
      }
    });
  }

  if (advancedCount > 0) {
    saveDatabaseToDisk();
  }

  return advancedCount;
}

export const handlePairDlgu: RequestHandler = (req, res) => {
  const { posNo, piNumber } = req.body || {};
  const advancedCount = autoAdvancePairedDlguItems(posNo, piNumber);
  if (advancedCount > 0) {
    broadcastUpdate("stage_advanced", { count: advancedCount });
    res.json({
      success: true,
      message: `Successfully paired ${advancedCount / 2} DLGU set(s) (${advancedCount} panes)!`,
      pairedSets: advancedCount / 2,
      advancedPanes: advancedCount,
    });
  } else {
    res.json({
      success: false,
      message: "No ready matching DLGU lites found in Pairing Buffer to pair.",
      pairedSets: 0,
      advancedPanes: 0,
    });
  }
};

/**
 * Advances all DLGU items that have completed Lamination into Phase 2 (DGU Pairing),
 * then immediately triggers the Phase 2 auto-pairing engine.
 * Call this when the Lamination workstation "Sends All" DLGU items.
 */
export const handleAdvanceDlguLamination: RequestHandler = (req, res) => {
  const lamItems = glassItemsDatabase.filter(
    (i) => i.currentStage === "Lamination" && (i as any).glassCategory === "DLGU"
  );

  let movedCount = 0;
  lamItems.forEach((item) => {
    if (!item.completedStages.includes("Lamination")) item.completedStages.push("Lamination");
    item.currentStage = "Pairing";
    item.dlguPhase = "DguPairing";
    item.updatedAt = new Date().toISOString();
    movedCount++;
  });

  if (movedCount === 0) {
    return res.json({ success: false, message: "No DLGU items found in Lamination stage.", movedCount: 0, pairedSets: 0 });
  }

  // Trigger Phase 2 pairing (Laminated + 8MM SN Grey → DGU)
  const pairedCount = autoAdvancePairedDlguItems();
  saveDatabaseToDisk();
  broadcastUpdate("stage_advanced", { count: movedCount + pairedCount });

  res.json({
    success: true,
    message: `Moved ${movedCount} items from Lamination to Phase 2 Pairing. Paired ${pairedCount / 2} DGU sets.`,
    movedCount,
    pairedSets: pairedCount / 2,
    advancedPanes: pairedCount,
  });
};

// Reject item with reason
export const handleRejectItem: RequestHandler = (req, res) => {
  const { serialNumber, piNumber, reason, operator = "Operator" } = req.body;
  const cleanReason = sanitizeString(reason, 500);
  const cleanOperator = sanitizeString(operator || "Operator", 100);

  if (!serialNumber || !cleanReason) {
    res.status(400).json({ message: "serialNumber and reason are required" });
    return;
  }

  const item = glassItemsDatabase.find((g) => g.serialNumber === serialNumber || g.barcode === serialNumber);
  if (!item) {
    res.status(404).json({ message: "Glass item not found" });
    return;
  }

  item.status = "Rejected";
  item.updatedAt = new Date().toISOString();

  const finalPiNumber = sanitizeString(piNumber || item.piNumber, 100);

  const rejectEntry: RejectRecord = {
    id: `rej-${Date.now()}`,
    serialNumber: item.serialNumber,
    barcode: item.barcode,
    piNumber: finalPiNumber,
    stage: item.currentStage,
    reason: cleanReason,
    date: new Date().toISOString(),
    operator: cleanOperator,
  };

  rejectDatabase.unshift(rejectEntry);

  productionHistoryDatabase.unshift({
    id: `hist-${Date.now()}`,
    serialNumber: item.serialNumber,
    barcode: item.barcode,
    piNumber: finalPiNumber,
    itemOrBatch: item.serialNumber,
    action: "Item Rejected",
    prevStatus: item.currentStage,
    newStatus: "Rejected",
    stage: item.currentStage,
    status: "Rejected",
    operator: cleanOperator,
    user: cleanOperator,
    timestamp: new Date().toISOString(),
    remarks: `Quality rejection at ${item.currentStage}: ${cleanReason}`,
  });

  saveDatabaseToDisk();
  broadcastUpdate("item_rejected", { serialNumber: item.serialNumber });

  res.json({ message: "Item marked as rejected", rejectEntry, item });
};

// Send item to rework
export const handleReworkItem: RequestHandler = (req, res) => {
  const { serialNumber, piNumber, targetStage, reason, operator = "Operator" } = req.body;
  const cleanReason = sanitizeString(reason, 500);
  const cleanOperator = sanitizeString(operator || "Operator", 100);

  if (!serialNumber || !targetStage || !cleanReason) {
    res.status(400).json({ message: "serialNumber, targetStage, and reason are required" });
    return;
  }

  const item = glassItemsDatabase.find((g) => g.serialNumber === serialNumber || g.barcode === serialNumber);
  if (!item) {
    res.status(404).json({ message: "Glass item not found" });
    return;
  }

  const prevStage = item.currentStage;
  if (!item.completedStages.includes(prevStage)) {
    item.completedStages.push(prevStage);
  }
  item.currentStage = targetStage as ProductionStage;
  item.status = "Reworking";
  item.updatedAt = new Date().toISOString();

  const finalPiNumber = sanitizeString(piNumber || item.piNumber, 100);

  const reworkEntry: ReworkRecord = {
    id: `rew-${Date.now()}`,
    serialNumber: item.serialNumber,
    barcode: item.barcode,
    piNumber: finalPiNumber,
    fromStage: prevStage,
    targetStage: targetStage as ProductionStage,
    reason: cleanReason,
    date: new Date().toISOString(),
    operator: cleanOperator,
  };

  reworkDatabase.unshift(reworkEntry);

  productionHistoryDatabase.unshift({
    id: `hist-${Date.now()}`,
    serialNumber: item.serialNumber,
    barcode: item.barcode,
    piNumber: finalPiNumber,
    itemOrBatch: item.serialNumber,
    action: `Item Sent to Rework (${targetStage})`,
    prevStatus: prevStage,
    newStatus: "Reworking",
    stage: targetStage,
    status: "Reworking",
    operator: cleanOperator,
    user: cleanOperator,
    timestamp: new Date().toISOString(),
    remarks: `Rework routed from ${prevStage} to ${targetStage}: ${cleanReason}`,
  });

  saveDatabaseToDisk();
  broadcastUpdate("item_reworked", { serialNumber: item.serialNumber });

  res.json({ message: "Item sent to rework", reworkEntry, item });
};

// Excel Upload API Endpoint
export const handleExcelUpload: RequestHandler = (req, res) => {
  const {
    customerName,
    projectName,
    jobOrderNumber,
    glassDescription,
    sfoNo,
    sfoDate,
    deliveryDate,
    proformaInvNo,
    soNoDate,
    refContact,
    dispatchType,
    invoiceTo,
    dispatchTo,
    obNo,
    batchNo,
    purchaseOrderNo,
    items,
  } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ message: "Items array is required" });
    return;
  }

  // Determine unique PI Number
  const basePiNo =
    proformaInvNo && String(proformaInvNo).trim()
      ? String(proformaInvNo).trim()
      : `PI-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(piDatabase.length + 1).padStart(3, "0")}`;

  let finalPiNumber = basePiNo;
  let counter = 1;
  while (piDatabase.some((p) => p.piNumber.toLowerCase() === finalPiNumber.toLowerCase())) {
    finalPiNumber = `${basePiNo}-${String(counter).padStart(2, "0")}`;
    counter++;
  }

  const piId = `pi-${Date.now()}`;

  let totalSqm = 0;
  let totalQty = 0;

  const newItems: GlassItem[] = items.map((raw: any, idx: number) => {
    const width = parseFloat(raw.width) || 1000;
    const height = parseFloat(raw.height) || 1000;
    const qty = parseInt(raw.quantity || raw.qty, 10) || 1;
    const sqm = parseFloat(raw.sqm) || parseFloat(((width * height * qty) / 1000000).toFixed(2));

    totalSqm += sqm;
    totalQty += qty;

    const serialNumber = raw.serialNumber || `S${String(glassItemsDatabase.length + idx + 1).padStart(3, "0")}`;
    const barcode = raw.barcode || `10126270${Date.now().toString().slice(-4)}${String(idx + 1).padStart(4, "0")}`;

    // Determine process route from description
    const descLower = String(glassDescription || raw.glassType || "").toLowerCase();
    const isLaminated = descLower.includes("lam") || descLower.includes("lamination") || descLower.includes("lgu") || descLower.includes("pvb") || descLower.includes("sgp");
    const isDGU = descLower.includes("dgu") || descLower.includes("igu") || descLower.includes("double");

    let route: ProductionStage[] = ["Cutting"];
    if (isLaminated) {
      route.push("Pairing");
      route.push("Lamination");
    }
    if (isDGU) {
      if (!isLaminated) route.push("Pairing");
      route.push("DGU");
    }
    route.push("Finished");

    const genOrderNo = jobOrderNumber || `P-${1525 + piDatabase.length + 1}`;
    const genSfoNo = sfoNo || genOrderNo || `SFO/SG/26270${String(piDatabase.length + 1).padStart(4, "0")}`;
    const genObNo = obNo || `OB/SG/26270${String(piDatabase.length + 1).padStart(4, "0")}`;
    const genSoNoDate = soNoDate || `SO22-${10900 + piDatabase.length + 1} / ${sfoDate || new Date().toISOString().slice(0, 10)}`;
    const genBatchNo = batchNo || `${1460 + (piDatabase.length % 10) + 1}`;

    return {
      id: `item-${Date.now()}-${idx}`,
      piId,
      piNumber: finalPiNumber,
      serialNumber,
      barcode,
      qrId: `QR-${barcode}`,
      orderNo: raw.orderNo || genOrderNo,
      obNo: raw.obNo || genObNo,
      sfoNo: raw.sfoNo || genSfoNo,
      batchNo: raw.batchNo || genBatchNo,
      posNo: raw.posNo || String(idx + 1),
      srNo: raw.srNo || (idx + 1),
      itemCode: raw.itemCode || raw.glassCode || `GL-${String(idx + 1).padStart(2, "0")}`,
      glassCode: raw.glassCode || raw.itemCode || "",
      glassType: raw.glassType || glassDescription || "6MM CLEAR TEMPERED",
      width,
      height,
      thickness: raw.thickness || "",
      qty,
      sqm,
      taper: raw.taper || "",
      holesCutout: raw.holesCutout || "",
      shape: raw.shape || "",
      layer: raw.layer || "",
      sectionName: raw.sectionName || "",
      category: raw.category || "",
      delLocation: raw.delLocation || "FACTORY",
      sketch: raw.sketch || "SKETCH-01",
      remarks: raw.remarks || "",
      processRoute: route,
      currentStage: "Cutting",
      status: "Pending",
      completedStages: [],
      updatedAt: new Date().toISOString(),
    };
  });

  const genOrderNo = jobOrderNumber || `P-${1525 + piDatabase.length + 1}`;
  const genSfoNo = sfoNo || genOrderNo || `SFO/SG/26270${String(piDatabase.length + 1).padStart(4, "0")}`;
  const genObNo = obNo || `OB/SG/26270${String(piDatabase.length + 1).padStart(4, "0")}`;
  const genSoNoDate = soNoDate || `SO22-${10900 + piDatabase.length + 1} / ${sfoDate || new Date().toISOString().slice(0, 10)}`;

  const newPI: PIMaster = {
    id: piId,
    piNumber: finalPiNumber,
    customerName: customerName || "",
    jobOrderNumber: genOrderNo,
    projectName: projectName || "",
    issueDate: sfoDate || new Date().toISOString().slice(0, 10),
    sfoNo: genSfoNo,
    sfoDate: sfoDate || new Date().toISOString().slice(0, 10),
    deliveryDate: deliveryDate || "",
    proformaInvNo: finalPiNumber,
    soNoDate: genSoNoDate,
    refContact: refContact || "",
    dispatchType: dispatchType || "",
    invoiceTo: invoiceTo || customerName || "",
    dispatchTo: dispatchTo || customerName || "",
    obNo: genObNo,
    purchaseOrderNo: purchaseOrderNo || "",
    version: "1.00",
    totalQty,
    totalSqm: parseFloat(totalSqm.toFixed(2)),
    glassDescription: glassDescription || "",
    status: "Pending",
    itemsCount: newItems.length,
    completedItemsCount: 0,
    createdAt: new Date().toISOString(),
  };

  piDatabase.unshift(newPI);
  glassItemsDatabase.unshift(...newItems);

  productionHistoryDatabase.unshift({
    id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    serialNumber: `BATCH-${newPI.piNumber}`,
    piNumber: newPI.piNumber,
    itemOrBatch: `Batch ${newPI.piNumber}`,
    action: "Batch Uploaded (Excel)",
    prevStatus: "New File",
    newStatus: "Pending",
    stage: "Cutting",
    status: "Completed",
    operator: "Admin / Operator",
    user: "Admin / Operator",
    timestamp: new Date().toISOString(),
    remarks: `Uploaded ${newItems.length} glass items (${newPI.totalSqm} SQM) for ${newPI.customerName || "Customer"}`,
  });

  saveDatabaseToDisk();
  broadcastUpdate("excel_uploaded", { piNumber: newPI.piNumber });

  res.json({ message: "Excel uploaded and PI generated successfully", pi: newPI, items: newItems });
};

// Check if a PDF file or Sticker Batch has already been uploaded (1 PDF cannot be uploaded 2 times)
export const handleCheckStickerDuplicates: RequestHandler = (req, res) => {
  const { fileName, sfoNo, batchNo, batchTitle, barcodes = [] } = req.body;

  const normalizedFileName = String(fileName || "").trim().toLowerCase();
  const normalizedBatchId = String(
    batchTitle ? batchTitle.replace(/^STK-/i, "") : sfoNo ? `${sfoNo}-B${batchNo || "1"}` : ""
  ).trim().toLowerCase();

  // 1. Check if the PDF file name or Batch ID matches an existing batch in piDatabase
  let matchedBatch = piDatabase.find((p) => {
    if (normalizedFileName && p.fileName && p.fileName.trim().toLowerCase() === normalizedFileName) {
      return true;
    }
    if (normalizedBatchId && p.piNumber && p.piNumber.trim().toLowerCase() === normalizedBatchId) {
      return true;
    }
    if (sfoNo && batchNo && p.sfoNo === sfoNo && (p.piNumber.includes(batchNo) || p.soNoDate?.includes(batchNo))) {
      return true;
    }
    return false;
  });

  // 2. Check if the barcodes belong to an already uploaded batch in glassItemsDatabase
  if (!matchedBatch && Array.isArray(barcodes) && barcodes.length > 0) {
    const candidateSet = new Set(barcodes.map((b: any) => String(b).trim().toLowerCase()).filter(Boolean));
    const existingItem = glassItemsDatabase.find((g) => g.barcode && candidateSet.has(g.barcode.trim().toLowerCase()));
    if (existingItem) {
      matchedBatch = piDatabase.find((p) => p.id === existingItem.piId || p.piNumber === existingItem.piNumber);
    }
  }

  if (matchedBatch) {
    res.json({
      isPdfDuplicate: true,
      existingBatch: {
        piNumber: matchedBatch.piNumber,
        fileName: matchedBatch.fileName || `${matchedBatch.piNumber}.pdf`,
        customerName: matchedBatch.customerName,
        createdAt: matchedBatch.createdAt,
        itemsCount: matchedBatch.itemsCount,
      },
      message: `This PDF / Batch "${matchedBatch.fileName || matchedBatch.piNumber}" has already been uploaded into production. 1 PDF cannot be uploaded 2 times.`,
    });
    return;
  }

  res.json({
    isPdfDuplicate: false,
    existingBatch: null,
    message: "PDF is ready to upload.",
  });
};

// Sticker PDF Upload API Endpoint (No PI Generation)
export const handleStickerUpload: RequestHandler = (req, res) => {
  const {
    customerName,
    projectName,
    sfoNo,
    obNo,
    batchNo,
    deliveryDate,
    optDate,
    batchTitle,
    fileName,
    items,
    colorOrClear,
    glassColor,
    glassCategory,
  } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ message: "Items array is required" });
    return;
  }

  const batchIdentifier = (batchTitle ? batchTitle.replace(/^STK-/i, "").replace(/^B(?=\d)/i, "") : (batchNo ? String(batchNo) : `BATCH-${Date.now()}`));
  const normalizedBatchId = batchIdentifier.trim().toLowerCase();
  const normalizedFileName = String(fileName || "").trim().toLowerCase();

  // Strict PDF Duplicate Check: 1 PDF cannot be uploaded 2 times
  const existingBatch = piDatabase.find((p) => {
    if (normalizedFileName && p.fileName && p.fileName.trim().toLowerCase() === normalizedFileName) {
      return true;
    }
    if (p.piNumber && p.piNumber.trim().toLowerCase() === normalizedBatchId) {
      return true;
    }
    return false;
  });

  if (existingBatch) {
    res.status(409).json({
      error: "PDF Batch Already Uploaded",
      message: `Cannot upload: PDF "${existingBatch.fileName || existingBatch.piNumber}" has already been uploaded previously into production. 1 PDF cannot be uploaded 2 times.`,
      existingBatch: {
        piNumber: existingBatch.piNumber,
        fileName: existingBatch.fileName,
        createdAt: existingBatch.createdAt,
        itemsCount: existingBatch.itemsCount,
      },
    });
    return;
  }

  const batchId = `batch-${Date.now()}`;

  let totalSqm = 0;
  let totalQty = 0;

  // In one PDF, it is strictly 100% full Colour or 100% Clear (never Mixed)
  let isColourBatch = false;
  if (colorOrClear === "Colour" || colorOrClear === "Color") {
    isColourBatch = true;
  } else if (colorOrClear === "Clear") {
    isColourBatch = false;
  } else if (glassColor && /colour|color|tint|grey|gray|bronze|blue|green|stopray|syp/i.test(glassColor) && !/clear/i.test(glassColor)) {
    isColourBatch = true;
  } else {
    // Determine from items' explicit colorOrClear property or glassColor
    const clearItemCount = items.filter((raw: any) => raw.colorOrClear === "Clear" || /clear/i.test(raw.glassColor || "")).length;
    const colourItemCount = items.filter((raw: any) => raw.colorOrClear === "Colour" || raw.colorOrClear === "Color" || (/colour|color|tint|grey|gray|bronze|blue|green|stopray|syp/i.test(raw.glassColor || "") && !/clear/i.test(raw.glassColor || ""))).length;
    isColourBatch = colourItemCount > clearItemCount;
  }

  const defaultColorOrClear: "Clear" | "Colour" = isColourBatch ? "Colour" : "Clear";
  const defaultGlassColor = defaultColorOrClear === "Colour" ? (glassColor || "Coloured Glass") : "Clear Glass";
  // Auto-detect Lamination vs DGU if not explicitly provided or if items/fileName clearly indicate Lamination
  const itemsText = (
    String(fileName || "") +
    " " +
    items.map((raw: any) => `${raw.glassType || ""} ${raw.glassCode || ""} ${raw.category || ""} ${raw.remarks || ""} ${raw.makeup || ""}`).join(" ")
  ).toLowerCase();
  const hasInterlayerKeyword = itemsText.includes("pvb") || itemsText.includes("sgp") || itemsText.includes("eva") || itemsText.includes("lamination") || itemsText.includes("laminated") || itemsText.includes("lam");
  const hasSpacerKeyword = itemsText.includes("spacer") || itemsText.includes("dgu") || itemsText.includes("igu");

  let defaultGlassCategory: "DGU" | "Lamination" | "DLGU" = "DGU";
  if (glassCategory === "DLGU") {
    defaultGlassCategory = "DLGU";
  } else if (glassCategory === "Lamination") {
    defaultGlassCategory = "Lamination";
  } else if (glassCategory === "DGU") {
    defaultGlassCategory = "DGU";
  } else if (hasInterlayerKeyword && hasSpacerKeyword) {
    defaultGlassCategory = "DLGU";
  } else if (hasInterlayerKeyword && !hasSpacerKeyword) {
    defaultGlassCategory = "Lamination";
  } else if (hasSpacerKeyword) {
    defaultGlassCategory = "DGU";
  } else if (hasInterlayerKeyword) {
    defaultGlassCategory = "Lamination";
  }

  const newItems: GlassItem[] = items.map((raw: any, idx: number) => {
    const width = parseFloat(raw.width) || 1000;
    const height = parseFloat(raw.height) || 1000;
    const qty = parseInt(raw.qty || raw.quantity, 10) || 1;
    const sqm = parseFloat(raw.sqm) || parseFloat(((width * height * qty) / 1000000).toFixed(2));

    totalSqm += sqm;
    totalQty += qty;

    const serialNumber = `S${String(glassItemsDatabase.length + idx + 1).padStart(3, "0")}`;
    const cleanSfo = String(raw.sfoNo || sfoNo || "1344").replace(/[^0-9]/g, "");
    const sfoPad = (cleanSfo || "1344").padStart(5, "0").slice(-5);
    const seqPad = String(raw.posNo || idx + 1).replace(/[^0-9]/g, "").padStart(4, "0").slice(-4);
    const fallbackBarcode = `10126270${sfoPad}${seqPad}`;
    const barcode = raw.barcode || fallbackBarcode;

    const itemGlassCategory: "DGU" | "Lamination" | "DLGU" =
      raw.glassCategory === "DLGU" || raw.glassCategory === "Lamination" || raw.glassCategory === "DGU"
        ? raw.glassCategory
        : defaultGlassCategory;
    const isDlgu = itemGlassCategory === "DLGU";
    const isLaminated = !isDlgu && itemGlassCategory === "Lamination";

    // Uniformly Colour or Clear across the entire PDF
    const itemColorOrClear: "Clear" | "Colour" = defaultColorOrClear;
    const itemGlassColor: string = defaultGlassColor;

    let route: ProductionStage[];
    let dlguPhase: "LamPairing" | "DguPairing" | undefined = undefined;

    if (isDlgu) {
      const rawText = `${raw.glassType || ""} ${raw.glassCode || ""}`.toLowerCase();
      const isLamPane = itemColorOrClear === "Clear" || /lam|laminated|6mm clear/i.test(rawText);
      if (isLamPane) {
        route = ["Cutting", "Pairing", "Lamination", "Pairing", "DGU", "Finished"];
        dlguPhase = "LamPairing";
      } else {
        route = ["Cutting", "Pairing", "DGU", "Finished"];
        dlguPhase = "DguPairing";
      }
    } else if (isLaminated) {
      route = ["Cutting", "Pairing", "Lamination", "Finished"];
    } else {
      route = ["Cutting", "Pairing", "DGU", "Finished"];
    }

    return {
      id: `item-${Date.now()}-${idx}`,
      piId: batchId,
      piNumber: batchIdentifier,
      serialNumber,
      barcode,
      qrId: `QR-${barcode}`,
      orderNo: raw.orderNo || "2045",
      obNo: raw.obNo || obNo || "3705",
      sfoNo: raw.sfoNo || sfoNo || "201765",
      batchNo: raw.batchNo || batchNo || "5442",
      posNo: raw.posNo || String(idx + 1),
      srNo: idx + 1,
      itemCode: raw.glassCode || `GL-${String(idx + 1).padStart(2, "0")}`,
      glassCode: raw.glassCode || "",
      glassType: raw.glassType || (itemColorOrClear === "Colour" ? `6MM ${itemGlassColor.toUpperCase()} TEMPERED` : "6MM CLEAR TEMPERED"),
      width,
      height,
      thickness: "",
      qty,
      lineQty: parseInt(raw.lineQty, 10) || qty,
      rackNo: String(raw.rackNo || "1"),
      sqm,
      taper: "",
      holesCutout: "",
      shape: "",
      layer: "",
      sectionName: "",
      category: raw.category || (itemColorOrClear === "Colour" ? `Coloured Glass (${itemGlassColor})` : "Clear Glass"),
      glassCategory: itemGlassCategory,
      dlguPhase,
      colorOrClear: itemColorOrClear,
      glassColor: itemGlassColor,
      delLocation: "FACTORY",
      sketch: "SKETCH-01",
      remarks: `Sticker #${raw.stickerNo || idx + 1}`,
      processRoute: route,
      currentStage: "Cutting",
      status: "Pending",
      completedStages: [],
      updatedAt: new Date().toISOString(),
    };
  });

  const batchRecord: PIMaster = {
    id: batchId,
    piNumber: batchIdentifier,
    fileName: fileName || `${batchIdentifier}.pdf`,
    customerName: customerName || "BRIGHT PLUS FITOUT",
    jobOrderNumber: sfoNo || "201765",
    projectName: projectName || "PROJECT; VAL_BY_KAS",
    issueDate: optDate || new Date().toISOString().slice(0, 10),
    sfoNo: sfoNo || "201765",
    sfoDate: optDate || new Date().toISOString().slice(0, 10),
    deliveryDate: deliveryDate || "18/08/2026",
    proformaInvNo: batchIdentifier,
    soNoDate: `Batch #${batchNo || "5442"} / ${optDate || new Date().toISOString().slice(0, 10)}`,
    refContact: "",
    dispatchType: "FACTORY",
    invoiceTo: customerName || "BRIGHT PLUS FITOUT",
    dispatchTo: customerName || "BRIGHT PLUS FITOUT",
    obNo: obNo || "3705",
    purchaseOrderNo: "",
    version: "1.00",
    totalQty: totalQty || newItems.reduce((a, b) => a + (b.qty || 1), 0),
    totalSqm: parseFloat(totalSqm.toFixed(2)),
    glassDescription: newItems[0]?.glassType || (defaultColorOrClear === "Colour" ? "Coloured Glass" : "6MM CLEAR TEMPERED"),
    glassCategory: defaultGlassCategory,
    colorOrClear: defaultColorOrClear,
    glassColor: defaultGlassColor,
    status: "In Production",
    itemsCount: totalQty || newItems.reduce((a, b) => a + (b.qty || 1), 0) || newItems.length,
    completedItemsCount: 0,
    createdAt: new Date().toISOString(),
  };

  const totalStickerCount = totalQty || newItems.reduce((a, b) => a + (b.qty || 1), 0) || newItems.length;

  piDatabase.unshift(batchRecord);
  glassItemsDatabase.unshift(...newItems);

  productionHistoryDatabase.unshift({
    id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    serialNumber: `BATCH-${batchRecord.piNumber}`,
    piNumber: batchRecord.piNumber,
    itemOrBatch: `Batch ${batchRecord.piNumber}`,
    action: "Batch Uploaded (Sticker PDF)",
    prevStatus: "New File",
    newStatus: "In Production",
    stage: "Cutting",
    status: "Completed",
    operator: "Operator",
    user: "Operator",
    timestamp: new Date().toISOString(),
    remarks: `Uploaded ${totalStickerCount} glass units (${batchRecord.totalSqm} SQM) from ${fileName || batchIdentifier}`,
  });

  saveDatabaseToDisk();
  broadcastUpdate("sticker_batch_uploaded", { batchIdentifier, totalItems: newItems.length });

  res.json({
    message: "Sticker batch uploaded and items imported successfully",
    batch: batchRecord,
    batchNo,
    sfoNo,
    batchIdentifier,
    totalSqm: parseFloat(totalSqm.toFixed(2)),
    totalItems: totalStickerCount,
    totalStickers: totalStickerCount,
    items: newItems,
  });
};

// Dashboard Stats API
export const handleGetDashboardStats: RequestHandler = (_req, res) => {
  const totalPI = piDatabase.length;
  const pendingPI = piDatabase.filter((p) => p.status === "Pending" || p.status === "In Production").length;
  const completedPI = piDatabase.filter((p) => p.status === "Completed").length;

  const pendingCutting = glassItemsDatabase
    .filter((i) => (i.currentStage === "Cutting" || (!i.currentStage && i.status !== "Rejected")) && i.status !== "Completed" && i.status !== "Rejected")
    .reduce((a, b) => a + (b.qty || 1), 0);
  const pendingLaminationPanes = glassItemsDatabase
    .filter((i) => i.currentStage === "Lamination" && i.status !== "Completed" && i.status !== "Rejected")
    .reduce((a, b) => a + (b.qty || 1), 0);
  const pendingLamination = Math.ceil(pendingLaminationPanes / 2);

  // DGU Stage: Count DGU units (paired 1 Colour + 1 Clear pane = 1 DGU Unit)
  const dguItems = glassItemsDatabase.filter((i) => i.currentStage === "DGU" && i.status !== "Completed" && i.status !== "Rejected");
  const isColour = (i: any) => {
    const typeStr = String(i.glassType || "").toLowerCase();
    const colorStr = String(i.glassColor || "").toLowerCase();
    const catStr = String(i.category || "").toLowerCase();

    const hasColourKeyword =
      typeStr.includes("grey") ||
      typeStr.includes("gray") ||
      typeStr.includes("bronze") ||
      typeStr.includes("blue") ||
      typeStr.includes("green") ||
      typeStr.includes("stopray") ||
      typeStr.includes("sunguard") ||
      typeStr.includes("sn grey") ||
      typeStr.includes("syp") ||
      typeStr.includes("tint") ||
      typeStr.includes("coated") ||
      colorStr.includes("colour") ||
      colorStr.includes("color") ||
      colorStr.includes("grey") ||
      colorStr.includes("bronze") ||
      colorStr.includes("blue") ||
      colorStr.includes("green") ||
      catStr.includes("colour") ||
      catStr.includes("color");

    if (typeStr.includes("clear") && !hasColourKeyword) return false;
    if (hasColourKeyword) return true;
    if (i.colorOrClear === "Colour" || i.colorOrClear === "Color") return true;
    if (i.colorOrClear === "Clear") return false;
    return false;
  };
  const dguColourPanes = dguItems.filter(isColour).reduce((a, b) => a + (b.qty || 1), 0);
  const dguTotal = dguItems.reduce((a, b) => a + (b.qty || 1), 0);
  const dguClearPanes = dguTotal - dguColourPanes;
  const dguReadyPairs = Math.min(dguColourPanes, dguClearPanes);
  const pendingDGU = dguColourPanes > 0 ? dguColourPanes : dguReadyPairs;

  const pendingPairing = glassItemsDatabase
    .filter((i) => i.currentStage === "Pairing" && i.status !== "Completed" && i.status !== "Rejected")
    .reduce((a, b) => a + (b.qty || 1), 0);

  // Finished Items: Count finished assembled DGU units + Laminated units + General units
  const finishedList = glassItemsDatabase.filter((i) => i.currentStage === "Finished" || i.status === "Completed");
  const isDgu = (i: any) => {
    const descLower = `${i.glassType || ""} ${i.glassCode || ""}`.toLowerCase();
    return (Array.isArray(i.processRoute) && i.processRoute.includes("DGU")) || descLower.includes("dgu") || descLower.includes("igu") || descLower.includes("double") || descLower.includes("spacer");
  };
  const finishedDguList = finishedList.filter(isDgu);
  const finishedNonDguList = finishedList.filter((i) => !isDgu(i));
  const finishedDguColour = finishedDguList.filter(isColour).reduce((a, b) => a + (b.qty || 1), 0);
  const finishedDguTotal = finishedDguList.reduce((a, b) => a + (b.qty || 1), 0);
  const finishedDguUnits = finishedDguColour > 0 ? finishedDguColour : Math.ceil(finishedDguTotal / 2);

  const isLam = (i: any) => i.glassCategory === "Lamination" || (Array.isArray(i.processRoute) && i.processRoute.includes("Lamination"));
  const finishedLamList = finishedNonDguList.filter(isLam);
  const finishedMonolithicList = finishedNonDguList.filter((i) => !isLam(i));
  const finishedLamUnits = Math.ceil(finishedLamList.reduce((a, b) => a + (b.qty || 1), 0) / 2);
  const finishedMonolithicUnits = finishedMonolithicList.reduce((a, b) => a + (b.qty || 1), 0);
  const finishedItems = finishedDguUnits + finishedLamUnits + finishedMonolithicUnits;

  const rejectItems = rejectDatabase.length;
  const reworkItems = reworkDatabase.length;

  const stats: DashboardStats = {
    totalPI,
    pendingPI,
    completedPI,
    pendingCutting,
    pendingPairing,
    pendingLamination,
    pendingDGU,
    finishedItems,
    rejectItems,
    reworkItems,
  };

  res.json(stats);
};

// Real-Time System Notifications API (Generated dynamically from real database records)
export const handleGetNotifications: RequestHandler = (_req, res) => {
  const notifications: Array<{
    id: string;
    title: string;
    message: string;
    timestamp: string;
    type: "info" | "success" | "warning" | "destructive";
    read: boolean;
  }> = [];

  // 1. Stage Advancement Events
  const recentHistory = [...productionHistoryDatabase].reverse().slice(0, 8);
  recentHistory.forEach((h, idx) => {
    notifications.push({
      id: `notif-hist-${h.id || idx}`,
      title: `${h.stage} Stage Advanced`,
      message: `Item ${h.serialNumber} completed ${h.stage} stage by ${h.operator || "Operator"}.`,
      timestamp: h.timestamp ? new Date(h.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Recently",
      type: "success",
      read: false,
    });
  });

  // 2. Reject Events
  const recentRejects = [...rejectDatabase].reverse().slice(0, 5);
  recentRejects.forEach((r, idx) => {
    notifications.push({
      id: `notif-rej-${r.id || idx}`,
      title: `Item Rejected at ${r.stage}`,
      message: `Item ${r.serialNumber} flagged: ${r.reason}`,
      timestamp: r.date ? new Date(r.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Recently",
      type: "destructive",
      read: false,
    });
  });

  // 3. Rework Events
  const recentReworks = [...reworkDatabase].reverse().slice(0, 5);
  recentReworks.forEach((rw, idx) => {
    notifications.push({
      id: `notif-rw-${rw.id || idx}`,
      title: `Rework Order Created`,
      message: `Item ${rw.serialNumber} routed back to ${rw.targetStage}: ${rw.reason}`,
      timestamp: rw.date ? new Date(rw.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Recently",
      type: "warning",
      read: false,
    });
  });

  // 4. PI Registration Events
  const recentPIs = [...piDatabase].reverse().slice(0, 5);
  recentPIs.forEach((p, idx) => {
    notifications.push({
      id: `notif-pi-${p.id || idx}`,
      title: `PI ${p.piNumber} Active`,
      message: `${p.customerName} - ${p.itemsCount} items (${p.totalSqm?.toFixed(1) || 0} m²) registered`,
      timestamp: p.createdAt ? new Date(p.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Recently",
      type: "info",
      read: false,
    });
  });

  if (notifications.length === 0) {
    notifications.push({
      id: "notif-sys-0",
      title: "System Operational",
      message: `Live database sync active with ${glassItemsDatabase.length} glass items.`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      type: "info",
      read: false,
    });
  }

  res.json(notifications.slice(0, 15));
};

// Reports API
export const handleGetReports: RequestHandler = (req, res) => {
  const page = parseInt(req.query.page as string, 10);
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);

  // If no page param, return all (backward compatible)
  if (isNaN(page) || page < 1) {
    res.json({
      pis: piDatabase,
      items: glassItemsDatabase,
      history: productionHistoryDatabase,
      rejects: rejectDatabase,
      reworks: reworkDatabase,
    });
    return;
  }

  const paginate = <T>(arr: T[]) => {
    const total = arr.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    return {
      data: arr.slice(start, start + limit),
      pagination: { page, limit, total, totalPages },
    };
  };

  res.json({
    pis: paginate(piDatabase),
    items: paginate(glassItemsDatabase),
    history: paginate(productionHistoryDatabase),
    rejects: paginate(rejectDatabase),
    reworks: paginate(reworkDatabase),
  });
};

// Clear Database API
export const handleClearDatabase: RequestHandler = (_req, res) => {
  piDatabase.length = 0;
  glassItemsDatabase.length = 0;
  productionHistoryDatabase.length = 0;
  rejectDatabase.length = 0;
  reworkDatabase.length = 0;

  saveDatabaseToDisk();
  broadcastUpdate("database_cleared");

  res.json({ message: "Database cleared successfully" });
};

// Data Retention Cleanup Logic (Feature 41)
export function cleanupOldAuditRecords(maxAgeDays = 90, maxRecordsPerTable = 1000): {
  historyRemoved: number;
  rejectsRemoved: number;
  reworksRemoved: number;
} {
  const cutoffTime = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

  // 1. Clean history
  const initialHistoryLen = productionHistoryDatabase.length;
  for (let i = productionHistoryDatabase.length - 1; i >= 0; i--) {
    const record = productionHistoryDatabase[i];
    const recTime = new Date(record.timestamp).getTime();
    if (!isNaN(recTime) && recTime < cutoffTime) {
      productionHistoryDatabase.splice(i, 1);
    }
  }
  if (productionHistoryDatabase.length > maxRecordsPerTable) {
    productionHistoryDatabase.splice(maxRecordsPerTable);
  }
  const historyRemoved = initialHistoryLen - productionHistoryDatabase.length;

  // 2. Clean rejects
  const initialRejectsLen = rejectDatabase.length;
  for (let i = rejectDatabase.length - 1; i >= 0; i--) {
    const record = rejectDatabase[i];
    const recTime = new Date(record.date).getTime();
    if (!isNaN(recTime) && recTime < cutoffTime) {
      rejectDatabase.splice(i, 1);
    }
  }
  if (rejectDatabase.length > maxRecordsPerTable) {
    rejectDatabase.splice(maxRecordsPerTable);
  }
  const rejectsRemoved = initialRejectsLen - rejectDatabase.length;

  // 3. Clean reworks
  const initialReworksLen = reworkDatabase.length;
  for (let i = reworkDatabase.length - 1; i >= 0; i--) {
    const record = reworkDatabase[i];
    const recTime = new Date(record.date).getTime();
    if (!isNaN(recTime) && recTime < cutoffTime) {
      reworkDatabase.splice(i, 1);
    }
  }
  if (reworkDatabase.length > maxRecordsPerTable) {
    reworkDatabase.splice(maxRecordsPerTable);
  }
  const reworksRemoved = initialReworksLen - reworkDatabase.length;

  if (historyRemoved > 0 || rejectsRemoved > 0 || reworksRemoved > 0) {
    saveDatabaseToDisk();
    logger.info("Data Retention Cleanup", { historyRemoved, rejectsRemoved, reworksRemoved, maxAgeDays });
  }

  return { historyRemoved, rejectsRemoved, reworksRemoved };
}

// Data Retention Cleanup API Handler
export const handleCleanupDatabase: RequestHandler = (req, res) => {
  const { maxAgeDays = 90, maxRecords = 1000 } = req.body || {};
  const result = cleanupOldAuditRecords(Number(maxAgeDays) || 90, Number(maxRecords) || 1000);
  res.json({
    message: "Data retention cleanup completed successfully",
    ...result,
  });
};

// Schedule startup data retention cleanup
setTimeout(() => {
  try {
    cleanupOldAuditRecords(90, 1000);
  } catch (e) {
    logger.error("Startup cleanup failed", { error: String(e) });
  }
}, 1000);
