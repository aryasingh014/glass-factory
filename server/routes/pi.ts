import { RequestHandler } from "express";
import fs from "fs";
import path from "path";
import { GlassItem, PIMaster, ProductionHistory, RejectRecord, ReworkRecord, ProductionStage, SystemNotification } from "@shared/api";
import { broadcastUpdate } from "./production";
import { logger } from "../lib/logger";

const DATA_DIR = path.resolve(process.cwd(), "server/data");
const DATA_FILE = path.join(DATA_DIR, "db.json");

// Persistence store initialized from disk
export const piDatabase: PIMaster[] = [];
export const glassItemsDatabase: GlassItem[] = [];
export const productionHistoryDatabase: ProductionHistory[] = [];
export const rejectDatabase: RejectRecord[] = [];
export const reworkDatabase: ReworkRecord[] = [];
export const notificationsDatabase: SystemNotification[] = [];

interface PersistedData {
  piDatabase: PIMaster[];
  glassItemsDatabase: GlassItem[];
  productionHistoryDatabase: ProductionHistory[];
  rejectDatabase: RejectRecord[];
  reworkDatabase: ReworkRecord[];
  notificationsDatabase?: SystemNotification[];
}

let isDbLoaded = false;
let saveDebounceTimer: NodeJS.Timeout | null = null;

