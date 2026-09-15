import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats numbers according to UAE standards (en-AE locale)
 * e.g., 1234.56 -> "1,234.56"
 */
export function formatAENumber(num: number, decimals: number = 2): string {
  if (isNaN(num)) return "0.00";
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
export function getItemFinish(item: { colorOrClear?: string; category?: string; glassType?: string; glassColor?: string } | null | undefined): "Clear" | "Colour" {
  if (!item) return "Clear";

  const typeStr = (item.glassType || "").toLowerCase();
  const colorStr = (item.glassColor || "").toLowerCase();
  const catStr = (item.category || "").toLowerCase();

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

  if (typeStr.includes("clear") && !hasColourKeyword) {
    return "Clear";
  }

  if (hasColourKeyword) {
    return "Colour";
  }

  if (item.colorOrClear === "Colour" || item.colorOrClear === "Color") return "Colour";
  if (item.colorOrClear === "Clear") return "Clear";

  return "Clear";
}

/**
 * Checks if a glass item is a DLGU (Double Laminated Glazed Unit).
 */
export function isDlguGlass(item: { processRoute?: string[]; glassType?: string; glassCode?: string; itemCode?: string; glassCategory?: string } | null | undefined): boolean {
  if (!item) return false;
  if (item.glassCategory === "DLGU") return true;
  if (item.glassCategory === "Lamination" || item.glassCategory === "Laminated") return false;
  if (Array.isArray(item.processRoute)) {
    if (item.processRoute.includes("Lamination") && item.processRoute.includes("DGU")) return true;
    if (item.processRoute.includes("Lamination") && !item.processRoute.includes("DGU")) return false;
  }
  const str = `${item.glassType || ""} ${item.glassCode || ""} ${item.itemCode || ""}`.toLowerCase();
  const hasSpacer = str.includes("spacer") || str.includes("dgu") || str.includes("igu");
  const hasLam = str.includes("lam") || str.includes("lamination") || str.includes("laminated") || str.includes("pvb") || str.includes("sgp");
  return hasSpacer && hasLam;
}

/**
 * Checks if a glass item is a DGU (Double Glazing Unit) glass item.
 */
export function isDguGlass(item: { processRoute?: string[]; glassType?: string; glassCode?: string; glassCategory?: string } | null | undefined): boolean {
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

/**
 * Checks if a glass item is Laminated glass (process route has Lamination or glass spec indicates laminated).
 */
export function isLaminatedGlass(item: { processRoute?: string[]; glassType?: string; glassCode?: string; itemCode?: string; glassCategory?: string } | null | undefined): boolean {
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
  let clean = String(batchIdentifier).replace(/^STK-/i, "").trim();
  if (clean.includes("-")) {
    const parts = clean.split("-");
    clean = parts[parts.length - 1].trim();
  }
  return clean.replace(/^B(?=\d)/i, "");
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
      // Phase 1: Lamination Pairing (e.g. 6mm Clear + 13.52mm Clear Laminated sticker)
      const liteKeyA = col.glassType || col.glassCode || "";
      const liteKeyB = clr.glassType || clr.glassCode || "";
      if (!liteKeyA || !liteKeyB) return false;
      if (liteKeyA === liteKeyB) return false; // Same lite – cannot pair with itself
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

    // STRICT RULE: Lamination requires 2 complementary lites (cannot pair identical panes from same batch/barcode)
    if (isColLam && isClrLam) {
      const barcodeA = String(col.barcode || "");
      const barcodeB = String(clr.barcode || "");
      if (barcodeA && barcodeB && barcodeA === barcodeB) return false;

      const piA = String(col.piId || col.piNumber || col.orderNo || "");
      const piB = String(clr.piId || clr.piNumber || clr.orderNo || "");
      const thickA = (col.thickness || col.glassType?.match(/^\d+(\.\d+)?\s*MM/i)?.[0] || "").toUpperCase().replace(/\s+/g, "");
      const thickB = (clr.thickness || clr.glassType?.match(/^\d+(\.\d+)?\s*MM/i)?.[0] || "").toUpperCase().replace(/\s+/g, "");
      if (piA && piB && piA === piB && thickA && thickB && thickA === thickB && col.glassType === clr.glassType) return false;
    }
  }

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


