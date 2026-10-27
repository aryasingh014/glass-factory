import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Camera,
  CameraOff,
  RefreshCw,
  ScanLine,
  Zap,
  CheckCircle2,
  AlertCircle,
  X,
  FlipHorizontal,
  Image,
  Upload,
  ShieldAlert,
} from "lucide-react";
import { scannerAudio } from "@/lib/audioBeep";
import { cleanScannedBarcode } from "@/lib/barcode";

interface CameraScannerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (code: string) => void;
  title?: string;
}

export const CameraScannerModal: React.FC<CameraScannerModalProps> = ({
  open,
  onOpenChange,
  onScan,
  title = "Phone Camera Barcode & QR Scanner",
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isInsecureOrigin, setIsInsecureOrigin] = useState(false);
  const [scannedFeedback, setScannedFeedback] = useState<string | null>(null);
  const [fileProcessing, setFileProcessing] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasScannedRef = useRef<boolean>(false);
  const containerId = "sejal-html5-camera-scanner";

  // Check if browser is blocking live camera due to HTTP on mobile
  useEffect(() => {
    if (typeof window !== "undefined") {
      const isLocalhost =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";
      const isHttps = window.location.protocol === "https:";
      if (!isHttps && !isLocalhost) {
        setIsInsecureOrigin(true);
      } else {
        setIsInsecureOrigin(false);
      }
    }
  }, [open]);

  // Start scanner after DOM is mounted
  useEffect(() => {
    hasScannedRef.current = false;
    if (!open) {
      stopScanner();
      return;
    }

    let isCancelled = false;

    // Small delay to guarantee Radix Dialog animation finished & container is mounted
    const timer = setTimeout(() => {
      if (!isCancelled) {
        initCamera();
      }
    }, 300);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
      stopScanner();
    };
  }, [open]);

  const initCamera = async () => {
    try {
      setErrorMsg(null);
      await stopScanner();

      const el = document.getElementById(containerId);
      if (!el) {
        console.warn("Container not in DOM yet, retrying...");
        setTimeout(initCamera, 200);
        return;
      }

      // Check if mediaDevices is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
          "Camera streaming is blocked by your mobile browser over plain HTTP (192.168.x.x). Use the 'Snap Photo with Camera' button below or HTTPS."
        );
      }

      const html5QrCode = new Html5Qrcode(containerId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODABAR,
        ],
        verbose: false,
      });
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 15,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => ({
            width: Math.min(Math.round(viewfinderWidth * 0.88), 320),
            height: Math.min(Math.round(viewfinderHeight * 0.65), 180),
          }),
          aspectRatio: 1.333,
        },
        handleDecodedText,
        () => {}
      );
      setIsScanning(true);
    } catch (err: any) {
      console.warn("Camera init error:", err);
      setIsScanning(false);
      setErrorMsg(
        err?.message ||
          "Could not start live video stream. Please allow camera permissions or tap 'Snap Photo with Camera' below."
      );
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch (e) {
        console.warn("Scanner cleanup:", e);
      } finally {
        scannerRef.current = null;
        setIsScanning(false);
      }
    }
  };

  const handleDecodedText = (decodedText: string) => {
    if (hasScannedRef.current) return;
    const clean = cleanScannedBarcode(decodedText) || decodedText.trim();
    if (!clean) return;

    hasScannedRef.current = true;
    scannerAudio.playSuccess();
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([80, 50, 80]);
    }

    setScannedFeedback(clean);

    setTimeout(() => {
      stopScanner().then(() => {
        onOpenChange(false);
        onScan(clean);
      });
    }, 350);
  };

  // Instant photo snap fallback (works 100% on all mobile devices even over plain HTTP)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || hasScannedRef.current) return;
    hasScannedRef.current = true;

    setFileProcessing(true);
    try {
      let qrCode = scannerRef.current;
      if (!qrCode) {
        qrCode = new Html5Qrcode(containerId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93,
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.DATA_MATRIX,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODABAR,
          ],
          verbose: false,
        });
        scannerRef.current = qrCode;
      }

      const decodedText = await qrCode.scanFile(file, true);
      handleDecodedText(decodedText);
    } catch (err: any) {
      console.error("File scan failed:", err);
      scannerAudio.playError();
      setErrorMsg(
        "Could not detect a clear barcode in the photo. Please ensure good lighting and steady focus, then try again."
      );
    } finally {
      setFileProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          stopScanner();
        }
        onOpenChange(isOpen);
      }}
    >
      <DialogContent className="max-w-md bg-slate-950 text-white border-slate-800 shadow-2xl rounded-3xl p-0 overflow-hidden">
        <DialogHeader className="p-4 bg-slate-900/90 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                <Camera className="w-4 h-4" />
              </div>
              <div>
                <DialogTitle className="text-sm font-black text-white">{title}</DialogTitle>
                <p className="text-[11px] text-slate-400">1D Barcode &amp; 2D QR Scanner</p>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="p-4 space-y-3">
          {/* Insecure HTTP Warning on Phone Banner */}
          {isInsecureOrigin && (
            <div className="p-3 bg-amber-950/60 border border-amber-500/40 rounded-2xl text-xs text-amber-200 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-amber-400">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>Mobile Browser HTTP Notice</span>
              </div>
              <p className="text-[11px] text-amber-300 leading-tight">
                Mobile browsers block live video streams on insecure <code className="bg-amber-900/60 px-1 rounded">http://192.168.x.x</code>.
                Tap <strong>"Snap Photo with Camera"</strong> below to scan instantly with your phone's native camera!
              </p>
            </div>
          )}

          {/* Camera Viewport Container */}
          <div className="relative rounded-2xl overflow-hidden bg-black min-h-[220px] aspect-4/3 flex items-center justify-center border border-slate-800 shadow-inner">
            <div id={containerId} className="w-full h-full object-cover" />

            {/* Scanning Laser HUD Overlay */}
            {isScanning && !scannedFeedback && (
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                {/* Aiming Reticle Frame */}
                <div className="w-60 h-40 border-2 border-emerald-400/80 rounded-2xl relative shadow-[0_0_20px_rgba(52,211,153,0.3)]">
                  <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-emerald-400 rounded-tl-md" />
                  <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-emerald-400 rounded-tr-md" />
                  <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-emerald-400 rounded-bl-md" />
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-emerald-400 rounded-br-md" />

                  {/* Animated Laser Line */}
                  <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-rose-500 to-transparent shadow-[0_0_8px_#f43f5e] animate-pulse relative top-1/2 -translate-y-1/2" />
                </div>

                <div className="mt-3 px-3 py-1 bg-black/70 backdrop-blur-md rounded-full text-[10px] font-bold text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Point at Glass Barcode...
                </div>
              </div>
            )}

            {/* Success Scan Feedback Overlay */}
            {scannedFeedback && (
              <div className="absolute inset-0 bg-emerald-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center animate-in fade-in zoom-in-95">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-2" />
                <h4 className="text-sm font-black text-white">Barcode Detected!</h4>
                <div className="mt-1 px-3 py-1 bg-emerald-900/80 border border-emerald-500/50 rounded-xl text-xs font-mono font-bold text-emerald-200 max-w-[240px] truncate">
                  {scannedFeedback}
                </div>
              </div>
            )}

            {/* Error or Stopped State */}
            {!isScanning && !scannedFeedback && (
              <div className="absolute inset-0 bg-slate-900/95 flex flex-col items-center justify-center p-5 text-center space-y-3">
                <CameraOff className="w-10 h-10 text-slate-500" />
                <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                  {errorMsg || "Tap below to start camera or snap a photo of the sticker"}
                </p>
                <div className="flex flex-col gap-2 w-full max-w-xs">
                  <Button
                    type="button"
                    onClick={() => initCamera()}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl h-10 gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Start Live Video Camera
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Native Mobile Camera Snap Button (100% Reliability on All Phones) */}
          <div className="pt-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileUpload}
              className="hidden"
              id="sejal-camera-snap-input"
            />
            <Button
              type="button"
              disabled={fileProcessing}
              onClick={() => fileInputRef.current?.click()}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-extrabold h-11 rounded-2xl shadow-lg flex items-center justify-center gap-2 cursor-pointer text-xs"
            >
              <Camera className="w-4 h-4" />
              <span>{fileProcessing ? "Analyzing Sticker Photo..." : "📸 Snap Photo with Camera"}</span>
            </Button>
          </div>

          {/* Quick Guidance Info */}
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              <Zap className="w-3 h-3 text-amber-400" />
              <span>Testing Tip</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              If your phone browser asks for camera permission, tap <strong>Allow</strong>. If your phone blocks live stream over HTTP, tap <strong>"Snap Photo with Camera"</strong>.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
