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
  Filter,
  ShieldCheck,
  FileSpreadsheet,
  AlertCircle,
  RotateCcw,
  Search,
  X,
  Boxes,
  Truck,
  ArrowUpRight,
  TrendingDown,
  Sparkles,
  Gauge,
  Factory,
} from "lucide-react";
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
import { Input } from "@/components/ui/input";
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

export const PerformanceAnalyticsView: React.FC = () => {
  const [data, setData] = useState<PerformanceAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [lastSyncedTime, setLastSyncedTime] = useState<Date>(new Date());

  // Filter States
  const [timeRange, setTimeRange] = useState<"all" | "today" | "7days" | "30days">("all");
  const [projectFilter, setProjectFilter] = useState("");
  const [batchFilter, setBatchFilter] = useState("");
  const [productTypeFilter, setProductTypeFilter] = useState<string>("all");
  const [selectedStage, setSelectedStage] = useState<string>("all");
  const [selectedOperator, setSelectedOperator] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  const fetchAnalytics = async (showLoadingState = false) => {
    if (showLoadingState) {
      setLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const params = new URLSearchParams();
      params.append("range", timeRange);
      if (projectFilter.trim()) params.append("project", projectFilter.trim());
      if (batchFilter.trim()) params.append("batch", batchFilter.trim());
      if (productTypeFilter !== "all") params.append("productType", productTypeFilter);
      if (selectedStage !== "all") params.append("stage", selectedStage);
      if (selectedOperator !== "all") params.append("operator", selectedOperator);
      if (selectedStatus !== "all") params.append("status", selectedStatus);

      const res = await fetch(`/api/analytics/performance?${params.toString()}`);
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

  // Initial Load & Filter Changes
  useEffect(() => {
    fetchAnalytics(true);
  }, [timeRange, projectFilter, batchFilter, productTypeFilter, selectedStage, selectedOperator, selectedStatus]);

  // Real-time Background Auto-Sync (10 seconds)
  useEffect(() => {
    if (!autoSync) return;
    const interval = setInterval(() => {
      fetchAnalytics(false);
    }, 10000);
    return () => clearInterval(interval);
  }, [autoSync, timeRange, projectFilter, batchFilter, productTypeFilter, selectedStage, selectedOperator, selectedStatus]);

  const clearFilters = () => {
    setTimeRange("all");
    setProjectFilter("");
    setBatchFilter("");
    setProductTypeFilter("all");
    setSelectedStage("all");
    setSelectedOperator("all");
    setSelectedStatus("all");
  };

  const hasActiveFilters =
    timeRange !== "all" ||
    projectFilter !== "" ||
    batchFilter !== "" ||
    productTypeFilter !== "all" ||
    selectedStage !== "all" ||
    selectedOperator !== "all" ||
    selectedStatus !== "all";

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

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 animate-pulse shadow-sm">
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

  const { summary, stages, defects, operators, dailyTrends, piFulfillment, productTypeBreakdown = [], bottlenecks = [] } = data;

  return (
    <div className="space-y-6">
      {/* ── HEADER & REAL-TIME CONTROLS ── */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-4.5 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Factory className="w-6 h-6 text-indigo-600" />
              Enterprise Live Performance Analytics
            </h2>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>Live Analytics Feed Active</span>
            </div>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Real-time OEE metrics, workstation throughput, cycle time analysis, bottleneck identification, and quality Pareto distribution.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Auto-Sync Toggle */}
          <button
            type="button"
            onClick={() => setAutoSync(!autoSync)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors flex items-center gap-1.5 cursor-pointer ${
              autoSync
                ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
            }`}
            title={autoSync ? "Live auto-sync every 10s is ON" : "Live auto-sync is paused"}
          >
            <Zap className={`w-3.5 h-3.5 ${autoSync ? "text-indigo-600" : "text-slate-400"}`} />
            <span>Auto-Sync {autoSync ? "ON (10s)" : "PAUSED"}</span>
          </button>

          {/* Sync Now Button */}
          <Button
            type="button"
            onClick={() => fetchAnalytics(false)}
            disabled={isRefreshing}
            size="sm"
            variant="outline"
            className="h-8.5 text-xs font-bold border-slate-300 hover:bg-slate-50 text-slate-700 gap-1.5"
            title="Calculate latest analytics immediately"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-indigo-600" : ""}`} />
            <span>{isRefreshing ? "Calculating..." : "Sync Now"}</span>
          </Button>

          {/* Export Excel Button */}
          <Button
            type="button"
            onClick={exportAnalyticsToExcel}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 h-8.5 shadow-2xs"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export Analytics Report (.xlsx)</span>
          </Button>
        </div>
      </div>

      {/* ── ENTERPRISE MULTI-DIMENSIONAL FILTERS ── */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
        <div className="flex items-center justify-between text-xs font-extrabold text-slate-700">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-indigo-600" />
            <span>Live Analytics Filters</span>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" /> Reset All Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-2.5 text-xs">
          {/* 1. Time Range */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Time Range
            </label>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as any)}
              className="w-full h-8.5 px-2.5 rounded-lg border border-slate-200 bg-slate-50/70 text-slate-800 font-semibold text-xs focus:ring-1 focus:ring-indigo-500 focus:bg-white"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="7days">Past 7 Days</option>
              <option value="30days">Past 30 Days</option>
            </select>
          </div>

          {/* 2. Project / Customer Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Project / Customer
            </label>
            <Input
              type="text"
              placeholder="Filter by customer..."
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="h-8.5 text-xs font-medium border-slate-200 bg-slate-50/70 focus:bg-white"
            />
          </div>

          {/* 3. Batch Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Batch / PI #
            </label>
            <Input
              type="text"
              placeholder="e.g. 5442, 1466..."
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value)}
              className="h-8.5 text-xs font-medium border-slate-200 bg-slate-50/70 focus:bg-white"
            />
          </div>

          {/* 4. Product / Unit Type */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Unit / Product Type
            </label>
            <select
              value={productTypeFilter}
              onChange={(e) => setProductTypeFilter(e.target.value)}
              className="w-full h-8.5 px-2.5 rounded-lg border border-slate-200 bg-slate-50/70 text-slate-800 font-semibold text-xs focus:ring-1 focus:ring-indigo-500 focus:bg-white"
            >
              <option value="all">All Product Types</option>
              <option value="dlgu">DLGU Units</option>
              <option value="dgu">DGU / IGU Units</option>
              <option value="lamination">Laminated Glass</option>
              <option value="single">Single Monolithic</option>
            </select>
          </div>

          {/* 5. Production Stage */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Workstation Stage
            </label>
            <select
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              className="w-full h-8.5 px-2.5 rounded-lg border border-slate-200 bg-slate-50/70 text-slate-800 font-semibold text-xs focus:ring-1 focus:ring-indigo-500 focus:bg-white"
            >
              <option value="all">All Stages</option>
              <option value="cutting">Cutting</option>
              <option value="pairing">Pairing / Buffer</option>
              <option value="dgu">DGU Assembly</option>
              <option value="lamination">Lamination</option>
              <option value="finished">Finished / Dispatch</option>
            </select>
          </div>

          {/* 6. Operator Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Operator
            </label>
            <select
              value={selectedOperator}
              onChange={(e) => setSelectedOperator(e.target.value)}
              className="w-full h-8.5 px-2.5 rounded-lg border border-slate-200 bg-slate-50/70 text-slate-800 font-semibold text-xs focus:ring-1 focus:ring-indigo-500 focus:bg-white"
            >
              <option value="all">All Operators</option>
              {operators.map((op) => (
                <option key={op.operator} value={op.operator.toLowerCase()}>
                  {op.operator}
                </option>
              ))}
            </select>
          </div>

          {/* 7. Status Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Status
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full h-8.5 px-2.5 rounded-lg border border-slate-200 bg-slate-50/70 text-slate-800 font-semibold text-xs focus:ring-1 focus:ring-indigo-500 focus:bg-white"
            >
              <option value="all">All Statuses</option>
              <option value="in production">In Production</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
              <option value="reworking">Reworking</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── ENTERPRISE EXECUTIVE KPI CARDS (ROW 1) ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* 1. OEE Efficiency */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-extrabold uppercase tracking-wider">
            <span>Overall OEE</span>
            <Gauge className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-indigo-600">{summary.oee}%</span>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
              {summary.qualityRate}% Quality
            </span>
          </div>
          <div className="mt-2 text-[10px] text-slate-500 flex justify-between">
            <span>Avail: {summary.availability}%</span>
            <span>Perf: {summary.performance}%</span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
            <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${Math.min(100, summary.oee)}%` }} />
          </div>
        </div>

        {/* 2. Total Volume Processed */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
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
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
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
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
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
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-extrabold uppercase tracking-wider">
            <span>Defect Rate</span>
            <AlertCircle className="w-4 h-4 text-red-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-red-600">{summary.rejectRate}%</span>
            <span className="text-[10px] font-bold text-red-700 bg-red-50 px-1.5 py-0.5 rounded border border-red-100">
              {summary.reworkRate}% Rework
            </span>
          </div>
          <div className="mt-2 text-[10px] text-slate-500">
            Target benchmark: &lt; 2.5%
          </div>
        </div>

        {/* 6. Active Bottleneck Alert */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
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
        <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-sm border border-slate-800">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-white tracking-tight">
                  Workstation Bottleneck & Capacity Diagnostics
                </h3>
                <p className="text-[11px] text-slate-400">
                  Live queue pacing, risk levels, and backlog accumulation across factory workstations.
                </p>
              </div>
            </div>
            <div className="text-xs text-slate-400 font-mono">
              Live Stage Diagnostics: {stages.length} stages active
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {bottlenecks.map((b) => {
              const badgeClass =
                b.riskLevel === "High"
                  ? "bg-red-500/20 text-red-300 border-red-500/40"
                  : b.riskLevel === "Medium"
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                  : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";

              return (
                <div key={b.stage} className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/80">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-white">{b.stage} Stage</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${badgeClass}`}>
                      {b.riskLevel} Risk
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-lg font-black text-indigo-400">{b.pendingUnits} Units</span>
                    <span className="text-xs font-mono text-slate-400">{b.pendingSqm} SQM</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 line-clamp-2">{b.bottleneckReason}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── CHARTS SECTION 1: PRODUCTION TRENDS & PRODUCT TYPE BREAKDOWN ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Daily Production Volume Trends */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
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
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" /> Completed Units
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
                    border: "none",
                    borderRadius: "10px",
                    color: "#fff",
                    fontSize: "12px",
                  }}
                />
                <Area yAxisId="left" type="monotone" dataKey="itemsCompleted" stroke="#6366f1" strokeWidth={2.5} fill="url(#itemsGrad)" name="Completed Units" />
                <Area yAxisId="right" type="monotone" dataKey="sqmCompleted" stroke="#10b981" strokeWidth={2.5} fill="url(#sqmGrad)" name="Volume (SQM)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Product Type Breakdown */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
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
                    border: "none",
                    borderRadius: "10px",
                    color: "#fff",
                    fontSize: "12px",
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
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
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
                    border: "none",
                    borderRadius: "10px",
                    color: "#fff",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "11px", fontWeight: "bold" }} />
                <Bar dataKey="pendingCount" name="Pending Queue (Units)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="completedCount" name="Completed Throughput" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Quality Defect Pareto Analysis */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
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
                      border: "none",
                      borderRadius: "10px",
                      color: "#fff",
                      fontSize: "12px",
                    }}
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

      {/* ── SECTION 3: OPERATOR EFFICIENCY & BATCH FULFILLMENT ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Operator Efficiency Leaderboard */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-600" />
                Workstation & Operator Efficiency Leaderboard
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Scan volume throughput, completed items, rejects, and quality efficiency rating.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200 text-[10px] font-extrabold tracking-wider">
                  <th className="py-2 px-3">Operator / Station</th>
                  <th className="py-2 px-3 text-center">Operations</th>
                  <th className="py-2 px-3 text-center">Completed</th>
                  <th className="py-2 px-3 text-center">Rejects</th>
                  <th className="py-2 px-3 text-right">Quality Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {operators.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400 font-medium">
                      No operator activity records found for this filter.
                    </td>
                  </tr>
                ) : (
                  operators.map((op, idx) => (
                    <tr key={op.operator} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-slate-900 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span>{op.operator}</span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700">
                        {op.operationsCount}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-600">
                        {op.completedCount}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-red-600">
                        {op.rejectCount}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span className="px-2 py-0.5 rounded font-mono font-bold text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {op.qualityRate}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* PI / Batch Fulfillment Progress Radar */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Boxes className="w-4 h-4 text-purple-600" />
                Proforma Invoice / Batch Fulfillment Radar
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Batch completion progress and estimated completion timelines.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200 text-[10px] font-extrabold tracking-wider">
                  <th className="py-2 px-3">Batch No</th>
                  <th className="py-2 px-3">Customer</th>
                  <th className="py-2 px-3 text-center">Progress</th>
                  <th className="py-2 px-3 text-right">Volume</th>
                  <th className="py-2 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {piFulfillment.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400 font-medium">
                      No batch fulfillment data available.
                    </td>
                  </tr>
                ) : (
                  piFulfillment.slice(0, 7).map((pi) => (
                    <tr key={pi.piNumber} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-purple-700 whitespace-nowrap">
                        {formatBatchNumber(pi.piNumber)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-800 truncate max-w-[120px]">
                        <div className="font-semibold text-slate-900 truncate">{pi.customerName}</div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mb-1">
                          <div
                            className="bg-indigo-600 h-full rounded-full"
                            style={{ width: `${Math.min(100, pi.completionPercentage)}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono font-bold text-indigo-700">
                          {pi.completedItems}/{pi.totalItems} ({pi.completionPercentage}%)
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                        {pi.totalSqm} SQM
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <StatusBadge status={pi.status || "In Production"} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
