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
  ArrowLeft,
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
  RotateCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlassItem, PIMaster, DashboardStats, ProductionStage } from "@shared/api";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatBatchNumber, formatPlatformDate, formatPlatformTime, getItemFinish, isDguGlass, isLaminatedGlass, isDlguGlass, isDispatchedItem } from "@/lib/utils";

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
  const [stageFilter, setStageFilter] = useState<"ALL" | "Cutting" | "Polishing" | "Pairing" | "DGU" | "Lamination" | "Finished">("ALL");
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

    // Stage counts (Individual Glass Panes - exclude dispatched items which belong only in Dispatched History)
    const cuttingItemsList = items.filter((i) => !isDispatchedItem(i) && (i.currentStage === "Cutting" || (!i.currentStage && i.status !== "Rejected")) && i.status !== "Rejected");
    const polishingItemsList = items.filter((i) => !isDispatchedItem(i) && i.currentStage === "Polishing" && i.status !== "Rejected");
    const pairingItemsList = items.filter((i) => !isDispatchedItem(i) && i.currentStage === "Pairing" && i.status !== "Rejected");
    const dguItemsList = items.filter((i) => !isDispatchedItem(i) && i.currentStage === "DGU" && i.status !== "Rejected");
    const laminationItemsList = items.filter((i) => !isDispatchedItem(i) && i.currentStage === "Lamination" && i.status !== "Rejected");
    const finishedItemsList = items.filter((i) => !isDispatchedItem(i) && i.currentStage === "Finished" && i.status !== "Rejected");
    const rejectedItemsList = items.filter((i) => i.status === "Rejected");
    const reworkItemsList = items.filter((i) => i.status === "Reworking" || ((i as any).reworkCount && (i as any).reworkCount > 0));

    const cuttingCount = cuttingItemsList.length;
    const polishingCount = polishingItemsList.length;
    const pairingCount = pairingItemsList.length;
    const dguCount = dguItemsList.length;
    const laminationCount = laminationItemsList.length;
    const finishedCount = finishedItemsList.length;
    const rejectedCount = rejectedItemsList.length;
    const reworkCount = reworkItemsList.length;

    // SQMs
    const cuttingSqm = parseFloat(cuttingItemsList.reduce((acc, curr) => acc + (curr.sqm || 0), 0).toFixed(2));
    const polishingSqm = parseFloat(polishingItemsList.reduce((acc, curr) => acc + (curr.sqm || 0), 0).toFixed(2));
    const pairingSqm = parseFloat(pairingItemsList.reduce((acc, curr) => acc + (curr.sqm || 0), 0).toFixed(2));
    const dguSqm = parseFloat(dguItemsList.reduce((acc, curr) => acc + (curr.sqm || 0), 0).toFixed(2));
    const laminationSqm = parseFloat(laminationItemsList.reduce((acc, curr) => acc + (curr.sqm || 0), 0).toFixed(2));
    const finishedSqm = parseFloat(finishedItemsList.reduce((acc, curr) => acc + (curr.sqm || 0), 0).toFixed(2));

    // In Progress Quantity (Active panes in Cutting, Polishing, Pairing, DGU, Lamination)
    const inProgressCount = cuttingCount + polishingCount + pairingCount + dguCount + laminationCount;
    const inProgressSqm = parseFloat((cuttingSqm + polishingSqm + pairingSqm + dguSqm + laminationSqm).toFixed(2));

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
      polishingCount,
      polishingSqm,
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
      batchNo?: string;
      customerName: string;
      projectName: string;
      jobOrderNumber: string;
      sfoNo: string;
      items: GlassItem[];
      cuttingCount: number;
      polishingCount: number;
      pairingCount: number;
      dguCount: number;
      laminationCount: number;
      finishedCount: number;
      rejectedCount: number;
      reworkCount: number;
      totalSqm: number;
      finish: "Clear" | "Colour";
      glassTypes: Set<string>;
      primaryStage: "Cutting" | "Polishing" | "Pairing" | "DGU" | "Lamination" | "Finished";
      progress: number;
      createdAt: string | Date;
      fileName?: string;
    }>();

    items.forEach((item) => {
      const key = item.piId || item.piNumber || item.batchNo || "default";
      const parentPI = pis.find((p) => p.id === item.piId || p.piNumber === item.piNumber);
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          piNumber: (item.piNumber || parentPI?.piNumber || `BATCH-${item.batchNo || "1"}`).replace(/^STK-/i, ""),
          batchNo: parentPI?.batchNo || item.batchNo || "",
          customerName: parentPI?.customerName || (item as any).customerName || (item as any).clientName || "Customer",
          projectName: parentPI?.projectName || (item as any).projectName || item.sectionName || "Project",
          jobOrderNumber: parentPI?.jobOrderNumber || item.orderNo || item.sfoNo || "",
          sfoNo: item.sfoNo || parentPI?.sfoNo || "",
          fileName: parentPI?.fileName || (item as any).fileName || "",
          items: [],
          cuttingCount: 0,
          polishingCount: 0,
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

      if (isDispatchedItem(item)) {
        // Dispatched items belong only in Dispatched History
      } else if (st === "cutting" || (!item.currentStage && item.status !== "Rejected")) b.cuttingCount += itemPieces;
      else if (st === "polishing") b.polishingCount += itemPieces;
      else if (st === "pairing") b.pairingCount += itemPieces;
      else if (st === "dgu") b.dguCount += itemPieces;
      else if (st === "lamination") b.laminationCount += itemPieces;
      else if (st === "finished") b.finishedCount += itemPieces;
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
          fileName: p.fileName || "",
          items: [],
          cuttingCount: p.totalQty || p.itemsCount || 0,
          polishingCount: 0,
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

      let primaryStage: "Cutting" | "Polishing" | "Pairing" | "DGU" | "Lamination" | "Finished" = "Cutting";
      if (b.cuttingCount > 0) primaryStage = "Cutting";
      else if (b.polishingCount > 0) primaryStage = "Polishing";
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
        if (stageFilter === "Polishing" && b.polishingCount === 0) return false;
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
        Boolean(b.fileName && b.fileName.toLowerCase().includes(q)) ||
        b.jobOrderNumber.toLowerCase().includes(q) ||
        b.sfoNo.toLowerCase().includes(q)
      );
    });
  }, [batchRows, stageFilter, searchTerm]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shrink-0">
            <Factory className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight whitespace-nowrap">Production Pipeline Overview</h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-200">
                Dubai Plant Facility
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Real-time plant load, workstation throughput, specialty glass assembly tracking, and stage-wise allocation.
            </p>
          </div>
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
                    {metrics.cuttingCount} Pcs
                  </span>
                </button>

                {/* Polishing Workstation */}
                <button
                  onClick={() => {
                    onNavigateTab("polishing");
                    setStationMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-xl text-left hover:bg-cyan-50 text-slate-800 hover:text-cyan-900 transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-cyan-100 text-cyan-700 flex items-center justify-center font-bold">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold leading-none">Polishing Workstation</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Edge Grinding & Polishing</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-cyan-100 text-cyan-800 border border-cyan-200">
                    {metrics.polishingCount} Pcs
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
                      <div className="text-[10px] text-slate-500 mt-0.5">Completed Pieces</div>
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

      {/* ── Section 1: Executive Production Summary Grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5 mb-4">
        {/* 1. Total Production */}
        <div className="ppb-metric-card overview-small-card" onClick={() => onNavigateTab("pis")} style={{cursor:'pointer'}} title="View all Production Instructions & Batches">
          <div className="ppb-metric-main">
            <span className="ppb-metric-icon ppb-metric-icon-blue"><Boxes className="w-5 h-5" /></span>
            <div className="ppb-metric-copy">
              <h3>Total Production</h3>
              <strong>{metrics.totalItems} <small style={{fontSize:'10px',color:'#94a3b8'}}>Pcs</small></strong>
              <div className="ppb-metric-change"><span className="ppb-metric-change-up">Plant Total</span></div>
            </div>
          </div>
          <div className="ppb-metric-note ppb-note-blue" title={`${metrics.totalSqm.toFixed(1)} m² • ${batchRows.length} Active Batches`}>
            <span style={{width:6,height:6,borderRadius:'50%',background:'#3b82f6',display:'inline-block',flexShrink:0}} />
            <span className="truncate">{metrics.totalSqm.toFixed(1)} m² • {batchRows.length} Batches</span>
          </div>
        </div>

        {/* 2. In-Progress Quantity */}
        <div className="ppb-metric-card overview-small-card" onClick={() => onNavigateTab("cutting")} style={{cursor:'pointer'}} title="View Active Work in Progress">
          <div className="ppb-metric-main">
            <span className="ppb-metric-icon ppb-metric-icon-blue"><Clock className="w-5 h-5" /></span>
            <div className="ppb-metric-copy">
              <h3>In-Progress WIP</h3>
              <strong>{metrics.inProgressCount} <small style={{fontSize:'10px',color:'#94a3b8'}}>Pcs</small></strong>
              <div className="ppb-metric-change"><span className="ppb-metric-change-up">Active</span><small>Pipeline</small></div>
            </div>
          </div>
          <div className="ppb-metric-note ppb-note-blue" title={`${metrics.inProgressSqm.toFixed(1)} m² Active WIP Volume`}>
            <span style={{width:6,height:6,borderRadius:'50%',background:'#3b82f6',display:'inline-block',flexShrink:0}} />
            <span className="truncate">{metrics.inProgressSqm.toFixed(1)} m² WIP</span>
          </div>
        </div>

        {/* 3. Completed Quantity */}
        <div className="ppb-metric-card overview-small-card" onClick={() => onNavigateTab("finished")} style={{cursor:'pointer'}} title="View Quality Inspected / Ready for Dispatch">
          <div className="ppb-metric-main">
            <span className="ppb-metric-icon ppb-metric-icon-green"><CheckCircle className="w-5 h-5" /></span>
            <div className="ppb-metric-copy">
              <h3>Completed Pieces</h3>
              <strong>{metrics.finishedCount} <small style={{fontSize:'10px',color:'#94a3b8'}}>Pcs</small></strong>
              <div className="ppb-metric-change"><span className="ppb-metric-change-up">Ready</span><small>Dispatch</small></div>
            </div>
          </div>
          <div className="ppb-metric-note ppb-note-green" title="Quality Inspected - Completed and Ready for Dispatch">
            <span style={{width:6,height:6,borderRadius:'50%',background:'#10b981',display:'inline-block',flexShrink:0}} />
            <span className="truncate">Quality Inspected</span>
          </div>
        </div>

        {/* 4. Pending Cutting */}
        <div className="ppb-metric-card overview-small-card" onClick={() => onNavigateTab("cutting")} style={{cursor:'pointer'}} title="View Cutting Workstation Queue">
          <div className="ppb-metric-main">
            <span className="ppb-metric-icon ppb-metric-icon-yellow"><Scissors className="w-5 h-5" /></span>
            <div className="ppb-metric-copy">
              <h3>Pending Cutting</h3>
              <strong>{metrics.pendingCuttingCount} <small style={{fontSize:'10px',color:'#94a3b8'}}>Pcs</small></strong>
              <div className="ppb-metric-change"><span className="ppb-metric-change-flat" style={{color:'#d97706', fontWeight:700}}>Awaiting</span><small>Cutting</small></div>
            </div>
          </div>
          <div className="ppb-metric-note ppb-note-yellow" title={`${metrics.distinctCuttingSheets} Raw Glass Sheets in Queue`}>
            <span style={{width:6,height:6,borderRadius:'50%',background:'#f59e0b',display:'inline-block',flexShrink:0}} />
            <span className="truncate">{metrics.distinctCuttingSheets} Raw Sheets</span>
          </div>
        </div>

        {/* 5. Pending Polishing */}
        <div className="ppb-metric-card overview-small-card" onClick={() => onNavigateTab("polishing")} style={{cursor:'pointer'}} title="View Polishing Workstation Queue">
          <div className="ppb-metric-main">
            <span className="ppb-metric-icon ppb-metric-icon-cyan"><Sparkles className="w-5 h-5" /></span>
            <div className="ppb-metric-copy">
              <h3>Pending Polish</h3>
              <strong>{metrics.polishingCount} <small style={{fontSize:'10px',color:'#94a3b8'}}>Pcs</small></strong>
              <div className="ppb-metric-change"><span style={{color:'#0891b2', fontWeight:700}}>Awaiting</span><small>Polish</small></div>
            </div>
          </div>
          <div className="ppb-metric-note ppb-note-cyan" title={`${metrics.polishingSqm.toFixed(1)} m² Polishing Volume`}>
            <span style={{width:6,height:6,borderRadius:'50%',background:'#06b6d4',display:'inline-block',flexShrink:0}} />
            <span className="truncate">{metrics.polishingSqm.toFixed(1)} m² Volume</span>
          </div>
        </div>

        {/* 6. Rejected Items */}
        <div className="ppb-metric-card overview-small-card" onClick={() => onNavigateTab("reports")} style={{cursor:'pointer'}} title="View Rejection Reports & Quality Logs">
          <div className="ppb-metric-main">
            <span className="ppb-metric-icon ppb-metric-icon-red"><AlertTriangle className="w-5 h-5" /></span>
            <div className="ppb-metric-copy">
              <h3>Rejected Items</h3>
              <strong>{metrics.rejectedCount} <small style={{fontSize:'10px',color:'#94a3b8'}}>Pcs</small></strong>
              <div className="ppb-metric-change"><span style={{color: metrics.rejectedCount === 0 ? '#10b981' : '#ef4444', fontWeight:700}}>{metrics.rejectedCount === 0 ? "Zero Defect" : "Logged"}</span><small>{metrics.rejectedCount === 0 ? "Quality" : "Audit"}</small></div>
            </div>
          </div>
          <div className="ppb-metric-note ppb-note-red" title={metrics.rejectedCount === 0 ? "No rejection today - Zero Defects" : `${metrics.rejectedCount} items rejected`}>
            <span style={{width:6,height:6,borderRadius:'50%',background: metrics.rejectedCount === 0 ? '#10b981' : '#ef4444',display:'inline-block',flexShrink:0}} />
            <span className="truncate">{metrics.rejectedCount === 0 ? "No rejection today" : "Rejection logged"}</span>
          </div>
        </div>

        {/* 7. Rework Items */}
        <div className="ppb-metric-card overview-small-card" onClick={() => onNavigateTab("reports")} style={{cursor:'pointer'}} title="View Rework Routing & History">
          <div className="ppb-metric-main">
            <span className="ppb-metric-icon ppb-metric-icon-purple"><RotateCw className="w-5 h-5" /></span>
            <div className="ppb-metric-copy">
              <h3>Rework Items</h3>
              <strong>{metrics.reworkCount} <small style={{fontSize:'10px',color:'#94a3b8'}}>Pcs</small></strong>
              <div className="ppb-metric-change"><span style={{color:'#7e22ce', fontWeight:700}}>{metrics.reworkCount === 0 ? "Normal" : "Active"}</span><small>Routing</small></div>
            </div>
          </div>
          <div className="ppb-metric-note ppb-note-purple" title="Secondary Route Activity">
            <span style={{width:6,height:6,borderRadius:'50%',background:'#a855f7',display:'inline-block',flexShrink:0}} />
            <span className="truncate">{metrics.reworkCount === 0 ? "No active rework" : "Secondary Route Active"}</span>
          </div>
        </div>
      </div>

      {/* ── Section 2 & 3: Horizontal Queues ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Section 2: Specialty Glass */}
        <section className="ppb-panel h-full flex flex-col justify-between">
          <div className="ppb-panel-heading">
            <div><Sparkles className="ppb-heading-icon" size={20} /><h3>Specialty Glass Assembly</h3></div>
            <div style={{fontSize:10,color:'#607d8b',fontWeight:700}}>Automated 1+1 Pairing</div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="ppb-queue-tile ppb-queue-tile-emerald" onClick={() => onNavigateTab("dgu")}>
              <span className="ppb-queue-icon ppb-queue-icon-emerald"><ClipboardList size={20} /></span>
              <div><strong style={{fontSize:'11.5px'}}>DGU / IGU Units</strong><span className="ppb-count"><b>{metrics.dguTotalUnits}</b> Units Assembly</span></div>
            </div>
            <div className="ppb-queue-tile ppb-queue-tile-purple" onClick={() => onNavigateTab("pairing")}>
              <span className="ppb-queue-icon ppb-queue-icon-purple"><Layers size={20} /></span>
              <div><strong style={{fontSize:'11.5px'}}>DLGU Multi-Layer</strong><span className="ppb-count"><b>{metrics.dlguTotalUnits}</b> Units Processed</span></div>
            </div>
            <div className="ppb-queue-tile ppb-queue-tile-amber" onClick={() => onNavigateTab("lamination")}>
              <span className="ppb-queue-icon ppb-queue-icon-amber"><Flame size={20} /></span>
              <div><strong style={{fontSize:'11.5px'}}>Lamination Line</strong><span className="ppb-count"><b>{metrics.lamTotalUnits}</b> Pairs Autoclave</span></div>
            </div>
          </div>
        </section>

        {/* Section 3: Stage-Wise Workflows */}
        <section className="ppb-panel h-full flex flex-col justify-between">
          <div className="ppb-panel-heading">
            <div><Activity className="ppb-heading-icon" size={20} /><h3>Stage-Wise Workflows</h3></div>
            <div style={{fontSize:10,color:'#607d8b',fontWeight:700}}>Cutting ➔ Polishing ➔ Assembly ➔ Dispatch</div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div className="ppb-queue-tile ppb-workflow-tile ppb-queue-tile-blue" onClick={() => onNavigateTab("cutting")}>
              <span className="ppb-queue-icon ppb-queue-icon-blue"><Scissors size={14} /></span>
              <div><strong>1. Cutting</strong><span className="ppb-count"><b>{metrics.cuttingCount}</b> Pcs</span></div>
            </div>
            <div className="ppb-queue-tile ppb-workflow-tile ppb-queue-tile-cyan" onClick={() => onNavigateTab("polishing")} style={{cursor: 'pointer'}}>
              <span className="ppb-queue-icon ppb-queue-icon-cyan"><Sparkles size={14} /></span>
              <div><strong>2. Polish</strong><span className="ppb-count"><b>{metrics.polishingCount}</b> Pcs</span></div>
            </div>
            <div className="ppb-queue-tile ppb-workflow-tile ppb-queue-tile-purple" onClick={() => onNavigateTab("pairing")}>
              <span className="ppb-queue-icon ppb-queue-icon-purple"><Layers size={14} /></span>
              <div><strong>3. Pairing</strong><span className="ppb-count"><b>{metrics.pairingCount}</b> Pcs</span></div>
            </div>
            <div className="ppb-queue-tile ppb-workflow-tile ppb-queue-tile-emerald" onClick={() => onNavigateTab("dgu")}>
              <span className="ppb-queue-icon ppb-queue-icon-emerald"><ClipboardList size={14} /></span>
              <div><strong>4. Assembly</strong><span className="ppb-count"><b>{metrics.dguCount + metrics.laminationCount}</b> Pcs</span></div>
            </div>
            <div className="ppb-queue-tile ppb-workflow-tile ppb-queue-tile-green" onClick={() => onNavigateTab("finished")}>
              <span className="ppb-queue-icon ppb-queue-icon-green"><CheckCircle size={14} /></span>
              <div><strong>5. Dispatch</strong><span className="ppb-count"><b>{metrics.finishedCount}</b> Ready</span></div>
            </div>
          </div>
        </section>
      </div>

      {/* ── Section 4: Plant-Level Progress Bar & Live Batch Matrix Table ── */}
      <section className="ppb-panel ppb-summary-panel w-full">
        <div className="ppb-panel-heading">
          <div><TrendingUp className="ppb-heading-icon" size={20} /><h3>Plant Completion Matrix</h3><span className="ppb-live-badge"><i />Live</span></div>
          <div style={{fontSize:10,color:'#607d8b',fontWeight:700}}>{metrics.completionPercent}% Completed</div>
        </div>
        
        <div className="space-y-4 mb-4">
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

          <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 flex-wrap gap-2 pt-1">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" />
                <span>Completed: <strong className="text-slate-800">{metrics.finishedCount} Pcs</strong> ({metrics.completionPercent}%)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 flex-shrink-0" />
                <span>In Progress: <strong className="text-slate-800">{metrics.inProgressCount} Pcs</strong> ({metrics.inProgressPercent}%)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 flex-shrink-0" />
                <span>Pending: <strong className="text-slate-800">{metrics.pendingCuttingCount} Pcs</strong> ({metrics.pendingPercent}%)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 flex-shrink-0" />
                <span>Rejects: <strong className="text-slate-800">{metrics.rejectedCount} Pcs</strong> ({metrics.rejectedPercent}%)</span>
              </span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-900 font-mono text-xs">
              <span className="text-[10px] font-sans font-bold text-indigo-500 uppercase tracking-wider">Total Area:</span>
              <span className="font-black text-indigo-700">{metrics.totalSqm.toFixed(1)} m²</span>
            </div>
          </div>
        </div>

        {/* Filter & Search Toolbar */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Stage Filters */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
              {(["ALL", "Cutting", "Polishing", "Pairing", "DGU", "Lamination", "Finished"] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStageFilter(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                    stageFilter === st
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
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
                      {formatBatchNumber(b.batchNo || b.piNumber)}
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
                            b.polishingCount > 0 ? "bg-cyan-100 text-cyan-800 border border-cyan-200" : "bg-slate-100 text-slate-400"
                          }`}
                          title="Polishing Workstation Panes"
                        >
                          Polish: {b.polishingCount}
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
                          else if (b.primaryStage === "Polishing") onNavigateTab("polishing");
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
        
          
      </section>

    </div>
  );
};