export function loadDatabaseFromDisk(force = false): void {
  if (isDbLoaded && !force) return;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, "utf-8");
      if (content.trim()) {
        const parsed: Partial<PersistedData> = JSON.parse(content);
        piDatabase.splice(0, piDatabase.length, ...(Array.isArray(parsed.piDatabase) ? parsed.piDatabase : []));
        glassItemsDatabase.splice(0, glassItemsDatabase.length, ...(Array.isArray(parsed.glassItemsDatabase) ? parsed.glassItemsDatabase : []));
        // Ensure laminated glass items include Pairing in their processRoute before Lamination
        glassItemsDatabase.forEach((item) => {
          if (!Array.isArray(item.processRoute)) return;
          const descLower = `${item.glassType || ""} ${item.glassCode || ""}`.toLowerCase();
          const isLaminated = item.processRoute.includes("Lamination") || descLower.includes("lam") || descLower.includes("pvb") || descLower.includes("sgp");
          if (isLaminated && !item.processRoute.includes("Pairing")) {
            const lamIdx = item.processRoute.indexOf("Lamination");
            if (lamIdx >= 0) {
              item.processRoute.splice(lamIdx, 0, "Pairing");
            } else {
              item.processRoute.unshift("Pairing");
            }
            if (item.currentStage === "Lamination" && !item.completedStages?.includes("Pairing")) {
              item.currentStage = "Pairing";
            }
          }
        });

        // Normalize batches: 1 PDF is strictly 100% Colour or 100% Clear (never Mixed)
        let dataChanged = false;
        piDatabase.forEach((pi) => {
          const batchItems = glassItemsDatabase.filter(
            (item) => item.piId === pi.id || (item.piNumber && item.piNumber === pi.piNumber)
          );
          
          let batchFinish: "Colour" | "Clear" = "Clear";
          if (pi.colorOrClear === "Colour" || (pi.colorOrClear as any) === "Color") {
            batchFinish = "Colour";
          } else if (pi.colorOrClear === "Clear") {
            batchFinish = "Clear";
          } else if (String((pi as any).glassColor || "").toLowerCase().includes("colour")) {
            batchFinish = "Colour";
          } else {
            const clearCount = batchItems.filter((item) => item.colorOrClear === "Clear" || /clear/i.test(item.glassColor || "")).length;
            const colourCount = batchItems.filter((item) => item.colorOrClear === "Colour" || (item.colorOrClear as any) === "Color" || (/colour|color|tint|grey|gray|bronze|blue|green/i.test(item.glassColor || "") && !/clear/i.test(item.glassColor || ""))).length;
            batchFinish = colourCount > clearCount ? "Colour" : "Clear";
          }

          if (pi.colorOrClear !== batchFinish) {
            pi.colorOrClear = batchFinish;
            dataChanged = true;
          }

          batchItems.forEach((item) => {
            if (item.colorOrClear !== batchFinish) {
              item.colorOrClear = batchFinish;
              dataChanged = true;
            }
            if (batchFinish === "Colour" && (!item.glassColor || item.glassColor === "Clear Glass" || item.glassColor === "Clear Float")) {
              item.glassColor = pi.glassColor || "Coloured Glass";
              dataChanged = true;
            } else if (batchFinish === "Clear" && (!item.glassColor || item.glassColor === "Coloured Glass")) {
              item.glassColor = "Clear Glass";
              dataChanged = true;
            }
          });
          // Normalize glass category (Lamination vs DGU)
          // Interlayer specs (PVB, SGP, EVA, LAM) without spacers belong strictly to Lamination
          const batchText = (
            (pi.fileName || "") + " " +
            (pi.glassDescription || "") + " " +
            ((pi as any).remarks || "") + " " +
            batchItems.map((i) => `${i.glassType || ""} ${i.glassCode || ""} ${i.category || ""} ${i.remarks || ""}`).join(" ")
          ).toLowerCase();

          const isKnownLamBatch =
            pi.piNumber === "5301" ||
            pi.piNumber === "1620" ||
            (pi as any).batchNo === "5301" ||
            (pi as any).batchNo === "1620" ||
            (pi.fileName || "").toLowerCase().includes("10 mm clear") ||
            (pi.fileName || "").toLowerCase().includes("12 mm clear");
          const hasInterlayer = isKnownLamBatch || /pvb|sgp|eva|lamination|laminated|\blam\b/i.test(batchText);
          const hasSpacer = !isKnownLamBatch && /spacer|dgu|igu/i.test(batchText);

          let batchCat: "DGU" | "Lamination" | "DLGU" = pi.glassCategory === "DLGU" ? "DLGU" : (pi.glassCategory === "Lamination" ? "Lamination" : "DGU");
          if (pi.glassCategory === "DLGU" || (hasInterlayer && hasSpacer)) {
            batchCat = "DLGU";
          } else if (hasInterlayer && !hasSpacer) {
            batchCat = "Lamination";
          } else if (hasSpacer) {
            batchCat = "DGU";
          }

          if (pi.glassCategory !== batchCat) {
            pi.glassCategory = batchCat;
            dataChanged = true;
          }

          batchItems.forEach((item) => {
            // Preserve explicit category if set; otherwise use batch category
            const itemText = `${item.glassType || ""} ${item.glassCode || ""}`.toLowerCase();
            const isItemDlgu = item.glassCategory === "DLGU" || batchCat === "DLGU" || (/spacer|dgu|igu/i.test(itemText) && /pvb|sgp|eva|lamination|laminated|\blam\b/i.test(itemText));
            const isItemLam = !isItemDlgu && (item.glassCategory === "Lamination" || (/pvb|sgp|eva|lamination|laminated|\blam\b/i.test(itemText) && !/spacer|dgu|igu/i.test(itemText)));
            const isItemDgu = !isItemDlgu && (item.glassCategory === "DGU" || /spacer|dgu|igu/i.test(itemText));
            const resolvedCat: "DGU" | "Lamination" | "DLGU" = isItemDlgu ? "DLGU" : (isItemLam && !isItemDgu ? "Lamination" : (isItemDgu ? "DGU" : batchCat));

            if (item.glassCategory !== resolvedCat) {
              item.glassCategory = resolvedCat;
              dataChanged = true;
            }

            let expectedRoute: ProductionStage[];
            if (resolvedCat === "DLGU") {
              const isLamPane = item.colorOrClear === "Clear" || /lam|laminated|6mm clear/i.test(itemText);
              expectedRoute = isLamPane
                ? ["Cutting", "Pairing", "Lamination", "Pairing", "DGU", "Finished"]
                : ["Cutting", "Pairing", "DGU", "Finished"];
              if (!item.dlguPhase) {
                item.dlguPhase = isLamPane ? "LamPairing" : "DguPairing";
                dataChanged = true;
              }
            } else if (resolvedCat === "Lamination") {
              expectedRoute = ["Cutting", "Pairing", "Lamination", "Finished"];
              if (item.dlguPhase) {
                delete item.dlguPhase;
                dataChanged = true;
              }
            } else {
              expectedRoute = ["Cutting", "Pairing", "DGU", "Finished"];
              if (item.dlguPhase) {
                delete item.dlguPhase;
                dataChanged = true;
              }
            }

            if (JSON.stringify(item.processRoute) !== JSON.stringify(expectedRoute)) {
              item.processRoute = expectedRoute;
              dataChanged = true;
            }
          });
        });

        // Also normalize any remaining glassItems grouped by piId or piNumber (never generic batchNo)
        const orphanBatches = new Map<string, GlassItem[]>();
        glassItemsDatabase.forEach((item) => {
          const key = item.piId || item.piNumber || "default";
          if (!orphanBatches.has(key)) orphanBatches.set(key, []);
          orphanBatches.get(key)!.push(item);
        });
        orphanBatches.forEach((items) => {
          const clearCount = items.filter((item) => item.colorOrClear === "Clear" || /clear/i.test(item.glassColor || "")).length;
          const colourCount = items.filter((item) => item.colorOrClear === "Colour" || (item.colorOrClear as any) === "Color" || (/colour|color|tint|grey|gray|bronze|blue|green/i.test(item.glassColor || "") && !/clear/i.test(item.glassColor || ""))).length;
          const finish: "Colour" | "Clear" = colourCount > clearCount ? "Colour" : "Clear";

          items.forEach((item) => {
            if (item.colorOrClear !== finish) {
              item.colorOrClear = finish;
              dataChanged = true;
            }
            if (finish === "Clear" && item.glassColor === "Coloured Glass") {
              item.glassColor = "Clear Glass";
              dataChanged = true;
            } else if (finish === "Colour" && (item.glassColor === "Clear Glass" || item.glassColor === "Clear Float")) {
              item.glassColor = "Coloured Glass";
              dataChanged = true;
            }

            const itemText = `${item.glassType || ""} ${item.glassCode || ""}`.toLowerCase();
            const isItemDlgu = item.glassCategory === "DLGU" || (/spacer|dgu|igu/i.test(itemText) && /pvb|sgp|eva|lamination|laminated|\blam\b/i.test(itemText));
            const isItemLam = !isItemDlgu && (item.glassCategory === "Lamination" || (/pvb|sgp|eva|lamination|laminated|\blam\b/i.test(itemText) && !/spacer|dgu|igu/i.test(itemText)));
            const isItemDgu = !isItemDlgu && (item.glassCategory === "DGU" || /spacer|dgu|igu/i.test(itemText));
            const resolvedCat: "DGU" | "Lamination" | "DLGU" = isItemDlgu ? "DLGU" : (isItemLam && !isItemDgu ? "Lamination" : (isItemDgu ? "DGU" : (item.glassCategory || "DGU")));

            if (item.glassCategory !== resolvedCat) {
              item.glassCategory = resolvedCat;
              dataChanged = true;
            }

            let expectedRoute: ProductionStage[];
            if (resolvedCat === "DLGU") {
              const isLamPane = item.colorOrClear === "Clear" || /lam|laminated|6mm clear/i.test(itemText);
              expectedRoute = isLamPane
                ? ["Cutting", "Pairing", "Lamination", "Pairing", "DGU", "Finished"]
                : ["Cutting", "Pairing", "DGU", "Finished"];
              if (!item.dlguPhase) {
                item.dlguPhase = isLamPane ? "LamPairing" : "DguPairing";
                dataChanged = true;
              }
            } else if (resolvedCat === "Lamination") {
              expectedRoute = ["Cutting", "Pairing", "Lamination", "Finished"];
              if (item.dlguPhase) {
                delete item.dlguPhase;
                dataChanged = true;
              }
            } else {
              expectedRoute = ["Cutting", "Pairing", "DGU", "Finished"];
              if (item.dlguPhase) {
                delete item.dlguPhase;
                dataChanged = true;
              }
            }

            if (JSON.stringify(item.processRoute) !== JSON.stringify(expectedRoute)) {
              item.processRoute = expectedRoute;
              dataChanged = true;
            }
          });
        });

        // Synchronize paired DGU / DLGU partner panes that were assembled and finished together
        const finishedItems = glassItemsDatabase.filter((i) => i.currentStage === "Finished" || i.status === "Completed");
        finishedItems.forEach((fin) => {
          if (fin.glassCategory === "DLGU" || fin.glassCategory === "DGU") {
            const finPairId = (fin as any).lamPairId;
            glassItemsDatabase.forEach((other) => {
              if (other.id !== fin.id && other.currentStage === "DGU") {
                const samePair = (finPairId && (other as any).lamPairId === finPairId) ||
                  (other.posNo === fin.posNo && other.width === fin.width && other.height === fin.height && (other.piId === fin.piId || other.piNumber === fin.piNumber || other.orderNo === fin.orderNo));
                if (samePair) {
                  other.currentStage = "Finished";
                  other.status = "Completed";
                  if (!other.completedStages.includes("DGU")) other.completedStages.push("DGU");
                  other.updatedAt = new Date().toISOString();
                  dataChanged = true;
                }
              }
            });
          }
        });

        // Update completed counts on PI masters
        piDatabase.forEach((pi) => {
          const cleanId = (pi.id || "").replace(/^STK-/i, "");
          const cleanPiNo = (pi.piNumber || "").replace(/^STK-/i, "");
          const piItems = glassItemsDatabase.filter(
            (i) => i.piId === pi.id || i.piNumber === pi.piNumber || i.piId === cleanId || i.piNumber === cleanPiNo
          );
          if (piItems.length > 0) {
            const comp = piItems.filter((i) => i.currentStage === "Finished" || i.status === "Completed").length;
            if (pi.completedItemsCount !== comp) {
              pi.completedItemsCount = comp;
              dataChanged = true;
            }
            if (comp >= piItems.length && pi.status !== "Completed") {
              pi.status = "Completed";
              dataChanged = true;
            }
          }
        });

        if (dataChanged) {
          saveDatabaseToDisk();
        }

        productionHistoryDatabase.splice(0, productionHistoryDatabase.length, ...(Array.isArray(parsed.productionHistoryDatabase) ? parsed.productionHistoryDatabase : []));
        rejectDatabase.splice(0, rejectDatabase.length, ...(Array.isArray(parsed.rejectDatabase) ? parsed.rejectDatabase : []));
        reworkDatabase.splice(0, reworkDatabase.length, ...(Array.isArray(parsed.reworkDatabase) ? parsed.reworkDatabase : []));
        notificationsDatabase.splice(0, notificationsDatabase.length, ...(Array.isArray(parsed.notificationsDatabase) ? parsed.notificationsDatabase : []));

        // If no persisted notifications yet, seed from real historical production actions
        if (notificationsDatabase.length === 0) {
          productionHistoryDatabase.slice(0, 15).forEach((h, idx) => {
            const rawDate = h.timestamp ? new Date(h.timestamp).getTime() : Date.now() - idx * 1000;
            const isReject = h.action?.toLowerCase().includes("reject") || h.status === "Rejected";
            const isRework = h.action?.toLowerCase().includes("rework") || h.status === "Reworking";
            const isUpload = h.action?.toLowerCase().includes("upload") || h.action?.toLowerCase().includes("batch");

            let type: "info" | "success" | "warning" | "destructive" = "success";
            let category: any = "STAGE_ADVANCE";
            if (isReject) { type = "destructive"; category = "REJECTION"; }
            else if (isRework) { type = "warning"; category = "REWORK"; }
            else if (isUpload) { type = "info"; category = "BATCH_UPLOAD"; }

            notificationsDatabase.push({
              id: `notif-${h.id || idx}-${rawDate}`,
              title: h.action || `${h.stage} Stage Advanced`,
              message: h.remarks || `Item ${h.serialNumber} processed at ${h.stage} by ${h.operator || "Operator"}.`,
              category,
              type,
              stage: String(h.stage || ""),
              serialNumber: h.serialNumber,
              operator: h.operator,
              timestamp: h.timestamp || new Date(rawDate).toISOString(),
              rawDate,
              read: false,
              createdAt: h.timestamp || new Date(rawDate).toISOString(),
            });
          });
        }
      } else {
        piDatabase.length = 0;
        glassItemsDatabase.length = 0;
        productionHistoryDatabase.length = 0;
        rejectDatabase.length = 0;
        reworkDatabase.length = 0;
        notificationsDatabase.length = 0;
      }
    } else {
      piDatabase.length = 0;
      glassItemsDatabase.length = 0;
      productionHistoryDatabase.length = 0;
      rejectDatabase.length = 0;
      reworkDatabase.length = 0;
      notificationsDatabase.length = 0;
    }
    isDbLoaded = true;
  } catch (err: any) {
    logger.error("Failed to load database from disk", { error: err?.message || String(err) });
  }
}

