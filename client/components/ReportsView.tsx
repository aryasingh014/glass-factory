import React, { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FileSpreadsheet,
  FileText,
  BarChart2,
  RefreshCw,
  Tag,
  AlertCircle,
  AlertOctagon,
  RotateCcw,
  Search,
  Filter,
  CheckCircle2,
  CheckCircle,
  ShieldCheck,
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
  getDisplayStage,
} from "@/lib/utils";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { resolveGlassMakeupDetails } from "@/lib/excelExport";
import { ReportsResponse, PIMaster, GlassItem, ProductionHistory, RejectRecord, ReworkRecord, ProductionStage } from "@shared/api";

interface BatchSheetGroup<T> {
  key: string;
  batchNo: string;
  piNumber: string;
  rackNo: string | number;
  sheetTitle: string;
  sfoList: string[];
  obList: string[];
  glassType: string;
  finish: "Colour" | "Clear" | "Mixed";
  totalPieces: number;
  totalSqm: number;
  defectCount: number;
  items: T[];
}

function groupItemsByBatchAndSheet<
  T extends {
    item: GlassItem;
    rejectRecord?: RejectRecord;
    reworkRecord?: ReworkRecord;
    isRejected?: boolean;
    isReworking?: boolean;
  }
>(items: T[]): Array<BatchSheetGroup<T>> {
  const map = new Map<string, T[]>();

  items.forEach((entry) => {
    const it = entry.item;
    const batch = it.batchNo || formatBatchNumber(it.piNumber) || "Default";
    const rack =
      it.rackNo !== undefined && it.rackNo !== null && String(it.rackNo).trim() !== ""
        ? String(it.rackNo)
        : (it as any).sheetNo !== undefined
        ? String((it as any).sheetNo)
        : "";
    const pi = it.piNumber || it.orderNo || "Default";

    const key = `${pi}__${batch}__${rack || "1"}`;
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(entry);
  });

  const result: Array<BatchSheetGroup<T>> = [];

  map.forEach((sheetItems, key) => {
    const first = sheetItems[0].item;
    const batchNo = first.batchNo || formatBatchNumber(first.piNumber) || "—";
    const piNumber = first.piNumber || first.orderNo || "—";
    const rackNo =
      first.rackNo !== undefined && first.rackNo !== null && String(first.rackNo).trim() !== ""
        ? first.rackNo
        : (first as any).sheetNo !== undefined
        ? (first as any).sheetNo
        : "";

    let totalPieces = 0;
    let totalSqm = 0;
    let defectCount = 0;
    let colourCount = 0;
    let clearCount = 0;
    const sfoSet = new Set<string>();
    const obSet = new Set<string>();

    sheetItems.forEach((si) => {
      const it = si.item;
      const pieces = it.qty || 1;
      totalPieces += pieces;
      const eff = getDguEffectiveQtyAndSqm(it);
      totalSqm += eff.sqm;
      if (si.isRejected || si.isReworking) defectCount += 1;
      const f = getItemFinish(it);
      if (f === "Colour") colourCount += pieces;
      else clearCount += pieces;
      if (it.sfoNo) sfoSet.add(it.sfoNo);
      if (it.obNo) obSet.add(it.obNo);
    });

    const finish: "Colour" | "Clear" | "Mixed" =
      colourCount > 0 && clearCount === 0
        ? "Colour"
        : clearCount > 0 && colourCount === 0
        ? "Clear"
        : "Mixed";

    const sheetTitle = rackNo ? `Raw Sheet ${rackNo}` : `Batch ${batchNo}`;

    result.push({
      key,
      batchNo,
      piNumber,
      rackNo: rackNo || 1,
      sheetTitle,
      sfoList: Array.from(sfoSet),
      obList: Array.from(obSet),
      glassType: first.glassType || "Standard Float",
      finish,
      totalPieces,
      totalSqm,
      defectCount,
      items: sheetItems,
    });
  });

  result.sort((a, b) => {
    const aNum = Number(a.rackNo);
    const bNum = Number(b.rackNo);
    if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
    return String(a.key).localeCompare(String(b.key));
  });

  return result;
}

interface CustomerBatchGroup<T> {
  batchKey: string;
  batchNo: string;
  piNumber: string;
  customerName: string;
  projectName: string;
  jobOrderNumber?: string;
  finish: "Colour" | "Clear" | "Mixed";
  totalQty: number;
  totalSqm: number;
  defectCount: number;
  createdAt: string | Date;
  status: string;
  items: T[];
}

function groupCustomerItemsByBatch<
  T extends {
    item: GlassItem;
    rejectRecord?: RejectRecord;
    reworkRecord?: ReworkRecord;
    isRejected?: boolean;
    isReworking?: boolean;
  }
