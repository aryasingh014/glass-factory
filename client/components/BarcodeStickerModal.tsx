import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Tag, Info } from "lucide-react";
import { GlassItem, PIMaster, isGlassTypeColour } from "@shared/api";
import { generateBarcodeSVG, generateITFBarcodeSVG, formatSejalBarcode } from "@/lib/barcode";

interface BarcodeStickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: GlassItem | null;
  pi?: PIMaster | null;
}

export const BarcodeStickerModal: React.FC<BarcodeStickerModalProps> = ({
  open,
  onOpenChange,
  item,
  pi,
}) => {
  if (!item) return null;

  const [symbology, setSymbology] = useState<"code128" | "itf">("code128");
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);

  const realBarcode = (item.barcode && item.barcode.trim())
    ? item.barcode.trim()
    : (item.serialNumber && String(item.serialNumber).trim())
      ? String(item.serialNumber).trim()
      : formatSejalBarcode(item.sfoNo || item.piNumber, item.posNo || item.srNo || 16);

  const getShortNum = (val?: string) => {
    if (!val) return "";
    if (val.includes("/")) {
      const parts = val.split("/");
      const last = parts[parts.length - 1];
      const cleaned = last.replace(/^26270+/, "").replace(/^0+/, "");
      return cleaned || last;
    }
    return val;
  };

  const formatRoute = (route?: string[] | string): string => {
    if (!route) return "CUT/TMP";
    if (typeof route === "string") return route.toUpperCase();
    if (Array.isArray(route)) {
      const stageMap: Record<string, string> = {
        cutting: "CUT",
        pairing: "PAI",
        dgu: "DGU",
        finished: "FIN",
        lamination: "LAM",
        tempering: "TMP",
        polishing: "POL",
        "edge working": "EDGE",
        edgeworking: "EDGE",
        edging: "EDGE",
        "heat soak test": "HST",
        heatsoak: "HST",
        painting: "PAI",
        printing: "PRN",
      };
      return route
        .map((r) => stageMap[r.toLowerCase()] || r.toUpperCase().slice(0, 3))
        .join("/");
    }
    return "CUT/TMP";
  };

  const getMakeupLines = (itm: GlassItem): string[] => {
    const rawMakeup = (itm as any).makeup;
    if (rawMakeup && typeof rawMakeup === "string" && rawMakeup.trim().length > 0) {
      if (rawMakeup.includes("\n")) {
        return rawMakeup.split("\n").map((s) => s.trim()).filter(Boolean);
      }
      if (rawMakeup.includes(" / ")) {
        return rawMakeup.split(" / ").map((s) => s.trim()).filter(Boolean);
      }
      if (rawMakeup.includes(" + ")) {
        return rawMakeup.split(" + ").map((s) => s.trim()).filter(Boolean);
      }
      return [rawMakeup.trim()];
    }

    // Derive realistic factory makeup lines matching physical sticker format if not explicitly set
    const glassType = itm.glassType || (itm as any).description || "6MM CLEAR";
    const cat = (itm.glassCategory || itm.category || "").toUpperCase();

    if (cat.includes("DGU") || cat.includes("IGU")) {
      const isCoatedOrTint = isGlassTypeColour(glassType);
      const outerPane = glassType;
      const spacer = "16MM BLACK SPACER";
      const innerPane = isCoatedOrTint ? "6MM CLEAR" : (glassType.replace(/with\s+sand\s+blasting/gi, "").trim() || "6MM CLEAR");
      return [outerPane, spacer, innerPane];
    }

    if (cat.includes("LAM")) {
      return [glassType, "1.52MM CLEAR PVB", glassType];
    }

    if (cat.includes("DLGU")) {
      return [glassType, "16MM BLACK SPACER", "13.52MM CLEAR LAMINATED"];
    }

    return [];
  };

  const handlePrintSticker = () => {
    window.print();
  };

  const makeupLines = getMakeupLines(item);
  const delDate = (item as any).delDate || pi?.deliveryDate || new Date().toLocaleDateString("en-GB");
  const optDate = (item as any).optDate || pi?.sfoDate || new Date().toLocaleDateString("en-GB");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl bg-white text-slate-900 border-slate-200 shadow-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between border-b border-slate-200 pb-3">
          <DialogTitle className="text-lg font-extrabold flex items-center gap-2.5 text-slate-900">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <Tag className="w-4 h-4 text-white" />
            </div>
            <span>Glass Barcode Sticker Label</span>
          </DialogTitle>
          <div className="flex items-center gap-2">
            <Button onClick={handlePrintSticker} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-1 text-xs font-semibold shadow-sm">
              <Printer className="w-4 h-4" /> Print Sticker
            </Button>
          </div>
        </DialogHeader>

        {/* Symbology Toolbar & Hardcopy Notice */}
        <div className="flex items-center justify-between gap-2 py-1 px-1 text-xs print:hidden">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-600 text-[11px]">Barcode Format:</span>
            <button
              type="button"
              onClick={() => setSymbology("code128")}
              className={`px-2 py-0.5 rounded text-[11px] font-bold border transition-colors ${
                symbology === "code128"
                  ? "bg-blue-50 text-blue-700 border-blue-400 shadow-xs"
                  : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
              }`}
            >
              Code 128 (Universal)
            </button>
            <button
              type="button"
              onClick={() => setSymbology("itf")}
              className={`px-2 py-0.5 rounded text-[11px] font-bold border transition-colors ${
                symbology === "itf"
                  ? "bg-blue-50 text-blue-700 border-blue-400 shadow-xs"
                  : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
              }`}
            >
              ITF (Factory Hardcopy Match)
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowTroubleshooting(!showTroubleshooting)}
            className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 underline underline-offset-2"
          >
            <Info className="w-3.5 h-3.5" />
            Scanner Gun Tip
          </button>
        </div>

        {showTroubleshooting && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-950 space-y-2.5 print:hidden animate-in fade-in duration-200">
            <div className="font-extrabold flex items-center gap-2 text-amber-950 border-b border-amber-200 pb-1.5">
              <Info className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Why Barcodes Scan From Screen But May Fail On Hardcopy Paper:</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] leading-relaxed">
              <div className="bg-white/80 p-2.5 rounded-lg border border-amber-200 space-y-1">
                <div className="font-bold text-amber-900 flex items-center gap-1.5">
                  <Printer className="w-3.5 h-3.5 text-blue-600" />
                  <span>1. If You Printed This Sticker On Paper:</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-700">
                  <li><strong>Print Scale Setting:</strong> In your browser print dialog, set <em>Scale: 100% (Default)</em>, NOT <em>&quot;Fit to Page&quot;</em>. &quot;Fit to page&quot; shrinks bars and distorts narrow-to-wide ratios.</li>
                  <li><strong>Laser Scan Angle:</strong> Hold your scanner gun at a <strong>15&deg;&ndash;30&deg; tilt</strong> to paper. A direct 90&deg; perpendicular laser reflects glare into the scanner sensor lens.</li>
                  <li><strong>Quiet Zone Margins:</strong> The barcode now has expanded 26px white margins on both sides to prevent outer borders from jamming scanner lasers.</li>
                </ul>
              </div>

              <div className="bg-white/80 p-2.5 rounded-lg border border-amber-200 space-y-1">
                <div className="font-bold text-amber-900 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-amber-600" />
                  <span>2. If Scanning Original Factory Paper:</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-700">
                  <li><strong>Symbology Mismatch:</strong> Factory ERP printouts use <strong>Interleaved 2 of 5 (ITF)</strong>. Most scanner guns ship with ITF disabled by default (only Code 128 enabled).</li>
                  <li><strong>The Solution:</strong> In your handheld scanner manual, scan the programming barcode for <em>&quot;Enable Interleaved 2 of 5 (ITF)&quot;</em> and <em>&quot;ITF Any Length&quot;</em>.</li>
                  <li><strong>Camera Scanner:</strong> You can also tap the on-screen <strong>Camera Scanner</strong> button (top bar) which detects ITF stickers automatically!</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Glass Factory Sticker matching EXACT Sejal Glass Dubai physical sticker layout */}
        <div
          id="printable-glass-sticker"
          className="bg-white text-black p-3.5 border-2 border-black font-sans my-2 shadow-sm relative overflow-visible select-none rounded-none"
        >
          {/* Top Header Block: Logo Cell (Left) + Barcode Cell with Centered Numeric Code (Right) */}
          <div className="grid grid-cols-[115px_1fr] border-b-2 border-black bg-white">
            {/* Left Logo Cell */}
            <div className="flex items-center justify-center p-1.5 border-r-2 border-black bg-white min-h-[66px] overflow-hidden">
              <img
                src="/sejal-glass-logo.png"
                alt="SEJAL GLASS"
                className="h-10 w-auto max-w-[100px] object-contain"
              />
            </div>
            {/* Right Barcode Cell: Non-clipped, high contrast, clean quiet zones */}
            <div className="flex items-center justify-center p-1.5 bg-white overflow-visible min-h-[68px] w-full">
              <div
                className="w-full flex items-center justify-center overflow-visible"
                dangerouslySetInnerHTML={{
                  __html: symbology === "itf"
                    ? generateITFBarcodeSVG(realBarcode, 50, 1.6)
                    : generateBarcodeSVG(realBarcode, 50, 1.7),
                }}
              />
            </div>
          </div>

          {/* 8-Column Grid Spec Table (ORDER # | OB # | SFO # | BATCH # | POS # | QTY | WIDTH | HEIGHT) */}
          <div className="border-b-2 border-black bg-white">
            <div className="grid grid-cols-8 border-b border-black text-[9.5px] text-center font-black uppercase bg-white py-0.5 text-black">
              <div className="border-r border-black">ORDER #</div>
              <div className="border-r border-black">OB #</div>
              <div className="border-r border-black">SFO #</div>
              <div className="border-r border-black">BATCH #</div>
              <div className="border-r border-black">POS #</div>
              <div className="border-r border-black">QTY</div>
              <div className="border-r border-black">WIDTH</div>
              <div>HEIGHT</div>
            </div>
            <div className="grid grid-cols-8 text-center text-[11px] font-black font-mono py-1 bg-white items-center text-black">
              <div className="border-r border-black truncate px-0.5" title={item.orderNo || pi?.jobOrderNumber || item.piNumber}>
                {getShortNum(item.orderNo || pi?.jobOrderNumber || item.piNumber) || "-"}
              </div>
              <div className="border-r border-black truncate px-0.5" title={item.obNo || pi?.obNo}>
                {getShortNum(item.obNo || pi?.obNo) || "-"}
              </div>
              <div className="border-r border-black truncate px-0.5" title={item.sfoNo || pi?.sfoNo}>
                {getShortNum(item.sfoNo || pi?.sfoNo) || "-"}
              </div>
              <div className="border-r border-black truncate px-0.5" title={item.batchNo || pi?.batchNo}>
                {getShortNum(item.batchNo || pi?.batchNo) || "-"}
              </div>
              <div className="border-r border-black truncate px-0.5">
                {item.posNo || String(item.srNo || 1)}
              </div>
              <div className="border-r border-black truncate px-0.5" title={`Position Line Total Qty: ${item.lineQty || item.qty}`}>
                {item.lineQty || item.qty || 1}
              </div>
              <div className="border-r border-black truncate px-0.5">
                {item.width || "-"}
              </div>
              <div className="truncate px-0.5">
                {item.height || "-"}
              </div>
            </div>
          </div>

          {/* Body Section with Left Specs, Makeup Layers & Right Vertical Delivery Date */}
          <div className="flex justify-between items-stretch px-2.5 pt-2 pb-1.5 border-b-2 border-black relative bg-white min-h-[142px]">
            {/* Left Specs Text */}
            <div className="space-y-0.5 text-[10.5px] font-black uppercase text-black leading-tight max-w-[78%]">
              {/* Line 1: Customer Name */}
              <div className="font-black text-xs text-black truncate tracking-tight">
                {(item as any).customerName || pi?.customerName || (item as any).clientName || "CUSTOMER"}
              </div>

              {/* Line 2: Project Name */}
              <div className="text-black font-black truncate tracking-tight">
                PROJECT; {(item as any).projectName || pi?.projectName || "PROJECT"}
              </div>

              {/* Line 3: Glass Specification / Primary Type */}
              <div className="text-black font-black truncate tracking-tight">
                {item.glassType || (item as any).description || "GLASS SPECIFICATION"}
              </div>

              {/* Line 4: Process Routing */}
              <div className="text-black font-bold text-[10px] tracking-tight">
                {formatRoute(item.processRoute)}
              </div>

              {/* Line 5: Glass Code */}
              <div className="text-black font-black text-[10.5px] tracking-tight">
                GLASS CODE; {item.glassCode || item.itemCode || `GL ${item.posNo || 1}`}
              </div>

              {/* Lines 6, 7, 8: Physical Glass Makeup Structure (Outer Pane, Spacer/Interlayer, Inner Pane) */}
              {makeupLines.length > 0 ? (
                makeupLines.map((line, idx) => (
                  <div key={idx} className="text-black font-bold text-[10px] leading-tight tracking-tight truncate">
                    {line}
                  </div>
                ))
              ) : (
                <div className="text-black font-bold text-[10px] leading-tight tracking-tight truncate">
                  {item.glassType || "6MM CLEAR TEMPERED"}
                </div>
              )}
            </div>

            {/* Right Side: Corner Rack / Edge Indicators & Vertical Delivery Date */}
            <div className="flex items-stretch justify-end pl-2">
              {/* Right Margin Detail (Edge flags + Piece / Rack sequence matching physical sticker) */}
              <div className="flex flex-col justify-end items-end pr-2 pb-0.5 text-right select-none">
                <div className="text-[10px] font-bold font-mono text-black leading-none mb-1">
                  0 0 0 0
                </div>
                <div className="text-xs font-black font-mono text-black leading-none">
                  {item.rackNo || "1"}
                </div>
              </div>

              {/* Vertical Delivery Date along right border */}
              <div className="writing-mode-vertical text-[9.5px] font-black font-mono text-black tracking-wider flex items-center justify-center border-l-2 border-black pl-1.5 py-1 select-none">
                DEL.date. {delDate}
              </div>
            </div>
          </div>

          {/* Footer Bar (OPT Date | MADE IN UAE | POS) */}
          <div className="flex justify-between items-center px-2.5 py-1 text-[10px] font-black font-mono text-black bg-white">
            <div>
              OPT.date. <span className="font-bold">{optDate}</span>
            </div>
            <div className="text-xs font-black tracking-widest text-black uppercase">
              MADE IN UAE
            </div>
            <div className="text-xs font-black text-black">
              POS: {item.posNo || 1}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
