import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { isGlassTypeColour, isDlguGlass, isDguGlass, isLaminatedGlass } from "@shared/api";
export { isDlguGlass, isDguGlass, isLaminatedGlass };

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats numbers according to UAE standards (en-AE locale)
 * e.g., 1234.56 -> "1,234.56"
 */
export function formatAENumber(num: number | null | undefined, decimals: number = 2): string {
  if (num == null || !Number.isFinite(num)) return "0.00";
  return num.toLocaleString("en-AE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Formats currency in UAE Dirhams (AED / د.إ)
 * e.g., 1234.56 -> "AED 1,234.56"
 */
export function formatAEDCurrency(amount: number): string {
  if (isNaN(amount)) return "AED 0.00";
  return `AED ${formatAENumber(amount, 2)}`;
}

/**
 * Formats platform date in Gulf Standard Time (GST - Asia/Dubai time zone)
 * e.g., "01/09/2026"
 */
export function formatPlatformDate(dateInput: string | Date | number | undefined | null): string {
  if (!dateInput) return "—";
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return String(dateInput);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Dubai",
  });
}

/**
 * Formats platform time in Gulf Standard Time (GST - Asia/Dubai time zone)
 * e.g., "11:22:45 PM"
 */
export function formatPlatformTime(dateInput: string | Date | number | undefined | null): string {
  if (!dateInput) return "—";
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: "Asia/Dubai",
  });
}

/**
 * Formats date and time in Gulf Standard Time (GST - Asia/Dubai time zone)
 * e.g., "01/09/2026, 11:22:45 PM"
 */
export function formatPlatformDateTime(dateInput: string | Date | number | undefined | null): string {
  if (!dateInput) return "—";
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return String(dateInput);
  return `${formatPlatformDate(date)}, ${formatPlatformTime(date)}`;
}

/**
 * Formats dates in Gulf Standard Time (GST - Asia/Dubai time zone)
 * e.g., "25-Apr-2026"
 */
export function formatDubaiDate(dateInput: string | Date | number): string {
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return String(dateInput);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Dubai",
  });
}

/**
 * Formats date and time in Gulf Standard Time (GST - Asia/Dubai time zone)
 * e.g., "26/07/2026, 14:30:45 GST"
 */
export function formatDubaiDateTime(dateInput: string | Date | number): string {
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return String(dateInput);
  return date.toLocaleString("en-AE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Dubai",
    timeZoneName: "short",
  });
}

/**
 * Safely parses Excel serial dates (e.g., 45400) while avoiding false positives on 5-digit product codes
 */
export function formatExcelDate(val: string | number | undefined): string {
  if (!val) return "";
  if (typeof val === "number") {
    if (val > 35000 && val < 65399) {
      const date = new Date(Math.round((val - (25567 + 2)) * 86400 * 1000));
      return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Dubai" });
    }
    return String(val);
  }
  const str = String(val).trim();
  if (/^\d{5}$/.test(str)) {
    const n = Number(str);
    if (n > 35000 && n < 65399) {
      const date = new Date(Math.round((n - (25567 + 2)) * 86400 * 1000));
      return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Dubai" });
    }
  }
  return str;
}

/**
 * Determines whether a glass item is Clear or Coloured glass.
 * Prioritizes user's explicit selection (colorOrClear: 'Clear' | 'Colour').
 */
export function getItemFinish(item: { finish?: string; colorOrClear?: string; category?: string; glassType?: string; glassColor?: string } | null | undefined): "Clear" | "Colour" {
  if (!item) return "Clear";

  const typeStr = (item.glassType || "").toLowerCase();
  const hasColourKeyword = isGlassTypeColour(item.glassType, item.glassColor, item.category);

  if (typeStr.includes("clear") && !hasColourKeyword) {
    return "Clear";
  }

  if (hasColourKeyword) {
    return "Colour";
  }

  if (item.finish === "Colour" || item.finish === "Color") return "Colour";
  if (item.colorOrClear === "Colour" || item.colorOrClear === "Color") return "Colour";
  if (item.finish === "Clear") return "Clear";
  if (item.colorOrClear === "Clear") return "Clear";

  return "Clear";
}

