/**
 * Shared Barcode Configuration & Prefix Management
 *
 * Supports configurable ERP prefixes via environment variables or runtime configuration,
 * allowing the application to work with any company sticker, barcode format, or generic standard.
 */

// Global or environment-configured prefix (defaults to Sejal standard "10126270" if not set)
export const BARCODE_PREFIX: string =
  (typeof process !== "undefined" && process?.env?.BARCODE_PREFIX) || "10126270";

// Array of recognized ERP / factory barcode prefixes for multi-prefix parsing
export const KNOWN_BARCODE_PREFIXES: string[] = Array.from(
  new Set([
    BARCODE_PREFIX,
    "10126270",
    "10126",
    "101",
    ...(typeof process !== "undefined" && process?.env?.EXTRA_BARCODE_PREFIXES
      ? String(process.env.EXTRA_BARCODE_PREFIXES).split(",").map((p) => p.trim())
      : []),
  ].filter(Boolean))
);

/**
 * Format a generic barcode using a configurable or detected prefix
 */
export function formatGenericBarcode(
  sfoNo?: string,
  seqNo?: number | string,
  prefix: string = BARCODE_PREFIX
): string {
  const cleanSfo = String(sfoNo || "1344").replace(/[^0-9]/g, "");
  const sfoPad = (cleanSfo || "1344").padStart(5, "0").slice(-5);
  const seqPad = String(seqNo || "16").padStart(4, "0").slice(-4);
  return `${prefix}${sfoPad}${seqPad}`;
}

/**
 * Backward compatibility alias for Sejal format barcode
 */
export const formatSejalBarcode = formatGenericBarcode;