export function saveDatabaseToDisk(immediate = false): void {
  const executeSave = () => {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const data: PersistedData = {
        piDatabase,
        glassItemsDatabase,
        productionHistoryDatabase,
        rejectDatabase,
        reworkDatabase,
        notificationsDatabase,
      };
      // Non-blocking async file write with compact JSON
      fs.writeFile(DATA_FILE, JSON.stringify(data), "utf-8", (err) => {
        if (err) {
          logger.error("Failed to save database to disk asynchronously", { error: err.message });
        }
      });
    } catch (err: any) {
      logger.error("Failed to save database to disk", { error: err?.message || String(err) });
    }
  };

  if (immediate) {
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer);
      saveDebounceTimer = null;
    }
    executeSave();
  } else {
    if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(executeSave, 100);
  }
}

export function createAndBroadcastNotification(params: {
  title: string;
  message: string;
  category?: "STAGE_ADVANCE" | "REJECTION" | "REWORK" | "BATCH_UPLOAD" | "PI_CREATED" | "PI_RELEASED" | "SYSTEM";
  type?: "info" | "success" | "warning" | "destructive";
  stage?: string;
  serialNumber?: string;
  batchNumber?: string;
  piNumber?: string;
  operator?: string;
}): SystemNotification {
  const now = new Date();
  const notif: SystemNotification = {
    id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    title: params.title,
    message: params.message,
    category: params.category || "SYSTEM",
    type: params.type || "info",
    stage: params.stage,
    serialNumber: params.serialNumber,
    batchNumber: params.batchNumber,
    piNumber: params.piNumber,
    operator: params.operator || "System",
    timestamp: now.toISOString(),
    rawDate: now.getTime(),
    read: false,
    createdAt: now.toISOString(),
  };

  notificationsDatabase.unshift(notif);
  if (notificationsDatabase.length > 100) {
    notificationsDatabase.splice(100);
  }

  saveDatabaseToDisk();
  broadcastUpdate("system_notification", notif);
  return notif;
}