/**
 * Determines whether a glass item is OP (Outer Pane) or IP (Inner Pane).
 */
export function getGlassPaneRole(item: {
  finish?: string;
  colorOrClear?: string;
  glassType?: string;
  category?: string;
  layer?: string;
  paneRole?: string;
  paneType?: string;
} | null | undefined): {
  code: "OP" | "IP";
  name: string;
  badgeLabel: string;
  colorClass: string;
} {
  if (!item) {
    return {
      code: "OP",
      name: "Outer Pane",
      badgeLabel: "OP (Outer Pane)",
      colorClass: "bg-purple-100 text-purple-800 border-purple-300",
    };
  }

  const layer = String(item.layer || (item as any).paneRole || (item as any).paneType || "").toUpperCase();
  if (layer.includes("OP") || layer.includes("OUTER") || layer.includes("LAYER1") || layer.includes("PANE1") || layer.includes("FACE1")) {
    return {
      code: "OP",
      name: "Outer Pane",
      badgeLabel: "OP (Outer Pane)",
      colorClass: "bg-purple-100 text-purple-800 border-purple-300",
    };
  }
  if (layer.includes("IP") || layer.includes("INNER") || layer.includes("LAYER2") || layer.includes("PANE2") || layer.includes("FACE2")) {
    return {
      code: "IP",
      name: "Inner Pane",
      badgeLabel: "IP (Inner Pane)",
      colorClass: "bg-cyan-100 text-cyan-800 border-cyan-300",
    };
  }

  const finish = getItemFinish(item);
  if (finish === "Colour") {
    return {
      code: "OP",
      name: "Outer Pane",
      badgeLabel: "OP (Outer Pane)",
      colorClass: "bg-purple-100 text-purple-800 border-purple-300",
    };
  }

  return {
    code: "IP",
    name: "Inner Pane",
    badgeLabel: "IP (Inner Pane)",
    colorClass: "bg-cyan-100 text-cyan-800 border-cyan-300",
  };
}

/**
 * Returns human-readable display stage for a glass item.
 * For DLGU items at DGU workstation, displays "DLGU" instead of "DGU".
 */
export function getDisplayStage(
  item: { processRoute?: string[]; glassType?: string; glassCode?: string; itemCode?: string; glassCategory?: string; currentStage?: string; dlguPhase?: string; completedStages?: string[] } | null | undefined,
  rawStage?: string
): string {
  const stage = rawStage || item?.currentStage || "Cutting";
  if (!item) return stage;
  const isDlgu = isDlguGlass(item) || (item as any).glassCategory === "DLGU";
  if (isDlgu) {
    if (stage === "DGU") return "DLGU";
    if (stage === "Pairing") return (item.dlguPhase === "DguPairing" || item.completedStages?.includes("Lamination")) ? "DLGU Pairing" : "Lam Pairing";
  }
  return stage;
}

/**
 * Returns effective quantity, SQM, and unit label for a glass item.
 * For DGU glass after cutting or when displaying DGU / FG / Data:
 * The quantity is reduced to actual DGU unit quantity (Math.ceil(item.qty / 2) if in cut panes).
 */
export function getDguEffectiveQtyAndSqm(
  item: {
    qty: number;
    width: number;
    height: number;
    currentStage?: string;
    processRoute?: string[];
    glassType?: string;
    glassCode?: string;
    glassCategory?: string;
    isDguReduced?: boolean;
  } | null | undefined,
  targetStage?: string
): { qty: number; sqm: number; unitLabel: string; isDgu: boolean } {
  if (!item) return { qty: 0, sqm: 0, unitLabel: "Nos", isDgu: false };

  const isDlgu = isDlguGlass(item);
  const isDgu = isDguGlass(item) || isDlgu;
  if (!isDgu) {
    const rawSqm = parseFloat(((item.width * item.height * item.qty) / 1000000).toFixed(2));
    return { qty: item.qty, sqm: rawSqm, unitLabel: "Nos", isDgu: false };
  }

  const isAlreadyReduced = item.isDguReduced === true;
  const isAfterCutting = item.currentStage && item.currentStage !== "Cutting";
  const isTargetDguOrFg = targetStage === "DGU" || targetStage === "Finished" || !targetStage;

  let actualQty = item.qty;
  if (!isAlreadyReduced && (isAfterCutting || isTargetDguOrFg)) {
    actualQty = Math.ceil((item.qty || 1) / 2);
  }
  const calcSqm = parseFloat(((item.width * item.height * actualQty) / 1000000).toFixed(2));
  return {
    qty: actualQty,
    sqm: calcSqm,
    unitLabel: isDlgu ? "DLGU Units" : "DGU Units",
    isDgu: true,
  };
}

