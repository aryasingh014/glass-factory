import React, { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FileSpreadsheet,
  FileText,
  BarChart2,
  RefreshCw,
  Tag,
  AlertCircle,
  RotateCcw,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Layers,
  Boxes,
  Activity,
  X,
  TrendingUp,
  AlertTriangle,
  Calendar,
  Zap,
  Check,
  Building2,
  Sparkles,
} from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  formatDubaiDateTime,
  formatAENumber,
  formatPlatformDate,
  formatBatchNumber,
  getItemFinish,
  getDguEffectiveQtyAndSqm,
  isDlguGlass,
  isDguGlass,
  isLaminatedGlass,
} from "@/lib/utils";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ReportsResponse, PIMaster, GlassItem, ProductionHistory, RejectRecord, ReworkRecord, ProductionStage } from "@shared/api";

interface ReportsViewProps {
  initialTab?: "pis" | "items" | "history" | "rejects" | "reworks";
  onPrintSticker?: (item: GlassItem) => void;
  onReject?: (item: GlassItem) => void;
  onRework?: (item: GlassItem) => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  initialTab = "pis",
  onPrintSticker,
  onReject,
  onRework,
}) => {
  const [reportData, setReportData] = useState<ReportsResponse | null>(null);
  const [activeTab, setActiveTab] = useState<"pis" | "items" | "history" | "rejects" | "reworks">(initialTab);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [lastSyncedTime, setLastSyncedTime] = useState<Date>(new Date());

  // Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStage, setSelectedStage] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedDateRange, setSelectedDateRange] = useState<"all" | "today" | "week" | "month">("all");

  const fetchReports = async (showLoadingState = true) => {
    if (showLoadingState) {
      setLoading(true);
    } else {
      setIsRefreshing(true);
    }
    try {
      const res = await fetch("/api/reports");
      if (!res.ok) throw new Error("Failed to load live reports");
      const data: ReportsResponse = await res.json();
      setReportData(data);
      setLastSyncedTime(new Date());
    } catch (err: any) {
      toast.error(err.message || "Error fetching report data");
    } finally {
      if (showLoadingState) setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchReports(true);
  }, []);

  // Real-Time auto-refresh polling interval (every 10 seconds)
  useEffect(() => {
    if (!autoSync) return;
    const interval = setInterval(() => {
      fetchReports(false);
    }, 10000);
    return () => clearInterval(interval);
  }, [autoSync]);

  // Helper date filter
  const isWithinDateRange = (dateStr?: string | Date) => {
    if (!dateStr || selectedDateRange === "all") return true;
    const date = new Date(dateStr);
    const now = new Date();
    if (isNaN(date.getTime())) return true;

    if (selectedDateRange === "today") {
      return (
        date.getDate() === now.getDate() &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear()
      );
    }
    if (selectedDateRange === "week") {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return date >= sevenDaysAgo;
    }
    if (selectedDateRange === "month") {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return date >= thirtyDaysAgo;
    }
    return true;
  };

  // High-Level Live Summary Calculations
  const summaryMetrics = useMemo(() => {
    if (!reportData) {
      return {
        totalPis: 0,
        completedPis: 0,
        inProgressPis: 0,
        totalItems: 0,
        completedItems: 0,
        inProgressItems: 0,
        totalSqm: 0,
        completedSqm: 0,
        totalRejects: 0,
        totalReworks: 0,
        defectRate: 0,
        reworkRate: 0,
        completionRate: 0,
      };
    }

    const pis = reportData.pis || [];
    const items = reportData.items || [];
    const rejects = reportData.rejects || [];
    const reworks = reportData.reworks || [];

    const totalPis = pis.length;
    const completedPis = pis.filter((p) => p.status === "Completed").length;
    const inProgressPis = totalPis - completedPis;

    const totalItems = items.length;
    const completedItems = items.filter((i) => i.status === "Completed" || i.currentStage === "Finished").length;
    const inProgressItems = totalItems - completedItems;

    let totalSqm = 0;
    let completedSqm = 0;

    items.forEach((i) => {
      const eff = getDguEffectiveQtyAndSqm(i);
      totalSqm += eff.sqm;
      if (i.status === "Completed" || i.currentStage === "Finished") {
        completedSqm += eff.sqm;
      }
    });

    const totalRejects = rejects.length;
    const totalReworks = reworks.length;
    const defectRate = totalItems > 0 ? (totalRejects / (totalItems + totalRejects)) * 100 : 0;
    const reworkRate = totalItems > 0 ? (totalReworks / totalItems) * 100 : 0;
    const completionRate = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

    return {
      totalPis,
      completedPis,
      inProgressPis,
      totalItems,
      completedItems,
      inProgressItems,
      totalSqm,
      completedSqm,
      totalRejects,
      totalReworks,
      defectRate,
      reworkRate,
      completionRate,
    };
  }, [reportData]);

  // Filtered Datasets for each tab
  const filteredPis = useMemo(() => {
    if (!reportData?.pis) return [];
    const q = searchTerm.toLowerCase().trim();
    return reportData.pis.filter((pi) => {
      if (q) {
        const matchNumber = pi.piNumber.toLowerCase().includes(q);
        const matchJob = (pi.jobOrderNumber || "").toLowerCase().includes(q);
        const matchCust = (pi.customerName || "").toLowerCase().includes(q);
        const matchProj = (pi.projectName || "").toLowerCase().includes(q);
        if (!matchNumber && !matchJob && !matchCust && !matchProj) return false;
      }
      if (selectedStatus !== "all" && pi.status !== selectedStatus) return false;
      if (!isWithinDateRange(pi.createdAt)) return false;
      return true;
    });
  }, [reportData?.pis, searchTerm, selectedStatus, selectedDateRange]);

  const filteredItems = useMemo(() => {
    if (!reportData?.items) return [];
    const q = searchTerm.toLowerCase().trim();
    return reportData.items.filter((item) => {
      if (q) {
        const matchBar = (item.barcode || "").toLowerCase().includes(q);
        const matchSerial = (item.serialNumber || "").toLowerCase().includes(q);
        const matchPi = (item.piNumber || item.batchNo || "").toLowerCase().includes(q);
        const matchCode = (item.itemCode || item.glassCode || "").toLowerCase().includes(q);
        const matchType = (item.glassType || "").toLowerCase().includes(q);
        if (!matchBar && !matchSerial && !matchPi && !matchCode && !matchType) return false;
      }
      if (selectedStage !== "all" && item.currentStage !== selectedStage) return false;
      if (selectedStatus !== "all" && (item.status || "Pending") !== selectedStatus) return false;
      if (!isWithinDateRange(item.updatedAt || item.createdAt)) return false;
      return true;
    });
  }, [reportData?.items, searchTerm, selectedStage, selectedStatus, selectedDateRange]);

  const filteredHistory = useMemo(() => {
    if (!reportData?.history) return [];
    const q = searchTerm.toLowerCase().trim();
    return reportData.history.filter((h) => {
      if (q) {
        const matchSerial = (h.serialNumber || "").toLowerCase().includes(q);
        const matchPi = (h.piNumber || "").toLowerCase().includes(q);
        const matchItem = (h.itemOrBatch || "").toLowerCase().includes(q);
        const matchAction = (h.action || "").toLowerCase().includes(q);
        const matchUser = (h.user || h.operator || "").toLowerCase().includes(q);
        const matchRemarks = (h.remarks || "").toLowerCase().includes(q);
        const matchStage = (h.stage || "").toLowerCase().includes(q);
        const matchPrev = (h.prevStatus || "").toLowerCase().includes(q);
        const matchNew = (h.newStatus || h.status || "").toLowerCase().includes(q);
        if (
          !matchSerial &&
          !matchPi &&
          !matchItem &&
          !matchAction &&
          !matchUser &&
          !matchRemarks &&
          !matchStage &&
          !matchPrev &&
          !matchNew
        ) {
          return false;
        }
      }
      if (selectedStage !== "all" && h.stage !== selectedStage) return false;
      if (!isWithinDateRange(h.timestamp)) return false;
      return true;
    });
  }, [reportData?.history, searchTerm, selectedStage, selectedDateRange]);

  const filteredRejects = useMemo(() => {
    if (!reportData?.rejects) return [];
    const q = searchTerm.toLowerCase().trim();
    return reportData.rejects.filter((r) => {
      if (q) {
        const matchSerial = (r.serialNumber || "").toLowerCase().includes(q);
        const matchPi = (r.piNumber || "").toLowerCase().includes(q);
        const matchReason = (r.reason || "").toLowerCase().includes(q);
        const matchOp = (r.operator || "").toLowerCase().includes(q);
        if (!matchSerial && !matchPi && !matchReason && !matchOp) return false;
      }
      if (selectedStage !== "all" && r.stage !== selectedStage) return false;
      if (!isWithinDateRange(r.date)) return false;
      return true;
    });
  }, [reportData?.rejects, searchTerm, selectedStage, selectedDateRange]);

  const filteredReworks = useMemo(() => {
    if (!reportData?.reworks) return [];
    const q = searchTerm.toLowerCase().trim();
    return reportData.reworks.filter((rw) => {
      if (q) {
        const matchSerial = (rw.serialNumber || "").toLowerCase().includes(q);
        const matchFrom = (rw.fromStage || "").toLowerCase().includes(q);
        const matchTarget = (rw.targetStage || "").toLowerCase().includes(q);
        const matchReason = (rw.reason || "").toLowerCase().includes(q);
        const matchOp = (rw.operator || "").toLowerCase().includes(q);
        if (!matchSerial && !matchFrom && !matchTarget && !matchReason && !matchOp) return false;
      }
      if (selectedStage !== "all" && rw.targetStage !== selectedStage && rw.fromStage !== selectedStage) return false;
      if (!isWithinDateRange(rw.date)) return false;
      return true;
    });
  }, [reportData?.reworks, searchTerm, selectedStage, selectedDateRange]);

  // Export current filtered view to Excel with styled layout
  const handleExportCurrentView = () => {
    const wb = XLSX.utils.book_new();
    const dateStr = new Date().toISOString().split("T")[0];

    if (activeTab === "pis") {
      if (filteredPis.length === 0) {
        toast.error("No batch data to export in the current filtered view");
        return;
      }
      const data = filteredPis.map((p, idx) => ({
        "Sr No": idx + 1,
        "Batch / PI Number": formatBatchNumber(p.piNumber) || p.piNumber,
        "Job Order No": p.jobOrderNumber || "—",
        "Customer Name": p.customerName || "—",
        "Project Name": p.projectName || "—",
        "Glass Finish": p.finish || "—",
        "Total Quantity": p.totalQty,
        "Total SQM": p.totalSqm,
        "Status": p.status,
        "Uploaded Date": formatPlatformDate(p.createdAt),
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = [
        { wch: 6 },
        { wch: 18 },
        { wch: 14 },
        { wch: 25 },
        { wch: 25 },
        { wch: 12 },
        { wch: 10 },
        { wch: 12 },
        { wch: 14 },
        { wch: 16 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, "Proforma Invoices");
      XLSX.writeFile(wb, `Sejal_Glass_Batches_Report_${dateStr}.xlsx`);
      toast.success("Batch report exported to Excel");
    } else if (activeTab === "items") {
      if (filteredItems.length === 0) {
        toast.error("No items to export in current filtered view");
        return;
      }
      const data = filteredItems.map((item, idx) => {
        const eff = getDguEffectiveQtyAndSqm(item);
        const finish = getItemFinish(item);
        const glassTypeCategory = isDlguGlass(item)
          ? "DLGU Unit"
          : isDguGlass(item)
          ? "DGU / IGU Unit"
          : isLaminatedGlass(item)
          ? "Laminated Glass"
          : "Single / Monolithic";

        return {
          "Sr No": idx + 1,
          "Batch No": formatBatchNumber(item.batchNo || item.piNumber) || item.batchNo || item.piNumber,
          "Barcode": item.barcode,
          "Serial Number": item.serialNumber,
          "Glass Category": glassTypeCategory,
          "Glass Finish": finish,
          "Glass Description": item.glassType,
          "Width (mm)": item.width,
          "Height (mm)": item.height,
          "Quantity": eff.qty,
          "Unit": eff.unitLabel,
          "Total SQM": eff.sqm,
          "Current Stage": item.currentStage,
          "Status": item.status || "Pending",
          "Last Updated": formatDubaiDateTime(item.updatedAt || item.createdAt),
        };
      });
      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = [
        { wch: 6 },
        { wch: 16 },
        { wch: 20 },
        { wch: 14 },
        { wch: 18 },
        { wch: 12 },
        { wch: 30 },
        { wch: 12 },
        { wch: 12 },
        { wch: 10 },
        { wch: 10 },
        { wch: 12 },
        { wch: 14 },
        { wch: 14 },
        { wch: 20 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, "Glass Items");
      XLSX.writeFile(wb, `Sejal_Glass_Items_Report_${dateStr}.xlsx`);
      toast.success("Glass items report exported to Excel");
    } else if (activeTab === "history") {
      if (filteredHistory.length === 0) {
        toast.error("No history records to export in current filtered view");
        return;
      }
      const data = filteredHistory.map((h, idx) => ({
        "Sr No": idx + 1,
        "Timestamp (GST)": formatDubaiDateTime(h.timestamp),
        "User / Operator": h.user || h.operator || "Operator",
        "Action Performed": h.action || (h.status === "Completed" ? "Stage Completed" : h.status || "Activity Logged"),
        "Item / Batch": h.itemOrBatch || h.serialNumber || (h.piNumber ? `Batch ${h.piNumber}` : "—"),
        "Workstation / Module": h.stage,
        "Previous Status": h.prevStatus || "Pending",
        "New Status": h.newStatus || h.status || "Completed",
        "Activity Details / Remarks": h.remarks || "—",
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = [
        { wch: 6 },
        { wch: 22 },
        { wch: 18 },
        { wch: 26 },
        { wch: 22 },
        { wch: 18 },
        { wch: 16 },
        { wch: 16 },
        { wch: 35 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, "System Audit Log");
      XLSX.writeFile(wb, `Sejal_Glass_Audit_Log_${dateStr}.xlsx`);
      toast.success("Audit log exported to Excel");
    } else if (activeTab === "rejects") {
      if (filteredRejects.length === 0) {
        toast.error("No rejects to export in current filtered view");
        return;
      }
      const data = filteredRejects.map((r, idx) => ({
        "Sr No": idx + 1,
        "Date (GST)": formatDubaiDateTime(r.date),
        "Serial Number": r.serialNumber,
        "Batch / PI No": r.piNumber || "—",
        "Defect Stage": r.stage,
        "Defect Reason": r.reason,
        "Operator": r.operator || "—",
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = [
        { wch: 6 },
        { wch: 22 },
        { wch: 16 },
        { wch: 16 },
        { wch: 16 },
        { wch: 30 },
        { wch: 16 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, "Rejects Log");
      XLSX.writeFile(wb, `Sejal_Glass_Rejects_Log_${dateStr}.xlsx`);
      toast.success("Rejects log exported to Excel");
    } else if (activeTab === "reworks") {
      if (filteredReworks.length === 0) {
        toast.error("No reworks to export in current filtered view");
        return;
      }
      const data = filteredReworks.map((rw, idx) => ({
        "Sr No": idx + 1,
        "Date (GST)": formatDubaiDateTime(rw.date),
        "Serial Number": rw.serialNumber,
        "From Stage": rw.fromStage,
        "Target Stage": rw.targetStage,
        "Rework Reason": rw.reason,
        "Operator": rw.operator || "—",
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = [
        { wch: 6 },
        { wch: 22 },
        { wch: 16 },
        { wch: 16 },
        { wch: 16 },
        { wch: 30 },
        { wch: 16 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, "Reworks Log");
      XLSX.writeFile(wb, `Sejal_Glass_Reworks_Log_${dateStr}.xlsx`);
      toast.success("Reworks log exported to Excel");
    }
  };

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedStage("all");
    setSelectedStatus("all");
    setSelectedDateRange("all");
  };

  const hasActiveFilters =
    searchTerm !== "" || selectedStage !== "all" || selectedStatus !== "all" || selectedDateRange !== "all";

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 animate-pulse shadow-sm">
          <Activity className="w-6 h-6 animate-spin" />
        </div>
        <div className="text-center">
          <h3 className="text-sm font-extrabold text-slate-900">Synchronizing Live Reports...</h3>
          <p className="text-xs text-slate-500 mt-0.5">Fetching latest production audit and batch status data</p>
        </div>
      </div>
    );
  }

  if (!reportData) {
    return (
      <div className="p-8 text-center text-red-500 font-bold bg-red-50 rounded-2xl border border-red-200">
        Failed to load report data. Please refresh.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── HEADER & REAL-TIME CONTROLS ── */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-indigo-600" />
              Live Production & Quality Reports
            </h2>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>Real-Time Sync Active</span>
            </div>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Live business intelligence, workstation throughput, quality logs, and instant Excel exports.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Auto Sync Toggle */}
          <button
            type="button"
            onClick={() => setAutoSync(!autoSync)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors flex items-center gap-1.5 cursor-pointer ${
              autoSync
                ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
            }`}
            title={autoSync ? "Auto-sync every 10s is ON" : "Auto-sync is paused"}
          >
            <Zap className={`w-3.5 h-3.5 ${autoSync ? "text-indigo-600" : "text-slate-400"}`} />
            <span>Auto-Sync {autoSync ? "ON (10s)" : "PAUSED"}</span>
          </button>

          {/* Sync Now Button */}
          <Button
            type="button"
            onClick={() => fetchReports(false)}
            disabled={isRefreshing}
            size="sm"
            variant="outline"
            className="h-8 text-xs font-bold border-slate-300 hover:bg-slate-50 text-slate-700 gap-1.5"
            title="Fetch latest database state immediately"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-indigo-600" : ""}`} />
            <span>{isRefreshing ? "Syncing..." : "Sync Now"}</span>
          </Button>

          {/* Export to Excel Button */}
          <Button
            type="button"
            onClick={handleExportCurrentView}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 h-8 shadow-2xs"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export Filtered ({activeTab.toUpperCase()})</span>
          </Button>
        </div>
      </div>

      {/* ── LIVE KPI METRICS SUMMARY BANNER ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Batches */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
            <span>Total Batches</span>
            <Boxes className="w-4 h-4 text-purple-600" />
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl font-black text-slate-900">{summaryMetrics.totalPis}</span>
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
              {summaryMetrics.completedPis} Done
            </span>
          </div>
          <div className="mt-1.5 text-[10px] text-slate-500">
            {summaryMetrics.inProgressPis} In Production
          </div>
        </div>

        {/* Total Glass Units */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
            <span>Total Units</span>
            <Layers className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl font-black text-slate-900">{summaryMetrics.totalItems}</span>
            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
              {summaryMetrics.completedItems} Finished
            </span>
          </div>
          <div className="mt-1.5 text-[10px] text-slate-500">
            {summaryMetrics.inProgressItems} WIP Pieces
          </div>
        </div>

        {/* Total SQM */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
            <span>Total Volume</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl font-black text-emerald-700 font-mono">
              {formatAENumber(summaryMetrics.totalSqm, 1)}
            </span>
            <span className="text-[10px] font-extrabold text-emerald-800">SQM</span>
          </div>
          <div className="mt-1.5 text-[10px] text-slate-500">
            {formatAENumber(summaryMetrics.completedSqm, 1)} SQM Dispatched
          </div>
        </div>

        {/* Progress % */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
            <span>Completion Rate</span>
            <CheckCircle2 className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl font-black text-indigo-700">
              {summaryMetrics.completionRate.toFixed(1)}%
            </span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className="bg-indigo-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, summaryMetrics.completionRate))}%` }}
            />
          </div>
        </div>

        {/* Rejects & Defect Rate */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
            <span>Quality Rejects</span>
            <AlertCircle className="w-4 h-4 text-red-600" />
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl font-black text-red-600">{summaryMetrics.totalRejects}</span>
            <span className="text-[10px] font-bold text-red-700 bg-red-50 px-1.5 py-0.5 rounded border border-red-100">
              {summaryMetrics.defectRate.toFixed(1)}% Rate
            </span>
          </div>
          <div className="mt-1.5 text-[10px] text-slate-500">
            Recorded Scrap & Defects
          </div>
        </div>

        {/* Reworks & Rework Rate */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
            <span>Reworks</span>
            <RotateCcw className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl font-black text-amber-600">{summaryMetrics.totalReworks}</span>
            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">
              {summaryMetrics.reworkRate.toFixed(1)}% Rate
            </span>
          </div>
          <div className="mt-1.5 text-[10px] text-slate-500">
            Reprocessed Pieces
          </div>
        </div>
      </div>

      {/* ── REAL-TIME SEARCH & FILTER BAR ── */}
      <div className="bg-white p-3 rounded-xl border border-slate-200/90 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-1 min-w-[280px]">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              type="text"
              placeholder="Search by PI #, Serial #, Barcode, Customer, Glass Code, Operator..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-8 h-9 text-xs font-medium border-slate-200 bg-slate-50/60 focus:bg-white"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          {/* Stage Filter */}
          {(activeTab === "items" || activeTab === "history" || activeTab === "rejects" || activeTab === "reworks") && (
            <select
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              className="h-9 px-2.5 rounded-lg border border-slate-200 bg-slate-50/60 text-slate-700 font-semibold text-xs focus:ring-1 focus:ring-indigo-500 focus:bg-white"
            >
              <option value="all">All Stages</option>
              <option value="Cutting">Cutting Stage</option>
              <option value="Edging">Edging Stage</option>
              <option value="Tempering">Tempering Stage</option>
              <option value="DGU">DGU Assembly Stage</option>
              <option value="Lamination">Lamination Stage</option>
              <option value="Finished">Finished / Dispatch</option>
            </select>
          )}

          {/* Status Filter */}
          {(activeTab === "pis" || activeTab === "items") && (
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="h-9 px-2.5 rounded-lg border border-slate-200 bg-slate-50/60 text-slate-700 font-semibold text-xs focus:ring-1 focus:ring-indigo-500 focus:bg-white"
            >
              <option value="all">All Statuses</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
              <option value="Pending">Pending</option>
              {activeTab === "items" && (
                <>
                  <option value="Rejected">Rejected</option>
                  <option value="Rework">Rework</option>
                </>
              )}
            </select>
          )}

          {/* Date Preset Filter */}
          <select
            value={selectedDateRange}
            onChange={(e) => setSelectedDateRange(e.target.value as any)}
            className="h-9 px-2.5 rounded-lg border border-slate-200 bg-slate-50/60 text-slate-700 font-semibold text-xs focus:ring-1 focus:ring-indigo-500 focus:bg-white"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">Past 7 Days</option>
            <option value="month">Past 30 Days</option>
          </select>

          {/* Reset Filters */}
          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-9 px-2.5 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-bold gap-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear</span>
            </Button>
          )}
        </div>
      </div>

      {/* ── REPORT TABS ── */}
      <div className="flex border-b border-slate-200 space-x-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab("pis")}
          className={`pb-2.5 px-4 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer ${
            activeTab === "pis"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Proforma Invoices / Batches ({filteredPis.length})
        </button>
        <button
          onClick={() => setActiveTab("items")}
          className={`pb-2.5 px-4 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer ${
            activeTab === "items"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Glass Units & Inventory ({filteredItems.length})
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`pb-2.5 px-4 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer ${
            activeTab === "history"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Audit History Trail ({filteredHistory.length})
        </button>
        <button
          onClick={() => setActiveTab("rejects")}
          className={`pb-2.5 px-4 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer ${
            activeTab === "rejects"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Quality Rejects Log ({filteredRejects.length})
        </button>
        <button
          onClick={() => setActiveTab("reworks")}
          className={`pb-2.5 px-4 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer ${
            activeTab === "reworks"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Reworks Log ({filteredReworks.length})
        </button>
      </div>

      {/* ── TAB CONTENT TABLES ── */}
      <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs">
        {/* 1. PROFORMA INVOICES TAB */}
        {activeTab === "pis" && (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/90 text-slate-600 uppercase border-b border-slate-200 text-[11px] font-extrabold tracking-wider">
                  <th className="p-3">Batch / PI Number</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Project / Job Order</th>
                  <th className="p-3 text-center">Finish</th>
                  <th className="p-3 text-center">Items Progress</th>
                  <th className="p-3 text-right">Total SQM</th>
                  <th className="p-3">Uploaded Date</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {filteredPis.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500 font-medium">
                      No proforma invoice / batch records matched your filter.
                    </td>
                  </tr>
                ) : (
                  filteredPis.map((pi: PIMaster) => {
                    return (
                      <tr key={pi.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 font-mono font-bold text-purple-700 whitespace-nowrap">
                          {formatBatchNumber(pi.piNumber)}
                        </td>
                        <td className="p-3 font-bold text-slate-900">{pi.customerName || "—"}</td>
                        <td className="p-3 text-slate-600">
                          <div className="font-semibold text-slate-800">{pi.projectName || "Standard Project"}</div>
                          {pi.jobOrderNumber && (
                            <div className="text-[10px] font-mono text-slate-400">Job: {pi.jobOrderNumber}</div>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                              pi.finish === "Colour"
                                ? "bg-purple-100 text-purple-800 border border-purple-200"
                                : "bg-sky-100 text-sky-800 border border-sky-200"
                            }`}
                          >
                            {pi.finish || "Clear"}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <div className="font-mono font-bold text-slate-900">{pi.totalQty} Units</div>
                        </td>
                        <td className="p-3 font-mono font-bold text-emerald-700 text-right whitespace-nowrap">
                          {formatAENumber(pi.totalSqm, 2)} SQM
                        </td>
                        <td className="p-3 font-mono text-slate-500 whitespace-nowrap">
                          {formatPlatformDate(pi.createdAt)}
                        </td>
                        <td className="p-3 text-center">
                          <StatusBadge status={pi.status || "In Progress"} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 2. GLASS ITEMS TAB */}
        {activeTab === "items" && (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/90 text-slate-600 uppercase border-b border-slate-200 text-[11px] font-extrabold tracking-wider">
                  <th className="p-3">Barcode</th>
                  <th className="p-3">Serial #</th>
                  <th className="p-3">Batch / PI</th>
                  <th className="p-3">Glass Description</th>
                  <th className="p-3">Dimensions (mm)</th>
                  <th className="p-3 text-center">Qty / Unit</th>
                  <th className="p-3 text-right">SQM</th>
                  <th className="p-3 text-center">Current Stage</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-slate-500 font-medium">
                      No glass item records found for the current search and filters.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((i: GlassItem) => {
                    const itemStatus = i.status || "Pending";
                    const eff = getDguEffectiveQtyAndSqm(i);
                    const finish = getItemFinish(i);

                    return (
                      <tr key={i.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 font-mono text-slate-500 whitespace-nowrap">{i.barcode}</td>
                        <td className="p-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                          {i.serialNumber}
                        </td>
                        <td className="p-3 font-mono font-bold text-purple-700 whitespace-nowrap">
                          {formatBatchNumber(i.batchNo || i.piNumber)}
                        </td>
                        <td className="p-3 text-slate-700">
                          <div className="font-semibold text-slate-900 line-clamp-1">{i.glassType}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            Code: {i.glassCode || i.itemCode || "—"} • Finish: {finish}
                          </div>
                        </td>
                        <td className="p-3 font-mono text-slate-700 whitespace-nowrap">
                          {i.width} × {i.height}
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-blue-700 whitespace-nowrap">
                          {eff.qty} {eff.unitLabel}
                        </td>
                        <td className="p-3 font-mono font-bold text-emerald-700 text-right whitespace-nowrap">
                          {formatAENumber(eff.sqm, 2)} SQM
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-800 text-[10px] font-bold">
                            {i.currentStage}
                          </span>
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          <StatusBadge status={itemStatus} />
                        </td>
                        <td className="p-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {onPrintSticker && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onPrintSticker(i);
                                }}
                                className="w-7 h-7 rounded-full border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400 flex items-center justify-center transition-all shadow-2xs shrink-0 cursor-pointer"
                                title="Print Barcode / QR Sticker"
                              >
                                <Tag className="w-3.5 h-3.5 text-slate-700" />
                              </button>
                            )}
                            {onReject && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onReject(i);
                                }}
                                className="w-7 h-7 rounded-full border border-red-300 bg-white text-red-600 hover:bg-red-50 hover:border-red-400 flex items-center justify-center transition-all shadow-2xs shrink-0 cursor-pointer"
                                title="Reject Item / Report Defect"
                              >
                                <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                              </button>
                            )}
                            {onRework && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRework(i);
                                }}
                                className="w-7 h-7 rounded-full border border-amber-300 bg-white text-amber-600 hover:bg-amber-50 hover:border-amber-400 flex items-center justify-center transition-all shadow-2xs shrink-0 cursor-pointer"
                                title="Send Item to Rework"
                              >
                                <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 3. AUDIT HISTORY TAB */}
        {activeTab === "history" && (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/90 text-slate-600 uppercase border-b border-slate-200 text-[11px] font-extrabold tracking-wider">
                  <th className="p-3">Timestamp (GST)</th>
                  <th className="p-3">User / Operator</th>
                  <th className="p-3">Action Performed</th>
                  <th className="p-3">Item / Batch</th>
                  <th className="p-3 text-center">Module / Stage</th>
                  <th className="p-3 text-center">Status Change</th>
                  <th className="p-3">Activity Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500 font-medium">
                      No audit history log records found.
                    </td>
                  </tr>
                ) : (
                  filteredHistory.map((h: ProductionHistory) => {
                    const actionName =
                      h.action ||
                      (h.status === "Completed"
                        ? "Stage Completed"
                        : h.status === "Rejected"
                        ? "Item Rejected"
                        : h.status === "Reworking"
                        ? "Rework Initiated"
                        : "Activity Logged");

                    const prev = h.prevStatus || "Pending";
                    const next = h.newStatus || h.status || "Completed";

                    return (
                      <tr key={h.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 font-mono text-slate-500 whitespace-nowrap">
                          {formatDubaiDateTime(h.timestamp)}
                        </td>
                        <td className="p-3 font-semibold text-slate-900 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                            <span>{h.user || h.operator || "Operator"}</span>
                          </div>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold inline-flex items-center gap-1 ${
                              actionName.includes("Reject")
                                ? "bg-red-50 text-red-700 border border-red-200"
                                : actionName.includes("Rework")
                                ? "bg-amber-50 text-amber-700 border border-amber-200"
                                : actionName.includes("Upload")
                                ? "bg-purple-50 text-purple-700 border border-purple-200"
                                : actionName.includes("Finished") || actionName.includes("Dispatched")
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                            }`}
                          >
                            {actionName}
                          </span>
                        </td>
                        <td className="p-3 font-mono whitespace-nowrap">
                          {h.itemOrBatch ? (
                            <span className="font-bold text-slate-900">{h.itemOrBatch}</span>
                          ) : h.serialNumber ? (
                            <span className="font-bold text-slate-900">{h.serialNumber}</span>
                          ) : (
                            <span className="font-bold text-purple-700">{formatBatchNumber(h.piNumber) || h.piNumber || "—"}</span>
                          )}
                          {h.piNumber && !h.itemOrBatch?.includes("Batch") && (
                            <span className="text-[10px] text-slate-400 block font-normal">
                              Batch: {formatBatchNumber(h.piNumber)}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-800 text-[10px] font-bold">
                            {h.stage}
                          </span>
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          <div className="inline-flex items-center gap-1 font-mono text-[10px]">
                            <span className="text-slate-500">{prev}</span>
                            <span className="text-slate-400 font-sans">→</span>
                            <span className="font-bold text-indigo-700">{next}</span>
                          </div>
                        </td>
                        <td className="p-3 text-slate-600 text-xs">{h.remarks || "—"}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 4. REJECTS LOG TAB */}
        {activeTab === "rejects" && (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/90 text-slate-600 uppercase border-b border-slate-200 text-[11px] font-extrabold tracking-wider">
                  <th className="p-3">Date & Time (GST)</th>
                  <th className="p-3">Serial Number</th>
                  <th className="p-3">Batch / PI Number</th>
                  <th className="p-3 text-center">Defect Stage</th>
                  <th className="p-3">Defect Reason</th>
                  <th className="p-3">Operator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {filteredRejects.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500 font-medium">
                      No glass rejects recorded in current filter.
                    </td>
                  </tr>
                ) : (
                  filteredRejects.map((r: RejectRecord) => (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 font-mono text-slate-500 whitespace-nowrap">
                        {formatDubaiDateTime(r.date)}
                      </td>
                      <td className="p-3 font-mono font-bold text-red-600 whitespace-nowrap">
                        {r.serialNumber}
                      </td>
                      <td className="p-3 font-mono font-bold text-purple-700 whitespace-nowrap">
                        {formatBatchNumber(r.piNumber) || r.piNumber || "—"}
                      </td>
                      <td className="p-3 text-center whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-red-50 border border-red-200 text-red-700 text-[10px] font-bold">
                          {r.stage}
                        </span>
                      </td>
                      <td className="p-3 text-red-700 font-bold">{r.reason}</td>
                      <td className="p-3 text-slate-700 font-semibold whitespace-nowrap">
                        {r.operator || "Operator"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 5. REWORKS LOG TAB */}
        {activeTab === "reworks" && (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/90 text-slate-600 uppercase border-b border-slate-200 text-[11px] font-extrabold tracking-wider">
                  <th className="p-3">Date & Time (GST)</th>
                  <th className="p-3">Serial Number</th>
                  <th className="p-3 text-center">Rework Route</th>
                  <th className="p-3">Rework Reason</th>
                  <th className="p-3">Operator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {filteredReworks.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500 font-medium">
                      No glass reworks recorded in current filter.
                    </td>
                  </tr>
                ) : (
                  filteredReworks.map((rw: ReworkRecord) => (
                    <tr key={rw.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 font-mono text-slate-500 whitespace-nowrap">
                        {formatDubaiDateTime(rw.date)}
                      </td>
                      <td className="p-3 font-mono font-bold text-amber-600 whitespace-nowrap">
                        {rw.serialNumber}
                      </td>
                      <td className="p-3 text-center whitespace-nowrap">
                        <span className="font-semibold text-slate-700">{rw.fromStage}</span>
                        <span className="mx-1.5 text-slate-400">→</span>
                        <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold">
                          {rw.targetStage}
                        </span>
                      </td>
                      <td className="p-3 text-amber-800 font-bold">{rw.reason}</td>
                      <td className="p-3 text-slate-700 font-semibold whitespace-nowrap">
                        {rw.operator || "Operator"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
