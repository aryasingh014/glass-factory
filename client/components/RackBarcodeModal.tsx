import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Boxes, Layers, Copy, Check, Sparkles, QrCode } from "lucide-react";
import { generateBarcodeSVG } from "@/lib/barcode";
import { formatRackBarcode, RACK_LETTERS, RackLetter } from "@shared/barcodeConfig";

interface RackBarcodeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "IGU" | "LAMI";
  currentRack: RackLetter;
  currentSlot: string;
  rackSlots: Record<RackLetter, string>;
  rackCounts: Record<RackLetter, { units: number; sqm: number }>;
  onSelectRack?: (rack: RackLetter, slot: string) => void;
}

export const RackBarcodeModal: React.FC<RackBarcodeModalProps> = ({
  open,
  onOpenChange,
  type,
  currentRack,
  rackSlots,
  rackCounts,
  onSelectRack,
}) => {
  const [selectedRack, setSelectedRack] = useState<RackLetter>(currentRack);
  const [printMode, setPrintMode] = useState<"single" | "all">("all");
  const [copied, setCopied] = useState(false);

  // Sync with prop when opened
  React.useEffect(() => {
    if (open) {
      setSelectedRack(currentRack);
      setPrintMode("all");
      setCopied(false);
    }
  }, [open, currentRack]);

  // Fixed barcode for the rack letter (RACK-A, RACK-B, RACK-C, RACK-D, RACK-E) - NOT for the slot number
  const activeBarcode = formatRackBarcode(selectedRack);

  const handleRackChange = (rk: RackLetter) => {
    setSelectedRack(rk);
    if (onSelectRack) {
      onSelectRack(rk, rackSlots[rk] || "1");
    }
  };

  const handleCopyBarcode = () => {
    navigator.clipboard.writeText(activeBarcode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = (mode: "single" | "all") => {
    setPrintMode(mode);
    document.body.classList.add("printing-rack-barcode");
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.body.classList.remove("printing-rack-barcode");
      }, 1000);
    }, 150);
  };

  React.useEffect(() => {
    return () => {
      document.body.classList.remove("printing-rack-barcode");
    };
  }, []);

  const deptName = type === "IGU" ? "IGU PACKING LINE" : "AUTOCLAVE LAMINATION LINE";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-white text-slate-900 border-slate-200 shadow-2xl max-h-[94vh] overflow-y-auto">
        <DialogHeader className="border-b border-slate-200 pb-3 flex flex-row items-center justify-between pr-8">
          <DialogTitle className="text-lg font-black flex items-center gap-2 text-slate-900">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-xs ${
                type === "IGU" ? "bg-teal-600" : "bg-amber-600"
              }`}
            >
              {type === "IGU" ? <Boxes className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
            </div>
            <span>Physical Wall Barcodes for Racks A, B, C, D, E</span>
          </DialogTitle>

          <div className="flex items-center gap-2 print:hidden">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => handlePrint("all")}
              className="text-xs font-bold border-indigo-300 text-indigo-700 hover:bg-indigo-50 cursor-pointer shadow-2xs"
              title="Print wall posters for all 5 racks (Rack A to Rack E)"
            >
              <Printer className="w-3.5 h-3.5 mr-1 text-indigo-600" />
              Print All 5 Posters (A-E)
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => handlePrint("single")}
              className={`text-xs font-bold text-white shadow-xs cursor-pointer ${
                type === "IGU" ? "bg-teal-600 hover:bg-teal-700" : "bg-amber-600 hover:bg-amber-700"
              }`}
            >
              <Printer className="w-3.5 h-3.5 mr-1" />
              Print {selectedRack}
            </Button>
          </div>
        </DialogHeader>

        {/* ── Instructions Notice ── */}
        <div className="bg-indigo-50/80 border border-indigo-200 p-3 rounded-xl text-xs space-y-1 print:hidden">
          <div className="font-black text-indigo-950 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <span>Wall Barcode Scanning Process (Hands-Free Operation):</span>
          </div>
          <ol className="list-decimal list-inside text-indigo-900 font-medium space-y-0.5 ml-1 text-[11px]">
            <li>Take printout of these rack barcodes and paste them on the physical wall or metal racks.</li>
            <li>
              Instead of selecting racks manually on the screen, scan <strong className="font-mono">RACK-A</strong> on the wall to activate Rack A.
            </li>
            <li>Scan glass stickers to automatically pack them directly onto Rack A.</li>
            <li>To change racks, simply scan <strong className="font-mono">RACK-B</strong> (or C, D, E) on the wall and continue scanning stickers!</li>
          </ol>
        </div>

        {/* ── Rack Selector Bar ── */}
        <div className="space-y-3 py-1 print:hidden">
          <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black text-slate-600 uppercase tracking-wider">
                Select Rack:
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {RACK_LETTERS.map((rk) => {
                  const isSel = selectedRack === rk;
                  const bcode = formatRackBarcode(rk);
                  const cnt = rackCounts[rk]?.units || 0;
                  return (
                    <button
                      key={rk}
                      type="button"
                      onClick={() => handleRackChange(rk)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 border shadow-2xs ${
                        isSel
                          ? type === "IGU"
                            ? "bg-teal-600 text-white border-teal-700 ring-2 ring-teal-200"
                            : "bg-amber-600 text-white border-amber-700 ring-2 ring-amber-200"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      <span>{rk}</span>
                      <span
                        className={`text-[10px] px-1 rounded font-mono ${
                          isSel ? "bg-white/25 text-white" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {bcode}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={handleCopyBarcode}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Copied" : `Copy ${activeBarcode}`}</span>
            </button>
          </div>
        </div>

        {/* ── Poster Preview (Screen View) ── */}
        <div className="flex justify-center p-2 bg-slate-100/70 rounded-xl border border-slate-200 print:hidden">
          <div className="w-full max-w-md bg-white border-4 border-black rounded-xl p-5 shadow-lg space-y-4 text-center">
            {/* Header */}
            <div className="border-b-2 border-black pb-2 text-center">
              <div className="text-base font-black tracking-wider text-black uppercase">
                SEJAL GLASS ARCHITECTURAL SOLUTIONS
              </div>
              <div className="text-[11px] font-black text-gray-700 tracking-tight uppercase mt-0.5">
                {deptName} • TARGET RACK ACTIVATOR
              </div>
            </div>

            {/* Huge Rack Letter */}
            <div className="bg-slate-50 py-3 px-4 rounded-xl border-2 border-black">
              <div className="text-xs font-black text-gray-500 uppercase tracking-widest">
                TARGET RACK
              </div>
              <div className="text-4xl font-black text-black tracking-tight mt-1">
                {selectedRack.toUpperCase()}
              </div>
            </div>

            {/* Giant Barcode SVG for Scanning from Distance */}
            <div className="flex flex-col items-center justify-center p-4 bg-white border-2 border-dashed border-gray-400 rounded-xl space-y-2">
              <div
                className="w-full flex justify-center"
                dangerouslySetInnerHTML={{
                  __html: generateBarcodeSVG(activeBarcode, 75, 2.2),
                }}
              />
              <div className="text-lg font-mono font-black text-black tracking-[0.25em]">
                {activeBarcode}
              </div>
            </div>

            {/* Step-by-Step Scanning Instructions Banner on Poster */}
            <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-2.5 text-left text-xs font-bold text-amber-900 space-y-1">
              <div className="flex items-center gap-1.5 text-amber-950 font-black">
                <span>1.</span>
                <span>SCAN THIS BARCODE TO SELECT {selectedRack.toUpperCase()}</span>
              </div>
              <div className="flex items-center gap-1.5 text-amber-950 font-black">
                <span>2.</span>
                <span>THEN SCAN GLASS STICKERS TO PACK DIRECTLY ONTO THIS RACK</span>
              </div>
            </div>

            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              Paste this poster on physical {selectedRack} or nearby plant wall
            </div>
          </div>
        </div>

        {/* ── Printable Wall Posters (Only Visible in Print - Clean Barcode & Name Only) ── */}
        <div id="printable-rack-barcode" className="hidden print:block font-sans text-black">
          {printMode === "single" ? (
            /* Single Rack Wall Poster */
            <div className="w-[180mm] max-w-[180mm] p-8 border-4 border-black rounded-2xl mx-auto my-8 bg-white space-y-6 text-center break-inside-avoid">
              <div className="border-b-4 border-black pb-3">
                <div className="text-xl font-black tracking-wider text-black uppercase">
                  SEJAL GLASS ARCHITECTURAL SOLUTIONS
                </div>
                <div className="text-xs font-black text-black uppercase tracking-widest mt-1">
                  {deptName} • TARGET RACK ACTIVATOR
                </div>
              </div>

              <div className="border-2 border-black p-4 rounded-xl bg-gray-50">
                <div className="text-sm font-black text-black uppercase tracking-widest">
                  TARGET STORAGE RACK
                </div>
                <div className="text-6xl font-black text-black mt-2">
                  {selectedRack.toUpperCase()}
                </div>
              </div>

              <div className="flex flex-col items-center justify-center p-6 border-2 border-black rounded-xl space-y-3">
                <div
                  className="w-full flex justify-center"
                  dangerouslySetInnerHTML={{
                    __html: generateBarcodeSVG(activeBarcode, 90, 2.6),
                  }}
                />
                <div className="text-2xl font-mono font-black text-black tracking-[0.25em]">
                  {activeBarcode}
                </div>
              </div>

              <div className="border-2 border-black rounded-xl p-4 text-left font-black text-sm space-y-1 bg-gray-50">
                <div>👉 STEP 1: SCAN THIS BARCODE TO SELECT {selectedRack.toUpperCase()}</div>
                <div>👉 STEP 2: SCAN GLASS STICKERS TO PACK DIRECTLY ONTO THIS RACK</div>
              </div>

              <div className="text-xs font-bold text-gray-600 uppercase">
                SEJAL AGY OPERATIONS • SHOP FLOOR WALL POSTER
              </div>
            </div>
          ) : (
            /* All 5 Wall Posters (Rack A to Rack E) - 1 page per rack */
            <div>
              {RACK_LETTERS.map((rk) => {
                const bcode = formatRackBarcode(rk);
                return (
                  <div
                    key={rk}
                    className="w-[180mm] max-w-[180mm] p-8 border-4 border-black rounded-2xl mx-auto mb-16 bg-white space-y-6 text-center break-inside-avoid page-break-after-always"
                  >
                    <div className="border-b-4 border-black pb-3">
                      <div className="text-xl font-black tracking-wider text-black uppercase">
                        SEJAL GLASS ARCHITECTURAL SOLUTIONS
                      </div>
                      <div className="text-xs font-black text-black uppercase tracking-widest mt-1">
                        {deptName} • TARGET RACK ACTIVATOR
                      </div>
                    </div>

                    <div className="border-2 border-black p-4 rounded-xl bg-gray-50">
                      <div className="text-sm font-black text-black uppercase tracking-widest">
                        TARGET STORAGE RACK
                      </div>
                      <div className="text-6xl font-black text-black mt-2">
                        {rk.toUpperCase()}
                      </div>
                    </div>

                    <div className="flex flex-col items-center justify-center p-6 border-2 border-black rounded-xl space-y-3">
                      <div
                        className="w-full flex justify-center"
                        dangerouslySetInnerHTML={{
                          __html: generateBarcodeSVG(bcode, 90, 2.6),
                        }}
                      />
                      <div className="text-2xl font-mono font-black text-black tracking-[0.25em]">
                        {bcode}
                      </div>
                    </div>

                    <div className="border-2 border-black rounded-xl p-4 text-left font-black text-sm space-y-1 bg-gray-50">
                      <div>👉 STEP 1: SCAN THIS BARCODE TO SELECT {rk.toUpperCase()}</div>
                      <div>👉 STEP 2: SCAN GLASS STICKERS TO PACK DIRECTLY ONTO THIS RACK</div>
                    </div>

                    <div className="text-xs font-bold text-gray-600 uppercase">
                      SEJAL AGY OPERATIONS • SHOP FLOOR WALL POSTER
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