/**
 * Strips any legacy SFO or 'B' prefix from batch identifiers to display only the clean Batch Number.
 * e.g., "201765-B5442" -> "5442"
 * e.g., "1765-B5441" -> "5441"
 * e.g., "STK-201765-B5442" -> "5442"
 * e.g., "B5442" -> "5442"
 * e.g., "B5441" -> "5441"
 * e.g., "5442" -> "5442"
 */
export function formatBatchNumber(batchIdentifier?: string): string {
  if (!batchIdentifier) return "-";
  let clean = String(batchIdentifier).replace(/^STK-/i, "").replace(/^PI-/i, "").replace(/^BATCH-/i, "").trim();

  // If already clean number or B+number (e.g. "5442", "B5442")
  if (/^B?\d+$/i.test(clean)) {
    return clean.replace(/^B(?=\d)/i, "");
  }

  if (clean.includes("-")) {
    const parts = clean.split("-").map((p) => p.trim()).filter(Boolean);

    // 1. Look for part that is B followed by digits (e.g. "B5442" in "201765-B5442")
    const bPart = parts.find((p) => /^B\d+$/i.test(p));
    if (bPart) {
      return bPart.replace(/^B(?=\d)/i, "");
    }

    // 2. Look for part that is purely digits (e.g. "5846" in "5846-ASHBILIA" or "5826" in "5826-MERAKI-DISTRICT_O")
    const numPart = parts.find((p) => /^\d+$/.test(p));
    if (numPart) {
      return numPart;
    }

    // 3. Fallback: find any part that has digits (e.g. "B1", "BATCH1")
    const partWithDigits = parts.find((p) => /\d/.test(p));
    if (partWithDigits) {
      return partWithDigits.replace(/^B(?=\d)/i, "");
    }

    // 4. If no digits at all, return the clean string
    return clean;
  }

  return clean.replace(/^B(?=\d)/i, "");
}

/**
 * Resolves the genuine Proforma Invoice (PI) or Order reference for display.
 * If the provided piNumber is identical to the batch number (e.g. both are "6243"),
 * it checks for an explicit orderNo or orderList (e.g. "03146").
 * If neither is distinct from the batch number, it returns null to prevent duplicate badges.
 */
export function getDistinctPiDisplay(
  itemOrSheet?: { orderNo?: string; piNumber?: string; batchNo?: string; orderList?: string[] } | null,
  fallbackBatch?: string
): string | null {
  if (!itemOrSheet) return null;
  const batch = fallbackBatch || itemOrSheet.batchNo || "";
  const fmtBatch = formatBatchNumber(batch);

  // 1. If explicit orderList is available and has non-batch order numbers
  if (Array.isArray(itemOrSheet.orderList) && itemOrSheet.orderList.length > 0) {
    const validOrders = itemOrSheet.orderList.filter(
      (ord) => Boolean(ord) && ord !== batch && formatBatchNumber(ord) !== fmtBatch
    );
    if (validOrders.length > 0) {
      return validOrders.join(", ");
    }
  }

  // 2. If orderNo is present and distinct from batch
  if (
    itemOrSheet.orderNo &&
    itemOrSheet.orderNo !== batch &&
    formatBatchNumber(itemOrSheet.orderNo) !== fmtBatch
  ) {
    return itemOrSheet.orderNo;
  }

  // 3. If piNumber is present and distinct from batch
  if (
    itemOrSheet.piNumber &&
    itemOrSheet.piNumber !== batch &&
    formatBatchNumber(itemOrSheet.piNumber) !== fmtBatch
  ) {
    return String(itemOrSheet.piNumber).replace(/^STK-/i, "").trim();
  }

  return null;
}

