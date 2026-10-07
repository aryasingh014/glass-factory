import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Tag } from "lucide-react";
import { GlassItem, PIMaster } from "@shared/api";
import { generateBarcodeSVG, generateQRCodeSVG, formatSejalBarcode } from "@/lib/barcode";

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

  const realBarcode = item.barcode && /^\d{16,17}$/.test(item.barcode)
    ? item.barcode
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

  const handlePrintSticker = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl bg-white text-slate-900 border-slate-200 shadow-xl">
        <DialogHeader className="flex flex-row items-center justify-between border-b border-slate-200 pb-3">
          <DialogTitle className="text-lg font-extrabold flex items-center gap-2.5 text-slate-900">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <Tag className="w-4 h-4 text-white" />
            </div>
            <span>Glass Barcode Sticker Label</span>
          </DialogTitle>
          <Button onClick={handlePrintSticker} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-1 text-xs font-semibold shadow-sm">
            <Printer className="w-4 h-4" /> Print Sticker
          </Button>
        </DialogHeader>

        {/* Glass Factory Sticker matching exact Sejal Glass Dubai layout from user photo */}
        <div id="printable-glass-sticker" className="bg-white text-slate-950 p-4 rounded-xl border-2 border-slate-900 font-sans my-2 shadow-sm relative overflow-hidden">
          {/* Top Header Block matching exact Sejal Glass factory photo */}
          <div className="grid grid-cols-[140px_1fr] border-b-2 border-slate-900 bg-white">
            {/* Left Logo Cell */}
            <div className="flex items-center justify-center p-1.5 border-r-2 border-slate-900 bg-white min-h-[54px]">
              <img
                src="/sejal-glass-logo.png"
                alt="SEJAL GLASS"
                className="h-12 w-auto max-w-[130px] object-contain"
              />
            </div>
            {/* Right Barcode Cell */}
            <div className="flex items-center justify-center p-1 bg-white overflow-hidden">
              <div
                className="overflow-hidden flex items-center justify-center"
                dangerouslySetInnerHTML={{ __html: generateBarcodeSVG(realBarcode, 36, 1.4) }}
              />
            </div>
          </div>

          {/* 8-Column Grid Spec Table (Order No | OB # | SFO # | Batch # | POS # | QTY | Width | Height) */}
          <div className="border-b-2 border-slate-900">
            <div className="grid grid-cols-8 border-b border-slate-800 text-[9.5px] text-center font-extrabold uppercase bg-slate-100 py-0.5">
              <div className="border-r border-slate-800">Order No</div>
              <div className="border-r border-slate-800">OB #</div>
              <div className="border-r border-slate-800">SFO #</div>
              <div className="border-r border-slate-800">Batch #</div>
              <div className="border-r border-slate-800">POS #</div>
              <div className="border-r border-slate-800">QTY</div>
              <div className="border-r border-slate-800">Width</div>
              <div>Height</div>
            </div>
            <div className="grid grid-cols-8 text-center text-[11px] font-black font-mono py-1 bg-white items-center">
              <div className="border-r border-slate-800 truncate px-0.5" title={item.orderNo || pi?.jobOrderNumber || item.piNumber}>{getShortNum(item.orderNo || pi?.jobOrderNumber || item.piNumber)}</div>
              <div className="border-r border-slate-800 truncate px-0.5" title={item.obNo || pi?.obNo}>{getShortNum(item.obNo || pi?.obNo)}</div>
              <div className="border-r border-slate-800 truncate px-0.5" title={item.sfoNo || pi?.sfoNo}>{getShortNum(item.sfoNo || pi?.sfoNo)}</div>
              <div className="border-r border-slate-800 truncate px-0.5" title={item.batchNo}>{getShortNum(item.batchNo)}</div>
              <div className="border-r border-slate-800 truncate px-0.5">{item.posNo || String(item.srNo || 1)}</div>
              <div className="border-r border-slate-800 truncate px-0.5" title={`Position Line Total Qty: ${item.lineQty || item.qty}`}>{item.lineQty || item.qty}</div>
              <div className="border-r border-slate-800 truncate px-0.5">{item.width}</div>
              <div className="truncate px-0.5">{item.height}</div>
            </div>
          </div>

          {/* Body Section with Left Specs & Right Stamp */}
          <div className="flex justify-between items-stretch pt-2 pb-1 border-b border-slate-800 relative">
            {/* Left Specs Text */}
            <div className="space-y-0.5 text-[11px] font-extrabold text-slate-900 leading-tight uppercase max-w-[75%]">
              <div className="font-black text-xs text-slate-950 truncate">
                {(item as any).customerName || pi?.customerName || (item as any).clientName || "CUSTOMER"}
              </div>
              <div className="text-slate-900 font-bold truncate">
                PROJECT: {(item as any).projectName || pi?.projectName || "PROJECT"}
              </div>
              <div className="text-slate-900 font-black">
                {item.glassType || (item as any).description || "GLASS SPECIFICATION"}
              </div>
              <div className="text-slate-700 font-bold text-[10px]">
                {item.processRoute?.map((r) => r.toUpperCase().slice(0, 3)).join("/") || "CUT/TMP"}
              </div>
              <div className="text-slate-900 font-bold text-[10.5px]">
                Glass Code: {item.glassCode || item.itemCode || `GL ${item.posNo || 1}`}
              </div>
              {(item as any).makeup ? (
                <div className="text-slate-700 text-[10px]">
                  {(item as any).makeup}
                </div>
              ) : item.glassColor ? (
                <div className="text-slate-700 text-[10px]">
                  {item.glassColor} • {item.glassCategory || "Glass Unit"}
                </div>
              ) : null}
            </div>

            {/* Right Stamp & Vertical Delivery Date */}
            <div className="flex items-center justify-end gap-3 text-right">
              {/* Rack / Lot Stamp */}
              <div className="text-center">
                <div className="text-3xl font-black font-mono tracking-tighter text-slate-950 border-2 border-slate-950 px-1 py-0.5 rounded leading-none transform -rotate-6 shadow-2xs">
                  {item.batchNo ? `B-${item.batchNo}` : "B-1"}
                </div>
                <div className="text-[9px] font-mono font-bold mt-1 text-slate-700">LOT</div>
                <div className="text-[10px] font-black font-mono mt-0.5 text-slate-900">RACK: {item.rackNo || "1"}</div>
              </div>

              {/* Vertical Delivery Date */}
              <div className="writing-mode-vertical text-[9px] font-bold font-mono text-slate-800 tracking-wider flex items-center justify-center border-l border-slate-300 pl-1">
                DEL.date. {(item as any).delDate || pi?.deliveryDate || new Date().toLocaleDateString("en-GB")}
              </div>
            </div>
          </div>

          {/* Footer Bar (OPT Date | MADE IN UAE | Seq) */}
          <div className="flex justify-between items-center pt-1.5 text-[10px] font-black font-mono text-slate-900">
            <div>
              OPT date. <span className="font-bold">{(item as any).optDate || pi?.sfoDate || new Date().toLocaleDateString("en-GB")}</span>
            </div>
            <div className="text-xs font-black tracking-widest text-slate-950 uppercase">
              MADE IN UAE
            </div>
            <div className="text-xs font-black text-slate-950">
              POS: {item.posNo || 1}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
