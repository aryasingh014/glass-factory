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
  ChevronDown,
  ChevronRight,
  Printer,
  SlidersHorizontal,
} from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  formatDubaiDateTime,
  formatAENumber,
  formatPlatformDate,
  formatBatchNumber,
  getItemFinish,
  getGlassPaneRole,
  getDguEffectiveQtyAndSqm,
  isDlguGlass,
  isDguGlass,
  isLaminatedGlass,
} from "@/lib/utils";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ReportsResponse, PIMaster, GlassItem, ProductionHistory, RejectRecord, ReworkRecord, ProductionStage } from "@shared/api";

interface ReportsViewProps {
  initialTab?: "pis" | "items" | "history" | "rejects" | "reworks";
  onTabChange?: (tab: "pis" | "items" | "history" | "rejects" | "reworks") => void;
  onPrintSticker?: (item: GlassItem) => void;
  onReject?: (item: GlassItem) => void;
  onRework?: (item: GlassItem) => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  initialTab = "pis",
  onTabChange,
  onPrintSticker,
  onReject,
  onRework,
}) => {
  const [reportData, setReportData] = useState<ReportsResponse | null>(null);
  const [activeTab, setActiveTab] = useState<"pis" | "items" | "history" | "rejects" | "reworks">(
    initialTab || "pis"
  );

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const handleTabSelect = (tab: "pis" | "items" | "history" | "rejects" | "reworks") => {
    setActiveTab(tab);
    try {
      localStorage.setItem("sejal_reports_active_tab", tab);
    } catch {}
    onTabChange?.(tab);
  };

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [lastSyncedTime, setLastSyncedTime] = useState<Date>(new Date());

  // Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStage, setSelectedStage] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedCustomer, setSelectedCustomer] = useState<string>("all");
  const [selectedDateRange, setSelectedDateRange] = useState<"all" | "today" | "week" | "month">("all");

  // Rejects & Reworks sub-filter view modes
  const [rejectsFilterMode, setRejectsFilterMode] = useState<"all" | "rejected_only">("all");
  const [reworksFilterMode, setReworksFilterMode] = useState<"all" | "reworks_only">("all");

  // Customer Accordion collapse state (true = open, false = closed)
  const [expandedCustomers, setExpandedCustomers] = useState<Record<string, boolean>>({});

  const toggleCustomerExpanded = (custName: string) => {
    setExpandedCustomers((prev) => ({
      ...prev,
      [custName]: !isCustomerExpanded(custName),
    }));
  };

  const isCustomerExpanded = (custName: string) => {
    if (searchTerm.trim().length > 0) {
      return expandedCustomers[custName] !== false; // Auto-expand when searching
    }
    return Boolean(expandedCustomers[custName]); // Default closed
  };

  const setAllCustomersExpanded = (expand: boolean) => {
    const newState: Record<string, boolean> = {};
    customerList.forEach((c) => {
      newState[c] = expand;
    });
    setExpandedCustomers(newState);
  };

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

  // Real-Time auto-refresh polling interval (every 10 seconds) + SSE event listener
  useEffect(() => {
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource("/api/production/events");
      const handleStreamUpdate = () => {
        fetchReports(false);
      };
      eventSource.addEventListener("stage_advanced", handleStreamUpdate);
      eventSource.addEventListener("item_rejected", handleStreamUpdate);
      eventSource.addEventListener("item_reworked", handleStreamUpdate);
      eventSource.addEventListener("excel_uploaded", handleStreamUpdate);
      eventSource.addEventListener("sticker_batch_uploaded", handleStreamUpdate);
      eventSource.addEventListener("pi_released", handleStreamUpdate);
      eventSource.addEventListener("pi_deleted", handleStreamUpdate);
      eventSource.addEventListener("database_cleared", handleStreamUpdate);
    } catch (err) {
      console.error("SSE connection error in ReportsView:", err);
    }

    if (!autoSync) {
      return () => {
        eventSource?.close();
      };
    }

    const interval = setInterval(() => {
      fetchReports(false);
    }, 10000);

    return () => {
      eventSource?.close();
      clearInterval(interval);
    };
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

  // Helper to get Customer Name for any item
  const getCustomerNameForItem = (item: GlassItem | RejectRecord | ReworkRecord | string | null | undefined): string => {
    if (!item) return "General Customer";
    if (typeof item === "string") {
      const matchedPI = reportData?.pis?.find((p) => p.piNumber === item || p.id === item);
      return (matchedPI?.customerName || "General Customer").trim();
    }
    if ((item as any).customerName) return ((item as any).customerName).trim();
    const piNum = (item as any).piNumber || (item as any).orderNo || (item as any).batchNo;
    const piId = (item as any).piId;
    const matchedPI = reportData?.pis?.find((p) => p.piNumber === piNum || p.id === piId || p.id === piNum);
    if (matchedPI?.customerName) return matchedPI.customerName.trim();
    return "General Customer";
  };

  // Customer List for Dropdown Filter
  const customerList = useMemo(() => {
    if (!reportData) return [];
    const set = new Set<string>();
    reportData.pis?.forEach((p) => {
      if (p.customerName) set.add(p.customerName.trim());
    });
    reportData.items?.forEach((i) => {
      const c = getCustomerNameForItem(i);
      if (c) set.add(c);
    });
    return Array.from(set).sort();
  }, [reportData]);

  // Reject lookup map by unique serial / itemId (NOT shared barcode)
  const rejectMap = useMemo(() => {
    const map = new Map<string, RejectRecord>();
    (reportData?.rejects || []).forEach((r) => {
      if (r.serialNumber) map.set(r.serialNumber, r);
      if (r.itemId) map.set(r.itemId, r);
    });
    return map;
  }, [reportData?.rejects]);

  // Rework lookup map by unique serial / itemId (NOT shared barcode)
  const reworkMap = useMemo(() => {
    const map = new Map<string, ReworkRecord>();
    (reportData?.reworks || []).forEach((rw) => {
      if (rw.serialNumber) map.set(rw.serialNumber, rw);
      if (rw.itemId) map.set(rw.itemId, rw);
    });
    return map;
  }, [reportData?.reworks]);

  // Helper to resolve or build GlassItem object for sticker/reject/rework actions
  const getGlassItemForActions = (
    serialNumber?: string,
    barcode?: string,
    piNumber?: string,
    fallbackStage?: ProductionStage,
    fallbackStatus: "Pending" | "In Production" | "Completed" | "Rejected" | "Reworking" = "Pending",
    fallbackRemarks?: string
  ): GlassItem => {
    const matched = reportData?.items?.find(
      (i) => (serialNumber && i.serialNumber === serialNumber)
    );
    if (matched) return matched;

    const safeSerial = serialNumber || barcode || "ITEM";
    return {
      id: `item-${safeSerial}`,
      piId: piNumber || "",
      piNumber: piNumber || "",
      serialNumber: safeSerial,
      barcode: barcode || safeSerial,
      qrId: `QR-${safeSerial}`,
      itemCode: safeSerial,
      glassType: "Glass Unit",
      width: 0,
      height: 0,
      qty: 1,
      sqm: 0,
      delLocation: "FACTORY",
      processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
      currentStage: fallbackStage || "Cutting",
      completedStages: [],
      status: fallbackStatus,
      remarks: fallbackRemarks,
      updatedAt: new Date().toISOString(),
    };
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

  // 1. Filtered Proforma Invoices
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
      if (selectedCustomer !== "all" && (pi.customerName || "").trim() !== selectedCustomer) return false;
      if (selectedStatus !== "all" && pi.status !== selectedStatus) return false;
      if (!isWithinDateRange(pi.createdAt)) return false;
      return true;
    });
  }, [reportData?.pis, searchTerm, selectedCustomer, selectedStatus, selectedDateRange]);

  // 2. Filtered Glass Items
  const filteredItems = useMemo(() => {
    if (!reportData?.items) return [];
    const q = searchTerm.toLowerCase().trim();
    return reportData.items.filter((item) => {
      const cust = getCustomerNameForItem(item);
      if (selectedCustomer !== "all" && cust !== selectedCustomer) return false;

      if (q) {
        const matchBar = (item.barcode || "").toLowerCase().includes(q);
        const matchSerial = (item.serialNumber || "").toLowerCase().includes(q);
        const matchPi = (item.piNumber || item.batchNo || "").toLowerCase().includes(q);
        const matchCode = (item.itemCode || item.glassCode || "").toLowerCase().includes(q);
        const matchType = (item.glassType || "").toLowerCase().includes(q);
        const matchCust = cust.toLowerCase().includes(q);
        if (!matchBar && !matchSerial && !matchPi && !matchCode && !matchType && !matchCust) return false;
      }
      if (selectedStage !== "all" && item.currentStage !== selectedStage) return false;
      if (selectedStatus !== "all" && (item.status || "Pending") !== selectedStatus) return false;
      if (!isWithinDateRange(item.updatedAt || item.createdAt)) return false;
      return true;
    });
  }, [reportData?.items, searchTerm, selectedCustomer, selectedStage, selectedStatus, selectedDateRange]);

  // 3. Filtered Audit History
  const filteredHistory = useMemo(() => {
    if (!reportData?.history) return [];
    const q = searchTerm.toLowerCase().trim();
    return reportData.history.filter((h) => {
      const cust = getCustomerNameForItem(h.piNumber || h.itemOrBatch);
      if (selectedCustomer !== "all" && cust !== selectedCustomer) return false;

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
        const matchCust = cust.toLowerCase().includes(q);
        if (
          !matchSerial &&
          !matchPi &&
          !matchItem &&
          !matchAction &&
          !matchUser &&
          !matchRemarks &&
          !matchStage &&
          !matchPrev &&
          !matchNew &&
          !matchCust
        ) {
          return false;
        }
      }
      if (selectedStage !== "all" && h.stage !== selectedStage) return false;
      if (!isWithinDateRange(h.timestamp)) return false;
      return true;
    });
  }, [reportData?.history, searchTerm, selectedCustomer, selectedStage, selectedDateRange]);

  // 4. Quality Rejects Log - Customer-Wise Grouping with All Stickers Visible
  const rejectCustomerGroups = useMemo(() => {
    if (!reportData) return [];
    const q = searchTerm.toLowerCase().trim();

    const allItemSerials = new Set((reportData.items || []).map((i) => i.serialNumber));
    const standaloneRejects: GlassItem[] = (reportData.rejects || [])
      .filter((r) => !allItemSerials.has(r.serialNumber))
      .map((r) => ({
        id: r.id || `rej-${r.serialNumber}`,
        piId: r.piNumber,
        piNumber: r.piNumber,
        serialNumber: r.serialNumber,
        barcode: r.barcode || r.serialNumber,
        qrId: `QR-${r.serialNumber}`,
        itemCode: r.serialNumber,
        glassType: "Glass Unit",
        width: 0,
        height: 0,
        qty: 1,
        sqm: 0,
        delLocation: "FACTORY",
        processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
        currentStage: r.stage || "Cutting",
        completedStages: [],
        status: "Rejected",
        remarks: r.reason,
        updatedAt: r.date || new Date().toISOString(),
      }));

    const combined = [...(reportData.items || []), ...standaloneRejects];
    const map = new Map<string, Array<{ item: GlassItem; rejectRecord?: RejectRecord; isRejected: boolean }>>();

    combined.forEach((item) => {
      const cust = getCustomerNameForItem(item);
      if (selectedCustomer !== "all" && cust !== selectedCustomer) return;

      const rRecord = rejectMap.get(item.serialNumber) || (item.id ? rejectMap.get(item.id) : undefined);
      const isRejected = item.status === "Rejected" || Boolean(rRecord);

      if (rejectsFilterMode === "rejected_only" && !isRejected) return;

      if (q) {
        const matchSerial = (item.serialNumber || "").toLowerCase().includes(q);
        const matchBar = (item.barcode || "").toLowerCase().includes(q);
        const matchQr = (item.qrId || "").toLowerCase().includes(q);
        const matchPi = (item.piNumber || (item as any).orderNo || item.batchNo || "").toLowerCase().includes(q);
        const matchPos = String(item.posNo || item.srNo || "").toLowerCase().includes(q);
        const matchCode = (item.itemCode || item.glassCode || "").toLowerCase().includes(q);
        const matchType = (item.glassType || "").toLowerCase().includes(q);
        const matchCust = cust.toLowerCase().includes(q);
        const matchFinish = getItemFinish(item).toLowerCase().includes(q);
        const matchOb = (item.obNo || "").toLowerCase().includes(q);
        const matchSfo = (item.sfoNo || "").toLowerCase().includes(q);
        const matchDim =
          `${item.width}x${item.height}`.includes(q.replace(/\s+/g, "")) ||
          `${item.width} x ${item.height}`.toLowerCase().includes(q) ||
          String(item.width).includes(q) ||
          String(item.height).includes(q);
        const matchReason = (
          rRecord?.reason ||
          (rRecord as any)?.defectDetails ||
          (rRecord as any)?.defectType ||
          item.remarks ||
          ""
        )
          .toLowerCase()
          .includes(q);
        const matchOp = (rRecord?.operator || "").toLowerCase().includes(q);
        const matchStage = (rRecord?.stage || item.currentStage || "").toLowerCase().includes(q);
        const matchStatus = (item.status || "").toLowerCase().includes(q);

        if (
          !matchSerial &&
          !matchBar &&
          !matchQr &&
          !matchPi &&
          !matchPos &&
          !matchCode &&
          !matchType &&
          !matchCust &&
          !matchFinish &&
          !matchOb &&
          !matchSfo &&
          !matchDim &&
          !matchReason &&
          !matchOp &&
          !matchStage &&
          !matchStatus
        )
          return;
      }

      if (selectedStage !== "all") {
        const itemStage = rRecord?.stage || item.currentStage;
        if (itemStage !== selectedStage) return;
      }

      if (!isWithinDateRange(rRecord?.date || item.updatedAt || item.createdAt)) return;

      if (!map.has(cust)) {
        map.set(cust, []);
      }
      map.get(cust)!.push({ item, rejectRecord: rRecord, isRejected });
    });

    const groups: Array<{
      customerName: string;
      items: Array<{ item: GlassItem; rejectRecord?: RejectRecord; isRejected: boolean }>;
      totalItems: number;
      rejectedCount: number;
      totalSqm: number;
    }> = [];

    map.forEach((items, customerName) => {
      let totalSqm = 0;
      let rejectedCount = 0;
      items.forEach(({ item, isRejected }) => {
        const eff = getDguEffectiveQtyAndSqm(item);
        totalSqm += eff.sqm;
        if (isRejected) rejectedCount += 1;
      });
      groups.push({
        customerName,
        items,
        totalItems: items.length,
        rejectedCount,
        totalSqm,
      });
    });

    return groups;
  }, [reportData, searchTerm, selectedCustomer, selectedStage, selectedDateRange, rejectsFilterMode, rejectMap]);

  // Total reject items count in filtered view
  const totalRejectsInFilter = useMemo(() => {
    return (reportData?.rejects || []).length;
  }, [reportData?.rejects]);

  // 5. Reworks Log - Customer-Wise Grouping with All Stickers Visible
  const reworkCustomerGroups = useMemo(() => {
    if (!reportData) return [];
    const q = searchTerm.toLowerCase().trim();

    const allItemSerials = new Set((reportData.items || []).map((i) => i.serialNumber));
    const standaloneReworks: GlassItem[] = (reportData.reworks || [])
      .filter((rw) => !allItemSerials.has(rw.serialNumber))
      .map((rw) => ({
        id: rw.id || `rw-${rw.serialNumber}`,
        piId: rw.piNumber,
        piNumber: rw.piNumber,
        serialNumber: rw.serialNumber,
        barcode: rw.barcode || rw.serialNumber,
        qrId: `QR-${rw.serialNumber}`,
        itemCode: rw.serialNumber,
        glassType: "Glass Unit",
        width: 0,
        height: 0,
        qty: 1,
        sqm: 0,
        delLocation: "FACTORY",
        processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
        currentStage: rw.targetStage || "Cutting",
        completedStages: [],
        status: "Reworking",
        remarks: rw.reason,
        updatedAt: rw.date || new Date().toISOString(),
      }));

    const combined = [...(reportData.items || []), ...standaloneReworks];
    const map = new Map<string, Array<{ item: GlassItem; reworkRecord?: ReworkRecord; isReworking: boolean }>>();

    combined.forEach((item) => {
      const cust = getCustomerNameForItem(item);
      if (selectedCustomer !== "all" && cust !== selectedCustomer) return;

      const rwRecord = reworkMap.get(item.serialNumber) || (item.id ? reworkMap.get(item.id) : undefined);
      const isReworking = (item.status as any) === "Reworking" || (item.status as any) === "Rework" || Boolean(rwRecord);

      if (reworksFilterMode === "reworks_only" && !isReworking) return;

      if (q) {
        const matchSerial = (item.serialNumber || "").toLowerCase().includes(q);
        const matchBar = (item.barcode || "").toLowerCase().includes(q);
        const matchQr = (item.qrId || "").toLowerCase().includes(q);
        const matchPi = (item.piNumber || (item as any).orderNo || item.batchNo || "").toLowerCase().includes(q);
        const matchPos = String(item.posNo || item.srNo || "").toLowerCase().includes(q);
        const matchCode = (item.itemCode || item.glassCode || "").toLowerCase().includes(q);
        const matchType = (item.glassType || "").toLowerCase().includes(q);
        const matchCust = cust.toLowerCase().includes(q);
        const matchFinish = getItemFinish(item).toLowerCase().includes(q);
        const matchOb = (item.obNo || "").toLowerCase().includes(q);
        const matchSfo = (item.sfoNo || "").toLowerCase().includes(q);
        const matchDim =
          `${item.width}x${item.height}`.includes(q.replace(/\s+/g, "")) ||
          `${item.width} x ${item.height}`.toLowerCase().includes(q) ||
          String(item.width).includes(q) ||
          String(item.height).includes(q);
        const matchReason = (
          rwRecord?.reason ||
          (rwRecord as any)?.reworkDetails ||
          item.remarks ||
          ""
        )
          .toLowerCase()
          .includes(q);
        const matchOp = (rwRecord?.operator || "").toLowerCase().includes(q);
        const matchStage = (rwRecord?.targetStage || rwRecord?.fromStage || item.currentStage || "").toLowerCase().includes(q);
        const matchStatus = (item.status || "").toLowerCase().includes(q);

        if (
          !matchSerial &&
          !matchBar &&
          !matchQr &&
          !matchPi &&
          !matchPos &&
          !matchCode &&
          !matchType &&
          !matchCust &&
          !matchFinish &&
          !matchOb &&
          !matchSfo &&
          !matchDim &&
          !matchReason &&
          !matchOp &&
          !matchStage &&
          !matchStatus
        )
          return;
      }

      if (selectedStage !== "all") {
        const itemStage = rwRecord?.targetStage || rwRecord?.fromStage || item.currentStage;
        if (itemStage !== selectedStage) return;
      }

      if (!isWithinDateRange(rwRecord?.date || item.updatedAt || item.createdAt)) return;

      if (!map.has(cust)) {
        map.set(cust, []);
      }
      map.get(cust)!.push({ item, reworkRecord: rwRecord, isReworking });
    });

    const groups: Array<{
      customerName: string;
      items: Array<{ item: GlassItem; reworkRecord?: ReworkRecord; isReworking: boolean }>;
      totalItems: number;
      reworkCount: number;
      totalSqm: number;
    }> = [];

    map.forEach((items, customerName) => {
      let totalSqm = 0;
      let reworkCount = 0;
      items.forEach(({ item, isReworking }) => {
        const eff = getDguEffectiveQtyAndSqm(item);
        totalSqm += eff.sqm;
        if (isReworking) reworkCount += 1;
      });
      groups.push({
        customerName,
        items,
        totalItems: items.length,
        reworkCount,
        totalSqm,
      });
    });

    return groups;
  }, [reportData, searchTerm, selectedCustomer, selectedStage, selectedDateRange, reworksFilterMode, reworkMap]);

  // Total rework items count in filtered view
  const totalReworksInFilter = useMemo(() => {
    return (reportData?.reworks || []).length;
  }, [reportData?.reworks]);

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
        "Batch Number": formatBatchNumber(p.piNumber) || p.piNumber,
        "PI Number": p.proformaInvNo || p.piNumber || p.jobOrderNumber || "—",
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
        const cust = getCustomerNameForItem(item);

        return {
          "SL No": idx + 1,
          "Customer": cust,
          "PI": item.piNumber || item.orderNo || item.batchNo || "—",
          "POS No": item.posNo || "—",
          "Finish / Type": finish,
          "Width (mm)": item.width,
          "Height (mm)": item.height,
          "Quantity": eff.qty,
          "Unit": eff.unitLabel,
          "SQM": eff.sqm,
          "Glass Code": item.glassCode || item.itemCode || "—",
          "Glass Type / Spec": item.glassType,
          "OB": item.obNo || "—",
          "SFO": item.sfoNo || "—",
          "Batch": item.batchNo || "—",
          "Barcode": item.barcode,
          "Current Stage": item.currentStage,
          "Status": item.status || "Pending",
          "Last Updated": formatDubaiDateTime(item.updatedAt || item.createdAt),
        };
      });
      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = [
        { wch: 8 },
        { wch: 25 },
        { wch: 16 },
        { wch: 10 },
        { wch: 14 },
        { wch: 12 },
        { wch: 12 },
        { wch: 10 },
        { wch: 10 },
        { wch: 12 },
        { wch: 18 },
        { wch: 32 },
        { wch: 10 },
        { wch: 12 },
        { wch: 10 },
        { wch: 20 },
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
        "Customer": getCustomerNameForItem(h.piNumber || h.itemOrBatch),
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
        { wch: 25 },
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
      const allRejectItems: any[] = [];
      rejectCustomerGroups.forEach((grp) => {
        grp.items.forEach(({ item, rejectRecord, isRejected }) => {
          const eff = getDguEffectiveQtyAndSqm(item);
          allRejectItems.push({
            "Customer Name": grp.customerName,
            "Serial Number": item.serialNumber,
            "Barcode": item.barcode,
            "Batch No": item.batchNo || formatBatchNumber(item.piNumber) || "—",
            "PI No": item.orderNo || item.piNumber || item.sfoNo || "—",
            "POS No": item.posNo || "—",
            "Glass Code": item.glassCode || item.itemCode || "—",
            "Glass Specification": item.glassType,
            "Dimensions (mm)": `${item.width} x ${item.height}`,
            "SQM": eff.sqm,
            "Current Stage": item.currentStage,
            "Quality Status": isRejected ? "REJECTED" : item.status || "In Production",
            "Defect Stage": rejectRecord?.stage || (isRejected ? item.currentStage : "—"),
            "Defect Reason": rejectRecord?.reason || (isRejected ? item.remarks || "Defect Reported" : "None"),
            "Operator": rejectRecord?.operator || "Operator",
            "Date (GST)": formatDubaiDateTime(rejectRecord?.date || item.updatedAt || item.createdAt),
          });
        });
      });

      if (allRejectItems.length === 0) {
        toast.error("No sticker records to export in current filtered view");
        return;
      }
      const ws = XLSX.utils.json_to_sheet(allRejectItems);
      ws["!cols"] = [
        { wch: 26 },
        { wch: 16 },
        { wch: 20 },
        { wch: 16 },
        { wch: 12 },
        { wch: 16 },
        { wch: 30 },
        { wch: 16 },
        { wch: 10 },
        { wch: 14 },
        { wch: 16 },
        { wch: 16 },
        { wch: 30 },
        { wch: 16 },
        { wch: 22 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, "Rejects Log");
      XLSX.writeFile(wb, `Sejal_Glass_Rejects_Log_${dateStr}.xlsx`);
      toast.success("Rejects log exported to Excel");
    } else if (activeTab === "reworks") {
      const allReworkItems: any[] = [];
      reworkCustomerGroups.forEach((grp) => {
        grp.items.forEach(({ item, reworkRecord, isReworking }) => {
          const eff = getDguEffectiveQtyAndSqm(item);
          allReworkItems.push({
            "Customer Name": grp.customerName,
            "Serial Number": item.serialNumber,
            "Barcode": item.barcode,
            "Batch No": item.batchNo || formatBatchNumber(item.piNumber) || "—",
            "PI No": item.orderNo || item.piNumber || item.sfoNo || "—",
            "POS No": item.posNo || "—",
            "Glass Code": item.glassCode || item.itemCode || "—",
            "Glass Specification": item.glassType,
            "Dimensions (mm)": `${item.width} x ${item.height}`,
            "SQM": eff.sqm,
            "Current Stage": item.currentStage,
            "Rework Status": isReworking ? "REWORKING" : item.status || "In Production",
            "From Stage": reworkRecord?.fromStage || "—",
            "Target Stage": reworkRecord?.targetStage || (isReworking ? item.currentStage : "—"),
            "Rework Reason": reworkRecord?.reason || (isReworking ? item.remarks || "Reworking" : "None"),
            "Operator": reworkRecord?.operator || "Operator",
            "Date (GST)": formatDubaiDateTime(reworkRecord?.date || item.updatedAt || item.createdAt),
          });
        });
      });

      if (allReworkItems.length === 0) {
        toast.error("No reworks to export in current filtered view");
        return;
      }
      const ws = XLSX.utils.json_to_sheet(allReworkItems);
      ws["!cols"] = [
        { wch: 26 },
        { wch: 16 },
        { wch: 20 },
        { wch: 16 },
        { wch: 12 },
        { wch: 16 },
        { wch: 30 },
        { wch: 16 },
        { wch: 10 },
        { wch: 14 },
        { wch: 16 },
        { wch: 16 },
        { wch: 16 },
        { wch: 30 },
        { wch: 16 },
        { wch: 22 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, "Reworks Log");
      XLSX.writeFile(wb, `Sejal_Glass_Reworks_Log_${dateStr}.xlsx`);
      toast.success("Reworks log exported to Excel");
    }
  };

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedCustomer("all");
    setSelectedStage("all");
    setSelectedStatus("all");
    setSelectedDateRange("all");
    setRejectsFilterMode("all");
    setReworksFilterMode("all");
  };

  const hasActiveFilters =
    searchTerm !== "" ||
    selectedCustomer !== "all" ||
    selectedStage !== "all" ||
    selectedStatus !== "all" ||
    selectedDateRange !== "all" ||
    rejectsFilterMode !== "all" ||
    reworksFilterMode !== "all";

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shadow-sm">
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
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Real-Time Sync Active</span>
            </div>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Customer-wise production tracking, quality defects, rework routes, and instant Excel exports.
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
          {/* Customer Filter Dropdown */}
          <select
            value={selectedCustomer}
            onChange={(e) => setSelectedCustomer(e.target.value)}
            className="h-9 px-2.5 rounded-lg border border-slate-200 bg-slate-50/60 text-slate-700 font-semibold text-xs focus:ring-1 focus:ring-indigo-500 focus:bg-white max-w-[200px] truncate"
            title="Filter by Customer"
          >
            <option value="all">All Customers ({customerList.length})</option>
            {customerList.map((cust) => (
              <option key={cust} value={cust}>
                {cust}
              </option>
            ))}
          </select>

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
          onClick={() => handleTabSelect("pis")}
          className={`pb-2.5 px-4 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer ${
            activeTab === "pis"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Proforma Invoices / Batches ({filteredPis.length})
        </button>
        <button
          onClick={() => handleTabSelect("items")}
          className={`pb-2.5 px-4 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer ${
            activeTab === "items"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Glass Units & Inventory ({filteredItems.length})
        </button>
        <button
          onClick={() => handleTabSelect("history")}
          className={`pb-2.5 px-4 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer ${
            activeTab === "history"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Audit History Trail ({filteredHistory.length})
        </button>
        <button
          onClick={() => handleTabSelect("rejects")}
          className={`pb-2.5 px-4 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            activeTab === "rejects"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <span>Quality Rejects Log</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
            totalRejectsInFilter > 0
              ? "bg-red-100 text-red-700 border border-red-200"
              : "bg-slate-100 text-slate-600"
          }`}>
            {totalRejectsInFilter}
          </span>
        </button>
        <button
          onClick={() => handleTabSelect("reworks")}
          className={`pb-2.5 px-4 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            activeTab === "reworks"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <span>Reworks Log</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
            totalReworksInFilter > 0
              ? "bg-amber-100 text-amber-700 border border-amber-200"
              : "bg-slate-100 text-slate-600"
          }`}>
            {totalReworksInFilter}
          </span>
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
                  <th className="p-3">Batch No</th>
                  <th className="p-3">PI Number</th>
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
                    <td colSpan={9} className="p-8 text-center text-slate-500 font-medium">
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
                        <td className="p-3 font-mono font-bold text-blue-700 whitespace-nowrap">
                          {pi.proformaInvNo || pi.piNumber || pi.jobOrderNumber || "—"}
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
            <table className="w-full text-left text-xs border-collapse min-w-[1350px]">
              <thead>
                <tr className="bg-slate-50/90 text-slate-600 uppercase border-b border-slate-200 text-[11px] font-extrabold tracking-wider">
                  <th className="p-3 text-center w-14">SL NO.</th>
                  <th className="p-3">CUSTOMER</th>
                  <th className="p-3">PI</th>
                  <th className="p-3 text-center">POS NO.</th>
                  <th className="p-3">FINISH / TYPE</th>
                  <th className="p-3 text-center">WIDTH (MM)</th>
                  <th className="p-3 text-center">HEIGHT (MM)</th>
                  <th className="p-3 text-center">QTY</th>
                  <th className="p-3 text-right">SQM</th>
                  <th className="p-3">GLASS CODE</th>
                  <th className="p-3 min-w-[200px]">GLASS TYPE / SPEC</th>
                  <th className="p-3 text-center">OB</th>
                  <th className="p-3 text-center">SFO</th>
                  <th className="p-3 text-center">BATCH</th>
                  <th className="p-3 min-w-[160px]">BARCODE</th>
                  <th className="p-3 text-center">CURRENT STAGE</th>
                  <th className="p-3 text-center">STATUS</th>
                  <th className="p-3 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800 font-sans">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={18} className="p-8 text-center text-slate-500 font-medium">
                      No glass item records found for the current search and filters.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((i: GlassItem, idx: number) => {
                    const itemStatus = i.status || "Pending";
                    const eff = getDguEffectiveQtyAndSqm(i);
                    const finish = getItemFinish(i);
                    const cust = getCustomerNameForItem(i);

                    return (
                      <tr key={i.id} className="hover:bg-purple-50/40 transition-colors">
                        {/* 1. SL NO. */}
                        <td className="p-3 font-mono font-bold text-slate-500 text-center whitespace-nowrap">
                          {i.srNo || idx + 1}
                        </td>

                        {/* Customer */}
                        <td className="p-3 font-semibold text-slate-900 whitespace-nowrap">
                          <div className="truncate max-w-[160px]" title={cust}>{cust}</div>
                        </td>

                        {/* 2. PI */}
                        <td className="p-3 font-mono font-bold text-blue-700 whitespace-nowrap">
                          {i.orderNo || i.piNumber || i.sfoNo || "—"}
                        </td>

                        {/* 3. POS NO. */}
                        <td className="p-3 font-mono font-black text-slate-800 text-center whitespace-nowrap">
                          {i.posNo || "—"}
                        </td>

                        {/* 4. FINISH / TYPE */}
                        <td className="p-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-black border whitespace-nowrap ${
                              finish === "Colour"
                                ? "bg-purple-100 text-purple-800 border-purple-200"
                                : "bg-cyan-100 text-cyan-800 border-cyan-200"
                            }`}
                          >
                            {finish === "Colour" ? "OP • Colour" : "IP • Clear"}
                          </span>
                        </td>

                        {/* 5. WIDTH (MM) */}
                        <td className="p-3 font-mono font-bold text-slate-900 text-center whitespace-nowrap">
                          {i.width}
                        </td>

                        {/* 6. HEIGHT (MM) */}
                        <td className="p-3 font-mono font-bold text-slate-900 text-center whitespace-nowrap">
                          {i.height}
                        </td>

                        {/* 7. QTY */}
                        <td className="p-3 text-center font-mono font-bold text-blue-700 whitespace-nowrap">
                          {eff.qty} {eff.unitLabel}
                        </td>

                        {/* 8. SQM */}
                        <td className="p-3 font-mono font-bold text-emerald-700 text-right whitespace-nowrap">
                          {formatAENumber(eff.sqm, 2)} m²
                        </td>

                        {/* 9. GLASS CODE */}
                        <td className="p-3 font-mono font-bold text-slate-800 whitespace-nowrap">
                          {i.glassCode || i.itemCode || "—"}
                        </td>

                        {/* 10. GLASS TYPE / SPEC */}
                        <td className="p-3 text-slate-700">
                          <div className="font-semibold text-slate-900 line-clamp-1" title={i.glassType}>
                            {i.glassType}
                          </div>
                        </td>

                        {/* 11. OB */}
                        <td className="p-3 font-mono text-center text-slate-700 whitespace-nowrap">
                          {i.obNo || "—"}
                        </td>

                        {/* 12. SFO */}
                        <td className="p-3 font-mono text-center text-purple-700 font-bold whitespace-nowrap">
                          {i.sfoNo || "—"}
                        </td>

                        {/* 13. BATCH */}
                        <td className="p-3 font-mono text-center text-purple-700 font-bold whitespace-nowrap">
                          {i.batchNo || formatBatchNumber(i.piNumber) || "—"}
                        </td>

                        {/* 14. BARCODE */}
                        <td className="p-3 font-mono text-slate-600 font-medium whitespace-nowrap">
                          {i.barcode}
                        </td>

                        {/* 15. CURRENT STAGE */}
                        <td className="p-3 text-center whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-800 text-[10px] font-bold">
                            {i.currentStage}
                          </span>
                        </td>

                        {/* 16. STATUS */}
                        <td className="p-3 text-center whitespace-nowrap">
                          <StatusBadge status={itemStatus} />
                        </td>

                        {/* 17. ACTIONS */}
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
                            {onReject && i.status !== "Rejected" && (
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
                  <th className="p-3">Customer</th>
                  <th className="p-3">User / Operator</th>
                  <th className="p-3">Action Performed</th>
                  <th className="p-3">Item / Batch</th>
                  <th className="p-3 text-center">Module / Stage</th>
                  <th className="p-3 text-center">Status Change</th>
                  <th className="p-3">Activity Details</th>
                  <th className="p-3 text-right min-w-[120px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-500 font-medium">
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
                    const cust = getCustomerNameForItem(h.piNumber || h.itemOrBatch);
                    const hasItemTarget = Boolean(h.serialNumber || (h.itemOrBatch && !h.itemOrBatch.includes("Batch")));
                    const targetItem = hasItemTarget
                      ? getGlassItemForActions(h.serialNumber || h.itemOrBatch, undefined, h.piNumber, h.stage as any, h.status as any, h.remarks)
                      : null;

                    return (
                      <tr key={h.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 font-mono text-slate-500 whitespace-nowrap">
                          {formatDubaiDateTime(h.timestamp)}
                        </td>
                        <td className="p-3 font-semibold text-slate-900 whitespace-nowrap">
                          <div className="truncate max-w-[140px]" title={cust}>{cust}</div>
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
                        <td className="p-3 text-right whitespace-nowrap">
                          {targetItem ? (
                            <div className="flex items-center justify-end gap-1.5">
                              {onPrintSticker && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onPrintSticker(targetItem);
                                  }}
                                  className="w-7 h-7 rounded-full border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400 flex items-center justify-center transition-all shadow-2xs shrink-0 cursor-pointer"
                                  title={`View & Print Barcode Sticker for #${targetItem.serialNumber}`}
                                >
                                  <Tag className="w-3.5 h-3.5 text-slate-700" />
                                </button>
                              )}
                              {onReject && targetItem.status !== "Rejected" && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onReject(targetItem);
                                  }}
                                  className="w-7 h-7 rounded-full border border-red-300 bg-white text-red-600 hover:bg-red-50 hover:border-red-400 flex items-center justify-center transition-all shadow-2xs shrink-0 cursor-pointer"
                                  title={`Reject Item #${targetItem.serialNumber}`}
                                >
                                  <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                                </button>
                              )}
                              {onRework && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onRework(targetItem);
                                  }}
                                  className="w-7 h-7 rounded-full border border-amber-300 bg-white text-amber-600 hover:bg-amber-50 hover:border-amber-400 flex items-center justify-center transition-all shadow-2xs shrink-0 cursor-pointer"
                                  title={`Send Item #${targetItem.serialNumber} to Rework`}
                                >
                                  <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 4. QUALITY REJECTS LOG TAB (CUSTOMER-WISE) */}
        {activeTab === "rejects" && (
          <div className="space-y-4 p-4 bg-slate-50/50">
            {/* Sub-header Controls Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" /> View Mode:
                </span>
                {/* Mode toggle: All Stickers vs Rejected Only */}
                <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setRejectsFilterMode("all")}
                    className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                      rejectsFilterMode === "all"
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    All Glass Stickers ({summaryMetrics.totalItems})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRejectsFilterMode("rejected_only")}
                    className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                      rejectsFilterMode === "rejected_only"
                        ? "bg-red-600 text-white shadow-xs"
                        : "text-red-700 hover:text-red-900 hover:bg-red-50"
                    }`}
                  >
                    <AlertCircle className="w-3 h-3" />
                    <span>Rejected Defects ({totalRejectsInFilter})</span>
                  </button>
                </div>
              </div>

              {/* Dedicated Search Input & Button for Stickers / Details */}
              <div className="flex items-center gap-2 flex-1 min-w-[280px] max-w-md">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    type="text"
                    placeholder="Search sticker #, PI #, batch #, pos #, glass type, defect, operator..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 pr-7 h-8 text-xs font-medium border-slate-200 bg-slate-50/60 focus:bg-white rounded-lg"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                      title="Clear search"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  className="h-8 px-3 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-2xs flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Search</span>
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAllCustomersExpanded(true)}
                  className="h-7 text-xs font-bold border-slate-200 hover:bg-slate-50 text-slate-700"
                >
                  Expand All
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAllCustomersExpanded(false)}
                  className="h-7 text-xs font-bold border-slate-200 hover:bg-slate-50 text-slate-700"
                >
                  Collapse All
                </Button>
              </div>
            </div>

            {/* Customer-Wise Accordion Groups */}
            {rejectCustomerGroups.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-xl border border-slate-200 text-slate-500 font-medium">
                <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-700">No sticker items found for the current selection.</p>
                <p className="text-xs text-slate-400 mt-0.5">Try clearing filters or switching to "All Glass Stickers" view mode.</p>
              </div>
            ) : (
              rejectCustomerGroups.map((group) => {
                const isExpanded = isCustomerExpanded(group.customerName);

                return (
                  <div
                    key={group.customerName}
                    className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden transition-all"
                  >
                    {/* Customer Section Header */}
                    <div
                      onClick={() => toggleCustomerExpanded(group.customerName)}
                      className="p-3.5 bg-slate-50/90 hover:bg-slate-100/80 border-b border-slate-200 flex items-center justify-between cursor-pointer select-none transition-colors"
                    >
                      <div className="flex items-center gap-2.5 flex-wrap">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-slate-500" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-500" />
                        )}
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-purple-600" />
                          <h3 className="text-sm font-black text-slate-900 tracking-tight">
                            {group.customerName}
                          </h3>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 flex-wrap text-xs">
                        <span className="px-2.5 py-1 rounded-md bg-white border border-slate-200 font-mono font-bold text-slate-700 text-[11px] shadow-2xs">
                          {group.totalItems} Stickers
                        </span>
                        <span className="px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 font-mono font-black text-emerald-800 text-[11px]">
                          {formatAENumber(group.totalSqm, 2)} SQM
                        </span>
                        <span
                          className={`px-2.5 py-1 rounded-md font-bold text-[11px] border ${
                            group.rejectedCount > 0
                              ? "bg-red-50 border-red-200 text-red-700"
                              : "bg-slate-100 border-slate-200 text-slate-600"
                          }`}
                        >
                          {group.rejectedCount} {group.rejectedCount === 1 ? "Reject" : "Rejects"}
                        </span>
                      </div>
                    </div>

                    {/* Customer Items Table */}
                    {isExpanded && (
                      <div className="overflow-x-auto w-full">
                        <table className="w-full text-left text-xs border-collapse min-w-[1100px]">
                          <thead>
                            <tr className="bg-slate-100/60 text-slate-600 uppercase border-b border-slate-200 text-[10.5px] font-extrabold tracking-wider">
                              <th className="p-3 w-12 text-center">SL</th>
                              <th className="p-3">SERIAL NUMBER</th>
                              <th className="p-3">BATCH NO</th>
                              <th className="p-3">PI NUMBER</th>
                              <th className="p-3 text-center">POS NO</th>
                              <th className="p-3 text-center">FINISH</th>
                              <th className="p-3 text-center">WIDTH x HEIGHT</th>
                              <th className="p-3 text-right">SQM</th>
                              <th className="p-3 min-w-[180px]">GLASS TYPE / SPEC</th>
                              <th className="p-3 text-center">STAGE</th>
                              <th className="p-3 text-center">QUALITY STATUS</th>
                              <th className="p-3">DEFECT DETAILS</th>
                              <th className="p-3">OPERATOR</th>
                              <th className="p-3 text-right min-w-[210px]">ACTIONS</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-800">
                            {group.items.map(({ item, rejectRecord, isRejected }, idx) => {
                              const eff = getDguEffectiveQtyAndSqm(item);
                              const finish = getItemFinish(item);
                              const actionItem = getGlassItemForActions(
                                item.serialNumber,
                                item.barcode,
                                item.piNumber,
                                rejectRecord?.stage || item.currentStage,
                                isRejected ? "Rejected" : (item.status as any) || "Pending",
                                rejectRecord?.reason || item.remarks
                              );

                              return (
                                <tr
                                  key={item.id || item.serialNumber}
                                  className={`transition-colors ${
                                    isRejected
                                      ? "bg-red-50/40 hover:bg-red-50/70"
                                      : "hover:bg-slate-50/80"
                                  }`}
                                >
                                  {/* SL */}
                                  <td className="p-3 font-mono font-bold text-slate-500 text-center whitespace-nowrap">
                                    {idx + 1}
                                  </td>

                                  {/* Serial Number & Barcode */}
                                  <td className="p-3 font-mono whitespace-nowrap">
                                    <div className={`font-bold ${isRejected ? "text-red-700" : "text-blue-700"}`}>
                                      {item.serialNumber}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-medium">
                                      {item.barcode}
                                    </div>
                                  </td>

                                  {/* Batch No */}
                                  <td className="p-3 font-mono font-bold text-purple-700 whitespace-nowrap">
                                    {item.batchNo || formatBatchNumber(item.piNumber) || "—"}
                                  </td>

                                  {/* PI Number */}
                                  <td className="p-3 font-mono font-bold text-blue-700 whitespace-nowrap">
                                    {item.orderNo || item.piNumber || item.sfoNo || "—"}
                                  </td>

                                  {/* POS NO */}
                                  <td className="p-3 font-mono font-black text-slate-800 text-center whitespace-nowrap">
                                    {item.posNo || "—"}
                                  </td>

                                  {/* Finish */}
                                  <td className="p-3 text-center whitespace-nowrap">
                                    <span
                                      className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-black border ${
                                        finish === "Colour"
                                          ? "bg-purple-100 text-purple-800 border-purple-200"
                                          : "bg-cyan-100 text-cyan-800 border-cyan-200"
                                      }`}
                                    >
                                      {finish === "Colour" ? "OP • Colour" : "IP • Clear"}
                                    </span>
                                  </td>

                                  {/* Dimensions */}
                                  <td className="p-3 font-mono font-bold text-slate-900 text-center whitespace-nowrap">
                                    {item.width} × {item.height} mm
                                  </td>

                                  {/* SQM */}
                                  <td className="p-3 font-mono font-bold text-emerald-700 text-right whitespace-nowrap">
                                    {formatAENumber(eff.sqm, 2)} m²
                                  </td>

                                  {/* Glass Type / Spec */}
                                  <td className="p-3 text-slate-700">
                                    <div className="font-semibold text-slate-900 line-clamp-1" title={item.glassType}>
                                      {item.glassType}
                                    </div>
                                    {item.glassCode && (
                                      <div className="text-[10px] font-mono text-slate-400">
                                        Code: {item.glassCode}
                                      </div>
                                    )}
                                  </td>

                                  {/* Stage */}
                                  <td className="p-3 text-center whitespace-nowrap">
                                    <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-800 text-[10px] font-bold">
                                      {rejectRecord?.stage || item.currentStage}
                                    </span>
                                  </td>

                                  {/* Quality Status */}
                                  <td className="p-3 text-center whitespace-nowrap">
                                    {isRejected ? (
                                      <span className="px-2.5 py-0.5 rounded-full bg-red-100 border border-red-300 text-red-800 text-[10.5px] font-black uppercase tracking-wider inline-flex items-center gap-1 shadow-2xs">
                                        <AlertCircle className="w-3 h-3 text-red-600" />
                                        REJECTED
                                      </span>
                                    ) : (
                                      <StatusBadge status={item.status || "In Production"} />
                                    )}
                                  </td>

                                  {/* Defect Details */}
                                  <td className="p-3">
                                    {isRejected ? (
                                      <div>
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          {rejectRecord?.defectivePane && (
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-black border ${
                                              rejectRecord.defectivePane === "OP"
                                                ? "bg-purple-100 text-purple-800 border-purple-200"
                                                : rejectRecord.defectivePane === "IP"
                                                ? "bg-cyan-100 text-cyan-800 border-cyan-200"
                                                : "bg-red-100 text-red-800 border-red-200"
                                            }`}>
                                              {rejectRecord.defectivePane === "OP"
                                                ? "OP • Outer Pane"
                                                : rejectRecord.defectivePane === "IP"
                                                ? "IP • Inner Pane"
                                                : rejectRecord.defectivePane === "ASSEMBLY"
                                                ? "Assembly Defect"
                                                : rejectRecord.defectivePane}
                                            </span>
                                          )}
                                          <span className="text-red-700 font-extrabold text-xs">
                                            {rejectRecord?.reason || item.remarks || "Defect Scrap"}
                                          </span>
                                        </div>
                                        {rejectRecord?.date && (
                                          <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                                            {formatDubaiDateTime(rejectRecord.date)}
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-slate-400 font-medium text-xs">No Defects</span>
                                    )}
                                  </td>

                                  {/* Operator */}
                                  <td className="p-3 text-slate-700 font-semibold whitespace-nowrap">
                                    {rejectRecord?.operator || "Operator"}
                                  </td>

                                  {/* Actions: Sticker, Reject, Rework */}
                                  <td className="p-3 text-right whitespace-nowrap">
                                    <div className="flex items-center justify-end gap-1.5">
                                      {/* Sticker Button */}
                                      {onPrintSticker && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onPrintSticker(actionItem);
                                          }}
                                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-2xs cursor-pointer"
                                          title={`View & Print Barcode Sticker for Glass #${item.serialNumber}`}
                                        >
                                          <Tag className="w-3.5 h-3.5 text-slate-700" />
                                          <span>Sticker</span>
                                        </button>
                                      )}

                                      {/* Reject Button - Only visible if item is NOT already rejected */}
                                      {!isRejected && item.status !== "Rejected" && onReject && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onReject(actionItem);
                                          }}
                                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-300 transition-colors shadow-2xs cursor-pointer"
                                          title={`Report Defect / Reject Glass #${item.serialNumber}`}
                                        >
                                          <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                                          <span>Reject</span>
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* 5. REWORKS LOG TAB (CUSTOMER-WISE) */}
        {activeTab === "reworks" && (
          <div className="space-y-4 p-4 bg-slate-50/50">
            {/* Sub-header Controls Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" /> View Mode:
                </span>
                {/* Mode toggle: All Stickers vs Reworks Only */}
                <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setReworksFilterMode("all")}
                    className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                      reworksFilterMode === "all"
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    All Glass Stickers ({summaryMetrics.totalItems})
                  </button>
                  <button
                    type="button"
                    onClick={() => setReworksFilterMode("reworks_only")}
                    className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                      reworksFilterMode === "reworks_only"
                        ? "bg-amber-600 text-white shadow-xs"
                        : "text-amber-800 hover:text-amber-950 hover:bg-amber-50"
                    }`}
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>In Rework ({totalReworksInFilter})</span>
                  </button>
                </div>
              </div>

              {/* Dedicated Search Input & Button for Stickers / Details */}
              <div className="flex items-center gap-2 flex-1 min-w-[280px] max-w-md">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    type="text"
                    placeholder="Search sticker #, PI #, batch #, pos #, glass type, rework details, operator..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 pr-7 h-8 text-xs font-medium border-slate-200 bg-slate-50/60 focus:bg-white rounded-lg"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                      title="Clear search"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  className="h-8 px-3 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-2xs flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Search</span>
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAllCustomersExpanded(true)}
                  className="h-7 text-xs font-bold border-slate-200 hover:bg-slate-50 text-slate-700"
                >
                  Expand All
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAllCustomersExpanded(false)}
                  className="h-7 text-xs font-bold border-slate-200 hover:bg-slate-50 text-slate-700"
                >
                  Collapse All
                </Button>
              </div>
            </div>

            {/* Customer-Wise Accordion Groups */}
            {reworkCustomerGroups.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-xl border border-slate-200 text-slate-500 font-medium">
                <RotateCcw className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-700">No sticker items found for the current selection.</p>
                <p className="text-xs text-slate-400 mt-0.5">Try clearing filters or switching to "All Glass Stickers" view mode.</p>
              </div>
            ) : (
              reworkCustomerGroups.map((group) => {
                const isExpanded = isCustomerExpanded(group.customerName);

                return (
                  <div
                    key={group.customerName}
                    className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden transition-all"
                  >
                    {/* Customer Section Header */}
                    <div
                      onClick={() => toggleCustomerExpanded(group.customerName)}
                      className="p-3.5 bg-slate-50/90 hover:bg-slate-100/80 border-b border-slate-200 flex items-center justify-between cursor-pointer select-none transition-colors"
                    >
                      <div className="flex items-center gap-2.5 flex-wrap">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-slate-500" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-500" />
                        )}
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-purple-600" />
                          <h3 className="text-sm font-black text-slate-900 tracking-tight">
                            {group.customerName}
                          </h3>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 flex-wrap text-xs">
                        <span className="px-2.5 py-1 rounded-md bg-white border border-slate-200 font-mono font-bold text-slate-700 text-[11px] shadow-2xs">
                          {group.totalItems} Stickers
                        </span>
                        <span className="px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 font-mono font-black text-emerald-800 text-[11px]">
                          {formatAENumber(group.totalSqm, 2)} SQM
                        </span>
                        <span
                          className={`px-2.5 py-1 rounded-md font-bold text-[11px] border ${
                            group.reworkCount > 0
                              ? "bg-amber-50 border-amber-200 text-amber-800"
                              : "bg-slate-100 border-slate-200 text-slate-600"
                          }`}
                        >
                          {group.reworkCount} {group.reworkCount === 1 ? "Rework" : "Reworks"}
                        </span>
                      </div>
                    </div>

                    {/* Customer Items Table */}
                    {isExpanded && (
                      <div className="overflow-x-auto w-full">
                        <table className="w-full text-left text-xs border-collapse min-w-[1100px]">
                          <thead>
                            <tr className="bg-slate-100/60 text-slate-600 uppercase border-b border-slate-200 text-[10.5px] font-extrabold tracking-wider">
                              <th className="p-3 w-12 text-center">SL</th>
                              <th className="p-3">SERIAL NUMBER</th>
                              <th className="p-3">BATCH NO</th>
                              <th className="p-3">PI NUMBER</th>
                              <th className="p-3 text-center">POS NO</th>
                              <th className="p-3 text-center">FINISH</th>
                              <th className="p-3 text-center">WIDTH x HEIGHT</th>
                              <th className="p-3 text-right">SQM</th>
                              <th className="p-3 min-w-[180px]">GLASS TYPE / SPEC</th>
                              <th className="p-3 text-center">REWORK ROUTE</th>
                              <th className="p-3 text-center">STATUS</th>
                              <th className="p-3">REWORK DETAILS</th>
                              <th className="p-3">OPERATOR</th>
                              <th className="p-3 text-right min-w-[210px]">ACTIONS</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-800">
                            {group.items.map(({ item, reworkRecord, isReworking }, idx) => {
                              const eff = getDguEffectiveQtyAndSqm(item);
                              const finish = getItemFinish(item);
                              const actionItem = getGlassItemForActions(
                                item.serialNumber,
                                item.barcode,
                                item.piNumber,
                                reworkRecord?.targetStage || item.currentStage,
                                isReworking ? "Reworking" : (item.status as any) || "Pending",
                                reworkRecord?.reason || item.remarks
                              );

                              return (
                                <tr
                                  key={item.id || item.serialNumber}
                                  className={`transition-colors ${
                                    isReworking
                                      ? "bg-amber-50/40 hover:bg-amber-50/70"
                                      : "hover:bg-slate-50/80"
                                  }`}
                                >
                                  {/* SL */}
                                  <td className="p-3 font-mono font-bold text-slate-500 text-center whitespace-nowrap">
                                    {idx + 1}
                                  </td>

                                  {/* Serial Number & Barcode */}
                                  <td className="p-3 font-mono whitespace-nowrap">
                                    <div className={`font-bold ${isReworking ? "text-amber-700" : "text-blue-700"}`}>
                                      {item.serialNumber}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-medium">
                                      {item.barcode}
                                    </div>
                                  </td>

                                  {/* Batch No */}
                                  <td className="p-3 font-mono font-bold text-purple-700 whitespace-nowrap">
                                    {item.batchNo || formatBatchNumber(item.piNumber) || "—"}
                                  </td>

                                  {/* PI Number */}
                                  <td className="p-3 font-mono font-bold text-blue-700 whitespace-nowrap">
                                    {item.orderNo || item.piNumber || item.sfoNo || "—"}
                                  </td>

                                  {/* POS NO */}
                                  <td className="p-3 font-mono font-black text-slate-800 text-center whitespace-nowrap">
                                    {item.posNo || "—"}
                                  </td>

                                  {/* Finish */}
                                  <td className="p-3 text-center whitespace-nowrap">
                                    <span
                                      className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-black border ${
                                        finish === "Colour"
                                          ? "bg-purple-100 text-purple-800 border-purple-200"
                                          : "bg-cyan-100 text-cyan-800 border-cyan-200"
                                      }`}
                                    >
                                      {finish === "Colour" ? "OP • Colour" : "IP • Clear"}
                                    </span>
                                  </td>

                                  {/* Dimensions */}
                                  <td className="p-3 font-mono font-bold text-slate-900 text-center whitespace-nowrap">
                                    {item.width} × {item.height} mm
                                  </td>

                                  {/* SQM */}
                                  <td className="p-3 font-mono font-bold text-emerald-700 text-right whitespace-nowrap">
                                    {formatAENumber(eff.sqm, 2)} m²
                                  </td>

                                  {/* Glass Type / Spec */}
                                  <td className="p-3 text-slate-700">
                                    <div className="font-semibold text-slate-900 line-clamp-1" title={item.glassType}>
                                      {item.glassType}
                                    </div>
                                    {item.glassCode && (
                                      <div className="text-[10px] font-mono text-slate-400">
                                        Code: {item.glassCode}
                                      </div>
                                    )}
                                  </td>

                                  {/* Rework Route */}
                                  <td className="p-3 text-center whitespace-nowrap">
                                    {isReworking && reworkRecord ? (
                                      <div className="inline-flex items-center gap-1 text-[10px] font-bold">
                                        <span className="text-slate-600">{reworkRecord.fromStage}</span>
                                        <span className="text-slate-400">→</span>
                                        <span className="px-1.5 py-0.5 rounded bg-amber-100 border border-amber-200 text-amber-800">
                                          {reworkRecord.targetStage}
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-800 text-[10px] font-bold">
                                        {item.currentStage}
                                      </span>
                                    )}
                                  </td>

                                  {/* Status */}
                                  <td className="p-3 text-center whitespace-nowrap">
                                    {isReworking ? (
                                      <span className="px-2.5 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-amber-900 text-[10.5px] font-black uppercase tracking-wider inline-flex items-center gap-1 shadow-2xs">
                                        <RotateCcw className="w-3 h-3 text-amber-700" />
                                        REWORKING
                                      </span>
                                    ) : (
                                      <StatusBadge status={item.status || "In Production"} />
                                    )}
                                  </td>

                                  {/* Rework Details */}
                                  <td className="p-3">
                                    {isReworking ? (
                                      <div>
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          {reworkRecord?.defectivePane && (
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-black border ${
                                              reworkRecord.defectivePane === "OP"
                                                ? "bg-purple-100 text-purple-800 border-purple-200"
                                                : reworkRecord.defectivePane === "IP"
                                                ? "bg-cyan-100 text-cyan-800 border-cyan-200"
                                                : "bg-amber-100 text-amber-800 border-amber-200"
                                            }`}>
                                              {reworkRecord.defectivePane === "OP"
                                                ? "OP • Outer Pane"
                                                : reworkRecord.defectivePane === "IP"
                                                ? "IP • Inner Pane"
                                                : reworkRecord.defectivePane === "ASSEMBLY"
                                                ? "Assembly Defect"
                                                : reworkRecord.defectivePane}
                                            </span>
                                          )}
                                          <span className="text-amber-800 font-extrabold text-xs">
                                            {reworkRecord?.reason || item.remarks || "Workstation Reprocess"}
                                          </span>
                                        </div>
                                        {reworkRecord?.date && (
                                          <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                                            {formatDubaiDateTime(reworkRecord.date)}
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-slate-400 font-medium text-xs">Standard Route</span>
                                    )}
                                  </td>

                                  {/* Operator */}
                                  <td className="p-3 text-slate-700 font-semibold whitespace-nowrap">
                                    {reworkRecord?.operator || "Operator"}
                                  </td>

                                  {/* Actions: Sticker, Reject, Rework */}
                                  <td className="p-3 text-right whitespace-nowrap">
                                    <div className="flex items-center justify-end gap-1.5">
                                      {/* Sticker Button */}
                                      {onPrintSticker && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onPrintSticker(actionItem);
                                          }}
                                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-2xs cursor-pointer"
                                          title={`View & Print Barcode Sticker for Glass #${item.serialNumber}`}
                                        >
                                          <Tag className="w-3.5 h-3.5 text-slate-700" />
                                          <span>Sticker</span>
                                        </button>
                                      )}

                                      {/* Rework Button */}
                                      {onRework && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onRework(actionItem);
                                          }}
                                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 hover:border-amber-400 transition-colors shadow-2xs cursor-pointer"
                                          title={`Re-route Glass #${item.serialNumber} to Rework`}
                                        >
                                          <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
                                          <span>Rework</span>
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};
