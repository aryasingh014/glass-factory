import React, { useState, useEffect, useMemo } from "react";
import {
  Activity,
  BarChart3,
  TrendingUp,
  AlertTriangle,
  Users,
  CheckCircle2,
  Clock,
  Download,
  RefreshCw,
  Layers,
  Zap,
  ShieldCheck,
  FileSpreadsheet,
  AlertCircle,
  RotateCcw,
  Search,
  Truck,
  ArrowUpRight,
  ArrowLeft,
  TrendingDown,
  Sparkles,
  Gauge,
  Factory,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  ExternalLink,
  Bot,
  UserCheck,
  Eye,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  PerformanceAnalyticsData,
  StageAnalytics,
  DefectAnalytics,
  OperatorAnalytics,
  ProductionTrendPoint,
  PIFulfillmentAnalytics,
  ProductTypeBreakdown,
  BottleneckInfo,
} from "@shared/api";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatAENumber, formatBatchNumber } from "@/lib/utils";

const PRODUCT_COLORS = ["#6366f1", "#06b6d4", "#10b981", "#f59e0b"];
const DEFECT_COLORS = ["#ef4444", "#f97316", "#f59e0b", "#8b5cf6", "#06b6d4", "#64748b"];

export const PerformanceAnalyticsView: React.FC<{ onNavigateTab?: (tab: string) => void }> = ({ onNavigateTab }) => {
  const [data, setData] = useState<PerformanceAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [lastSyncedTime, setLastSyncedTime] = useState<Date>(new Date());

  // Leaderboard interactive states
  const [leaderboardTab, setLeaderboardTab] = useState<"all" | "stations" | "operators">("all");
  const [leaderboardSearch, setLeaderboardSearch] = useState("");
  const [leaderboardSortField, setLeaderboardSortField] = useState<"name" | "operations" | "completed" | "rejects" | "quality">("operations");
  const [leaderboardSortOrder, setLeaderboardSortOrder] = useState<"asc" | "desc">("desc");

  // Inspection Modal state
  const [inspectTarget, setInspectTarget] = useState<any | null>(null);
  const [inspectLogs, setInspectLogs] = useState<any[]>([]);
  const [loadingInspectLogs, setLoadingInspectLogs] = useState(false);
  const [inspectLogsSearch, setInspectLogsSearch] = useState("");

  useEffect(() => {
    if (!inspectTarget) {
      setInspectLogs([]);
      return;
    }
    let isMounted = true;
    const fetchTargetLogs = async () => {
      setLoadingInspectLogs(true);
      try {
        const res = await fetch("/api/reports?page=1" + String.fromCharCode(38) + "limit=250");
        if (res.ok && isMounted) {
          const json = await res.json();
          const allLogs = json.history?.data || json.history || [];
          const filtered = allLogs.filter((h: any) => {
            if (inspectTarget.type === "station") {
              return (h.stage || "").toLowerCase() === (inspectTarget.stageCategory || "").toLowerCase();
            } else {
              return (h.user || h.operator || "").toLowerCase() === (inspectTarget.name || "").toLowerCase();
            }
          });
          setInspectLogs(filtered);
        }
      } catch (e) {
        console.error("Error loading logs", e);
      } finally {
        if (isMounted) setLoadingInspectLogs(false);
      }
    };
    fetchTargetLogs();
    return () => {
      isMounted = false;
    };
  }, [inspectTarget]);

  const fetchAnalytics = async (showLoadingState = false) => {
    if (showLoadingState) {
      setLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const res = await fetch(`/api/analytics/performance`);
      if (!res.ok) throw new Error("Failed to load analytics data");
      const json: PerformanceAnalyticsData = await res.json();
      setData(json);
      setLastSyncedTime(new Date());
    } catch (err: any) {
      toast.error(err.message || "Error fetching performance analytics");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  // Initial Load
  useEffect(() => {
    fetchAnalytics(true);
  }, []);

  // Real-time Background Auto-Sync (60 seconds fallback)
  useEffect(() => {
    if (!autoSync) return;
    const interval = setInterval(() => {
      fetchAnalytics(false);
    }, 60000);
    return () => clearInterval(interval);
  }, [autoSync]);

  const exportAnalyticsToExcel = () => {
    if (!data) return;

    const wb = XLSX.utils.book_new();
    const dateStr = new Date().toISOString().split("T")[0];

    // 1. Summary Sheet
    const summarySheet = XLSX.utils.json_to_sheet([
      { Metric: "OEE (Overall Equipment Effectiveness)", Value: `${data.summary.oee}%` },
      { Metric: "Availability Rating", Value: `${data.summary.availability}%` },
      { Metric: "Performance Rating", Value: `${data.summary.performance}%` },
      { Metric: "First-Pass Quality Rate", Value: `${data.summary.qualityRate}%` },
      { Metric: "Total Glass Volume Processed", Value: `${data.summary.totalVolumeSqm} SQM` },
      { Metric: "Completed Glass Volume", Value: `${data.summary.completedSqm} SQM` },
      { Metric: "In-Progress Volume", Value: `${data.summary.inProgressSqm} SQM` },
      { Metric: "Total Glass Units", Value: data.summary.totalGlassItems },
      { Metric: "Completed Units", Value: data.summary.completedGlassItems },
      { Metric: "In-Progress Units", Value: data.summary.inProgressGlassItems },
      { Metric: "Quality Reject Rate", Value: `${data.summary.rejectRate}%` },
      { Metric: "Rework Rate", Value: `${data.summary.reworkRate}%` },
      { Metric: "Average Turnaround Time", Value: `${data.summary.avgTurnaroundHours} Hours` },
      { Metric: "Active Bottleneck Stage", Value: data.summary.bottleneckStage },
      { Metric: "On-Time Delivery Rate", Value: `${data.summary.onTimeDeliveryRate}%` },
      { Metric: "Total Batches / PIs", Value: data.summary.totalPIs },
      { Metric: "Active Batches / PIs", Value: data.summary.activePIs },
    ]);
    summarySheet["!cols"] = [{ wch: 35 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, summarySheet, "Executive Summary");

    // 2. Stage Sheet
    const stageSheet = XLSX.utils.json_to_sheet(
      data.stages.map((s) => ({
        "Workstation Stage": s.stage,
        "Pending Units": s.pendingCount,
        "Pending Volume (SQM)": s.pendingSqm,
        "Completed Units": s.completedCount,
        "Completed Volume (SQM)": s.completedSqm,
        "Throughput Units": s.throughputRate,
        "Avg Cycle Time (Mins)": s.avgCycleTimeMinutes,
        "Capacity Utilization": `${s.capacityUtilization}%`,
      }))
    );
    stageSheet["!cols"] = [{ wch: 20 }, { wch: 15 }, { wch: 22 }, { wch: 16 }, { wch: 22 }, { wch: 16 }, { wch: 22 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, stageSheet, "Stage Performance");

    // 3. Bottleneck Analysis Sheet
    if (data.bottlenecks && data.bottlenecks.length > 0) {
      const bottleneckSheet = XLSX.utils.json_to_sheet(
        data.bottlenecks.map((b) => ({
          "Workstation Stage": b.stage,
          "Pending Units in Queue": b.pendingUnits,
          "Pending Volume (SQM)": b.pendingSqm,
          "Risk Level": b.riskLevel,
          "Estimated Wait (Hours)": b.avgWaitHours,
          "Operational Diagnosis": b.bottleneckReason,
        }))
      );
      bottleneckSheet["!cols"] = [{ wch: 20 }, { wch: 22 }, { wch: 22 }, { wch: 14 }, { wch: 22 }, { wch: 45 }];
      XLSX.utils.book_append_sheet(wb, bottleneckSheet, "Bottleneck Analysis");
    }

    // 4. Product Type Sheet
    if (data.productTypeBreakdown && data.productTypeBreakdown.length > 0) {
      const productSheet = XLSX.utils.json_to_sheet(
        data.productTypeBreakdown.map((p) => ({
          "Product Category": p.type,
          "Total Units": p.count,
          "Total Volume (SQM)": p.sqm,
          "Completed Units": p.completedCount,
          "Pending Units": p.pendingCount,
        }))
      );
      productSheet["!cols"] = [{ wch: 22 }, { wch: 14 }, { wch: 20 }, { wch: 16 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, productSheet, "Product Breakdown");
    }

    // 5. Defects Sheet
    const defectSheet = XLSX.utils.json_to_sheet(
      data.defects.map((d) => ({
        "Defect Reason": d.reason,
        "Incident Count": d.count,
        "Pareto Percentage": `${d.percentage}%`,
        "Attributed Stage": d.stage,
      }))
    );
    defectSheet["!cols"] = [{ wch: 30 }, { wch: 16 }, { wch: 18 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, defectSheet, "Defects & Rejects");

    // 6. Operators Sheet
    const operatorSheet = XLSX.utils.json_to_sheet(
      data.operators.map((o) => ({
        "Operator Name": o.operator,
        "Total Operations": o.operationsCount,
        "Completed Items": o.completedCount,
        "Rejects Recorded": o.rejectCount,
        "Quality Efficiency Rate": `${o.qualityRate}%`,
      }))
    );
    operatorSheet["!cols"] = [{ wch: 24 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, operatorSheet, "Operator Efficiency");

    // 7. PI Fulfillment Sheet
    const piSheet = XLSX.utils.json_to_sheet(
      data.piFulfillment.map((pi) => ({
        "Batch / PI Number": pi.piNumber,
        "Customer Name": pi.customerName,
        "Project Name": pi.projectName,
        "Total Units": pi.totalItems,
        "Completed Units": pi.completedItems,
        "Total SQM": pi.totalSqm,
        "Completed SQM": pi.completedSqm,
        "Fulfillment %": `${pi.completionPercentage}%`,
        Status: pi.status,
        "Projected Finish": pi.projectedFinishDate,
      }))
    );
    piSheet["!cols"] = [{ wch: 18 }, { wch: 25 }, { wch: 25 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 15 }, { wch: 14 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, piSheet, "Batch Fulfillment");

    XLSX.writeFile(wb, `Sejal_Glass_Enterprise_Performance_Analytics_${dateStr}.xlsx`);
    toast.success("Enterprise Performance Analytics exported to Excel");
  };

  const handleSort = (field: "name" | "operations" | "completed" | "rejects" | "quality") => {
    if (leaderboardSortField === field) {
      setLeaderboardSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setLeaderboardSortField(field);
      setLeaderboardSortOrder("desc");
    }
  };

  const { allRows, counts } = useMemo(() => {
    if (!data) return { allRows: [], counts: { all: 0, stations: 0, operators: 0 } };

    const stationRows = (data.stages || []).map((s) => {
      const ops = (s.completedCount || 0) + (s.pendingCount || 0);
      const rej = s.rejectedCount || 0;
      const comp = s.completedCount || 0;
      const quality = s.qualityYield ?? (ops > 0 ? parseFloat(((comp / (comp + rej)) * 100).toFixed(1)) : 100);
      const stageName = s.stage;
      let displayName = `${stageName} Workstation`;
      if (stageName === "DGU") displayName = "DGU / IGU Assembly Line";
      else if (stageName === "Pairing") displayName = "Pairing & Staging Buffer";
      else if (stageName === "Finished") displayName = "Quality Inspection & Final Gate";
      else if (stageName === "Cutting") displayName = "CNC Glass Cutting Table";
      else if (stageName === "Lamination") displayName = "Lamination & EVA/PVB Autoclave";

      return {
        id: `station-${s.stage}`,
        name: s.stage,
        displayName,
        type: "station" as const,
        stageCategory: s.stage,
        operationsCount: ops,
        completedCount: comp,
        rejectCount: rej,
        qualityRate: quality,
        pendingCount: s.pendingCount || 0,
        throughputRate: s.throughputRate,
        avgCycleTime: s.avgCycleTimeMinutes,
        sqm: s.completedSqm || 0,
        status: (s.completedCount > 0 || s.pendingCount > 0) ? "Active Line" : "Standby",
      };
    });

    const operatorRows = (data.operators || []).map((op) => {
      const isEngine = op.operator.toLowerCase().includes("engine") || op.operator.toLowerCase().includes("auto");
      const isAdmin = op.operator.toLowerCase().includes("admin");
      return {
        id: `op-${op.operator}`,
        name: op.operator,
        displayName: op.operator,
        type: (isEngine ? "system" : "operator") as "operator" | "system",
        stageCategory: "",
        operationsCount: op.operationsCount,
        completedCount: op.completedCount,
        rejectCount: op.rejectCount,
        qualityRate: op.qualityRate,
        pendingCount: 0,
        throughputRate: op.completedCount,
        avgCycleTime: 0,
        sqm: 0,
        status: isEngine ? "Automation System" : isAdmin ? "Plant Admin" : "Floor Operator",
      };
    });

    const totalStations = stationRows.length;
    const totalOps = operatorRows.length;
    const totalAll = totalStations + totalOps;

    let selectedList = [];
    if (leaderboardTab === "all") {
      selectedList = [...stationRows, ...operatorRows];
    } else if (leaderboardTab === "stations") {
      selectedList = stationRows;
    } else {
      selectedList = operatorRows;
    }

    if (leaderboardSearch.trim()) {
      const q = leaderboardSearch.toLowerCase().trim();
      selectedList = selectedList.filter(
        (r) =>
          r.displayName.toLowerCase().includes(q) ||
          r.status.toLowerCase().includes(q) ||
          r.type.toLowerCase().includes(q)
      );
    }

    selectedList.sort((a, b) => {
      let cmp = 0;
      if (leaderboardSortField === "name") {
        cmp = a.displayName.localeCompare(b.displayName);
      } else if (leaderboardSortField === "operations") {
        cmp = a.operationsCount - b.operationsCount;
      } else if (leaderboardSortField === "completed") {
        cmp = a.completedCount - b.completedCount;
      } else if (leaderboardSortField === "rejects") {
        cmp = a.rejectCount - b.rejectCount;
      } else if (leaderboardSortField === "quality") {
        cmp = a.qualityRate - b.qualityRate;
      }
      return leaderboardSortOrder === "asc" ? cmp : -cmp;
    });

    return {
      allRows: selectedList,
      counts: {
        all: totalAll,
        stations: totalStations,
        operators: totalOps,
      },
    };
  }, [data, leaderboardTab, leaderboardSearch, leaderboardSortField, leaderboardSortOrder]);

  const exportLeaderboardExcel = () => {
    if (!allRows.length) return;
    const wb = XLSX.utils.book_new();
    const sheetData = allRows.map((r, i) => ({
      Rank: i + 1,
      "Operator / Workstation": r.displayName,
      Type: r.type === "station" ? "Workstation" : r.type === "system" ? "Automated Engine" : "Floor Staff",
      "Total Operations": r.operationsCount,
      "Completed Units": r.completedCount,
      "Scrap Rejections": r.rejectCount,
      "Quality Score (%)": `${r.qualityRate}%`,
      Classification: r.status,
    }));
    const ws = XLSX.utils.json_to_sheet(sheetData);
    ws["!cols"] = [{ wch: 8 }, { wch: 34 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, ws, "Leaderboard");
    XLSX.writeFile(wb, `Leaderboard_Efficiency_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast.success("Leaderboard efficiency data exported!");
  };

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shadow-lg">
          <Activity className="w-7 h-7 animate-spin" />
        </div>
        <div className="text-center">
          <h3 className="text-sm font-black text-slate-900">Calculating Enterprise Factory Analytics...</h3>
          <p className="text-xs text-slate-500 mt-0.5">Aggregating live OEE, stage throughput, bottleneck alerts, and quality KPIs</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center text-red-500 font-bold bg-white rounded-3xl border border-red-200">
        Failed to load performance analytics. Please refresh.
      </div>
    );
  }

  const { summary, stages, defects, operators, dailyTrends, productTypeBreakdown = [], bottlenecks = [] } = data;

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white border border-slate-200/90 p-5 rounded-2xl shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-blue-500 to-blue-700 flex items-center justify-center text-white shadow-lg shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Executive Performance Analytics</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-200">
                Plant KPIs &amp; Yield Rate
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Comprehensive operational analytics, yield metrics, scrap analysis, and stage progression rates.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {onNavigateTab && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onNavigateTab("overview")}
              className="border-slate-300 text-slate-700 bg-white hover:bg-slate-100 font-bold text-xs gap-1.5 h-8 px-3 rounded-xl shadow-xs cursor-pointer"
              title="Return to Main Dashboard"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
              <span>Back to Dashboard</span>
            </Button>
          )}
          {/* Auto-Sync Toggle */}
          <button
            type="button"
            onClick={() => setAutoSync(!autoSync)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 cursor-pointer ${
              autoSync
                ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
            }`}
            title={autoSync ? "Live auto-sync every 10s is ON" : "Live auto-sync is paused"}
          >
            <Zap className={`w-3.5 h-3.5 ${autoSync ? "text-indigo-600" : "text-slate-400"}`} />
            <span>Auto-Sync {autoSync ? "ON (10s)" : "PAUSED"}</span>
          </button>

          {/* Export Excel Button */}
          <Button
            type="button"
            onClick={exportAnalyticsToExcel}
            size="sm"
            className="bg-gradient-to-r from-emerald-500 to-emerald-700 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 h-8 px-3.5 rounded-xl shadow-2xs cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export Analytics Report (.xlsx)</span>
          </Button>
        </div>
      </div>

      {/* ── ENTERPRISE EXECUTIVE KPI CARDS (ROW 1) ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* 1. OEE Efficiency */}
        <div className="bg-white p-4 rounded-2xl border border-slate-300 shadow-2xs relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-extrabold uppercase tracking-wider">
            <span>Overall OEE</span>
            <Gauge className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-indigo-600">{summary.oee}%</span>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
              {summary.qualityRate}% Quality
            </span>
          </div>
          <div className="mt-2 text-[10px] text-slate-500 flex justify-between">
            <span>Avail: {summary.availability}%</span>
            <span>Perf: {summary.performance}%</span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-500 to-indigo-700 h-full rounded-full" style={{ width: `${Math.min(100, summary.oee)}%` }} />
          </div>
        </div>

        {/* 2. Total Volume Processed */}
        <div className="bg-white p-4 rounded-2xl border border-slate-300 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-extrabold uppercase tracking-wider">
            <span>Total Volume</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-emerald-700 font-mono">
              {formatAENumber(summary.totalVolumeSqm, 1)}
            </span>
            <span className="text-[10px] font-extrabold text-emerald-800">SQM</span>
          </div>
          <div className="mt-2 text-[10px] text-slate-500">
            {formatAENumber(summary.completedSqm, 1)} SQM Finished ({formatAENumber(summary.inProgressSqm, 1)} WIP)
          </div>
        </div>

        {/* 3. Completed vs Pending Units */}
        <div className="bg-white p-4 rounded-2xl border border-slate-300 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-extrabold uppercase tracking-wider">
            <span>Units Completed</span>
            <CheckCircle2 className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{summary.completedGlassItems}</span>
            <span className="text-[10px] font-bold text-slate-500">
              / {summary.totalGlassItems} Total
            </span>
          </div>
          <div className="mt-2 text-[10px] text-slate-500 flex justify-between">
            <span className="text-amber-600 font-bold">{summary.inProgressGlassItems} Pending WIP</span>
            <span className="text-blue-600 font-bold">{summary.performance}% Done</span>
          </div>
        </div>

        {/* 4. Production Turnaround Time */}
        <div className="bg-white p-4 rounded-2xl border border-slate-300 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-extrabold uppercase tracking-wider">
            <span>Avg Lead Time</span>
            <Clock className="w-4 h-4 text-purple-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-purple-700 font-mono">
              {summary.avgTurnaroundHours}
            </span>
            <span className="text-[10px] font-extrabold text-purple-800">HOURS</span>
          </div>
          <div className="mt-2 text-[10px] text-slate-500">
            Cut-to-Dispatch turnaround velocity
          </div>
        </div>

        {/* 5. Quality Rejection Rate */}
        <div className="bg-white p-4 rounded-2xl border border-slate-300 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-extrabold uppercase tracking-wider">
            <span>Defect Rate</span>
            <AlertCircle className="w-4 h-4 text-red-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-red-600">{summary.rejectRate}%</span>
            <span className="text-[10px] font-bold text-red-700 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
              {summary.reworkRate}% Rework
            </span>
          </div>
          <div className="mt-2 text-[10px] text-slate-500">
            Target benchmark: &lt; 2.5%
          </div>
        </div>

        {/* 6. Active Bottleneck Alert */}
        <div className="bg-white p-4 rounded-2xl border border-slate-300 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-extrabold uppercase tracking-wider">
            <span>Bottleneck Stage</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-lg font-black text-amber-700 truncate">
              {summary.bottleneckStage}
            </span>
          </div>
          <div className="mt-2 text-[10px] text-slate-500">
            Delivery Rate: {summary.onTimeDeliveryRate}% On-Time
          </div>
        </div>
      </div>

      {/* ── BOTTLENECK IDENTIFICATION & WORKSTATION PACING BANNER ── */}
      {bottlenecks.length > 0 && (
        <div className="bg-white p-4 rounded-2xl border border-slate-300 shadow-2xs">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-3.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
                  Workstation Bottleneck & Capacity Diagnostics
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  Live queue pacing, risk levels, and backlog accumulation across factory workstations.
                </p>
              </div>
            </div>
            <div className="text-xs text-slate-600 font-mono bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-300 shrink-0">
              Live Stage Diagnostics: <span className="font-bold text-slate-800">{stages.length} stages active</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {bottlenecks.map((b) => {
              const badgeClass =
                b.riskLevel === "High"
                  ? "bg-rose-50 text-rose-700 border-rose-200"
                  : b.riskLevel === "Medium"
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200";

              return (
                <div key={b.stage} className="bg-slate-50/70 hover:bg-white p-3.5 rounded-xl border border-slate-300 transition-all hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-slate-800">{b.stage} Stage</span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${badgeClass}`}>
                      {b.riskLevel} Risk
                    </span>
                  </div>
                  <div className="mt-2.5 flex items-baseline justify-between">
                    <span className="text-lg font-black text-blue-900">{b.pendingUnits} Units</span>
                    <span className="text-xs font-mono font-semibold text-slate-500">{b.pendingSqm} SQM</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1.5 leading-snug line-clamp-2">{b.bottleneckReason}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── CHARTS SECTION 1: PRODUCTION TRENDS & PRODUCT TYPE BREAKDOWN ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Daily Production Volume Trends */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-300 shadow-2xs">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-600" />
                Production Velocity & Throughput Trends
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Daily completed units and glass volume (SQM) over the selected timeline.
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-bold">
              <span className="flex items-center gap-1.5 text-indigo-600">
                <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-indigo-500 to-indigo-700" /> Completed Units
              </span>
              <span className="flex items-center gap-1.5 text-emerald-600">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Volume (SQM)
              </span>
            </div>
          </div>

          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyTrends}>
                <defs>
                  <linearGradient id="itemsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="sqmGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: "10px",
                    color: "#fff",
                    fontSize: "12px",
                    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.4)",
                  }}
                  itemStyle={{ color: "#ffffff", fontWeight: "600" }}
                  labelStyle={{ color: "#94a3b8", fontWeight: "600" }}
                />
                <Area yAxisId="left" type="monotone" dataKey="itemsCompleted" stroke="#6366f1" strokeWidth={2.5} fill="url(#itemsGrad)" name="Completed Units" />
                <Area yAxisId="right" type="monotone" dataKey="sqmCompleted" stroke="#10b981" strokeWidth={2.5} fill="url(#sqmGrad)" name="Volume (SQM)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Product Type Breakdown */}
        <div className="bg-white p-5 rounded-2xl border border-slate-300 shadow-2xs">
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 mb-1">
            <Layers className="w-4 h-4 text-indigo-600" />
            Product & Glass Category Distribution
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            Volume breakdown across DLGU, DGU, Laminated, and Single units.
          </p>

          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={productTypeBreakdown}
                  dataKey="count"
                  nameKey="type"
                  cx="50%"
                  cy="50%"
                  outerRadius={75}
                  innerRadius={45}
                  paddingAngle={3}
                >
                  {productTypeBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PRODUCT_COLORS[index % PRODUCT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: "10px",
                    color: "#fff",
                    fontSize: "12px",
                    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.4)",
                  }}
                  itemStyle={{ color: "#ffffff", fontWeight: "600" }}
                  labelStyle={{ color: "#94a3b8", fontWeight: "600" }}
                  formatter={(value: any, name: any, item: any) => {
                    const payload = item?.payload;
                    return [`${value} units (${payload?.sqm || 0} SQM)`, `${name}`];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-1.5 mt-2">
            {productTypeBreakdown.map((p, idx) => (
              <div key={p.type} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PRODUCT_COLORS[idx % PRODUCT_COLORS.length] }} />
                  <span className="font-semibold text-slate-800">{p.type}</span>
                </div>
                <div className="font-mono text-slate-600 font-bold">
                  {p.count} units ({p.sqm} SQM)
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── CHARTS SECTION 2: WORKSTATION THROUGHPUT & DEFECT PARETO ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Stage-wise Performance Bar Chart */}
        <div className="bg-white p-5 rounded-2xl border border-slate-300 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-600" />
                Workstation Queue Load vs Completed Throughput
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Pending units currently in buffer vs units successfully completed.
              </p>
            </div>
          </div>

          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stages}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="stage" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: "10px",
                    color: "#fff",
                    fontSize: "12px",
                    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.4)",
                  }}
                  itemStyle={{ color: "#ffffff", fontWeight: "600" }}
                  labelStyle={{ color: "#94a3b8", fontWeight: "600" }}
                />
                <Legend wrapperStyle={{ fontSize: "11px", fontWeight: "bold" }} />
                <Bar dataKey="pendingCount" name="Pending Queue (Units)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="completedCount" name="Completed Throughput" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Quality Defect Pareto Analysis */}
        <div className="bg-white p-5 rounded-2xl border border-slate-300 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600" />
                Defect & Reject Root Cause Analysis (Pareto)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Most frequent defect reasons attributed during cutting, tempering, or assembly.
              </p>
            </div>
          </div>

          {defects.length === 0 ? (
            <div className="h-[260px] flex flex-col items-center justify-center text-slate-400">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-2" />
              <span className="text-xs font-bold text-slate-700">Zero Defects Recorded</span>
              <span className="text-[11px] text-slate-400">All scanned glass pieces meet 100% quality pass standards.</span>
            </div>
          ) : (
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={defects.slice(0, 6)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} />
                  <YAxis type="category" dataKey="reason" width={110} tick={{ fontSize: 10, fill: "#334155", fontWeight: "bold" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      border: "1px solid #334155",
                      borderRadius: "10px",
                      color: "#fff",
                      fontSize: "12px",
                      boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.4)",
                    }}
                    itemStyle={{ color: "#ffffff", fontWeight: "600" }}
                    labelStyle={{ color: "#94a3b8", fontWeight: "600" }}
                  />
                  <Bar dataKey="count" name="Incidents" fill="#ef4444" radius={[0, 4, 4, 0]}>
                    {defects.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={DEFECT_COLORS[index % DEFECT_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

            {/* ── SECTION 3: WORKSTATION & OPERATOR EFFICIENCY LEADERBOARD ── */}
      <div className="w-full bg-white p-5 rounded-2xl border border-slate-300 shadow-2xs">
        {/* Card Header & Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                  Workstation & Operator Efficiency Leaderboard
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Scan volume throughput, completed items, rejects, and quality efficiency rating across factory workstations and staff.
                </p>
              </div>
            </div>
          </div>

          {/* Controls: Tabs, Search, Export */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Tab Pills */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setLeaderboardTab("all")}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  leaderboardTab === "all"
                    ? "bg-white text-indigo-700 shadow-xs font-black"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                All ({counts.all})
              </button>
              <button
                type="button"
                onClick={() => setLeaderboardTab("stations")}
                className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                  leaderboardTab === "stations"
                    ? "bg-white text-indigo-700 shadow-xs font-black"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Factory className="w-3 h-3 text-slate-500" />
                Workstations ({counts.stations})
              </button>
              <button
                type="button"
                onClick={() => setLeaderboardTab("operators")}
                className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                  leaderboardTab === "operators"
                    ? "bg-white text-indigo-700 shadow-xs font-black"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <UserCheck className="w-3 h-3 text-slate-500" />
                Operators ({counts.operators})
              </button>
            </div>

            {/* Quick Search */}
            <div className="relative w-44 sm:w-56">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={leaderboardSearch}
                onChange={(e) => setLeaderboardSearch(e.target.value)}
                placeholder="Search station or operator..."
                className="w-full text-xs pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
              />
            </div>

            {/* Export Leaderboard */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={exportLeaderboardExcel}
              className="border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs gap-1.5 h-8 px-3 rounded-xl shadow-2xs cursor-pointer"
              title="Export leaderboard to Excel"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export</span>
            </Button>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 uppercase border-b border-slate-300 text-[10px] font-extrabold tracking-wider">
                <th className="py-2.5 px-3 w-12 text-center">#</th>
                <th
                  onClick={() => handleSort("name")}
                  className="py-2.5 px-3 cursor-pointer hover:bg-slate-100 select-none transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Operator / Station</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-2.5 px-3">Classification</th>
                <th
                  onClick={() => handleSort("operations")}
                  className="py-2.5 px-3 text-center cursor-pointer hover:bg-slate-100 select-none transition-colors"
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span>Operations</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("completed")}
                  className="py-2.5 px-3 text-center cursor-pointer hover:bg-slate-100 select-none transition-colors"
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span>Completed</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("rejects")}
                  className="py-2.5 px-3 text-center cursor-pointer hover:bg-slate-100 select-none transition-colors"
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span>Rejects</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("quality")}
                  className="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-100 select-none transition-colors"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Quality Score</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-2.5 px-3 text-center w-24">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {allRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 font-medium">
                    No matching workstations or operators found.
                  </td>
                </tr>
              ) : (
                allRows.map((row, idx) => (
                  <tr
                    key={row.id}
                    onClick={() => setInspectTarget(row)}
                    className="hover:bg-indigo-50/40 cursor-pointer transition-colors group"
                  >
                    <td className="py-3 px-3 text-center">
                      <span className="w-5 h-5 rounded-full bg-slate-100 group-hover:bg-indigo-100 group-hover:text-indigo-700 text-slate-600 text-[10px] font-bold inline-flex items-center justify-center transition-colors">
                        {idx + 1}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-bold text-slate-900">
                      <div className="flex items-center gap-2.5">
                        {row.type === "station" ? (
                          <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center shrink-0 shadow-2xs">
                            <Factory className="w-3.5 h-3.5" />
                          </div>
                        ) : row.type === "system" ? (
                          <div className="w-7 h-7 rounded-lg bg-purple-50 border border-purple-200 text-purple-700 flex items-center justify-center shrink-0 shadow-2xs">
                            <Bot className="w-3.5 h-3.5" />
                          </div>
                        ) : (
                          <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center shrink-0 shadow-2xs">
                            <Users className="w-3.5 h-3.5" />
                          </div>
                        )}
                        <div>
                          <div className="font-extrabold text-slate-900 group-hover:text-indigo-700 transition-colors">
                            {row.displayName}
                          </div>
                          {row.type === "station" && row.pendingCount > 0 && (
                            <div className="text-[10px] font-semibold text-amber-600 flex items-center gap-1 mt-0.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                              {row.pendingCount} units in queue ({row.avgCycleTime}m pace)
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black border inline-flex items-center gap-1 ${
                          row.type === "station"
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : row.type === "system"
                            ? "bg-purple-50 text-purple-700 border-purple-200"
                            : "bg-slate-100 text-slate-700 border-slate-200"
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-bold text-slate-800 text-sm">
                      {row.operationsCount.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-bold text-emerald-600 text-sm">
                      {row.completedCount.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-bold text-sm">
                      {row.rejectCount > 0 ? (
                        <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                          {row.rejectCount}
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span
                        className={`px-2.5 py-1 rounded font-mono font-extrabold text-xs border inline-flex items-center gap-1 ${
                          row.qualityRate >= 98
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : row.qualityRate >= 90
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                        }`}
                      >
                        {row.qualityRate}%
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectTarget(row);
                        }}
                        className="h-7 px-2.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-100/70 rounded-lg gap-1 cursor-pointer"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Inspect</span>
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── INSPECTION DETAIL DIALOG ── */}
      <Dialog open={!!inspectTarget} onOpenChange={(open) => !open && setInspectTarget(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto p-6 bg-white rounded-2xl border border-slate-300 shadow-xl">
          {inspectTarget && (
            <div className="space-y-5">
              <DialogHeader>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center font-bold shadow-2xs">
                      {inspectTarget.type === "station" ? (
                        <Factory className="w-5 h-5" />
                      ) : inspectTarget.type === "system" ? (
                        <Bot className="w-5 h-5" />
                      ) : (
                        <Users className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <DialogTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
                        {inspectTarget.displayName}
                        <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {inspectTarget.status}
                        </span>
                      </DialogTitle>
                      <DialogDescription className="text-xs text-slate-500 mt-0.5">
                        Performance analytics, live queue diagnostics, and recent operation scan history.
                      </DialogDescription>
                    </div>
                  </div>

                  {inspectTarget.type === "station" && onNavigateTab && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        const tab = inspectTarget.stageCategory?.toLowerCase();
                        onNavigateTab(tab === "finished" ? "dispatch" : tab || "production");
                        setInspectTarget(null);
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs gap-1.5 h-8 px-3 rounded-xl shadow-xs cursor-pointer"
                    >
                      <span>Go to Station</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </DialogHeader>

              {/* KPI Cards for Target */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Total Scans</div>
                  <div className="text-xl font-black text-slate-900 mt-1 font-mono">{inspectTarget.operationsCount}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Scanned operations</div>
                </div>

                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                  <div className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Completed</div>
                  <div className="text-xl font-black text-emerald-600 mt-1 font-mono">{inspectTarget.completedCount}</div>
                  <div className="text-[10px] text-emerald-700/80 mt-0.5">Successfully finished</div>
                </div>

                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                  <div className="text-[10px] font-black uppercase tracking-wider text-rose-500">Defects / Rejects</div>
                  <div className="text-xl font-black text-rose-600 mt-1 font-mono">{inspectTarget.rejectCount}</div>
                  <div className="text-[10px] text-rose-700/80 mt-0.5">Quality rejections</div>
                </div>

                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                  <div className="text-[10px] font-black uppercase tracking-wider text-indigo-600">Quality Score</div>
                  <div className="text-xl font-black text-indigo-700 mt-1 font-mono">{inspectTarget.qualityRate}%</div>
                  <div className="text-[10px] text-indigo-700/80 mt-0.5">Pass rate yield</div>
                </div>
              </div>

              {/* Station Specific Stats (if applicable) */}
              {inspectTarget.type === "station" && (
                <div className="bg-indigo-50/50 border border-indigo-100 p-3 rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-4">
                    <div>
                      <span className="text-slate-500 font-semibold">Queue In-Buffer:</span>{" "}
                      <span className="font-black text-indigo-900">{inspectTarget.pendingCount} units</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-semibold">Pacing Benchmark:</span>{" "}
                      <span className="font-black text-indigo-900">{inspectTarget.avgCycleTime} min/unit</span>
                    </div>
                    {inspectTarget.sqm > 0 && (
                      <div>
                        <span className="text-slate-500 font-semibold">Processed SQM:</span>{" "}
                        <span className="font-black text-emerald-700">{inspectTarget.sqm} SQM</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Recent Scan History */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-indigo-600" />
                    Recent Activity & Scans ({inspectLogs.length})
                  </h4>
                  <div className="w-48">
                    <input
                      type="text"
                      value={inspectLogsSearch}
                      onChange={(e) => setInspectLogsSearch(e.target.value)}
                      placeholder="Filter serial or barcode..."
                      className="w-full text-[11px] px-2.5 py-1 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-600 text-[10px] font-extrabold uppercase sticky top-0">
                      <tr>
                        <th className="py-2 px-3">Time</th>
                        <th className="py-2 px-3">Serial No</th>
                        <th className="py-2 px-3">Barcode</th>
                        <th className="py-2 px-3">Batch / PI</th>
                        <th className="py-2 px-3">Stage</th>
                        <th className="py-2 px-3">Status</th>
                        <th className="py-2 px-3">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[11px]">
                      {loadingInspectLogs ? (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-slate-400">
                            Loading activity records...
                          </td>
                        </tr>
                      ) : inspectLogs.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-slate-400 font-medium">
                            No recent logs recorded for this entity.
                          </td>
                        </tr>
                      ) : (
                        inspectLogs
                          .filter((h) => {
                            if (!inspectLogsSearch.trim()) return true;
                            const q = inspectLogsSearch.toLowerCase();
                            return (
                              (h.serialNumber || "").toLowerCase().includes(q) ||
                              (h.barcode || "").toLowerCase().includes(q) ||
                              (h.piNumber || "").toLowerCase().includes(q)
                            );
                          })
                          .slice(0, 30)
                          .map((h, i) => (
                            <tr key={h.id || i} className="hover:bg-slate-50">
                              <td className="py-2 px-3 whitespace-nowrap text-slate-500 font-mono text-[10px]">
                                {h.timestamp ? new Date(h.timestamp).toLocaleTimeString() : "-"}
                              </td>
                              <td className="py-2 px-3 font-mono font-bold text-slate-900">{h.serialNumber}</td>
                              <td className="py-2 px-3 font-mono text-slate-600">{h.barcode}</td>
                              <td className="py-2 px-3 font-mono font-bold text-purple-700">{h.piNumber}</td>
                              <td className="py-2 px-3 font-medium text-slate-700">{h.stage}</td>
                              <td className="py-2 px-3">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  {h.status || "Completed"}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-slate-500 truncate max-w-xs">{h.remarks || "-"}</td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