/**
 * Validates if two glass sticker panes
 * form an exact 1+1 DGU, Lamination, or DLGU Pair based on factory sticker specifications:
 * - Order No / PI #
 * - OB #
 * - POS # (Position Number)
 * - QTY (Line Qty / Total Position Quantity)
 * - Width (mm)
 * - Height (mm)
 * - Client Name
 * - Project Name
 * - Glass Code
 */
export function isDguStickerPairMatch(col: any, clr: any): boolean {
  if (!col || !clr) return false;

  const isColDlgu = isDlguGlass(col) || col.glassCategory === "DLGU";
  const isClrDlgu = isDlguGlass(clr) || clr.glassCategory === "DLGU";
  const isColLam = isLaminatedGlass(col) || col.glassCategory === "Lamination";
  const isClrLam = isLaminatedGlass(clr) || clr.glassCategory === "Lamination";
  if ((isColDlgu && !isClrDlgu) || (!isColDlgu && isClrDlgu)) return false;

  if (isColDlgu && isClrDlgu) {
    const isColLamDone = Array.isArray(col.completedStages) && col.completedStages.includes("Lamination");
    const isClrLamDone = Array.isArray(clr.completedStages) && clr.completedStages.includes("Lamination");
    const isColInLam = col.currentStage === "Lamination";
    const isClrInLam = clr.currentStage === "Lamination";

    const isColColour = col.colorOrClear === "Colour" || String(col.category || "").toLowerCase().includes("colour");
    const isClrColour = clr.colorOrClear === "Colour" || String(clr.category || "").toLowerCase().includes("colour");

    // If one is Colour and one is Clear: Phase 2 (DGU Pairing)
    if (isColColour !== isClrColour) {
      const clrPane = isColColour ? clr : col;
      const isClrReady =
        clrPane.dlguPhase === "DguPairing" ||
        isColLamDone ||
        isClrLamDone ||
        (Array.isArray(clrPane.completedStages) && clrPane.completedStages.includes("Lamination"));
      if (!isClrReady) return false;
    } else {
      // Phase 1: Lamination Pairing (e.g. 6mm Clear + 13.52mm Clear Laminated sticker, or 2 identical clear lites)
      // Distinct physical panes (serials/IDs checked) are valid pairing candidates.
    }
  } else {
    // STRICT RULE: Category must match (DGU only matches DGU, Lamination only matches Lamination)
    const colCat = col.glassCategory || (isDguGlass(col) ? "DGU" : isLaminatedGlass(col) ? "Lamination" : null);
    const clrCat = clr.glassCategory || (isDguGlass(clr) ? "DGU" : isLaminatedGlass(clr) ? "Lamination" : null);
    if (colCat && clrCat && colCat !== clrCat) return false;

    const isColDgu = isDguGlass(col) || col.glassCategory === "DGU";
    const isClrDgu = isDguGlass(clr) || clr.glassCategory === "DGU";

    if ((isColDgu && isClrLam) || (isColLam && isClrDgu)) return false;

    // STRICT RULE: DGU requires 1 Colour + 1 Clear pane when finishes are specified
    if (isColDgu && isClrDgu && col.colorOrClear && clr.colorOrClear) {
      const isColColour = col.colorOrClear === "Colour" || col.colorOrClear === "Color" || String(col.category || "").toLowerCase().includes("colour");
      const isClrColour = clr.colorOrClear === "Colour" || clr.colorOrClear === "Color" || String(clr.category || "").toLowerCase().includes("colour");
      if (isColColour === isClrColour) return false;
    }

    // STRICT RULE: Lamination requires 2 distinct lites (cannot pair exact same barcode/id)
    if (isColLam && isClrLam) {
      const barcodeA = String(col.barcode || "");
      const barcodeB = String(clr.barcode || "");
      if (barcodeA && barcodeB && barcodeA === barcodeB) return false;
    }
  }

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

  // 6. Glass Code must match for pure DGU (when present on both)
  if (!isColDlgu && !isColLam) {
    const colCode = String(col.glassCode || col.itemCode || "").trim().toLowerCase();
    const clrCode = String(clr.glassCode || clr.itemCode || "").trim().toLowerCase();
    if (colCode && clrCode && colCode !== clrCode) return false;
  }

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

export function isDispatchedItem(item: any): boolean {
  if (!item) return false;
  return (
    item.isDispatched === true ||
    item.currentStage === "Dispatched" ||
    Boolean(item.dispatchedAt)
  );
}

/**
 * Calculates assembled glass units for a collection of glass items.
 * Distinguishes between raw piece/pane count (pcs) and assembled multi-pane units:
 * - DGU: 2 panes (1 Colour + 1 Clear, or 2 clear panes) = 1 DGU Unit
 * - DLGU: 3 panes (1 Colour + 2 Clear Laminated) = 1 DLGU Unit
 * - Lamination: 2 panes = 1 Laminated Unit
 * - Monolithic: 1 pane = 1 Monolithic Unit
 */
export function calculateAssembledUnits(itemList: any[]): { totalUnits: number; totalSqm: number } {
  if (!Array.isArray(itemList) || itemList.length === 0) {
    return { totalUnits: 0, totalSqm: 0 };
  }

  const isColour = (i: any) => getItemFinish(i) === "Colour";
  const dlguList = itemList.filter((i) => isDlguGlass(i));
  const pureDguList = itemList.filter((i) => isDguGlass(i) && !isDlguGlass(i));
  const nonDguList = itemList.filter((i) => !isDguGlass(i) && !isDlguGlass(i));

  const dlguCol = dlguList.filter(isColour).reduce((acc, curr) => acc + (curr.qty || 1), 0);
  const dlguClr = dlguList.filter((i) => !isColour(i)).reduce((acc, curr) => acc + (curr.qty || 1), 0);
  const dlguU = dlguCol > 0 && dlguClr > 0 ? Math.min(dlguCol, Math.floor(dlguClr / 2)) : Math.floor((dlguCol + dlguClr) / 3);

  const dguColPanes = pureDguList.filter(isColour).reduce((acc, curr) => acc + (curr.qty || 1), 0);
  const dguClrPanes = pureDguList.filter((i) => !isColour(i)).reduce((acc, curr) => acc + (curr.qty || 1), 0);
  const pureDguU = dguColPanes > 0 && dguClrPanes > 0 ? Math.min(dguColPanes, dguClrPanes) : (dguColPanes > 0 ? dguColPanes : Math.ceil(pureDguList.reduce((acc, curr) => acc + (curr.qty || 1), 0) / 2));

  const lamList = nonDguList.filter((i) => isLaminatedGlass(i) || i.glassCategory === "Lamination" || i.processRoute?.includes("Lamination"));
  const monoList = nonDguList.filter((i) => !isLaminatedGlass(i) && i.glassCategory !== "Lamination" && !i.processRoute?.includes("Lamination"));
  const lamU = Math.ceil(lamList.reduce((acc, curr) => acc + (curr.qty || 1), 0) / 2);
  const monoU = monoList.reduce((acc, curr) => acc + (curr.qty || 1), 0);

  const dguSqmTotal = dlguList.filter(isColour).reduce((acc, curr) => acc + (curr.sqm || 0), 0) +
    pureDguList.filter(isColour).reduce((acc, curr) => acc + (curr.sqm || 0), 0);
  const nonDguSqmTotal = nonDguList.reduce((acc, curr) => acc + (curr.sqm || 0), 0);

  return {
    totalUnits: dlguU + pureDguU + lamU + monoU,
    totalSqm: parseFloat((dguSqmTotal + nonDguSqmTotal).toFixed(2)),
  };
}