// Load persisted state on startup
loadDatabaseFromDisk(true);

export const handleGetPIs: RequestHandler = (req, res) => {
  // Sync real-time completion status for all batches
  let statusChanged = false;
  piDatabase.forEach((pi) => {
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
    if (piItems.length > 0) {
      const completedCount = piItems.filter((i) => i.currentStage === "Finished" || i.status === "Completed").length;
      pi.completedItemsCount = completedCount;
      const newStatus = completedCount >= piItems.length ? "Completed" : (completedCount > 0 || piItems.some((i) => i.currentStage !== "Cutting" || i.completedStages?.length) ? "In Production" : (pi.status || "Pending"));
      if (pi.status !== newStatus) {
        pi.status = newStatus;
        statusChanged = true;
      }
    }
  });

  if (statusChanged) {
    saveDatabaseToDisk();
  }

  const page = parseInt(req.query.page as string, 10);
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
  const statusFilter = req.query.status as string | undefined;

  let filtered = piDatabase;
  if (statusFilter) {
    filtered = filtered.filter((p) => p.status === statusFilter);
  }

  // If no page param, return all (backward compatible)
  if (isNaN(page) || page < 1) {
    res.json(filtered);
    return;
  }

  const total = filtered.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const data = filtered.slice(start, start + limit);

  res.json({
    data,
    pagination: { page, limit, total, totalPages },
  });
};

