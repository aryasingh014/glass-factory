/**
 * Barcode Configuration & Helpers for Sejal Glass Manufacturing Operations
 * Standardized fixed rack barcodes for physical warehouse wall posters & rack labels (Rack A, B, C, D, E).
 */

export type RackLetter = "Rack A" | "Rack B" | "Rack C" | "Rack D" | "Rack E";

export const RACK_LETTERS: readonly RackLetter[] = [
  "Rack A",
  "Rack B",
  "Rack C",
  "Rack D",
  "Rack E",
] as const;

/**
 * Standard default slots for each physical factory rack
 */
export const DEFAULT_RACK_SLOTS: Record<RackLetter, string> = {
  "Rack A": "25",
  "Rack B": "50",
  "Rack C": "1",
  "Rack D": "1",
  "Rack E": "1",
};

/**
 * Formats the fixed barcode string for a physical rack (A, B, C, D, E) without slot number.
 * Wall poster barcodes are fixed to: "RACK-A", "RACK-B", "RACK-C", "RACK-D", "RACK-E".
 */
export function formatRackBarcode(rack: string, _slot?: string | number): string {
  const cleanRack = String(rack || "").trim().toUpperCase();
  let letter: "A" | "B" | "C" | "D" | "E" = "A";

  if (
    cleanRack.includes("RACK E") ||
    cleanRack.includes("RACK-E") ||
    cleanRack.includes("RACK_E") ||
    cleanRack.includes("RACK:E") ||
    cleanRack.includes("-E") ||
    cleanRack.endsWith(" E") ||
    cleanRack.includes("RACK-05") ||
    cleanRack.includes("RACK 05") ||
    cleanRack === "E" ||
    cleanRack === "RACKE"
  ) {
    letter = "E";
  } else if (
    cleanRack.includes("RACK D") ||
    cleanRack.includes("RACK-D") ||
    cleanRack.includes("RACK_D") ||
    cleanRack.includes("RACK:D") ||
    cleanRack.includes("-D") ||
    cleanRack.endsWith(" D") ||
    cleanRack.includes("RACK-04") ||
    cleanRack.includes("RACK 04") ||
    cleanRack === "D" ||
    cleanRack === "RACKD"
  ) {
    letter = "D";
  } else if (
    cleanRack.includes("RACK C") ||
    cleanRack.includes("RACK-C") ||
    cleanRack.includes("RACK_C") ||
    cleanRack.includes("RACK:C") ||
    cleanRack.includes("-C") ||
    cleanRack.endsWith(" C") ||
    cleanRack.includes("RACK-03") ||
    cleanRack.includes("RACK 03") ||
    cleanRack === "C" ||
    cleanRack === "RACKC"
  ) {
    letter = "C";
  } else if (
    cleanRack.includes("RACK B") ||
    cleanRack.includes("RACK-B") ||
    cleanRack.includes("RACK_B") ||
    cleanRack.includes("RACK:B") ||
    cleanRack.includes("-B") ||
    cleanRack.endsWith(" B") ||
    cleanRack.includes("RACK-02") ||
    cleanRack.includes("RACK 02") ||
    cleanRack === "B" ||
    cleanRack === "RACKB"
  ) {
    letter = "B";
  } else {
    letter = "A";
  }

  return `RACK-${letter}`;
}

/**
 * Parses any scanned barcode string to determine whether it corresponds to a physical Rack barcode.
 * Supports:
 *  - "RACK-A", "RACK-B", "RACK-C", "RACK-D", "RACK-E" (Standard wall posters)
 *  - "RACK A", "RACK B", "RACK C", "RACK D", "RACK E"
 *  - "RACK_A", "RACK:A", "RACKA", "RACKB", "RACKC", "RACKD", "RACKE"
 *  - "RACK-A-25" (gracefully resolves rack letter)
 *  - "RACK-01", "RACK-02", "RACK-03", "RACK-04", "RACK-05"
 */
export function parseRackBarcode(rawText: string): {
  isRack: boolean;
  rackLetter?: RackLetter;
  rackSlot?: string;
  barcode: string;
} {
  if (!rawText) return { isRack: false, barcode: "" };
  const text = String(rawText).trim();
  const up = text.toUpperCase();

  // Guard: standard Sejal glass piece barcodes are 12 to 24 digit numbers (e.g. 1012627007010057)
  if (/^\d{12,24}$/.test(text)) {
    return { isRack: false, barcode: text };
  }

  // Check for RACK identifier patterns (e.g. "RACK-A", "RACK-B", "RACK A", "RACKA", "RACK-A-25")
  const rackPattern = /^(?:RACK[-_\s:]*|RACK)?([A-E]|0[1-5])(?:[-_\s:#]+(\d+))?$/i;
  const match = up.match(rackPattern);

  if (match) {
    let letterCode = match[1];
    // Map numerical codes 01-05 to A-E
    if (letterCode === "01") letterCode = "A";
    else if (letterCode === "02") letterCode = "B";
    else if (letterCode === "03") letterCode = "C";
    else if (letterCode === "04") letterCode = "D";
    else if (letterCode === "05") letterCode = "E";

    const letterMap: Record<string, RackLetter> = {
      A: "Rack A",
      B: "Rack B",
      C: "Rack C",
      D: "Rack D",
      E: "Rack E",
    };

    const rackLetter = letterMap[letterCode];
    if (rackLetter) {
      const rackSlot = match[2] ? match[2].trim() : "";
      return {
        isRack: true,
        rackLetter,
        rackSlot,
        barcode: `RACK-${letterCode}`,
      };
    }
  }

  // Fallback pattern: "Rack A - 25" or "Rack A"
  if (
    up.startsWith("RACK A") ||
    up.startsWith("RACK B") ||
    up.startsWith("RACK C") ||
    up.startsWith("RACK D") ||
    up.startsWith("RACK E")
  ) {
    let letter: RackLetter = "Rack A";
    let letterCode = "A";
    if (up.startsWith("RACK E")) {
      letter = "Rack E";
      letterCode = "E";
    } else if (up.startsWith("RACK D")) {
      letter = "Rack D";
      letterCode = "D";
    } else if (up.startsWith("RACK C")) {
      letter = "Rack C";
      letterCode = "C";
    } else if (up.startsWith("RACK B")) {
      letter = "Rack B";
      letterCode = "B";
    }

    let slot = "";
    if (up.includes("-")) {
      slot = up.substring(up.indexOf("-") + 1).replace(/\D/g, "").trim();
    }
    return {
      isRack: true,
      rackLetter: letter,
      rackSlot: slot,
      barcode: `RACK-${letterCode}`,
    };
  }

  return { isRack: false, barcode: text };
}
