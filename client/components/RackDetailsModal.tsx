import React, { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Boxes,
  Layers,
  Search,
  Tag,
  Printer,
  QrCode,
  Check,
  Send,
  Building2,
  FileText,
  Barcode,
  ExternalLink,
  X,
} from "lucide-react";
import { GlassItem } from "@shared/api";
import { formatRackBarcode, RackLetter } from "@shared/barcodeConfig";
import type { PackingUnitRow } from "@/components/PackingListView";

interface RackDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "IGU" | "LAMI";
  rackLetter: RackLetter;
  rackSlot: string;
  shift: "Day" | "Night";
  rows: PackingUnitRow[];
  onOpenSticker: (item: GlassItem) => void;
  onOpenRackBarcodeModal: () => void;
  onPrintPackingList: () => void;
  onSendUnitsToFinished?: (rows: PackingUnitRow[]) => Promise<void>;
  loading?: boolean;
}

export const RackDetailsModal: React.FC<RackDetailsModalProps> = ({
  open,
  onOpenChange,
  type,
  rackLetter,
  rackSlot,
  shift,
  rows,
  onOpenSticker,
  onOpenRackBarcodeModal,
  onPrintPackingList,
  onSendUnitsToFinished,
  loading = false,
}) => {
  const [searchTerm, setSearchTerm] = useState("");

  const rackBarcode = formatRackBarcode(rackLetter, rackSlot);

  // Filter rows belonging to this rack
  const rackRows = useMemo(() => {
    return rows.filter((r) => r.rackNo === rackLetter);
  }, [rows, rackLetter]);

  // Search filter
  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return rackRows;
    const q = searchTerm.toLowerCase().trim();
    return rackRows.filter((r) => {
      const piValue = r.piNumber || (r as any).piNo || "";
      if (String(r.posNo || "").toLowerCase().includes(q)) return true;
      if (String(piValue).toLowerCase().includes(q)) return true;
      if (String(r.batchNo || "").toLowerCase().includes(q)) return true;
      if (String(r.customerName || "").toLowerCase().includes(q)) return true;
      if (String(r.projectName || "").toLowerCase().includes(q)) return true;
      if (String(r.primaryItem?.barcode || "").toLowerCase().includes(q)) return true;
      if (String(r.partnerItem?.barcode || "").toLowerCase().includes(q)) return true;
      if (String((r.primaryItem as any)?.glassSpec || r.primaryItem?.glassType || "").toLowerCase().includes(q)) return true;
      if (r.allSerials.some((s) => s.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [rackRows, searchTerm]);

  const totalUnits = rackRows.length;
  const totalSqm = rackRows.reduce((acc, r) => acc + (r.sqm || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl bg-white text-slate-900 border-slate-200 shadow-2xl max-h-[92vh] flex flex-col p-0 overflow-hidden">
        {/* Header Bar */}
        <div className="bg-slate-900 text-white p-4 border-b border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-white shadow-md ${
                  type === "IGU"
                    ? "bg-gradient-to-br from-teal-500 to-emerald-700"
                    : "bg-gradient-to-br from-amber-500 to-orange-700"
                }`}
              >
                {type === "IGU" ? <Boxes className="w-6 h-6" /> : <Layers className="w-6 h-6" />}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-black tracking-tight">{rackLetter}</h2>
                  {rackSlot && (
                    <span className="px-2 py-0.5 rounded-md bg-white/20 text-white text-xs font-mono font-bold">
                      Slot #{rackSlot}
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-xs font-mono font-bold border border-emerald-500/30 flex items-center gap-1">
                    <Barcode className="w-3.5 h-3.5" />
                    <span>{rackBarcode}</span>
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  Physical Rack Manifest & Sticker Location Inspector • {shift} Shift
                </p>
              </div>
            </div>

            {/* Top Action Buttons */}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onOpenRackBarcodeModal}
                className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs font-bold gap-1 cursor-pointer"
                title="View / Print Rack Barcode Sticker"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Rack Sticker</span>
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={onPrintPackingList}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1 shadow-sm cursor-pointer"
                title="Print official packing manifest for this rack"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Packing List</span>
              </Button>
            </div>
          </div>

          {/* Quick Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3 border-t border-slate-800 text-xs">
            <div className="bg-white/5 rounded-lg p-2 border border-white/10">
              <span className="text-slate-400 text-[10px] uppercase font-bold block">Units on Rack</span>
              <strong className="text-base text-white font-mono">{totalUnits} Units</strong>
            </div>
            <div className="bg-white/5 rounded-lg p-2 border border-white/10">
              <span className="text-slate-400 text-[10px] uppercase font-bold block">Total Area</span>
              <strong className="text-base text-teal-400 font-mono">{totalSqm.toFixed(2)} m²</strong>
            </div>
            <div className="bg-white/5 rounded-lg p-2 border border-white/10">
              <span className="text-slate-400 text-[10px] uppercase font-bold block">Department</span>
              <strong className="text-white font-semibold">
                {type === "IGU" ? "IGU Packing" : "Auto Clave"}
              </strong>
            </div>
            <div className="bg-white/5 rounded-lg p-2 border border-white/10">
              <span className="text-slate-400 text-[10px] uppercase font-bold block">Scanned Barcode</span>
              <strong className="text-emerald-400 font-mono">{rackBarcode}</strong>
            </div>
          </div>
        </div>

        {/* Search Bar Strip */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter stickers on this rack by POS #, Barcode, Serial, Glass Spec, Client..."
              className="pl-9 pr-8 h-9 text-xs bg-white border-slate-200 rounded-xl"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="text-xs text-slate-500 font-bold shrink-0">
            Showing {filteredRows.length} of {totalUnits} units
          </div>
        </div>

        {/* Manifest Table & Sticker Details */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredRows.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Boxes className="w-12 h-12 mx-auto text-slate-300 mb-2 opacity-50" />
              <p className="text-sm font-bold text-slate-600">No units found on {rackLetter}</p>
              <p className="text-xs text-slate-400 mt-1">
                {searchTerm
                  ? "No stickers match the search query."
                  : `Scan or assign pending units onto ${rackLetter} to populate this manifest.`}
              </p>
            </div>
          ) : (
            filteredRows.map((row, idx) => {
              const outerBarcode = row.primaryItem.barcode || row.primaryItem.serialNumber || "—";
              const innerBarcode = row.partnerItem?.barcode || row.partnerItem?.serialNumber || null;

              return (
                <div
                  key={row.id || idx}
                  className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs hover:border-slate-300 transition-all space-y-2.5"
                >
                  {/* Row Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="w-6 h-6 rounded-md bg-slate-100 text-slate-700 text-xs font-bold font-mono flex items-center justify-center">
                        #{idx + 1}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-black font-mono">
                        POS #{row.posNo || "1"}
                      </span>
                      {(row.piNumber || (row as any).piNo) && (
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold font-mono">
                          PI: {row.piNumber || (row as any).piNo}
                        </span>
                      )}
                      {row.batchNo && (
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold font-mono">
                          Batch: {row.batchNo}
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200 text-[11px] font-bold">
                        {row.glassCategory || (type === "IGU" ? "DGU Unit" : "Laminated Pane")}
                      </span>
                    </div>

                    {/* Status & Sticker Action Button */}
                    <div className="flex items-center gap-2">
                      {row.sentToFinished ? (
                        <span className="text-emerald-700 font-bold text-xs inline-flex items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Sent to Finished</span>
                        </span>
                      ) : onSendUnitsToFinished ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={loading}
                          onClick={() => onSendUnitsToFinished([row])}
                          className="h-7 px-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-2xs gap-1 cursor-pointer"
                        >
                          <Send className="w-3 h-3" />
                          <span>Send to Finished</span>
                        </Button>
                      ) : null}

                      {/* View / Print Piece Sticker Button */}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onOpenSticker(row.primaryItem)}
                        className="h-7 px-2.5 text-xs font-bold border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg shadow-2xs gap-1 cursor-pointer"
                        title="View / Print exact physical glass sticker"
                      >
                        <Tag className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Print Sticker</span>
                      </Button>
                    </div>
                  </div>

                  {/* Customer / Project / Spec */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    <div>
                      {row.customerName && (
                        <div className="font-bold text-slate-800 flex items-center gap-1 truncate">
                          <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span>{row.customerName}</span>
                          {row.projectName && (
                            <span className="text-slate-500 font-medium">({row.projectName})</span>
                          )}
                        </div>
                      )}
                      <div className="text-slate-600 text-[11px] font-medium mt-0.5 line-clamp-2">
                        {(row.primaryItem as any)?.glassSpec || (row.primaryItem as any)?.description || row.primaryItem?.glassType || "Clear Glass"}
                      </div>
                    </div>

                    <div className="flex items-center justify-start md:justify-end gap-3 text-xs font-mono font-bold text-slate-700">
                      <div>
                        Size:{" "}
                        <span className="text-slate-900">
                          {row.width} × {row.height} mm
                        </span>
                      </div>
                      <div className="text-teal-700">Area: {row.sqm.toFixed(2)} m²</div>
                    </div>
                  </div>

                  {/* Physical Sticker Barcodes Section (Where The Sticker Is Located) */}
                  <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <Barcode className="w-3.5 h-3.5 text-teal-600" />
                        <span className="text-[11px] font-bold text-slate-500 uppercase">
                          Outer Panel Barcode:
                        </span>
                        <code className="bg-white px-1.5 py-0.5 rounded border border-slate-300 font-mono font-bold text-slate-800 text-[11px]">
                          {outerBarcode}
                        </code>
                      </div>

                      {innerBarcode && (
                        <div className="flex items-center gap-1.5">
                          <Barcode className="w-3.5 h-3.5 text-indigo-600" />
                          <span className="text-[11px] font-bold text-slate-500 uppercase">
                            Inner Panel Barcode:
                          </span>
                          <code className="bg-white px-1.5 py-0.5 rounded border border-slate-300 font-mono font-bold text-slate-800 text-[11px]">
                            {innerBarcode}
                          </code>
                        </div>
                      )}
                    </div>

                    <div className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                      <span>Physical Location:</span>
                      <span className="text-teal-700 font-black">
                        {rackLetter} {row.rackSlot ? `- Slot #${row.rackSlot}` : ""}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="text-xs text-slate-500 font-medium">
            Scan physical barcode <strong className="font-mono text-slate-700">{rackBarcode}</strong>{" "}
            anytime to reopen this manifest.
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs font-bold border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