>(customerItems: T[], customerName: string, pis: PIMaster[] = []): Array<CustomerBatchGroup<T>> {
  const map = new Map<string, T[]>();

  customerItems.forEach((entry) => {
    const it = entry.item;
    const batch = it.batchNo || formatBatchNumber(it.piNumber) || "Default";
    const pi = it.piNumber || it.orderNo || "Default";
    const finish = getItemFinish(it);
    const key = `${pi}__${batch}__${finish}`;
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(entry);
  });

  const result: Array<CustomerBatchGroup<T>> = [];

  map.forEach((items, batchKey) => {
    const first = items[0].item;
    const batchNo = first.batchNo || formatBatchNumber(first.piNumber) || "—";
    const piNumber = first.piNumber || first.orderNo || "—";
    const itemFinish = getItemFinish(first);

    const matchingPi = pis.find((p) => {
      const pBatch = formatBatchNumber(p.piNumber);
      const isBatchMatch = pBatch === batchNo || p.piNumber === piNumber || p.proformaInvNo === piNumber;
      const pFinish = getItemFinish(p as any) || p.finish || p.colorOrClear;
      return isBatchMatch && (!pFinish || pFinish === itemFinish);
    }) || pis.find((p) => {
      const pBatch = formatBatchNumber(p.piNumber);
      return pBatch === batchNo || p.piNumber === piNumber || p.proformaInvNo === piNumber;
    });

    const batchQty = items.reduce((sum, x) => sum + (x.item.qty || 1), 0);
    const batchSqm = items.reduce((sum, x) => sum + getDguEffectiveQtyAndSqm(x.item).sqm, 0);
    const defectCount = items.filter((x) => x.isRejected || x.isReworking).length;

    const finalFinish: "Colour" | "Clear" | "Mixed" = itemFinish || (matchingPi ? ((getItemFinish(matchingPi as any) || matchingPi.finish || matchingPi.colorOrClear) as any) : "Clear");

    result.push({
      batchKey,
      batchNo,
      piNumber: matchingPi?.proformaInvNo || matchingPi?.piNumber || piNumber,
      customerName: matchingPi?.customerName || customerName,
      projectName: matchingPi?.projectName || (first as any).projectName || "Standard Project",
      jobOrderNumber: matchingPi?.jobOrderNumber || (first as any).jobOrderNumber || first.sfoNo || undefined,
      finish: finalFinish,
      totalQty: matchingPi?.totalQty || batchQty,
      totalSqm: matchingPi?.totalSqm || batchSqm,
      defectCount,
      createdAt: matchingPi?.createdAt || (first as any).createdAt || new Date().toISOString(),
      status: matchingPi?.status || "In Production",
      items,
    });
  });

  return result.sort((a, b) => {
    const aNum = Number(a.batchNo);
    const bNum = Number(b.batchNo);
    if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
    return a.batchNo.localeCompare(b.batchNo);
  });
}

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
  const [searchParams, setSearchParams] = useSearchParams();
  const validReportTabs = ["pis", "items", "history", "rejects", "reworks"] as const;
  type ReportTabType = typeof validReportTabs[number];
  
  const urlReportTab = searchParams.get("report_tab") as ReportTabType | null;
  const activeTab: ReportTabType = (urlReportTab && validReportTabs.includes(urlReportTab))
    ? urlReportTab
    : (initialTab || "pis");

  const handleTabSelect = (tab: "pis" | "items" | "history" | "rejects" | "reworks") => {
    try {
      localStorage.setItem("sejal_reports_active_tab", tab);
    } catch {}
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab === "pis") {
        next.delete("report_tab");
      } else {
        next.set("report_tab", tab);
      }
      return next;
    });
    onTabChange?.(tab);
  };

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [lastSyncedTime, setLastSyncedTime] = useState<Date>(new Date());

  // Filter States - Split search into PI / Batch filter and Position / Sticker filter
  const [searchPi, setSearchPi] = useState("");
  const [searchPos, setSearchPos] = useState("");
  const [selectedFinish, setSelectedFinish] = useState<"all" | "Colour" | "Clear">("all");
  const [selectedStage, setSelectedStage] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedCustomer, setSelectedCustomer] = useState<string>("all");
  const [selectedDateRange, setSelectedDateRange] = useState<"all" | "today" | "week" | "month">("all");

  // Rejects & Reworks sub-filter view modes
  const [rejectsFilterMode, setRejectsFilterMode] = useState<"all" | "rejected_only">("all");
  const [reworksFilterMode, setReworksFilterMode] = useState<"all" | "reworks_only">("all");

  // Customer Accordion collapse state (true = open, false = closed)
  const [expandedCustomers, setExpandedCustomers] = useState<Record<string, boolean>>({});
  // Batch / Sheet sub-card collapse state within customer accordions (default closed)
  const [expandedBatchCards, setExpandedBatchCards] = useState<Record<string, boolean>>({});
  const [expandAllSheets, setExpandAllSheets] = useState(false);

  const toggleCustomerExpanded = (custName: string) => {
    setExpandedCustomers((prev) => ({
      ...prev,
      [custName]: !isCustomerExpanded(custName),
    }));
  };

  const isCustomerExpanded = (custName: string) => {
    if (searchPi.trim().length > 0 || searchPos.trim().length > 0) {
      return expandedCustomers[custName] !== false; // Auto-expand when searching
    }
    return Boolean(expandedCustomers[custName]); // Default closed
  };

  const toggleBatchCardExpanded = (cardKey: string) => {
    setExpandedBatchCards((prev) => ({
      ...prev,
      [cardKey]: !isBatchCardExpanded(cardKey),
    }));
  };

  const isBatchCardExpanded = (cardKey: string) => {
    if (searchPi.trim().length > 0 || searchPos.trim().length > 0) {
      return expandedBatchCards[cardKey] !== false; // Auto-expand when searching
    }
    if (expandedBatchCards[cardKey] !== undefined) {
      return expandedBatchCards[cardKey];
    }
    return expandAllSheets; // Default closed (false)
  };

  const setAllCustomersExpanded = (expand: boolean) => {
    const newState: Record<string, boolean> = {};
    customerList.forEach((c) => {
      newState[c] = expand;
    });
    setExpandedCustomers(newState);
    setExpandAllSheets(expand);
    setExpandedBatchCards({});
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
    let debounceTimer: NodeJS.Timeout | null = null;
    try {
      eventSource = new EventSource("/api/production/events");
      const handleStreamUpdate = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          fetchReports(false);
        }, 500);
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
        if (debounceTimer) clearTimeout(debounceTimer);
        eventSource?.close();
      };
    }

    const interval = setInterval(() => {
      fetchReports(false);
    }, 60000);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
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
        rejectedUnits: 0,
        rejectedSqm: 0,
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
    let rejectedUnits = 0;
    let rejectedSqm = 0;

    const allItemSerials = new Set(items.map((i) => i.serialNumber));
    const rejectedSerialSet = new Set<string>();
    rejects.forEach((r) => {
      if (r.serialNumber) rejectedSerialSet.add(r.serialNumber);
      if (r.defectiveSerialNumber) rejectedSerialSet.add(r.defectiveSerialNumber);
      if (r.itemId) rejectedSerialSet.add(r.itemId);
    });

    items.forEach((i) => {
      const eff = getDguEffectiveQtyAndSqm(i);
      totalSqm += eff.sqm;
      if (i.status === "Completed" || i.currentStage === "Finished") {
        completedSqm += eff.sqm;
      }
      if (i.status === "Rejected" || rejectedSerialSet.has(i.serialNumber) || (i.id && rejectedSerialSet.has(i.id))) {
        rejectedUnits += 1;
        rejectedSqm += eff.sqm;
      }
    });

    // Count any standalone rejects
    rejects.forEach((r) => {
      if (r.serialNumber && !allItemSerials.has(r.serialNumber)) {
        rejectedUnits += 1;
      }
    });

    if (rejectedUnits === 0 && rejects.length > 0) {
      rejectedUnits = rejects.length;
    }

    const totalRejects = rejects.length;
    const reworkSerials = new Set<string>();
    reworks.forEach((r) => r.serialNumber && reworkSerials.add(r.serialNumber));
    items.forEach((i) => {
      if (i.status === "Reworking" || (i.status as any) === "Rework") {
        if (i.serialNumber) reworkSerials.add(i.serialNumber);
      }
    });
    const totalReworks = reworkSerials.size > 0 ? reworkSerials.size : reworks.length;
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
      rejectedUnits,
      rejectedSqm,
      totalRejects,
      totalReworks,
      defectRate,
      reworkRate,
      completionRate,
    };
  }, [reportData]);

  // Strict matching for PI Number / Batch Number
  const matchStrictPi = (item: any, query: string): boolean => {
    if (!query || !query.trim()) return true;
    const rawQ = query.trim().toLowerCase();
    const cleanQ = rawQ.replace(/^(pi|batch|order|job|sfo|ob|po|wo)\s*[-#.:/]*\s*/i, "").trim();

    const pi = String(item.piNumber || item.piId || item.id || "").trim().toLowerCase();
    const batch = String(item.batchNo || "").trim().toLowerCase();
    const batchFmt = (item.piNumber ? formatBatchNumber(item.piNumber) : (item.batchNo ? formatBatchNumber(item.batchNo) : "")).trim().toLowerCase();
    const order = String(item.orderNo || item.soNoDate || "").trim().toLowerCase();
    const sfo = String(item.sfoNo || "").trim().toLowerCase();
    const ob = String(item.obNo || "").trim().toLowerCase();
    const proforma = String(item.proformaInvNo || "").trim().toLowerCase();
    const job = String(item.jobOrderNumber || "").trim().toLowerCase();
    const po = String(item.purchaseOrderNo || "").trim().toLowerCase();

    const checkMatch = (val: string) => {
      if (!val || val === "-" || val === "—") return false;
      return val.includes(rawQ) || (cleanQ.length > 0 && val.includes(cleanQ));
    };

    return (
      checkMatch(pi) ||
      checkMatch(batch) ||
      checkMatch(batchFmt) ||
      checkMatch(order) ||
      checkMatch(sfo) ||
      checkMatch(ob) ||
      checkMatch(proforma) ||
      checkMatch(job) ||
      checkMatch(po)
    );
  };

  // Strict matching for Position Number ONLY
  const matchStrictPos = (item: any, query: string): boolean => {
    if (!query || !query.trim()) return true;
    const rawQ = query.trim().toLowerCase();
    const cleanQ = rawQ.replace(/^(pos|position|sr|sl|pos#|pos\.?|sr#|sl#)\s*[-#.:/]*\s*/i, "").trim();

    // 1. Direct item position fields
    const posNoStr = String(item.posNo || "").trim().toLowerCase();
    const cleanPosNo = posNoStr.replace(/^(pos|position|sr|sl)\s*[-#.:/]*\s*/i, "").trim();
    const srNoStr = item.srNo !== undefined && item.srNo !== null ? String(item.srNo).trim().toLowerCase() : "";

    // Exact string match on position (e.g. "1" === "1", "POS 1" === "pos 1", etc.)
    if (posNoStr && (posNoStr === rawQ || posNoStr === cleanQ)) return true;
    if (cleanPosNo && (cleanPosNo === rawQ || cleanPosNo === cleanQ)) return true;

    // Number-equivalent match (e.g. "01" vs "1", "001" vs "1", "1.0" vs "1")
    const numQ = parseInt(cleanQ, 10);
    if (!isNaN(numQ)) {
      const numPos = parseInt(cleanPosNo, 10);
      if (!isNaN(numPos) && numPos === numQ) return true;
      if (srNoStr) {
        const numSr = parseInt(srNoStr, 10);
        if (!isNaN(numSr) && numSr === numQ) return true;
      }
    }

    if (srNoStr && (srNoStr === rawQ || srNoStr === cleanQ)) return true;

    // 2. Exact sticker serial or barcode match ONLY (if user enters a specific full serial or barcode)
    const serial = String(item.serialNumber || "").trim().toLowerCase();
    const barcode = String(item.barcode || "").trim().toLowerCase();
    const qrId = String(item.qrId || "").trim().toLowerCase();

    // Never use substring .includes() because '1' would match almost every barcode!
    if (serial && (serial === rawQ || serial === cleanQ)) return true;
    if (barcode && (barcode === rawQ || barcode === cleanQ)) return true;
    if (qrId && (qrId === rawQ || qrId === cleanQ)) return true;

    // Only allow prefix match if the entered query is long enough (at least 6 characters, e.g. "101262")
    if (cleanQ.length >= 6) {
      if (serial && serial.startsWith(cleanQ)) return true;
      if (barcode && barcode.startsWith(cleanQ)) return true;
    }

    return false;
  };

  // Helper to test if a GlassItem matches searchPi, searchPos, and selectedFinish filters
  const matchesItemFilters = (
    item: GlassItem,
    cust: string,
    extraFields?: {
      reason?: string;
      defectivePane?: string;
      operator?: string;
      stage?: string;
    }
  ) => {
    // 1. Strictly check PI / Batch filter
    if (searchPi.trim()) {
      if (!matchStrictPi(item, searchPi)) {
        return false;
      }
    }

    // 2. Strictly check Pos / Position filter
    if (searchPos.trim()) {
      const matchItemPos = matchStrictPos(item, searchPos);
      const matchDefectSerial =
        extraFields?.defectivePane &&
        matchStrictPos({ serialNumber: extraFields.defectivePane } as any, searchPos);
      if (!matchItemPos && !matchDefectSerial) {
        return false;
      }
    }

    // 3. Finish filter (Colour vs Clear)
    if (selectedFinish !== "all") {
      const finish = getItemFinish(item);
      if (finish !== selectedFinish) {
        return false;
      }
    }

    return true;
  };

  // 1. Filtered Proforma Invoices
  const filteredPis = useMemo(() => {
    if (!reportData?.pis) return [];
    return reportData.pis.filter((pi) => {
      // 1. Strict PI filter
      if (searchPi.trim() && !matchStrictPi(pi, searchPi)) {
        return false;
      }
      // 2. Strict Pos filter: check if any item in this PI matches the position number
      if (searchPos.trim()) {
        const hasMatchingPosItem = (reportData.items || []).some(
          (item) =>
            (item.piNumber === pi.piNumber ||
              item.piId === pi.id ||
              item.piNumber === pi.id ||
              (item as any).orderNo === pi.piNumber ||
              (item as any).orderNo === (pi as any).orderNo ||
              (item.batchNo && (pi as any).batchNo && item.batchNo === (pi as any).batchNo)) &&
            matchStrictPos(item, searchPos)
        );
        if (!hasMatchingPosItem) return false;
      }
      // 3. Finish filter (Colour vs Clear)
      if (selectedFinish !== "all") {
        const piFinish = getItemFinish(pi as any) || pi.finish || pi.colorOrClear;
        if (piFinish && piFinish !== selectedFinish) {
          const hasMatchingFinishItem = (reportData.items || []).some(
            (item) =>
              (item.piNumber === pi.piNumber ||
                item.piId === pi.id ||
                item.piNumber === pi.id ||
                (item as any).orderNo === pi.piNumber ||
                (item as any).orderNo === (pi as any).orderNo ||
                (item.batchNo && (pi as any).batchNo && item.batchNo === (pi as any).batchNo)) &&
              getItemFinish(item) === selectedFinish
          );
          if (!hasMatchingFinishItem) return false;
        }
      }
      if (selectedCustomer !== "all" && (pi.customerName || "").trim() !== selectedCustomer) return false;
      if (selectedStatus !== "all" && pi.status !== selectedStatus) return false;
      if (!isWithinDateRange(pi.createdAt)) return false;
      return true;
    });
  }, [reportData?.pis, reportData?.items, searchPi, searchPos, selectedFinish, selectedCustomer, selectedStatus, selectedDateRange]);

  // 2. Filtered Glass Items
  const filteredItems = useMemo(() => {
    if (!reportData?.items) return [];
    return reportData.items.filter((item) => {
      const cust = getCustomerNameForItem(item);
      if (selectedCustomer !== "all" && cust !== selectedCustomer) return false;
      if (!matchesItemFilters(item, cust)) return false;
      if (selectedStage !== "all" && item.currentStage !== selectedStage) return false;
      if (selectedStatus !== "all" && (item.status || "Pending") !== selectedStatus) return false;
      if (!isWithinDateRange(item.updatedAt || item.createdAt)) return false;
      return true;
    });
  }, [reportData?.items, searchPi, searchPos, selectedFinish, selectedCustomer, selectedStage, selectedStatus, selectedDateRange]);

  // 3. Filtered Audit History
  const filteredHistory = useMemo(() => {
    if (!reportData?.history) return [];
    return reportData.history.filter((h) => {
      const cust = getCustomerNameForItem(h.piNumber || h.itemOrBatch);
      if (selectedCustomer !== "all" && cust !== selectedCustomer) return false;

      // 1. Strict PI filter
      if (searchPi.trim()) {
        const itemMock = {
          piNumber: h.piNumber,
          piId: h.piNumber,
          orderNo: h.itemOrBatch,
          batchNo: h.piNumber,
        };
        if (!matchStrictPi(itemMock, searchPi)) return false;
      }

      // 2. Strict Position filter
      if (searchPos.trim()) {
        const matchedItem = (reportData?.items || []).find(
          (i) => (h.serialNumber && i.serialNumber === h.serialNumber) || (h.itemId && i.id === h.itemId)
        );
        const itemMock = matchedItem || {
          serialNumber: h.serialNumber,
          barcode: h.barcode || h.serialNumber,
          posNo: h.itemOrBatch,
        };
        if (!matchStrictPos(itemMock, searchPos)) return false;
      }

      // 3. Finish filter
      if (selectedFinish !== "all") {
        const matchedItem = (reportData?.items || []).find(
          (i) => (h.serialNumber && i.serialNumber === h.serialNumber) || (h.itemId && i.id === h.itemId)
        );
        const glassType = matchedItem?.glassType || (h as any).glassType;
        if (glassType) {
          const hFinish = getItemFinish({ glassType } as any);
          if (hFinish !== selectedFinish) return false;
        }
      }

      if (selectedStage !== "all" && h.stage !== selectedStage) return false;
      if (!isWithinDateRange(h.timestamp)) return false;
      return true;
    });
  }, [reportData?.history, reportData?.items, searchPi, searchPos, selectedFinish, selectedCustomer, selectedStage, selectedDateRange]);

  // 4. Quality Rejects Log - Customer-Wise Grouping with All Stickers Visible
  const rejectCustomerGroups = useMemo(() => {
    if (!reportData) return [];

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

      if (
        !matchesItemFilters(item, cust, {
          reason: rRecord?.reason || (rRecord as any)?.defectDetails || (rRecord as any)?.defectType || item.remarks,
          defectivePane: rRecord?.defectivePane || rRecord?.defectiveSerialNumber || rRecord?.partnerSerialNumber,
          operator: rRecord?.operator,
          stage: rRecord?.stage || item.currentStage,
        })
      ) {
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
  }, [reportData, searchPi, searchPos, selectedFinish, selectedCustomer, selectedStage, selectedDateRange, rejectsFilterMode, rejectMap]);

  // Total reject items count in filtered view
  const totalRejectsInFilter = useMemo(() => {
    return (reportData?.rejects || []).length;
  }, [reportData?.rejects]);

  // 5. Reworks Log - Customer-Wise Grouping with All Stickers Visible
  const reworkCustomerGroups = useMemo(() => {
    if (!reportData) return [];

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

    // Auto-include any standalone rejects as auto-remake entries if not in reworks yet
    const standaloneRejects: GlassItem[] = (reportData.rejects || [])
      .filter((rej) => !allItemSerials.has(rej.serialNumber) && !(reportData.reworks || []).some((rw) => rw.serialNumber === rej.serialNumber))
      .map((r) => ({
        id: `rw-rej-${r.serialNumber}`,
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
        currentStage: "Cutting",
        completedStages: [],
        status: "Reworking",
        remarks: `[Auto-Remake after Rejection] ${r.reason}`,
        updatedAt: r.date || new Date().toISOString(),
      }));

    const combined = [...(reportData.items || []), ...standaloneReworks, ...standaloneRejects];
    const map = new Map<string, Array<{ item: GlassItem; reworkRecord?: ReworkRecord; isReworking: boolean }>>();

    combined.forEach((item) => {
      const cust = getCustomerNameForItem(item);
      if (selectedCustomer !== "all" && cust !== selectedCustomer) return;

      const rwRecord = reworkMap.get(item.serialNumber) || (item.id ? reworkMap.get(item.id) : undefined);
      const rejRecord = rejectMap.get(item.serialNumber) || (item.id ? rejectMap.get(item.id) : undefined);

      const effectiveRwRecord: ReworkRecord | undefined = rwRecord || (rejRecord ? {
        id: `rew-${rejRecord.id || rejRecord.serialNumber}`,
        serialNumber: rejRecord.serialNumber,
        barcode: rejRecord.barcode,
        piNumber: rejRecord.piNumber,
        fromStage: rejRecord.stage || "Cutting",
        targetStage: "Cutting",
        reason: `[Auto-Remake after Rejection] ${rejRecord.reason}`,
        defectivePane: rejRecord.defectivePane,
        defectiveSerialNumber: rejRecord.defectiveSerialNumber,
        partnerSerialNumber: rejRecord.partnerSerialNumber,
        date: rejRecord.date || new Date().toISOString(),
        operator: rejRecord.operator || "Operator",
      } : undefined);

      const isReworking = (item.status as any) === "Reworking" || (item.status as any) === "Rework" || Boolean(rwRecord);

      if (reworksFilterMode === "reworks_only" && !isReworking) return;

      if (
        !matchesItemFilters(item, cust, {
          reason: effectiveRwRecord?.reason || (effectiveRwRecord as any)?.reworkDetails || rejRecord?.reason || item.remarks,
          defectivePane: effectiveRwRecord?.defectivePane || effectiveRwRecord?.defectiveSerialNumber || effectiveRwRecord?.partnerSerialNumber || rejRecord?.defectivePane,
          operator: effectiveRwRecord?.operator || rejRecord?.operator,
          stage: effectiveRwRecord?.targetStage || effectiveRwRecord?.fromStage || rejRecord?.stage || item.currentStage,
        })
      ) {
        return;
      }

      if (selectedStage !== "all") {
        const itemStage = effectiveRwRecord?.targetStage || effectiveRwRecord?.fromStage || rejRecord?.stage || item.currentStage;
        if (itemStage !== selectedStage) return;
      }

      if (!isWithinDateRange(effectiveRwRecord?.date || rejRecord?.date || item.updatedAt || item.createdAt)) return;

      if (!map.has(cust)) {
        map.set(cust, []);
      }
      map.get(cust)!.push({ item, reworkRecord: effectiveRwRecord, isReworking });
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
  }, [reportData, searchPi, searchPos, selectedFinish, selectedCustomer, selectedStage, selectedDateRange, reworksFilterMode, reworkMap, rejectMap]);

  // Total rework items count in filtered view
  const totalReworksInFilter = useMemo(() => {
    const reworkSerials = new Set<string>();
    (reportData?.reworks || []).forEach((rw) => {
      if (rw.serialNumber) reworkSerials.add(rw.serialNumber);
    });
    (reportData?.items || []).forEach((item) => {
      if (item.status === "Reworking" || (item.status as any) === "Rework") {
        if (item.serialNumber) reworkSerials.add(item.serialNumber);
      }
    });
    return reworkSerials.size > 0 ? reworkSerials.size : (reportData?.reworks || []).length;
  }, [reportData?.reworks, reportData?.items]);

  // Export current filtered view to Excel with styled layout
  const handleExportCurrentView = () => {
    const wb = XLSX.utils.book_new();
    const dateStr = new Date().toISOString().split("T")[0];

    if (activeTab === "pis") {
      if (filteredPis.length === 0) {
        toast.error("No batch data to export in the current filtered view");
        return;
      }
      const data = filteredPis.map((p, idx) => {
        const batchFmt = formatBatchNumber(p.batchNo || p.piNumber) || p.piNumber;
        const distinctPi = p.proformaInvNo &&
          formatBatchNumber(p.proformaInvNo) !== batchFmt &&
          p.proformaInvNo !== p.piNumber &&
          p.proformaInvNo !== p.jobOrderNumber
            ? p.proformaInvNo
            : "—";

        return {
          "Sr No": idx + 1,
          "Batch Number": batchFmt,
          "PI Number": distinctPi,
          "Job Order No": p.jobOrderNumber || "—",
        "Customer Name": p.customerName || "—",
        "Project Name": p.projectName || "—",
        "Glass Finish": getItemFinish(p as any) || p.finish || p.colorOrClear || "Clear",
        "Total Quantity": p.totalQty,
        "Total SQM": p.totalSqm,
        "Status": p.status,
        "Uploaded Date": formatPlatformDate(p.createdAt),
      };
    });
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
      const exportRows = filteredItems.map((item, idx) => {
        const eff = getDguEffectiveQtyAndSqm(item);
        const finish = getItemFinish(item);
        const cust = getCustomerNameForItem(item);
        const matchingPI = (reportData?.pis || []).find(
          (p) => p.id === item.piId || p.piNumber === item.piNumber || (item.batchNo && p.batchNo === item.batchNo)
        );

        const productType = isDlguGlass(item) || (item as any).glassCategory === "DLGU"
          ? "DLGU Unit"
          : isDguGlass(item) || (item as any).glassCategory === "DGU"
          ? "DGU / IGU Unit"
          : isLaminatedGlass(item) || (item as any).glassCategory === "Lamination"
          ? "Laminated Glass"
          : "General Monolithic";

        const routeText = Array.isArray(item.processRoute)
          ? item.processRoute.join(" → ")
          : String(item.processRoute || "—");

        const makeupDetails = resolveGlassMakeupDetails(item, filteredItems, reportData?.pis || []);

        return {
          "Sr No": idx + 1,
          "Order #": item.orderNo || matchingPI?.jobOrderNumber || matchingPI?.proformaInvNo || "—",
          "OB #": item.obNo || matchingPI?.obNo || "—",
          "SFO #": item.sfoNo || matchingPI?.sfoNo || matchingPI?.jobOrderNumber || "—",
          "Batch #": item.batchNo || formatBatchNumber(item.piNumber) || matchingPI?.batchNo || "—",
          "POS #": item.posNo || "—",
          "Barcode": item.barcode,
          "Serial Number": item.serialNumber,
          "Customer Name": cust,
          "Project Name": item.projectName || matchingPI?.projectName || "—",
          "Glass Code": item.glassCode || item.itemCode || "—",
          "Glass Description": item.glassType,
          "Glass Makeup / Buildup": makeupDetails.makeup,
          "Outer Glass (OP)": makeupDetails.outerGlass,
          "Spacer / Cavity": makeupDetails.spacer,
          "Inner Glass (IP)": makeupDetails.innerGlass,
          "Product Category": productType,
          "Glass Finish": finish,
          "Width (mm)": item.width,
          "Height (mm)": item.height,
          "Order Qty (Line Qty)": item.lineQty || item.qty || 1,
          "Stage Qty": eff.qty,
          "Unit": eff.unitLabel,
          "Total SQM": eff.sqm,
          "Sheet / Rack No": item.rackNo || "—",
          "Process Route": routeText,
          "Delivery Date": item.delDate || matchingPI?.deliveryDate || "—",
          "OPT Date": item.optDate || matchingPI?.sfoDate || matchingPI?.issueDate || "—",
          "Origin": "MADE IN UAE",
          "Delivery Location": item.delLocation || "FACTORY",
          "Current Stage": getDisplayStage(item, item.currentStage),
          "Status": item.status || "Pending",
          "Last Updated": formatDubaiDateTime(item.updatedAt || item.createdAt),
          "Remarks": item.remarks || "",
        };
      });
      const ws = XLSX.utils.json_to_sheet(exportRows);
      ws["!cols"] = [
        { wch: 6 },  // Sr No
        { wch: 12 }, // Order #
        { wch: 12 }, // OB #
        { wch: 12 }, // SFO #
        { wch: 14 }, // Batch #
        { wch: 8 },  // POS #
        { wch: 22 }, // Barcode
        { wch: 14 }, // Serial Number
        { wch: 30 }, // Customer Name
        { wch: 22 }, // Project Name
        { wch: 22 }, // Glass Code
        { wch: 36 }, // Glass Description
        { wch: 30 }, // Glass Makeup
        { wch: 18 }, // Product Category
        { wch: 12 }, // Glass Finish
        { wch: 12 }, // Width
        { wch: 12 }, // Height
        { wch: 14 }, // Order Qty
        { wch: 10 }, // Stage Qty
        { wch: 10 }, // Unit
        { wch: 12 }, // Total SQM
        { wch: 14 }, // Sheet / Rack No
        { wch: 26 }, // Process Route
        { wch: 14 }, // Delivery Date
        { wch: 14 }, // OPT Date
        { wch: 14 }, // Origin
        { wch: 16 }, // Delivery Location
        { wch: 16 }, // Current Stage
        { wch: 14 }, // Status
        { wch: 22 }, // Last Updated
        { wch: 25 }, // Remarks
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
            "Current Stage": getDisplayStage(item, item.currentStage),
            "Quality Status": isRejected ? "REJECTED" : item.status || "In Production",
            "Defect Stage": getDisplayStage(item, rejectRecord?.stage || (isRejected ? item.currentStage : "—")),
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
            "Current Stage": getDisplayStage(item, item.currentStage),
            "Rework Status": isReworking ? "REWORKING" : item.status || "In Production",
            "From Stage": getDisplayStage(item, reworkRecord?.fromStage || "—"),
            "Target Stage": getDisplayStage(item, reworkRecord?.targetStage || (isReworking ? item.currentStage : "—")),
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
    setSearchPi("");
    setSearchPos("");
    setSelectedFinish("all");
    setSelectedCustomer("all");
    setSelectedStage("all");
    setSelectedStatus("all");
    setSelectedDateRange("all");
    setRejectsFilterMode("all");
    setReworksFilterMode("all");
  };

  const hasActiveFilters =
    searchPi !== "" ||
    searchPos !== "" ||
    selectedFinish !== "all" ||
    selectedCustomer !== "all" ||
    selectedStage !== "all" ||
    selectedStatus !== "all" ||
    selectedDateRange !== "all" ||
    rejectsFilterMode !== "all" ||
    reworksFilterMode !== "all";

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shadow-lg">
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
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-blue-500 to-blue-700 flex items-center justify-center text-white shadow-lg shrink-0">
            <BarChart2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight whitespace-nowrap">
                Live Production &amp; Quality Reports
              </h2>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Real-Time Sync Active</span>
              </div>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Customer-wise production tracking, quality defects, rework routes, and instant Excel exports.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Auto Sync Toggle */}
          <button
            type="button"
            onClick={() => setAutoSync(!autoSync)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 cursor-pointer ${
              autoSync
                ? "bg-blue-50 border-blue-200 text-blue-700"
                : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
            }`}
            title={autoSync ? "Auto-sync every 10s is ON" : "Auto-sync is paused"}
          >
            <Zap className={`w-3.5 h-3.5 ${autoSync ? "text-blue-600" : "text-slate-400"}`} />
            <span>Auto-Sync {autoSync ? "ON (10s)" : "PAUSED"}</span>
          </button>

          {/* Sync Now Button */}
          <Button
            type="button"
            onClick={() => fetchReports(false)}
            disabled={isRefreshing}
            size="sm"
            variant="outline"
            className="h-8 text-xs font-bold border-slate-300 hover:bg-slate-50 text-slate-700 gap-1.5 rounded-xl"
            title="Fetch latest database state immediately"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-blue-600" : ""}`} />
            <span>{isRefreshing ? "Syncing..." : "Sync Now"}</span>
          </Button>

          {/* Export to Excel Button */}
          <Button
            type="button"
            onClick={handleExportCurrentView}
            size="sm"
            className="bg-gradient-to-r from-emerald-500 to-emerald-700 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 h-8 rounded-xl shadow-md"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export Filtered</span>
          </Button>
        </div>
      </div>

      {/* ── LIVE KPI METRICS SUMMARY BANNER ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* 1. Total Batches */}
        <div
          onClick={() => handleTabSelect("pis")}
          className={`p-4 rounded-2xl border transition-all duration-200 cursor-pointer hover:shadow-md hover:-translate-y-0.5 relative overflow-hidden group select-none ${
            activeTab === "pis"
              ? "bg-blue-50/30 border-blue-400 ring-2 ring-blue-500/30 shadow-md"
              : "bg-white border-slate-200 hover:border-blue-300 shadow-md"
          }`}
          title="Click to view all Proforma Invoices & Batches"
          role="button" tabIndex={0}
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shrink-0 shadow-lg text-white">
              <Boxes className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider group-hover:text-blue-700 transition-colors">
                Total Batches
              </div>
              <div className="text-2xl font-black text-slate-900 mt-0.5 tracking-tight font-mono leading-none">
                {summaryMetrics.totalPis}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-3">
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md">
              <CheckCircle className="w-3 h-3" /> {summaryMetrics.completedPis} Done
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-1 text-[11px] text-blue-700 font-semibold">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            <span>{summaryMetrics.inProgressPis} in Production</span>
          </div>
        </div>

        {/* 2. Total Rejected Glass Units */}
        <div
          onClick={() => {
            handleTabSelect("rejects");
            setRejectsFilterMode("rejected_only");
          }}
          className={`p-4 rounded-2xl border transition-all duration-200 cursor-pointer hover:shadow-md hover:-translate-y-0.5 relative overflow-hidden group select-none ${
            activeTab === "rejects" && rejectsFilterMode === "rejected_only"
              ? "bg-rose-50/30 border-rose-400 ring-2 ring-rose-500/30 shadow-md"
              : "bg-white border-slate-200 hover:border-rose-300 shadow-md"
          }`}
          title="Click to view only Rejected Glass Pieces"
          role="button" tabIndex={0}
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-rose-500 to-rose-700 flex items-center justify-center shrink-0 shadow-lg text-white">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider group-hover:text-rose-700 transition-colors">
                Rejected Pieces
              </div>
              <div className="text-2xl font-black text-rose-700 mt-0.5 tracking-tight font-mono leading-none">
                {summaryMetrics.rejectedUnits}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-3">
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded-md">
              <AlertTriangle className="w-3 h-3" /> {summaryMetrics.defectRate.toFixed(1)}% Scrap
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-1 text-[11px] text-rose-600 font-semibold">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500"></span>
            <span>Total Defective Glass</span>
          </div>
        </div>

        {/* 3. Total Rejected Glass Volume (SQM) */}
        <div
          onClick={() => {
            handleTabSelect("rejects");
            setRejectsFilterMode("rejected_only");
          }}
          className={`p-4 rounded-2xl border transition-all duration-200 cursor-pointer hover:shadow-md hover:-translate-y-0.5 relative overflow-hidden group select-none ${
            activeTab === "rejects" && rejectsFilterMode === "rejected_only"
              ? "bg-rose-50/30 border-rose-400 ring-2 ring-rose-500/30 shadow-md"
              : "bg-white border-slate-200 hover:border-rose-300 shadow-md"
          }`}
          title="Click to view Scrapped Glass Volume"
          role="button" tabIndex={0}
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-amber-500 to-rose-600 flex items-center justify-center shrink-0 shadow-lg text-white">
              <AlertOctagon className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider group-hover:text-rose-700 transition-colors">
                Rejected Volume
              </div>
              <div className="text-2xl font-black text-rose-700 mt-0.5 tracking-tight font-mono leading-none">
                {formatAENumber(summaryMetrics.rejectedSqm, 1)} <span className="text-xs font-bold text-slate-500">m²</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-3">
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded-md">
              Scrapped Area
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-1 text-[11px] text-slate-500 font-semibold">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-400"></span>
            <span>Material Loss Tracker</span>
          </div>
        </div>

        {/* 4. Quality Rejects Log */}
        <div
          onClick={() => {
            handleTabSelect("rejects");
            setRejectsFilterMode("rejected_only");
          }}
          className={`p-4 rounded-2xl border transition-all duration-200 cursor-pointer hover:shadow-md hover:-translate-y-0.5 relative overflow-hidden group select-none ${
            activeTab === "rejects" && rejectsFilterMode === "rejected_only"
              ? "bg-rose-50/30 border-rose-400 ring-2 ring-rose-500/30 shadow-md"
              : "bg-white border-slate-200 hover:border-rose-300 shadow-md"
          }`}
          title="Click to view only Quality Rejects & Defect Scrap"
          role="button" tabIndex={0}
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-red-500 to-rose-700 flex items-center justify-center shrink-0 shadow-lg text-white">
              <AlertCircle className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider group-hover:text-red-700 transition-colors">
                Quality Rejects
              </div>
              <div className="text-2xl font-black text-rose-700 mt-0.5 tracking-tight font-mono leading-none">
                {summaryMetrics.totalRejects}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-3">
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-red-700 bg-red-50 px-1.5 py-0.5 rounded-md">
              <ShieldCheck className="w-3 h-3" /> {summaryMetrics.defectRate.toFixed(1)}% Rate
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-1 text-[11px] text-red-600 font-semibold">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500"></span>
            <span>Recorded Scrap &amp; Defects</span>
          </div>
        </div>

        {/* 5. Reworks Log */}
        <div
          onClick={() => {
            handleTabSelect("reworks");
            setReworksFilterMode("reworks_only");
          }}
          className={`p-4 rounded-2xl border transition-all duration-200 cursor-pointer hover:shadow-md hover:-translate-y-0.5 relative overflow-hidden group select-none ${
            activeTab === "reworks" && reworksFilterMode === "reworks_only"
              ? "bg-amber-50/30 border-amber-400 ring-2 ring-amber-500/30 shadow-md"
              : "bg-white border-slate-200 hover:border-amber-300 shadow-md"
          }`}
          title="Click to view only Reprocessed / In-Rework pieces"
          role="button" tabIndex={0}
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shrink-0 shadow-lg text-white">
              <RotateCcw className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider group-hover:text-amber-700 transition-colors">
                Reworks
              </div>
              <div className="text-2xl font-black text-amber-700 mt-0.5 tracking-tight font-mono leading-none">
                {summaryMetrics.totalReworks}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-3">
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md">
              <RotateCcw className="w-3 h-3" /> {summaryMetrics.reworkRate.toFixed(1)}% Rate
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-1 text-[11px] text-amber-700 font-semibold">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            <span>Reprocessed Pieces</span>
          </div>
        </div>
      </div>

      {/* ── REAL-TIME FILTER BAR ── */}
      <div className="bg-white p-3 rounded-xl border border-slate-200/90 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-slate-700 font-bold text-xs uppercase tracking-wider">
          <Filter className="w-4 h-4 text-indigo-600" />
          <span>Filters</span>
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

          {/* Finish Filter (Colour vs Clear) */}
          <select
            value={selectedFinish}
            onChange={(e) => setSelectedFinish(e.target.value as any)}
            className="h-9 px-2.5 rounded-lg border border-slate-200 bg-slate-50/60 text-slate-700 font-semibold text-xs focus:ring-1 focus:ring-indigo-500 focus:bg-white"
            title="Filter by Glass Finish"
          >
            <option value="all">All Finishes</option>
            <option value="Colour">Colour Glass</option>
            <option value="Clear">Clear Glass</option>
          </select>

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
              ? "border-blue-600 text-blue-600 font-extrabold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Proforma Invoices / Batches ({filteredPis.length})
        </button>
        <button
          onClick={() => handleTabSelect("items")}
          className={`pb-2.5 px-4 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer ${
            activeTab === "items"
              ? "border-blue-600 text-blue-600 font-extrabold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Glass Units &amp; Inventory ({filteredItems.length})
        </button>
        <button
          onClick={() => handleTabSelect("history")}
          className={`pb-2.5 px-4 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer ${
            activeTab === "history"
              ? "border-blue-600 text-blue-600 font-extrabold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Audit History Trail ({filteredHistory.length})
        </button>
        <button
          onClick={() => handleTabSelect("rejects")}
          className={`pb-2.5 px-4 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            activeTab === "rejects"
              ? "border-blue-600 text-blue-600 font-extrabold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <span>Quality Rejects Log</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
            totalRejectsInFilter > 0
              ? "bg-rose-100 text-rose-700 border border-rose-200"
              : "bg-slate-100 text-slate-600"
          }`}>
            {totalRejectsInFilter}
          </span>
        </button>
        <button
          onClick={() => handleTabSelect("reworks")}
          className={`pb-2.5 px-4 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            activeTab === "reworks"
              ? "border-blue-600 text-blue-600 font-extrabold"
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
          <div>
            {/* Tab Search Toolbar */}
            <div className="p-3 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-[320px] max-w-xl">
                {/* 1. PI / Batch Search Input */}
                <div className="relative flex-1 min-w-[140px]">
                  <FileText className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-blue-500" />
                  <Input
                    type="text"
                    placeholder="Search PI # / Batch #..."
                    value={searchPi}
                    onChange={(e) => setSearchPi(e.target.value)}
                    className="pl-8 pr-7 h-8 text-xs font-medium border-slate-200 bg-white focus:bg-white rounded-lg"
                  />
                  {searchPi && (
                    <button
                      type="button"
                      onClick={() => setSearchPi("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                      title="Clear PI search"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* 2. Position # / Sticker Search Input */}
                <div className="relative flex-1 min-w-[140px]">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-purple-500" />
                  <Input
                    type="text"
                    placeholder="Search Position # (e.g. 1, 2)..."
                    value={searchPos}
                    onChange={(e) => setSearchPos(e.target.value)}
                    className="pl-8 pr-7 h-8 text-xs font-medium border-slate-200 bg-white focus:bg-white rounded-lg"
                  />
                  {searchPos && (
                    <button
                      type="button"
                      onClick={() => setSearchPos("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                      title="Clear Pos search"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  className="h-8 px-3 text-xs font-bold bg-gradient-to-r from-indigo-500 to-indigo-700 hover:bg-indigo-700 text-white rounded-lg shadow-2xs flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Search</span>
                </Button>
              </div>

              {/* Finish Filter: All / Colour / Clear */}
              <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setSelectedFinish("all")}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    selectedFinish === "all"
                      ? "bg-white text-slate-900 shadow-md"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  All Finish
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFinish("Colour")}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                    selectedFinish === "Colour"
                      ? "bg-gradient-to-r from-purple-500 to-purple-700 text-white shadow-md"
                      : "text-purple-700 hover:text-purple-900 hover:bg-purple-50"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${selectedFinish === "Colour" ? "bg-white" : "bg-purple-500"}`} />
                  <span>Colour</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFinish("Clear")}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                    selectedFinish === "Clear"
                      ? "bg-sky-600 text-white shadow-md"
                      : "text-sky-700 hover:text-sky-900 hover:bg-sky-50"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${selectedFinish === "Clear" ? "bg-white" : "bg-sky-400"}`} />
                  <span>Clear</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/90 text-slate-600 uppercase border-b border-slate-200 text-[11px] font-extrabold tracking-wider">
                  <th className="p-3">Batch No</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Project / Job Order</th>
                  <th className="p-3 text-center whitespace-nowrap min-w-[90px]">Finish</th>
                  <th className="p-3 text-center whitespace-nowrap">Items Progress</th>
                  <th className="p-3 text-right whitespace-nowrap">Total SQM</th>
                  <th className="p-3 whitespace-nowrap">Uploaded Date</th>
                  <th className="p-3 text-center whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {filteredPis.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500 font-medium">
                      No batch records matched your filter.
                    </td>
                  </tr>
                ) : (
                  filteredPis.map((pi: PIMaster) => {
                    const formattedBatch = formatBatchNumber(pi.batchNo || pi.piNumber);
                    const distinctPi = pi.proformaInvNo &&
                      pi.proformaInvNo !== formattedBatch &&
                      pi.proformaInvNo !== pi.piNumber &&
                      pi.proformaInvNo !== pi.jobOrderNumber &&
                      formatBatchNumber(pi.proformaInvNo) !== formattedBatch
                        ? pi.proformaInvNo
                        : null;

                    return (
                      <tr key={pi.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 font-mono font-bold text-purple-700 whitespace-nowrap">
                          {formattedBatch}
                        </td>
                        <td className="p-3 font-bold text-slate-900">{pi.customerName || "—"}</td>
                        <td className="p-3 text-slate-600">
                          <div className="font-semibold text-slate-800">{pi.projectName || "Standard Project"}</div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {pi.jobOrderNumber && (
                              <div className="text-[10px] font-mono text-slate-400">Job: {pi.jobOrderNumber}</div>
                            )}
                            {distinctPi && (
                              <div className="text-[10px] font-mono text-blue-600 font-semibold">PI: {distinctPi}</div>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          {(() => {
                            const piFinish = getItemFinish(pi as any) || pi.finish || pi.colorOrClear || "Clear";
                            return (
                              <span
                                className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-md text-[10.5px] font-black uppercase tracking-wider whitespace-nowrap border ${
                                  piFinish === "Colour"
                                    ? "bg-purple-100 text-purple-800 border-purple-200"
                                    : "bg-sky-100 text-sky-800 border-sky-200"
                                }`}
                              >
                                {piFinish}
                              </span>
                            );
                          })()}
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
          </div>
        )}

        {/* 2. GLASS ITEMS TAB */}
        {activeTab === "items" && (
          <div>
            {/* Tab Search Toolbar */}
            <div className="p-3 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-[320px] max-w-xl">
                {/* 1. PI / Batch Search Input */}
                <div className="relative flex-1 min-w-[140px]">
                  <FileText className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-blue-500" />
                  <Input
                    type="text"
                    placeholder="Search PI # / Batch #..."
                    value={searchPi}
                    onChange={(e) => setSearchPi(e.target.value)}
                    className="pl-8 pr-7 h-8 text-xs font-medium border-slate-200 bg-white focus:bg-white rounded-lg"
                  />
                  {searchPi && (
                    <button
                      type="button"
                      onClick={() => setSearchPi("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                      title="Clear PI search"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* 2. Position # / Sticker Search Input */}
                <div className="relative flex-1 min-w-[140px]">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-purple-500" />
                  <Input
                    type="text"
                    placeholder="Search Position # (e.g. 1, 2)..."
                    value={searchPos}
                    onChange={(e) => setSearchPos(e.target.value)}
                    className="pl-8 pr-7 h-8 text-xs font-medium border-slate-200 bg-white focus:bg-white rounded-lg"
                  />
                  {searchPos && (
                    <button
                      type="button"
                      onClick={() => setSearchPos("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                      title="Clear Pos search"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  className="h-8 px-3 text-xs font-bold bg-gradient-to-r from-indigo-500 to-indigo-700 hover:bg-indigo-700 text-white rounded-lg shadow-2xs flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Search</span>
                </Button>
              </div>

              {/* Finish Filter: All / Colour / Clear */}
              <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setSelectedFinish("all")}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    selectedFinish === "all"
                      ? "bg-white text-slate-900 shadow-md"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  All Finish
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFinish("Colour")}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                    selectedFinish === "Colour"
                      ? "bg-gradient-to-r from-purple-500 to-purple-700 text-white shadow-md"
                      : "text-purple-700 hover:text-purple-900 hover:bg-purple-50"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${selectedFinish === "Colour" ? "bg-white" : "bg-purple-500"}`} />
                  <span>Colour</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFinish("Clear")}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                    selectedFinish === "Clear"
                      ? "bg-sky-600 text-white shadow-md"
                      : "text-sky-700 hover:text-sky-900 hover:bg-sky-50"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${selectedFinish === "Clear" ? "bg-white" : "bg-sky-400"}`} />
                  <span>Clear</span>
                </button>
              </div>
            </div>

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
                          {eff.qty}
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
                            {getDisplayStage(i, i.currentStage)}
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
                            {onReject && i.status !== "Rejected" && i.currentStage !== "Cutting" && (
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
                            {onRework && i.currentStage !== "Cutting" && (i.status === "Rejected" || i.status === "Reworking" || Boolean(reworkMap.get(i.serialNumber)) || Boolean(rejectMap.get(i.serialNumber))) && (
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
          </div>
        )}

        {/* 3. AUDIT HISTORY TAB */}
        {activeTab === "history" && (
          <div>
            {/* Tab Search Toolbar */}
            <div className="p-3 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-[320px] max-w-xl">
                {/* 1. PI / Batch Search Input */}
                <div className="relative flex-1 min-w-[140px]">
                  <FileText className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-blue-500" />
                  <Input
                    type="text"
                    placeholder="Search PI # / Batch #..."
                    value={searchPi}
                    onChange={(e) => setSearchPi(e.target.value)}
                    className="pl-8 pr-7 h-8 text-xs font-medium border-slate-200 bg-white focus:bg-white rounded-lg"
                  />
                  {searchPi && (
                    <button
                      type="button"
                      onClick={() => setSearchPi("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                      title="Clear PI search"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* 2. Position # / Sticker Search Input */}
                <div className="relative flex-1 min-w-[140px]">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-purple-500" />
                  <Input
                    type="text"
                    placeholder="Search Position # (e.g. 1, 2)..."
                    value={searchPos}
                    onChange={(e) => setSearchPos(e.target.value)}
                    className="pl-8 pr-7 h-8 text-xs font-medium border-slate-200 bg-white focus:bg-white rounded-lg"
                  />
                  {searchPos && (
                    <button
                      type="button"
                      onClick={() => setSearchPos("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                      title="Clear Pos search"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  className="h-8 px-3 text-xs font-bold bg-gradient-to-r from-indigo-500 to-indigo-700 hover:bg-indigo-700 text-white rounded-lg shadow-2xs flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Search</span>
                </Button>
              </div>

              {/* Finish Filter: All / Colour / Clear */}
              <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setSelectedFinish("all")}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    selectedFinish === "all"
                      ? "bg-white text-slate-900 shadow-md"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  All Finish
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFinish("Colour")}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                    selectedFinish === "Colour"
                      ? "bg-gradient-to-r from-purple-500 to-purple-700 text-white shadow-md"
                      : "text-purple-700 hover:text-purple-900 hover:bg-purple-50"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${selectedFinish === "Colour" ? "bg-white" : "bg-purple-500"}`} />
                  <span>Colour</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFinish("Clear")}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                    selectedFinish === "Clear"
                      ? "bg-sky-600 text-white shadow-md"
                      : "text-sky-700 hover:text-sky-900 hover:bg-sky-50"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${selectedFinish === "Clear" ? "bg-white" : "bg-sky-400"}`} />
                  <span>Clear</span>
                </button>
              </div>
            </div>

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
                        ? "Sent to Rework"
                        : "Production Log");

                    const prev = h.prevStatus || "Pending";
                    const next = h.newStatus || h.status || "In Production";
                    const cust = getCustomerNameForItem(h.piNumber || h.itemOrBatch);
                    const targetItem = (reportData?.items || []).find(
                      (i) => (h.serialNumber && i.serialNumber === h.serialNumber) || (h.itemId && i.id === h.itemId)
                    );

                    return (
                      <tr key={h.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 font-mono text-slate-500 whitespace-nowrap">
                          {formatDubaiDateTime(h.timestamp)}
                        </td>
                        <td className="p-3 font-semibold text-slate-900 whitespace-nowrap">
                          <div className="truncate max-w-[150px]" title={cust}>{cust}</div>
                        </td>
                        <td className="p-3 font-medium text-slate-700 whitespace-nowrap">
                          {h.operator || h.user || "System"}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10.5px] font-bold border ${
                              actionName.includes("Reject")
                                ? "bg-red-50 text-red-700 border-red-200"
                                : actionName.includes("Rework")
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : "bg-emerald-50 text-emerald-700 border-emerald-200"
                            }`}
                          >
                            {actionName}
                          </span>
                        </td>
                        <td className="p-3 font-mono font-medium text-slate-900 whitespace-nowrap">
                          {h.itemOrBatch || h.serialNumber || h.piNumber || "—"}
                          {h.piNumber && (
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
                              {onReject && targetItem.status !== "Rejected" && targetItem.currentStage !== "Cutting" && (
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
                              {onRework && targetItem.currentStage !== "Cutting" && (targetItem.status === "Rejected" || targetItem.status === "Reworking" || Boolean(reworkMap.get(targetItem.serialNumber)) || Boolean(rejectMap.get(targetItem.serialNumber))) && (
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
          </div>
        )}

        {/* 4. QUALITY REJECTS LOG TAB (CUSTOMER-WISE) */}
        {activeTab === "rejects" && (
          <div className="space-y-4 p-4 bg-slate-50/50">
            {/* Sub-header Controls Bar */}
            <div className="bg-white p-3 sm:p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-2.5">
              {/* Row 1: View Mode Switcher, Finish Filters & Accordion Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-slate-100">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-500" /> View Mode:
                  </span>
                  {/* Mode toggle: All Stickers vs Rejected Only */}
                  <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-bold shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setRejectsFilterMode("all")}
                      className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                        rejectsFilterMode === "all"
                          ? "bg-white text-slate-900 shadow-md"
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
                          ? "bg-red-600 text-white shadow-md"
                          : "text-red-700 hover:text-red-900 hover:bg-red-50"
                      }`}
                    >
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Rejected Defects ({totalRejectsInFilter})</span>
                    </button>
                  </div>

                  {/* Finish Filter: All / Colour / Clear */}
                  <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-bold shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setSelectedFinish("all")}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                        selectedFinish === "all"
                          ? "bg-white text-slate-900 shadow-md"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      All Finish
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedFinish("Colour")}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                        selectedFinish === "Colour"
                          ? "bg-gradient-to-r from-purple-500 to-purple-700 text-white shadow-md"
                          : "text-purple-700 hover:text-purple-900 hover:bg-purple-50"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${selectedFinish === "Colour" ? "bg-white" : "bg-purple-500"}`} />
                      <span>Colour</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedFinish("Clear")}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                        selectedFinish === "Clear"
                          ? "bg-sky-600 text-white shadow-md"
                          : "text-sky-700 hover:text-sky-900 hover:bg-sky-50"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${selectedFinish === "Clear" ? "bg-white" : "bg-sky-400"}`} />
                      <span>Clear</span>
                    </button>
                  </div>
                </div>

                {/* Right Side: Expand/Collapse All Buttons */}
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAllCustomersExpanded(true)}
                    className="h-7.5 text-xs font-bold border-slate-200 hover:bg-slate-50 text-slate-700 shadow-2xs"
                  >
                    Expand All
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAllCustomersExpanded(false)}
                    className="h-7.5 text-xs font-bold border-slate-200 hover:bg-slate-50 text-slate-700 shadow-2xs"
                  >
                    Collapse All
                  </Button>
                </div>
              </div>

              {/* Row 2: Search Inputs Bar (Comfortable Full Width, No Text Cutoff) */}
              <div className="flex flex-wrap items-center gap-2.5">
                {/* 1. PI / Batch Search Input */}
                <div className="relative flex-1 min-w-[200px]">
                  <FileText className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-blue-500 pointer-events-none" />
                  <Input
                    type="text"
                    placeholder="Search PI # / Batch # (e.g. 5442, SFO-9281)..."
                    value={searchPi}
                    onChange={(e) => setSearchPi(e.target.value)}
                    className="pl-8 pr-7 h-8 text-xs font-medium border-slate-200 bg-slate-50/60 focus:bg-white rounded-lg w-full"
                  />
                  {searchPi && (
                    <button
                      type="button"
                      onClick={() => setSearchPi("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                      title="Clear PI search"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* 2. Position # / Sticker Search Input */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-purple-500 pointer-events-none" />
                  <Input
                    type="text"
                    placeholder="Search Position # or Barcode (e.g. 1, 2, SEJ-012)..."
                    value={searchPos}
                    onChange={(e) => setSearchPos(e.target.value)}
                    className="pl-8 pr-7 h-8 text-xs font-medium border-slate-200 bg-slate-50/60 focus:bg-white rounded-lg w-full"
                  />
                  {searchPos && (
                    <button
                      type="button"
                      onClick={() => setSearchPos("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                      title="Clear Pos search"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {(searchPi || searchPos) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSearchPi("");
                      setSearchPos("");
                    }}
                    className="h-8 px-2.5 text-xs font-bold text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg gap-1 shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Clear Search</span>
                  </Button>
                )}
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

                    {/* Customer Batches Table & Nested Raw Sheet Cards */}
                    {isExpanded && (
                      <div className="p-3 bg-slate-50/50 space-y-4">
                        {/* Customer Batches Table */}
                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                          <div className="overflow-x-auto w-full">
                            <table className="w-full text-left text-xs border-collapse min-w-[900px]">
                              <thead>
                                <tr className="bg-slate-50/90 text-slate-600 uppercase border-b border-slate-200 text-[10.5px] font-extrabold tracking-wider">
                                   <th className="p-3">Batch No</th>
                                  <th className="p-3">Customer</th>
                                  <th className="p-3">Project / Job Order</th>
                                  <th className="p-3 text-center whitespace-nowrap min-w-[90px]">Finish</th>
                                  <th className="p-3 text-center whitespace-nowrap">Items Progress</th>
                                  <th className="p-3 text-right whitespace-nowrap">Total SQM</th>
                                  <th className="p-3 whitespace-nowrap">Uploaded Date</th>
                                  <th className="p-3 text-center whitespace-nowrap">Status</th>
                                  <th className="p-3 text-right whitespace-nowrap">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-slate-800">
                                {groupCustomerItemsByBatch(group.items, group.customerName, reportData?.pis).map(
                                  (batchGroup) => {
                                    const batchCardKey = `rej_batch_${group.customerName}_${batchGroup.batchKey}`;
                                    const isBatchExpanded = isBatchCardExpanded(batchCardKey);

                                    return (
                                      <React.Fragment key={batchGroup.batchKey}>
                                        <tr
                                          onClick={() => toggleBatchCardExpanded(batchCardKey)}
                                          className={`hover:bg-purple-50/40 transition-colors cursor-pointer select-none ${
                                            isBatchExpanded ? "bg-purple-50/20" : ""
                                          }`}
                                        >
                                          <td className="p-3 font-mono font-bold text-purple-700 whitespace-nowrap">
                                            {formatBatchNumber(batchGroup.batchNo)}
                                          </td>
                                          <td className="p-3 font-bold text-slate-900">
                                            {batchGroup.customerName}
                                          </td>
                                          <td className="p-3 text-slate-600">
                                            <div className="font-semibold text-slate-800">
                                              {batchGroup.projectName}
                                            </div>
                                            {batchGroup.jobOrderNumber && (
                                              <div className="text-[10px] font-mono text-slate-400">
                                                Job: {batchGroup.jobOrderNumber}
                                              </div>
                                            )}
                                          </td>
                                          <td className="p-3 text-center whitespace-nowrap">
                                            <span
                                              className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-md text-[10.5px] font-black uppercase tracking-wider whitespace-nowrap border ${
                                                batchGroup.finish === "Colour"
                                                  ? "bg-purple-100 text-purple-800 border-purple-200"
                                                  : "bg-sky-100 text-sky-800 border-sky-200"
                                              }`}
                                            >
                                              {batchGroup.finish}
                                            </span>
                                          </td>
                                          <td className="p-3 text-center">
                                            <div className="font-mono font-bold text-slate-900">
                                              {batchGroup.totalQty} Units
                                            </div>
                                          </td>
                                          <td className="p-3 font-mono font-bold text-emerald-700 text-right whitespace-nowrap">
                                            {formatAENumber(batchGroup.totalSqm, 2)} SQM
                                          </td>
                                          <td className="p-3 font-mono text-slate-500 whitespace-nowrap">
                                            {formatPlatformDate(batchGroup.createdAt)}
                                          </td>
                                          <td className="p-3 text-center">
                                            <StatusBadge status={batchGroup.status || "In Production"} />
                                          </td>
                                          <td className="p-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                            <button
                                              type="button"
                                              onClick={() => toggleBatchCardExpanded(batchCardKey)}
                                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer ${
                                                isBatchExpanded
                                                  ? "bg-purple-700 text-white shadow-purple-200"
                                                  : batchGroup.finish === "Colour"
                                                  ? "bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200"
                                                  : "bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200"
                                              }`}
                                            >
                                              <span>
                                                {isBatchExpanded
                                                  ? `Close ${batchGroup.finish}`
                                                  : `Open ${batchGroup.finish} (${batchGroup.items.length})`}
                                              </span>
                                              <ChevronDown
                                                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                                                  isBatchExpanded ? "rotate-180" : ""
                                                }`}
                                              />
                                            </button>
                                          </td>
                                        </tr>

                                        {/* If Batch row is expanded, show all Raw Sheets belonging to this finish / batch */}
                                        {isBatchExpanded && (
                                          <tr>
                                            <td colSpan={10} className="p-3 bg-slate-50/80 border-b border-purple-100">
                                              <div className="space-y-3 pl-2 sm:pl-4 border-l-2 border-purple-400">
                                                <div className="text-xs font-bold text-purple-900 flex items-center gap-2">
                                                  <span>
                                                    Raw Sheets for Batch {formatBatchNumber(batchGroup.batchNo)} ({batchGroup.finish})
                                                  </span>
                                                  <span className="text-[11px] font-normal text-slate-500">
                                                    • {batchGroup.items.length} items loaded
                                                  </span>
                                                </div>

                                                {groupItemsByBatchAndSheet(batchGroup.items).map((sheetGroup, sheetIdx) => {
                                                  const cardKey = `rej_${group.customerName}_${sheetGroup.key}`;
                                                  const isSheetExpanded = isBatchCardExpanded(cardKey);

                                                  return (
                                                    <div
                                                      key={sheetGroup.key}
                                                      className="bg-white rounded-xl border border-purple-100/90 shadow-2xs overflow-hidden transition-all"
                                                    >
                                                      {/* Raw Sheet Header */}
                                                      <div
                                                        onClick={() => toggleBatchCardExpanded(cardKey)}
                                                        className="p-3 bg-gradient-to-r from-purple-50/70 via-white to-slate-50/60 hover:from-purple-100/70 border-b border-purple-100/80 flex items-center justify-between cursor-pointer select-none transition-colors"
                                                      >
                                                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                                          <div className="w-7 h-7 rounded-xl bg-gradient-to-r from-purple-500 to-purple-700 text-white flex items-center justify-center font-black text-xs shadow-2xs shrink-0">
                                                            {sheetGroup.rackNo || (sheetIdx + 1)}
                                                          </div>
                                                          <div>
                                                            <div className="font-extrabold text-xs sm:text-sm text-slate-900 flex items-center gap-2 flex-wrap">
                                                              <span>{sheetGroup.sheetTitle}</span>
                                                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                                                                {sheetGroup.totalPieces} {sheetGroup.totalPieces === 1 ? "Piece" : "Pieces"} • {formatAENumber(sheetGroup.totalSqm, 2)} m²
                                                              </span>
                                                              <span
                                                                className={`text-[9.5px] font-black px-1.5 py-0.5 rounded border ${
                                                                  sheetGroup.finish === "Colour"
                                                                    ? "bg-purple-100 text-purple-800 border-purple-200"
                                                                    : sheetGroup.finish === "Clear"
                                                                    ? "bg-cyan-100 text-cyan-800 border-cyan-200"
                                                                    : "bg-slate-100 text-slate-800 border-slate-200"
                                                                }`}
                                                              >
                                                                {sheetGroup.finish === "Colour" ? "Colour" : sheetGroup.finish === "Clear" ? "Clear" : "Mixed"}
                                                              </span>
                                                              {sheetGroup.defectCount > 0 && (
                                                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-300 inline-flex items-center gap-1 shadow-2xs">
                                                                  <AlertCircle className="w-3 h-3 text-red-600" />
                                                                  {sheetGroup.defectCount} {sheetGroup.defectCount === 1 ? "Reject" : "Rejects"}
                                                                </span>
                                                              )}
                                                            </div>
                                                            <div className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center gap-2 flex-wrap">
                                                              {sheetGroup.piNumber && (
                                                                <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 font-bold">
                                                                  PI: {formatBatchNumber(sheetGroup.piNumber)}
                                                                </span>
                                                              )}
                                                              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300 font-bold">
                                                                Batch: {sheetGroup.batchNo || "—"}
                                                              </span>
                                                              {sheetGroup.sfoList.length > 0 && (
                                                                <span>
                                                                  SFO: <strong className="text-purple-700">{sheetGroup.sfoList.join(", ")}</strong>
                                                                </span>
                                                              )}
                                                              {sheetGroup.obList.length > 0 && <span>(OB: {sheetGroup.obList.join(", ")})</span>}
                                                              <span className="text-slate-300">•</span>
                                                              <span className="truncate max-w-[280px] sm:max-w-md text-slate-700 font-sans font-medium">
                                                                {sheetGroup.glassType || "Standard Float"}
                                                              </span>
                                                            </div>
                                                          </div>
                                                        </div>

                                                        <div className="flex items-center gap-2 flex-wrap ml-auto">
                                                          <div className="flex items-center gap-1 text-xs font-bold text-purple-700 bg-white border border-purple-200 px-2.5 py-1 rounded-xl shadow-2xs">
                                                            <span>{isSheetExpanded ? "Hide Data" : `Show All Data (${sheetGroup.totalPieces})`}</span>
                                                            <ChevronDown
                                                              className={`w-3.5 h-3.5 text-purple-600 transition-transform duration-200 ${
                                                                isSheetExpanded ? "rotate-180" : ""
                                                              }`}
                                                            />
                                                          </div>
                                                        </div>
                                                      </div>

                                                      {/* Sheet Table */}
                                                      {isSheetExpanded && (
                                                        <div className="overflow-x-auto w-full">
                                                          <table className="w-full text-left text-xs border-collapse min-w-[1100px]">
                                                            <thead>
                                                              <tr className="bg-slate-100/60 text-slate-600 uppercase border-b border-slate-200 text-[10.5px] font-extrabold tracking-wider">
                                                                <th className="p-3 w-12 text-center">SL</th>
                                                                <th className="p-3">SERIAL NUMBER</th>
                                                                <th className="p-3">BATCH NO</th>
                                                                <th className="p-3">ORDER NO</th>
                                                                <th className="p-3 text-center">POS NO</th>
                                                                <th className="p-3 text-center">FINISH</th>
                                                                <th className="p-3 text-center">WIDTH x HEIGHT</th>
                                                                <th className="p-3 text-center">QTY</th>
                                                                <th className="p-3 text-right">SQM</th>
                                                                <th className="p-3 min-w-[180px]">GLASS TYPE / SPEC</th>
                                                                <th className="p-3 text-center">STAGE</th>
                                                                <th className="p-3 text-center">QUALITY STATUS</th>
                                                                <th className="p-3 min-w-[260px]">DEFECT DETAILS</th>
                                                                <th className="p-3">OPERATOR</th>
                                                                <th className="p-3 text-right min-w-[210px]">ACTIONS</th>
                                                              </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-100 text-slate-800">
                                                              {sheetGroup.items.map(({ item, rejectRecord, isRejected }, idx) => {
                                                                const eff = getDguEffectiveQtyAndSqm(item);
                                                                const finish = getItemFinish(item);
                                                                const isActivelyRejected = item.status === "Rejected";
                                                                const isRemake = Boolean(rejectRecord) && !isActivelyRejected;
                                                                const actionItem = getGlassItemForActions(
                                                                  item.serialNumber,
                                                                  item.barcode,
                                                                  item.piNumber,
                                                                  isActivelyRejected ? (rejectRecord?.stage || item.currentStage) : item.currentStage,
                                                                  item.status || "In Production",
                                                                  rejectRecord?.reason || item.remarks
                                                                );

                                                                return (
                                                                  <tr
                                                                    key={item.id || item.serialNumber}
                                                                    className={`transition-colors ${
                                                                      isActivelyRejected
                                                                        ? "bg-red-50/40 hover:bg-red-50/70"
                                                                        : isRemake
                                                                        ? "bg-blue-50/20 hover:bg-blue-50/50"
                                                                        : "hover:bg-slate-50/80"
                                                                    }`}
                                                                  >
                                                                    {/* SL */}
                                                                    <td className="p-3 font-mono font-bold text-slate-500 text-center whitespace-nowrap">
                                                                      {idx + 1}
                                                                    </td>

                                                                    {/* Serial Number & Barcode */}
                                                                    <td className="p-3 font-mono whitespace-nowrap">
                                                                      <div className="flex items-center gap-1.5 flex-wrap">
                                                                        <span className={`font-bold ${isActivelyRejected ? "text-red-700" : "text-blue-700"}`}>
                                                                          {item.serialNumber}
                                                                        </span>
                                                                        {isRemake && (
                                                                          <span className="px-1.5 py-0.5 rounded text-[9.5px] font-black bg-blue-100 text-blue-800 border border-blue-200 inline-flex items-center gap-1 shadow-2xs">
                                                                            <RefreshCw className="w-2.5 h-2.5 text-blue-600" />
                                                                            <span>Remake</span>
                                                                          </span>
                                                                        )}
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

                                                                    {/* QTY */}
                                                                    <td className="p-3 text-center font-mono font-bold text-blue-700 whitespace-nowrap">
                                                                      {eff.qty}
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
                                                                        {getDisplayStage(item, isActivelyRejected ? (rejectRecord?.stage || item.currentStage) : item.currentStage)}
                                                                      </span>
                                                                    </td>

                                                                    {/* Quality Status */}
                                                                    <td className="p-3 text-center whitespace-nowrap">
                                                                      {isActivelyRejected ? (
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
                                                                      {isActivelyRejected ? (
                                                                        <div className="space-y-1 min-w-[240px]">
                                                                          <div className="flex items-center gap-1.5 flex-wrap">
                                                                            {rejectRecord?.defectStation && (
                                                                              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 whitespace-nowrap inline-flex items-center gap-1 shadow-2xs">
                                                                                <span>🏭</span>
                                                                                <span>{rejectRecord.defectStation}</span>
                                                                              </span>
                                                                            )}
                                                                            {rejectRecord?.defectivePane && (
                                                                              <span
                                                                                className={`px-2 py-0.5 rounded text-[10px] font-black border whitespace-nowrap shadow-2xs ${
                                                                                  rejectRecord.defectivePane === "OP"
                                                                                    ? "bg-purple-100 text-purple-800 border-purple-200"
                                                                                    : rejectRecord.defectivePane === "IP_PLY1"
                                                                                    ? "bg-cyan-100 text-cyan-900 border-cyan-300"
                                                                                    : rejectRecord.defectivePane === "IP_PLY2"
                                                                                    ? "bg-teal-100 text-teal-900 border-teal-300"
                                                                                    : rejectRecord.defectivePane === "BOTH_CLEAR"
                                                                                    ? "bg-cyan-100 text-cyan-900 border-cyan-300 ring-1 ring-cyan-400"
                                                                                    : rejectRecord.defectivePane === "IP"
                                                                                    ? "bg-cyan-100 text-cyan-800 border-cyan-200"
                                                                                    : "bg-red-100 text-red-800 border-red-200"
                                                                                }`}
                                                                              >
                                                                                {rejectRecord.defectivePane === "OP"
                                                                                  ? "OP • Outer Pane"
                                                                                  : rejectRecord.defectivePane === "IP_PLY1"
                                                                                  ? "IP • Lami Ply 1"
                                                                                  : rejectRecord.defectivePane === "IP_PLY2"
                                                                                  ? "IP • Lami Ply 2"
                                                                                  : rejectRecord.defectivePane === "BOTH_CLEAR"
                                                                                  ? "Both Clears • IP 1 + IP 2"
                                                                                  : rejectRecord.defectivePane === "IP"
                                                                                  ? "IP • Inner Pane"
                                                                                  : rejectRecord.defectivePane === "ASSEMBLY"
                                                                                  ? "Assembly Defect"
                                                                                  : rejectRecord.defectivePane}
                                                                              </span>
                                                                            )}
                                                                          </div>
                                                                          <div className="text-red-700 font-extrabold text-xs leading-snug">
                                                                            {(rejectRecord?.reason || item.remarks || "Defect Scrap").replace(/^\[Station:[^\]]+\]\s*/i,
                                                                              ""
                                                                            )}
                                                                          </div>
                                                                          {rejectRecord?.date && (
                                                                            <div className="text-[10px] font-mono text-slate-400">
                                                                              {formatDubaiDateTime(rejectRecord.date)}
                                                                            </div>
                                                                          )}
                                                                        </div>
                                                                      ) : isRemake ? (
                                                                        <div className="space-y-1 min-w-[220px]">
                                                                          <div className="flex items-center gap-1.5 flex-wrap">
                                                                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200 inline-flex items-center gap-1 shadow-2xs">
                                                                              <RefreshCw className="w-3 h-3 text-blue-600" />
                                                                              <span>Remake in Progress</span>
                                                                            </span>
                                                                            {rejectRecord?.defectStation && (
                                                                              <span className="text-[10px] text-slate-500 font-medium">
                                                                                (Replaced {rejectRecord.defectStation})
                                                                              </span>
                                                                            )}
                                                                          </div>
                                                                          <div className="text-[11px] text-slate-500 font-medium truncate max-w-[280px]" title={rejectRecord?.reason || ""}>
                                                                            Original Defect: {(rejectRecord?.reason || item.remarks || "Scrapped & Recut").replace(/^\[Station:[^\]]+\]\s*/i, "")}
                                                                          </div>
                                                                        </div>
                                                                      ) : (
                                                                        <span className="text-slate-400 font-medium text-xs whitespace-nowrap">
                                                                          No Defects
                                                                        </span>
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

                                                                        {/* Reject Button - Visible for all post-Cutting items not yet rejected (including Finished / Completed stage, e.g. transit / delivery breakage) */}
                                                                        {!isRejected &&
                                                                          item.status !== "Rejected" &&
                                                                          item.currentStage !== "Cutting" &&
                                                                          onReject && (
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
                                                })}
                                              </div>
                                            </td>
                                          </tr>
                                        )}
                                      </React.Fragment>
                                    );
                                  }
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
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
            <div className="bg-white p-3 sm:p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-2.5">
              {/* Row 1: View Mode Switcher, Finish Filters & Accordion Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-slate-100">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-500" /> View Mode:
                  </span>
                  {/* Mode toggle: All Stickers vs Reworks Only */}
                  <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-bold shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setReworksFilterMode("all")}
                      className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                        reworksFilterMode === "all"
                          ? "bg-white text-slate-900 shadow-md"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      All Glass Stickers
                    </button>
                    <button
                      type="button"
                      onClick={() => setReworksFilterMode("reworks_only")}
                      className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                        reworksFilterMode === "reworks_only"
                          ? "bg-amber-600 text-white shadow-md"
                          : "text-amber-800 hover:text-amber-950 hover:bg-amber-50"
                      }`}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>In Rework ({totalReworksInFilter})</span>
                    </button>
                  </div>

                  {/* Finish Filter: All / Colour / Clear */}
                  <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-bold shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setSelectedFinish("all")}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                        selectedFinish === "all"
                          ? "bg-white text-slate-900 shadow-md"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      All Finish
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedFinish("Colour")}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                        selectedFinish === "Colour"
                          ? "bg-gradient-to-r from-purple-500 to-purple-700 text-white shadow-md"
                          : "text-purple-700 hover:text-purple-900 hover:bg-purple-50"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${selectedFinish === "Colour" ? "bg-white" : "bg-purple-500"}`} />
                      <span>Colour</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedFinish("Clear")}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                        selectedFinish === "Clear"
                          ? "bg-sky-600 text-white shadow-md"
                          : "text-sky-700 hover:text-sky-900 hover:bg-sky-50"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${selectedFinish === "Clear" ? "bg-white" : "bg-sky-400"}`} />
                      <span>Clear</span>
                    </button>
                  </div>
                </div>

                {/* Right Side: Expand/Collapse All Buttons */}
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAllCustomersExpanded(true)}
                    className="h-7.5 text-xs font-bold border-slate-200 hover:bg-slate-50 text-slate-700 shadow-2xs"
                  >
                    Expand All
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAllCustomersExpanded(false)}
                    className="h-7.5 text-xs font-bold border-slate-200 hover:bg-slate-50 text-slate-700 shadow-2xs"
                  >
                    Collapse All
                  </Button>
                </div>
              </div>

              {/* Row 2: Search Inputs Bar (Comfortable Full Width, No Text Cutoff) */}
              <div className="flex flex-wrap items-center gap-2.5">
                {/* 1. PI / Batch Search Input */}
                <div className="relative flex-1 min-w-[200px]">
                  <FileText className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-blue-500 pointer-events-none" />
                  <Input
                    type="text"
                    placeholder="Search PI # / Batch # (e.g. 5442, SFO-9281)..."
                    value={searchPi}
                    onChange={(e) => setSearchPi(e.target.value)}
                    className="pl-8 pr-7 h-8 text-xs font-medium border-slate-200 bg-slate-50/60 focus:bg-white rounded-lg w-full"
                  />
                  {searchPi && (
                    <button
                      type="button"
                      onClick={() => setSearchPi("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                      title="Clear PI search"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* 2. Position # / Sticker Search Input */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-purple-500 pointer-events-none" />
                  <Input
                    type="text"
                    placeholder="Search Position # or Barcode (e.g. 1, 2, SEJ-012)..."
                    value={searchPos}
                    onChange={(e) => setSearchPos(e.target.value)}
                    className="pl-8 pr-7 h-8 text-xs font-medium border-slate-200 bg-slate-50/60 focus:bg-white rounded-lg w-full"
                  />
                  {searchPos && (
                    <button
                      type="button"
                      onClick={() => setSearchPos("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                      title="Clear Pos search"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {(searchPi || searchPos) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSearchPi("");
                      setSearchPos("");
                    }}
                    className="h-8 px-2.5 text-xs font-bold text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg gap-1 shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Clear Search</span>
                  </Button>
                )}
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

                    {/* Customer Batches Table & Nested Raw Sheet Cards */}
                    {isExpanded && (
                      <div className="p-3 bg-slate-50/50 space-y-4">
                        {/* Customer Batches Table */}
                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                          <div className="overflow-x-auto w-full">
                            <table className="w-full text-left text-xs border-collapse min-w-[900px]">
                              <thead>
                                <tr className="bg-slate-50/90 text-slate-600 uppercase border-b border-slate-200 text-[10.5px] font-extrabold tracking-wider">
                                  <th className="p-3">Batch No</th>
                                  <th className="p-3">Customer</th>
                                  <th className="p-3">Project / Job Order</th>
                                  <th className="p-3 text-center whitespace-nowrap min-w-[90px]">Finish</th>
                                  <th className="p-3 text-center whitespace-nowrap">Items Progress</th>
                                  <th className="p-3 text-right whitespace-nowrap">Total SQM</th>
                                  <th className="p-3 whitespace-nowrap">Uploaded Date</th>
                                  <th className="p-3 text-center whitespace-nowrap">Status</th>
                                  <th className="p-3 text-right whitespace-nowrap">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-slate-800">
                                {groupCustomerItemsByBatch(group.items, group.customerName, reportData?.pis).map(
                                  (batchGroup) => {
                                    const batchCardKey = `rw_batch_${group.customerName}_${batchGroup.batchKey}`;
                                    const isBatchExpanded = isBatchCardExpanded(batchCardKey);

                                    return (
                                      <React.Fragment key={batchGroup.batchKey}>
                                        <tr
                                          onClick={() => toggleBatchCardExpanded(batchCardKey)}
                                          className={`hover:bg-amber-50/40 transition-colors cursor-pointer select-none ${
                                            isBatchExpanded ? "bg-amber-50/20" : ""
                                          }`}
                                        >
                                          <td className="p-3 font-mono font-bold text-amber-800 whitespace-nowrap">
                                            {formatBatchNumber(batchGroup.batchNo)}
                                          </td>
                                          <td className="p-3 font-bold text-slate-900">
                                            {batchGroup.customerName}
                                          </td>
                                          <td className="p-3 text-slate-600">
                                            <div className="font-semibold text-slate-800">
                                              {batchGroup.projectName}
                                            </div>
                                            {batchGroup.jobOrderNumber && (
                                              <div className="text-[10px] font-mono text-slate-400">
                                                Job: {batchGroup.jobOrderNumber}
                                              </div>
                                            )}
                                          </td>
                                          <td className="p-3 text-center whitespace-nowrap">
                                            <span
                                              className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-md text-[10.5px] font-black uppercase tracking-wider whitespace-nowrap border ${
                                                batchGroup.finish === "Colour"
                                                  ? "bg-purple-100 text-purple-800 border-purple-200"
                                                  : "bg-sky-100 text-sky-800 border-sky-200"
                                              }`}
                                            >
                                              {batchGroup.finish}
                                            </span>
                                          </td>
                                          <td className="p-3 text-center">
                                            <div className="font-mono font-bold text-slate-900">
                                              {batchGroup.totalQty} Units
                                            </div>
                                          </td>
                                          <td className="p-3 font-mono font-bold text-emerald-700 text-right whitespace-nowrap">
                                            {formatAENumber(batchGroup.totalSqm, 2)} SQM
                                          </td>
                                          <td className="p-3 font-mono text-slate-500 whitespace-nowrap">
                                            {formatPlatformDate(batchGroup.createdAt)}
                                          </td>
                                          <td className="p-3 text-center">
                                            <StatusBadge status={batchGroup.status || "In Production"} />
                                          </td>
                                          <td className="p-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                            <button
                                              type="button"
                                              onClick={() => toggleBatchCardExpanded(batchCardKey)}
                                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer ${
                                                isBatchExpanded
                                                  ? "bg-amber-700 text-white shadow-amber-200"
                                                  : batchGroup.finish === "Colour"
                                                  ? "bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200"
                                                  : "bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200"
                                              }`}
                                            >
                                              <span>
                                                {isBatchExpanded
                                                  ? `Close ${batchGroup.finish}`
                                                  : `Open ${batchGroup.finish} (${batchGroup.items.length})`}
                                              </span>
                                              <ChevronDown
                                                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                                                  isBatchExpanded ? "rotate-180" : ""
                                                }`}
                                              />
                                            </button>
                                          </td>
                                        </tr>

                                        {/* If Batch row is expanded, show all Raw Sheets belonging to this finish / batch */}
                                        {isBatchExpanded && (
                                          <tr>
                                            <td colSpan={10} className="p-3 bg-slate-50/80 border-b border-amber-100">
                                              <div className="space-y-3 pl-2 sm:pl-4 border-l-2 border-amber-400">
                                                <div className="text-xs font-bold text-amber-900 flex items-center gap-2">
                                                  <span>
                                                    Raw Sheets for Batch {formatBatchNumber(batchGroup.batchNo)} ({batchGroup.finish})
                                                  </span>
                                                  <span className="text-[11px] font-normal text-slate-500">
                                                    • {batchGroup.items.length} items loaded
                                                  </span>
                                                </div>

                                                {groupItemsByBatchAndSheet(batchGroup.items).map((sheetGroup, sheetIdx) => {
                                                  const cardKey = `rw_${group.customerName}_${sheetGroup.key}`;
                                                  const isSheetExpanded = isBatchCardExpanded(cardKey);

                                                  return (
                                                    <div
                                                      key={sheetGroup.key}
                                                      className="bg-white rounded-xl border border-amber-100/90 shadow-2xs overflow-hidden transition-all"
                                                    >
                                                      {/* Raw Sheet Header */}
                                                      <div
                                                        onClick={() => toggleBatchCardExpanded(cardKey)}
                                                        className="p-3 bg-gradient-to-r from-amber-50/70 via-white to-slate-50/60 hover:from-amber-100/70 border-b border-amber-100/80 flex items-center justify-between cursor-pointer select-none transition-colors"
                                                      >
                                                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                                          <div className="w-7 h-7 rounded-xl bg-amber-600 text-white flex items-center justify-center font-black text-xs shadow-2xs shrink-0">
                                                            {sheetGroup.rackNo || (sheetIdx + 1)}
                                                          </div>
                                                          <div>
                                                            <div className="font-extrabold text-xs sm:text-sm text-slate-900 flex items-center gap-2 flex-wrap">
                                                              <span>{sheetGroup.sheetTitle}</span>
                                                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                                                                {sheetGroup.totalPieces} {sheetGroup.totalPieces === 1 ? "Piece" : "Pieces"} • {formatAENumber(sheetGroup.totalSqm, 2)} m²
                                                              </span>
                                                              <span
                                                                className={`text-[9.5px] font-black px-1.5 py-0.5 rounded border ${
                                                                  sheetGroup.finish === "Colour"
                                                                    ? "bg-purple-100 text-purple-800 border-purple-200"
                                                                    : sheetGroup.finish === "Clear"
                                                                    ? "bg-cyan-100 text-cyan-800 border-cyan-200"
                                                                    : "bg-slate-100 text-slate-800 border-slate-200"
                                                                }`}
                                                              >
                                                                {sheetGroup.finish === "Colour" ? "Colour" : sheetGroup.finish === "Clear" ? "Clear" : "Mixed"}
                                                              </span>
                                                              {sheetGroup.defectCount > 0 && (
                                                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 inline-flex items-center gap-1 shadow-2xs">
                                                                  <RotateCcw className="w-3 h-3 text-amber-700" />
                                                                  {sheetGroup.defectCount} {sheetGroup.defectCount === 1 ? "Rework" : "Reworks"}
                                                                </span>
                                                              )}
                                                            </div>
                                                            <div className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center gap-2 flex-wrap">
                                                              {sheetGroup.piNumber && (
                                                                <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-bold">
                                                                  PI: {formatBatchNumber(sheetGroup.piNumber)}
                                                                </span>
                                                              )}
                                                              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300 font-bold">
                                                                Batch: {sheetGroup.batchNo || "—"}
                                                              </span>
                                                              {sheetGroup.sfoList.length > 0 && (
                                                                <span>
                                                                  SFO: <strong className="text-amber-800">{sheetGroup.sfoList.join(", ")}</strong>
                                                                </span>
                                                              )}
                                                              {sheetGroup.obList.length > 0 && <span>(OB: {sheetGroup.obList.join(", ")})</span>}
                                                              <span className="text-slate-300">•</span>
                                                              <span className="truncate max-w-[280px] sm:max-w-md text-slate-700 font-sans font-medium">
                                                                {sheetGroup.glassType || "Standard Float"}
                                                              </span>
                                                            </div>
                                                          </div>
                                                        </div>

                                                        <div className="flex items-center gap-2 flex-wrap ml-auto">
                                                          <div className="flex items-center gap-1 text-xs font-bold text-amber-800 bg-white border border-amber-200 px-2.5 py-1 rounded-xl shadow-2xs">
                                                            <span>{isSheetExpanded ? "Hide Data" : `Show All Data (${sheetGroup.totalPieces})`}</span>
                                                            <ChevronDown
                                                              className={`w-3.5 h-3.5 text-amber-700 transition-transform duration-200 ${
                                                                isSheetExpanded ? "rotate-180" : ""
                                                              }`}
                                                            />
                                                          </div>
                                                        </div>
                                                      </div>

                                                      {/* Sheet Table */}
                                                      {isSheetExpanded && (
                                                        <div className="overflow-x-auto w-full">
                                                          <table className="w-full text-left text-xs border-collapse min-w-[1100px]">
                                                            <thead>
                                                              <tr className="bg-slate-100/60 text-slate-600 uppercase border-b border-slate-200 text-[10.5px] font-extrabold tracking-wider">
                                                                <th className="p-3 w-12 text-center">SL</th>
                                                                <th className="p-3">SERIAL NUMBER</th>
                                                                <th className="p-3">BATCH NO</th>
                                                                <th className="p-3">ORDER NO</th>
                                                                <th className="p-3 text-center">POS NO</th>
                                                                <th className="p-3 text-center">FINISH</th>
                                                                <th className="p-3 text-center">WIDTH x HEIGHT</th>
                                                                <th className="p-3 text-center">QTY</th>
                                                                <th className="p-3 text-right">SQM</th>
                                                                <th className="p-3 min-w-[180px]">GLASS TYPE / SPEC</th>
                                                                <th className="p-3 text-center">REWORK ROUTE</th>
                                                                <th className="p-3 text-center">STATUS</th>
                                                                <th className="p-3 min-w-[260px]">REWORK DETAILS</th>
                                                                <th className="p-3">OPERATOR</th>
                                                                <th className="p-3 text-right min-w-[210px]">ACTIONS</th>
                                                              </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-100 text-slate-800">
                                                              {sheetGroup.items.map(({ item, reworkRecord, isReworking }, idx) => {
                                                                const eff = getDguEffectiveQtyAndSqm(item);
                                                                const finish = getItemFinish(item);
                                                                const isItemRejectedOrReworking =
                                                                  isReworking ||
                                                                  item.status === "Rejected" ||
                                                                  item.status === "Reworking" ||
                                                                  Boolean(reworkRecord) ||
                                                                  Boolean(rejectMap.get(item.serialNumber));
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

                                                                    {/* QTY */}
                                                                    <td className="p-3 text-center font-mono font-bold text-blue-700 whitespace-nowrap">
                                                                      {eff.qty}
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
                                                                          <span className="text-slate-600">
                                                                            {getDisplayStage(item, reworkRecord.fromStage)}
                                                                          </span>
                                                                          <span className="text-slate-400">→</span>
                                                                          <span className="px-1.5 py-0.5 rounded bg-amber-100 border border-amber-200 text-amber-800">
                                                                            {getDisplayStage(item, reworkRecord.targetStage)}
                                                                          </span>
                                                                        </div>
                                                                      ) : (
                                                                        <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-800 text-[10px] font-bold">
                                                                          {getDisplayStage(item, item.currentStage)}
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
                                                                        <div className="space-y-1 min-w-[240px]">
                                                                          <div className="flex items-center gap-1.5 flex-wrap">
                                                                            {reworkRecord?.defectStation && (
                                                                              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 whitespace-nowrap inline-flex items-center gap-1 shadow-2xs">
                                                                                <span>🏭</span>
                                                                                <span>{reworkRecord.defectStation}</span>
                                                                              </span>
                                                                            )}
                                                                            {reworkRecord?.defectivePane && (
                                                                              <span
                                                                                className={`px-2 py-0.5 rounded text-[10px] font-black border whitespace-nowrap shadow-2xs ${
                                                                                  reworkRecord.defectivePane === "OP"
                                                                                    ? "bg-purple-100 text-purple-800 border-purple-200"
                                                                                    : reworkRecord.defectivePane === "IP_PLY1"
                                                                                    ? "bg-cyan-100 text-cyan-900 border-cyan-300"
                                                                                    : reworkRecord.defectivePane === "IP_PLY2"
                                                                                    ? "bg-teal-100 text-teal-900 border-teal-300"
                                                                                    : reworkRecord.defectivePane === "BOTH_CLEAR"
                                                                                    ? "bg-cyan-100 text-cyan-900 border-cyan-300 ring-1 ring-cyan-400"
                                                                                    : reworkRecord.defectivePane === "IP"
                                                                                    ? "bg-cyan-100 text-cyan-800 border-cyan-200"
                                                                                    : "bg-amber-100 text-amber-800 border-amber-200"
                                                                                }`}
                                                                              >
                                                                                {reworkRecord.defectivePane === "OP"
                                                                                  ? "OP • Outer Pane"
                                                                                  : reworkRecord.defectivePane === "IP_PLY1"
                                                                                  ? "IP • Lami Ply 1"
                                                                                  : reworkRecord.defectivePane === "IP_PLY2"
                                                                                  ? "IP • Lami Ply 2"
                                                                                  : reworkRecord.defectivePane === "BOTH_CLEAR"
                                                                                  ? "Both Clears • IP 1 + IP 2"
                                                                                  : reworkRecord.defectivePane === "IP"
                                                                                  ? "IP • Inner Pane"
                                                                                  : reworkRecord.defectivePane === "ASSEMBLY"
                                                                                  ? "Assembly Defect"
                                                                                  : reworkRecord.defectivePane}
                                                                              </span>
                                                                            )}
                                                                          </div>
                                                                          <div className="text-amber-800 font-extrabold text-xs leading-snug">
                                                                            {(reworkRecord?.reason || item.remarks || "Workstation Reprocess").replace(
                                                                              /^\[Station:[^\]]+\]\s*/i,
                                                                              ""
                                                                            )}
                                                                          </div>
                                                                          {reworkRecord?.date && (
                                                                            <div className="text-[10px] font-mono text-slate-400">
                                                                              {formatDubaiDateTime(reworkRecord.date)}
                                                                            </div>
                                                                          )}
                                                                        </div>
                                                                      ) : (
                                                                        <span className="text-slate-400 font-medium text-xs whitespace-nowrap">
                                                                          Standard Route
                                                                        </span>
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

                                                                        {/* Rework Button - ONLY visible for glass items that are rejected or in rework, post-Cutting */}
                                                                        {onRework && item.currentStage !== "Cutting" && isItemRejectedOrReworking && (
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
                                                })}
                                              </div>
                                            </td>
                                          </tr>
                                        )}
                                      </React.Fragment>
                                    );
                                  }
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
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
