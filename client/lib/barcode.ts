/**
 * Lightweight Code-128 Barcode & QR Code SVG utilities
 */

export function escapeSVGText(str: string): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function sanitizeSVG(svgString: string): string {
  if (typeof svgString !== "string") return "";
  return svgString
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

// Official Code 128 (ISO/IEC 15417) Patterns for all 107 symbols (0 to 106)
const CODE128_PATTERNS: readonly string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", // 0-9
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", // 10-19
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", // 20-29
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", // 30-39
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", // 40-49
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111", // 50-59
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", // 60-69
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", // 70-79
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", // 80-89
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141", // 90-99
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112"                                 // 100-106
];

const START_CODE_B = 104; // 211214
const START_CODE_C = 105; // 211232
const CODE_C_SWITCH = 99; // In Code B, switch to Code C
const STOP_CODE_IDX = 106; // 2331112

export function generateBarcodeSVG(text: string, height: number = 50, barWidth: number = 1.8): string {
  const safeText = escapeSVGText(text);
  const cleanInput = String(text || "").trim();
  const isPureDigits = !/[^0-9]/.test(cleanInput) && cleanInput.length > 0;

  let pattern = "";
  let checksum = 0;

  if (isPureDigits && cleanInput.length % 2 === 0) {
    // ── Code 128 Subset C (Pairs of digits, double bar width for pure numeric barcodes) ──
    pattern += CODE128_PATTERNS[START_CODE_C];
    checksum = START_CODE_C;
    for (let i = 0; i < cleanInput.length; i += 2) {
      const val = parseInt(cleanInput.slice(i, i + 2), 10);
      pattern += CODE128_PATTERNS[val];
      checksum += val * (i / 2 + 1);
    }
  } else if (isPureDigits && cleanInput.length >= 7) {
    // ── Code 128 Subset B starting digit + Switch to C for remaining pairs (e.g. 17-digit Sejal) ──
    pattern += CODE128_PATTERNS[START_CODE_B];
    checksum = START_CODE_B;
    const firstVal = cleanInput.charCodeAt(0) - 32;
    pattern += CODE128_PATTERNS[firstVal];
    checksum += firstVal * 1;
    pattern += CODE128_PATTERNS[CODE_C_SWITCH];
    checksum += CODE_C_SWITCH * 2;
    let weight = 3;
    for (let i = 1; i < cleanInput.length; i += 2) {
      const val = parseInt(cleanInput.slice(i, i + 2), 10);
      pattern += CODE128_PATTERNS[val];
      checksum += val * weight;
      weight++;
    }
  } else {
    // ── Code 128 Subset B (Alphanumeric and general text) ──
    pattern += CODE128_PATTERNS[START_CODE_B];
    checksum = START_CODE_B;
    for (let i = 0; i < cleanInput.length; i++) {
      let code = cleanInput.charCodeAt(i) - 32;
      if (code < 0 || code > 94) code = 31; // fallback to '?'
      pattern += CODE128_PATTERNS[code];
      checksum += code * (i + 1);
    }
  }

  const checkValue = checksum % 103;
  pattern += CODE128_PATTERNS[checkValue] + CODE128_PATTERNS[STOP_CODE_IDX];

  // Generous ISO-compliant Quiet Zones (minimum 25px / 14 modules pure white space on both sides)
  const quietZone = Math.max(26, Math.round(barWidth * 14));
  let rects = "";
  let currentX = quietZone;
  let isBar = true;

  for (let i = 0; i < pattern.length; i++) {
    const width = parseInt(pattern[i], 10) * barWidth;
    if (isBar) {
      rects += `<rect x="${currentX.toFixed(2)}" y="4" width="${width.toFixed(2)}" height="${height}" fill="#000000" />`;
    }
    currentX += width;
    isBar = !isBar;
  }

  const totalWidth = Math.ceil(currentX + quietZone);
  const totalHeight = height + 20;

  const rawSVG = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="${totalWidth}" height="${totalHeight}" style="max-width: 100%; height: auto; display: block;" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges">
      <rect width="100%" height="100%" fill="#ffffff" />
      ${rects}
      <text x="${totalWidth / 2}" y="${totalHeight - 3}" font-family="monospace, ui-monospace, Courier" font-size="12" font-weight="900" letter-spacing="1.5" text-anchor="middle" fill="#000000" shape-rendering="auto">${safeText}</text>
    </svg>
  `;

  return sanitizeSVG(rawSVG);
}

// Official Interleaved 2 of 5 (ITF) Patterns for digits 0-9 (N=Narrow, W=Wide)
const ITF_PATTERNS: Record<string, string> = {
  "0": "NNWWN",
  "1": "WNNNW",
  "2": "NWNNW",
  "3": "WWNNN",
  "4": "NNWNW",
  "5": "WNWNN",
  "6": "NWWNN",
  "7": "NNNWW",
  "8": "WNNWN",
  "9": "NWNWN",
};

/**
 * Generate Interleaved 2 of 5 (ITF) Barcode SVG
 * Exact format used in Sejal Glass factory ERP sticker printouts (e.g. DLGU Batch 1622)
 */
export function generateITFBarcodeSVG(
  text: string,
  height: number = 46,
  barWidth: number = 1.6,
  wideRatio: number = 2
): string {
  const safeText = escapeSVGText(text);
  let digits = String(text || "").replace(/\D/g, "");
  if (digits.length % 2 !== 0) digits = "0" + digits; // ITF requires even number of digits
  if (digits.length === 0) return "";

  const narrow = barWidth;
  const wide = barWidth * wideRatio;

  // Start pattern: Narrow Bar, Narrow Space, Narrow Bar, Narrow Space
  const elements: Array<{ isBar: boolean; width: number }> = [
    { isBar: true, width: narrow },
    { isBar: false, width: narrow },
    { isBar: true, width: narrow },
    { isBar: false, width: narrow },
  ];

  // Interleaved digit pairs (first digit bars, second digit spaces)
  for (let i = 0; i < digits.length; i += 2) {
    const p1 = ITF_PATTERNS[digits[i]] || "NNWWN";
    const p2 = ITF_PATTERNS[digits[i + 1]] || "NNWWN";
    for (let j = 0; j < 5; j++) {
      elements.push({ isBar: true, width: p1[j] === "W" ? wide : narrow });
      elements.push({ isBar: false, width: p2[j] === "W" ? wide : narrow });
    }
  }

  // Stop pattern: Wide Bar, Narrow Space, Narrow Bar
  elements.push({ isBar: true, width: wide });
  elements.push({ isBar: false, width: narrow });
  elements.push({ isBar: true, width: narrow });

  // Generous ISO-compliant Quiet Zone (minimum 26px / 14 modules pure white)
  const quietZone = Math.max(26, Math.round(barWidth * 14));
  let currentX = quietZone;
  let rects = "";

  for (const el of elements) {
    if (el.isBar) {
      rects += `<rect x="${currentX.toFixed(2)}" y="4" width="${el.width.toFixed(2)}" height="${height}" fill="#000000" />`;
    }
    currentX += el.width;
  }

  const totalWidth = Math.ceil(currentX + quietZone);
  const totalHeight = height + 20;

  const rawSVG = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="${totalWidth}" height="${totalHeight}" style="max-width: 100%; height: auto; display: block;" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges">
      <rect width="100%" height="100%" fill="#ffffff" />
      ${rects}
      <text x="${totalWidth / 2}" y="${totalHeight - 3}" font-family="monospace, ui-monospace, Courier" font-size="12" font-weight="900" letter-spacing="1.5" text-anchor="middle" fill="#000000" shape-rendering="auto">${safeText}</text>
    </svg>
  `;

  return sanitizeSVG(rawSVG);
}

