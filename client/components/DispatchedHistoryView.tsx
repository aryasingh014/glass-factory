import React, { useState, useMemo, useEffect } from "react";
import { GlassItem, PIMaster, ProductionHistory, ProductionStage } from "@shared/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TableHorizontalScrollWrapper } from "@/components/TableHorizontalScrollWrapper";
import {
  PackageCheck,
  Search,
  Filter,
  Calendar,
  Truck,
  FileSpreadsheet,
  Download,
  RefreshCw,
  Tag,
  ChevronDown,
  ChevronUp,
  Link2,
  CheckCircle2,
  Check,
  Boxes,
  Layers,
  Clock,
  Sparkles,
  SlidersHorizontal,
  Building2,
  Users,
  CheckSquare,
  Square,
  X,
  Printer,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  Activity,
  History,
} from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  formatBatchNumber,
  formatPlatformDate,
  formatPlatformTime,
  getItemFinish,
  isDguStickerPairMatch,
  isDguGlass,
  isLaminatedGlass,
  isDlguGlass,
  formatDubaiDateTime,
} from "@/lib/utils";
import { exportPartialDispatchNoteToExcel, resolveGlassMakeupDetails, buildItemExportRows, standardColWidths } from "@/lib/excelExport";

interface DispatchedHistoryViewProps {
  items: GlassItem[];
  pis: PIMaster[];
  operator?: string;
  onRefresh: () => void;
  onPrintSticker: (item: GlassItem) => void;
  onNavigateToDispatchQueue?: () => void;
}

export interface DispatchedUnitRow {
  id: string;
  item: GlassItem;
  partnerItem: GlassItem | null;
  allPartners?: GlassItem[];
  allSerials: string[];
  isDguPair: boolean;
  glassCategory: "DLGU" | "DGU" | "Laminated" | "Monolithic";
  effectiveSqm: number;
  effectiveQty: number;
  dispatchedTimestamp?: string;
  operatorName?: string;
  customerName?: string;
  projectName?: string;
}

export interface CustomerDispatchedGroup {
  customerName: string;
  projectNames: Set<string>;
  batches: Set<string>;
  totalUnits: number;
  totalSqm: number;
  hasColour: boolean;
  hasClear: boolean;
  categories: Set<string>;
  rows: DispatchedUnitRow[];
}

