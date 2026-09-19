import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Boxes,
  Factory,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  Layers,
  ShieldCheck,
  Activity,
  Zap,
  Gauge,
  Box,
  ClipboardList,
  Search,
  ArrowRight,
  ArrowUpRight,
  FileText,
  Scissors,
  CheckCircle,
  Truck,
  Eye,
  Filter,
  Flame,
  Sparkles,
  TrendingUp,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlassItem, PIMaster, DashboardStats, ProductionStage } from "@shared/api";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatBatchNumber, formatPlatformDate, formatPlatformTime, getItemFinish, isDguGlass, isLaminatedGlass, isDlguGlass } from "@/lib/utils";

interface ProductionOverviewViewProps {
  items: GlassItem[];
  pis: PIMaster[];
  stats: DashboardStats | null;
  onNavigateTab: (tabId: string) => void;
  onOpenPIDetails: (pi: PIMaster) => void;
}

export const ProductionOverviewView: React.FC<ProductionOverviewViewProps> = ({
  items,
  pis,
  stats,
  onNavigateTab,
  onOpenPIDetails,
}) => {
  const [stageFilter, setStageFilter] = useState<"ALL" | "Cutting" | "Pairing" | "DGU" | "Lamination" | "Finished">("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [stationMenuOpen, setStationMenuOpen] = useState(false);
  const stationMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (stationMenuRef.current && !stationMenuRef.current.contains(event.target as Node)) {
        setStationMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Helper: check colour vs clear finish
  const isColour = (item: GlassItem) =>
    item.colorOrClear === "Colour" ||
    (item.colorOrClear as any) === "Color" ||
    String(item.category || "").toLowerCase().includes("colour") ||
    String(item.glassType || "").toLowerCase().includes("stopray") ||
    String(item.glassType || "").toLowerCase().includes("tinted") ||
    getItemFinish(item) === "Colour";

  // Comprehensive Production Metrics Calculation
  const metrics = useMemo(() => {
    const totalItems = items.length;
    const totalSqm = parseFloat(items.reduce((acc, curr) => acc + (curr.sqm || 0), 0).toFixed(2));

    // Stage counts (Individual Glass Panes)
    const cuttingItemsList = items.filter((i) => i.currentStage === "Cutting" || (!i.currentStage && i.status !== "Rejected"));
    const pairingItemsList = items.filter((i) => i.currentStage === "Pairing");
    const dguItemsList = items.filter((i) => i.currentStage === "DGU");
    const laminationItemsList = items.filter((i) => i.currentStage === "Lamination");
    const finishedItemsList = items.filter((i) => i.currentStage === "Finished" || i.status === "Completed");
    const rejectedItemsList = items.filter((i) => i.status === "Rejected");
    const reworkItemsList = items.filter((i) => i.status === "Reworking" || ((i as any).reworkCount && (i as any).reworkCount > 0));

    const cuttingCount = cuttingItemsList.length;
    const pairingCount = pairingItemsList.length;
    const dguCount = dguItemsList.length;
    const laminationCount = laminationItemsList.length;
    const finishedCount = finishedItemsList.length;
    const rejectedCount = rejectedItemsList.length;
    const reworkCount = reworkItemsList.length;

    // SQMs
    const cuttingSqm = parseFloat(cuttingItemsList.reduce((acc, curr) => acc + (curr.sqm || 0), 0).toFixed(2));
    const pairingSqm = parseFloat(pairingItemsList.reduce((acc, curr) => acc + (curr.sqm || 0), 0).toFixed(2));
    const dguSqm = parseFloat(dguItemsList.reduce((acc, curr) => acc + (curr.sqm || 0), 0).toFixed(2));
    const laminationSqm = parseFloat(laminationItemsList.reduce((acc, curr) => acc + (curr.sqm || 0), 0).toFixed(2));
    const finishedSqm = parseFloat(finishedItemsList.reduce((acc, curr) => acc + (curr.sqm || 0), 0).toFixed(2));

    // In Progress Quantity (Active panes in Cutting, Pairing, DGU, Lamination)
    const inProgressCount = cuttingCount + pairingCount + dguCount + laminationCount;
    const inProgressSqm = parseFloat((cuttingSqm + pairingSqm + dguSqm + laminationSqm).toFixed(2));

    // Pending Cutting / Unprocessed Panes
    const pendingCuttingCount = cuttingItemsList.filter((i) => !i.completedStages || i.completedStages.length === 0).length;

    // Distinct raw sheets in Cutting
    const distinctCuttingSheets = new Set(
      cuttingItemsList.map((i) => `${(i as any).rawSheetW || i.width}x${(i as any).rawSheetH || i.height}-${i.thickness || ""}-${i.glassType || "RAW"}`)
    ).size;

    const cuttingColour = cuttingItemsList.filter(isColour).length;
    const cuttingClear = cuttingCount - cuttingColour;

    // Pairing stage details
    const pairingColour = pairingItemsList.filter(isColour).length;
    const pairingClear = pairingCount - pairingColour;
    const pairingPairs = Math.min(pairingColour, pairingClear);

    // DGU / IGU Specialty Breakdown
    const allDguItems = items.filter((i) => isDguGlass(i) && !isDlguGlass(i));
    const dguColourPanes = allDguItems.filter(isColour).length;
    const dguClearPanes = allDguItems.length - dguColourPanes;
    const dguTotalUnits = dguColourPanes > 0 ? dguColourPanes : Math.ceil(allDguItems.length / 2);
    const dguFinishedUnits = finishedItemsList.filter((i) => isDguGlass(i) && !isDlguGlass(i)).filter(isColour).length ||
      Math.ceil(finishedItemsList.filter((i) => isDguGlass(i) && !isDlguGlass(i)).length / 2);
    const dguActiveUnits = Math.max(0, dguTotalUnits - dguFinishedUnits);
    const dguTotalSqm = parseFloat(allDguItems.filter(isColour).reduce((acc, curr) => acc + (curr.sqm || 0), 0).toFixed(2)) ||
      parseFloat((allDguItems.reduce((acc, curr) => acc + (curr.sqm || 0), 0) / 2).toFixed(2));

    // DLGU (Double Laminated Glazed Units) Specialty Breakdown
    const allDlguItems = items.filter(isDlguGlass);
    const dlguTotalUnits = Math.ceil(allDlguItems.length / 3) || Math.ceil(allDlguItems.length / 2);
    const dlguFinishedUnits = Math.ceil(finishedItemsList.filter(isDlguGlass).length / 3) || Math.ceil(finishedItemsList.filter(isDlguGlass).length / 2);
    const dlguActiveUnits = Math.max(0, dlguTotalUnits - dlguFinishedUnits);
    const dlguTotalSqm = parseFloat(allDlguItems.reduce((acc, curr) => acc + (curr.sqm || 0), 0).toFixed(2));

    // Laminated Specialty Breakdown
    const allLamItems = items.filter((i) => isLaminatedGlass(i) && !isDguGlass(i) && !isDlguGlass(i));
    const lamTotalUnits = Math.ceil(allLamItems.length / 2);
    const lamFinishedUnits = Math.ceil(finishedItemsList.filter((i) => isLaminatedGlass(i) && !isDguGlass(i) && !isDlguGlass(i)).length / 2);
    const lamActiveUnits = Math.max(0, lamTotalUnits - lamFinishedUnits);
    const lamTotalSqm = parseFloat(allLamItems.reduce((acc, curr) => acc + (curr.sqm || 0), 0).toFixed(2));

    // Monolithic / Single Tempered
    const allMonolithicItems = items.filter((i) => !isDguGlass(i) && !isDlguGlass(i) && !isLaminatedGlass(i));
    const monoTotalUnits = allMonolithicItems.length;
    const monoFinishedUnits = finishedItemsList.filter((i) => !isDguGlass(i) && !isDlguGlass(i) && !isLaminatedGlass(i)).length;
    const monoActiveUnits = Math.max(0, monoTotalUnits - monoFinishedUnits);
    const monoTotalSqm = parseFloat(allMonolithicItems.reduce((acc, curr) => acc + (curr.sqm || 0), 0).toFixed(2));

    // Overall Progress & Quality Yield
    const completionPercent = totalItems > 0 ? Math.round((finishedCount / totalItems) * 100) : 0;
    const inProgressPercent = totalItems > 0 ? Math.round((inProgressCount / totalItems) * 100) : 0;
    const pendingPercent = totalItems > 0 ? Math.round((pendingCuttingCount / totalItems) * 100) : 0;
    const rejectedPercent = totalItems > 0 ? parseFloat(((rejectedCount / totalItems) * 100).toFixed(1)) : 0;
    const reworkPercent = totalItems > 0 ? parseFloat(((reworkCount / totalItems) * 100).toFixed(1)) : 0;

    const yieldRate = totalItems > 0 ? (((totalItems - rejectedCount) / totalItems) * 100).toFixed(1) : "100.0";
    const onTimeDeliveryRate = "99.2";

    return {
      totalItems,
      totalSqm,
      inProgressCount,
      inProgressSqm,
      finishedCount,
      finishedSqm,
      pendingCuttingCount,
      rejectedCount,
      reworkCount,
      // Stage Breakdown
      cuttingCount,
      cuttingSqm,
      cuttingColour,
      cuttingClear,
      distinctCuttingSheets,
      pairingCount,
      pairingSqm,
      pairingColour,
      pairingClear,
      pairingPairs,
      dguCount,
      dguSqm,
      laminationCount,
      laminationSqm,
      // Specialty Breakdown
      dguTotalUnits,
      dguActiveUnits,
      dguFinishedUnits,
      dguColourPanes,
      dguClearPanes,
      dguTotalSqm,
      dlguTotalUnits,
      dlguActiveUnits,
      dlguFinishedUnits,
      dlguTotalSqm,
      lamTotalUnits,
      lamActiveUnits,
      lamFinishedUnits,
      lamTotalSqm,
      monoTotalUnits,
      monoActiveUnits,
      monoFinishedUnits,
      monoTotalSqm,
      // Percentages & Rates
      completionPercent,
      inProgressPercent,
      pendingPercent,
      rejectedPercent,
      reworkPercent,
      yieldRate,
      onTimeDeliveryRate,
    };
  }, [items]);

  // Aggregate Batch-level Data
  const batchRows = useMemo(() => {
    const map = new Map<string, {
      id: string;
      piNumber: string;
      customerName: string;
      projectName: string;
      jobOrderNumber: string;
      sfoNo: string;
      items: GlassItem[];
      cuttingCount: number;
      pairingCount: number;
      dguCount: number;
      laminationCount: number;
      finishedCount: number;
      rejectedCount: number;
      reworkCount: number;
      totalSqm: number;
      finish: "Clear" | "Colour";
      glassTypes: Set<string>;
      primaryStage: "Cutting" | "Pairing" | "DGU" | "Lamination" | "Finished";
      progress: number;
      createdAt: string | Date;
    }>();

    items.forEach((item) => {
      const key = item.piId || item.piNumber || item.batchNo || "default";
      const parentPI = pis.find((p) => p.id === item.piId || p.piNumber === item.piNumber);
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          piNumber: (item.piNumber || parentPI?.piNumber || `BATCH-${item.batchNo || "1"}`).replace(/^STK-/i, ""),
          customerName: parentPI?.customerName || (item as any).customerName || (item as any).clientName || "Customer",
          projectName: parentPI?.projectName || (item as any).projectName || item.sectionName || "Project",
          jobOrderNumber: parentPI?.jobOrderNumber || item.orderNo || item.sfoNo || "",
          sfoNo: item.sfoNo || parentPI?.sfoNo || "",
          items: [],
          cuttingCount: 0,
          pairingCount: 0,
          dguCount: 0,
          laminationCount: 0,
          finishedCount: 0,
          rejectedCount: 0,
          reworkCount: 0,
          totalSqm: 0,
          finish: "Clear",
          glassTypes: new Set<string>(),
          primaryStage: "Cutting",
          progress: 0,
          createdAt: parentPI?.createdAt || item.updatedAt || new Date().toISOString(),
        });
      }
      const b = map.get(key)!;
      b.items.push(item);
      b.totalSqm += (item.sqm || 0);
      if (item.glassType) b.glassTypes.add(item.glassType);

      const st = item.currentStage?.toLowerCase();
      const itemPieces = item.qty || 1;
      if (item.status === "Rejected") b.rejectedCount += itemPieces;
      if (item.status === "Reworking" || ((item as any).reworkCount && (item as any).reworkCount > 0)) b.reworkCount += itemPieces;

      if (st === "cutting" || (!item.currentStage && item.status !== "Rejected")) b.cuttingCount += itemPieces;
      else if (st === "pairing") b.pairingCount += itemPieces;
      else if (st === "dgu") b.dguCount += itemPieces;
      else if (st === "lamination") b.laminationCount += itemPieces;
      else if (st === "finished" || item.status === "Completed") b.finishedCount += itemPieces;
    });

    // Also include any PIs without direct items
    pis.forEach((p) => {
      if (!map.has(p.id) && !map.has(p.piNumber)) {
        map.set(p.id, {
          id: p.id,
          piNumber: (p.piNumber || "").replace(/^STK-/i, ""),
          customerName: p.customerName || "Customer",
          projectName: p.projectName || "Project",
          jobOrderNumber: p.jobOrderNumber || p.sfoNo || "",
          sfoNo: p.sfoNo || "",
          items: [],
          cuttingCount: p.totalQty || p.itemsCount || 0,
          pairingCount: 0,
          dguCount: 0,
          laminationCount: 0,
          finishedCount: p.completedItemsCount || 0,
          rejectedCount: 0,
          reworkCount: 0,
          totalSqm: p.totalSqm || 0,
          finish: p.colorOrClear === "Colour" ? "Colour" : "Clear",
          glassTypes: new Set<string>(),
          primaryStage: "Cutting",
          progress: (p.totalQty || p.itemsCount) ? Math.round(((p.completedItemsCount || 0) / (p.totalQty || p.itemsCount)) * 100) : 0,
          createdAt: p.createdAt || new Date(),
        });
      }
    });

    return Array.from(map.values()).map((b) => {
      const parentPI = pis.find((p) => p.id === b.id || p.piNumber === b.piNumber);
      const clearCount = b.items.filter((i) => getItemFinish(i) === "Clear").reduce((acc, curr) => acc + (curr.qty || 1), 0);
      const colourCount = b.items.filter((i) => getItemFinish(i) === "Colour").reduce((acc, curr) => acc + (curr.qty || 1), 0);

      const isColourBatch =
        parentPI?.colorOrClear === "Colour" ||
        (parentPI as any)?.category?.toLowerCase().includes("colour") ||
        colourCount > 0 ||
        b.items.some((i) => i.colorOrClear === "Colour" || getItemFinish(i) === "Colour");

      const finish: "Clear" | "Colour" = isColourBatch ? "Colour" : "Clear";

      let primaryStage: "Cutting" | "Pairing" | "DGU" | "Lamination" | "Finished" = "Cutting";
      if (b.cuttingCount > 0) primaryStage = "Cutting";
      else if (b.pairingCount > 0) primaryStage = "Pairing";
      else if (b.dguCount > 0) primaryStage = "DGU";
      else if (b.laminationCount > 0) primaryStage = "Lamination";
      else if (b.finishedCount > 0) primaryStage = "Finished";

      const totalPieces = b.items.reduce((acc, curr) => acc + (curr.qty || 1), 0) || parentPI?.totalQty || parentPI?.itemsCount || 1;
      const progress = Math.min(100, Math.round((b.finishedCount / totalPieces) * 100));

      const isDlgu = b.items.some(isDlguGlass) || (parentPI as any)?.glassCategory === "DLGU";
      const isLam = !isDlgu && (b.items.some((i) => isLaminatedGlass(i) && !isDguGlass(i)) || (parentPI as any)?.glassCategory === "Lamination");
      const isDgu = !isDlgu && !isLam && (b.items.some(isDguGlass) || (parentPI as any)?.glassCategory === "DGU");
      const productCategory: "DLGU" | "DGU" | "Lamination" | "Monolithic" = isDlgu ? "DLGU" : isLam ? "Lamination" : isDgu ? "DGU" : "Monolithic";
      const mainGlassType = Array.from(b.glassTypes)[0] || b.items[0]?.glassType || (parentPI as any)?.glassType || "";

      return {
        ...b,
        finish,
        primaryStage,
        progress,
        totalPieces,
        productCategory,
        mainGlassType,
      };
    });
  }, [items, pis]);

  // Filtered Batches for Table
  const filteredBatches = useMemo(() => {
    return batchRows.filter((b) => {
      if (stageFilter !== "ALL" && b.primaryStage !== stageFilter) {
        if (stageFilter === "Cutting" && b.cuttingCount === 0) return false;
        if (stageFilter === "Pairing" && b.pairingCount === 0) return false;
        if (stageFilter === "DGU" && b.dguCount === 0) return false;
        if (stageFilter === "Lamination" && b.laminationCount === 0) return false;
        if (stageFilter === "Finished" && b.finishedCount === 0) return false;
      }

      const q = searchTerm.toLowerCase().trim();
      if (!q) return true;
      return (
        b.piNumber.toLowerCase().includes(q) ||
        b.customerName.toLowerCase().includes(q) ||
        b.projectName.toLowerCase().includes(q) ||
        b.jobOrderNumber.toLowerCase().includes(q) ||
        b.sfoNo.toLowerCase().includes(q)
      );
    });
  }, [batchRows, stageFilter, searchTerm]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Production Pipeline Overview</h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-200">
              Dubai Plant Facility
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Real-time plant load, workstation throughput, specialty glass assembly tracking, and stage-wise allocation.
          </p>
        </div>

        <div className="flex items-center gap-2 relative">
          <Button
            size="sm"
            onClick={() => onNavigateTab("cutting")}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs gap-1.5 h-8 px-3 rounded-xl shadow-xs"
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Open Cutting Floor</span>
          </Button>

          {/* Workstations Dropdown: DGU, DLGU, Lamination, Cutting, Dispatch */}
          <div className="relative" ref={stationMenuRef}>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStationMenuOpen((prev) => !prev)}
              className="border-slate-300 text-slate-800 bg-white hover:bg-slate-50 font-bold text-xs gap-1.5 h-8 px-3 rounded-xl shadow-xs"
            >
              <Factory className="w-3.5 h-3.5 text-indigo-600" />
              <span>Workstations & Lines</span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ${stationMenuOpen ? "rotate-180" : ""}`} />
            </Button>

            {stationMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-2.5 py-1 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  Select Workstation Line
                </div>

                {/* DGU Station */}
                <button
                  onClick={() => {
                    onNavigateTab("dgu");
                    setStationMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-xl text-left hover:bg-teal-50 text-slate-800 hover:text-teal-900 transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center font-bold">
                      <ClipboardList className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold leading-none">DGU / IGU Station</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Double Glazed Line</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-teal-100 text-teal-800 border border-teal-200">
                    {metrics.dguTotalUnits} Units
                  </span>
                </button>

                {/* DLGU / Pairing Buffer */}
                <button
                  onClick={() => {
                    onNavigateTab("pairing");
                    setStationMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-xl text-left hover:bg-purple-50 text-slate-800 hover:text-purple-900 transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold leading-none">DLGU & Pairing Buffer</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Multi-Layer Assembly</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-800 border border-purple-200">
                    {metrics.dlguTotalUnits} Units
                  </span>
                </button>

                {/* Lamination Line */}
                <button
                  onClick={() => {
                    onNavigateTab("lamination");
                    setStationMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-xl text-left hover:bg-amber-50 text-slate-800 hover:text-amber-900 transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                      <Flame className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold leading-none">Lamination Line</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Autoclave & PVB Line</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-200">
                    {metrics.lamTotalUnits} Pairs
                  </span>
                </button>

                {/* Cutting Floor */}
                <button
                  onClick={() => {
                    onNavigateTab("cutting");
                    setStationMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-xl text-left hover:bg-indigo-50 text-slate-800 hover:text-indigo-900 transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                      <Scissors className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold leading-none">Cutting Workstation</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">CNC & Manual Tables</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-800 border border-indigo-200">
                    {metrics.cuttingCount} Panes
                  </span>
                </button>

                {/* Dispatch & Shipping */}
                <button
                  onClick={() => {
                    onNavigateTab("finished");
                    setStationMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-xl text-left hover:bg-emerald-50 text-slate-800 hover:text-emerald-900 transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                      <Truck className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold leading-none">Dispatch & Shipping</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Completed Units</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
                    {metrics.finishedCount} Pcs
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 1: Executive 6-Card Production Summary Grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* 1. Total Production */}
        <div
          onClick={() => onNavigateTab("pis")}
          className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs hover:shadow-md hover:-translate-y-0.5 hover:border-blue-300 transition-all cursor-pointer group"
          title="Click to view all Sticker & Batch statuses"
        >
          <div className="text-slate-500 text-[10.5px] font-extrabold uppercase tracking-wider">
            Total Production
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2 tracking-tight font-mono">
            {metrics.totalItems} <span className="text-xs font-bold text-blue-700">Pcs</span>
          </div>
          <div className="text-[11px] text-blue-700 font-semibold mt-1">
            {metrics.totalSqm.toFixed(1)} m² Total
          </div>
        </div>

        {/* 2. In-Progress Quantity */}
        <div
          onClick={() => onNavigateTab("cutting")}
          className="bg-white border border-cyan-200/80 rounded-2xl p-4 shadow-2xs hover:shadow-md hover:-translate-y-0.5 hover:border-cyan-300 transition-all cursor-pointer group"
          title="Click to view active Workstation queues"
        >
          <div className="text-slate-500 text-[10.5px] font-extrabold uppercase tracking-wider">
            In-Progress WIP
          </div>
          <div className="text-2xl font-black text-cyan-900 mt-2 tracking-tight font-mono">
            {metrics.inProgressCount} <span className="text-xs font-bold text-cyan-700">Pcs</span>
          </div>
          <div className="text-[11px] text-cyan-700 font-semibold mt-1">
            {metrics.inProgressSqm.toFixed(1)} m² Active
          </div>
        </div>

        {/* 3. Completed Quantity */}
        <div
          onClick={() => onNavigateTab("finished")}
          className="bg-white border border-emerald-200/80 rounded-2xl p-4 shadow-2xs hover:shadow-md hover:-translate-y-0.5 hover:border-emerald-300 transition-all cursor-pointer group"
          title="Click to view Finished Items Warehouse"
        >
          <div className="text-slate-500 text-[10.5px] font-extrabold uppercase tracking-wider">
            Completed Units
          </div>
          <div className="text-2xl font-black text-emerald-900 mt-2 tracking-tight font-mono">
            {metrics.finishedCount} <span className="text-xs font-bold text-emerald-700">Units</span>
          </div>
          <div className="text-[11px] text-emerald-700 font-semibold mt-1">
            {metrics.completionPercent}% Inspected
          </div>
        </div>

        {/* 4. Pending Quantity */}
        <div
          onClick={() => onNavigateTab("cutting")}
          className="bg-white border border-amber-200/80 rounded-2xl p-4 shadow-2xs hover:shadow-md hover:-translate-y-0.5 hover:border-amber-300 transition-all cursor-pointer group"
          title="Click to view Pending Cutting queue"
        >
          <div className="text-slate-500 text-[10.5px] font-extrabold uppercase tracking-wider">
            Pending Cutting
          </div>
          <div className="text-2xl font-black text-amber-900 mt-2 tracking-tight font-mono">
            {metrics.pendingCuttingCount} <span className="text-xs font-bold text-amber-700">Panes</span>
          </div>
          <div className="text-[11px] text-amber-700 font-semibold mt-1">
            {metrics.distinctCuttingSheets} Raw Sheets
          </div>
        </div>

        {/* 5. Rejected Quantity */}
        <div
          onClick={() => onNavigateTab("reports")}
          className="bg-white border border-rose-200/80 rounded-2xl p-4 shadow-2xs hover:shadow-md hover:-translate-y-0.5 hover:border-rose-300 transition-all cursor-pointer group"
          title="Click to view Quality Rejects & Defect Log"
        >
          <div className="text-slate-500 text-[10.5px] font-extrabold uppercase tracking-wider">
            Rejected Items
          </div>
          <div className="text-2xl font-black text-rose-900 mt-2 tracking-tight font-mono">
            {metrics.rejectedCount} <span className="text-xs font-bold text-rose-700">Panes</span>
          </div>
          <div className="text-[11px] text-rose-600 font-semibold mt-1">
            {metrics.yieldRate}% Pass Rate
          </div>
        </div>

        {/* 6. Rework Quantity */}
        <div
          onClick={() => onNavigateTab("reports")}
          className="bg-white border border-orange-200/80 rounded-2xl p-4 shadow-2xs hover:shadow-md hover:-translate-y-0.5 hover:border-orange-300 transition-all cursor-pointer group"
          title="Click to view Rework Tracking"
        >
          <div className="text-slate-500 text-[10.5px] font-extrabold uppercase tracking-wider">
            Rework Items
          </div>
          <div className="text-2xl font-black text-orange-900 mt-2 tracking-tight font-mono">
            {metrics.reworkCount} <span className="text-xs font-bold text-orange-700">Items</span>
          </div>
          <div className="text-[11px] text-orange-700 font-semibold mt-1">
            Re-routed Flow
          </div>
        </div>
      </div>

      {/* ── Section 2: Specialty Glass Types & Assembly Status (DGU / IGU / DLGU / Laminated / Monolithic) ── */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
          <div className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            SPECIALTY GLASS TYPES & ASSEMBLY STATUS (DGU / IGU / DLGU / LAMINATED)
          </div>
          <span className="text-[11px] font-mono text-slate-500">
            Automated 1+1 Pane Pairing & Interlayer Processing
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* 1. DGU / IGU Double Glazing Units */}
          <div className="bg-gradient-to-br from-teal-50/70 via-white to-teal-50/20 border-2 border-teal-200/90 rounded-2xl p-4 shadow-2xs relative group hover:shadow-md transition-all">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-teal-100 text-teal-900 border border-teal-300">
                DGU / IGU Assembly
              </span>
              <ClipboardList className="w-4 h-4 text-teal-600" />
            </div>

            <div className="mt-2.5">
              <div className="text-xl font-black text-slate-900">
                {metrics.dguTotalUnits} <span className="text-xs font-bold text-teal-700">DGU Units</span>
              </div>
              <div className="text-[11px] text-slate-500 font-medium">
                {metrics.dguTotalSqm} m² Total Assembly Area
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-teal-100 space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span>Outer Coloured Panes:</span>
                <strong className="text-purple-700 font-bold">{metrics.dguColourPanes} pcs</strong>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Inner Clear Panes:</span>
                <strong className="text-cyan-700 font-bold">{metrics.dguClearPanes} pcs</strong>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Ready / Dispatched:</span>
                <strong className="text-emerald-700 font-bold">{metrics.dguFinishedUnits} Units</strong>
              </div>
            </div>

            <Button
              size="sm"
              onClick={() => onNavigateTab("dgu")}
              className="mt-3.5 w-full h-7 text-xs font-black bg-teal-600 hover:bg-teal-700 text-white rounded-xl shadow-2xs"
            >
              <span>Manage DGU Station</span>
              <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </div>

          {/* 2. DLGU (Double Laminated Glazed Units) */}
          <div className="bg-gradient-to-br from-indigo-50/70 via-white to-indigo-50/20 border-2 border-indigo-200/90 rounded-2xl p-4 shadow-2xs relative group hover:shadow-md transition-all">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-indigo-100 text-indigo-900 border border-indigo-300">
                DLGU Multi-Layer
              </span>
              <Layers className="w-4 h-4 text-indigo-600" />
            </div>

            <div className="mt-2.5">
              <div className="text-xl font-black text-slate-900">
                {metrics.dlguTotalUnits} <span className="text-xs font-bold text-indigo-700">DLGU Units</span>
              </div>
              <div className="text-[11px] text-slate-500 font-medium">
                {metrics.dlguTotalSqm} m² Acoustic / Security
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-indigo-100 space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span>Phase 1 (Lamination):</span>
                <strong className="text-amber-700 font-bold">{metrics.dlguActiveUnits > 0 ? "In Process" : "Done"}</strong>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Phase 2 (DGU Chamber):</span>
                <strong className="text-teal-700 font-bold">Argon Dual-Seal</strong>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Finished DLGU:</span>
                <strong className="text-emerald-700 font-bold">{metrics.dlguFinishedUnits} Units</strong>
              </div>
            </div>

            <Button
              size="sm"
              onClick={() => onNavigateTab("pairing")}
              className="mt-3.5 w-full h-7 text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-2xs"
            >
              <span>View Pairing Buffer</span>
              <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </div>

          {/* 3. Laminated Glass (PVB Interlayer) */}
          <div className="bg-gradient-to-br from-amber-50/70 via-white to-amber-50/20 border-2 border-amber-200/90 rounded-2xl p-4 shadow-2xs relative group hover:shadow-md transition-all">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-900 border border-amber-300">
                Lamination Autoclave
              </span>
              <Flame className="w-4 h-4 text-amber-600" />
            </div>

            <div className="mt-2.5">
              <div className="text-xl font-black text-slate-900">
                {metrics.lamTotalUnits} <span className="text-xs font-bold text-amber-700">Laminated Pairs</span>
              </div>
              <div className="text-[11px] text-slate-500 font-medium">
                {metrics.lamTotalSqm} m² PVB Interlayer
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-amber-100 space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span>Autoclave Heating:</span>
                <strong className="text-amber-800 font-bold">140°C Vacuum</strong>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Active in Line:</span>
                <strong className="text-slate-800 font-bold">{metrics.lamActiveUnits} Pairs</strong>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Dispatched Laminated:</span>
                <strong className="text-emerald-700 font-bold">{metrics.lamFinishedUnits} Units</strong>
              </div>
            </div>

            <Button
              size="sm"
              onClick={() => onNavigateTab("lamination")}
              className="mt-3.5 w-full h-7 text-xs font-black bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-2xs"
            >
              <span>Manage Lamination</span>
              <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Section 3: Stage-Wise Production Flow & Workstation Status Cards ── */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
          <div className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-600" />
            STAGE-WISE STATUS & MATERIAL WORKFLOW
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-50 text-purple-700 border border-purple-200">
            Cutting ➔ Pairing & Buffer ➔ DGU / Lamination ➔ Dispatch Ready
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Stage 1: Cutting Floor */}
          <div className="p-4 rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50/80 via-white to-purple-50/30 flex flex-col justify-between space-y-3.5 hover:shadow-lg hover:-translate-y-1 hover:border-purple-300 transition-all group">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-extrabold text-purple-900">
                <span className="uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center text-[10px] font-black">1</span>
                  Cutting Floor
                </span>
                <Scissors className="w-4 h-4 text-purple-600 group-hover:scale-110 group-hover:rotate-6 transition-transform" />
              </div>

              <div className="text-2xl font-black text-slate-900 mt-1">
                {metrics.cuttingCount} <span className="text-xs font-bold text-purple-700">Panes</span>
              </div>

              <div className="space-y-1 text-[11px] font-medium text-slate-600">
                <div className="flex items-center justify-between">
                  <span>Raw Sheets in Queue:</span>
                  <strong className="text-purple-900 font-bold">{metrics.distinctCuttingSheets} Sheets</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>Colour vs Clear:</span>
                  <strong className="text-slate-800 font-bold">{metrics.cuttingColour} Col / {metrics.cuttingClear} Clr</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>Queue Area:</span>
                  <strong className="text-slate-800 font-bold">{metrics.cuttingSqm.toFixed(1)} m²</strong>
                </div>
              </div>

              <div className="text-[10px] text-purple-700 font-extrabold bg-purple-100/70 px-2 py-1 rounded-lg flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />
                <span>Auto-Scan & Batch Advance Active</span>
              </div>
            </div>

            <Button
              size="sm"
              onClick={() => onNavigateTab("cutting")}
              className="h-8 text-xs font-black text-purple-700 border border-purple-200 bg-white hover:bg-purple-600 hover:text-white rounded-xl justify-between w-full shadow-2xs transition-all"
            >
              <span>Manage Cutting Floor</span>
              <ChevronRightIcon className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Stage 2: Pairing & Buffer Rack */}
          <div className="p-4 rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 via-white to-indigo-50/30 flex flex-col justify-between space-y-3.5 hover:shadow-lg hover:-translate-y-1 hover:border-indigo-300 transition-all group">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-extrabold text-indigo-900">
                <span className="uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black">2</span>
                  Pairing & Buffer Rack
                </span>
                <Layers className="w-4 h-4 text-indigo-600 group-hover:scale-110 group-hover:rotate-6 transition-transform" />
              </div>

              <div className="text-2xl font-black text-slate-900 mt-1">
                {metrics.pairingCount} <span className="text-xs font-bold text-indigo-700">Panes in Buffer</span>
              </div>

              <div className="space-y-1 text-[11px] font-medium text-slate-600">
                <div className="flex items-center justify-between">
                  <span>Matched 1+1 Sets:</span>
                  <strong className="text-indigo-900 font-bold">{metrics.pairingPairs} Pairs Ready</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>Colour / Clear Staged:</span>
                  <strong className="text-slate-800 font-bold">{metrics.pairingColour} / {metrics.pairingClear}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>Buffer Area:</span>
                  <strong className="text-slate-800 font-bold">{metrics.pairingSqm.toFixed(1)} m²</strong>
                </div>
              </div>

              <div className="text-[10px] text-indigo-800 font-extrabold bg-indigo-100/70 px-2 py-1 rounded-lg flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                <span>Pairing Validation Enforced</span>
              </div>
            </div>

            <Button
              size="sm"
              onClick={() => onNavigateTab("pairing")}
              className="h-8 text-xs font-black text-indigo-700 border border-indigo-200 bg-white hover:bg-indigo-600 hover:text-white rounded-xl justify-between w-full shadow-2xs transition-all"
            >
              <span>Manage Pairing Buffer</span>
              <ChevronRightIcon className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Stage 3: DGU / Lamination Station */}
          <div className="p-4 rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50/80 via-white to-teal-50/30 flex flex-col justify-between space-y-3.5 hover:shadow-lg hover:-translate-y-1 hover:border-teal-300 transition-all group">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-extrabold text-teal-900">
                <span className="uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px] font-black">3</span>
                  DGU / Lamination Lines
                </span>
                <ClipboardList className="w-4 h-4 text-teal-600 group-hover:scale-110 group-hover:rotate-6 transition-transform" />
              </div>

              <div className="text-2xl font-black text-slate-900 mt-1">
                {metrics.dguCount + metrics.laminationCount} <span className="text-xs font-bold text-teal-700">Units Active</span>
              </div>

              <div className="space-y-1 text-[11px] font-medium text-slate-600">
                <div className="flex items-center justify-between">
                  <span>DGU Assembly Line:</span>
                  <strong className="text-teal-900 font-bold">{metrics.dguCount} Units</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>Lamination Autoclave:</span>
                  <strong className="text-amber-800 font-bold">{metrics.laminationCount} Panes</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>Active Area:</span>
                  <strong className="text-slate-800 font-bold">{(metrics.dguSqm + metrics.laminationSqm).toFixed(1)} m²</strong>
                </div>
              </div>

              <div className="text-[10px] text-teal-800 font-extrabold bg-teal-100/70 px-2 py-1 rounded-lg flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-600" />
                <span>Argon Sealing & PVB Heating</span>
              </div>
            </div>

            <Button
              size="sm"
              onClick={() => onNavigateTab("dgu")}
              className="h-8 text-xs font-black text-teal-700 border border-teal-200 bg-white hover:bg-teal-600 hover:text-white rounded-xl justify-between w-full shadow-2xs transition-all"
            >
              <span>Manage Assembly Lines</span>
              <ChevronRightIcon className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Stage 4: Finished Warehouse & Dispatch */}
          <div className="p-4 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/80 via-white to-emerald-50/30 flex flex-col justify-between space-y-3.5 hover:shadow-lg hover:-translate-y-1 hover:border-emerald-300 transition-all group">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-extrabold text-emerald-900">
                <span className="uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-black">4</span>
                  Finished Warehouse
                </span>
                <Truck className="w-4 h-4 text-emerald-600 group-hover:scale-110 group-hover:rotate-6 transition-transform" />
              </div>

              <div className="text-2xl font-black text-slate-900 mt-1">
                {metrics.finishedCount} <span className="text-xs font-bold text-emerald-700">Dispatch Ready</span>
              </div>

              <div className="space-y-1 text-[11px] font-medium text-slate-600">
                <div className="flex items-center justify-between">
                  <span>DGU Ready:</span>
                  <strong className="text-teal-900 font-bold">{metrics.dguFinishedUnits} Units</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>Laminated Ready:</span>
                  <strong className="text-amber-900 font-bold">{metrics.lamFinishedUnits} Units</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>Finished Area:</span>
                  <strong className="text-emerald-900 font-bold">{metrics.finishedSqm.toFixed(1)} m²</strong>
                </div>
              </div>

              <div className="text-[10px] text-emerald-800 font-extrabold bg-emerald-100/70 px-2 py-1 rounded-lg flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                <span>100% Quality Inspected</span>
              </div>
            </div>

            <Button
              size="sm"
              onClick={() => onNavigateTab("finished")}
              className="h-8 text-xs font-black text-emerald-700 border border-emerald-200 bg-white hover:bg-emerald-600 hover:text-white rounded-xl justify-between w-full shadow-2xs transition-all"
            >
              <span>View Finished Warehouse</span>
              <ChevronRightIcon className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Section 4: Plant-Level Progress Bar & Live Batch Matrix Table ── */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-4">
        {/* Overall Facility Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-black text-slate-900 uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-purple-600" /> Overall Plant Completion Progress
            </span>
            <span className="text-purple-700 font-mono text-sm">{metrics.completionPercent}% Completed</span>
          </div>

          <div className="w-full bg-slate-100 h-3.5 rounded-full overflow-hidden flex shadow-inner">
            {metrics.completionPercent > 0 && (
              <div
                className="bg-emerald-500 h-full transition-all duration-500"
                style={{ width: `${metrics.completionPercent}%` }}
                title={`Completed: ${metrics.finishedCount} pcs (${metrics.completionPercent}%)`}
              />
            )}
            {metrics.inProgressPercent > 0 && (
              <div
                className="bg-cyan-500 h-full transition-all duration-500"
                style={{ width: `${metrics.inProgressPercent}%` }}
                title={`In Progress: ${metrics.inProgressCount} pcs (${metrics.inProgressPercent}%)`}
              />
            )}
            {metrics.pendingPercent > 0 && (
              <div
                className="bg-amber-400 h-full transition-all duration-500"
                style={{ width: `${metrics.pendingPercent}%` }}
                title={`Pending: ${metrics.pendingCuttingCount} pcs (${metrics.pendingPercent}%)`}
              />
            )}
            {metrics.rejectedPercent > 0 && (
              <div
                className="bg-rose-500 h-full transition-all duration-500"
                style={{ width: `${metrics.rejectedPercent}%` }}
                title={`Rejected: ${metrics.rejectedCount} pcs (${metrics.rejectedPercent}%)`}
              />
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 flex-wrap gap-2 pt-1">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Completed: {metrics.finishedCount} ({metrics.completionPercent}%)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-500" /> In Progress: {metrics.inProgressCount} ({metrics.inProgressPercent}%)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Pending: {metrics.pendingCuttingCount} ({metrics.pendingPercent}%)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Rejects: {metrics.rejectedCount} ({metrics.rejectedPercent}%)
            </span>
            <span className="font-mono text-purple-700">
              Total Area: {metrics.totalSqm.toFixed(1)} m²
            </span>
          </div>
        </div>

        {/* Filter & Search Toolbar */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Stage Filters */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
              {(["ALL", "Cutting", "Pairing", "DGU", "Lamination", "Finished"] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStageFilter(st)}
                  className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${
                    stageFilter === st
                      ? "bg-white text-purple-900 shadow-xs ring-1 ring-slate-200"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {st === "ALL" ? "All Stages" : st}
                </button>
              ))}
            </div>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search batch, customer, project..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-8 text-xs bg-slate-50 border-slate-200 rounded-xl"
            />
          </div>
        </div>

        {/* Batches Table */}
        {filteredBatches.length > 0 ? (
          <div className="no-scrollbar overflow-x-auto w-full border border-slate-100 rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider bg-slate-50/80">
                  <th className="py-3 px-3">BATCH NO</th>
                  <th className="py-3 px-3">FINISH & TYPE</th>
                  <th className="py-3 px-3">CUSTOMER & PROJECT</th>
                  <th className="py-3 px-3 text-center">STAGE ALLOCATION</th>
                  <th className="py-3 px-3 text-right">TOTAL SQM</th>
                  <th className="py-3 px-3 text-center">PROGRESS</th>
                  <th className="py-3 px-3 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBatches.map((b) => (
                  <tr
                    key={b.id}
                    onClick={() => {
                      const parentPI = pis.find((p) => p.id === b.id || p.piNumber === b.piNumber);
                      if (parentPI) onOpenPIDetails(parentPI);
                    }}
                    className="hover:bg-purple-50/40 transition-colors cursor-pointer group"
                    title="Click to view full batch details"
                  >
                    <td className="py-3 px-3 font-mono font-black text-purple-700 whitespace-nowrap group-hover:underline">
                      {formatBatchNumber(b.piNumber)}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* Product Category Badge: DGU / DLGU / Lamination / Monolithic */}
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-black tracking-wide border shadow-2xs ${
                              b.productCategory === "DLGU"
                                ? "bg-purple-600 text-white border-purple-700"
                                : b.productCategory === "DGU"
                                ? "bg-teal-600 text-white border-teal-700"
                                : b.productCategory === "Lamination"
                                ? "bg-amber-600 text-white border-amber-700"
                                : "bg-slate-700 text-white border-slate-800"
                            }`}
                          >
                            {b.productCategory}
                          </span>

                          {/* Finish Badge: Colour / Clear */}
                          {b.finish === "Colour" ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                              Colour
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-cyan-100 text-cyan-800 border border-cyan-200">
                              Clear
                            </span>
                          )}
                        </div>

                        {b.mainGlassType && (
                          <span
                            className="text-[10px] font-medium text-slate-500 truncate max-w-[210px] block"
                            title={b.mainGlassType}
                          >
                            {b.mainGlassType}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-800 leading-snug">{b.customerName}</div>
                      <div className="text-[11px] text-slate-500 leading-snug">
                        {b.projectName}
                        {b.jobOrderNumber && <span className="ml-1 font-mono text-slate-400">JO: {b.jobOrderNumber}</span>}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                            b.cuttingCount > 0 ? "bg-purple-100 text-purple-800 border border-purple-200" : "bg-slate-100 text-slate-400"
                          }`}
                          title="Cutting Floor Panes"
                        >
                          Cut: {b.cuttingCount}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                            b.pairingCount > 0 ? "bg-indigo-100 text-indigo-800 border border-indigo-200" : "bg-slate-100 text-slate-400"
                          }`}
                          title="Pairing Buffer Panes"
                        >
                          Pair: {b.pairingCount}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                            b.dguCount > 0 ? "bg-teal-100 text-teal-800 border border-teal-200" : "bg-slate-100 text-slate-400"
                          }`}
                          title="DGU Assembly Station"
                        >
                          DGU: {b.dguCount}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                            b.laminationCount > 0 ? "bg-amber-100 text-amber-800 border border-amber-200" : "bg-slate-100 text-slate-400"
                          }`}
                          title="Lamination Autoclave"
                        >
                          Lam: {b.laminationCount}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                            b.finishedCount > 0 ? "bg-emerald-100 text-emerald-800 border border-emerald-200" : "bg-slate-100 text-slate-400"
                          }`}
                          title="Finished Warehouse Ready"
                        >
                          Fin: {b.finishedCount}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                      {b.totalSqm.toFixed(1)} m²
                    </td>
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      <div className="w-24 bg-slate-100 h-2 rounded-full overflow-hidden mx-auto">
                        <div
                          className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                          style={{ width: `${b.progress}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono font-bold text-slate-500 mt-0.5 block">
                        {b.progress}% ({b.finishedCount}/{b.totalPieces})
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (b.primaryStage === "Cutting") onNavigateTab("cutting");
                          else if (b.primaryStage === "Pairing") onNavigateTab("pairing");
                          else if (b.primaryStage === "DGU") onNavigateTab("dgu");
                          else if (b.primaryStage === "Lamination") onNavigateTab("lamination");
                          else onNavigateTab("finished");
                        }}
                        className="h-7 px-2.5 text-xs font-black bg-purple-50 hover:bg-purple-600 hover:text-white text-purple-700 rounded-lg transition-all"
                      >
                        <span>Enter {b.primaryStage}</span>
                        <ArrowRight className="w-3 h-3 ml-1" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 px-4 text-center bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
            <Box className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <div className="text-xs font-bold text-slate-700">No active batches match the search / filter</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Try changing stage or glass type filter to see all production batches.</div>
          </div>
        )}
      </div>
    </div>
  );
};

function ChevronRightIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
