import { RequestHandler, Response } from "express";
import {
  GlassItem,
  PIMaster,
  ProductionHistory,
  RejectRecord,
  ReworkRecord,
  DashboardStats,
  ProductionStage,
  SystemNotification,
  BARCODE_PREFIX,
  KNOWN_BARCODE_PREFIXES,
  formatGenericBarcode,
  formatSejalBarcode,
  COLOURED_COATED_GLASS_REGEX,
  isGlassTypeColour,
  isBatchUploadHistory,
} from "../../shared/api";
import { piDatabase, glassItemsDatabase, productionHistoryDatabase, rejectDatabase, reworkDatabase, notificationsDatabase, createAndBroadcastNotification, saveDatabaseToDisk, loadDatabaseFromDisk } from "./pi";
import { logger } from "../lib/logger";
import { verifyToken } from "../lib/auth";
import { findUserByUsernameOrEmail, getAllUserRecords } from "../lib/users";

const sseClients: Response[] = [];

export const handleEventsStream: RequestHandler = (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  // Send initial connected packet so proxies and browsers establish the stream immediately
  res.write(": connected\n\n");
  sseClients.push(res);

  // Send a lightweight comment heartbeat every 15 seconds to keep ngrok/reverse proxy tunnels active
  const heartbeatTimer = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      clearInterval(heartbeatTimer);
    }
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeatTimer);
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

export {
  BARCODE_PREFIX,
  KNOWN_BARCODE_PREFIXES,
  formatGenericBarcode,
  formatSejalBarcode,
};

export function cleanScannedBarcode(rawCode: string): string {
  if (!rawCode) return "";
  return String(rawCode)
    .trim()
    .replace(/^\][a-zA-Z0-9]{2}/, "") // Strip AIM symbology prefix (e.g. ]C1 for Code 128, ]Q1 for QR)
    .replace(/^QR[-_:]?/i, "")        // Strip QR- prefix
    .replace(/^BAR[-_:]?/i, "")       // Strip BAR- prefix
    .replace(/^#/, "")                // Strip leading #
    .replace(/[\x00-\x1F\x7F]/g, "")  // Strip non-printable control characters (STX, ETX, CR, LF, etc.)
    .trim();
}

