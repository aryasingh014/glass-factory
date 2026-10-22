import React, { useState, useRef, useEffect } from "react";
import {
  ScanLine,
  Volume2,
  VolumeX,
  Zap,
  Eye,
  CheckCircle2,
  HelpCircle,
  Play,
  Settings2,
  Camera,
} from "lucide-react";
import { scannerAudio } from "@/lib/audioBeep";
import { CameraScannerModal } from "@/components/CameraScannerModal";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ScannerStatusWidgetProps {
  autoAdvance: boolean;
  onToggleAutoAdvance: (val: boolean) => void;
  lastScannedCode?: string | null;
  lastScannedTime?: Date | null;
  currentStage?: string;
  onOpenScanModal: () => void;
  onSimulateScan?: (code: string) => void;
}

export const ScannerStatusWidget: React.FC<ScannerStatusWidgetProps> = ({
  autoAdvance,
  onToggleAutoAdvance,
  lastScannedCode,
  lastScannedTime,
  currentStage,
  onOpenScanModal,
  onSimulateScan,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(() => scannerAudio.getMuted());
  const [testInput, setTestInput] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !isMuted;
    setIsMuted(next);
    scannerAudio.setMuted(next);
    if (!next) {
      scannerAudio.playSuccess();
    }
  };

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleTestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testInput.trim()) return;
    onSimulateScan?.(testInput.trim());
    setTestInput("");
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs border border-slate-700/80 cursor-pointer select-none group"
            >
              {/* Pulsing Scanner Beacon */}
              <div className="relative flex items-center justify-center">
                <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </div>

              <ScanLine className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-110 transition-transform" />

              <span className="hidden sm:inline text-[11px] tracking-tight font-black text-slate-100">
                SCANNER GUN
              </span>

              {currentStage ? (
                <span className="inline-flex items-center text-[9px] font-black uppercase tracking-wider bg-blue-500/20 text-sky-300 border border-sky-400/30 px-1.5 py-0.2 rounded-md">
                  {currentStage}
                </span>
              ) : (
                <span className="inline-flex items-center text-[9px] font-black uppercase tracking-wider bg-slate-700/60 text-slate-300 border border-slate-600 px-1.5 py-0.2 rounded-md">
                  LOOKUP
                </span>
              )}

              {autoAdvance ? (
                <span className="hidden md:inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.2 rounded-md">
                  <Zap className="w-2.5 h-2.5 fill-emerald-400" />
                  Auto
                </span>
              ) : (
                <span className="hidden md:inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider bg-blue-500/20 text-cyan-300 border border-cyan-500/40 px-1.5 py-0.2 rounded-md">
                  <Eye className="w-2.5 h-2.5" />
                  Lookup
                </span>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs bg-slate-900 text-white border-slate-700">
            {currentStage
              ? `Hardware Scanner active for ${currentStage} Workstation (Trigger auto-advances items)`
              : "Hardware Scanner active (Global Lookup Mode — Open a workstation tab to advance items)"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-2xl p-4 z-50 animate-in fade-in slide-in-from-top-2 text-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
                <ScanLine className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-900 leading-tight">
                  Scanner Gun Controller
                </h4>
                <p className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                  {currentStage ? `Workstation: ${currentStage}` : "Mode: Global Search & Lookup"}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={toggleMute}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                isMuted
                  ? "bg-rose-50 border-rose-200 text-rose-600"
                  : "bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200"
              }`}
              title={isMuted ? "Audio muted" : "Audio enabled"}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>

          {/* Mode Selector */}
          <div className="space-y-2 mb-3">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
              Scanning Mode
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onToggleAutoAdvance(true)}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  autoAdvance
                    ? "bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/20 text-emerald-950"
                    : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <Zap className={`w-3.5 h-3.5 ${autoAdvance ? "text-emerald-600 fill-emerald-500" : "text-slate-400"}`} />
                  {autoAdvance && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                </div>
                <div className="font-extrabold text-[11px]">Auto Advance</div>
                <div className="text-[9px] text-slate-500 leading-tight mt-0.5">
                  Instant advance &amp; pairing on trigger
                </div>
              </button>

              <button
                type="button"
                onClick={() => onToggleAutoAdvance(false)}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  !autoAdvance
                    ? "bg-blue-50 border-blue-500 ring-2 ring-blue-500/20 text-blue-950"
                    : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <Eye className={`w-3.5 h-3.5 ${!autoAdvance ? "text-blue-600" : "text-slate-400"}`} />
                  {!autoAdvance && <CheckCircle2 className="w-3 h-3 text-blue-600" />}
                </div>
                <div className="font-extrabold text-[11px]">Lookup &amp; Preview</div>
                <div className="text-[9px] text-slate-500 leading-tight mt-0.5">
                  Opens item details before advancing
                </div>
              </button>
            </div>
          </div>

          {/* Last Scanned Code */}
          {lastScannedCode && (
            <div className="p-2 bg-slate-50 rounded-xl border border-slate-200 mb-3 text-xs">
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex justify-between">
                <span>Last Scanned</span>
                {lastScannedTime && (
                  <span>{lastScannedTime.toLocaleTimeString()}</span>
                )}
              </div>
              <div className="font-mono font-bold text-slate-900 mt-0.5 truncate text-[11px]">
                {lastScannedCode}
              </div>
            </div>
          )}

          {/* Quick Actions & Virtual Test Scan */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setCameraModalOpen(true);
              }}
              className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <Camera className="w-4 h-4" />
              Scan with Phone / Device Camera
            </button>

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenScanModal();
              }}
              className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <ScanLine className="w-3.5 h-3.5" />
              Open Manual Search &amp; Lookup
            </button>

            {/* Simulated test barcode input for testing without hardware */}
            <form onSubmit={handleTestSubmit} className="pt-2 flex gap-1.5">
              <input
                type="text"
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                placeholder="Test barcode (e.g. 1012627013490002)"
                className="flex-1 px-2.5 py-1 text-[11px] font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="submit"
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-900 text-white text-[11px] font-bold rounded-lg cursor-pointer flex items-center gap-1"
              >
                <Play className="w-3 h-3" />
                Fire
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Camera Scanner Modal */}
      {cameraModalOpen && (
        <CameraScannerModal
          open={cameraModalOpen}
          onOpenChange={setCameraModalOpen}
          onScan={(code) => {
            onSimulateScan?.(code);
          }}
          title="Phone Camera Barcode & QR Scanner"
        />
      )}
    </div>
  );
};
