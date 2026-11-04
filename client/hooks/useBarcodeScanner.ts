import { useEffect, useRef } from "react";
import { cleanScannedBarcode } from "@/lib/barcode";

export interface UseBarcodeScannerOptions {
  /** Callback fired when a valid barcode is scanned */
  onScan: (barcode: string) => void;
  /** Minimum length of barcode (default: 3) */
  minLen?: number;
  /** Maximum inter-character arrival time in milliseconds for hardware scanner detection (default: 200ms) */
  maxIntervalMs?: number;
  /** Cooldown time in ms between duplicate scans of the exact same barcode (default: 1800ms) */
  duplicateCooldownMs?: number;
  /** Whether the scanner listener is currently enabled (default: true) */
  enabled?: boolean;
  /** If true, prevents scanner input from being captured when a normal input element is focused unless it's a scanner burst (default: true) */
  ignoreWhenInputFocused?: boolean;
  /** Custom filter regex or validator */
  validate?: (code: string) => boolean;
  /** Priority level: higher priority handlers (e.g. modals at 10) intercept scans before root page (0). Default: 0 */
  priority?: number;
}

interface ScannerRegistration {
  id: number;
  priority: number;
  minLen: number;
  maxIntervalMs: number;
  duplicateCooldownMs: number;
  ignoreWhenInputFocused: boolean;
  validate?: (code: string) => boolean;
  onScanRef: React.MutableRefObject<(barcode: string) => void>;
}

// Global registry of all active scanner hook instances across the application
const registeredScanners: ScannerRegistration[] = [];
let nextScannerId = 1;

let globalBuffer = "";
let lastKeyTime = 0;
let isScannerBurst = false;
let charCountBurst = 0;
let resetTimer: ReturnType<typeof setTimeout> | null = null;
let globalLastScannedBarcode = "";
let globalLastScanEpoch = 0;
let isGlobalListenerAttached = false;

function handleGlobalKeyDown(e: KeyboardEvent) {
  if (registeredScanners.length === 0) return;

  const target = e.target as HTMLElement | null;
  const isInputElement =
    target &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.getAttribute("contenteditable") === "true");

  const now = performance.now();
  const elapsed = now - lastKeyTime;
  lastKeyTime = now;

  // Clear any pending inactivity timeout
  if (resetTimer) {
    clearTimeout(resetTimer);
    resetTimer = null;
  }
  // Schedule safety reset after 600ms of inactivity
  resetTimer = setTimeout(() => {
    globalBuffer = "";
    isScannerBurst = false;
    charCountBurst = 0;
  }, 600);

  // Handle Enter or Tab (Scanner gun termination suffix)
  if (e.key === "Enter" || e.key === "Tab") {
    const rawCandidate = globalBuffer.trim();
    const candidate = cleanScannedBarcode(rawCandidate);
    const wasBurst = isScannerBurst || charCountBurst >= 3;

    // Reset buffer
    globalBuffer = "";
    isScannerBurst = false;
    charCountBurst = 0;

    if (!candidate) return;

    // Sort registered scanners by priority descending, then by id descending (most recently registered first)
    const sortedScanners = [...registeredScanners].sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return b.id - a.id;
    });

    // Find the highest-priority scanner that accepts this candidate
    for (const scanner of sortedScanners) {
      if (candidate.length < scanner.minLen) continue;
      if (isInputElement && !wasBurst && scanner.ignoreWhenInputFocused) continue;
      if (scanner.validate && !scanner.validate(candidate)) continue;

      // Intercept and prevent default newline / button press on detected scanner code
      e.preventDefault();
      e.stopPropagation();

      // Debounce hardware trigger repeat bursts on the same barcode
      const nowEpoch = Date.now();
      const cooldown = scanner.duplicateCooldownMs ?? 1800;
      if (
        globalLastScannedBarcode === candidate &&
        nowEpoch - globalLastScanEpoch < cooldown
      ) {
        globalLastScanEpoch = nowEpoch;
        return;
      }

      globalLastScannedBarcode = candidate;
      globalLastScanEpoch = nowEpoch;

      // Dispatch directly to the active target scanner
      scanner.onScanRef.current(candidate);
      return;
    }
    return;
  }

  // Ignore modifiers and special control keys (Alt, Shift, Ctrl, Meta, etc.)
  if (
    e.key.length > 1 ||
    e.ctrlKey ||
    e.altKey ||
    e.metaKey
  ) {
    return;
  }

  // Detect hardware scanner typing speed (accommodates Bluetooth HID and 2.4GHz wireless scanners up to 200ms)
  const maxInterval = registeredScanners.length > 0
    ? Math.max(...registeredScanners.map((s) => s.maxIntervalMs))
    : 200;

  if (elapsed > maxInterval) {
    // Gap too long: start fresh buffer with this character
    globalBuffer = e.key;
    isScannerBurst = false;
    charCountBurst = 1;
  } else {
    // Fast burst typical of hardware barcode scanners (<100ms/char)
    globalBuffer += e.key;
    charCountBurst += 1;
    if (charCountBurst >= 2) {
      isScannerBurst = true;
    }
  }
}

/**
 * Programmatically simulates a barcode scan to the highest priority active scanner handler.
 */
export function simulateBarcodeScan(rawCode: string): boolean {
  const candidate = cleanScannedBarcode(rawCode);
  if (!candidate || registeredScanners.length === 0) return false;

  const sortedScanners = [...registeredScanners].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.id - a.id;
  });

  for (const scanner of sortedScanners) {
    if (candidate.length < scanner.minLen) continue;
    if (scanner.validate && !scanner.validate(candidate)) continue;
    scanner.onScanRef.current(candidate);
    return true;
  }
  return false;
}

/**
 * High-performance centralized global barcode and QR scanner hook for USB, 2.4GHz Wireless, and Bluetooth scanner guns.
 * Differentiates between human typing (>250ms/char) and scanner gun burst typing (<200ms/char).
 * Supports priority stacking so modals (priority 10) cleanly intercept scans without duplicate lockouts with root page (priority 0).
 */
export function useBarcodeScanner({
  onScan,
  minLen = 3,
  maxIntervalMs = 200,
  duplicateCooldownMs = 1800,
  enabled = true,
  ignoreWhenInputFocused = true,
  validate,
  priority = 0,
}: UseBarcodeScannerOptions) {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const idRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    const id = nextScannerId++;
    idRef.current = id;

    const registration: ScannerRegistration = {
      id,
      priority,
      minLen,
      maxIntervalMs,
      duplicateCooldownMs,
      ignoreWhenInputFocused,
      validate,
      onScanRef,
    };

    registeredScanners.push(registration);

    if (!isGlobalListenerAttached && typeof window !== "undefined") {
      window.addEventListener("keydown", handleGlobalKeyDown, true);
      isGlobalListenerAttached = true;
    }

    return () => {
      const idx = registeredScanners.findIndex((s) => s.id === id);
      if (idx !== -1) {
        registeredScanners.splice(idx, 1);
      }
      if (registeredScanners.length === 0 && isGlobalListenerAttached && typeof window !== "undefined") {
        window.removeEventListener("keydown", handleGlobalKeyDown, true);
        isGlobalListenerAttached = false;
        if (resetTimer) {
          clearTimeout(resetTimer);
          resetTimer = null;
        }
      }
    };
  }, [enabled, priority, minLen, maxIntervalMs, duplicateCooldownMs, ignoreWhenInputFocused, validate]);
}
