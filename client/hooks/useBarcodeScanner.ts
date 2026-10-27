import { useEffect, useRef, useCallback } from "react";
import { cleanScannedBarcode } from "@/lib/barcode";

export interface UseBarcodeScannerOptions {
  /** Callback fired when a valid barcode is scanned */
  onScan: (barcode: string) => void;
  /** Minimum length of barcode (default: 3) */
  minLen?: number;
  /** Maximum inter-character arrival time in milliseconds for hardware scanner detection (default: 150ms) */
  maxIntervalMs?: number;
  /** Cooldown time in ms between duplicate scans of the exact same barcode (default: 800ms) */
  duplicateCooldownMs?: number;
  /** Whether the scanner listener is currently enabled (default: true) */
  enabled?: boolean;
  /** If true, prevents scanner input from being captured when a normal input element is focused unless it's a scanner burst (default: true) */
  ignoreWhenInputFocused?: boolean;
  /** Custom filter regex or validator */
  validate?: (code: string) => boolean;
}

/**
 * High-performance global barcode and QR scanner hook for USB, 2.4GHz Wireless, and Bluetooth scanner guns.
 * Differentiates between human typing (>200ms/char) and scanner gun burst typing (<150ms/char).
 */
export function useBarcodeScanner({
  onScan,
  minLen = 3,
  maxIntervalMs = 150,
  duplicateCooldownMs = 800,
  enabled = true,
  ignoreWhenInputFocused = true,
  validate,
}: UseBarcodeScannerOptions) {
  const bufferRef = useRef<string>("");
  const lastKeyTimeRef = useRef<number>(0);
  const isScannerBurstRef = useRef<boolean>(false);
  const charCountBurstRef = useRef<number>(0);
  const resetTimerRef = useRef<any>(null);
  const lastScanCandidateRef = useRef<{ code: string; time: number }>({ code: "", time: 0 });
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      const target = e.target as HTMLElement | null;
      const isInputElement =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.getAttribute("contenteditable") === "true");

      const now = performance.now();
      const elapsed = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Clear any pending inactivity timeout
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
      // Schedule safety reset after 500ms of inactivity
      resetTimerRef.current = setTimeout(() => {
        bufferRef.current = "";
        isScannerBurstRef.current = false;
        charCountBurstRef.current = 0;
      }, 500);

      // Handle Enter or Tab (Scanner gun termination suffix)
      if (e.key === "Enter" || e.key === "Tab") {
        const rawCandidate = bufferRef.current.trim();
        const candidate = cleanScannedBarcode(rawCandidate);
        const wasBurst = isScannerBurstRef.current || charCountBurstRef.current >= 3;

        // Reset buffer
        bufferRef.current = "";
        isScannerBurstRef.current = false;
        charCountBurstRef.current = 0;

        if (candidate.length >= minLen) {
          // If in an input field, only intercept if it was a fast scanner burst or not ignored
          if (isInputElement && !wasBurst && ignoreWhenInputFocused) {
            return;
          }

          if (validate && !validate(candidate)) {
            return;
          }

          // Debounce hardware trigger repeat bursts on the same barcode
          const nowEpoch = Date.now();
          const cooldown = duplicateCooldownMs ?? 800;
          if (
            lastScanCandidateRef.current.code === candidate &&
            nowEpoch - lastScanCandidateRef.current.time < cooldown
          ) {
            return;
          }
          lastScanCandidateRef.current = { code: candidate, time: nowEpoch };

          // Stop default form submission/newline
          e.preventDefault();
          e.stopPropagation();

          // Fire scan event
          onScanRef.current(candidate);
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

      // Detect hardware scanner typing speed
      if (elapsed > maxIntervalMs) {
        // Gap too long: start fresh buffer with this character
        bufferRef.current = e.key;
        isScannerBurstRef.current = false;
        charCountBurstRef.current = 1;
      } else {
        // Fast burst typical of hardware barcode scanners (<100ms/char)
        bufferRef.current += e.key;
        charCountBurstRef.current += 1;
        if (charCountBurstRef.current >= 2) {
          isScannerBurstRef.current = true;
        }
      }
    },
    [enabled, minLen, maxIntervalMs, ignoreWhenInputFocused, validate]
  );

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, [enabled, handleKeyDown]);
}