export const DispatchedHistoryView: React.FC<DispatchedHistoryViewProps> = ({
  items,
  pis,
  operator,
  onRefresh,
  onPrintSticker,
  onNavigateToDispatchQueue,
}) => {
  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedFinish, setSelectedFinish] = useState<string>("all");
  const [selectedCustomer, setSelectedCustomer] = useState<string>("all");
  const [dateRangeFilter, setDateRangeFilter] = useState<"all" | "today" | "week" | "month">("all");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [specificDate, setSpecificDate] = useState<string>("");

  // Expanded sub-rows for partner IP glass
  const [expandedUnitIds, setExpandedUnitIds] = useState<Record<string, boolean>>({});
  // Selected rows for bulk operations
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  // Expanded state for customer cards (default expanded)
  const [expandedCustomers, setExpandedCustomers] = useState<Record<string, boolean>>({});

  // Production history log for dispatch timeline
  const [historyLogs, setHistoryLogs] = useState<ProductionHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Fetch production history from reports endpoint to trace exact dispatch timestamps & operators
  useEffect(() => {
    let isMounted = true;
    const loadHistory = async () => {
      try {
        setHistoryLoading(true);
        const res = await fetch("/api/reports");
        if (res.ok) {
          const data = await res.json();
          if (isMounted && Array.isArray(data.history)) {
            // Strictly filter history entries related to Dispatch / Finished stage
            const dispatchOnlyLogs = data.history.filter((h: ProductionHistory) => {
              const actionLower = (h.action || "").toLowerCase();
              const stageLower = (h.stage || "").toLowerCase();
              const newStatusLower = (h.newStatus || "").toLowerCase();
              return (
                actionLower.includes("dispatch") ||
                stageLower === "finished" ||
                newStatusLower === "completed" ||
                actionLower.includes("finished")
              );
            });
            setHistoryLogs(dispatchOnlyLogs);
          }
        }
      } catch (err) {
        // Silently handle
      } finally {
        if (isMounted) setHistoryLoading(false);
      }
    };

    loadHistory();
    return () => {
      isMounted = false;
    };
  }, []);

  // Quick lookup maps
  const piMap = useMemo(() => {
    const map = new Map<string, PIMaster>();
    pis.forEach((p) => {
      if (p.id) map.set(p.id, p);
      if (p.piNumber) map.set(p.piNumber, p);
    });
    return map;
  }, [pis]);

  const historyBySerialMap = useMemo(() => {
    const map = new Map<string, ProductionHistory>();
    historyLogs.forEach((h) => {
      if (h.serialNumber && !map.has(h.serialNumber)) {
        map.set(h.serialNumber, h);
      }
    });
    return map;
  }, [historyLogs]);

  // STRICT FILTER: Only items that are dispatched
  const rawDispatchedItems = useMemo(() => {
    return items.filter((item) => {
      const isDispatchedFlag = (item as any).isDispatched === true;
      const hasDispatchedAt = !!(item as any).dispatchedAt;
      const isDispatchedStage = (item as any).currentStage === "Dispatched";

      const isDispatched =
        (isDispatchedFlag || hasDispatchedAt || isDispatchedStage) &&
        item.status !== "Rejected";

      return isDispatched;
    });
  }, [items]);

  // Build Assembled Unit Rows (DLGU units, DGU units, Laminated units, and Monolithic items)
  const allUnitRows = useMemo<DispatchedUnitRow[]>(() => {
    const rows: DispatchedUnitRow[] = [];

    // Segment items by product category
    const dlguItems = rawDispatchedItems.filter((i) => isDlguGlass(i) || (i as any).glassCategory === "DLGU");
    const dguItems = rawDispatchedItems.filter(
      (i) =>
        (isDguGlass(i) || (i as any).glassCategory === "DGU") &&
        !isDlguGlass(i) &&
        (i as any).glassCategory !== "DLGU"
    );
    const lamItems = rawDispatchedItems.filter(
      (i) =>
        (isLaminatedGlass(i) || (i as any).glassCategory === "Lamination") &&
        !isDguGlass(i) &&
        !isDlguGlass(i) &&
        (i as any).glassCategory !== "DLGU"
    );
    const generalItems = rawDispatchedItems.filter(
      (i) =>
        !isDguGlass(i) &&
        !isDlguGlass(i) &&
        !isLaminatedGlass(i) &&
        (i as any).glassCategory !== "DLGU" &&
        (i as any).glassCategory !== "DGU" &&
        (i as any).glassCategory !== "Lamination"
    );

    // 1. Process DLGU Units (1 Colour Outer Pane + up to 2 Clear Inner Panes)
    const dlguColour = dlguItems.filter((i) => getItemFinish(i) === "Colour");
    const dlguClear = dlguItems.filter((i) => getItemFinish(i) === "Clear");
    const usedDlguClear = new Set<string>();

    dlguColour.forEach((col) => {
      const colDguPairId = (col as any).dguPairId;
      let matchingClears = colDguPairId
        ? dlguClear.filter(
            (clr) => !usedDlguClear.has(clr.serialNumber) && (clr as any).dguPairId === colDguPairId
          ).slice(0, 2)
        : [];

      if (matchingClears.length === 0) {
        matchingClears = dlguClear
          .filter((clr) => !usedDlguClear.has(clr.serialNumber) && isDguStickerPairMatch(col, clr))
          .slice(0, 2);
      }

      const primaryClear = matchingClears[0] || null;
      const allUnitSerials = [col.serialNumber];
      matchingClears.forEach((clr) => {
        usedDlguClear.add(clr.serialNumber);
        allUnitSerials.push(clr.serialNumber);
      });

      const pi = piMap.get(col.piId) || piMap.get(col.piNumber);
      const hist = historyBySerialMap.get(col.serialNumber);

      rows.push({
        id: `dispatched-dlgu-${col.serialNumber}`,
        item: col,
        partnerItem: primaryClear,
        allPartners: matchingClears,
        allSerials: allUnitSerials,
        isDguPair: true,
        glassCategory: "DLGU",
        effectiveSqm: col.sqm || parseFloat(((col.width * col.height) / 1000000).toFixed(2)),
        effectiveQty: col.qty || 1,
        dispatchedTimestamp: (col as any).dispatchedAt || hist?.timestamp || col.updatedAt,
        operatorName: hist?.operator || hist?.user || operator || "Dispatch Desk",
        customerName: pi?.customerName || "Customer LLC",
        projectName: pi?.projectName || "General Project",
      });
    });

    // Any remaining unpaired DLGU clear panes
    dlguClear.forEach((clr) => {
      if (!usedDlguClear.has(clr.serialNumber)) {
        const pi = piMap.get(clr.piId) || piMap.get(clr.piNumber);
        const hist = historyBySerialMap.get(clr.serialNumber);
        rows.push({
          id: `dispatched-dlgu-clr-${clr.serialNumber}`,
          item: clr,
          partnerItem: null,
          allPartners: [],
          allSerials: [clr.serialNumber],
          isDguPair: false,
          glassCategory: "DLGU",
          effectiveSqm: clr.sqm || parseFloat(((clr.width * clr.height) / 1000000).toFixed(2)),
          effectiveQty: clr.qty || 1,
          dispatchedTimestamp: (clr as any).dispatchedAt || hist?.timestamp || clr.updatedAt,
          operatorName: hist?.operator || hist?.user || operator || "Dispatch Desk",
          customerName: pi?.customerName || "Customer LLC",
          projectName: pi?.projectName || "General Project",
        });
      }
    });

    // 2. Process Standard DGU / IGU Units (1 Colour Pane + 1 Clear Pane)
    const dguColour = dguItems.filter((i) => getItemFinish(i) === "Colour");
    const dguClear = dguItems.filter((i) => getItemFinish(i) === "Clear");
    const usedDguClear = new Set<string>();

    dguColour.forEach((col) => {
      const colDguPairId = (col as any).dguPairId;
      let partner = colDguPairId
        ? dguClear.find(
            (clr) => !usedDguClear.has(clr.serialNumber) && (clr as any).dguPairId === colDguPairId
          )
        : null;

      if (!partner) {
        partner = dguClear.find(
          (clr) => !usedDguClear.has(clr.serialNumber) && isDguStickerPairMatch(col, clr)
        );
      }

      if (partner) {
        usedDguClear.add(partner.serialNumber);
      }

      const pi = piMap.get(col.piId) || piMap.get(col.piNumber);
      const hist = historyBySerialMap.get(col.serialNumber);

      rows.push({
        id: `dispatched-dgu-${col.serialNumber}`,
        item: col,
        partnerItem: partner || null,
        allPartners: partner ? [partner] : [],
        allSerials: partner ? [col.serialNumber, partner.serialNumber] : [col.serialNumber],
        isDguPair: true,
        glassCategory: "DGU",
        effectiveSqm: col.sqm || parseFloat(((col.width * col.height) / 1000000).toFixed(2)),
        effectiveQty: col.qty || 1,
        dispatchedTimestamp: (col as any).dispatchedAt || hist?.timestamp || col.updatedAt,
        operatorName: hist?.operator || hist?.user || operator || "Dispatch Desk",
        customerName: pi?.customerName || "Customer LLC",
        projectName: pi?.projectName || "General Project",
      });
    });

    // Remaining DGU clear panes
    dguClear.forEach((clr) => {
      if (!usedDguClear.has(clr.serialNumber)) {
        const pi = piMap.get(clr.piId) || piMap.get(clr.piNumber);
        const hist = historyBySerialMap.get(clr.serialNumber);
        rows.push({
          id: `dispatched-dgu-clr-${clr.serialNumber}`,
          item: clr,
          partnerItem: null,
          allPartners: [],
          allSerials: [clr.serialNumber],
          isDguPair: false,
          glassCategory: "DGU",
          effectiveSqm: clr.sqm || parseFloat(((clr.width * clr.height) / 1000000).toFixed(2)),
          effectiveQty: clr.qty || 1,
          dispatchedTimestamp: (clr as any).dispatchedAt || hist?.timestamp || clr.updatedAt,
          operatorName: hist?.operator || hist?.user || operator || "Dispatch Desk",
          customerName: pi?.customerName || "Customer LLC",
          projectName: pi?.projectName || "General Project",
        });
      }
    });

    // 3. Process Laminated Glass Units (Pair complementary laminated panes together so each assembled unit is 1 unit)
    const usedLamPanes = new Set<string>();
    const sortedLamItems = [...lamItems].sort((a, b) => {
      const numA = parseInt(a.serialNumber.replace(/\D/g, ""), 10) || 0;
      const numB = parseInt(b.serialNumber.replace(/\D/g, ""), 10) || 0;
      return numA - numB;
    });

    for (let i = 0; i < sortedLamItems.length; i++) {
      const paneA = sortedLamItems[i];
      if (usedLamPanes.has(paneA.serialNumber)) continue;

      let match = sortedLamItems.find(
        (paneB) =>
          paneB.serialNumber !== paneA.serialNumber &&
          !usedLamPanes.has(paneB.serialNumber) &&
          isDguStickerPairMatch(paneA, paneB)
      );

      // Fallback pairing: same dimensions, batch, and order/customer
      if (!match) {
        match = sortedLamItems.find(
          (paneB) =>
            paneB.serialNumber !== paneA.serialNumber &&
            !usedLamPanes.has(paneB.serialNumber) &&
            paneB.width === paneA.width &&
            paneB.height === paneA.height &&
            (paneB.batchNo === paneA.batchNo || paneB.piNumber === paneA.piNumber || paneB.orderNo === paneA.orderNo)
        );
      }

      // Secondary fallback: next available unpaired pane in same batch or order
      if (!match && i + 1 < sortedLamItems.length) {
        match = sortedLamItems.find(
          (paneB) =>
            paneB.serialNumber !== paneA.serialNumber &&
            !usedLamPanes.has(paneB.serialNumber) &&
            (paneB.batchNo === paneA.batchNo || paneB.piNumber === paneA.piNumber)
        );
      }

      const pi =
        piMap.get(paneA.piId) ||
        piMap.get(paneA.piNumber) ||
        (match ? piMap.get(match.piId) || piMap.get(match.piNumber) : undefined);
      const hist = historyBySerialMap.get(paneA.serialNumber);

      if (match) {
        usedLamPanes.add(paneA.serialNumber);
        usedLamPanes.add(match.serialNumber);
        rows.push({
          id: `dispatched-lam-pair-${paneA.serialNumber}-${match.serialNumber}`,
          item: paneA,
          partnerItem: match,
          allPartners: [match],
          allSerials: [paneA.serialNumber, match.serialNumber],
          isDguPair: true,
          glassCategory: "Laminated",
          effectiveSqm: paneA.sqm || parseFloat(((paneA.width * paneA.height) / 1000000).toFixed(2)),
          effectiveQty: 1,
          dispatchedTimestamp:
            (paneA as any).dispatchedAt ||
            (match as any).dispatchedAt ||
            hist?.timestamp ||
            paneA.updatedAt,
          operatorName: hist?.operator || hist?.user || operator || "Dispatch Desk",
          customerName: pi?.customerName || "Customer LLC",
          projectName: pi?.projectName || "General Project",
        });
      } else {
        usedLamPanes.add(paneA.serialNumber);
        rows.push({
          id: `dispatched-lam-${paneA.serialNumber}`,
          item: paneA,
          partnerItem: null,
          allPartners: [],
          allSerials: [paneA.serialNumber],
          isDguPair: false,
          glassCategory: "Laminated",
          effectiveSqm: paneA.sqm || parseFloat(((paneA.width * paneA.height) / 1000000).toFixed(2)),
          effectiveQty: 1,
          dispatchedTimestamp: (paneA as any).dispatchedAt || hist?.timestamp || paneA.updatedAt,
          operatorName: hist?.operator || hist?.user || operator || "Dispatch Desk",
          customerName: pi?.customerName || "Customer LLC",
          projectName: pi?.projectName || "General Project",
        });
      }
    }

    // 4. Process General / Monolithic Items
    generalItems.forEach((item) => {
      const pi = piMap.get(item.piId) || piMap.get(item.piNumber);
      const hist = historyBySerialMap.get(item.serialNumber);
      rows.push({
        id: `dispatched-gen-${item.serialNumber}`,
        item,
        partnerItem: null,
        allPartners: [],
        allSerials: [item.serialNumber],
        isDguPair: false,
        glassCategory: "Monolithic",
        effectiveSqm: item.sqm || parseFloat(((item.width * item.height) / 1000000).toFixed(2)),
        effectiveQty: item.qty || 1,
        dispatchedTimestamp: (item as any).dispatchedAt || hist?.timestamp || item.updatedAt,
        operatorName: hist?.operator || hist?.user || operator || "Dispatch Desk",
        customerName: pi?.customerName || "Customer LLC",
        projectName: pi?.projectName || "General Project",
      });
    });

    // Sort by latest dispatched timestamp descending
    rows.sort((a, b) => {
      const timeA = new Date(a.dispatchedTimestamp || 0).getTime();
      const timeB = new Date(b.dispatchedTimestamp || 0).getTime();
      return timeB - timeA;
    });

    return rows;
  }, [rawDispatchedItems, piMap, historyBySerialMap, operator]);

  // Unique customers list for filter dropdown
  const uniqueCustomers = useMemo(() => {
    const custSet = new Set<string>();
    allUnitRows.forEach((r) => {
      if (r.customerName) custSet.add(r.customerName);
    });
    return Array.from(custSet).sort();
  }, [allUnitRows]);

  // Unique years list extracted from records for Year filter
  const availableYears = useMemo(() => {
    const yearSet = new Set<string>();
    const currentYear = new Date().getFullYear();
    yearSet.add(currentYear.toString());
    yearSet.add((currentYear - 1).toString()); // e.g. 2025

    allUnitRows.forEach((r) => {
      if (r.dispatchedTimestamp) {
        const y = new Date(r.dispatchedTimestamp).getFullYear();
        if (!isNaN(y)) yearSet.add(y.toString());
      }
    });

    return Array.from(yearSet).sort((a, b) => Number(b) - Number(a));
  }, [allUnitRows]);

  // Filtered Unit Rows according to user search and controls
  const filteredUnitRows = useMemo(() => {
    return allUnitRows.filter((row) => {
      const it = row.item;
      const partner = row.partnerItem;

      // 1. Universal Search Filter
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const parentPI = pis.find((p) => p.id === it.piId || p.piNumber === it.piNumber);
        const searchTarget = [
          it.serialNumber,
          it.barcode,
          it.qrId,
          it.piNumber,
          it.orderNo,
          it.sfoNo,
          it.obNo,
          it.batchNo,
          it.itemCode,
          it.glassType,
          it.delLocation,
          row.customerName,
          row.projectName,
          parentPI?.fileName,
          partner?.serialNumber,
          partner?.barcode,
          partner?.glassType,
          row.allSerials.join(" "),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!searchTarget.includes(query)) return false;
      }

      // 2. Glass Category Filter
      if (selectedCategory !== "all") {
        if (row.glassCategory !== selectedCategory) return false;
      }

      // 3. Finish Filter
      if (selectedFinish !== "all") {
        const finish = getItemFinish(it);
        if (finish !== selectedFinish) return false;
      }

      // 4. Customer Filter
      if (selectedCustomer !== "all") {
        if (row.customerName !== selectedCustomer) return false;
      }

      // 5. Date, Year & Range Filter
      if (row.dispatchedTimestamp) {
        const rowDate = new Date(row.dispatchedTimestamp);
        const validDate = !isNaN(rowDate.getTime());

        if (validDate) {
          // A. Specific Exact Date Filter (e.g. 2026-09-23)
          if (specificDate) {
            const yr = rowDate.getFullYear();
            const mo = String(rowDate.getMonth() + 1).padStart(2, "0");
            const dy = String(rowDate.getDate()).padStart(2, "0");
            const localDateStr = `${yr}-${mo}-${dy}`;
            const isoDateStr = rowDate.toISOString().split("T")[0];
            if (localDateStr !== specificDate && isoDateStr !== specificDate) {
              return false;
            }
          }

          // B. Specific Year Filter (e.g. 2026, 2025)
          if (selectedYear !== "all") {
            if (rowDate.getFullYear().toString() !== selectedYear) {
              return false;
            }
          }

          // C. Date Range Quick Filter
          if (dateRangeFilter !== "all") {
            const now = new Date();
            if (dateRangeFilter === "today") {
              const isSameDay =
                rowDate.getDate() === now.getDate() &&
                rowDate.getMonth() === now.getMonth() &&
                rowDate.getFullYear() === now.getFullYear();
              if (!isSameDay) return false;
            } else if (dateRangeFilter === "week") {
              const diffDays = (now.getTime() - rowDate.getTime()) / (1000 * 3600 * 24);
              if (diffDays > 7 || diffDays < 0) return false;
            } else if (dateRangeFilter === "month") {
              const isSameMonth =
                rowDate.getMonth() === now.getMonth() &&
                rowDate.getFullYear() === now.getFullYear();
              if (!isSameMonth) return false;
            }
          }
        }
      } else if (specificDate || selectedYear !== "all" || dateRangeFilter !== "all") {
        return false;
      }

      return true;
    });
  }, [
    allUnitRows,
    searchTerm,
    selectedCategory,
    selectedFinish,
    selectedCustomer,
    dateRangeFilter,
    selectedYear,
    specificDate,
  ]);

  // Overall Dispatched KPI Totals
  const kpiStats = useMemo(() => {
    const totalUnits = filteredUnitRows.reduce((sum, r) => sum + (r.effectiveQty || 1), 0);
    const totalPanes = rawDispatchedItems.length;
    const totalSqm = filteredUnitRows.reduce((sum, r) => sum + (r.effectiveSqm || 0), 0);

    const batchSet = new Set<string>();
    filteredUnitRows.forEach((r) => {
      const b = r.item.batchNo || formatBatchNumber(r.item.piNumber);
      if (b) batchSet.add(b);
    });

    const custSet = new Set<string>();
    filteredUnitRows.forEach((r) => {
      if (r.customerName) custSet.add(r.customerName);
    });

    return {
      totalUnits,
      totalPanes,
      totalSqm: parseFloat(totalSqm.toFixed(2)),
      totalBatches: batchSet.size,
      totalCustomers: custSet.size,
    };
  }, [filteredUnitRows, rawDispatchedItems]);

  // Customer Wise Grouping
  const customerGroups = useMemo<CustomerDispatchedGroup[]>(() => {
    const map = new Map<string, CustomerDispatchedGroup>();

    filteredUnitRows.forEach((r) => {
      const cust = r.customerName || "Customer LLC";
      if (!map.has(cust)) {
        map.set(cust, {
          customerName: cust,
          projectNames: new Set<string>(),
          batches: new Set<string>(),
          totalUnits: 0,
          totalSqm: 0,
          hasColour: false,
          hasClear: false,
          categories: new Set<string>(),
          rows: [],
        });
      }

      const grp = map.get(cust)!;
      if (r.projectName) grp.projectNames.add(r.projectName);
      const b = r.item.batchNo || formatBatchNumber(r.item.piNumber);
      if (b) grp.batches.add(b);

      grp.totalUnits += r.effectiveQty || 1;
      grp.totalSqm += r.effectiveSqm || 0;

      const finish = getItemFinish(r.item);
      if (finish === "Colour") grp.hasColour = true;
      if (finish === "Clear") grp.hasClear = true;

      grp.categories.add(r.glassCategory);
      grp.rows.push(r);
    });

    return Array.from(map.values()).sort((a, b) => b.totalUnits - a.totalUnits);
  }, [filteredUnitRows]);

  // Expand / collapse customer cards helper: Closed by default
  const isCustomerExpanded = (custName: string) => !!expandedCustomers[custName];

  const toggleCustomer = (custName: string) => {
    setExpandedCustomers((prev) => ({
      ...prev,
      [custName]: !prev[custName],
    }));
  };

  const expandAllCustomers = () => {
    const next: Record<string, boolean> = {};
    customerGroups.forEach((g) => {
      next[g.customerName] = true;
    });
    setExpandedCustomers(next);
  };

  const collapseAllCustomers = () => {
    setExpandedCustomers({});
  };

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRowIds(filteredUnitRows.map((r) => r.id));
    } else {
      setSelectedRowIds([]);
    }
  };

  const handleToggleRowSelect = (rowId: string) => {
    setSelectedRowIds((prev) =>
      prev.includes(rowId) ? prev.filter((id) => id !== rowId) : [...prev, rowId]
    );
  };

  const togglePartnerExpand = (rowId: string) => {
    setExpandedUnitIds((prev) => ({
      ...prev,
      [rowId]: !prev[rowId],
    }));
  };

  // Export full dispatched report to Excel
  const handleExportDispatchedToExcel = () => {
    if (filteredUnitRows.length === 0) {
      toast.error("No dispatched items to export.");
      return;
    }

    try {
      const rowsToExport =
        selectedRowIds.length > 0
          ? filteredUnitRows.filter((r) => selectedRowIds.includes(r.id))
          : filteredUnitRows;

      const excelRows = buildItemExportRows(rowsToExport.map((r) => r.item), "Finished", pis);

      const worksheet = XLSX.utils.json_to_sheet(excelRows);
      const workbook = XLSX.utils.book_new();
      worksheet["!cols"] = standardColWidths;
      XLSX.utils.book_append_sheet(workbook, worksheet, "Dispatched History");

      const dateTag = new Date().toISOString().split("T")[0];
      XLSX.writeFile(workbook, `Sejal_Dispatched_History_${dateTag}.xlsx`);
      toast.success(`Exported ${excelRows.length} dispatched rows to Excel successfully!`);
    } catch (err) {
      toast.error("Failed to generate Excel file.");
    }
  };

  // Export Partial Delivery Note
  const handleExportDeliveryNote = (customRows?: DispatchedUnitRow[]) => {
    const targetRows = customRows || (
      selectedRowIds.length > 0
        ? filteredUnitRows.filter((r) => selectedRowIds.includes(r.id))
        : filteredUnitRows
    );

    if (targetRows.length === 0) {
      toast.error("No items available to create delivery note.");
      return;
    }

    const targetItems = targetRows.map((r) => r.item);
    const parentPI = pis.find(
      (p) => p.id === targetItems[0]?.piId || p.piNumber === targetItems[0]?.piNumber
    );

    exportPartialDispatchNoteToExcel(parentPI, targetItems);
  };

  // Reusable Dispatched Rows Table
  const renderDispatchedRowsTable = (rows: DispatchedUnitRow[], showCustomerCol = false) => {
    return (
      <TableHorizontalScrollWrapper>
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50/90 text-slate-600 uppercase border-b border-slate-200 text-[10.5px] font-extrabold tracking-wider">
              <th className="py-3 px-3 text-center w-10">
                <input
                  type="checkbox"
                  checked={
                    rows.length > 0 && rows.every((r) => selectedRowIds.includes(r.id))
                  }
                  onChange={(e) => {
                    const checked = e.target.checked;
                    const rowIds = rows.map((r) => r.id);
                    if (checked) {
                      setSelectedRowIds((prev) => Array.from(new Set([...prev, ...rowIds])));
                    } else {
                      setSelectedRowIds((prev) => prev.filter((id) => !rowIds.includes(id)));
                    }
                  }}
                  className="w-[18px] h-[18px] rounded-md border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer transition-transform active:scale-95"
                />
              </th>
              <th className="py-3 px-3">Dispatched Time</th>
              {showCustomerCol && <th className="py-3 px-3">Client & Project</th>}
              <th className="py-3 px-3">Batch & SFO</th>
              <th className="py-3 px-3">Barcode</th>
              <th className="py-3 px-3">Dimensions (W × H)</th>
              <th className="py-3 px-3 text-center">Category</th>
              <th className="py-3 px-3">Glass Description</th>
              <th className="py-3 px-2 text-center">QTY</th>
              <th className="py-3 px-2 text-right">SQM (m²)</th>
              <th className="py-3 px-3 text-center">Assembled Panes</th>
              <th className="py-3 px-3">Destination</th>
              <th className="py-3 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={showCustomerCol ? 13 : 12} className="py-12 text-center text-slate-400">
                  <PackageCheck className="w-10 h-10 mx-auto mb-2 opacity-30 text-emerald-600" />
                  <p className="text-sm font-bold text-slate-700">No dispatched items</p>
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const it = row.item;
                const partner = row.partnerItem;
                const hasPartner = !!partner;
                const isExpanded = !!expandedUnitIds[row.id];
                const isSelected = selectedRowIds.includes(row.id);

                const finish = getItemFinish(it);
                const dispTime = row.dispatchedTimestamp
                  ? formatDubaiDateTime(row.dispatchedTimestamp)
                  : "—";

                return (
                  <React.Fragment key={row.id}>
                    <tr
                      className={`hover:bg-slate-50/90 transition-colors ${
                        isSelected ? "bg-emerald-50/50" : ""
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleRowSelect(row.id)}
                          className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer transition-transform active:scale-95"
                        />
                      </td>

                      {/* Dispatched Date/Time */}
                      <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">{dispTime}</div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1">
                          <span>By: {row.operatorName || "Shop Floor"}</span>
                        </div>
                      </td>

                      {/* Optional Customer Column */}
                      {showCustomerCol && (
                        <td className="py-2.5 px-3 max-w-[180px]">
                          <div className="font-bold text-slate-900 truncate" title={row.customerName}>
                            {row.customerName}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate" title={row.projectName}>
                            {row.projectName}
                          </div>
                        </td>
                      )}

                      {/* Batch & SFO */}
                      <td className="py-2.5 px-3 whitespace-nowrap font-mono">
                        <div className="font-bold text-indigo-700">
                          Batch #{it.batchNo || formatBatchNumber(it.piNumber)}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          SFO: {it.sfoNo || it.orderNo || "—"} • Pos: {it.posNo || "1"}
                        </div>
                      </td>

                      {/* Unit Barcode */}
                      <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                        <div className="font-black text-slate-900 flex items-center gap-1.5">
                          <span>{it.barcode || "—"}</span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            Dispatched
                          </span>
                        </div>
                      </td>

                      {/* Dimensions */}
                      <td className="py-2.5 px-3 font-mono whitespace-nowrap font-semibold text-slate-800">
                        {it.width} × {it.height} mm
                      </td>

                      {/* Category Badge */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                            row.glassCategory === "DLGU"
                              ? "bg-purple-50 text-purple-700 border-purple-200"
                              : row.glassCategory === "DGU"
                              ? "bg-teal-50 text-teal-700 border-teal-200"
                              : row.glassCategory === "Laminated"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                        >
                          {row.glassCategory}
                        </span>
                      </td>

                      {/* Glass Description & Finish */}
                      <td className="py-2.5 px-3 max-w-[220px]">
                        <div className="truncate font-medium text-slate-900" title={it.glassType || it.itemCode}>
                          {it.glassType || it.itemCode || "Glass Lite"}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className={`inline-block w-1.5 h-1.5 rounded-full ${
                              finish === "Colour" ? "bg-purple-500" : "bg-sky-400"
                            }`}
                          />
                          <span className="text-[10px] text-slate-500 font-semibold">{finish} Glass</span>
                        </div>
                      </td>

                      {/* Quantity */}
                      <td className="py-2.5 px-2 text-center font-mono font-bold text-slate-800 whitespace-nowrap">
                        {row.effectiveQty} {row.isDguPair ? "unit" : "pc"}
                      </td>

                      {/* SQM */}
                      <td className="py-2.5 px-2 text-right font-mono font-extrabold text-slate-900 whitespace-nowrap">
                        {row.effectiveSqm.toFixed(2)}
                      </td>

                      {/* IP Glass / Laminated Partner Panes Expand Button */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {hasPartner ? (
                          <button
                            type="button"
                            onClick={() => togglePartnerExpand(row.id)}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                              isExpanded
                                ? "bg-teal-700 text-white border-teal-800 shadow-2xs"
                                : "bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100"
                            }`}
                          >
                            <Link2 className="w-3 h-3" />
                            <span>
                              {row.glassCategory === "Laminated"
                                ? "Lami Unit (2 Panes)"
                                : row.glassCategory === "DLGU"
                                ? `DLGU (${(row.allPartners?.length || 0) + 1} Panes)`
                                : "DGU Unit (2 Panes)"}
                            </span>
                            <ChevronDown
                              className={`w-3 h-3 transition-transform ${
                                isExpanded ? "rotate-180" : ""
                              }`}
                            />
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-medium">Single Lite</span>
                        )}
                      </td>

                      {/* Destination */}
                      <td className="py-2.5 px-3 font-semibold text-slate-700 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Truck className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span>{it.delLocation || "FACTORY"}</span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onPrintSticker(it)}
                            className="w-7 h-7 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 flex items-center justify-center transition-all shadow-2xs cursor-pointer"
                            title="Print / Reprint Barcode Sticker"
                          >
                            <Tag className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expandable Partner Details Sub-Row */}
                    {hasPartner && isExpanded && (
                      <tr className="bg-teal-50/60 border-y border-teal-200/80">
                        <td colSpan={showCustomerCol ? 13 : 12} className="p-3 pl-12">
                          <div className="bg-white rounded-xl border border-teal-200 p-3 shadow-2xs space-y-2">
                            <div className="flex items-center justify-between text-xs font-bold text-teal-900">
                              <div className="flex items-center gap-2">
                                <Link2 className="w-4 h-4 text-teal-600" />
                                <span>
                                  {row.glassCategory === "Laminated"
                                    ? `Assembled Laminated Unit Panes for Unit #${it.serialNumber}`
                                    : `Assembled IP (Inner Pane) Glass Details for Unit #${it.serialNumber}`}
                                </span>
                              </div>
                              <span className="text-[11px] font-mono text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                                {it.barcode || "Unit Panes"}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
                              {/* Pane 1 (Primary / Outer / Layer 1) */}
                              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                                <div className="text-[10px] font-bold text-purple-700 uppercase">
                                  {row.glassCategory === "Laminated" ? "Layer 1 Pane" : "Outer Pane (OP)"}
                                </div>
                                <div className="font-mono font-black text-slate-900 mt-0.5">
                                  {it.barcode}
                                </div>
                                <div className="text-[11px] text-slate-600 truncate mt-0.5">
                                  {it.glassType}
                                </div>
                                <div className="text-[10px] text-slate-400 mt-1">
                                  Finish: <strong className="text-purple-700">{finish}</strong>
                                </div>
                              </div>

                              {/* Pane 2 (Partner / Inner / Layer 2) */}
                              {partner && (
                                <div className="p-2.5 bg-slate-50 rounded-lg border border-teal-200">
                                  <div className="text-[10px] font-bold text-teal-700 uppercase">
                                    {row.glassCategory === "Laminated" ? "Layer 2 Pane" : "Inner Pane (IP)"}
                                  </div>
                                  <div className="font-mono font-black text-slate-900 mt-0.5">
                                    {partner.barcode}
                                  </div>
                                  <div className="text-[11px] text-slate-600 truncate mt-0.5">
                                    {partner.glassType}
                                  </div>
                                  <div className="text-[10px] text-slate-400 mt-1">
                                    Finish: <strong className="text-teal-700">{getItemFinish(partner)}</strong>
                                  </div>
                                </div>
                              )}

                              {/* IP Inner Pane 2 for DLGU triple units */}
                              {row.allPartners && row.allPartners[1] && (
                                <div className="p-2.5 bg-slate-50 rounded-lg border border-teal-200">
                                  <div className="text-[10px] font-bold text-teal-700 uppercase">
                                    DLGU Middle / 2nd Inner Pane
                                  </div>
                                  <div className="font-mono font-black text-slate-900 mt-0.5">
                                    {row.allPartners[1].barcode}
                                  </div>
                                  <div className="text-[11px] text-slate-600 truncate mt-0.5">
                                    {row.allPartners[1].glassType}
                                  </div>
                                  <div className="text-[10px] text-slate-400 mt-1">
                                    Finish: <strong className="text-teal-700">{getItemFinish(row.allPartners[1])}</strong>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </TableHorizontalScrollWrapper>
    );
  };

  return (
    <div className="space-y-6">
      {/* ── Page Header & Top Controls ── */}
      <div className="ppb-panel bg-white border border-slate-100 p-5 shadow-[0_4px_20px_rgb(16,185,129,0.06)] mb-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Left: Title & Subtitle */}
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shrink-0">
              <PackageCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">Dispatched History</h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-200 shrink-0">
                  Customer-Wise Dispatch Records
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5 max-w-xl">
                Complete historical record of all glass items, paired units, and batches dispatched, organized customer wise.
              </p>
            </div>
          </div>

          {/* Right / Secondary Toolbar: Buttons */}
          <div className="w-full lg:w-auto flex flex-wrap items-center justify-between lg:justify-end gap-2.5 pt-3.5 border-t border-slate-100 lg:border-0 lg:pt-0 shrink-0">
            {/* Navigation & Refresh Group */}
            <div className="flex items-center gap-2">
              {onNavigateToDispatchQueue && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onNavigateToDispatchQueue}
                  className="h-9 px-3.5 text-xs font-bold text-slate-700 hover:text-blue-800 hover:bg-blue-50 border-slate-300 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs whitespace-nowrap transition-colors"
                >
                  <Truck className="w-3.5 h-3.5 text-blue-600" />
                  <span>Dispatch &amp; Shipping Queue</span>
                </Button>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRefresh}
                className="h-9 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 border-slate-300 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs whitespace-nowrap transition-colors"
                title="Refresh dispatched records"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh</span>
              </Button>
            </div>

            {/* Separator on desktop */}
            <div className="h-5 w-px bg-slate-200 hidden lg:block mx-1" />

            {/* Export Actions Group */}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={handleExportDispatchedToExcel}
                className="h-9 px-3.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>
                  Export Excel ({selectedRowIds.length > 0 ? `${selectedRowIds.length} Selected` : "All"})
                </span>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleExportDeliveryNote()}
                className="h-9 px-3.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border-emerald-300 rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
              >
                <Truck className="w-3.5 h-3.5 text-emerald-700" />
                <span>Delivery Note (.xlsx)</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Executive KPI Overview ── */}
      <div className="ppb-metrics-grid">
        {/* Card 1: Total Dispatched Units */}
        <div className="ppb-metric-card">
          <div className="ppb-metric-main">
            <div className="ppb-metric-copy">
              <h3>Dispatched Units</h3>
              <strong>{kpiStats.totalUnits} <span style={{fontSize:'16px'}}>Units</span></strong>
              <div className="ppb-metric-change">
                <span className="ppb-metric-change-up"><Check size={12} className="inline mr-1" />Assembled & Released</span>
              </div>
            </div>
            <div className="ppb-metric-icon ppb-metric-icon-green"><PackageCheck size={24} /></div>
          </div>
          <div className="ppb-metric-note ppb-note-green">
            <span>{kpiStats.totalPanes} glass panes assembled</span>
          </div>
        </div>

        {/* Card 2: Total Dispatched SQM */}
        <div className="ppb-metric-card">
          <div className="ppb-metric-main">
            <div className="ppb-metric-copy">
              <h3>Total Dispatched Area</h3>
              <strong>{kpiStats.totalSqm.toLocaleString()} <span style={{fontSize:'16px'}}>m²</span></strong>
              <div className="ppb-metric-change">
                <span className="ppb-metric-change-up">Verified Area</span>
              </div>
            </div>
            <div className="ppb-metric-icon ppb-metric-icon-blue"><Boxes size={24} /></div>
          </div>
          <div className="ppb-metric-note ppb-note-blue">
            <span>Surface area output</span>
          </div>
        </div>

        {/* Card 3: Dispatched Batches / SFOs */}
        <div className="ppb-metric-card">
          <div className="ppb-metric-main">
            <div className="ppb-metric-copy">
              <h3>Dispatched Batches</h3>
              <strong>{kpiStats.totalBatches} <span style={{fontSize:'16px'}}>Batches</span></strong>
              <div className="ppb-metric-change">
                <span className="ppb-metric-change-up">Fulfilled Orders</span>
              </div>
            </div>
            <div className="ppb-metric-icon" style={{background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', color: '#fff'}}><Layers size={24} /></div>
          </div>
          <div className="ppb-metric-note" style={{background: 'rgba(14,165,233,0.07)', color: '#0369a1'}}>
            <span>Batches fulfilled & released</span>
          </div>
        </div>

        {/* Card 4: Customers Delivered To */}
        <div className="ppb-metric-card">
          <div className="ppb-metric-main">
            <div className="ppb-metric-copy">
              <h3>Clients Served</h3>
              <strong>{kpiStats.totalCustomers} <span style={{fontSize:'16px'}}>Clients</span></strong>
              <div className="ppb-metric-change">
                <span className="ppb-metric-change-up" style={{color: '#8b5cf6'}}>Corporate Accounts</span>
              </div>
            </div>
            <div className="ppb-metric-icon" style={{background: 'linear-gradient(135deg, #a855f7, #7e22ce)', color: '#fff'}}><Users size={24} /></div>
          </div>
          <div className="ppb-metric-note" style={{background: 'rgba(168,85,247,0.07)', color: '#6b21a8'}}>
            <span>Active corporate accounts</span>
          </div>
        </div>
      </div>

      {/* ── Search, View Switcher & Filters Bar ── */}
      <div className="ppb-panel space-y-3.5 mb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Universal Search Bar */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              type="text"
              placeholder="Search Barcode, Batch #, SFO #, Customer, Project..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-8 h-9 text-xs font-medium border-slate-200 bg-slate-50 focus:bg-white rounded-xl transition-all"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Second Row: Specific Filters */}
        <div className="flex items-center justify-between flex-wrap gap-2.5 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Category Filter */}
            <div className="flex items-center gap-1.5 text-slate-600 font-semibold">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span>Category:</span>
            </div>
            <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              {["all", "DLGU", "DGU", "Laminated"].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                    selectedCategory === cat
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {cat === "all" ? "All" : cat}
                </button>
              ))}
            </div>

            {/* Finish Filter */}
            <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 ml-2">
              <button
                type="button"
                onClick={() => setSelectedFinish("all")}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                  selectedFinish === "all"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                All Finishes
              </button>
              <button
                type="button"
                onClick={() => setSelectedFinish("Colour")}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  selectedFinish === "Colour"
                    ? "bg-purple-600 text-white shadow-xs"
                    : "text-purple-700 hover:text-purple-900"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                <span>Colour</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedFinish("Clear")}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  selectedFinish === "Clear"
                    ? "bg-sky-600 text-white shadow-xs"
                    : "text-sky-700 hover:text-sky-900"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                <span>Clear</span>
              </button>
            </div>

            {/* Customer Dropdown */}
            {uniqueCustomers.length > 1 && (
              <div className="relative inline-flex items-center ml-2">
                <select
                  value={selectedCustomer}
                  onChange={(e) => setSelectedCustomer(e.target.value)}
                  className="h-7 text-[11px] font-bold bg-white border border-slate-200 rounded-lg px-2.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer max-w-[200px] truncate"
                >
                  <option value="all">All Clients ({uniqueCustomers.length})</option>
                  {uniqueCustomers.map((cust) => (
                    <option key={cust} value={cust}>
                      {cust}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Date Range, Year & Specific Date Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500">Date Range:</span>
              <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                {[
                  { id: "all", label: "All Time" },
                  { id: "today", label: "Today" },
                  { id: "week", label: "Past 7 Days" },
                  { id: "month", label: "This Month" },
                ].map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      setDateRangeFilter(d.id as any);
                      setSelectedYear("all");
                      setSpecificDate("");
                    }}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                      dateRangeFilter === d.id && selectedYear === "all" && !specificDate
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Year Selector Dropdown (e.g., 2026, 2025) */}
            <div className="relative inline-flex items-center">
              <select
                value={selectedYear}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedYear(val);
                  if (val !== "all") {
                    setDateRangeFilter("all");
                    setSpecificDate("");
                  }
                }}
                className={`h-7 text-[11px] font-bold border rounded-lg px-2 text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer transition-colors ${
                  selectedYear !== "all"
                    ? "bg-emerald-50 text-emerald-800 border-emerald-300 font-extrabold"
                    : "bg-white border-slate-200"
                }`}
                title="Filter by Year (e.g. 2026, 2025)"
              >
                <option value="all">All Years</option>
                {availableYears.map((yr) => (
                  <option key={yr} value={yr}>
                    Year {yr}
                  </option>
                ))}
              </select>
            </div>

            {/* Specific Exact Date Picker */}
            <div className="relative inline-flex items-center">
              <div
                className={`flex items-center gap-1 border rounded-lg px-2 h-7 transition-colors ${
                  specificDate
                    ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                    : "bg-white border-slate-200 text-slate-600"
                }`}
              >
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  type="date"
                  value={specificDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSpecificDate(val);
                    if (val) {
                      setDateRangeFilter("all");
                      setSelectedYear("all");
                    }
                  }}
                  className="text-[11px] font-bold bg-transparent border-none p-0 focus:outline-none focus:ring-0 cursor-pointer text-slate-700"
                  title="Filter by specific date (e.g. 2026-09-23)"
                />
                {specificDate && (
                  <button
                    type="button"
                    onClick={() => setSpecificDate("")}
                    className="p-0.5 text-slate-400 hover:text-slate-600 cursor-pointer ml-0.5"
                    title="Clear date"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Customer Wise Grouped Cards ── */}
      <div className="space-y-4">
          {/* Header Action: Expand All / Collapse All */}
          <div className="flex items-center justify-between px-1 text-xs">
            <div className="flex items-center gap-2 text-slate-600 font-bold">
              <Building2 className="w-4 h-4 text-emerald-600" />
              <span>
                Dispatched Orders by Customer ({customerGroups.length} Clients • {filteredUnitRows.length} Total Units)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={expandAllCustomers}
                className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
              >
                Expand All
              </button>
              <span className="text-slate-300">•</span>
              <button
                type="button"
                onClick={collapseAllCustomers}
                className="text-[11px] font-bold text-slate-500 hover:text-slate-800 hover:underline cursor-pointer"
              >
                Collapse All
              </button>
            </div>
          </div>

          {customerGroups.length === 0 ? (
            <div className="py-16 text-center text-slate-400 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3 px-4">
              <PackageCheck className="w-14 h-14 mx-auto mb-1 text-emerald-600/40" />
              <p className="text-base font-extrabold text-slate-800">
                {searchTerm || specificDate || selectedYear !== "all" || dateRangeFilter !== "all"
                  ? "No Dispatched Records Found Matching Filters"
                  : "No Glass Units Dispatched Yet"}
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                {searchTerm || specificDate || selectedYear !== "all" || dateRangeFilter !== "all"
                  ? "Try resetting your search query or date filters above to view all historical shipments."
                  : "Glass units finished in production currently reside in the Dispatch & Shipping workstation. Once you click 'Send to Dispatch', they will be permanently stored and archived here lifelong."}
              </p>
              {onNavigateToDispatchQueue && !searchTerm && (
                <div className="pt-2">
                  <Button
                    type="button"
                    onClick={onNavigateToDispatchQueue}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs h-9 px-4 gap-2 rounded-xl shadow-xs"
                  >
                    <Truck className="w-4 h-4" />
                    <span>Go to Dispatch & Shipping Workstation</span>
                  </Button>
                </div>
              )}
            </div>
          ) : (
            customerGroups.map((customer) => {
              const isExpanded = isCustomerExpanded(customer.customerName);

              return (
                <div
                  key={customer.customerName}
                  className="ppb-panel p-0 overflow-hidden shadow-[0_4px_20px_rgb(16,185,129,0.04)] border-slate-100 hover:border-emerald-400 transition-all duration-300"
                >
                  {/* Customer Card Header Bar */}
                  <div
                    onClick={() => toggleCustomer(customer.customerName)}
                    className="p-4 bg-gradient-to-r from-slate-50 via-white to-emerald-50/20 hover:from-emerald-50/30 flex items-center justify-between flex-wrap gap-3 cursor-pointer transition-colors border-b border-slate-200/70"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-center justify-center font-black text-sm shrink-0 shadow-xs">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-extrabold text-slate-900 truncate">
                            {customer.customerName}
                          </h3>
                          {customer.hasColour && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-200">
                              Coloured
                            </span>
                          )}
                          {customer.hasClear && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-cyan-100 text-cyan-800 border border-cyan-200">
                              Clear
                            </span>
                          )}
                          {Array.from(customer.categories).map((cat) => (
                            <span
                              key={cat}
                              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black border ${
                                cat === "DLGU"
                                  ? "bg-purple-100 text-purple-900 border-purple-200"
                                  : cat === "DGU"
                                  ? "bg-teal-100 text-teal-900 border-teal-200"
                                  : cat === "Laminated"
                                  ? "bg-amber-100 text-amber-900 border-amber-200"
                                  : "bg-slate-100 text-slate-800 border-slate-200"
                              }`}
                            >
                              {cat}
                            </span>
                          ))}
                        </div>
                        <div className="text-xs text-slate-500 font-medium flex items-center gap-2 mt-0.5 flex-wrap">
                          <span>
                            Projects: <strong className="text-slate-700">{Array.from(customer.projectNames).join(", ") || "General"}</strong>
                          </span>
                          <span>•</span>
                          <span>
                            Batches: <strong className="text-indigo-700 font-mono">{Array.from(customer.batches).map((b) => `#${b}`).join(", ") || "—"}</strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Metrics & Actions */}
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className="font-mono text-sm font-black text-emerald-700">
                          {customer.totalUnits} {customer.totalUnits === 1 ? "Unit" : "Units"}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {customer.totalSqm.toFixed(2)} m²
                        </div>
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExportDeliveryNote(customer.rows);
                        }}
                        className="h-8 px-2.5 text-[11px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border-emerald-300 rounded-lg shadow-2xs flex items-center gap-1 cursor-pointer"
                        title="Export Delivery Note for this customer"
                      >
                        <Truck className="w-3 h-3 text-emerald-700" />
                        <span className="hidden sm:inline">Delivery Note</span>
                      </Button>

                      <div className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-emerald-100 hover:text-emerald-700 transition-colors">
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Customer Dispatched Table (Rendered when expanded) */}
                  {isExpanded && (
                    <div className="border-t border-slate-200 bg-slate-50/30 p-3.5">
                      <div className="ppb-panel p-0 overflow-hidden shadow-[0_4px_20px_rgb(16,185,129,0.04)] border-slate-100/60">
                        {renderDispatchedRowsTable(customer.rows, false)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
    </div>
  );
};
