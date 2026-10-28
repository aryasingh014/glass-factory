import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  QrCode,
  ScanLine,
  Search,
  CheckCircle,
  AlertOctagon,
  RefreshCw,
  Tag,
  Volume2,
  VolumeX,
  Zap,
  Camera,
} from "lucide-react";
import { GlassItem, PIMaster, ProductionHistory } from "@shared/api";
import { generateQRCodeSVG, cleanScannedBarcode } from "@/lib/barcode";
import { getDguEffectiveQtyAndSqm } from "@/lib/utils";
import { scannerAudio } from "@/lib/audioBeep";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { CameraScannerModal } from "@/components/CameraScannerModal";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

interface ScanLookupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operator?: string;
  currentStage?: string;
  initialCode?: string;
  onCompleteStage?: (item: GlassItem) => void;
  onReject?: (item: GlassItem) => void;
  onRework?: (item: GlassItem) => void;
  onPrintSticker?: (item: GlassItem) => void;
}

export const ScanLookupModal: React.FC<ScanLookupModalProps> = ({
  open,
  onOpenChange,
  operator = "Operator",
  currentStage,
  initialCode = "",
  onCompleteStage,
  onReject,
  onRework,
  onPrintSticker,
}) => {
  const { getAuthHeaders } = useAuth();
  const [searchInput, setSearchInput] = useState(initialCode);
  const [loading, setLoading] = useState(false);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [scannedResult, setScannedResult] = useState<{
    item: GlassItem;
    pi: PIMaster;
    history: ProductionHistory[];
  } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      if (initialCode) {
        setSearchInput(initialCode);
        handleSearch(initialCode);
      }
      setTimeout(() => inputRef.current?.focus(), 150);
    } else {
      setScannedResult(null);
      setSearchInput("");
    }
  }, [open, initialCode]);

  // Handle hardware scanner gun input inside modal
  useBarcodeScanner({
    enabled: open,
    duplicateCooldownMs: 1800,
    onScan: (scannedBarcode) => {
      const clean = cleanScannedBarcode(scannedBarcode);
      setSearchInput(clean);
      handleSearch(clean);
    },
  });

  const handleSearch = async (queryToSearch?: string) => {
    const raw = queryToSearch || searchInput;
    const code = cleanScannedBarcode(raw);
    if (!code) return;

    setLoading(true);
    try {
      const res = await fetch("/api/production/scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ code, stage: currentStage, operator }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Product not found");
      }

      const data = await res.json();
      setScannedResult(data);
      if (data.status === "already_scanned") {
        scannerAudio.playWarning();
        toast.warning(data.message);
      } else {
        scannerAudio.playSuccess();
        toast.success(`Found item ${data.item.serialNumber} (${data.item.itemCode || data.item.posNo})`);
      }
    } catch (err: any) {
      scannerAudio.playError();
      toast.error(err.message || "No item found for this barcode or QR ID");
      setScannedResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (scannedResult && onCompleteStage && scannedResult.item.currentStage !== "Finished") {
        onCompleteStage(scannedResult.item);
        onOpenChange(false);
      } else {
        handleSearch();
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-white text-slate-900 border-slate-200 shadow-2xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold flex items-center justify-between text-slate-900">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
                <ScanLine className="w-4 h-4 text-white" />
              </div>
              <span>Barcode &amp; QR Code Product Lookup Scanner</span>
            </div>

            <div className="flex items-center gap-2 pr-6">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-[11px] font-bold text-emerald-700">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Scanner Gun Active
              </span>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 my-1">
          {/* Search bar */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
              <Input
                ref={inputRef}
                autoFocus
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Scan Barcode with Gun or Enter Code (e.g. 1012627013490002 or S001)"
                className="pl-10 bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 font-mono text-sm h-11 rounded-xl"
              />
            </div>
            <Button
              type="button"
              onClick={() => setCameraModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-11 px-4 rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer"
              title="Open Phone Camera / Webcam Scanner"
            >
              <Camera className="w-4 h-4" />
              <span className="hidden sm:inline">Camera Scan</span>
            </Button>
            <Button
              disabled={loading}
              onClick={() => handleSearch()}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-11 px-5 rounded-xl flex items-center gap-2 shadow-xs cursor-pointer"
            >
              {loading ? "Searching..." : "Lookup"}
            </Button>
          </div>

          {/* Quick preset test buttons */}
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Quick test scan:</span>
            <button
              type="button"
              onClick={() => {
                setSearchInput("1012627013490002");
                handleSearch("1012627013490002");
              }}
              className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-lg font-mono text-emerald-700 hover:bg-emerald-100 font-bold cursor-pointer"
            >
              1012627013490002
            </button>
            <button
              type="button"
              onClick={() => {
                setSearchInput("S001");
                handleSearch("S001");
              }}
              className="px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-lg font-mono text-blue-700 hover:bg-blue-100 font-bold cursor-pointer"
            >
              S001
            </button>
          </div>

          {/* Scanned Result Details Card */}
          {scannedResult ? (
            <div className="space-y-4 bg-slate-50 p-5 rounded-2xl border border-slate-200 shadow-xs">
              {/* Product Header */}
              <div className="flex justify-between items-start border-b border-slate-200 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-extrabold text-slate-900 font-mono">
                      {scannedResult.item.itemCode}
                    </h3>
                    <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                      {scannedResult.item.serialNumber}
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      Stage: {scannedResult.item.currentStage}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 font-semibold">
                    {scannedResult.item.glassType}
                  </p>
                </div>
                <div
                  className="w-16 h-16 border border-slate-300 rounded-xl bg-white p-1 shadow-2xs"
                  dangerouslySetInnerHTML={{
                    __html: generateQRCodeSVG(scannedResult.item.barcode, 60),
                  }}
                />
              </div>

              {/* Specs Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-white p-3.5 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-500 block">PI Number:</span>
                  <span className="font-bold text-blue-600">{scannedResult.item.piNumber}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Batch:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {scannedResult.item.batchNo || scannedResult.item.sfoNo || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Position (POS):</span>
                  <span className="font-mono font-bold text-indigo-700">
                    POS {scannedResult.item.posNo || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Customer:</span>
                  <span className="font-bold text-slate-900 truncate">
                    {scannedResult.pi?.customerName}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Quantity:</span>
                  <span className="font-extrabold text-blue-700 font-mono">
                    {getDguEffectiveQtyAndSqm(scannedResult.item).qty}{" "}
                    {getDguEffectiveQtyAndSqm(scannedResult.item).unitLabel}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Total SQM:</span>
                  <span className="font-extrabold text-emerald-700 font-mono">
                    {getDguEffectiveQtyAndSqm(scannedResult.item).sqm.toFixed(2)} SQM
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Barcode ID:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {scannedResult.item.barcode}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">QR Code ID:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {scannedResult.item.qrId}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Order / OB #:</span>
                  <span className="font-mono text-slate-700">
                    {scannedResult.item.orderNo} / {scannedResult.item.obNo}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Location:</span>
                  <span className="font-bold text-amber-600">
                    {scannedResult.item.delLocation}
                  </span>
                </div>
              </div>

              {/* Route Progress Timeline */}
              <div>
                <label className="text-xs text-slate-600 font-bold uppercase block mb-2">
                  Process Route Progress
                </label>
                <div className="flex items-center gap-2 overflow-x-auto py-2">
                  {scannedResult.item.processRoute.map((stg, i) => {
                    const isDone = scannedResult.item.completedStages.includes(stg);
                    const isCurrent = scannedResult.item.currentStage === stg;
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <div
                          className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border flex items-center gap-1.5 ${
                            isDone
                              ? "bg-emerald-100 border-emerald-300 text-emerald-800"
                              : isCurrent
                              ? "bg-blue-600 border-blue-600 text-white shadow-xs"
                              : "bg-white border-slate-200 text-slate-400"
                          }`}
                        >
                          {isDone && <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />}
                          {stg}
                        </div>
                        {i < scannedResult.item.processRoute.length - 1 && (
                          <span className="text-slate-400 font-bold">→</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200">
                {onCompleteStage && scannedResult.item.currentStage !== "Finished" && (
                  <Button
                    size="sm"
                    onClick={() => {
                      onCompleteStage(scannedResult.item);
                      onOpenChange(false);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs font-bold rounded-xl cursor-pointer shadow-xs"
                  >
                    <CheckCircle className="w-4 h-4" /> Advance Stage ({scannedResult.item.currentStage})
                  </Button>
                )}
                {onReject &&
                  scannedResult.item.status !== "Rejected" &&
                  scannedResult.item.currentStage !== "Cutting" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        onReject(scannedResult.item);
                        onOpenChange(false);
                      }}
                      className="border-red-300 text-red-600 hover:bg-red-50 text-xs gap-1.5 font-bold rounded-xl cursor-pointer"
                    >
                      <AlertOctagon className="w-4 h-4" /> Reject Glass
                    </Button>
                  )}
                {onRework &&
                  scannedResult.item.currentStage !== "Cutting" &&
                  (scannedResult.item.status === "Rejected" ||
                    scannedResult.item.status === "Reworking" ||
                    (scannedResult.item.status as any) === "Rework") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        onRework(scannedResult.item);
                        onOpenChange(false);
                      }}
                      className="border-amber-300 text-amber-700 hover:bg-amber-50 text-xs gap-1.5 font-bold rounded-xl cursor-pointer"
                    >
                      <RefreshCw className="w-4 h-4" /> Send to Rework
                    </Button>
                  )}
                {onPrintSticker && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      onPrintSticker(scannedResult.item);
                    }}
                    className="border-slate-300 text-slate-700 hover:bg-slate-100 text-xs gap-1.5 font-bold rounded-xl cursor-pointer"
                  >
                    <Tag className="w-4 h-4" /> Print Sticker
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="p-10 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-3">
                <QrCode className="w-7 h-7" />
              </div>
              <p className="text-sm font-black text-slate-800">
                Ready for Scanner Gun or Manual Code Search
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Aim your handheld USB, wireless, or Bluetooth barcode gun at any glass sticker and pull the trigger.
              </p>
            </div>
          )}
        </div>
      </DialogContent>

      {/* Live Phone Camera Scanner Modal */}
      {cameraModalOpen && (
        <CameraScannerModal
          open={cameraModalOpen}
          onOpenChange={setCameraModalOpen}
          onScan={(code) => {
            setSearchInput(code);
            handleSearch(code);
          }}
          title="Phone Camera Barcode & QR Scanner"
        />
      )}
    </Dialog>
  );
};