export const handleGetPIDetails: RequestHandler = (req, res) => {
  const idStr = String(req.params.id || "");
  const cleanId = idStr.replace(/^STK-/i, "");
  const pi = piDatabase.find((p) => p.id === idStr || p.piNumber === idStr || p.id === cleanId || p.piNumber === cleanId);
  if (!pi) {
    res.status(404).json({ message: "PI not found" });
    return;
  }
  const cleanPiId = (pi.id || "").replace(/^STK-/i, "");
  const cleanPiNo = (pi.piNumber || "").replace(/^STK-/i, "");
  const items = glassItemsDatabase.filter(
    (item) =>
      item.piId === pi.id ||
      item.piNumber === pi.piNumber ||
      item.piId === cleanPiId ||
      item.piNumber === cleanPiNo ||
      item.batchNo === cleanPiNo ||
      item.batchNo === pi.piNumber ||
      (item.sfoNo && (item.sfoNo === pi.piNumber || item.sfoNo === cleanPiNo))
  );
  res.json({ pi, items });
};

export const handleDeletePI: RequestHandler = (req, res) => {
  const { id } = req.params;
  const piIndex = piDatabase.findIndex((p) => p.id === id || p.piNumber === id);

  if (piIndex === -1) {
    res.status(404).json({ message: "PI document not found" });
    return;
  }

  const deletedPI = piDatabase[piIndex];
  piDatabase.splice(piIndex, 1);

  // Remove associated glass items and collect their serials/barcodes
  const deletedIdentifiers = new Set<string>();
  if (deletedPI.piNumber) deletedIdentifiers.add(deletedPI.piNumber);

  for (let i = glassItemsDatabase.length - 1; i >= 0; i--) {
    const item = glassItemsDatabase[i];
    if (item.piId === deletedPI.id || item.piNumber === deletedPI.piNumber) {
      if (item.serialNumber) deletedIdentifiers.add(item.serialNumber);
      if (item.barcode) deletedIdentifiers.add(item.barcode);
      glassItemsDatabase.splice(i, 1);
    }
  }

  // Clean up associated history records
  for (let i = productionHistoryDatabase.length - 1; i >= 0; i--) {
    const h = productionHistoryDatabase[i];
    if (deletedIdentifiers.has(h.piNumber) || deletedIdentifiers.has(h.serialNumber) || deletedIdentifiers.has(h.barcode)) {
      productionHistoryDatabase.splice(i, 1);
    }
  }

  // Clean up associated reject records
  for (let i = rejectDatabase.length - 1; i >= 0; i--) {
    const r = rejectDatabase[i];
    if (deletedIdentifiers.has(r.piNumber) || deletedIdentifiers.has(r.serialNumber) || deletedIdentifiers.has(r.barcode)) {
      rejectDatabase.splice(i, 1);
    }
  }

  // Clean up associated rework records
  for (let i = reworkDatabase.length - 1; i >= 0; i--) {
    const rw = reworkDatabase[i];
    if (deletedIdentifiers.has(rw.piNumber) || deletedIdentifiers.has(rw.serialNumber) || deletedIdentifiers.has(rw.barcode)) {
      reworkDatabase.splice(i, 1);
    }
  }

  saveDatabaseToDisk();
  broadcastUpdate("pi_deleted", { piId: deletedPI.id });
  const cleanBatchNo = (deletedPI.piNumber || "").replace(/^B(?=\d)/i, "");
  createAndBroadcastNotification({
    title: `Batch #${cleanBatchNo} Deleted`,
    message: `Batch ${cleanBatchNo} (${deletedPI.customerName || "Customer"}) removed from system`,
    category: "SYSTEM",
    type: "warning",
    piNumber: deletedPI.piNumber,
    operator: (req as any).user?.username || "Admin",
  });
  res.json({ message: `Batch ${cleanBatchNo} deleted successfully`, deletedPI });
};

export const handleReleasePI: RequestHandler = (req, res) => {
  const { id } = req.params;
  const pi = piDatabase.find((p) => p.id === id || p.piNumber === id);

  if (!pi) {
    res.status(404).json({ message: "PI document not found" });
    return;
  }

  pi.status = "In Production";

  const items = glassItemsDatabase.filter(
    (item) => item.piId === pi.id || item.piNumber === pi.piNumber
  );

  items.forEach((item) => {
    if (item.status === "Pending") {
      item.status = "In Production";
    }
  });

  saveDatabaseToDisk();
  broadcastUpdate("pi_released", { piId: pi.id });
  createAndBroadcastNotification({
    title: `PI #${pi.piNumber} Released`,
    message: `Order for ${pi.customerName || "Customer"} (${items.length} items) released to shop floor workstations`,
    category: "PI_RELEASED",
    type: "success",
    piNumber: pi.piNumber,
    operator: (req as any).user?.username || "Supervisor",
  });
  res.json({ message: `PI ${pi.piNumber} released to production successfully`, pi, items });
};