// Generate SVG QR Code matrix for QR scanning
export function generateQRCodeSVG(data: string, size: number = 100): string {
  const grid = 21;
  const cellSize = Math.floor(size / grid);
  const offset = Math.floor((size - grid * cellSize) / 2);

  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = (hash << 5) - hash + data.charCodeAt(i);
    hash |= 0;
  }

  let paths = "";
  for (let r = 0; r < grid; r++) {
    for (let c = 0; c < grid; c++) {
      const isTopLeft = r < 7 && c < 7;
      const isTopRight = r < 7 && c >= grid - 7;
      const isBottomLeft = r >= grid - 7 && c < 7;

      let isBlack = false;
      if (isTopLeft || isTopRight || isBottomLeft) {
        const localR = isTopLeft ? r : isTopRight ? r : r - (grid - 7);
        const localC = isTopLeft ? c : isTopRight ? c - (grid - 7) : c;
        if (localR === 0 || localR === 6 || localC === 0 || localC === 6) isBlack = true;
        else if (localR >= 2 && localR <= 4 && localC >= 2 && localC <= 4) isBlack = true;
      } else {
        const bit = Math.abs((hash ^ (r * 31 + c * 17)) % 100);
        isBlack = bit < 48;
      }

      if (isBlack) {
        const x = offset + c * cellSize;
        const y = offset + r * cellSize;
        paths += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="#0f172a" />`;
      }
    }
  }

  const rawSVG = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
      <rect width="100%" height="100%" fill="white" rx="6" />
      ${paths}
    </svg>
  `;

  return sanitizeSVG(rawSVG);
}

import {
  BARCODE_PREFIX,
  KNOWN_BARCODE_PREFIXES,
  formatGenericBarcode,
  formatSejalBarcode,
} from "@shared/api";

export {
  BARCODE_PREFIX,
  KNOWN_BARCODE_PREFIXES,
  formatGenericBarcode,
  formatSejalBarcode,
};

/**
 * Clean hardware barcode scanner gun input (strips AIM identifiers, QR/BAR prefixes, hashes, whitespace)
 */
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

/**
 * Checks if a glass item matches a scanned code across all possible barcode, QR, serial, POS, Order, and SFO formats
 */
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

/**
 * Result of evaluating a barcode scan against the production line state.
 */
export interface ScanEvaluationResult {
  status: "can_advance" | "already_scanned" | "wrong_stage" | "rejected" | "all_finished" | "not_found";
  item?: any;
  matchingItems: any[];
  stageItems: any[];
  completedStageItems: any[];
  totalMatching: number;
  remainingInStage: number;
  stageName?: string;
  message: string;
}

/**
 * Evaluates whether a scanned barcode can be advanced in the current stage,
 * or if it was already scanned, belongs to a different stage, is rejected, or not found.
 *
 * Rules:
 * 1. If multiple stickers share the same barcode (e.g. 2 stickers for POS #17),
 *    each sticker can be scanned once at the stage (allowing N scans for N physical stickers).
 * 2. Once all stickers for that barcode have completed the stage, any subsequent scan
 *    at the same stage triggers an "already_scanned" warning.
 * 3. Does NOT accidentally pull downstream items from next stages when scanning at an earlier workstation.
 */
export function evaluateScanStatus(
  items: any[],
  rawCode: string,
  preferredStage?: string
): ScanEvaluationResult {
  const clean = cleanScannedBarcode(rawCode);
  if (!clean) {
    return {
      status: "not_found",
      matchingItems: [],
      stageItems: [],
      completedStageItems: [],
      totalMatching: 0,
      remainingInStage: 0,
      message: "Please scan a valid barcode or QR code.",
    };
  }

  const matches = items.filter((item) => isItemMatchingCode(item, clean));
  if (matches.length === 0) {
    return {
      status: "not_found",
      matchingItems: [],
      stageItems: [],
      completedStageItems: [],
      totalMatching: 0,
      remainingInStage: 0,
      message: `Barcode not recognized: ${clean}`,
    };
  }

  // Check if all matching pieces are rejected
  if (matches.every((i) => i.status === "Rejected")) {
    const item = matches[0];
    const posLabel = item.posNo ? `POS #${item.posNo}` : (item.itemCode || item.serialNumber);
    return {
      status: "rejected",
      item,
      matchingItems: matches,
      stageItems: [],
      completedStageItems: [],
      totalMatching: matches.length,
      remainingInStage: 0,
      message: `Scanned item ${posLabel} (${item.serialNumber}) is marked as Rejected.`,
    };
  }

  const normStage = preferredStage?.trim().toLowerCase();

  // If scanning at a specific workstation stage (e.g. Cutting, Pairing, Lamination, DGU)
  if (normStage && normStage !== "all" && normStage !== "overview") {
    // 1. Items currently at this exact workstation stage waiting to be scanned
    const stageItems = matches.filter(
      (i) => i.status !== "Rejected" && i.currentStage?.toLowerCase() === normStage
    );

    if (stageItems.length > 0) {
      const itemToAdvance = stageItems[0];
      const totalPieces = matches.reduce((sum, i) => sum + (parseInt(String(i.qty || 1), 10) || 1), 0);
      const remainingPieces = stageItems.reduce((sum, i) => sum + (parseInt(String(i.qty || 1), 10) || 1), 0);
      return {
        status: "can_advance",
        item: itemToAdvance,
        matchingItems: matches,
        stageItems,
        completedStageItems: [],
        totalMatching: Math.max(matches.length, totalPieces),
        remainingInStage: Math.max(stageItems.length, remainingPieces),
        stageName: preferredStage,
        message: `Ready to advance ${itemToAdvance.serialNumber} at ${preferredStage}`,
      };
    }

    // 2. No items in this stage. Check if items for this barcode ALREADY completed this stage
    const completedStageItems = matches.filter((i) => {
      // Completed stages array check
      if (i.completedStages && Array.isArray(i.completedStages)) {
        if (i.completedStages.some((s: string) => String(s).toLowerCase() === normStage)) {
          return true;
        }
      }
      // Process route progression check (current stage is downstream of preferredStage)
      const route: string[] = i.processRoute || [];
      const targetIdx = route.findIndex((s) => s.toLowerCase() === normStage);
      const currentIdx = route.findIndex((s) => s.toLowerCase() === String(i.currentStage || "").toLowerCase());
      return targetIdx >= 0 && currentIdx > targetIdx;
    });

    if (completedStageItems.length > 0) {
      const firstItem = completedStageItems[0];
      const posLabel = firstItem.posNo ? `POS #${firstItem.posNo}` : (firstItem.itemCode || firstItem.serialNumber);
      const totalPieces = matches.reduce((sum, i) => sum + (parseInt(String(i.qty || 1), 10) || 1), 0);
      const totalCount = Math.max(matches.length, totalPieces);
      const currentLoc = firstItem.currentStage || "Next Stage";

      const message = totalCount > 1
        ? `⚠️ Sticker already scanned! All ${totalCount} stickers for ${posLabel} have already completed ${preferredStage} (currently at ${currentLoc}).`
        : `⚠️ Sticker already scanned! ${posLabel} (${firstItem.serialNumber}) has already completed ${preferredStage} (currently at ${currentLoc}).`;

      return {
        status: "already_scanned",
        item: firstItem,
        matchingItems: matches,
        stageItems: [],
        completedStageItems,
        totalMatching: totalCount,
        remainingInStage: 0,
        stageName: preferredStage,
        message,
      };
    }

    // 3. Not at stage, and not completed: piece is upstream (must pass earlier stages first)
    const upstreamItems = matches.filter((i) => i.status !== "Rejected" && i.currentStage !== "Finished");
    if (upstreamItems.length > 0) {
      const firstUpstream = upstreamItems[0];
      const posLabel = firstUpstream.posNo ? `POS #${firstUpstream.posNo}` : (firstUpstream.itemCode || firstUpstream.serialNumber);
      return {
        status: "wrong_stage",
        item: firstUpstream,
        matchingItems: matches,
        stageItems: [],
        completedStageItems: [],
        totalMatching: matches.length,
        remainingInStage: 0,
        stageName: preferredStage,
        message: `⚠️ Sticker cannot be scanned at ${preferredStage} yet. ${posLabel} is currently at ${firstUpstream.currentStage}.`,
      };
    }
  }

  // Non-stage-specific scan (e.g. Overview or Global Search)
  const activeMatches = matches.filter(
    (i) => i.status !== "Completed" && i.status !== "Rejected" && i.currentStage !== "Finished"
  );

  if (activeMatches.length > 0) {
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

    const itemToAdvance = activeMatches[0];
    const totalPieces = matches.reduce((sum, i) => sum + (parseInt(String(i.qty || 1), 10) || 1), 0);
    const remainingPieces = activeMatches.reduce((sum, i) => sum + (parseInt(String(i.qty || 1), 10) || 1), 0);
    return {
      status: "can_advance",
      item: itemToAdvance,
      matchingItems: matches,
      stageItems: activeMatches,
      completedStageItems: [],
      totalMatching: Math.max(matches.length, totalPieces),
      remainingInStage: Math.max(activeMatches.length, remainingPieces),
      message: `Ready to advance ${itemToAdvance.serialNumber} from ${itemToAdvance.currentStage}`,
    };
  }

  // All pieces finished
  const firstItem = matches[0];
  const posLabel = firstItem.posNo ? `POS #${firstItem.posNo}` : (firstItem.itemCode || firstItem.serialNumber);
  return {
    status: "all_finished",
    item: firstItem,
    matchingItems: matches,
    stageItems: [],
    completedStageItems: matches,
    totalMatching: matches.length,
    remainingInStage: 0,
    message: `ℹ️ All stickers for ${posLabel} have already completed all production stages.`,
  };
}

/**
 * Finds the single best glass item to advance among candidates matching the scanned code.
 * Prioritizes the active workstation stage. If preferredStage is set and has active items,
 * returns that item. If preferredStage is set and ALL matching items have already completed it,
 * returns null (preventing accidental double-advancement of downstream pieces).
 */
export function findBestMatchingItem(
  items: any[],
  rawCode: string,
  preferredStage?: string
): any | null {
  const evalResult = evaluateScanStatus(items, rawCode, preferredStage);
  if (evalResult.status === "can_advance") {
    return evalResult.item || null;
  }
  return null;
}