export function isItemMatchingCode(item: any, rawCode: string): boolean {
  if (!item || !rawCode) return false;
  const clean = cleanScannedBarcode(rawCode);
  if (!clean) return false;

  const cleanLower = clean.toLowerCase();
  const digitsOnly = clean.replace(/\D/g, "");
  const cleanNormalized = clean.replace(/[\s\-_/.]/g, "").toLowerCase();

  // 1. Direct ID & Serial Number match
  if (item.id && String(item.id).toLowerCase() === cleanLower) return true;
  if (item.serialNumber) {
    const s = String(item.serialNumber).toLowerCase();
    if (s === cleanLower || s.replace(/^#/, "") === cleanLower) return true;
    const sDigits = s.replace(/\D/g, "");
    if (digitsOnly && sDigits && (sDigits === digitsOnly || sDigits.replace(/^0+/, "") === digitsOnly.replace(/^0+/, ""))) {
      return true;
    }
  }

  // 2. Direct Barcode & QR ID match
  if (item.barcode) {
    const b = String(item.barcode).toLowerCase();
    if (b === cleanLower || b.replace(/^qr[-_:]?/i, "") === cleanLower) return true;
    if (digitsOnly && b.replace(/\D/g, "") === digitsOnly) return true;
  }
  if (item.qrId) {
    const q = String(item.qrId).toLowerCase();
    if (q === cleanLower || q.replace(/^qr[-_:]?/i, "") === cleanLower) return true;
  }

  // 3. Formatted Generic & Sejal Barcode permutations (SFO / PI / Order / Batch with POS / Serial / srNo)
  const sfoSources = [item.sfoNo, item.orderNo, item.piNumber, item.batchNo].filter(Boolean) as string[];
  const seqSources = [item.posNo, item.srNo, item.serialNumber ? String(item.serialNumber).replace(/\D/g, "") : ""].filter(Boolean) as (string | number)[];

  const candidatePrefixes = Array.from(new Set([BARCODE_PREFIX, ...KNOWN_BARCODE_PREFIXES, ""]));
  for (const prefix of candidatePrefixes) {
    for (const sfo of sfoSources) {
      for (const seq of seqSources) {
        const generated = formatGenericBarcode(sfo, seq, prefix);
        if (generated === clean || generated === digitsOnly) return true;
      }
    }
  }

  // 4. Breakdown of numeric barcodes (Generic prefix + SFO + SEQ)
  if (digitsOnly.length >= 12) {
    for (const prefix of candidatePrefixes) {
      if (prefix && digitsOnly.startsWith(prefix)) {
        const remainder = digitsOnly.slice(prefix.length);
        if (remainder.length >= 6) {
          const seqPart4 = remainder.slice(-4).replace(/^0+/, "");
          const seqPart3 = remainder.slice(-3).replace(/^0+/, "");
          const sfoPart4 = remainder.slice(0, -4).replace(/^0+/, "");
          const sfoPart3 = remainder.slice(0, -3).replace(/^0+/, "");

          const matchesSeq = (seqP: string) =>
            seqSources.some((seq) => {
              const cleanSeq = String(seq).replace(/\D/g, "").replace(/^0+/, "");
              return cleanSeq && cleanSeq === seqP;
            });

          const matchesSfo = (sfoP: string) =>
            sfoSources.some((s) => {
              const cleanS = String(s).replace(/\D/g, "").replace(/^0+/, "");
              return cleanS && (cleanS === sfoP || cleanS.endsWith(sfoP) || sfoP.endsWith(cleanS));
            });

          if ((matchesSeq(seqPart4) && matchesSfo(sfoPart4)) || (matchesSeq(seqPart3) && matchesSfo(sfoPart3))) {
            return true;
          }
        }
      }
    }
  }

  // 5. Position (POS) match (e.g. scanned "POS 1", "POS #1", "POS-1", "P1", "#1", or pure numeric "1", "3", "22")
  if (item.posNo) {
    const posStr = String(item.posNo).trim().toLowerCase();
    const posDigits = posStr.replace(/\D/g, "");
    if (
      cleanLower === posStr ||
      cleanLower === `pos ${posStr}` ||
      cleanLower === `pos #${posStr}` ||
      cleanLower === `pos-${posStr}` ||
      cleanLower === `pos${posStr}` ||
      cleanLower === `#${posStr}` ||
      cleanLower === `p${posStr}` ||
      cleanLower === `p-${posStr}` ||
      cleanLower === `pos.${posStr}` ||
      cleanLower === `pos. ${posStr}`
    ) {
      return true;
    }
    // Pure numeric input matching POS (e.g. operator scans or types "3" or "22")
    if (digitsOnly && posDigits && (digitsOnly === posDigits || digitsOnly.replace(/^0+/, "") === posDigits.replace(/^0+/, ""))) {
      if (digitsOnly.length <= 4) {
        return true;
      }
    }
  }

  // 6. Glass Code or Item Code match (exact or normalized without spaces)
  if (item.itemCode) {
    const ic = String(item.itemCode).trim().toLowerCase();
    if (ic === cleanLower || ic.replace(/[\s\-_/.]/g, "") === cleanNormalized) return true;
  }
  if (item.glassCode) {
    const gc = String(item.glassCode).trim().toLowerCase();
    if (gc === cleanLower || gc.replace(/[\s\-_/.]/g, "") === cleanNormalized) return true;
  }

  // 7. SFO / Order / OB / Batch number match (allows scanning Order/SFO/OB/Batch numbers on stickers)
  const orderIdentifiers = [
    { val: item.sfoNo, label: "sfo" },
    { val: item.orderNo, label: "order" },
    { val: item.obNo, label: "ob" },
    { val: item.batchNo, label: "batch" },
    { val: item.piNumber, label: "pi" },
  ];
  for (const ident of orderIdentifiers) {
    if (ident.val) {
      const v = String(ident.val).trim().toLowerCase();
      if (v === cleanLower || `sfo ${v}` === cleanLower || `order ${v}` === cleanLower || `ob ${v}` === cleanLower || `batch ${v}` === cleanLower) {
        return true;
      }
      const vDigits = v.replace(/\D/g, "").replace(/^0+/, "");
      const inputDigits = digitsOnly.replace(/^0+/, "");
      if (vDigits && inputDigits && vDigits === inputDigits && vDigits.length >= 3) {
        return true;
      }
    }
  }

  return false;
}

export function findBestMatchingItem(
  items: GlassItem[],
  rawCode: string,
  preferredStage?: string
): GlassItem | null {
  const matches = items.filter((item) => isItemMatchingCode(item, rawCode));
  if (matches.length === 0) return null;

  const normStage = preferredStage?.trim().toLowerCase();

  // Active items (in production, not rejected, not finished)
  const activeMatches = matches.filter(
    (i) => i.status !== "Completed" && i.status !== "Rejected" && i.currentStage !== "Finished"
  );

  if (activeMatches.length > 0) {
    // Priority 1: Item currently in the workstation stage being viewed
    if (normStage && normStage !== "all" && normStage !== "overview") {
      const inPreferred = activeMatches.find(
        (i) => i.currentStage?.toLowerCase() === normStage
      );
      if (inPreferred) return inPreferred;

      // If preferred stage specified, but none are in preferredStage:
      // Check if matching items already completed preferredStage
      const alreadyCompleted = matches.some((i) => {
        if (i.completedStages && Array.isArray(i.completedStages)) {
          if (i.completedStages.some((s) => s.toLowerCase() === normStage)) return true;
        }
        const route = i.processRoute || [];
        const targetIdx = route.findIndex((s) => s.toLowerCase() === normStage);
        const currentIdx = route.findIndex((s) => s.toLowerCase() === String(i.currentStage || "").toLowerCase());
        return targetIdx >= 0 && currentIdx > targetIdx;
      });

      if (alreadyCompleted) {
        // Do NOT fall back to downstream items when scanning at an earlier stage!
        return null;
      }
    }

    // Priority 2: Item at the EARLIEST stage along process route (e.g. Cutting before Pairing before Lamination)
    const stageRankOrder: Record<string, number> = {
      Cutting: 1,
      Pairing: 2,
      Lamination: 3,
      DGU: 4,
      Finished: 5,
    };

    activeMatches.sort((a, b) => {
      const rankA = stageRankOrder[a.currentStage] || 99;
      const rankB = stageRankOrder[b.currentStage] || 99;
      return rankA - rankB;
    });

    return activeMatches[0];
  }

  return matches[0];
}

// Infer workstation stage from request body, Authorization bearer token, or operator profile
export function inferStageFromRequest(req: any, explicitStage?: unknown, operatorName?: unknown): string {
  if (explicitStage && typeof explicitStage === "string" && explicitStage.trim() && explicitStage.trim().toLowerCase() !== "all" && explicitStage.trim().toLowerCase() !== "overview") {
    return explicitStage.trim();
  }

  // 1. Try bearer token
  try {
    const authHeader = req?.headers?.authorization;
    if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const verified = verifyToken(token);
      if (verified?.role === "Admin" || verified?.role === "Supervisor") {
        // Admins and supervisors oversee all stages; do not lock to stage 0 when on overview/dashboard
        return "";
      }
      if (verified?.assignedStages && Array.isArray(verified.assignedStages) && verified.assignedStages.length > 0) {
        return verified.assignedStages[0];
      }
    }
  } catch {}

  // 2. Try operator username or email from body or headers
  const opStr = typeof operatorName === "string" ? operatorName.trim() : "";
  if (opStr) {
    try {
      const user = findUserByUsernameOrEmail(opStr);
      if (user?.role === "Admin" || user?.role === "Supervisor") {
        return "";
      }
      if (user?.assignedStages && Array.isArray(user.assignedStages) && user.assignedStages.length > 0) {
        return user.assignedStages[0];
      }
    } catch {}
  }

  return "";
}

// Barcode / QR ID / Serial Lookup
export const handleScanLookup: RequestHandler = (req, res) => {
  const { code, stage, operator } = req.body;
  if (!code) {
    res.status(400).json({ message: "Code parameter is required" });
    return;
  }

  const effectiveStage = inferStageFromRequest(req, stage, operator);
  const matches = glassItemsDatabase.filter((i) => isItemMatchingCode(i, String(code)));
  const normStage = effectiveStage ? effectiveStage.trim().toLowerCase() : undefined;

  if (matches.length > 0 && normStage && normStage !== "all" && normStage !== "overview") {
    const inStage = matches.filter((i) => i.status !== "Rejected" && i.currentStage?.toLowerCase() === normStage);
    if (inStage.length === 0) {
      const alreadyPast = matches.filter((i) => {
        if (i.completedStages && Array.isArray(i.completedStages)) {
          if (i.completedStages.some((s) => s.toLowerCase() === normStage)) return true;
        }
        const route = i.processRoute || [];
        const targetIdx = route.findIndex((s) => s.toLowerCase() === normStage);
        const curIdx = route.findIndex((s) => s.toLowerCase() === String(i.currentStage || "").toLowerCase());
        return targetIdx >= 0 && curIdx > targetIdx;
      });

      if (alreadyPast.length > 0) {
        const first = alreadyPast[0];
        const posLabel = first.posNo ? `POS #${first.posNo}` : (first.itemCode || first.serialNumber);
        const pi = piDatabase.find((p) => p.id === first.piId || p.piNumber === first.piNumber);
        const history = productionHistoryDatabase.filter((h) => h.serialNumber === first.serialNumber || h.barcode === first.barcode);
        res.json({
          status: "already_scanned",
          message: `⚠️ Sticker already scanned! All ${alreadyPast.length} sticker(s) for ${posLabel} have already completed ${effectiveStage} (currently at ${first.currentStage || "Next Stage"}).`,
          item: first,
          items: alreadyPast,
          pi,
          history,
          completedInStage: true,
        });
        return;
      }
    }
  }

  const item = findBestMatchingItem(glassItemsDatabase, String(code), effectiveStage || undefined);

  if (!item) {
    res.status(404).json({ message: `No glass item found for code: ${code}` });
    return;
  }

  const pi = piDatabase.find((p) => p.id === item.piId || p.piNumber === item.piNumber);
  const history = productionHistoryDatabase.filter((h) => h.serialNumber === item.serialNumber || h.barcode === item.barcode);

  res.json({ item, pi, history, status: "ready" });
};

// Complete stage & advance to next stage in process route (Supports QTY-based piece-by-piece scanning)
export const handleAdvanceStage: RequestHandler = (req, res) => {
  const { serialNumbers, itemIds, stage, currentStage, advanceQty = 1, advanceAll = false, operator = "Operator", remarks = "Stage completed" } = req.body;
  const cleanOperator = sanitizeString(operator || "Operator", 100);
  const cleanRemarks = sanitizeString(remarks || "Stage completed", 500);
  const preferredStage = inferStageFromRequest(req, stage || currentStage, cleanOperator);

  const idList = Array.isArray(itemIds) ? itemIds.map((s) => String(s).trim()).filter(Boolean) : [];
  const serialList = Array.isArray(serialNumbers) ? serialNumbers.map((s) => String(s).trim()).filter(Boolean) : [];

  if (idList.length === 0 && serialList.length === 0) {
    res.status(400).json({ message: "serialNumbers or itemIds array is required" });
    return;
  }

  const updatedItems: GlassItem[] = [];
  const skippedItems: { serialNumber: string; reason: string }[] = [];
  const affectedPiIds = new Set<string>();
  const alreadyProcessedIds = new Set<string>();
  const advanceDetails: {
    serialNumber: string;
    posNo?: string;
    advancedQty: number;
    remainingQty: number;
    fromStage: string;
    toStage: string;
    isPieceScan: boolean;
  }[] = [];
  let hasPairingItems = false;

  // Build fast O(1) index map: Pass 1 prioritizes active in-production items
  const itemMap = new Map<string, GlassItem>();
  for (let i = 0; i < glassItemsDatabase.length; i++) {
    const g = glassItemsDatabase[i];
    if (g.id) itemMap.set(g.id, g);
    if (g.status !== "Completed" && g.status !== "Rejected" && g.currentStage !== "Finished") {
      if (!itemMap.has(g.serialNumber)) itemMap.set(g.serialNumber, g);
      if (g.barcode && !itemMap.has(g.barcode)) itemMap.set(g.barcode, g);
    }
  }
  // Pass 2: fallback for completed/finished items
  for (let i = 0; i < glassItemsDatabase.length; i++) {
    const g = glassItemsDatabase[i];
    if (!itemMap.has(g.serialNumber)) itemMap.set(g.serialNumber, g);
    if (g.barcode && !itemMap.has(g.barcode)) itemMap.set(g.barcode, g);
  }

  // When specific itemIds are provided by the client, use ONLY itemIds so that
  // the same item is not processed twice (once by ID and once by serialNumber/barcode),
  // which causes multiple pieces sharing the same barcode or POS to be advanced simultaneously.
  const combinedTargets: { type: "id" | "serial"; val: string }[] =
    idList.length > 0
      ? Array.from(new Set(idList)).map((id) => ({ type: "id" as const, val: id }))
      : Array.from(new Set(serialList)).map((sn) => ({ type: "serial" as const, val: sn }));

  for (const target of combinedTargets) {
    const rawVal = target.val;
    let item: GlassItem | null | undefined = null;

    if (target.type === "id") {
      item = itemMap.get(rawVal) || glassItemsDatabase.find((g) => g.id === rawVal);
    } else {
      const cleanSerial = rawVal.replace(/^qr-/i, "").trim();
      item = itemMap.get(rawVal) || itemMap.get(cleanSerial);

      // If not directly found in map or ambiguous barcode, use smart matcher prioritizing preferred stage
      if (!item) {
        item = findBestMatchingItem(glassItemsDatabase, rawVal, preferredStage || undefined);
      } else if (preferredStage && item.currentStage?.toLowerCase() !== preferredStage.toLowerCase()) {
        // If the map found an item that is NOT in the preferredStage, check if a matching item in preferredStage exists!
        const stageMatch = findBestMatchingItem(glassItemsDatabase, rawVal, preferredStage);
        if (stageMatch && stageMatch.currentStage?.toLowerCase() === preferredStage.toLowerCase()) {
          item = stageMatch;
        } else {
          // Check if item has already completed preferredStage
          const normPref = preferredStage.trim().toLowerCase();
          const alreadyCompleted = (item.completedStages && item.completedStages.some((s) => s.toLowerCase() === normPref)) ||
            (() => {
              const route = item.processRoute || [];
              const targetIdx = route.findIndex((s) => s.toLowerCase() === normPref);
              const curIdx = route.findIndex((s) => s.toLowerCase() === (item.currentStage || "").toLowerCase());
              return targetIdx >= 0 && curIdx > targetIdx;
            })();
          if (alreadyCompleted) {
            skippedItems.push({
              serialNumber: item.serialNumber,
              reason: `Sticker already scanned! Item ${item.serialNumber} has already completed stage "${preferredStage}".`,
            });
            continue;
          }
        }
      }
    }

    if (!item) {
      skippedItems.push({ serialNumber: String(rawVal), reason: "Item not found" });
      continue;
    }

    // Guard: if preferredStage was provided and the resolved item is not in that stage, prevent advancing from the wrong stage
    if (preferredStage && item.currentStage?.toLowerCase() !== preferredStage.toLowerCase()) {
      const normPref = preferredStage.trim().toLowerCase();
      const alreadyCompleted = (item.completedStages && item.completedStages.some((s) => s.toLowerCase() === normPref)) ||
        (() => {
          const route = item.processRoute || [];
          const targetIdx = route.findIndex((s) => s.toLowerCase() === normPref);
          const curIdx = route.findIndex((s) => s.toLowerCase() === (item.currentStage || "").toLowerCase());
          return targetIdx >= 0 && curIdx > targetIdx;
        })();
      if (alreadyCompleted) {
        skippedItems.push({
          serialNumber: item.serialNumber,
          reason: `Sticker already scanned! Item ${item.serialNumber} has already completed stage "${preferredStage}".`,
        });
        continue;
      }
      skippedItems.push({
        serialNumber: item.serialNumber,
        reason: `Item ${item.serialNumber} is currently at stage "${item.currentStage}" and cannot be scanned at "${preferredStage}".`,
      });
      continue;
    }

    if (alreadyProcessedIds.has(item.id)) {
      continue;
    }
    if (item.status === "Rejected") {
      skippedItems.push({ serialNumber: item.serialNumber, reason: "Item is rejected" });
      continue;
    }
    alreadyProcessedIds.add(item.id);


    const currentStage = item.currentStage;

    // Determine next stage from processRoute
    const route = item.processRoute || [];
    let currentIndex = -1;
    if (currentStage === "Pairing") {
      if (item.completedStages?.includes("Lamination")) {
        currentIndex = route.lastIndexOf("Pairing");
      } else {
        currentIndex = route.indexOf("Pairing");
      }
    } else {
      currentIndex = route.indexOf(currentStage);
    }
    const nextStage = currentIndex >= 0 && currentIndex < route.length - 1 ? route[currentIndex + 1] : "Finished";

    // ── GUARD 1: Pairing Workstation Flow Rule ──
    // Single glass panes sitting in Pairing Buffer CANNOT advance to downstream stages (DGU / Lamination)
    // without being paired with their matching partner pane (1 Colour + 1 Clear for DGU/DLGU, or matching lamination panes).
    if (currentStage === "Pairing") {
      let partnerItem: GlassItem | undefined = undefined;

      // 1. Check if item is already part of an existing pair
      const existingPairId = (item as any).dguPairId || (item as any).lamPairId;
      if (existingPairId) {
        partnerItem = glassItemsDatabase.find(
          (other) =>
            other.id !== item.id &&
            ((other as any).dguPairId === existingPairId || (other as any).lamPairId === existingPairId) &&
            other.status !== "Completed" &&
            other.status !== "Rejected"
        );
      }

      // 2. If not already paired, search the Pairing Buffer for an eligible unpaired partner pane
      if (!partnerItem) {
        if (isDguItem(item) || item.glassCategory === "DGU") {
          partnerItem = glassItemsDatabase.find(
            (other) =>
              other.id !== item.id &&
              other.currentStage === "Pairing" &&
              other.status !== "Completed" &&
              other.status !== "Rejected" &&
              !(other as any).dguPairId &&
              !alreadyProcessedIds.has(other.id) &&
              isStickerPairMatch(item, other)
          );
        } else if (isDlguItem(item) || item.glassCategory === "DLGU") {
          partnerItem = glassItemsDatabase.find(
            (other) =>
              other.id !== item.id &&
              other.currentStage === "Pairing" &&
              other.status !== "Completed" &&
              other.status !== "Rejected" &&
              !alreadyProcessedIds.has(other.id) &&
              isDlguStickerPairMatch(item, other)
          );
        } else if (isLaminationItem(item) || item.glassCategory === "Lamination") {
          partnerItem = glassItemsDatabase.find(
            (other) =>
              other.id !== item.id &&
              other.currentStage === "Pairing" &&
              other.status !== "Completed" &&
              other.status !== "Rejected" &&
              !(other as any).lamPairId &&
              !alreadyProcessedIds.has(other.id) &&
              other.posNo === item.posNo &&
              Math.abs((other.width || 0) - (item.width || 0)) < 2 &&
              Math.abs((other.height || 0) - (item.height || 0)) < 2 &&
              ((item.piId && other.piId === item.piId) ||
                (item.piNumber && other.piNumber === item.piNumber) ||
                (item.orderNo && other.orderNo === item.orderNo))
          );
        }
      }

      // If no partner pane is available in the Pairing Buffer: REJECT / SKIP ADVANCE!
      if (!partnerItem) {
        const isColour = item.colorOrClear === "Colour" || String(item.category || "").toLowerCase().includes("colour");
        const partnerDesc = isColour ? "Clear" : "Colour";
        skippedItems.push({
          serialNumber: item.serialNumber,
          reason: `Cannot advance from Pairing: Glass pane ${item.serialNumber} (POS #${item.posNo || item.itemCode}) cannot advance to ${nextStage} without pairing. The matching ${partnerDesc} partner pane has not been cut or is not in the Pairing Buffer yet.`,
        });
        continue;
      }

      // Partner pane is found! Ensure pair metadata is attached to both
      if (isDguItem(item) || item.glassCategory === "DGU") {
        const pairId = (item as any).dguPairId || (partnerItem as any).dguPairId || `dgu-${item.serialNumber}-${partnerItem.serialNumber}`;
        (item as any).dguPairId = pairId;
        (partnerItem as any).dguPairId = pairId;
      } else if (isLaminationItem(item) || item.glassCategory === "Lamination") {
        const pairId = (item as any).lamPairId || (partnerItem as any).lamPairId || `lam-${item.serialNumber}-${partnerItem.serialNumber}`;
        (item as any).lamPairId = pairId;
        (partnerItem as any).lamPairId = pairId;
      } else if (isDlguItem(item) || item.glassCategory === "DLGU") {
        const pairId = `dlgu-${item.serialNumber}-${partnerItem.serialNumber}`;
        (item as any).dguPairId = pairId;
        (partnerItem as any).dguPairId = pairId;
      }

      // If partner is currently in Pairing and not yet processed, advance partner alongside this item!
      if (partnerItem.currentStage === "Pairing" && !alreadyProcessedIds.has(partnerItem.id)) {
        alreadyProcessedIds.add(partnerItem.id);
        if (!partnerItem.completedStages.includes("Pairing")) {
          partnerItem.completedStages.push("Pairing");
        }
        partnerItem.currentStage = nextStage;
        partnerItem.updatedAt = new Date().toISOString();
        updatedItems.push(partnerItem);
        if (partnerItem.piId) affectedPiIds.add(partnerItem.piId);

        productionHistoryDatabase.unshift({
          id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          serialNumber: partnerItem.serialNumber,
          barcode: partnerItem.barcode,
          piNumber: partnerItem.piNumber,
          itemOrBatch: partnerItem.serialNumber,
          action: `Paired & Advanced to ${nextStage}`,
          prevStatus: "Pairing",
          newStatus: nextStage,
          stage: "Pairing",
          status: "Completed",
          operator: cleanOperator,
          user: cleanOperator,
          timestamp: new Date().toISOString(),
          remarks: `Paired with ${item.serialNumber} (POS #${item.posNo || item.itemCode}) and advanced to ${nextStage}`,
        });
      }
    }

    // ── GUARD 2: DGU Workstation Flow Rule ──
    // Single glass panes at DGU stage CANNOT advance to Finished without their partner pane!
    if (currentStage === "DGU" && nextStage === "Finished") {
      const isDgu = isDguItem(item) || item.glassCategory === "DGU" || item.glassCategory === "DLGU" || isDlguItem(item) || item.processRoute?.includes("DGU");
      if (isDgu) {
        const itemDguPairId = (item as any).dguPairId;
        let dguPartner: GlassItem | undefined = undefined;

        if (itemDguPairId) {
          dguPartner = glassItemsDatabase.find(
            (other) =>
              other.id !== item.id &&
              (other as any).dguPairId === itemDguPairId &&
              (other.currentStage === "DGU" || other.currentStage === "Finished") &&
              other.status !== "Rejected"
          );
        }

        if (!dguPartner) {
          // Fallback: look for matching opposite-finish pane in DGU
          dguPartner = glassItemsDatabase.find(
            (other) =>
              other.id !== item.id &&
              other.currentStage === "DGU" &&
              other.status !== "Completed" &&
              other.status !== "Rejected" &&
              other.posNo === item.posNo &&
              Math.abs((other.width || 0) - (item.width || 0)) < 2 &&
              Math.abs((other.height || 0) - (item.height || 0)) < 2 &&
              ((item.piId && other.piId === item.piId) || (item.piNumber && other.piNumber === item.piNumber) || (item.orderNo && other.orderNo === item.orderNo)) &&
              (other.colorOrClear !== item.colorOrClear)
          );
        }

        if (!dguPartner) {
          skippedItems.push({
            serialNumber: item.serialNumber,
            reason: `Cannot advance to Finished: DGU item ${item.serialNumber} (POS #${item.posNo || item.itemCode}) cannot be completed without its partner pane. Both Colour and Clear panes must be assembled in DGU before completing.`,
          });
          continue;
        }

        // Attach dguPairId to both if not present
        if (!itemDguPairId) {
          const pairId = `dgu-${item.serialNumber}-${dguPartner.serialNumber}`;
          (item as any).dguPairId = pairId;
          (dguPartner as any).dguPairId = pairId;
        }
      }
    }

    if (!item.completedStages.includes(currentStage)) {
      item.completedStages.push(currentStage);
    }

    if (nextStage === "Pairing") {
      hasPairingItems = true;
      if (item.glassCategory === "DLGU" || isDlguItem(item) || (Array.isArray(route) && route.includes("Lamination") && route.includes("DGU"))) {
        if (item.completedStages.includes("Lamination") || item.colorOrClear === "Colour" || !route.includes("Lamination")) {
          item.dlguPhase = "DguPairing";
        } else {
          item.dlguPhase = "LamPairing";
        }
      } else {
        delete item.dlguPhase;
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
      alreadyProcessedIds.add(advancedItem.id);

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

      advanceDetails.push({
        serialNumber: item.serialNumber,
        posNo: item.posNo || item.itemCode,
        advancedQty: qtyToAdvance,
        remainingQty,
        fromStage: currentStage,
        toStage: nextStage,
        isPieceScan: true,
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

        // If this item is part of a DGU or DLGU unit, and only a single piece was scanned/submitted,
        const isSingleTargetScan = (idList.length <= 1 && serialList.length <= 1) || Boolean((item as any).dguPairId);
        if ((item.glassCategory === "DLGU" || item.glassCategory === "DGU" || item.processRoute.includes("DGU")) && isSingleTargetScan) {
          const itemDguPairId = (item as any).dguPairId;
          const itemLamPairId = (item as any).lamPairId;
          const isItemColour = item.colorOrClear === "Colour" || COLOURED_COATED_GLASS_REGEX.test(`${item.glassType || ""} ${item.category || ""}`);
          const isDlgu = isDlguItem(item) || item.glassCategory === "DLGU";

          let unitPartners: GlassItem[] = [];

          if (itemDguPairId) {
            unitPartners = glassItemsDatabase.filter(
              (other) =>
                other.id !== item.id &&
                (other as any).dguPairId === itemDguPairId &&
                other.currentStage === "DGU" &&
                other.status !== "Completed" &&
                other.status !== "Rejected" &&
                !alreadyProcessedIds.has(other.id)
            );
          }

          if (unitPartners.length === 0) {
            // Sibling fallback strictly restricted to ONE matching unit!
            const dguSiblings = glassItemsDatabase.filter(
              (other) =>
                other.id !== item.id &&
                other.currentStage === "DGU" &&
                other.status !== "Completed" &&
                other.status !== "Rejected" &&
                other.posNo === item.posNo &&
                Math.abs((other.width || 0) - (item.width || 0)) < 2 &&
                Math.abs((other.height || 0) - (item.height || 0)) < 2 &&
                (
                  (item.piId && other.piId === item.piId) ||
                  (item.piNumber && other.piNumber === item.piNumber) ||
                  (item.orderNo && other.orderNo === item.orderNo) ||
                  (item.sfoNo && other.sfoNo === item.sfoNo)
                ) &&
                !alreadyProcessedIds.has(other.id)
            );

            if (isDlgu) {
              if (isItemColour) {
                // Colour pane scanned: find at most 2 Clear partner panes for this 1 unit
                unitPartners = dguSiblings
                  .filter((other) => other.colorOrClear === "Clear" || /clear/i.test(`${other.glassType || ""} ${other.category || ""}`))
                  .slice(0, 2);
              } else {
                // Clear pane scanned: find at most 1 Colour pane + at most 1 sibling Clear pane
                const colPartner = dguSiblings.find(
                  (other) => other.colorOrClear === "Colour" || COLOURED_COATED_GLASS_REGEX.test(`${other.glassType || ""} ${other.category || ""}`)
                );
                const clrPartner = itemLamPairId
                  ? dguSiblings.find((other) => (other as any).lamPairId === itemLamPairId && other.id !== item.id)
                  : dguSiblings.find((other) => (other.colorOrClear === "Clear" || /clear/i.test(`${other.glassType || ""} ${other.category || ""}`)) && other.id !== item.id);
                if (colPartner) unitPartners.push(colPartner);
                if (clrPartner) unitPartners.push(clrPartner);
              }
            } else {
              // Standard DGU: find at most ONE opposite-finish partner pane for this 1 unit
              const oppPartner = dguSiblings.find(
                (other) => {
                  const isOtherColour = other.colorOrClear === "Colour" || COLOURED_COATED_GLASS_REGEX.test(`${other.glassType || ""} ${other.category || ""}`);
                  return isOtherColour !== isItemColour;
                }
              );
              if (oppPartner) unitPartners.push(oppPartner);
            }
          }

          unitPartners.forEach((partner) => {
            alreadyProcessedIds.add(partner.id);
            partner.currentStage = "Finished";
            partner.status = "Completed";
            if (!partner.completedStages.includes("DGU")) partner.completedStages.push("DGU");
            partner.updatedAt = new Date().toISOString();
            updatedItems.push(partner);

            productionHistoryDatabase.unshift({
              id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
              serialNumber: partner.serialNumber,
              barcode: partner.barcode,
              piNumber: partner.piNumber,
              itemOrBatch: partner.serialNumber,
              action: "Dispatched to Finished",
              prevStatus: "DGU",
              newStatus: "Completed",
              stage: "DGU",
              status: "Completed",
              operator: cleanOperator,
              user: cleanOperator,
              timestamp: new Date().toISOString(),
              remarks: `${cleanRemarks} (Unit partner pane auto-dispatched with #${item.serialNumber})`,
            });
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

      advanceDetails.push({
        serialNumber: item.serialNumber,
        posNo: item.posNo || item.itemCode,
        advancedQty: currentQty,
        remainingQty: 0,
        fromStage: currentStage,
        toStage: nextStage,
        isPieceScan: false,
      });
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
    const completedCount = piItems.filter((i) => (i.currentStage === "Finished" || i.currentStage === "Dispatched" || i.isDispatched || i.status === "Completed") && i.status !== "Rejected").length;
    pi.completedItemsCount = completedCount;
    if (completedCount >= piItems.length && piItems.length > 0) {
      pi.status = "Completed";
    } else if (completedCount > 0 || piItems.some((i) => i.currentStage !== "Cutting" || i.completedStages?.length)) {
      pi.status = "In Production";
    }
  }

  const hasLaminationAdvanced = updatedItems.some(
    (i) => i.completedStages.includes("Lamination") && isDlguItem(i)
  );
  const hasDlguPairingArrived = hasPairingItems && updatedItems.some((i) => isDlguItem(i));

  if (hasPairingItems) {
    autoAdvancePairedDguItems();
    autoAdvancePairedLaminationItems();
    autoAdvancePairedDlguItems(); // Phase 1: Clear + Clear -> Lamination
  }

  // Phase 2 DLGU auto-pairing: triggers when DLGU glass is sent from Lamination (or when matching Colour glass arrives and Laminated glass is already sent)
  if (hasLaminationAdvanced || hasDlguPairingArrived) {
    manualPairDlguPhase2Items();
  }

  saveDatabaseToDisk(false);
  broadcastUpdate("stage_advanced", { count: updatedItems.length });

  const formatStageDisplay = (stg: string) => {
    if (!stg) return "";
    const s = stg.trim().toLowerCase();
    if (s === "pairing") return "Glass Pairing Buffer";
    if (s === "finished") return "Finished Warehouse";
    if (s === "dgu") return "DGU Assembly Line";
    if (s === "lamination") return "Lamination Workstation";
    if (s === "cutting") return "Cutting Workstation";
    if (s === "polishing") return "Polishing Workstation";
    return stg;
  };

  let richMessage = "";
  if (advanceDetails.length === 1) {
    const d = advanceDetails[0];
    const humanTo = formatStageDisplay(d.toStage);
    const humanFrom = formatStageDisplay(d.fromStage);
    const posText = d.posNo ? ` (POS #${d.posNo})` : "";
    if (d.remainingQty > 0) {
      richMessage = `${d.advancedQty} pc of #${d.serialNumber}${posText} advanced from ${humanFrom} ➔ ${humanTo} • ${d.remainingQty} pcs remaining in ${humanFrom}`;
    } else if (d.isPieceScan) {
      richMessage = `Completed #${d.serialNumber}${posText} — Advanced ${d.advancedQty} pc from ${humanFrom} ➔ ${humanTo} (All pieces completed)`;
    } else {
      richMessage = `Advanced #${d.serialNumber}${posText} from ${humanFrom} ➔ ${humanTo}${d.advancedQty > 1 ? ` (${d.advancedQty} pcs)` : ""}`;
    }
  } else if (advanceDetails.length > 1) {
    const firstDetail = advanceDetails[0];
    const secondDetail = advanceDetails[1];
    if (advanceDetails.length === 2 && firstDetail.toStage === secondDetail.toStage && firstDetail.posNo && firstDetail.posNo === secondDetail.posNo) {
      richMessage = `Paired & Advanced #${firstDetail.serialNumber} + #${secondDetail.serialNumber} (POS #${firstDetail.posNo}) ➔ ${formatStageDisplay(firstDetail.toStage)}`;
    } else {
      const targetStageName = formatStageDisplay(updatedItems[0]?.currentStage || "Next Stage");
      richMessage = `${updatedItems.length} items advanced to ${targetStageName}`;
    }
  }

  if (updatedItems.length > 0) {
    const firstItem = updatedItems[0];
    const targetStageName = firstItem?.currentStage || "Next Stage";
    const operatorName = (req as any).user?.username || req.body?.operator || "Operator";
    createAndBroadcastNotification({
      title: `${targetStageName} Stage Advanced`,
      message: richMessage || `${updatedItems.length} item(s) advanced to ${formatStageDisplay(targetStageName)}${firstItem?.serialNumber ? ` (Item #${firstItem.serialNumber})` : ""} by ${operatorName}`,
      category: "STAGE_ADVANCE",
      type: "success",
      stage: targetStageName,
      serialNumber: firstItem?.serialNumber,
      piNumber: firstItem?.piNumber,
      operator: operatorName,
    });
  }

  if (updatedItems.length === 0 && skippedItems.length > 0) {
    const alreadyScanned = skippedItems.find((s) => s.reason.toLowerCase().includes("already scanned"));
    if (alreadyScanned) {
      res.status(400).json({
        error: "Already scanned in this stage",
        message: alreadyScanned.reason,
        skippedItems,
      });
      return;
    }
    const wrongStage = skippedItems.find((s) => s.reason.toLowerCase().includes("cannot be scanned at"));
    if (wrongStage) {
      res.status(400).json({
        error: "Wrong workstation stage",
        message: wrongStage.reason,
        skippedItems,
      });
      return;
    }
    const pairingError = skippedItems.find(
      (s) =>
        s.reason.toLowerCase().includes("cannot advance from pairing") ||
        s.reason.toLowerCase().includes("cannot advance to finished") ||
        s.reason.toLowerCase().includes("without pairing") ||
        s.reason.toLowerCase().includes("partner pane")
    );
    if (pairingError) {
      res.status(400).json({
        error: "Pairing Required",
        message: pairingError.reason,
        skippedItems,
      });
      return;
    }
  }

  res.json({
    message: richMessage || (updatedItems.length > 0 ? "Item(s) advanced successfully" : "No items were advanced"),
    items: updatedItems,
    skippedItems,
    skippedCount: skippedItems.length,
    advanceDetails,
  });
};

export function isDlguItem(item: any): boolean {
  if (!item) return false;
  if (item.glassCategory === "DLGU") return true;
  if (item.glassCategory === "Lamination" || item.glassCategory === "Laminated") return false;
  if (Array.isArray(item.processRoute)) {
    if (item.processRoute.includes("Lamination") && item.processRoute.includes("DGU")) return true;
    if (item.processRoute.includes("Lamination") && !item.processRoute.includes("DGU")) return false;
  }
  const str = `${item.glassType || ""} ${item.glassCode || ""} ${item.itemCode || ""}`.toLowerCase();
  const hasSpacer = /\b(spacer|dgu|igu|double|dlgu)\b/i.test(str);
  const hasLam = /\b(lam|lamination|laminated|pvb|sgp|eva|dlgu)\b/i.test(str);
  return (hasSpacer && hasLam) || str.includes("dlgu");
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
  const hasSpacer = /\b(spacer|dgu|igu|double)\b/i.test(str);
  const hasLam = /\b(lam|lamination|laminated|pvb|sgp|eva)\b/i.test(str);
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
  const hasSpacer = /\b(spacer|dgu|igu|double)\b/i.test(str);
  const hasLam = /\b(lam|lamination|laminated|pvb|sgp|eva)\b/i.test(str);
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
      isALamDone ||
      isBLamDone ||
      (Array.isArray(clrPane.completedStages) && clrPane.completedStages.includes("Lamination"));
    if (!isClrReady) return false;
  } else {
    // Phase 1: Lamination Pairing (e.g. 6mm Clear + 13.52mm Clear Lam partner, or 2 identical clear lites)
    // As long as they are distinct physical panes (serials/IDs verified above), they are valid pairing candidates.
  }

  // 1. Order No / PI # must match
  if (paneA.orderNo && paneB.orderNo) {
    if (String(paneA.orderNo).trim().toLowerCase() !== String(paneB.orderNo).trim().toLowerCase()) return false;
  } else if (paneA.obNo && paneB.obNo) {
    if (String(paneA.obNo).trim().toLowerCase() !== String(paneB.obNo).trim().toLowerCase()) return false;
  } else {
    const orderA = String(paneA.piNumber || paneA.piId || "").replace(/^STK-/i, "").trim().toLowerCase();
    const orderB = String(paneB.piNumber || paneB.piId || "").replace(/^STK-/i, "").trim().toLowerCase();
    if (orderA && orderB && orderA !== orderB) return false;
  }

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
  if (col.orderNo && clr.orderNo) {
    if (String(col.orderNo).trim().toLowerCase() !== String(clr.orderNo).trim().toLowerCase()) return false;
  } else if (col.obNo && clr.obNo) {
    if (String(col.obNo).trim().toLowerCase() !== String(clr.obNo).trim().toLowerCase()) return false;
  } else {
    const colOrder = String(col.piNumber || col.piId || "").replace(/^STK-/i, "").trim().toLowerCase();
    const clrOrder = String(clr.piNumber || clr.piId || "").replace(/^STK-/i, "").trim().toLowerCase();
    if (colOrder && clrOrder && colOrder !== clrOrder) return false;
  }

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
    const hasColourKeyword = isGlassTypeColour(i.glassType, i.glassColor, i.category);

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
      const pairId = `dgu-${col.serialNumber}-${match.serialNumber}`;
      (col as any).dguPairId = pairId;
      (match as any).dguPairId = pairId;
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
  if (paneA.orderNo && paneB.orderNo) {
    if (String(paneA.orderNo).trim().toLowerCase() !== String(paneB.orderNo).trim().toLowerCase()) return false;
  } else if (paneA.obNo && paneB.obNo) {
    if (String(paneA.obNo).trim().toLowerCase() !== String(paneB.obNo).trim().toLowerCase()) return false;
  } else {
    const orderA = String(paneA.piNumber || paneA.piId || "").replace(/^STK-/i, "").trim().toLowerCase();
    const orderB = String(paneB.piNumber || paneB.piId || "").replace(/^STK-/i, "").trim().toLowerCase();
    if (orderA && orderB && orderA !== orderB) return false;
  }

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
    createAndBroadcastNotification({
      title: "Lamination Pairing Completed",
      message: `Paired ${advancedCount / 2} set(s) (${advancedCount} panes) and advanced to Lamination Workstation`,
      category: "STAGE_ADVANCE",
      type: "success",
      stage: "Lamination",
      operator: (req as any).user?.username || "Pairing Station",
    });
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
    createAndBroadcastNotification({
      title: "DGU Pairing Completed",
      message: `Paired ${advancedCount / 2} DGU unit(s) (${advancedCount} panes) and advanced to DGU Workstation`,
      category: "STAGE_ADVANCE",
      type: "success",
      stage: "DGU",
      operator: (req as any).user?.username || "Pairing Station",
    });
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

  // 1. Phase 1: Lamination Pairing in Pairing Buffer (e.g. 6mm Clear + 13.52mm Clear partner) - AUTOMATIC
  const lamPairingPanes = glassItemsDatabase.filter(
    (i) =>
      i.currentStage === "Pairing" &&
      i.status !== "Completed" &&
      i.status !== "Rejected" &&
      isDlguItem(i) &&
      (i.processRoute?.includes("Lamination") ?? true) &&
      !i.completedStages?.includes("Lamination") &&
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
      if (!paneA.completedStages) paneA.completedStages = ["Cutting"];
      if (!paneA.completedStages.includes("Pairing")) paneA.completedStages.push("Pairing");
      paneA.updatedAt = new Date().toISOString();

      match.currentStage = "Lamination";
      if (!match.completedStages) match.completedStages = ["Cutting"];
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

  if (advancedCount > 0) {
    saveDatabaseToDisk();
  }

  return advancedCount;
}

/**
 * Phase 2: Manual DLGU DGU Pairing (Colour outer pane waiting in Pairing buffer + Laminated Clear pane post-Lamination)
 * Triggered MANUALLY by operator via Pair button in Pairing Buffer or barcode scan.
 */
export function manualPairDlguPhase2Items(filterPosNo?: string, filterPi?: string, operator = "Operator"): number {
  let advancedCount = 0;
  const usedSerials = new Set<string>();

  const cleanPiFilter = filterPi ? filterPi.replace(/^STK-/i, "").trim().toLowerCase() : undefined;
  const cleanPosFilter = filterPosNo ? String(filterPosNo).trim().toLowerCase() : undefined;

  const waitingColourPanes = glassItemsDatabase.filter(
    (i) =>
      i.currentStage === "Pairing" &&
      i.status !== "Completed" &&
      i.status !== "Rejected" &&
      isDlguItem(i) &&
      i.colorOrClear === "Colour" &&
      !usedSerials.has(i.serialNumber) &&
      (!cleanPiFilter || (i.piNumber && i.piNumber.replace(/^STK-/i, "").trim().toLowerCase() === cleanPiFilter) || (i.piId && i.piId.replace(/^STK-/i, "").trim().toLowerCase() === cleanPiFilter)) &&
      (!cleanPosFilter || String(i.posNo).trim().toLowerCase() === cleanPosFilter)
  );

  if (waitingColourPanes.length > 0) {
    const availableLamPanes = glassItemsDatabase.filter(
      (i) =>
        (i.currentStage === "Pairing" || i.currentStage === "Lamination") &&
        i.status !== "Completed" &&
        i.status !== "Rejected" &&
        isDlguItem(i) &&
        i.colorOrClear !== "Colour" &&
        (Boolean(i.completedStages?.includes("Lamination")) || i.currentStage === "Lamination" || i.dlguPhase === "DguPairing") &&
        !usedSerials.has(i.serialNumber) &&
        (!cleanPiFilter || (i.piNumber && i.piNumber.replace(/^STK-/i, "").trim().toLowerCase() === cleanPiFilter) || (i.piId && i.piId.replace(/^STK-/i, "").trim().toLowerCase() === cleanPiFilter)) &&
        (!cleanPosFilter || String(i.posNo).trim().toLowerCase() === cleanPosFilter)
    );

    waitingColourPanes.forEach((col) => {
      if (usedSerials.has(col.serialNumber)) return;

      const match = availableLamPanes.find(
        (lam) => !usedSerials.has(lam.serialNumber) && isDlguStickerPairMatch(col, lam)
      );

      if (match) {
        usedSerials.add(col.serialNumber);
        usedSerials.add(match.serialNumber);

        // If match has a lamPairId, find any sibling panes with the same lamPairId and advance them together.
        // Fallback: if lamPairId was cleared during an OP rejection, find the sibling clear pane by
        // positional match (same posNo + dimensions + PI + DguPairing phase) so both clears always
        // advance to DGU together with the remade colour pane.
        const matchPairId = (match as any).lamPairId;
        let siblingPanes: typeof availableLamPanes = matchPairId
          ? availableLamPanes.filter(
              (p) => (p as any).lamPairId === matchPairId && p.serialNumber !== match.serialNumber && !usedSerials.has(p.serialNumber)
            )
          : [];
        // Positional fallback: pick up the second clear pane that shares posNo+dimensions when
        // lamPairId is absent (e.g. deleted during prior OP rejection un-linking).
        if (siblingPanes.length === 0) {
          siblingPanes = availableLamPanes.filter(
            (p) =>
              !usedSerials.has(p.serialNumber) &&
              p.serialNumber !== match.serialNumber &&
              (p.colorOrClear === "Clear" || /clear/i.test(`${p.glassType || ""} ${p.category || ""}`)) &&
              (p.dlguPhase === "DguPairing" || p.completedStages?.includes("Lamination")) &&
              String(p.posNo || "").trim() === String(match.posNo || "").trim() &&
              Math.abs((p.width || 0) - (match.width || 0)) < 2 &&
              Math.abs((p.height || 0) - (match.height || 0)) < 2 &&
              (
                (match.piId && p.piId === match.piId) ||
                (match.piNumber && p.piNumber === match.piNumber) ||
                (match.orderNo && p.orderNo === match.orderNo) ||
                (match.obNo && p.obNo === match.obNo)
              )
          );
        }

        const dguPairId = `dgu-${col.serialNumber}-${match.serialNumber}`;
        (col as any).dguPairId = dguPairId;
        (match as any).dguPairId = dguPairId;

        siblingPanes.forEach((sib) => {
          (sib as any).dguPairId = dguPairId;
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
          operator: operator,
          timestamp: new Date().toISOString(),
          remarks: `[DLGU Phase 2] Manually paired with Laminated Clear Pane ${match.serialNumber} (${match.barcode}) and advanced to DGU Assembly Line`,
        });

        productionHistoryDatabase.unshift({
          id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          serialNumber: match.serialNumber,
          barcode: match.barcode,
          piNumber: match.piNumber,
          stage: "Pairing",
          status: "Completed",
          operator: operator,
          timestamp: new Date().toISOString(),
          remarks: `[DLGU Phase 2] Manually paired with Colour Pane ${col.serialNumber} (${col.barcode}) and advanced to DGU Assembly Line`,
        });

        advancedCount += 2 + siblingPanes.length;
        logger.info(`[DLGU Phase 2] Manually paired Colour ${col.serialNumber} + Laminated Clear ${match.serialNumber} -> Advanced to DGU!`);
      }
    });
  }

  if (advancedCount > 0) {
    saveDatabaseToDisk();
  }

  return advancedCount;
}

export const handlePairDlgu: RequestHandler = (req, res) => {
  const { posNo, piNumber, operator } = req.body || {};
  const cleanOperator = sanitizeString(operator || (req as any).user?.username || "Operator", 100);
  const phase1Count = autoAdvancePairedDlguItems(posNo, piNumber);
  const phase2Count = manualPairDlguPhase2Items(posNo, piNumber, cleanOperator);
  const advancedCount = phase1Count + phase2Count;
  if (advancedCount > 0) {
    broadcastUpdate("stage_advanced", { count: advancedCount });
    createAndBroadcastNotification({
      title: "DLGU Pairing Completed",
      message: `Paired ${advancedCount / 2} DLGU set(s) (${advancedCount} panes) and advanced to production lines`,
      category: "STAGE_ADVANCE",
      type: "success",
      stage: phase2Count > 0 ? "DGU" : "Lamination",
      operator: cleanOperator,
    });
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
 * Advances all DLGU items that have completed Lamination into Glass Pairing & Buffer (Phase 2),
 * where they wait for manual pairing with Colour glass.
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

  // Now that items are sent from Lamination, auto-pair with waiting Colour glass in Pairing Buffer
  const pairedCount = manualPairDlguPhase2Items();
  saveDatabaseToDisk();
  broadcastUpdate("stage_advanced", { count: movedCount + pairedCount });
  createAndBroadcastNotification({
    title: "DLGU Sent from Lamination",
    message: `Sent ${movedCount} laminated pane(s) from Lamination.${pairedCount > 0 ? ` Paired ${pairedCount / 2} DLGU set(s) to DGU.` : " Staged in Pairing Buffer."}`,
    category: "STAGE_ADVANCE",
    type: "success",
    stage: "Pairing",
    operator: (req as any).user?.username || "Lamination Station",
  });

  res.json({
    success: true,
    message: `Sent ${movedCount} laminated pane(s) from Lamination.${pairedCount > 0 ? ` Paired ${pairedCount / 2} DLGU set(s) to DGU.` : " Staged in Pairing Buffer."}`,
    movedCount,
    pairedSets: pairedCount / 2,
    advancedPanes: movedCount + pairedCount,
  });
};

// Reject item with reason (supports single item or paired DLGU / Lamination / DGU assembly)
// Reject item with reason (supports single piece before pairing, or strictly 1 paired unit after pairing)
export const handleRejectItem: RequestHandler = (req, res) => {
  const {
    serialNumber,
    serialNumbers,
    piNumber,
    reason,
    defectStation,
    defectivePane,
    defectiveSerialNumber,
    autoRework = true,
    reworkTargetStage = "Cutting",
    operator = "Operator",
  } = req.body;
  const cleanReason = sanitizeString(reason, 500);
  const cleanOperator = sanitizeString(operator || "Operator", 100);
  const cleanDefectStation = defectStation ? sanitizeString(defectStation, 100) : undefined;

  if ((!serialNumber && (!serialNumbers || !Array.isArray(serialNumbers) || serialNumbers.length === 0)) || !cleanReason) {
    res.status(400).json({ message: "serialNumber and reason are required" });
    return;
  }

  // 1. Collect requested serials
  const requestedSerials = new Set<string>();
  const isExplicitList = Array.isArray(serialNumbers) && serialNumbers.length > 0;
  if (isExplicitList) {
    serialNumbers.forEach((s) => requestedSerials.add(String(s).trim()));
  } else if (serialNumber) {
    requestedSerials.add(String(serialNumber).trim());
  }

  // 2. Identify initial target items
  const targetItems: GlassItem[] = [];
  glassItemsDatabase.forEach((g) => {
    if (requestedSerials.has(g.serialNumber) || requestedSerials.has(g.barcode)) {
      if (!targetItems.some((t) => t.id === g.id || t.serialNumber === g.serialNumber)) {
        targetItems.push(g);
      }
    }
  });

  if (targetItems.length === 0) {
    res.status(404).json({ message: "Glass item(s) not found" });
    return;
  }

  // Check if any target item is already completed at Finished stage
  // Items at Finished / Completed stage (e.g. broken during transit / customer delivery) can be rejected
  // 3. Partner Detection Rules:
  // RULE A: If singlePaneOnly is true or defectivePane is a specific pane (OP, IP, IP_PLY1, IP_PLY2, PRIMARY, PARTNER),
  //         reject ONLY that single piece. The good partner remains intact in the pairing buffer.
  // RULE B: If defectivePane is BOTH_CLEAR / BOTH_IP, reject both clear float panes (IP 1 + IP 2), while the Colour OP remains intact in pairing buffer.
  // RULE C: If defectivePane is ASSEMBLY / UNIT / WHOLE_UNIT, reject the whole paired assembly (all panes).
  const isBothClear =
    defectivePane === "BOTH_CLEAR" ||
    defectivePane === "BOTH_IP" ||
    defectivePane === "IP_BOTH";

  const isAssemblyReject =
    !req.body.singlePaneOnly &&
    !isBothClear &&
    (defectivePane === "ASSEMBLY" ||
      defectivePane === "UNIT" ||
      defectivePane === "WHOLE_UNIT" ||
      defectivePane === "WHOLE" ||
      !defectivePane ||
      (isExplicitList && targetItems.length > 1));

  let itemsToReject: GlassItem[] = targetItems;
  if (isBothClear) {
    let clears = targetItems.filter(
      (t) => t.colorOrClear === "Clear" || /clear/i.test(`${t.glassType || ""} ${t.category || ""}`)
    );
    if (clears.length === 0 && targetItems.length > 0) {
      const baseItem = targetItems[0];
      const dguPairId = (baseItem as any).dguPairId;
      if (dguPairId) {
        clears = glassItemsDatabase.filter(
          (o) =>
            (o as any).dguPairId === dguPairId &&
            o.id !== baseItem.id &&
            o.status !== "Rejected" &&
            (o.colorOrClear === "Clear" || /clear/i.test(`${o.glassType || ""} ${o.category || ""}`))
        );
      }
      if (clears.length === 0) {
        clears = glassItemsDatabase.filter(
          (o) =>
            o.id !== baseItem.id &&
            o.status !== "Rejected" &&
            o.posNo === baseItem.posNo &&
            Math.abs((o.width || 0) - (baseItem.width || 0)) < 2 &&
            Math.abs((o.height || 0) - (baseItem.height || 0)) < 2 &&
            (
              (baseItem.piId && o.piId === baseItem.piId) ||
              (baseItem.piNumber && o.piNumber === baseItem.piNumber) ||
              (baseItem.sfoNo && o.sfoNo === baseItem.sfoNo) ||
              (baseItem.orderNo && o.orderNo === baseItem.orderNo) ||
              (baseItem.obNo && o.obNo === baseItem.obNo)
            ) &&
            (o.colorOrClear === "Clear" || /clear/i.test(`${o.glassType || ""} ${o.category || ""}`))
        ).slice(0, 2);
      }
    }

    if (clears.length === 1) {
      const firstClear = clears[0];
      const lamPairId = (firstClear as any).lamPairId;
      let secondClear: GlassItem | undefined = undefined;
      if (lamPairId) {
        secondClear = glassItemsDatabase.find(
          (o) => (o as any).lamPairId === lamPairId && o.id !== firstClear.id && o.status !== "Rejected"
        );
      }
      if (!secondClear) {
        secondClear = glassItemsDatabase.find(
          (o) =>
            o.id !== firstClear.id &&
            o.status !== "Rejected" &&
            o.posNo === firstClear.posNo &&
            Math.abs((o.width || 0) - (firstClear.width || 0)) < 2 &&
            Math.abs((o.height || 0) - (firstClear.height || 0)) < 2 &&
            (
              (firstClear.piId && o.piId === firstClear.piId) ||
              (firstClear.piNumber && o.piNumber === firstClear.piNumber) ||
              (firstClear.sfoNo && o.sfoNo === firstClear.sfoNo) ||
              (firstClear.orderNo && o.orderNo === firstClear.orderNo) ||
              (firstClear.obNo && o.obNo === firstClear.obNo)
            ) &&
            (o.colorOrClear === "Clear" || /clear/i.test(`${o.glassType || ""} ${o.category || ""}`))
        );
      }
      if (secondClear && !clears.some((c) => c.id === secondClear!.id)) {
        clears.push(secondClear);
      }
    }

    itemsToReject = clears.length > 0 ? clears : targetItems;
  } else if (!isAssemblyReject && targetItems.length > 1) {
    if (defectiveSerialNumber) {
      const match = targetItems.find(
        (t) => t.serialNumber === defectiveSerialNumber || t.barcode === defectiveSerialNumber
      );
      if (match) itemsToReject = [match];
    } else if (defectivePane === "OP") {
      const op = targetItems.find((t) => t.colorOrClear === "Colour" || COLOURED_COATED_GLASS_REGEX.test(`${t.glassType || ""} ${t.category || ""}`));
      if (op) itemsToReject = [op];
    } else if (defectivePane === "IP" || defectivePane === "IP_PLY1" || defectivePane === "IP_PLY2") {
      const ip = targetItems.find((t) => t.colorOrClear === "Clear" || /clear/i.test(`${t.glassType || ""} ${t.category || ""}`));
      if (ip) itemsToReject = [ip];
    } else {
      itemsToReject = [targetItems[0]];
    }
  }

  const partnerItems: GlassItem[] = [];
  const allUnlinkedPartners: GlassItem[] = [];

  if (isAssemblyReject) {
    if (!isExplicitList || itemsToReject.length === 1) {
      itemsToReject.forEach((item) => {
        // Before pairing (Cutting stage): strictly single piece only!
        if (item.currentStage === "Cutting") {
          return;
        }

        if (isDlguItem(item) && item.currentStage !== "Lamination") {
          // DLGU 3-pane assembly rejection: must reject all remaining panes of this unit
          const lamPairId = (item as any).lamPairId;
          const dguPairId = (item as any).dguPairId;
          const dlguPartners: GlassItem[] = [];
          if (lamPairId) {
            const lamPartner = glassItemsDatabase.find(
              (o) => (o as any).lamPairId === lamPairId && o.id !== item.id && o.status !== "Rejected"
            );
            if (lamPartner) dlguPartners.push(lamPartner);
          }
          if (dguPairId) {
            const dguPartners = glassItemsDatabase.filter(
              (o) => (o as any).dguPairId === dguPairId && o.id !== item.id && o.status !== "Rejected"
            );
            dguPartners.forEach((dp) => {
              if (!dlguPartners.some((p) => p.id === dp.id)) dlguPartners.push(dp);
            });
          }
          const isItemColour = item.colorOrClear === "Colour" || COLOURED_COATED_GLASS_REGEX.test(`${item.glassType || ""} ${item.category || ""}`);
          const neededClearCount = isItemColour ? 2 : 1;
          const neededColourCount = isItemColour ? 0 : 1;
          const currentClearCount = dlguPartners.filter((p) => p.colorOrClear === "Clear" || /clear/i.test(`${p.glassType || ""} ${p.category || ""}`)).length;
          const currentColourCount = dlguPartners.filter((p) => p.colorOrClear === "Colour" || COLOURED_COATED_GLASS_REGEX.test(`${p.glassType || ""} ${p.category || ""}`)).length;

          if (currentClearCount < neededClearCount || currentColourCount < neededColourCount) {
            const siblings = glassItemsDatabase.filter(
              (o) =>
                o.id !== item.id &&
                o.status !== "Rejected" &&
                o.posNo === item.posNo &&
                Math.abs((o.width || 0) - (item.width || 0)) < 2 &&
                Math.abs((o.height || 0) - (item.height || 0)) < 2 &&
                (
                  (item.piId && o.piId === item.piId) ||
                  (item.piNumber && o.piNumber === item.piNumber) ||
                  (item.sfoNo && o.sfoNo === item.sfoNo) ||
                  (item.orderNo && o.orderNo === item.orderNo) ||
                  (item.obNo && o.obNo === item.obNo)
                ) &&
                !itemsToReject.some((t) => t.id === o.id) &&
                !partnerItems.some((p) => p.id === o.id) &&
                !dlguPartners.some((p) => p.id === o.id)
            );

            if (currentClearCount < neededClearCount) {
              const missingClears = siblings
                .filter((s) => s.colorOrClear === "Clear" || /clear/i.test(`${s.glassType || ""} ${s.category || ""}`))
                .slice(0, neededClearCount - currentClearCount);
              dlguPartners.push(...missingClears);
            }
            if (currentColourCount < neededColourCount) {
              const missingColour = siblings.find(
                (s) => s.colorOrClear === "Colour" || COLOURED_COATED_GLASS_REGEX.test(`${s.glassType || ""} ${s.category || ""}`)
              );
              if (missingColour) dlguPartners.push(missingColour);
            }
          }

          dlguPartners.forEach((p) => {
            if (!itemsToReject.some((t) => t.id === p.id) && !partnerItems.some((pi) => pi.id === p.id)) {
              partnerItems.push(p);
            }
          });
        } else {
          const itemLamPairId = (item as any).lamPairId;
          const itemDguPairId = (item as any).dguPairId;

          // 1. Matched by unique lamPairId (stamped during pairing)
          if (itemLamPairId) {
            const partner = glassItemsDatabase.find(
              (other) =>
                (other as any).lamPairId === itemLamPairId &&
                other.id !== item.id &&
                other.status !== "Rejected" &&
                !itemsToReject.some((t) => t.id === other.id) &&
                !partnerItems.some((p) => p.id === other.id)
            );
            if (partner) partnerItems.push(partner);
          }
          // 2. Matched by unique dguPairId
          else if (itemDguPairId) {
            const partner = glassItemsDatabase.find(
              (other) =>
                (other as any).dguPairId === itemDguPairId &&
                other.id !== item.id &&
                other.status !== "Rejected" &&
                !itemsToReject.some((t) => t.id === other.id) &&
                !partnerItems.some((p) => p.id === other.id)
            );
            if (partner) partnerItems.push(partner);
          }
          // 3. Fallback for Lamination stage (find ONLY 1 matching partner pane)
          else if (item.currentStage === "Lamination") {
            const partner = glassItemsDatabase.find(
              (other) =>
                other.id !== item.id &&
                other.status !== "Rejected" &&
                other.currentStage === "Lamination" &&
                isLaminationItem(other) &&
                isLaminationStickerPairMatch(item, other) &&
                !itemsToReject.some((t) => t.id === other.id) &&
                !partnerItems.some((p) => p.id === other.id)
            );
            if (partner) partnerItems.push(partner);
          }
          // 4. Fallback for DGU stage (find ONLY 1 matching partner pane)
          else if (item.currentStage === "DGU") {
            const partner = glassItemsDatabase.find(
              (other) =>
                other.id !== item.id &&
                other.status !== "Rejected" &&
                other.currentStage === "DGU" &&
                isStickerPairMatch(item, other) &&
                !itemsToReject.some((t) => t.id === other.id) &&
                !partnerItems.some((p) => p.id === other.id)
            );
            if (partner) partnerItems.push(partner);
          }
          // 5. Fallback for Finished stage
          else if (item.currentStage === "Finished") {
            const partner = glassItemsDatabase.find(
              (other) =>
                other.id !== item.id &&
                other.status !== "Rejected" &&
                (other.currentStage === "Finished" || other.status === "Completed") &&
                (isLaminationItem(item)
                  ? isLaminationItem(other) && isLaminationStickerPairMatch(item, other)
                  : isStickerPairMatch(item, other)) &&
                !itemsToReject.some((t) => t.id === other.id) &&
                !partnerItems.some((p) => p.id === other.id)
            );
            if (partner) partnerItems.push(partner);
          }
        }
      });
    }
  } else {
    // Single pane rejection: strictly un-link ONLY the surviving partner panes of THIS SINGLE UNIT (not the entire batch/position)
    itemsToReject.forEach((item) => {
      const itemLamPairId = (item as any).lamPairId;
      const itemDguPairId = (item as any).dguPairId;
      const partners: GlassItem[] = [];

      if (isDlguItem(item)) {
        const isItemColour = item.colorOrClear === "Colour" || COLOURED_COATED_GLASS_REGEX.test(`${item.glassType || ""} ${item.category || ""}`);
        if (isItemColour) {
          // Rejection on Colour pane (OP): un-link at most 2 Clear partner panes (IP 1 + IP 2)
          const dguPairId = (item as any).dguPairId;
          let clearPartners: GlassItem[] = [];
          if (dguPairId) {
            clearPartners = glassItemsDatabase.filter(
              (other) => (other as any).dguPairId === dguPairId && other.id !== item.id && other.status !== "Rejected"
            );
          }
          if (clearPartners.length === 0) {
            clearPartners = glassItemsDatabase.filter(
              (other) =>
                other.id !== item.id &&
                other.status !== "Rejected" &&
                other.posNo === item.posNo &&
                Math.abs((other.width || 0) - (item.width || 0)) < 2 &&
                Math.abs((other.height || 0) - (item.height || 0)) < 2 &&
                (
                  (item.piId && other.piId === item.piId) ||
                  (item.piNumber && other.piNumber === item.piNumber) ||
                  (item.sfoNo && other.sfoNo === item.sfoNo) ||
                  (item.orderNo && other.orderNo === item.orderNo) ||
                  (item.obNo && other.obNo === item.obNo)
                ) &&
                (other.colorOrClear === "Clear" || /clear/i.test(`${other.glassType || ""} ${other.category || ""}`))
            ).slice(0, 2);
          }
          partners.push(...clearPartners);
        } else {
          // Rejection on Clear pane (IP 1, IP 2, or BOTH_CLEAR): un-link surviving partner panes
          const lamPairId = (item as any).lamPairId;
          const dguPairId = (item as any).dguPairId;
          
          let partnerClear: GlassItem | undefined = undefined;
          if (!isBothClear && lamPairId) {
            partnerClear = glassItemsDatabase.find(
              (other) =>
                (other as any).lamPairId === lamPairId &&
                other.id !== item.id &&
                other.status !== "Rejected" &&
                !itemsToReject.some((t) => t.id === other.id)
            );
          }
          let partnerColour: GlassItem | undefined = undefined;
          if (dguPairId) {
            partnerColour = glassItemsDatabase.find(
              (other) =>
                (other as any).dguPairId === dguPairId &&
                other.id !== item.id &&
                other.status !== "Rejected" &&
                !itemsToReject.some((t) => t.id === other.id)
            );
          }

          // Fallback sibling search for Finished / Staged units
          const siblings = glassItemsDatabase.filter(
            (other) =>
              other.id !== item.id &&
              other.status !== "Rejected" &&
              other.posNo === item.posNo &&
              Math.abs((other.width || 0) - (item.width || 0)) < 2 &&
              Math.abs((other.height || 0) - (item.height || 0)) < 2 &&
              (
                (item.piId && other.piId === item.piId) ||
                (item.piNumber && other.piNumber === item.piNumber) ||
                (item.sfoNo && other.sfoNo === item.sfoNo) ||
                (item.orderNo && other.orderNo === item.orderNo) ||
                (item.obNo && other.obNo === item.obNo)
              ) &&
              !itemsToReject.some((t) => t.id === other.id)
          );

          if (!isBothClear && !partnerClear) {
            partnerClear = siblings.find(
              (s) =>
                (s.colorOrClear === "Clear" || /clear/i.test(`${s.glassType || ""} ${s.category || ""}`)) &&
                s.id !== item.id &&
                !partners.some((p) => p.id === s.id) &&
                !itemsToReject.some((t) => t.id === s.id)
            );
          }
          if (!partnerColour) {
            partnerColour = siblings.find(
              (s) =>
                (s.colorOrClear === "Colour" || COLOURED_COATED_GLASS_REGEX.test(`${s.glassType || ""} ${s.category || ""}`)) &&
                !partners.some((p) => p.id === s.id) &&
                !itemsToReject.some((t) => t.id === s.id)
            );
          }

          if (!isBothClear && partnerClear) partners.push(partnerClear);
          if (partnerColour) partners.push(partnerColour);
        }
      } else if (isLaminationItem(item)) {
        const itemLamPairId = (item as any).lamPairId;
        if (itemLamPairId) {
          const p = glassItemsDatabase.find(
            (other) => (other as any).lamPairId === itemLamPairId && other.id !== item.id && other.status !== "Rejected"
          );
          if (p) partners.push(p);
        } else {
          const clearPartner = glassItemsDatabase.find(
            (other) =>
              other.id !== item.id &&
              other.status !== "Rejected" &&
              other.posNo === item.posNo &&
              Math.abs((other.width || 0) - (item.width || 0)) < 2 &&
              Math.abs((other.height || 0) - (item.height || 0)) < 2 &&
              (
                (item.piId && other.piId === item.piId) ||
                (item.piNumber && other.piNumber === item.piNumber) ||
                (item.sfoNo && other.sfoNo === item.sfoNo) ||
                (item.orderNo && other.orderNo === item.orderNo) ||
                (item.obNo && other.obNo === item.obNo)
              )
          );
          if (clearPartner) partners.push(clearPartner);
        }
      } else {
        // Standard DGU (1+1): un-link 1 opposite finish partner pane
        const itemDguPairId = (item as any).dguPairId;
        if (itemDguPairId) {
          const p = glassItemsDatabase.find(
            (other) => (other as any).dguPairId === itemDguPairId && other.id !== item.id && other.status !== "Rejected"
          );
          if (p) partners.push(p);
        } else {
          const isItemColour = item.colorOrClear === "Colour" || COLOURED_COATED_GLASS_REGEX.test(`${item.glassType || ""} ${item.category || ""}`);
          const siblings = glassItemsDatabase.filter(
            (other) =>
              other.id !== item.id &&
              other.status !== "Rejected" &&
              other.posNo === item.posNo &&
              Math.abs((other.width || 0) - (item.width || 0)) < 2 &&
              Math.abs((other.height || 0) - (item.height || 0)) < 2 &&
              (
                (item.piId && other.piId === item.piId) ||
                (item.piNumber && other.piNumber === item.piNumber) ||
                (item.sfoNo && other.sfoNo === item.sfoNo) ||
                (item.orderNo && other.orderNo === item.orderNo) ||
                (item.obNo && other.obNo === item.obNo)
              )
          );
          const oppositePartner = siblings.find((s) => {
            const isOtherColour = s.colorOrClear === "Colour" || COLOURED_COATED_GLASS_REGEX.test(`${s.glassType || ""} ${s.category || ""}`);
            return isOtherColour !== isItemColour;
          });
          if (oppositePartner) partners.push(oppositePartner);
        }
      }

      const isOpRejectionContext = defectivePane === "OP" ||
        (itemsToReject.length > 0 && (itemsToReject[0].colorOrClear === "Colour" ||
          COLOURED_COATED_GLASS_REGEX.test(
            `${itemsToReject[0].glassType || ""} ${itemsToReject[0].category || ""}`
          )));
      partners.forEach((partner) => {
        // For OP rejection: preserve lamPairId so the two surviving clears remain linked
        // and Phase 2 sibling scan can collect both into DGU together.
        // Only dguPairId needs to be cleared (that's the trio bond that's now broken).
        if (isOpRejectionContext) {
          delete (partner as any).dguPairId;
        } else {
          delete (partner as any).lamPairId;
          delete (partner as any).dguPairId;
        }
        partner.currentStage = "Pairing";
        partner.status = "Pending";
        partner.updatedAt = new Date().toISOString();
        if (isDlguItem(partner)) {
          const isColour = partner.colorOrClear === "Colour" || COLOURED_COATED_GLASS_REGEX.test(`${partner.glassType || ""} ${partner.category || ""}`);
          if (isColour) {
            partner.dlguPhase = "DguPairing";
            partner.completedStages = (partner.completedStages || []).filter(
              (s: string) => s !== "DGU" && s !== "Pairing" && s !== "Finished"
            );
            if (!partner.completedStages.includes("Cutting")) {
              partner.completedStages.push("Cutting");
            }
          } else {
            // Surviving Clear pane:
            // If the rejection was on Colour pane (OP) and this Clear pane already completed Lamination,
            // it stays intact in Phase 2 (DguPairing) waiting for the remade Colour pane!
            // Only if a single Clear pane was rejected does this Clear pane need to re-pair in Phase 1 (LamPairing).
            const isOpRejection = defectivePane === "OP";
            if (isOpRejection && partner.completedStages?.includes("Lamination")) {
              partner.dlguPhase = "DguPairing";
              partner.completedStages = (partner.completedStages || []).filter(
                (s: string) => s !== "DGU" && s !== "Pairing" && s !== "Finished"
              );
            } else {
              partner.dlguPhase = "LamPairing";
              partner.completedStages = (partner.completedStages || []).filter(
                (s: string) => s !== "Lamination" && s !== "DGU" && s !== "Pairing" && s !== "Finished"
              );
            }
          }
        }
      });
      allUnlinkedPartners.push(...partners);
    });
  }

  const allItemsToReject = [...itemsToReject, ...partnerItems];
  const rejectEntries: RejectRecord[] = [];
  const reworkEntries: ReworkRecord[] = [];

  allItemsToReject.forEach((targetItem) => {
    delete (targetItem as any).lamPairId;
    delete (targetItem as any).dguPairId;
    const prevStage = targetItem.currentStage;
    const finalPiNumber = sanitizeString(piNumber || targetItem.piNumber, 100);

    const rejectEntry: RejectRecord = {
      id: `rej-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      serialNumber: targetItem.serialNumber,
      barcode: targetItem.barcode,
      piNumber: finalPiNumber,
      stage: prevStage,
      defectStation: cleanDefectStation,
      reason: cleanReason,
      defectivePane: defectivePane ? String(defectivePane) : undefined,
      defectiveSerialNumber: defectiveSerialNumber ? String(defectiveSerialNumber) : undefined,
      partnerSerialNumber: allItemsToReject.find((other) => other.serialNumber !== targetItem.serialNumber)?.serialNumber,
      date: new Date().toISOString(),
      operator: cleanOperator,
    };

    rejectDatabase.unshift(rejectEntry);
    rejectEntries.push(rejectEntry);

    const isPairedUnit = allItemsToReject.length > 1;
    const partnerSerialNames = allItemsToReject.map((t) => `#${t.serialNumber}`).join(" + ");

    if (autoRework) {
      const targetStage = (reworkTargetStage as ProductionStage) || "Cutting";
      targetItem.currentStage = targetStage;
      targetItem.status = "Reworking";
      targetItem.completedStages = targetStage === "Cutting" ? [] : targetItem.completedStages.filter((s) => s !== targetStage);
      targetItem.updatedAt = new Date().toISOString();
      if (isDlguItem(targetItem)) {
        const isColour = targetItem.colorOrClear === "Colour" || COLOURED_COATED_GLASS_REGEX.test(`${targetItem.glassType || ""} ${targetItem.category || ""}`);
        if (!isColour) {
          targetItem.dlguPhase = "LamPairing";
        }
      }

      const reworkEntry: ReworkRecord = {
        id: `rew-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        serialNumber: targetItem.serialNumber,
        barcode: targetItem.barcode,
        piNumber: finalPiNumber,
        fromStage: prevStage,
        targetStage: targetStage,
        defectStation: cleanDefectStation,
        reason: `[Auto-Remake after Rejection] ${cleanReason}`,
        defectivePane: defectivePane ? String(defectivePane) : undefined,
        defectiveSerialNumber: defectiveSerialNumber ? String(defectiveSerialNumber) : undefined,
        partnerSerialNumber: allItemsToReject.find((other) => other.serialNumber !== targetItem.serialNumber)?.serialNumber,
        date: new Date().toISOString(),
        operator: cleanOperator,
      };

      reworkDatabase.unshift(reworkEntry);
      reworkEntries.push(reworkEntry);

      productionHistoryDatabase.unshift({
        id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        serialNumber: targetItem.serialNumber,
        barcode: targetItem.barcode,
        piNumber: finalPiNumber,
        itemOrBatch: targetItem.serialNumber,
        action: isPairedUnit ? "Paired Unit Rejected & Dispatched to Remake" : "Item Rejected & Dispatched to Remake",
        prevStatus: prevStage,
        newStatus: "Reworking",
        stage: targetStage,
        status: "Reworking",
        operator: cleanOperator,
        user: cleanOperator,
        timestamp: new Date().toISOString(),
        remarks: isPairedUnit
          ? `Quality rejection for paired assembly (${partnerSerialNames}) at ${prevStage} -> Auto-dispatched Remake to ${targetStage}: ${cleanReason}`
          : `Quality rejection at ${prevStage} -> Auto-dispatched Remake to ${targetStage}: ${cleanReason}`,
      });
    } else {
      targetItem.status = "Rejected";
      targetItem.updatedAt = new Date().toISOString();

      productionHistoryDatabase.unshift({
        id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        serialNumber: targetItem.serialNumber,
        barcode: targetItem.barcode,
        piNumber: finalPiNumber,
        itemOrBatch: targetItem.serialNumber,
        action: isPairedUnit ? "Paired Unit Rejected" : "Item Rejected",
        prevStatus: prevStage,
        newStatus: "Rejected",
        stage: targetItem.currentStage,
        status: "Rejected",
        operator: cleanOperator,
        user: cleanOperator,
        timestamp: new Date().toISOString(),
        remarks: isPairedUnit
          ? `Quality rejection for paired assembly (${partnerSerialNames}) at ${targetItem.currentStage}: ${cleanReason}`
          : `Quality rejection at ${targetItem.currentStage}: ${cleanReason}`,
      });
    }
  });

  // Update parent PI status and counts
  const allAffected = [...allItemsToReject, ...allUnlinkedPartners];
  const affectedPiKeys = new Set(
    allAffected
      .flatMap((i) => [i.piNumber, i.piId])
      .filter(Boolean)
  );
  affectedPiKeys.forEach((piKey) => {
    const parentPi = piDatabase.find((p) => p.id === piKey || p.piNumber === piKey);
    if (parentPi) {
      const piItems = glassItemsDatabase.filter((i) => i.piId === parentPi.id || i.piNumber === parentPi.piNumber);
      const completedItems = piItems.filter((i) => i.status === "Completed").length;
      parentPi.completedItemsCount = completedItems;
      if (piItems.some((i) => i.status !== "Completed")) {
        parentPi.status = "In Production";
      } else if (piItems.length > 0 && piItems.every((i) => i.status === "Completed")) {
        parentPi.status = "Completed";
      }
    }
  });

  saveDatabaseToDisk();
  broadcastUpdate("item_rejected", {
    serialNumber: allItemsToReject[0].serialNumber,
    serialNumbers: allItemsToReject.map((t) => t.serialNumber),
    count: allItemsToReject.length,
    stage: allItemsToReject[0].currentStage,
    reason: cleanReason,
  });

  if (autoRework) {
    broadcastUpdate("item_reworked", {
      serialNumber: allItemsToReject[0].serialNumber,
      serialNumbers: allItemsToReject.map((t) => t.serialNumber),
      targetStage: reworkTargetStage || "Cutting",
      reason: cleanReason,
    });
  }

  const isPair = allItemsToReject.length > 1;
  const serialList = allItemsToReject.map((t) => `#${t.serialNumber}`).join(", ");
  createAndBroadcastNotification({
    title: isPair
      ? autoRework
        ? `Quality Reject & Auto-Remake: Paired Unit (${serialList})`
        : `Quality Reject: Paired Unit (${serialList})`
      : autoRework
      ? `Quality Reject & Auto-Remake: Item #${allItemsToReject[0].serialNumber}`
      : `Quality Reject: Item #${allItemsToReject[0].serialNumber}`,
    message: isPair
      ? autoRework
        ? `DLGU / Paired unit (${serialList}) rejected at ${allItemsToReject[0].currentStage} -> Remake auto-routed to ${reworkTargetStage || "Cutting"} by ${cleanOperator}. Reason: ${cleanReason}`
        : `DLGU / Paired unit (${serialList}) marked as REJECTED at ${allItemsToReject[0].currentStage} by ${cleanOperator}. Reason: ${cleanReason}`
      : autoRework
      ? `Rejected at ${allItemsToReject[0].currentStage} -> Remake auto-routed to ${reworkTargetStage || "Cutting"} by ${cleanOperator}. Reason: ${cleanReason}`
      : `Rejected at ${allItemsToReject[0].currentStage} by ${cleanOperator}. Reason: ${cleanReason}`,
    category: autoRework ? "REWORK" : "REJECTION",
    type: autoRework ? "warning" : "destructive",
    stage: autoRework ? reworkTargetStage || "Cutting" : allItemsToReject[0].currentStage,
    serialNumber: allItemsToReject[0].serialNumber,
    piNumber: allItemsToReject[0].piNumber,
    operator: cleanOperator,
  });

  res.json({
    message: isPair
      ? autoRework
        ? `Paired unit (${serialList}) marked as rejected & auto-routed to ${reworkTargetStage || "Cutting"} for remake`
        : `Paired unit (${serialList}) marked as rejected`
      : autoRework
      ? `Item ${allItemsToReject[0].serialNumber} marked as rejected & auto-routed to ${reworkTargetStage || "Cutting"} for remake`
      : `Item ${allItemsToReject[0].serialNumber} marked as rejected`,
    rejectEntries,
    reworkEntries: autoRework ? reworkEntries : undefined,
    items: allItemsToReject,
  });
};

// Send item to rework (supports single piece before pairing, or strictly 1 paired unit after pairing)
export const handleReworkItem: RequestHandler = (req, res) => {
  const {
    serialNumber,
    serialNumbers,
    piNumber,
    targetStage,
    defectStation,
    reason,
    defectivePane,
    defectiveSerialNumber,
    operator = "Operator",
  } = req.body;
  const cleanReason = sanitizeString(reason, 500);
  const cleanOperator = sanitizeString(operator || "Operator", 100);
  const cleanDefectStation = defectStation ? sanitizeString(defectStation, 100) : undefined;

  if ((!serialNumber && (!serialNumbers || !Array.isArray(serialNumbers) || serialNumbers.length === 0)) || !targetStage || !cleanReason) {
    res.status(400).json({ message: "serialNumber, targetStage, and reason are required" });
    return;
  }

  // 1. Collect requested serials
  const requestedSerials = new Set<string>();
  const isExplicitList = Array.isArray(serialNumbers) && serialNumbers.length > 0;
  if (isExplicitList) {
    serialNumbers.forEach((s) => requestedSerials.add(String(s).trim()));
  } else if (serialNumber) {
    requestedSerials.add(String(serialNumber).trim());
  }

  // 2. Identify initial target items
  const targetItems: GlassItem[] = [];
  glassItemsDatabase.forEach((g) => {
    if (requestedSerials.has(g.serialNumber) || requestedSerials.has(g.barcode)) {
      if (!targetItems.some((t) => t.id === g.id || t.serialNumber === g.serialNumber)) {
        targetItems.push(g);
      }
    }
  });

  if (targetItems.length === 0) {
    res.status(404).json({ message: "Glass item(s) not found" });
    return;
  }

  // 3. Partner Detection Rules:
  // RULE A: If singlePaneOnly is true or defectivePane is a specific pane (OP, IP, IP_PLY1, IP_PLY2, PRIMARY, PARTNER),
  //         rework ONLY that single piece. The good partner remains intact in the pairing buffer.
  // RULE B: If defectivePane is BOTH_CLEAR / BOTH_IP, rework both clear float panes (IP 1 + IP 2), while the Colour OP remains intact in pairing buffer.
  // RULE C: If defectivePane is ASSEMBLY / UNIT / WHOLE_UNIT, rework the whole paired assembly (all panes).
  const isBothClear =
    defectivePane === "BOTH_CLEAR" ||
    defectivePane === "BOTH_IP" ||
    defectivePane === "IP_BOTH";

  const isAssemblyRework =
    !req.body.singlePaneOnly &&
    !isBothClear &&
    (defectivePane === "ASSEMBLY" ||
      defectivePane === "UNIT" ||
      defectivePane === "WHOLE_UNIT" ||
      defectivePane === "WHOLE" ||
      !defectivePane ||
      (isExplicitList && targetItems.length > 1));

  let itemsToRework: GlassItem[] = targetItems;
  if (isBothClear) {
    let clears = targetItems.filter(
      (t) => t.colorOrClear === "Clear" || /clear/i.test(`${t.glassType || ""} ${t.category || ""}`)
    );
    if (clears.length === 0 && targetItems.length > 0) {
      const baseItem = targetItems[0];
      const dguPairId = (baseItem as any).dguPairId;
      if (dguPairId) {
        clears = glassItemsDatabase.filter(
          (o) =>
            (o as any).dguPairId === dguPairId &&
            o.id !== baseItem.id &&
            o.status !== "Rejected" &&
            (o.colorOrClear === "Clear" || /clear/i.test(`${o.glassType || ""} ${o.category || ""}`))
        );
      }
      if (clears.length === 0) {
        clears = glassItemsDatabase.filter(
          (o) =>
            o.id !== baseItem.id &&
            o.status !== "Rejected" &&
            o.posNo === baseItem.posNo &&
            Math.abs((o.width || 0) - (baseItem.width || 0)) < 2 &&
            Math.abs((o.height || 0) - (baseItem.height || 0)) < 2 &&
            (
              (baseItem.piId && o.piId === baseItem.piId) ||
              (baseItem.piNumber && o.piNumber === baseItem.piNumber) ||
              (baseItem.sfoNo && o.sfoNo === baseItem.sfoNo) ||
              (baseItem.orderNo && o.orderNo === baseItem.orderNo) ||
              (baseItem.obNo && o.obNo === baseItem.obNo)
            ) &&
            (o.colorOrClear === "Clear" || /clear/i.test(`${o.glassType || ""} ${o.category || ""}`))
        ).slice(0, 2);
      }
    }

    if (clears.length === 1) {
      const firstClear = clears[0];
      const lamPairId = (firstClear as any).lamPairId;
      let secondClear: GlassItem | undefined = undefined;
      if (lamPairId) {
        secondClear = glassItemsDatabase.find(
          (o) => (o as any).lamPairId === lamPairId && o.id !== firstClear.id && o.status !== "Rejected"
        );
      }
      if (!secondClear) {
        secondClear = glassItemsDatabase.find(
          (o) =>
            o.id !== firstClear.id &&
            o.status !== "Rejected" &&
            o.posNo === firstClear.posNo &&
            Math.abs((o.width || 0) - (firstClear.width || 0)) < 2 &&
            Math.abs((o.height || 0) - (firstClear.height || 0)) < 2 &&
            (
              (firstClear.piId && o.piId === firstClear.piId) ||
              (firstClear.piNumber && o.piNumber === firstClear.piNumber) ||
              (firstClear.sfoNo && o.sfoNo === firstClear.sfoNo) ||
              (firstClear.orderNo && o.orderNo === firstClear.orderNo) ||
              (firstClear.obNo && o.obNo === firstClear.obNo)
            ) &&
            (o.colorOrClear === "Clear" || /clear/i.test(`${o.glassType || ""} ${o.category || ""}`))
        );
      }
      if (secondClear && !clears.some((c) => c.id === secondClear!.id)) {
        clears.push(secondClear);
      }
    }

    itemsToRework = clears.length > 0 ? clears : targetItems;
  } else if (!isAssemblyRework && targetItems.length > 1) {
    if (defectiveSerialNumber) {
      const match = targetItems.find(
        (t) => t.serialNumber === defectiveSerialNumber || t.barcode === defectiveSerialNumber
      );
      if (match) itemsToRework = [match];
    } else if (defectivePane === "OP") {
      const op = targetItems.find((t) => t.colorOrClear === "Colour" || COLOURED_COATED_GLASS_REGEX.test(`${t.glassType || ""} ${t.category || ""}`));
      if (op) itemsToRework = [op];
    } else if (defectivePane === "IP" || defectivePane === "IP_PLY1" || defectivePane === "IP_PLY2") {
      const ip = targetItems.find((t) => t.colorOrClear === "Clear" || /clear/i.test(`${t.glassType || ""} ${t.category || ""}`));
      if (ip) itemsToRework = [ip];
    } else {
      itemsToRework = [targetItems[0]];
    }
  }

  const partnerItems: GlassItem[] = [];
  const allUnlinkedPartners: GlassItem[] = [];

  if (isAssemblyRework) {
    if (!isExplicitList || itemsToRework.length === 1) {
      itemsToRework.forEach((item) => {
        if (item.currentStage === "Cutting") {
          return;
        }

        if (isDlguItem(item) && item.currentStage !== "Lamination") {
          // DLGU 3-pane assembly rework: must rework all remaining panes of this unit
          const lamPairId = (item as any).lamPairId;
          const dguPairId = (item as any).dguPairId;
          const dlguPartners: GlassItem[] = [];
          if (lamPairId) {
            const lamPartner = glassItemsDatabase.find(
              (o) => (o as any).lamPairId === lamPairId && o.id !== item.id && o.status !== "Rejected"
            );
            if (lamPartner) dlguPartners.push(lamPartner);
          }
          if (dguPairId) {
            const dguPartners = glassItemsDatabase.filter(
              (o) => (o as any).dguPairId === dguPairId && o.id !== item.id && o.status !== "Rejected"
            );
            dguPartners.forEach((dp) => {
              if (!dlguPartners.some((p) => p.id === dp.id)) dlguPartners.push(dp);
            });
          }
          const isItemColour = item.colorOrClear === "Colour" || COLOURED_COATED_GLASS_REGEX.test(`${item.glassType || ""} ${item.category || ""}`);
          const neededClearCount = isItemColour ? 2 : 1;
          const neededColourCount = isItemColour ? 0 : 1;
          const currentClearCount = dlguPartners.filter((p) => p.colorOrClear === "Clear" || /clear/i.test(`${p.glassType || ""} ${p.category || ""}`)).length;
          const currentColourCount = dlguPartners.filter((p) => p.colorOrClear === "Colour" || COLOURED_COATED_GLASS_REGEX.test(`${p.glassType || ""} ${p.category || ""}`)).length;

          if (currentClearCount < neededClearCount || currentColourCount < neededColourCount) {
            const siblings = glassItemsDatabase.filter(
              (o) =>
                o.id !== item.id &&
                o.status !== "Rejected" &&
                o.posNo === item.posNo &&
                Math.abs((o.width || 0) - (item.width || 0)) < 2 &&
                Math.abs((o.height || 0) - (item.height || 0)) < 2 &&
                (
                  (item.piId && o.piId === item.piId) ||
                  (item.piNumber && o.piNumber === item.piNumber) ||
                  (item.sfoNo && o.sfoNo === item.sfoNo) ||
                  (item.orderNo && o.orderNo === item.orderNo) ||
                  (item.obNo && o.obNo === item.obNo)
                ) &&
                !itemsToRework.some((t) => t.id === o.id) &&
                !partnerItems.some((p) => p.id === o.id) &&
                !dlguPartners.some((p) => p.id === o.id)
            );

            if (currentClearCount < neededClearCount) {
              const missingClears = siblings
                .filter((s) => s.colorOrClear === "Clear" || /clear/i.test(`${s.glassType || ""} ${s.category || ""}`))
                .slice(0, neededClearCount - currentClearCount);
              dlguPartners.push(...missingClears);
            }
            if (currentColourCount < neededColourCount) {
              const missingColour = siblings.find(
                (s) => s.colorOrClear === "Colour" || COLOURED_COATED_GLASS_REGEX.test(`${s.glassType || ""} ${s.category || ""}`)
              );
              if (missingColour) dlguPartners.push(missingColour);
            }
          }

          dlguPartners.forEach((p) => {
            if (!itemsToRework.some((t) => t.id === p.id) && !partnerItems.some((pi) => pi.id === p.id)) {
              partnerItems.push(p);
            }
          });
        } else {
          const itemLamPairId = (item as any).lamPairId;
          const itemDguPairId = (item as any).dguPairId;

          if (itemLamPairId) {
            const partner = glassItemsDatabase.find(
              (other) =>
                (other as any).lamPairId === itemLamPairId &&
                other.id !== item.id &&
                other.status !== "Rejected" &&
                !itemsToRework.some((t) => t.id === other.id) &&
                !partnerItems.some((p) => p.id === other.id)
            );
            if (partner) partnerItems.push(partner);
          } else if (itemDguPairId) {
            const partner = glassItemsDatabase.find(
              (other) =>
                (other as any).dguPairId === itemDguPairId &&
                other.id !== item.id &&
                other.status !== "Rejected" &&
                !itemsToRework.some((t) => t.id === other.id) &&
                !partnerItems.some((p) => p.id === other.id)
            );
            if (partner) partnerItems.push(partner);
          } else if (item.currentStage === "Lamination") {
            const partner = glassItemsDatabase.find(
              (other) =>
                other.id !== item.id &&
                other.status !== "Rejected" &&
                other.currentStage === "Lamination" &&
                isLaminationItem(other) &&
                isLaminationStickerPairMatch(item, other) &&
                !itemsToRework.some((t) => t.id === other.id) &&
                !partnerItems.some((p) => p.id === other.id)
            );
            if (partner) partnerItems.push(partner);
          } else if (item.currentStage === "DGU") {
            const partner = glassItemsDatabase.find(
              (other) =>
                other.id !== item.id &&
                other.status !== "Rejected" &&
                other.currentStage === "DGU" &&
                isStickerPairMatch(item, other) &&
                !itemsToRework.some((t) => t.id === other.id) &&
                !partnerItems.some((p) => p.id === other.id)
            );
            if (partner) partnerItems.push(partner);
          }
        }
      });
    }
  } else {
    // Single pane rework: un-link surviving partner so it returns to pairing buffer waiting for rework to complete
    itemsToRework.forEach((item) => {
      const itemLamPairId = (item as any).lamPairId;
      const itemDguPairId = (item as any).dguPairId;
      const partners: GlassItem[] = [];

      if (isDlguItem(item)) {
        const isItemColour = item.colorOrClear === "Colour" || COLOURED_COATED_GLASS_REGEX.test(`${item.glassType || ""} ${item.category || ""}`);
        if (isItemColour) {
          // Rework on Colour pane (OP): un-link at most 2 Clear partner panes (IP 1 + IP 2)
          const dguPairId = (item as any).dguPairId;
          let clearPartners: GlassItem[] = [];
          if (dguPairId) {
            clearPartners = glassItemsDatabase.filter(
              (other) => (other as any).dguPairId === dguPairId && other.id !== item.id && other.status !== "Rejected"
            );
          }
          if (clearPartners.length === 0) {
            clearPartners = glassItemsDatabase.filter(
              (other) =>
                other.id !== item.id &&
                other.status !== "Rejected" &&
                other.posNo === item.posNo &&
                Math.abs((other.width || 0) - (item.width || 0)) < 2 &&
                Math.abs((other.height || 0) - (item.height || 0)) < 2 &&
                (
                  (item.piId && other.piId === item.piId) ||
                  (item.piNumber && other.piNumber === item.piNumber) ||
                  (item.sfoNo && other.sfoNo === item.sfoNo) ||
                  (item.orderNo && other.orderNo === item.orderNo) ||
                  (item.obNo && other.obNo === item.obNo)
                ) &&
                (other.colorOrClear === "Clear" || /clear/i.test(`${other.glassType || ""} ${other.category || ""}`))
            ).slice(0, 2);
          }
          partners.push(...clearPartners);
        } else {
          // Rework on Clear pane (IP 1, IP 2, or BOTH_CLEAR): un-link surviving partner panes
          const lamPairId = (item as any).lamPairId;
          const dguPairId = (item as any).dguPairId;
          
          let partnerClear: GlassItem | undefined = undefined;
          if (!isBothClear && lamPairId) {
            partnerClear = glassItemsDatabase.find(
              (other) =>
                (other as any).lamPairId === lamPairId &&
                other.id !== item.id &&
                other.status !== "Rejected" &&
                !itemsToRework.some((t) => t.id === other.id)
            );
          }
          let partnerColour: GlassItem | undefined = undefined;
          if (dguPairId) {
            partnerColour = glassItemsDatabase.find(
              (other) =>
                (other as any).dguPairId === dguPairId &&
                other.id !== item.id &&
                other.status !== "Rejected" &&
                !itemsToRework.some((t) => t.id === other.id)
            );
          }

          // Fallback sibling search for Finished / Staged units
          const siblings = glassItemsDatabase.filter(
            (other) =>
              other.id !== item.id &&
              other.status !== "Rejected" &&
              other.posNo === item.posNo &&
              Math.abs((other.width || 0) - (item.width || 0)) < 2 &&
              Math.abs((other.height || 0) - (item.height || 0)) < 2 &&
              (
                (item.piId && other.piId === item.piId) ||
                (item.piNumber && other.piNumber === item.piNumber) ||
                (item.sfoNo && other.sfoNo === item.sfoNo) ||
                (item.orderNo && other.orderNo === item.orderNo) ||
                (item.obNo && other.obNo === item.obNo)
              ) &&
              !itemsToRework.some((t) => t.id === other.id)
          );

          if (!isBothClear && !partnerClear) {
            partnerClear = siblings.find(
              (s) =>
                (s.colorOrClear === "Clear" || /clear/i.test(`${s.glassType || ""} ${s.category || ""}`)) &&
                s.id !== item.id &&
                !partners.some((p) => p.id === s.id) &&
                !itemsToRework.some((t) => t.id === s.id)
            );
          }
          if (!partnerColour) {
            partnerColour = siblings.find(
              (s) =>
                (s.colorOrClear === "Colour" || COLOURED_COATED_GLASS_REGEX.test(`${s.glassType || ""} ${s.category || ""}`)) &&
                !partners.some((p) => p.id === s.id) &&
                !itemsToRework.some((t) => t.id === s.id)
            );
          }

          if (!isBothClear && partnerClear) partners.push(partnerClear);
          if (partnerColour) partners.push(partnerColour);
        }
      } else if (isLaminationItem(item)) {
        const itemLamPairId = (item as any).lamPairId;
        if (itemLamPairId) {
          const p = glassItemsDatabase.find(
            (other) => (other as any).lamPairId === itemLamPairId && other.id !== item.id && other.status !== "Rejected"
          );
          if (p) partners.push(p);
        } else {
          const clearPartner = glassItemsDatabase.find(
            (other) =>
              other.id !== item.id &&
              other.status !== "Rejected" &&
              other.posNo === item.posNo &&
              Math.abs((other.width || 0) - (item.width || 0)) < 2 &&
              Math.abs((other.height || 0) - (item.height || 0)) < 2 &&
              (
                (item.piId && other.piId === item.piId) ||
                (item.piNumber && other.piNumber === item.piNumber) ||
                (item.sfoNo && other.sfoNo === item.sfoNo) ||
                (item.orderNo && other.orderNo === item.orderNo) ||
                (item.obNo && other.obNo === item.obNo)
              )
          );
          if (clearPartner) partners.push(clearPartner);
        }
      } else {
        // Standard DGU (1+1): un-link 1 opposite finish partner pane
        const itemDguPairId = (item as any).dguPairId;
        if (itemDguPairId) {
          const p = glassItemsDatabase.find(
            (other) => (other as any).dguPairId === itemDguPairId && other.id !== item.id && other.status !== "Rejected"
          );
          if (p) partners.push(p);
        } else {
          const isItemColour = item.colorOrClear === "Colour" || COLOURED_COATED_GLASS_REGEX.test(`${item.glassType || ""} ${item.category || ""}`);
          const siblings = glassItemsDatabase.filter(
            (other) =>
              other.id !== item.id &&
              other.status !== "Rejected" &&
              other.posNo === item.posNo &&
              Math.abs((other.width || 0) - (item.width || 0)) < 2 &&
              Math.abs((other.height || 0) - (item.height || 0)) < 2 &&
              (
                (item.piId && other.piId === item.piId) ||
                (item.piNumber && other.piNumber === item.piNumber) ||
                (item.sfoNo && other.sfoNo === item.sfoNo) ||
                (item.orderNo && other.orderNo === item.orderNo) ||
                (item.obNo && other.obNo === item.obNo)
              )
          );
          const oppositePartner = siblings.find((s) => {
            const isOtherColour = s.colorOrClear === "Colour" || COLOURED_COATED_GLASS_REGEX.test(`${s.glassType || ""} ${s.category || ""}`);
            return isOtherColour !== isItemColour;
          });
          if (oppositePartner) partners.push(oppositePartner);
        }
      }

      partners.forEach((partner) => {
        delete (partner as any).lamPairId;
        delete (partner as any).dguPairId;
        partner.currentStage = "Pairing";
        partner.status = "Pending";
        partner.updatedAt = new Date().toISOString();
        if (isDlguItem(partner)) {
          const isColour = partner.colorOrClear === "Colour" || COLOURED_COATED_GLASS_REGEX.test(`${partner.glassType || ""} ${partner.category || ""}`);
          if (isColour) {
            partner.dlguPhase = "DguPairing";
            partner.completedStages = (partner.completedStages || []).filter(
              (s: string) => s !== "DGU" && s !== "Pairing" && s !== "Finished"
            );
            if (!partner.completedStages.includes("Cutting")) {
              partner.completedStages.push("Cutting");
            }
          } else {
            const isOpRework = defectivePane === "OP";
            if (isOpRework && partner.completedStages?.includes("Lamination")) {
              partner.dlguPhase = "DguPairing";
              partner.completedStages = (partner.completedStages || []).filter(
                (s: string) => s !== "DGU" && s !== "Pairing" && s !== "Finished"
              );
            } else {
              partner.dlguPhase = "LamPairing";
              partner.completedStages = (partner.completedStages || []).filter(
                (s: string) => s !== "Lamination" && s !== "DGU" && s !== "Pairing" && s !== "Finished"
              );
            }
          }
        }
      });
      allUnlinkedPartners.push(...partners);
    });
  }

  const allItemsToRework = [...itemsToRework, ...partnerItems];
  const reworkEntries: ReworkRecord[] = [];

  allItemsToRework.forEach((targetItem) => {
    delete (targetItem as any).lamPairId;
    delete (targetItem as any).dguPairId;
    const prevStage = targetItem.currentStage;
    targetItem.completedStages = targetStage === "Cutting" ? [] : targetItem.completedStages.filter((s) => s !== targetStage);
    targetItem.currentStage = targetStage as ProductionStage;
    targetItem.status = "Reworking";
    targetItem.updatedAt = new Date().toISOString();
    if (isDlguItem(targetItem)) {
      const isColour = targetItem.colorOrClear === "Colour" || COLOURED_COATED_GLASS_REGEX.test(`${targetItem.glassType || ""} ${targetItem.category || ""}`);
      if (!isColour) {
        targetItem.dlguPhase = "LamPairing";
      }
    }

    const finalPiNumber = sanitizeString(piNumber || targetItem.piNumber, 100);

    const reworkEntry: ReworkRecord = {
      id: `rew-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      serialNumber: targetItem.serialNumber,
      barcode: targetItem.barcode,
      piNumber: finalPiNumber,
      fromStage: prevStage,
      targetStage: targetStage as ProductionStage,
      defectStation: cleanDefectStation,
      reason: cleanReason,
      defectivePane: defectivePane ? String(defectivePane) : undefined,
      defectiveSerialNumber: defectiveSerialNumber ? String(defectiveSerialNumber) : undefined,
      partnerSerialNumber: allItemsToRework.find((other) => other.serialNumber !== targetItem.serialNumber)?.serialNumber,
      date: new Date().toISOString(),
      operator: cleanOperator,
    };

    reworkDatabase.unshift(reworkEntry);
    reworkEntries.push(reworkEntry);

    const isPairedUnit = allItemsToRework.length > 1;
    const partnerSerialNames = allItemsToRework.map((t) => `#${t.serialNumber}`).join(" + ");

    productionHistoryDatabase.unshift({
      id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      serialNumber: targetItem.serialNumber,
      barcode: targetItem.barcode,
      piNumber: finalPiNumber,
      itemOrBatch: targetItem.serialNumber,
      action: isPairedUnit ? `Paired Unit Sent to Rework (${targetStage})` : `Item Sent to Rework (${targetStage})`,
      prevStatus: prevStage,
      newStatus: "Reworking",
      stage: targetStage,
      status: "Reworking",
      operator: cleanOperator,
      user: cleanOperator,
      timestamp: new Date().toISOString(),
      remarks: isPairedUnit
        ? `Rework routed for paired assembly (${partnerSerialNames}) from ${prevStage} to ${targetStage}: ${cleanReason}`
        : `Rework routed from ${prevStage} to ${targetStage}: ${cleanReason}`,
    });
  });

  // Update parent PI status and counts
  const allAffectedRework = [...allItemsToRework, ...allUnlinkedPartners];
  const affectedReworkPiKeys = new Set(
    allAffectedRework
      .flatMap((i) => [i.piNumber, i.piId])
      .filter(Boolean)
  );
  affectedReworkPiKeys.forEach((piKey) => {
    const parentPi = piDatabase.find((p) => p.id === piKey || p.piNumber === piKey);
    if (parentPi) {
      const piItems = glassItemsDatabase.filter((i) => i.piId === parentPi.id || i.piNumber === parentPi.piNumber);
      const completedItems = piItems.filter((i) => i.status === "Completed").length;
      parentPi.completedItemsCount = completedItems;
      if (piItems.some((i) => i.status !== "Completed")) {
        parentPi.status = "In Production";
      } else if (piItems.length > 0 && piItems.every((i) => i.status === "Completed")) {
        parentPi.status = "Completed";
      }
    }
  });

  saveDatabaseToDisk();
  broadcastUpdate("item_reworked", {
    serialNumber: allItemsToRework[0].serialNumber,
    serialNumbers: allItemsToRework.map((t) => t.serialNumber),
    targetStage,
    reason: cleanReason,
  });

  const isPair = allItemsToRework.length > 1;
  const serialList = allItemsToRework.map((t) => `#${t.serialNumber}`).join(", ");
  createAndBroadcastNotification({
    title: isPair ? `Rework Dispatched: Paired Unit (${serialList})` : `Rework Dispatched: Item #${allItemsToRework[0].serialNumber}`,
    message: isPair
      ? `DLGU / Paired unit (${serialList}) routed back to ${targetStage} by ${cleanOperator}. Reason: ${cleanReason}`
      : `Routed back to ${targetStage} by ${cleanOperator}. Reason: ${cleanReason}`,
    category: "REWORK",
    type: "warning",
    stage: targetStage,
    serialNumber: allItemsToRework[0].serialNumber,
    piNumber: allItemsToRework[0].piNumber,
    operator: cleanOperator,
  });

  res.json({
    message: isPair
      ? `Paired unit (${serialList}) sent to rework at ${targetStage}`
      : `Item ${allItemsToRework[0].serialNumber} sent to rework at ${targetStage}`,
    reworkEntries,
    items: allItemsToRework,
  });
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
    const cleanSfo = String(sfoNo || raw.sfoNo || "1344").replace(/[^0-9]/g, "");
    const numPart = String(serialNumber).replace(/\D/g, "");
    const seqPad = (numPart || String(idx + 1)).padStart(4, "0").slice(-4);
    const fallbackBarcode = formatGenericBarcode(cleanSfo, seqPad, BARCODE_PREFIX);
    const rawBarcode = String(raw.barcode || "").trim();
    const isInvalidBarcode = !rawBarcode || /width|height|order|customer|project|batch|glass/i.test(rawBarcode) || /^[A-Z]+$/i.test(rawBarcode) || !/\d/.test(rawBarcode);
    const barcode = isInvalidBarcode ? fallbackBarcode : rawBarcode;

    // Determine process route from description and remarks
    const descLower = String((glassDescription || raw.glassType || "") + " " + (raw.remarks || "") + " " + (raw.makeup || "") + " " + (raw.stickerRoute || "")).toLowerCase();
    const hasPolish = raw.hasPolish === true || /\bpolish\b/i.test(descLower) || /\bpolished\b/i.test(descLower);
    const isLaminated = descLower.includes("lam") || descLower.includes("lamination") || descLower.includes("lgu") || descLower.includes("pvb") || descLower.includes("sgp");
    const isDGU = descLower.includes("dgu") || descLower.includes("igu") || descLower.includes("double");

    let route: ProductionStage[] = ["Cutting"];
    if (hasPolish) {
      route.push("Polishing");
    }
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
  broadcastUpdate("excel_uploaded", { piNumber: newPI.piNumber, customerName: newPI.customerName, itemsCount: newPI.itemsCount });
  createAndBroadcastNotification({
    title: `PI #${newPI.piNumber} Registered`,
    message: `${newPI.customerName || "Customer"} - ${newPI.itemsCount} items (${newPI.totalSqm} m²) uploaded via Excel`,
    category: "PI_CREATED",
    type: "info",
    piNumber: newPI.piNumber,
    operator: (req as any).user?.username || "Admin",
  });

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

  // 2. Check if the exact same barcodes AND same batch number belong to an already uploaded batch
  if (!matchedBatch && Array.isArray(barcodes) && barcodes.length > 0) {
    const candidateSet = new Set(barcodes.map((b: any) => String(b).trim().toLowerCase()).filter(Boolean));
    const cleanBatch = String(batchNo || "").trim().toLowerCase();
    const existingItem = glassItemsDatabase.find((g) => {
      if (!g.barcode || !candidateSet.has(g.barcode.trim().toLowerCase())) return false;
      if (cleanBatch && g.batchNo) {
        return g.batchNo.trim().toLowerCase() === cleanBatch;
      }
      return false;
    });
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
    overwrite,
  } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ message: "Items array is required" });
    return;
  }

  const batchIdentifier = (batchTitle ? batchTitle.replace(/^STK-/i, "").replace(/^B(?=\d)/i, "") : (batchNo ? String(batchNo) : `BATCH-${Date.now()}`));
  const normalizedBatchId = batchIdentifier.trim().toLowerCase();
  const normalizedFileName = String(fileName || "").trim().toLowerCase();

  // Strict PDF Duplicate Check: 1 PDF cannot be uploaded 2 times unless overwrite requested
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
    if (!overwrite) {
      res.status(409).json({
        error: "PDF Batch Already Uploaded",
        message: `Cannot upload: PDF "${existingBatch.fileName || existingBatch.piNumber}" has already been uploaded previously into production. 1 PDF cannot be uploaded 2 times without overwrite.`,
        existingBatch: {
          piNumber: existingBatch.piNumber,
          fileName: existingBatch.fileName,
          createdAt: existingBatch.createdAt,
          itemsCount: existingBatch.itemsCount,
        },
      });
      return;
    } else {
      // Overwrite: remove previously uploaded batch and its glass items to re-import cleanly
      const oldPiId = existingBatch.id;
      const oldPiNum = existingBatch.piNumber;
      for (let i = piDatabase.length - 1; i >= 0; i--) {
        if (piDatabase[i].id === oldPiId || piDatabase[i].piNumber === oldPiNum) {
          piDatabase.splice(i, 1);
        }
      }
      for (let i = glassItemsDatabase.length - 1; i >= 0; i--) {
        if (glassItemsDatabase[i].piId === oldPiId || glassItemsDatabase[i].piNumber === oldPiNum) {
          glassItemsDatabase.splice(i, 1);
        }
      }
    }
  }

  const batchId = `batch-${Date.now()}`;

  let totalSqm = 0;
  let totalQty = 0;

  // In one PDF, it is strictly 100% full Colour or 100% Clear (never Mixed)
  const colourRegex = COLOURED_COATED_GLASS_REGEX;
  const rawColourCount = items.filter((raw: any) => raw.colorOrClear === "Colour" || raw.colorOrClear === "Color" || colourRegex.test(raw.glassType || "") || colourRegex.test(raw.glassColor || "")).length;
  const rawClearCount = items.filter((raw: any) => (raw.colorOrClear === "Clear" || /clear/i.test(raw.glassType || "")) && !colourRegex.test(raw.glassType || "")).length;

  let isColourBatch = false;
  if (colorOrClear === "Colour" || colorOrClear === "Color" || (req.body as any).finish === "Colour") {
    isColourBatch = true;
  } else if (rawColourCount > 0 && rawColourCount >= items.length / 2) {
    // If items are predominantly coloured/coated (e.g. CARDINAL LOW-E), enforce Colour
    isColourBatch = true;
  } else if (colorOrClear === "Clear" || (req.body as any).finish === "Clear") {
    isColourBatch = false;
  } else if (glassColor && colourRegex.test(glassColor) && !/clear/i.test(glassColor)) {
    isColourBatch = true;
  } else {
    isColourBatch = rawColourCount > rawClearCount;
  }

  const defaultColorOrClear: "Clear" | "Colour" = isColourBatch ? "Colour" : "Clear";
  const defaultGlassColor = defaultColorOrClear === "Colour" ? (glassColor || "Coloured Glass") : "Clear Glass";
  // Auto-detect Lamination vs DGU if not explicitly provided or if items/fileName clearly indicate Lamination
  const itemsText = (
    String(fileName || "") +
    " " +
    items.map((raw: any) => `${raw.glassType || ""} ${raw.glassCode || ""} ${raw.category || ""} ${raw.remarks || ""} ${raw.makeup || ""}`).join(" ")
  ).toLowerCase();
  const hasInterlayerKeyword = /\b(pvb|sgp|eva|lamination|laminated|lami|lam)\b/i.test(itemsText);
  const hasSpacerKeyword = /\b(spacer|dgu|igu|double\s*glaz)\b/i.test(itemsText);

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

  // Detect if PDF contains multiple customers and/or projects
  const groupMap = new Map<string, { customer: string; project: string; rawItems: any[] }>();

  items.forEach((raw: any) => {
    const cust = (raw.customerName || customerName || "Customer").trim();
    const proj = (raw.projectName || projectName || "Project").trim();
    const key = `${cust}:::${proj}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, { customer: cust, project: proj, rawItems: [] });
    }
    groupMap.get(key)!.rawItems.push(raw);
  });

  const isMultiGroup = groupMap.size > 1;
  const createdBatches: PIMaster[] = [];
  const allNewItems: GlassItem[] = [];
  let globalItemIdx = 0;

  if (!isMultiGroup) {
    // Single customer batch - Standard flow (100% backwards compatible)
    const finalCustomer = (customerName || items[0]?.customerName || "Customer").trim();
    const finalProject = (projectName || items[0]?.projectName || "Project").trim();
    const finalDelDate = deliveryDate || items[0]?.delDate || new Date().toLocaleDateString("en-GB");
    const finalOptDate = optDate || items[0]?.optDate || new Date().toLocaleDateString("en-GB");

    const newItems: GlassItem[] = items.map((raw: any, idx: number) => {
      const width = parseFloat(raw.width) || 1000;
      const height = parseFloat(raw.height) || 1000;
      const qty = parseInt(raw.qty || raw.quantity, 10) || 1;
      const sqm = parseFloat(raw.sqm) || parseFloat(((width * height * qty) / 1000000).toFixed(2));

      totalSqm += sqm;
      totalQty += qty;

      const serialNumber = `S${String(glassItemsDatabase.length + idx + 1).padStart(3, "0")}`;
      const cleanSfo = String(raw.sfoNo || sfoNo || "1344").replace(/[^0-9]/g, "");
      const numPart = String(serialNumber).replace(/\D/g, "");
      const seqPad = (numPart || String(raw.posNo || idx + 1).replace(/[^0-9]/g, "")).padStart(4, "0").slice(-4);
      const fallbackBarcode = formatGenericBarcode(cleanSfo, seqPad, BARCODE_PREFIX);
      const rawBarcode = String(raw.barcode || "").trim();
      const isInvalidBarcode = !rawBarcode || /width|height|order|customer|project|batch|glass/i.test(rawBarcode) || /^[A-Z]+$/i.test(rawBarcode) || !/\d/.test(rawBarcode);
      const barcode = isInvalidBarcode ? fallbackBarcode : rawBarcode;

      const itemGlassCategory: "DGU" | "Lamination" | "DLGU" =
        raw.glassCategory === "DLGU" || raw.glassCategory === "Lamination" || raw.glassCategory === "DGU"
          ? raw.glassCategory
          : defaultGlassCategory;
      const isDlgu = itemGlassCategory === "DLGU";
      const isLaminated = !isDlgu && itemGlassCategory === "Lamination";

      const itemColorOrClear: "Clear" | "Colour" = defaultColorOrClear;
      const itemGlassColor: string = defaultGlassColor;

      const rawText = `${raw.glassType || ""} ${raw.glassCode || ""} ${raw.remarks || ""} ${raw.makeup || ""} ${raw.stickerRoute || ""}`.toLowerCase();
      const hasPolish = raw.hasPolish === true || /\bpolish\b/i.test(rawText) || /\bpolished\b/i.test(rawText);

      let route: ProductionStage[];
      let dlguPhase: "LamPairing" | "DguPairing" | undefined = undefined;

      if (isDlgu) {
        const isLamPane = itemColorOrClear === "Clear" || /lam|laminated|6mm clear/i.test(rawText);
        if (isLamPane) {
          route = hasPolish
            ? ["Cutting", "Polishing", "Pairing", "Lamination", "Pairing", "DGU", "Finished"]
            : ["Cutting", "Pairing", "Lamination", "Pairing", "DGU", "Finished"];
          dlguPhase = "LamPairing";
        } else {
          route = hasPolish
            ? ["Cutting", "Polishing", "Pairing", "DGU", "Finished"]
            : ["Cutting", "Pairing", "DGU", "Finished"];
          dlguPhase = "DguPairing";
        }
      } else if (isLaminated) {
        route = hasPolish
          ? ["Cutting", "Polishing", "Pairing", "Lamination", "Finished"]
          : ["Cutting", "Pairing", "Lamination", "Finished"];
      } else if (itemGlassCategory === "DGU") {
        route = hasPolish
          ? ["Cutting", "Polishing", "Pairing", "DGU", "Finished"]
          : ["Cutting", "Pairing", "DGU", "Finished"];
      } else {
        route = hasPolish
          ? ["Cutting", "Polishing", "Finished"]
          : ["Cutting", "Finished"];
      }

      return {
        id: `item-${Date.now()}-${idx}`,
        piId: batchId,
        piNumber: batchIdentifier,
        serialNumber,
        barcode,
        qrId: `QR-${barcode}`,
        orderNo: raw.orderNo || raw.obNo || obNo || batchIdentifier,
        obNo: raw.obNo || obNo || "",
        sfoNo: raw.sfoNo || sfoNo || "",
        batchNo: raw.batchNo || batchNo || "1",
        posNo: raw.posNo || String(idx + 1),
        customerName: finalCustomer,
        projectName: finalProject,
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
        remarks: raw.remarks || (raw.stickerRoute ? `Route: ${raw.stickerRoute}` : `Sticker #${raw.stickerNo || idx + 1}`),
        stickerRoute: raw.stickerRoute || undefined,
        hasPolish,
        processRoute: route,
        currentStage: "Cutting",
        status: "Pending",
        completedStages: [],
        delDate: raw.delDate || finalDelDate || "",
        optDate: raw.optDate || finalOptDate || "",
        makeup: raw.makeup || "",
        updatedAt: new Date().toISOString(),
      };
    });

    const distinctOrderNo = items.find((i: any) => i.orderNo && i.orderNo !== batchIdentifier && String(i.orderNo).trim() !== String(batchNo).trim())?.orderNo || "";

    const batchRecord: PIMaster = {
      id: batchId,
      piNumber: batchIdentifier,
      batchNo: String(batchNo || batchIdentifier),
      fileName: fileName || `${batchIdentifier}.pdf`,
      customerName: finalCustomer,
      jobOrderNumber: sfoNo || obNo || batchIdentifier,
      projectName: finalProject,
      issueDate: finalOptDate,
      sfoNo: sfoNo || "",
      sfoDate: finalOptDate,
      deliveryDate: finalDelDate,
      proformaInvNo: distinctOrderNo || batchIdentifier,
      soNoDate: `Batch #${batchNo || "1"} / ${finalOptDate}`,
      refContact: "",
      dispatchType: "FACTORY",
      invoiceTo: finalCustomer,
      dispatchTo: finalCustomer,
      obNo: obNo || "",
      purchaseOrderNo: "",
      version: "1.00",
      totalQty: totalQty || newItems.reduce((a, b) => a + (b.qty || 1), 0),
      totalSqm: parseFloat(totalSqm.toFixed(2)),
      glassDescription: newItems[0]?.glassType || (defaultColorOrClear === "Colour" ? "Coloured Glass" : "6MM CLEAR TEMPERED"),
      glassCategory: defaultGlassCategory,
      colorOrClear: defaultColorOrClear,
      finish: defaultColorOrClear,
      glassColor: defaultGlassColor,
      status: "In Production",
      itemsCount: totalQty || newItems.reduce((a, b) => a + (b.qty || 1), 0) || newItems.length,
      completedItemsCount: 0,
      createdAt: new Date().toISOString(),
    };

    createdBatches.push(batchRecord);
    allNewItems.push(...newItems);
  } else {
    // Multi-Customer Batch: Split into dedicated customer sub-batches
    const groupEntries = Array.from(groupMap.values());
    const baseBatchClean = batchIdentifier.trim();

    groupEntries.forEach((group, grpIdx) => {
      const subBatchId = `batch-${Date.now()}-${grpIdx}`;
      const cleanCust = group.customer.replace(/[^A-Za-z0-9]/g, " ").trim();
      const custTag = (cleanCust.split(/\s+/)[0] || "CUST").toUpperCase();
      const cleanProj = group.project.replace(/[^A-Za-z0-9_]/g, " ").trim();
      const projTag = (cleanProj.split(/\s+/)[0] || "PROJ").toUpperCase();

      const sameCustCount = groupEntries.filter((g) => g.customer === group.customer).length;
      const subBatchPiNumber = sameCustCount > 1
        ? `${baseBatchClean}-${custTag}-${projTag}`
        : `${baseBatchClean}-${custTag}`;

      let groupSqm = 0;
      let groupQty = 0;
      const firstRaw = group.rawItems[0] || {};

      const groupGlassItems: GlassItem[] = group.rawItems.map((raw: any) => {
        const width = parseFloat(raw.width) || 1000;
        const height = parseFloat(raw.height) || 1000;
        const qty = parseInt(raw.qty || raw.quantity, 10) || 1;
        const sqm = parseFloat(raw.sqm) || parseFloat(((width * height * qty) / 1000000).toFixed(2));

        groupSqm += sqm;
        groupQty += qty;
        totalSqm += sqm;
        totalQty += qty;

        const serialNumber = `S${String(glassItemsDatabase.length + globalItemIdx + 1).padStart(3, "0")}`;
        const cleanSfo = String(raw.sfoNo || sfoNo || "1344").replace(/[^0-9]/g, "");
        const numPart = String(serialNumber).replace(/\D/g, "");
        const seqPad = (numPart || String(raw.posNo || globalItemIdx + 1).replace(/[^0-9]/g, "")).padStart(4, "0").slice(-4);
        const fallbackBarcode = formatGenericBarcode(cleanSfo, seqPad, BARCODE_PREFIX);
        const rawBarcode = String(raw.barcode || "").trim();
        const isInvalidBarcode = !rawBarcode || /width|height|order|customer|project|batch|glass/i.test(rawBarcode) || /^[A-Z]+$/i.test(rawBarcode) || !/\d/.test(rawBarcode);
        const barcode = isInvalidBarcode ? fallbackBarcode : rawBarcode;

        const itemGlassCategory: "DGU" | "Lamination" | "DLGU" =
          raw.glassCategory === "DLGU" || raw.glassCategory === "Lamination" || raw.glassCategory === "DGU"
            ? raw.glassCategory
            : defaultGlassCategory;
        const isDlgu = itemGlassCategory === "DLGU";
        const isLaminated = !isDlgu && itemGlassCategory === "Lamination";

        const itemColorOrClear: "Clear" | "Colour" = defaultColorOrClear;
        const itemGlassColor: string = defaultGlassColor;

        const rawText = `${raw.glassType || ""} ${raw.glassCode || ""} ${raw.remarks || ""} ${raw.makeup || ""} ${raw.stickerRoute || ""}`.toLowerCase();
        const hasPolish = raw.hasPolish === true || /\bpolish\b/i.test(rawText) || /\bpolished\b/i.test(rawText);

        let route: ProductionStage[];
        let dlguPhase: "LamPairing" | "DguPairing" | undefined = undefined;

        if (isDlgu) {
          const isLamPane = itemColorOrClear === "Clear" || /lam|laminated|6mm clear/i.test(rawText);
          if (isLamPane) {
            route = hasPolish
              ? ["Cutting", "Polishing", "Pairing", "Lamination", "Pairing", "DGU", "Finished"]
              : ["Cutting", "Pairing", "Lamination", "Pairing", "DGU", "Finished"];
            dlguPhase = "LamPairing";
          } else {
            route = hasPolish
              ? ["Cutting", "Polishing", "Pairing", "DGU", "Finished"]
              : ["Cutting", "Pairing", "DGU", "Finished"];
            dlguPhase = "DguPairing";
          }
        } else if (isLaminated) {
          route = hasPolish
            ? ["Cutting", "Polishing", "Pairing", "Lamination", "Finished"]
            : ["Cutting", "Pairing", "Lamination", "Finished"];
        } else if (itemGlassCategory === "DGU") {
          route = hasPolish
            ? ["Cutting", "Polishing", "Pairing", "DGU", "Finished"]
            : ["Cutting", "Pairing", "DGU", "Finished"];
        } else {
          route = hasPolish
            ? ["Cutting", "Polishing", "Finished"]
            : ["Cutting", "Finished"];
        }

        const itemObj: GlassItem = {
          id: `item-${Date.now()}-${globalItemIdx}`,
          piId: subBatchId,
          piNumber: subBatchPiNumber,
          serialNumber,
          barcode,
          qrId: `QR-${barcode}`,
          orderNo: raw.orderNo || raw.obNo || obNo || baseBatchClean,
          obNo: raw.obNo || obNo || "",
          sfoNo: raw.sfoNo || sfoNo || "",
          batchNo: raw.batchNo || batchNo || baseBatchClean,
          posNo: raw.posNo || String(globalItemIdx + 1),
          customerName: group.customer,
          projectName: group.project,
          srNo: globalItemIdx + 1,
          itemCode: raw.glassCode || `GL-${String(globalItemIdx + 1).padStart(2, "0")}`,
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
          remarks: raw.remarks || (raw.stickerRoute ? `Route: ${raw.stickerRoute}` : `Sticker #${raw.stickerNo || globalItemIdx + 1}`),
          stickerRoute: raw.stickerRoute || undefined,
          hasPolish,
          processRoute: route,
          currentStage: "Cutting",
          status: "Pending",
          completedStages: [],
          delDate: raw.delDate || firstRaw.delDate || deliveryDate || "",
          optDate: raw.optDate || firstRaw.optDate || optDate || "",
          makeup: raw.makeup || "",
          updatedAt: new Date().toISOString(),
        };

        globalItemIdx++;
        return itemObj;
      });

      const subBatchRecord: PIMaster = {
        id: subBatchId,
        piNumber: subBatchPiNumber,
        batchNo: String(firstRaw.batchNo || batchNo || baseBatchClean),
        fileName: fileName || `${baseBatchClean}.pdf`,
        customerName: group.customer,
        jobOrderNumber: firstRaw.sfoNo || firstRaw.obNo || sfoNo || obNo || baseBatchClean,
        projectName: group.project,
        issueDate: firstRaw.optDate || optDate || new Date().toLocaleDateString("en-GB"),
        sfoNo: firstRaw.sfoNo || sfoNo || "",
        sfoDate: firstRaw.optDate || optDate || new Date().toLocaleDateString("en-GB"),
        deliveryDate: firstRaw.delDate || deliveryDate || new Date().toLocaleDateString("en-GB"),
        proformaInvNo: group.rawItems.find((i: any) => i.orderNo && i.orderNo !== subBatchPiNumber)?.orderNo || subBatchPiNumber,
        soNoDate: `Batch #${firstRaw.batchNo || batchNo || baseBatchClean} / ${firstRaw.optDate || optDate || new Date().toLocaleDateString("en-GB")}`,
        refContact: "",
        dispatchType: "FACTORY",
        invoiceTo: group.customer,
        dispatchTo: group.customer,
        obNo: firstRaw.obNo || obNo || "",
        purchaseOrderNo: "",
        version: "1.00",
        totalQty: groupQty,
        totalSqm: parseFloat(groupSqm.toFixed(2)),
        glassDescription: groupGlassItems[0]?.glassType || (defaultColorOrClear === "Colour" ? "Coloured Glass" : "6MM CLEAR TEMPERED"),
        glassCategory: defaultGlassCategory,
        colorOrClear: defaultColorOrClear,
        finish: defaultColorOrClear,
        glassColor: defaultGlassColor,
        status: "In Production",
        itemsCount: groupGlassItems.length,
        completedItemsCount: 0,
        createdAt: new Date().toISOString(),
      };

      createdBatches.push(subBatchRecord);
      allNewItems.push(...groupGlassItems);
    });
  }

  piDatabase.unshift(...createdBatches);
  glassItemsDatabase.unshift(...allNewItems);

  createdBatches.forEach((batchRec) => {
    productionHistoryDatabase.unshift({
      id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      serialNumber: `BATCH-${batchRec.piNumber}`,
      piNumber: batchRec.piNumber,
      itemOrBatch: `Batch ${batchRec.piNumber}`,
      action: "Batch Uploaded (Sticker PDF)",
      prevStatus: "New File",
      newStatus: "In Production",
      stage: "Cutting",
      status: "Completed",
      operator: "Operator",
      user: "Operator",
      timestamp: new Date().toISOString(),
      remarks: `Uploaded ${batchRec.itemsCount} glass units (${batchRec.totalSqm} SQM) for ${batchRec.customerName} (${batchRec.projectName}) from ${fileName || batchIdentifier}`,
    });
  });

  saveDatabaseToDisk();
  broadcastUpdate("sticker_batch_uploaded", { batchIdentifier, totalItems: allNewItems.length });
  createAndBroadcastNotification({
    title: `Batch #${batchNo || batchIdentifier} Uploaded`,
    message: isMultiGroup
      ? `${totalQty} glass units imported across ${createdBatches.length} customer batches from ${fileName || batchIdentifier}`
      : `${totalQty} glass units (${createdBatches[0].totalSqm} m²) imported from ${fileName || batchIdentifier}`,
    category: "BATCH_UPLOAD",
    type: "info",
    batchNumber: batchNo || batchIdentifier,
    piNumber: createdBatches[0].piNumber,
    operator: (req as any).user?.username || "Operator",
  });

  res.json({
    message: isMultiGroup
      ? `Sticker batch imported into ${createdBatches.length} customer sub-batches successfully`
      : "Sticker batch uploaded and items imported successfully",
    batch: createdBatches[0],
    subBatches: createdBatches,
    batchNo,
    sfoNo,
    batchIdentifier,
    totalSqm: parseFloat(totalSqm.toFixed(2)),
    totalItems: totalQty,
    totalStickers: totalQty,
    items: allNewItems,
  });
};

// Dashboard Stats API
export const handleGetDashboardStats: RequestHandler = (_req, res) => {
  const totalPI = piDatabase.length;
  const uniquePdfFileNames = new Set(
    piDatabase
      .map((p) => (p.fileName || (p.jobOrderNumber ? `${p.jobOrderNumber}.pdf` : `${p.piNumber}.pdf`)).trim().toLowerCase())
      .filter(Boolean)
  );
  const stickerUploadCount = uniquePdfFileNames.size;
  const pendingPI = piDatabase.filter((p) => p.status === "Pending" || p.status === "In Production").length;
  const completedPI = piDatabase.filter((p) => p.status === "Completed").length;

  const isUndispatched = (i: any) =>
    !i.isDispatched &&
    i.currentStage !== "Dispatched" &&
    !i.dispatchedAt;

  const pendingCutting = glassItemsDatabase
    .filter((i) => isUndispatched(i) && (i.currentStage === "Cutting" || (!i.currentStage && i.status !== "Rejected")) && i.status !== "Completed" && i.status !== "Rejected")
    .reduce((a, b) => a + (b.qty || 1), 0);
  const pendingPolishing = glassItemsDatabase
    .filter((i) => isUndispatched(i) && (i.currentStage?.toLowerCase() === "polishing") && i.status !== "Completed" && i.status !== "Rejected")
    .reduce((a, b) => a + (b.qty || 1), 0);
  const pendingLaminationPanes = glassItemsDatabase
    .filter((i) => isUndispatched(i) && i.currentStage === "Lamination" && i.status !== "Completed" && i.status !== "Rejected")
    .reduce((a, b) => a + (b.qty || 1), 0);
  const pendingLamination = Math.ceil(pendingLaminationPanes / 2);

  // DGU Stage: Count DGU units (paired 1 Colour + 1 Clear pane = 1 DGU Unit)
  const dguItems = glassItemsDatabase.filter((i) => isUndispatched(i) && i.currentStage === "DGU" && i.status !== "Completed" && i.status !== "Rejected");
  const isColour = (i: any) => {
    const typeStr = String(i.glassType || "").toLowerCase();
    const hasColourKeyword = isGlassTypeColour(i.glassType, i.glassColor, i.category);

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
    .filter((i) => isUndispatched(i) && i.currentStage === "Pairing" && i.status !== "Completed" && i.status !== "Rejected")
    .reduce((a, b) => a + (b.qty || 1), 0);

  // Finished Items (Pending Dispatch) vs Dispatched Items
  const isDgu = (i: any) => {
    const descLower = `${i.glassType || ""} ${i.glassCode || ""}`.toLowerCase();
    return (Array.isArray(i.processRoute) && i.processRoute.includes("DGU")) || descLower.includes("dgu") || descLower.includes("igu") || descLower.includes("double") || descLower.includes("spacer");
  };
  const isLam = (i: any) => i.glassCategory === "Lamination" || (Array.isArray(i.processRoute) && i.processRoute.includes("Lamination"));

  const computeUnits = (list: typeof glassItemsDatabase) => {
    const dlguList = list.filter(isDlguItem);
    const pureDguList = list.filter((i) => isDgu(i) && !isDlguItem(i));
    const nonDguList = list.filter((i) => !isDgu(i));

    const dlguColour = dlguList.filter(isColour).reduce((a, b) => a + (b.qty || 1), 0);
    const dlguClear = dlguList.filter((i) => !isColour(i)).reduce((a, b) => a + (b.qty || 1), 0);
    const dlguUnits = dlguColour > 0 && dlguClear > 0 ? Math.min(dlguColour, Math.floor(dlguClear / 2)) : Math.floor((dlguColour + dlguClear) / 3);

    const finDguColourPanes = pureDguList.filter(isColour).reduce((a, b) => a + (b.qty || 1), 0);
    const finDguClearPanes = pureDguList.filter((i) => !isColour(i)).reduce((a, b) => a + (b.qty || 1), 0);
    const pureDguUnits = finDguColourPanes > 0 && finDguClearPanes > 0 ? Math.min(finDguColourPanes, finDguClearPanes) : (finDguColourPanes > 0 ? finDguColourPanes : Math.ceil(pureDguList.reduce((a, b) => a + (b.qty || 1), 0) / 2));

    const lamList = nonDguList.filter(isLam);
    const monoList = nonDguList.filter((i) => !isLam(i));
    const lamUnits = Math.ceil(lamList.reduce((a, b) => a + (b.qty || 1), 0) / 2);
    const monoUnits = monoList.reduce((a, b) => a + (b.qty || 1), 0);

    return dlguUnits + pureDguUnits + lamUnits + monoUnits;
  };

  const finishedPendingList = glassItemsDatabase.filter((i) => isUndispatched(i) && i.currentStage === "Finished" && i.status !== "Rejected");
  const dispatchedList = glassItemsDatabase.filter((i) => (!isUndispatched(i) || (i as any).isDispatched === true || (i as any).currentStage === "Dispatched") && i.status !== "Rejected");

  const finishedItems = computeUnits(finishedPendingList);
  const dispatchedItems = computeUnits(dispatchedList);
  const rejectItems = rejectDatabase.length;
  const reworkItems = reworkDatabase.length;

  // Compute user / machine throughput breakdown by stage (stickers count + SQM volume)
  const itemSqmLookup = new Map<string, number>();
  glassItemsDatabase.forEach((g) => {
    if (g.serialNumber) itemSqmLookup.set(g.serialNumber, g.sqm || 0);
    if (g.barcode) itemSqmLookup.set(g.barcode, g.sqm || 0);
  });

  const userRecords = getAllUserRecords();
  const userLookup = new Map<string, { name: string; username: string }>();
  userRecords.forEach((u) => {
    userLookup.set(u.username.toLowerCase(), { name: u.name, username: u.username });
    userLookup.set(u.name.toLowerCase(), { name: u.name, username: u.username });
  });

  const userThroughputByStage: Record<string, Record<string, { stickers: number; sqm: number; name?: string; username?: string }>> = {};

  // Pre-seed all registered operators into their assigned stages
  userRecords.forEach((u) => {
    if (u.isActive && u.role === "Operator" && Array.isArray(u.assignedStages)) {
      u.assignedStages.forEach((stg) => {
        const normStg = stg === "Finished" ? "Dispatched" : stg;
        if (!userThroughputByStage[normStg]) userThroughputByStage[normStg] = {};
        if (!userThroughputByStage[normStg][u.name]) {
          userThroughputByStage[normStg][u.name] = {
            stickers: 0,
            sqm: 0,
            name: u.name,
            username: u.username,
          };
        }
      });
    }
  });

  productionHistoryDatabase.forEach((h) => {
    if (h.status === "Completed" && !isBatchUploadHistory(h)) {
      const rawStage = String(h.stage || "General");
      const stg = rawStage === "Finished" ? "Dispatched" : rawStage;
      const rawOp = h.user || h.operator || "Production Line";
      const matched = userLookup.get(rawOp.toLowerCase());
      const displayName = matched?.name || rawOp;
      const username = matched?.username;
      const opKey = displayName;

      if (!userThroughputByStage[stg]) userThroughputByStage[stg] = {};
      if (!userThroughputByStage[stg][opKey]) {
        userThroughputByStage[stg][opKey] = {
          stickers: 0,
          sqm: 0,
          name: displayName,
          username: username,
        };
      }
      userThroughputByStage[stg][opKey].stickers += 1;
      const sqm = itemSqmLookup.get(h.serialNumber) || (h.barcode ? itemSqmLookup.get(h.barcode) : 0) || 0;
      userThroughputByStage[stg][opKey].sqm = parseFloat((userThroughputByStage[stg][opKey].sqm + sqm).toFixed(2));
    }
  });

  const stats: DashboardStats = {
    totalPI,
    stickerUploadCount,
    pendingPI,
    completedPI,
    pendingCutting,
    pendingPolishing,
    pendingPairing,
    pendingLamination,
    pendingDGU,
    finishedItems,
    dispatchedItems,
    rejectItems,
    reworkItems,
    userThroughputByStage,
  };

  res.json({
    ...stats,
    items: glassItemsDatabase,
  });
};

// Real-Time System Notifications API (Directly from persisted notificationsDatabase)
export const handleGetNotifications: RequestHandler = (_req, res) => {
  // If no notifications yet, initialize with system ready notification
  if (notificationsDatabase.length === 0) {
    const defaultNotif: SystemNotification = {
      id: "notif-sys-init",
      title: "System Operational",
      message: `Live database sync active with ${glassItemsDatabase.length} glass items across all workstations.`,
      category: "SYSTEM",
      type: "info",
      timestamp: new Date().toISOString(),
      rawDate: Date.now(),
      read: false,
      createdAt: new Date().toISOString(),
    };
    notificationsDatabase.push(defaultNotif);
    saveDatabaseToDisk();
  }

  res.json(notificationsDatabase.slice(0, 50));
};

// Mark all notifications as read
export const handleMarkAllNotificationsRead: RequestHandler = (_req, res) => {
  notificationsDatabase.forEach((n) => {
    n.read = true;
  });
  saveDatabaseToDisk();
  broadcastUpdate("notifications_updated");
  res.json({ success: true, message: "All notifications marked as read" });
};

// Mark specific notification as read
export const handleMarkNotificationRead: RequestHandler = (req, res) => {
  const { id } = req.params;
  const notif = notificationsDatabase.find((n) => n.id === id);
  if (notif) {
    notif.read = true;
    saveDatabaseToDisk();
    broadcastUpdate("notifications_updated");
  }
  res.json({ success: true });
};

// Delete a single notification
export const handleDeleteNotification: RequestHandler = (req, res) => {
  const { id } = req.params;
  const idx = notificationsDatabase.findIndex((n) => n.id === id);
  if (idx !== -1) {
    notificationsDatabase.splice(idx, 1);
    saveDatabaseToDisk();
    broadcastUpdate("notifications_updated");
  }
  res.json({ success: true });
};

// Clear all notifications
export const handleClearAllNotifications: RequestHandler = (_req, res) => {
  notificationsDatabase.length = 0;
  saveDatabaseToDisk();
  broadcastUpdate("notifications_updated");
  res.json({ success: true, message: "Notifications cleared" });
};

// Reports API
export const handleGetReports: RequestHandler = (req, res) => {
  const page = parseInt(req.query.page as string, 10);
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);

  // Auto-sync: Ensure all rejected glass items automatically exist in reworkDatabase with remake tickets to Cutting
  let syncChanged = false;
  rejectDatabase.forEach((rej) => {
    const alreadyInRework = reworkDatabase.some((rw) => rw.serialNumber === rej.serialNumber);
    if (!alreadyInRework && rej.serialNumber) {
      reworkDatabase.push({
        id: `rew-${rej.id || Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        serialNumber: rej.serialNumber,
        barcode: rej.barcode,
        piNumber: rej.piNumber,
        fromStage: rej.stage || "Cutting",
        targetStage: "Cutting",
        reason: `[Auto-Remake after Rejection] ${rej.reason}`,
        defectivePane: rej.defectivePane,
        defectiveSerialNumber: rej.defectiveSerialNumber,
        partnerSerialNumber: rej.partnerSerialNumber,
        date: rej.date || new Date().toISOString(),
        operator: rej.operator || "Operator",
      });
      syncChanged = true;

      const item = glassItemsDatabase.find((g) => g.serialNumber === rej.serialNumber);
      if (item && item.status !== "Completed") {
        item.status = "Reworking";
        item.currentStage = "Cutting";
      }
    }
  });

  if (syncChanged) {
    saveDatabaseToDisk(false);
  }

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
  notificationsDatabase.length = 0;

  saveDatabaseToDisk();
  broadcastUpdate("database_cleared");
  createAndBroadcastNotification({
    title: "System Reset",
    message: "Factory database cleared and reset by Administrator",
    category: "SYSTEM",
    type: "warning",
    operator: "Admin",
  });

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

// Delete individual or multiple glass items (piece-wise or sheet-wise)
export const handleDeleteItems: RequestHandler = (req, res) => {
  const { serialNumbers, serialNumber, reason = "Deleted from cutting queue", operator = "Operator" } = req.body;
  const cleanOperator = sanitizeString(operator || "Operator", 100);
  const cleanReason = sanitizeString(reason || "Deleted by operator", 250);

  const rawList: string[] = Array.isArray(serialNumbers)
    ? serialNumbers
    : serialNumber
    ? [serialNumber]
    : [];

  if (rawList.length === 0) {
    res.status(400).json({ message: "serialNumbers or serialNumber is required" });
    return;
  }

  const targetSerials = new Set(rawList.map((s) => String(s).trim().toLowerCase()));
  const deletedItems: GlassItem[] = [];
  const deletedIdentifiers = new Set<string>();
  const affectedPiIds = new Set<string>();

  for (let i = glassItemsDatabase.length - 1; i >= 0; i--) {
    const item = glassItemsDatabase[i];
    const match =
      targetSerials.has(item.serialNumber.toLowerCase()) ||
      targetSerials.has(item.id.toLowerCase()) ||
      (item.barcode && targetSerials.has(item.barcode.toLowerCase())) ||
      (item.qrId && targetSerials.has(item.qrId.toLowerCase()));

    if (match) {
      deletedItems.push(item);
      deletedIdentifiers.add(item.serialNumber);
      if (item.barcode) deletedIdentifiers.add(item.barcode);
      if (item.id) deletedIdentifiers.add(item.id);
      if (item.piId) affectedPiIds.add(item.piId);
      if (item.piNumber) affectedPiIds.add(item.piNumber);
      glassItemsDatabase.splice(i, 1);
    }
  }

  if (deletedItems.length === 0) {
    res.status(404).json({ message: "No matching glass items found to delete" });
    return;
  }

  // Clean up associated history records
  for (let i = productionHistoryDatabase.length - 1; i >= 0; i--) {
    const h = productionHistoryDatabase[i];
    if (deletedIdentifiers.has(h.serialNumber) || (h.barcode && deletedIdentifiers.has(h.barcode)) || (h.itemId && deletedIdentifiers.has(h.itemId))) {
      productionHistoryDatabase.splice(i, 1);
    }
  }

  // Clean up associated reject records
  for (let i = rejectDatabase.length - 1; i >= 0; i--) {
    const r = rejectDatabase[i];
    if (deletedIdentifiers.has(r.serialNumber) || (r.barcode && deletedIdentifiers.has(r.barcode)) || (r.itemId && deletedIdentifiers.has(r.itemId))) {
      rejectDatabase.splice(i, 1);
    }
  }

  // Clean up associated rework records
  for (let i = reworkDatabase.length - 1; i >= 0; i--) {
    const rw = reworkDatabase[i];
    if (deletedIdentifiers.has(rw.serialNumber) || (rw.barcode && deletedIdentifiers.has(rw.barcode)) || (rw.itemId && deletedIdentifiers.has(rw.itemId))) {
      reworkDatabase.splice(i, 1);
    }
  }

  // Update affected PIs counts
  for (const piRef of affectedPiIds) {
    const pi = piDatabase.find((p) => p.id === piRef || p.piNumber === piRef);
    if (pi) {
      const remainingItems = glassItemsDatabase.filter((i) => i.piId === pi.id || i.piNumber === pi.piNumber);
      pi.itemsCount = remainingItems.length;
      pi.completedItemsCount = remainingItems.filter((i) => (i.currentStage === "Finished" || i.currentStage === "Dispatched" || i.isDispatched || i.status === "Completed") && i.status !== "Rejected").length;
    }
  }

  saveDatabaseToDisk();
  broadcastUpdate("stage_advanced", { count: deletedItems.length, action: "delete" });
  broadcastUpdate("item_deleted", { deletedCount: deletedItems.length });

  createAndBroadcastNotification({
    title: deletedItems.length === 1 ? `Sticker #${deletedItems[0].serialNumber} Deleted` : `${deletedItems.length} Stickers Deleted`,
    message: `${deletedItems.length} glass sticker(s) removed from production queue (${cleanReason})`,
    category: "SYSTEM",
    type: "warning",
    piNumber: deletedItems[0]?.piNumber,
    operator: cleanOperator,
  });

  res.json({
    message: `${deletedItems.length} glass item(s) deleted successfully`,
    deletedCount: deletedItems.length,
    deletedItems,
  });
};

// Dispatch Items: Mark finished glass items/units as dispatched so they vanish from Dispatch workstation and permanently archive in Dispatched History
export const handleDispatchItems: RequestHandler = (req, res) => {
  const {
    serialNumbers,
    itemIds,
    dispatchAll,
    dispatchNoteNo,
    vehicleNo,
    driverName,
    remarks,
    operator,
    dispatchedAt,
  } = req.body || {};

  const cleanOperator = typeof operator === "string" && operator.trim() ? operator.trim() : "Dispatch Officer";
  const nowIso = dispatchedAt || new Date().toISOString();
  const cleanNoteNo =
    typeof dispatchNoteNo === "string" && dispatchNoteNo.trim()
      ? dispatchNoteNo.trim()
      : `DN-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, "0")}-${Math.floor(1000 + Math.random() * 9000)}`;
  const cleanVehicle = typeof vehicleNo === "string" ? vehicleNo.trim() : "";
  const cleanDriver = typeof driverName === "string" ? driverName.trim() : "";
  const cleanRemarks = typeof remarks === "string" ? remarks.trim() : "";

  let targetItems: typeof glassItemsDatabase = [];

  if (dispatchAll) {
    targetItems = glassItemsDatabase.filter(
      (i) => i.currentStage === "Finished" && i.status !== "Rejected" && !i.isDispatched
    );
  } else {
    const serialSet = new Set<string>(
      Array.isArray(serialNumbers) ? serialNumbers.map((s) => String(s).trim()) : []
    );
    const idSet = new Set<string>(
      Array.isArray(itemIds) ? itemIds.map((id) => String(id).trim()) : []
    );

    targetItems = glassItemsDatabase.filter((i) => {
      if (i.status === "Rejected" || i.isDispatched) return false;
      if (serialSet.has(i.serialNumber) || idSet.has(i.id)) return true;
      return false;
    });

    // Also include paired partner panes (so complete units are always dispatched together)
    const additionalPartners: typeof glassItemsDatabase = [];
    for (const item of targetItems) {
      const pairId = (item as any).dguPairId;
      const lamId = (item as any).lamPairId;
      if (pairId) {
        const partners = glassItemsDatabase.filter(
          (other) =>
            other.id !== item.id &&
            !other.isDispatched &&
            (other as any).dguPairId === pairId
        );
        for (const p of partners) {
          if (!targetItems.some((t) => t.id === p.id) && !additionalPartners.some((t) => t.id === p.id)) {
            additionalPartners.push(p);
          }
        }
      }
      if (lamId) {
        const partners = glassItemsDatabase.filter(
          (other) =>
            other.id !== item.id &&
            !other.isDispatched &&
            (other as any).lamPairId === lamId
        );
        for (const p of partners) {
          if (!targetItems.some((t) => t.id === p.id) && !additionalPartners.some((t) => t.id === p.id)) {
            additionalPartners.push(p);
          }
        }
      }
    }
    targetItems = [...targetItems, ...additionalPartners];
  }

  if (targetItems.length === 0) {
    res.status(400).json({ error: "No eligible finished glass items found to dispatch." });
    return;
  }

  for (const item of targetItems) {
    item.isDispatched = true;
    item.currentStage = "Dispatched";
    item.dispatchedAt = nowIso;
    item.dispatchNoteNo = cleanNoteNo;
    if (cleanVehicle) (item as any).vehicleNo = cleanVehicle;
    if (cleanDriver) (item as any).driverName = cleanDriver;
    if (cleanRemarks) (item as any).dispatchRemarks = cleanRemarks;
    item.status = "Completed";

    productionHistoryDatabase.unshift({
      id: `hist-dispatch-${item.serialNumber}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      itemId: item.id,
      serialNumber: item.serialNumber,
      barcode: item.barcode,
      piNumber: item.piNumber,
      stage: "Finished",
      action: "Dispatched",
      prevStatus: "Finished Warehouse",
      newStatus: "Dispatched",
      status: "Completed",
      operator: cleanOperator,
      timestamp: nowIso,
      remarks: cleanRemarks
        ? `Dispatched: ${cleanRemarks} (Delivery Note #${cleanNoteNo})`
        : `Dispatched from warehouse to customer (Delivery Note #${cleanNoteNo})`,
    });
  }

  // Update affected PIs
  const affectedPiIds = Array.from(new Set(targetItems.map((i) => i.piId || i.piNumber).filter(Boolean)));
  for (const piRef of affectedPiIds) {
    const pi = piDatabase.find((p) => p.id === piRef || p.piNumber === piRef);
    if (pi) {
      const piItems = glassItemsDatabase.filter((i) => i.piId === pi.id || i.piNumber === pi.piNumber);
      const allDispatched = piItems.length > 0 && piItems.every((i) => i.isDispatched || i.currentStage === "Dispatched" || i.status === "Completed" || i.status === "Rejected");
      if (allDispatched) {
        pi.status = "Completed";
        pi.completedItemsCount = piItems.filter((i) => i.status !== "Rejected").length;
      }
    }
  }

  saveDatabaseToDisk(true);
  broadcastUpdate("stage_advanced", { count: targetItems.length, action: "dispatch" });

  createAndBroadcastNotification({
    title: `${targetItems.length} Items Dispatched`,
    message: `${targetItems.length} glass items successfully dispatched under Delivery Note #${cleanNoteNo}`,
    category: "STAGE_ADVANCE",
    type: "success",
    piNumber: targetItems[0]?.piNumber,
    operator: cleanOperator,
  });

  res.json({
    message: `${targetItems.length} items dispatched successfully`,
    count: targetItems.length,
    dispatchNoteNo: cleanNoteNo,
    dispatchedSerials: targetItems.map((i) => i.serialNumber),
  });
};
