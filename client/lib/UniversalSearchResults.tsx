import React from "react";
import { PIMaster, GlassItem } from "@shared/api";
import { FileText, Box, Layers, Grid, ChevronRight, CheckCircle, Flame, ClipboardList, Search } from "lucide-react";
import { getDguEffectiveQtyAndSqm, getDisplayStage } from "@/lib/utils";

interface UniversalSearchResultsProps {
  searchTerm: string;
  pis: PIMaster[];
  items: GlassItem[];
  onSelectPI: (pi: PIMaster) => void;
  onSelectItem: (item: GlassItem) => void;
  onSelectModule: (tabId: string) => void;
  onClose: () => void;
}

export const UniversalSearchResults: React.FC<UniversalSearchResultsProps> = ({
  searchTerm,
  pis,
  items,
  onSelectPI,
  onSelectItem,
  onSelectModule,
  onClose,
}) => {
  const query = searchTerm.toLowerCase().trim();
  if (!query) return null;

  // 1. Filter PIs
  const matchedPIs = pis.filter(
    (p) =>
      p.piNumber.toLowerCase().includes(query) ||
      p.customerName.toLowerCase().includes(query) ||
      p.projectName.toLowerCase().includes(query) ||
      (p.jobOrderNumber && p.jobOrderNumber.toLowerCase().includes(query)) ||
      (p.obNo && p.obNo.toLowerCase().includes(query))
  ).slice(0, 5);

  // 2. Filter Glass Items
  const matchedItems = items.filter(
    (i) =>
      i.serialNumber.toLowerCase().includes(query) ||
      i.barcode.toLowerCase().includes(query) ||
      i.qrId.toLowerCase().includes(query) ||
      i.itemCode.toLowerCase().includes(query) ||
      i.glassType.toLowerCase().includes(query) ||
      (i.orderNo && i.orderNo.toLowerCase().includes(query)) ||
      (i.batchNo && i.batchNo.toLowerCase().includes(query)) ||
      (i.sfoNo && i.sfoNo.toLowerCase().includes(query))
  ).slice(0, 6);

  // 3. Filter Modules & Workstations
  const allModules = [
    { id: "overview", name: "Dashboard Overview", icon: Layers, tag: "Navigation" },
    { id: "pis", name: "PI Status", icon: FileText, tag: "Management" },
    { id: "production-overview", name: "Production Overview Pipeline", icon: Layers, tag: "Overview" },
    { id: "cutting", name: "Cutting Workstation Queue", icon: Box, tag: "Workstation" },
    { id: "dgu", name: "DGU / IGU Workstation Queue", icon: ClipboardList, tag: "Workstation" },
    { id: "lamination", name: "Lamination Workstation Queue", icon: Layers, tag: "Workstation" },
    { id: "finished", name: "Dispatch", icon: CheckCircle, tag: "Warehouse" },
    { id: "reports", name: "Reports & Audit Logs", icon: ClipboardList, tag: "Reports" },
    { id: "analytics", name: "Performance Analytics Dashboard", icon: Grid, tag: "Analytics" },
  ];

  const matchedModules = allModules.filter((m) =>
    m.name.toLowerCase().includes(query) || m.tag.toLowerCase().includes(query)
  ).slice(0, 4);

  const totalMatches = matchedPIs.length + matchedItems.length + matchedModules.length;
  if (totalMatches === 0) return null;

  return (
    <div className="absolute left-0 top-full mt-1.5 w-[460px] max-w-[90vw] bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
      {/* Header Summary */}
      <div className="bg-slate-50 border-b border-slate-200/80 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <Search className="w-3.5 h-3.5 text-purple-600" />
          <span>Universal Search Results</span>
          <span className="bg-purple-100 text-purple-700 text-[10px] px-2 py-0.5 rounded-full font-extrabold">
            {totalMatches} match{totalMatches !== 1 ? "es" : ""}
          </span>
        </div>
        <span className="text-[10px] text-slate-400 font-mono">Press Esc to close</span>
      </div>

      <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
        {/* PI Matches */}
        {matchedPIs.length > 0 && (
          <div className="p-2.5">
            <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider px-2 mb-1.5 flex items-center gap-1.5">
              <FileText className="w-3 h-3 text-purple-600" /> Proforma Invoices ({matchedPIs.length})
            </div>
            <div className="space-y-1">
              {matchedPIs.map((pi) => (
                <button
                  key={pi.id}
                  onClick={() => {
                    onSelectPI(pi);
                    onClose();
                  }}
                  className="w-full text-left p-2 rounded-xl hover:bg-purple-50/70 transition-colors flex items-center justify-between group cursor-pointer"
                >
                  <div>
                    <div className="text-xs font-bold text-purple-700 group-hover:underline flex items-center gap-2">
                      {pi.piNumber}
                      <span className="text-[10px] font-semibold text-slate-500 font-sans">
                        • {pi.customerName}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      Project: <span className="font-semibold text-slate-700">{pi.projectName}</span> | {pi.itemsCount} items ({pi.totalSqm?.toFixed(1)} m²)
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-purple-600 group-hover:translate-x-0.5 transition-transform" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Glass Item & Barcode Matches */}
        {matchedItems.length > 0 && (
          <div className="p-2.5">
            <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider px-2 mb-1.5 flex items-center gap-1.5">
              <Box className="w-3 h-3 text-blue-600" /> Glass Items & Barcodes ({matchedItems.length})
            </div>
            <div className="space-y-1">
              {matchedItems.map((item) => {
                const eff = getDguEffectiveQtyAndSqm(item);
                const displayStage = getDisplayStage(item);
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onSelectItem(item);
                      onClose();
                    }}
                    className="w-full text-left p-2 rounded-xl hover:bg-blue-50/70 transition-colors flex items-center justify-between group cursor-pointer"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                        <span className="text-purple-700 font-mono">{item.serialNumber}</span>
                        <span className="text-[10px] font-mono bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded border border-slate-200">
                          {item.barcode}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[340px]">
                        {item.glassType} ({item.width}×{item.height}mm) | Qty: {eff.qty} {eff.unitLabel} ({eff.sqm.toFixed(1)} m²) | Stage: <span className="font-bold text-slate-700">{displayStage}</span>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 shrink-0">
                      {displayStage}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Module Matches */}
        {matchedModules.length > 0 && (
          <div className="p-2.5">
            <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider px-2 mb-1.5 flex items-center gap-1.5">
              <Grid className="w-3 h-3 text-indigo-600" /> System Views & Workstations ({matchedModules.length})
            </div>
            <div className="space-y-1">
              {matchedModules.map((mod) => {
                const ModIcon = mod.icon;
                return (
                  <button
                    key={mod.id}
                    onClick={() => {
                      onSelectModule(mod.id);
                      onClose();
                    }}
                    className="w-full text-left p-2 rounded-xl hover:bg-indigo-50/70 transition-colors flex items-center justify-between group cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <ModIcon className="w-4 h-4 text-indigo-600" />
                      <span className="text-xs font-bold text-slate-800">{mod.name}</span>
                    </div>
                    <span className="text-[9px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
                      {mod.tag}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
