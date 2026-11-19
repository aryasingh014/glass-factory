import React, { useState, useMemo } from "react";
import {
  History,
  Calendar,
  Clock,
  Boxes,
  Layers,
  Search,
  Filter,
  Download,
  Building2,
  Tag,
  CheckCircle2,
  Check,
  Truck,
  Send,
  X,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  Barcode,
  SlidersHorizontal,
  RefreshCw,
  Sparkles,
  FileText,
  Briefcase,
  RotateCcw,
  Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TableHorizontalScrollWrapper } from "@/components/TableHorizontalScrollWrapper";
import { GlassItem } from "@shared/api";
import type { PackingUnitRow } from "@/components/PackingListView";
import { formatRackBarcode, RackLetter, RACK_LETTERS } from "@shared/barcodeConfig";
import { generateBarcodeSVG } from "@/lib/barcode";
import * as XLSX from "xlsx";
import { toast } from "sonner";

interface PackingHistoryModuleProps {
  type: "IGU" | "LAMI";
  rows: PackingUnitRow[];
  onOpenSticker: (item: GlassItem) => void;
  onRefresh?: () => void;
}

type DatePreset = "all" | "today" | "yesterday" | "7days" | "month" | "custom";
type StatusFilter = "ALL" | "ON_RACK" | "SENT_FINISHED" | "DISPATCHED";
type ShiftFilter = "ALL" | "Day" | "Night";

interface EditingRowState {
  row: PackingUnitRow;
  targetRack: RackLetter;
  targetSlot: string;
  targetShift: "Day" | "Night";
  targetSentToFinished: boolean;
}

interface PrintJobState {
  title: string;
  rackLabel: string;
  rows: PackingUnitRow[];
  printedAt: string;
  shift: string;
}

function getRowHistoryTimestamp(row: PackingUnitRow): string {
  return (
    row.primaryItem.dispatchedAt ||
    row.partnerItem?.dispatchedAt ||
    row.sentToFinishedAt ||
    row.packedAt ||
    (row.primaryItem as any).updatedAt ||
    row.primaryItem.createdAt ||
    ""
  );
}

function getRowDateKey(row: PackingUnitRow): string {
  const ts = getRowHistoryTimestamp(row);
  if (!ts) return "Unknown Date";
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return "Unknown Date";
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dubai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return "Unknown Date";
  }
}

function formatRowDisplayDate(dateKey: string): string {
  if (dateKey === "Unknown Date") return "Previous Records";
  try {
    const [y, m, d] = dateKey.split("-").map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Dubai",
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(dateObj);
  } catch {
    return dateKey;
  }
}

function formatRowDateTime(iso?: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Dubai",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  } catch {
    return String(iso);
  }
}

function getTodayDubaiDateString(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dubai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().split("T")[0];
  }
}

function getYesterdayDubaiDateString(): string {
  try {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dubai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return "";
  }
}

export const PackingHistoryModule: React.FC<PackingHistoryModuleProps> = ({
  type,
  rows,
  onOpenSticker,
  onRefresh,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customDate, setCustomDate] = useState<string>(getTodayDubaiDateString());
  const [shiftFilter, setShiftFilter] = useState<ShiftFilter>("ALL");
  const [rackFilter, setRackFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [customerFilter, setCustomerFilter] = useState<string>("ALL");

  // View Grouping: Default to Customer-Wise
  const [viewGrouping, setViewGrouping] = useState<"customer" | "rack" | "date" | "flat">("customer");
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());
  const [collapsedCustomers, setCollapsedCustomers] = useState<Set<string>>(new Set());
  const [collapsedRacks, setCollapsedRacks] = useState<Set<string>>(new Set());

  // Edit Rack Assignment modal state
  const [editingRow, setEditingRow] = useState<EditingRowState | null>(null);

  // Print Job State for printable A4 manifest
  const [printJob, setPrintJob] = useState<PrintJobState | null>(null);

  const todayStr = useMemo(() => getTodayDubaiDateString(), []);
  const yesterdayStr = useMemo(() => getYesterdayDubaiDateString(), []);

  // Filtered rows BEFORE applying specific rackFilter (used to compute counts per rack A, B, C, D, E)
  const filteredRowsBeforeRack = useMemo(() => {
    const now = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const query = searchTerm.toLowerCase().trim();

    return rows.filter((row) => {
      // 1. Date Filtering
      const dateKey = getRowDateKey(row);
      const ts = getRowHistoryTimestamp(row);
      const rowDateObj = ts ? new Date(ts) : null;

      if (datePreset === "today") {
        if (dateKey !== todayStr) return false;
      } else if (datePreset === "yesterday") {
        if (dateKey !== yesterdayStr) return false;
      } else if (datePreset === "7days") {
        if (!rowDateObj || rowDateObj < sevenDaysAgo) return false;
      } else if (datePreset === "month") {
        if (!rowDateObj || rowDateObj < startOfMonth) return false;
      } else if (datePreset === "custom") {
        if (customDate && dateKey !== customDate) return false;
      }

      // 2. Shift Filter
      if (shiftFilter !== "ALL") {
        const rowShift = row.shift === "A" ? "Day" : row.shift === "B" ? "Night" : row.shift;
        if (rowShift !== shiftFilter) return false;
      }

      // 3. Status Filter
      if (statusFilter === "DISPATCHED") {
        if (!row.isDispatched) return false;
      } else if (statusFilter === "SENT_FINISHED") {
        if (!row.sentToFinished || row.isDispatched) return false;
      } else if (statusFilter === "ON_RACK") {
        if (row.sentToFinished || row.isDispatched) return false;
      }

      // 4. Client Filter
      if (customerFilter !== "ALL") {
        if (row.customerName !== customerFilter) return false;
      }

      // 5. Search query filter
      if (query) {
        const outerBarcode = row.primaryItem.barcode || row.primaryItem.serialNumber || "";
        const innerBarcode = row.partnerItem?.barcode || row.partnerItem?.serialNumber || "";
        const spec = (row.primaryItem as any)?.glassSpec || row.primaryItem?.glassType || "";
        const match =
          String(row.posNo || "").toLowerCase().includes(query) ||
          String(row.piNumber || "").toLowerCase().includes(query) ||
          String(row.batchNo || "").toLowerCase().includes(query) ||
          String(row.obNo || "").toLowerCase().includes(query) ||
          String(row.sfoNo || "").toLowerCase().includes(query) ||
          String(row.customerName || "").toLowerCase().includes(query) ||
          String(row.projectName || "").toLowerCase().includes(query) ||
          String(row.rackNo || "").toLowerCase().includes(query) ||
          String(row.rackSlot || "").toLowerCase().includes(query) ||
          String(row.dispatchNoteNo || "").toLowerCase().includes(query) ||
          outerBarcode.toLowerCase().includes(query) ||
          innerBarcode.toLowerCase().includes(query) ||
          spec.toLowerCase().includes(query) ||
          row.allSerials.some((s) => s.toLowerCase().includes(query));

        if (!match) return false;
      }

      return true;
    });
  }, [
    rows,
    datePreset,
    customDate,
    todayStr,
    yesterdayStr,
    shiftFilter,
    statusFilter,
    customerFilter,
    searchTerm,
  ]);

  // Per-Rack item counts (Rack A, B, C, D, E) for the visual selector pills
  const rackCounts = useMemo(() => {
    const counts: Record<string, number> = {
      "Rack A": 0,
      "Rack B": 0,
      "Rack C": 0,
      "Rack D": 0,
      "Rack E": 0,
    };
    filteredRowsBeforeRack.forEach((r) => {
      const rk = r.rackNo || "Rack A";
      if (counts[rk] !== undefined) {
        counts[rk] += 1;
      }
    });
    return counts;
  }, [filteredRowsBeforeRack]);

  // Filtered rows including Rack Filter
  const filteredRows = useMemo(() => {
    if (rackFilter === "ALL") return filteredRowsBeforeRack;
    return filteredRowsBeforeRack.filter((r) => (r.rackNo || "Rack A") === rackFilter);
  }, [filteredRowsBeforeRack, rackFilter]);

  // 1. Group by Customer, and SUB-GROUP EACH CUSTOMER BY PHYSICAL RACK (A, B, C, D, E)
  const groupedByCustomer = useMemo(() => {
    const map = new Map<
      string,
      {
        customerName: string;
        projectName: string;
        pdfFileName: string;
        rows: PackingUnitRow[];
      }
    >();

    filteredRows.forEach((row) => {
      const cust = (row.customerName || "General Customer").trim();
      const proj = (row.projectName || "").trim();
      const pdf = (row.pdfFileName || "").trim();
      const groupKey = pdf ? `${pdf}:::${cust}:::${proj}` : `${cust}:::${proj}`;

      if (!map.has(groupKey)) {
        map.set(groupKey, {
          customerName: cust,
          projectName: proj,
          pdfFileName: pdf,
          rows: [],
        });
      }
      map.get(groupKey)!.rows.push(row);
    });

    return Array.from(map.entries()).map(([groupKey, data]) => {
      let totalUnits = 0;
      let totalSqm = 0;
      let hasColour = false;
      let hasClear = false;
      const categories = new Set<string>();
      const allRacks = new Set<string>();
      const dates = new Set<string>();

      // Sub-divide this customer's rows by physical rack (Rack A, Rack B, Rack C, Rack D, Rack E)
      const rackSubMap = new Map<
        string,
        {
          rack: string;
          slots: Set<string>;
          rows: PackingUnitRow[];
          totalUnits: number;
          totalSqm: number;
        }
      >();

      data.rows.forEach((r) => {
        const qty = r.qty || 1;
        totalUnits += qty;
        totalSqm += r.sqm || 0;

        if (r.finish === "Colour") hasColour = true;
        else if (r.finish === "Clear") hasClear = true;

        if (r.glassCategory) categories.add(r.glassCategory);
        const rk = r.rackNo || "Rack A";
        allRacks.add(rk);

        if (!rackSubMap.has(rk)) {
          rackSubMap.set(rk, {
            rack: rk,
            slots: new Set(),
            rows: [],
            totalUnits: 0,
            totalSqm: 0,
          });
        }
        const sub = rackSubMap.get(rk)!;
        sub.rows.push(r);
        sub.totalUnits += qty;
        sub.totalSqm += r.sqm || 0;
        if (r.rackSlot) sub.slots.add(r.rackSlot);

        const dateKey = getRowDateKey(r);
        if (dateKey !== "Unknown Date") dates.add(dateKey);
      });

      // Sort rack sub-groups alphabetically (Rack A, Rack B, Rack C, Rack D, Rack E)
      const rackGroups = Array.from(rackSubMap.values()).sort((a, b) =>
        a.rack.localeCompare(b.rack)
      );

      return {
        groupKey,
        customerName: data.customerName,
        projectName: data.projectName,
        pdfFileName: data.pdfFileName,
        rows: data.rows,
        rackGroups,
        totalUnits,
        totalSqm,
        hasColour,
        hasClear,
        categories: Array.from(categories),
        racks: Array.from(allRacks),
        dates: Array.from(dates),
      };
    });
  }, [filteredRows]);

  // 2. Dedicated Rack-Wise View: Group everything directly into Rack A, Rack B, Rack C, Rack D, Rack E
  const groupedByRack = useMemo(() => {
    const map = new Map<
      RackLetter,
      {
        rack: RackLetter;
        rows: PackingUnitRow[];
        totalUnits: number;
        totalSqm: number;
        customers: Set<string>;
        slots: Set<string>;
      }
    >();

    RACK_LETTERS.forEach((rk) => {
      map.set(rk, {
        rack: rk,
        rows: [],
        totalUnits: 0,
        totalSqm: 0,
        customers: new Set(),
        slots: new Set(),
      });
    });

    filteredRows.forEach((r) => {
      const rk = (
        r.rackNo && (RACK_LETTERS as readonly string[]).includes(r.rackNo)
          ? r.rackNo
          : "Rack A"
      ) as RackLetter;
      const entry = map.get(rk)!;
      entry.rows.push(r);
      entry.totalUnits += r.qty || 1;
      entry.totalSqm += r.sqm || 0;
      if (r.customerName) entry.customers.add(r.customerName);
      if (r.rackSlot) entry.slots.add(r.rackSlot);
    });

    return Array.from(map.values());
  }, [filteredRows]);

  // 3. Group by Date Key (Date-Wise View)
  const groupedByDate = useMemo(() => {
    const map = new Map<string, PackingUnitRow[]>();
    filteredRows.forEach((r) => {
      const key = getRowDateKey(r);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });

    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === "Unknown Date") return 1;
      if (b[0] === "Unknown Date") return -1;
      return b[0].localeCompare(a[0]);
    });
  }, [filteredRows]);

  // Summary Metrics for current filtered view
  const summaryMetrics = useMemo(() => {
    const totalUnits = filteredRows.length;
    const totalSqm = filteredRows.reduce((acc, r) => acc + (r.sqm || 0), 0);
    const dispatchedUnits = filteredRows.filter((r) => r.isDispatched).length;
    const sentFinishedUnits = filteredRows.filter((r) => r.sentToFinished && !r.isDispatched).length;
    const onRackUnits = filteredRows.filter((r) => !r.sentToFinished && !r.isDispatched).length;

    const usedRacks = new Set<string>();
    filteredRows.forEach((r) => {
      if (r.rackNo) usedRacks.add(r.rackNo);
    });

    return {
      totalUnits,
      totalSqm,
      dispatchedUnits,
      sentFinishedUnits,
      onRackUnits,
      activeRackCount: usedRacks.size,
    };
  }, [filteredRows]);

  const toggleCollapseDate = (dateKey: string) => {
    setCollapsedDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) next.delete(dateKey);
      else next.add(dateKey);
      return next;
    });
  };

  const toggleCollapseCustomer = (groupKey: string) => {
    setCollapsedCustomers((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  const toggleCollapseRack = (rackName: string) => {
    setCollapsedRacks((prev) => {
      const next = new Set(prev);
      if (next.has(rackName)) next.delete(rackName);
      else next.add(rackName);
      return next;
    });
  };

  const expandAllCustomers = () => setCollapsedCustomers(new Set());
  const collapseAllCustomers = () => {
    const allKeys = new Set(groupedByCustomer.map((g) => g.groupKey));
    setCollapsedCustomers(allKeys);
  };

  /* ─────────────────────────────────────────────────────────────────────────────
     Print Packing History Manifest Handler
     ───────────────────────────────────────────────────────────────────────────── */
  const handlePrint = (
    itemsToPrint: PackingUnitRow[],
    manifestTitle: string,
    rackName: string = "All Racks"
  ) => {
    if (itemsToPrint.length === 0) {
      toast.warning("No records to print for this selection!");
      return;
    }

    const nowStr = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Dubai",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(new Date());

    const firstShift = itemsToPrint[0]?.shift || "Day";

    setPrintJob({
      title: manifestTitle,
      rackLabel: rackName,
      rows: itemsToPrint,
      printedAt: nowStr,
      shift: firstShift,
    });

    document.body.classList.add("printing-history");

    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.body.classList.remove("printing-history");
      }, 500);
    }, 150);
  };

  /* ─────────────────────────────────────────────────────────────────────────────
     Operator Actions: Make Changes / Return to Rack / Change Assignment
     ───────────────────────────────────────────────────────────────────────────── */

  const handleReturnToActiveRack = async (row: PackingUnitRow) => {
    try {
      const rack = row.rackNo || "Rack A";
      const slot = row.rackSlot ? ` - ${row.rackSlot}` : "";
      const res = await fetch("/api/production/pack-to-rack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemIds: row.allItemIds,
          rackNo: `${rack}${slot}`,
          shift: row.shift || "Day",
          sentToFinished: false,
          packPartners: true,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success !== false) {
        toast.success(`POS #${row.posNo} returned to active rack (${rack}${slot}) for changes.`);
        if (onRefresh) onRefresh();
      } else {
        toast.error(data.error || "Failed to return unit to active rack");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to return unit to active rack");
    }
  };

  const handleReturnCustomerBatchToActiveRack = async (
    customerRows: PackingUnitRow[],
    batchTitle: string
  ) => {
    try {
      const allIds = customerRows.flatMap((r) => r.allItemIds);
      const firstRack = customerRows[0]?.rackNo || "Rack A";
      const firstSlot = customerRows[0]?.rackSlot ? ` - ${customerRows[0].rackSlot}` : "";
      const res = await fetch("/api/production/pack-to-rack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemIds: allIds,
          rackNo: `${firstRack}${firstSlot}`,
          shift: customerRows[0]?.shift || "Day",
          sentToFinished: false,
          packPartners: true,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success !== false) {
        toast.success(`Returned ${customerRows.length} units for "${batchTitle}" to active rack.`);
        if (onRefresh) onRefresh();
      } else {
        toast.error(data.error || "Failed to return units to active rack");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to return batch to active rack");
    }
  };

  const handleOpenEditModal = (row: PackingUnitRow) => {
    let targetRack: RackLetter = "Rack A";
    if (row.rackNo && (RACK_LETTERS as readonly string[]).includes(row.rackNo)) {
      targetRack = row.rackNo as RackLetter;
    }
    const targetSlot = row.rackSlot || "";
    const targetShift = row.shift === "Night" || row.shift === "B" ? "Night" : "Day";
    const targetSentToFinished = Boolean(row.sentToFinished && !row.isDispatched);

    setEditingRow({
      row,
      targetRack,
      targetSlot,
      targetShift,
      targetSentToFinished,
    });
  };

  const handleSaveEditModal = async () => {
    if (!editingRow) return;
    try {
      const rack = editingRow.targetRack;
      const slot = editingRow.targetSlot.trim() ? ` - ${editingRow.targetSlot.trim()}` : "";
      const res = await fetch("/api/production/pack-to-rack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemIds: editingRow.row.allItemIds,
          rackNo: `${rack}${slot}`,
          shift: editingRow.targetShift,
          sentToFinished: editingRow.targetSentToFinished,
          packPartners: true,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success !== false) {
        toast.success(
          `POS #${editingRow.row.posNo} updated to ${rack}${slot} (${
            editingRow.targetSentToFinished ? "Finished" : "On Rack"
          }).`
        );
        setEditingRow(null);
        if (onRefresh) onRefresh();
      } else {
        toast.error(data.error || "Failed to update rack assignment");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to update rack assignment");
    }
  };

  const handleUnpackFromEditModal = async () => {
    if (!editingRow) return;
    try {
      const res = await fetch("/api/production/unpack-from-rack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemIds: editingRow.row.allItemIds,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success !== false) {
        toast.success(`POS #${editingRow.row.posNo} removed from rack and returned to Pending Queue.`);
        setEditingRow(null);
        if (onRefresh) onRefresh();
      } else {
        toast.error(data.error || "Failed to unpack unit");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to unpack unit");
    }
  };

  const handleExportExcel = () => {
    if (filteredRows.length === 0) {
      toast.warning("No records to export for the selected date/filter!");
      return;
    }

    const dataRows = filteredRows.map((r, idx) => {
      const outerBarcode = r.primaryItem.barcode || r.primaryItem.serialNumber || "";
      const innerBarcode = r.partnerItem?.barcode || r.partnerItem?.serialNumber || "";
      const statusText = r.isDispatched
        ? `Dispatched (${r.dispatchNoteNo || "DN"})`
        : r.sentToFinished
        ? "Sent to Finished"
        : "On Rack";

      return {
        SNO: idx + 1,
        "DATE & TIME": formatRowDateTime(getRowHistoryTimestamp(r)),
        "DATE KEY": getRowDateKey(r),
        "RACK NO": r.rackNo || "Rack A",
        "SLOT NO": r.rackSlot || "",
        "RACK BARCODE": formatRackBarcode(r.rackNo || "Rack A", r.rackSlot),
        SHIFT: r.shift || "Day",
        STATUS: statusText,
        "POS NO": r.posNo,
        "PI NO": r.piNumber || "",
        "BATCH NO": r.batchNo || "",
        "SFO NO": r.sfoNo || "",
        "OB NO": r.obNo || "",
        "CUSTOMER NAME": r.customerName,
        PROJECT: r.projectName || "",
        CATEGORY: r.glassCategory || (type === "IGU" ? "DGU" : "Lamination"),
        "GLASS SPEC": (r.primaryItem as any)?.glassSpec || r.primaryItem?.glassType || "",
        "WIDTH (mm)": r.width,
        "HEIGHT (mm)": r.height,
        "QTY (UNITS)": r.qty || 1,
        "AREA (m²)": parseFloat((r.sqm || 0).toFixed(2)),
        "OUTER BARCODE": outerBarcode,
        "INNER BARCODE": innerBarcode,
        "ALL SERIALS": r.allSerials.join(", "),
        "PACKED BY": r.packedBy || "",
        "DISPATCH NOTE NO": r.dispatchNoteNo || "",
      };
    });

    const ws = XLSX.utils.json_to_sheet(dataRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Packing History");

    const deptPrefix = type === "IGU" ? "IGU_Packing" : "Auto_Clave";
    const dateLabel = datePreset === "custom" ? customDate : datePreset;
    const rackLabel = rackFilter === "ALL" ? "AllRacks" : rackFilter.replace(" ", "");
    const fileName = `${deptPrefix}_History_${rackLabel}_${dateLabel}_${
      new Date().toISOString().split("T")[0]
    }.xlsx`;

    XLSX.writeFile(wb, fileName);
    toast.success(`Exported ${filteredRows.length} history records to Excel!`);
  };

  // Helper renderer for Row Action Buttons
  const renderRowActions = (row: PackingUnitRow) => (
    <div className="flex items-center justify-center gap-1">
      {/* Return to Rack Button */}
      <button
        type="button"
        onClick={() => handleReturnToActiveRack(row)}
        className="p-1 rounded-md text-amber-600 hover:text-amber-800 hover:bg-amber-50 transition-colors cursor-pointer border border-transparent hover:border-amber-200"
        title="Return to Active Rack for changes"
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </button>

      {/* Change Rack / Edit Assignment Button */}
      <button
        type="button"
        onClick={() => handleOpenEditModal(row)}
        className="p-1 rounded-md text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 transition-colors cursor-pointer border border-transparent hover:border-indigo-200"
        title="Change Rack, Slot, Shift, or Unpack"
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
      </button>

      {/* Sticker Barcode Button */}
      <button
        type="button"
        onClick={() => onOpenSticker(row.primaryItem)}
        className="p-1 rounded-md text-slate-500 hover:text-indigo-600 hover:bg-slate-100 transition-colors cursor-pointer border border-transparent hover:border-slate-200"
        title="View / Print physical barcode sticker"
      >
        <Tag className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* ── Top Header & Control Strip ── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-indigo-700 text-white flex items-center justify-center shadow-xs">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-900 tracking-tight">
                  {type === "IGU" ? "IGU PACKING OPERATIONS HISTORY" : "AUTO CLAVE PACKING HISTORY"}
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-xs font-mono font-black border border-indigo-200">
                  {filteredRows.length} Records
                </span>
                {rackFilter !== "ALL" && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 text-xs font-mono font-black border border-emerald-300">
                    {rackFilter}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Physical rack archive (A, B, C, D, E) & customer manifests with instant reprint and operator editing.
              </p>
            </div>
          </div>

          {/* Action Buttons: Grouping Toggles, Print Manifest, Export Excel */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold shadow-2xs">
              <button
                type="button"
                onClick={() => setViewGrouping("customer")}
                className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  viewGrouping === "customer"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="Group records by Customer and PDF batch with separate rack tables"
              >
                Customer Wise
              </button>
              <button
                type="button"
                onClick={() => setViewGrouping("rack")}
                className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  viewGrouping === "rack"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="Separate directly by Physical Racks: Rack A, B, C, D, E"
              >
                Rack Wise
              </button>
              <button
                type="button"
                onClick={() => setViewGrouping("date")}
                className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  viewGrouping === "date"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="Group records by packing date"
              >
                Date Wise
              </button>
              <button
                type="button"
                onClick={() => setViewGrouping("flat")}
                className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  viewGrouping === "flat"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="View as a flat chronological table"
              >
                Flat List
              </button>
            </div>

            {/* Print Manifest Button */}
            <Button
              type="button"
              onClick={() =>
                handlePrint(
                  filteredRows,
                  `${type === "IGU" ? "IGU PACKING OPERATIONS" : "AUTO CLAVE PACKING"} HISTORY MANIFEST`,
                  rackFilter === "ALL" ? "All Racks" : rackFilter
                )
              }
              disabled={filteredRows.length === 0}
              className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs h-9 px-3 gap-1.5 rounded-xl shadow-2xs cursor-pointer"
              title="Print printable A4 packing manifest"
            >
              <Printer className="w-3.5 h-3.5 text-teal-400" />
              <span>Print Manifest</span>
            </Button>

            <Button
              type="button"
              onClick={handleExportExcel}
              disabled={filteredRows.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 px-3 gap-1.5 rounded-xl shadow-2xs cursor-pointer"
              title="Download Excel report for selected date/filters"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Excel</span>
            </Button>

            {onRefresh && (
              <Button
                type="button"
                variant="outline"
                onClick={onRefresh}
                className="h-9 px-2.5 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                title="Refresh history"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* ── Separate Rack Selector Pills (All Racks, Rack A, Rack B, Rack C, Rack D, Rack E) ── */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-black text-slate-600 uppercase flex items-center gap-1 tracking-wider mr-1">
              <Boxes className="w-3.5 h-3.5 text-emerald-600" />
              <span>RACK SEPARATION:</span>
            </span>

            <button
              type="button"
              onClick={() => setRackFilter("ALL")}
              className={`h-7 px-3 rounded-lg text-xs font-black transition-all cursor-pointer border flex items-center gap-1.5 ${
                rackFilter === "ALL"
                  ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <span>All Racks</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                  rackFilter === "ALL"
                    ? "bg-slate-800 text-slate-200"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {filteredRowsBeforeRack.length}
              </span>
            </button>

            {RACK_LETTERS.map((rk) => {
              const isSelected = rackFilter === rk;
              const count = rackCounts[rk] || 0;
              return (
                <button
                  key={rk}
                  type="button"
                  onClick={() => setRackFilter(rk)}
                  className={`h-7 px-2.5 rounded-lg text-xs font-black transition-all cursor-pointer border flex items-center gap-1.5 ${
                    isSelected
                      ? "bg-emerald-600 text-white border-emerald-700 shadow-2xs"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <span>{rk}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                      isSelected
                        ? "bg-emerald-700 text-white"
                        : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Quick Print for the currently selected rack */}
          {rackFilter !== "ALL" && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                handlePrint(
                  filteredRows,
                  `${type === "IGU" ? "IGU PACKING" : "AUTO CLAVE"} - ${rackFilter} MANIFEST`,
                  rackFilter
                )
              }
              className="h-7 px-2.5 text-xs font-bold text-slate-800 bg-emerald-50 hover:bg-emerald-100 border-emerald-300 gap-1 rounded-lg cursor-pointer shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5 text-emerald-700" />
              <span>Print {rackFilter} Manifest</span>
            </Button>
          )}
        </div>

        {/* ── Date-wise Filter Bar (Presets & Custom Date Picker) ── */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          {/* Date Presets */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-black text-slate-600 uppercase flex items-center gap-1 tracking-wider mr-1">
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              <span>DATE FILTER:</span>
            </span>

            {[
              { id: "all", label: "All Dates" },
              { id: "today", label: "Today" },
              { id: "yesterday", label: "Yesterday" },
              { id: "7days", label: "Last 7 Days" },
              { id: "month", label: "This Month" },
              { id: "custom", label: "Specific Date" },
            ].map((p) => {
              const isSel = datePreset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setDatePreset(p.id as DatePreset)}
                  className={`h-7 px-2.5 rounded-lg text-xs font-black transition-all cursor-pointer border ${
                    isSel
                      ? "bg-indigo-600 text-white border-indigo-700 shadow-2xs"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}

            {/* Custom Date Input */}
            {datePreset === "custom" && (
              <div className="flex items-center gap-1 bg-white border border-indigo-300 rounded-lg px-2 py-0.5 shadow-2xs">
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="text-xs font-bold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
                />
              </div>
            )}
          </div>

          {/* Quick Clear Filter if active */}
          {(datePreset !== "all" ||
            shiftFilter !== "ALL" ||
            rackFilter !== "ALL" ||
            statusFilter !== "ALL" ||
            customerFilter !== "ALL" ||
            searchTerm) && (
            <button
              type="button"
              onClick={() => {
                setDatePreset("all");
                setShiftFilter("ALL");
                setRackFilter("ALL");
                setStatusFilter("ALL");
                setCustomerFilter("ALL");
                setSearchTerm("");
              }}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              <span>Reset All Filters</span>
            </button>
          )}
        </div>

        {/* ── Multi-Dimensional Filters: Search, Shift, Status ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100">
          {/* Search Box */}
          <div className="relative sm:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search history by Barcode, Serial, POS, Customer, PI, Batch..."
              className="pl-9 pr-7 h-8 text-xs bg-slate-50/70 border-slate-200 rounded-xl focus:bg-white"
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

          {/* Shift Filter */}
          <div>
            <select
              value={shiftFilter}
              onChange={(e) => setShiftFilter(e.target.value as ShiftFilter)}
              className="w-full h-8 px-2 text-xs font-bold bg-slate-50/80 border border-slate-200 rounded-xl text-slate-700 focus:bg-white cursor-pointer"
            >
              <option value="ALL">All Shifts</option>
              <option value="Day">Day Shift</option>
              <option value="Night">Night Shift</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="w-full h-8 px-2 text-xs font-bold bg-slate-50/80 border border-slate-200 rounded-xl text-slate-700 focus:bg-white cursor-pointer"
            >
              <option value="ALL">All Status</option>
              <option value="ON_RACK">Currently on Rack</option>
              <option value="SENT_FINISHED">Sent to Finished</option>
              <option value="DISPATCHED">Dispatched</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Summary Metrics Strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-2xs">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Units</div>
          <div className="text-xl font-black text-slate-900 font-mono mt-0.5">
            {summaryMetrics.totalUnits} Units
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-2xs">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Glass Area</div>
          <div className="text-xl font-black text-teal-600 font-mono mt-0.5">
            {summaryMetrics.totalSqm.toFixed(2)} m²
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-2xs">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">On Rack</div>
          <div className="text-xl font-black text-amber-600 font-mono mt-0.5">
            {summaryMetrics.onRackUnits} Units
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-2xs">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Sent to Finished</div>
          <div className="text-xl font-black text-indigo-600 font-mono mt-0.5">
            {summaryMetrics.sentFinishedUnits} Units
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-2xs">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Dispatched</div>
          <div className="text-xl font-black text-emerald-600 font-mono mt-0.5">
            {summaryMetrics.dispatchedUnits} Units
          </div>
        </div>
      </div>

      {/* ── History Records Display ── */}
      {filteredRows.length === 0 ? (
        <div className="text-center py-16 px-4 bg-white rounded-3xl border-2 border-dashed border-slate-200 max-w-xl mx-auto my-6 space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto shadow-2xs">
            <History className="w-6 h-6" />
          </div>
          <h4 className="font-black text-slate-800 text-base">No Packing History Found</h4>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {searchTerm ||
            datePreset !== "all" ||
            shiftFilter !== "ALL" ||
            rackFilter !== "ALL" ||
            statusFilter !== "ALL"
              ? "No records matched your selected rack or filters. Try adjusting your date or rack filter."
              : "Units packed onto racks or sent to finished glass will automatically appear in this history log."}
          </p>
        </div>
      ) : viewGrouping === "customer" ? (
        /* ═════════════════════════════════════════════════════════════════════════
           CUSTOMER-WISE VIEW (WITH RACKS A, B, C, D, E SEPARATED INTERNALLY)
           ═════════════════════════════════════════════════════════════════════════ */
        <div className="space-y-4">
          {/* Expand / Collapse All Quick Controls */}
          {groupedByCustomer.length > 1 && (
            <div className="flex items-center justify-between px-1 text-xs text-slate-500 font-medium">
              <span>
                Showing <strong className="text-slate-800 font-bold">{groupedByCustomer.length}</strong> Customer /
                Batch Manifests
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={expandAllCustomers}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                >
                  Expand All
                </button>
                <span className="text-slate-300">•</span>
                <button
                  type="button"
                  onClick={collapseAllCustomers}
                  className="text-xs font-bold text-slate-500 hover:text-slate-700 cursor-pointer"
                >
                  Collapse All
                </button>
              </div>
            </div>
          )}

          {groupedByCustomer.map((customer) => {
            const isCollapsed = collapsedCustomers.has(customer.groupKey);
            const customerTitle = customer.pdfFileName || customer.customerName;

            return (
              <div
                key={customer.groupKey}
                className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs transition-all"
              >
                {/* Customer Summary Card Header */}
                <div
                  onClick={() => toggleCollapseCustomer(customer.groupKey)}
                  className="p-3.5 bg-gradient-to-r from-slate-50/90 via-white to-indigo-50/30 hover:from-indigo-50/40 border-b border-slate-200 cursor-pointer flex flex-wrap items-center justify-between gap-3 select-none"
                >
                  <div className="flex items-start md:items-center gap-3 flex-1 min-w-0">
                    <button
                      type="button"
                      className="text-slate-400 hover:text-slate-700 transition-transform mt-0.5 md:mt-0"
                    >
                      {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Building2 className="w-4.5 h-4.5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {customer.pdfFileName ? (
                          <span
                            className="text-sm font-black text-rose-700 flex items-center gap-1 truncate"
                            title={customer.pdfFileName}
                          >
                            <FileText className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                            <span>{customer.pdfFileName}</span>
                          </span>
                        ) : (
                          <span className="text-sm font-black text-slate-900 truncate">
                            {customer.customerName}
                          </span>
                        )}

                        {customer.projectName && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-black bg-blue-50 text-blue-700 border border-blue-200">
                            <Briefcase className="w-3 h-3 text-blue-600" />
                            {customer.projectName}
                          </span>
                        )}

                        {customer.hasColour && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-200">
                            Coloured
                          </span>
                        )}
                        {customer.hasClear && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-cyan-100 text-cyan-800 border border-cyan-200">
                            Clear
                          </span>
                        )}

                        {customer.categories.map((cat) => (
                          <span
                            key={cat}
                            className="px-2 py-0.5 rounded-md text-[10px] font-black bg-indigo-50 text-indigo-800 border border-indigo-200"
                          >
                            {cat}
                          </span>
                        ))}

                        {/* Badges for each rack present */}
                        {customer.racks.map((rk) => (
                          <span
                            key={rk}
                            className="px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-50 text-emerald-800 border border-emerald-300"
                          >
                            {rk}
                          </span>
                        ))}
                      </div>

                      {/* Customer sub-row */}
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 font-semibold truncate">
                        <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">{customer.customerName}</span>
                        {customer.dates.length > 0 && (
                          <>
                            <span className="text-slate-300">•</span>
                            <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="text-slate-500 font-mono text-[11px]">
                              {customer.dates.join(", ")}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Metrics & Batch Action */}
                  <div
                    className="flex items-center gap-2 flex-wrap text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 font-black font-mono shadow-2xs">
                      {customer.totalUnits} {customer.totalUnits === 1 ? "Unit" : "Units"}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 font-bold font-mono">
                      {customer.totalSqm.toFixed(2)} m²
                    </span>

                    {/* Print Customer Manifest Button */}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        handlePrint(
                          customer.rows,
                          `${customerTitle} - PACKING MANIFEST`,
                          customer.racks.join(", ")
                        )
                      }
                      className="h-7 px-2 text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-50 border-slate-300 gap-1 rounded-lg cursor-pointer shadow-2xs"
                      title="Print A4 packing manifest for this customer batch"
                    >
                      <Printer className="w-3 h-3 text-slate-600" />
                      <span>Print Customer</span>
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        handleReturnCustomerBatchToActiveRack(customer.rows, customerTitle)
                      }
                      className="h-7 px-2 text-[11px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-300 gap-1 rounded-lg cursor-pointer shadow-2xs"
                      title="Return all units for this customer back to active rack for changes"
                    >
                      <RotateCcw className="w-3 h-3 text-amber-600" />
                      <span>Return Batch</span>
                    </Button>
                  </div>
                </div>

                {/* Sub-sections separated per physical rack (Rack A, Rack B, Rack C, Rack D, Rack E) */}
                {!isCollapsed && (
                  <div className="p-3 space-y-3 bg-slate-50/40">
                    {customer.rackGroups.map((rg) => {
                      const rackSlotsDisplay =
                        rg.slots.size > 0 ? `(#${Array.from(rg.slots).join(", #")})` : "";
                      return (
                        <div
                          key={rg.rack}
                          className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs"
                        >
                          {/* Rack Sub-Header Banner */}
                          <div className="bg-slate-50/90 px-3.5 py-2 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-0.5 rounded-md font-mono font-black text-xs bg-emerald-600 text-white shadow-2xs">
                                {rg.rack} {rackSlotsDisplay}
                              </span>
                              <span className="text-xs font-bold text-slate-800">
                                {rg.rows.length} {rg.rows.length === 1 ? "Unit" : "Units"}
                              </span>
                              <span className="text-xs font-mono font-bold text-teal-700">
                                • {rg.totalSqm.toFixed(2)} m²
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {/* Print Single Rack Button */}
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  handlePrint(
                                    rg.rows,
                                    `${customerTitle} - ${rg.rack} MANIFEST`,
                                    rg.rack
                                  )
                                }
                                className="h-6 px-2 text-[10px] font-bold text-slate-700 bg-white hover:bg-slate-50 border-slate-300 gap-1 rounded-md cursor-pointer"
                                title={`Print manifest strictly for ${rg.rack}`}
                              >
                                <Printer className="w-3 h-3 text-slate-600" />
                                <span>Print {rg.rack}</span>
                              </Button>

                              {/* Return this rack's units */}
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  handleReturnCustomerBatchToActiveRack(
                                    rg.rows,
                                    `${customerTitle} (${rg.rack})`
                                  )
                                }
                                className="h-6 px-2 text-[10px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200 gap-1 rounded-md cursor-pointer"
                                title={`Return only ${rg.rack} units back to active rack`}
                              >
                                <RotateCcw className="w-3 h-3 text-amber-600" />
                                <span>Return {rg.rack}</span>
                              </Button>
                            </div>
                          </div>

                          {/* Table for this specific Rack */}
                          <TableHorizontalScrollWrapper>
                            <table className="w-full text-left border-collapse text-xs">
                              <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-black uppercase tracking-wider text-slate-500">
                                  <th className="py-2.5 px-3 w-10 text-center">#</th>
                                  <th className="py-2.5 px-3">Date & Time</th>
                                  <th className="py-2.5 px-3">Rack & Slot</th>
                                  <th className="py-2.5 px-3">Shift</th>
                                  <th className="py-2.5 px-3">POS #</th>
                                  <th className="py-2.5 px-3">PI / Batch</th>
                                  <th className="py-2.5 px-3">Size (W × H)</th>
                                  <th className="py-2.5 px-3">SQM</th>
                                  <th className="py-2.5 px-3">Glass Spec</th>
                                  <th className="py-2.5 px-3">Outer Barcode</th>
                                  <th className="py-2.5 px-3">Status</th>
                                  <th className="py-2.5 px-3 text-center">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {rg.rows.map((row, idx) => {
                                  const ts = getRowHistoryTimestamp(row);
                                  const outerBarcode =
                                    row.primaryItem.barcode ||
                                    row.primaryItem.serialNumber ||
                                    "—";
                                  const spec =
                                    (row.primaryItem as any)?.glassSpec ||
                                    row.primaryItem?.glassType ||
                                    "Clear Glass";

                                  return (
                                    <tr
                                      key={row.id || idx}
                                      className="hover:bg-slate-50/70 transition-colors"
                                    >
                                      <td className="py-2.5 px-3 text-center font-mono text-slate-400 font-bold text-[11px]">
                                        {idx + 1}
                                      </td>
                                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                                        {formatRowDateTime(ts)}
                                      </td>
                                      <td className="py-2.5 px-3 whitespace-nowrap">
                                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-mono font-bold text-xs border border-slate-200">
                                          {row.rackNo || "Rack A"}{" "}
                                          {row.rackSlot ? `#${row.rackSlot}` : ""}
                                        </span>
                                      </td>
                                      <td className="py-2.5 px-3 whitespace-nowrap">
                                        <span
                                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                            row.shift === "Night" || row.shift === "B"
                                              ? "bg-slate-800 text-white"
                                              : "bg-amber-100 text-amber-800"
                                          }`}
                                        >
                                          {row.shift === "B"
                                            ? "Night"
                                            : row.shift === "A"
                                            ? "Day"
                                            : row.shift || "Day"}
                                        </span>
                                      </td>
                                      <td className="py-2.5 px-3 font-mono font-black text-indigo-700 whitespace-nowrap">
                                        POS #{row.posNo}
                                      </td>
                                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                                        {row.piNumber && (
                                          <span className="font-bold">{row.piNumber}</span>
                                        )}
                                        {row.batchNo && (
                                          <span className="text-slate-500 ml-1">
                                            ({row.batchNo})
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                                        {row.width} × {row.height} mm
                                      </td>
                                      <td className="py-2.5 px-3 font-mono font-bold text-teal-700 whitespace-nowrap">
                                        {(row.sqm || 0).toFixed(2)} m²
                                      </td>
                                      <td
                                        className="py-2.5 px-3 text-[11px] text-slate-600 max-w-[240px] truncate"
                                        title={spec}
                                      >
                                        {spec}
                                      </td>
                                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-800 whitespace-nowrap">
                                        <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                          {outerBarcode}
                                        </code>
                                      </td>
                                      <td className="py-2.5 px-3 whitespace-nowrap">
                                        {row.isDispatched ? (
                                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200 inline-flex items-center gap-1">
                                            <Truck className="w-3 h-3" />
                                            <span>Dispatched</span>
                                          </span>
                                        ) : row.sentToFinished ? (
                                          <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold text-[10px] border border-indigo-200 inline-flex items-center gap-1">
                                            <Check className="w-3 h-3" />
                                            <span>Finished</span>
                                          </span>
                                        ) : (
                                          <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 font-bold text-[10px] border border-amber-200 inline-flex items-center gap-1">
                                            <Boxes className="w-3 h-3" />
                                            <span>On Rack</span>
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                        {renderRowActions(row)}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </TableHorizontalScrollWrapper>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : viewGrouping === "rack" ? (
        /* ═════════════════════════════════════════════════════════════════════════
           RACK-WISE VIEW (EXPLICIT SEPARATION FOR RACK A, B, C, D, AND E)
           ═════════════════════════════════════════════════════════════════════════ */
        <div className="space-y-4">
          {groupedByRack.map((rackGroup) => {
            const isCollapsed = collapsedRacks.has(rackGroup.rack);
            const rackUnits = rackGroup.totalUnits;
            const rackSqm = rackGroup.totalSqm;

            return (
              <div
                key={rackGroup.rack}
                className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs transition-all"
              >
                {/* Rack Header Banner */}
                <div
                  onClick={() => toggleCollapseRack(rackGroup.rack)}
                  className="p-3.5 bg-gradient-to-r from-emerald-50/80 via-white to-teal-50/30 hover:from-emerald-50 border-b border-slate-200 cursor-pointer flex flex-wrap items-center justify-between gap-3 select-none"
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="text-slate-400 hover:text-slate-700 transition-transform"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>

                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-center justify-center font-black shadow-xs">
                      <Boxes className="w-5 h-5" />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-black text-slate-900 tracking-tight">
                          {rackGroup.rack}
                        </span>
                        {rackUnits > 0 ? (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-mono font-bold text-xs">
                            Active in History
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 font-mono font-bold text-xs">
                            Empty
                          </span>
                        )}
                        {rackGroup.slots.size > 0 && (
                          <span className="text-xs text-slate-500 font-mono">
                            (Slots: #{Array.from(rackGroup.slots).join(", #")})
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 font-medium">
                        {rackGroup.customers.size > 0
                          ? `Assigned to: ${Array.from(rackGroup.customers).slice(0, 3).join(", ")}${
                              rackGroup.customers.size > 3 ? ` +${rackGroup.customers.size - 3} more` : ""
                            }`
                          : "No finished units allocated to this rack in selected date range"}
                      </div>
                    </div>
                  </div>

                  {/* Summary Badges & Print Button */}
                  <div
                    className="flex items-center gap-2 flex-wrap text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 font-black font-mono shadow-2xs">
                      {rackUnits} {rackUnits === 1 ? "Unit" : "Units"}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 font-bold font-mono">
                      {rackSqm.toFixed(2)} m²
                    </span>

                    {rackUnits > 0 && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            handlePrint(
                              rackGroup.rows,
                              `${type === "IGU" ? "IGU" : "AUTO CLAVE"} - ${
                                rackGroup.rack
                              } MANIFEST`,
                              rackGroup.rack
                            )
                          }
                          className="h-7 px-2.5 text-xs font-bold text-slate-800 bg-white hover:bg-slate-50 border-slate-300 gap-1 rounded-lg cursor-pointer shadow-2xs"
                          title={`Print complete manifest for ${rackGroup.rack}`}
                        >
                          <Printer className="w-3.5 h-3.5 text-slate-700" />
                          <span>Print {rackGroup.rack}</span>
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            handleReturnCustomerBatchToActiveRack(
                              rackGroup.rows,
                              `${rackGroup.rack} Manifest`
                            )
                          }
                          className="h-7 px-2.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-300 gap-1 rounded-lg cursor-pointer shadow-2xs"
                          title={`Return all units on ${rackGroup.rack} to active rack`}
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                          <span>Return to Active</span>
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Table for this Rack */}
                {!isCollapsed && rackUnits > 0 && (
                  <div className="p-1">
                    <TableHorizontalScrollWrapper>
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-black uppercase tracking-wider text-slate-500">
                            <th className="py-2.5 px-3 w-10 text-center">#</th>
                            <th className="py-2.5 px-3">Date & Time</th>
                            <th className="py-2.5 px-3">Slot No</th>
                            <th className="py-2.5 px-3">Shift</th>
                            <th className="py-2.5 px-3">POS #</th>
                            <th className="py-2.5 px-3">PI / Batch</th>
                            <th className="py-2.5 px-3">Customer & Project</th>
                            <th className="py-2.5 px-3">Size (W × H)</th>
                            <th className="py-2.5 px-3">SQM</th>
                            <th className="py-2.5 px-3">Glass Spec</th>
                            <th className="py-2.5 px-3">Outer Barcode</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3 text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {rackGroup.rows.map((row, idx) => {
                            const ts = getRowHistoryTimestamp(row);
                            const outerBarcode =
                              row.primaryItem.barcode ||
                              row.primaryItem.serialNumber ||
                              "—";
                            const spec =
                              (row.primaryItem as any)?.glassSpec ||
                              row.primaryItem?.glassType ||
                              "Clear Glass";

                            return (
                              <tr
                                key={row.id || idx}
                                className="hover:bg-slate-50/70 transition-colors"
                              >
                                <td className="py-2.5 px-3 text-center font-mono text-slate-400 font-bold text-[11px]">
                                  {idx + 1}
                                </td>
                                <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                                  {formatRowDateTime(ts)}
                                </td>
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-mono font-bold text-xs border border-slate-200">
                                    {row.rackSlot ? `#${row.rackSlot}` : "Default"}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      row.shift === "Night" || row.shift === "B"
                                        ? "bg-slate-800 text-white"
                                        : "bg-amber-100 text-amber-800"
                                    }`}
                                  >
                                    {row.shift === "B"
                                      ? "Night"
                                      : row.shift === "A"
                                      ? "Day"
                                      : row.shift || "Day"}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 font-mono font-black text-indigo-700 whitespace-nowrap">
                                  POS #{row.posNo}
                                </td>
                                <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                                  {row.piNumber && (
                                    <span className="font-bold">{row.piNumber}</span>
                                  )}
                                  {row.batchNo && (
                                    <span className="text-slate-500 ml-1">
                                      ({row.batchNo})
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 font-bold text-slate-800 max-w-[200px] truncate">
                                  {row.customerName || "—"}
                                  {row.projectName && (
                                    <span className="text-slate-500 font-normal block text-[11px] truncate">
                                      {row.projectName}
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                                  {row.width} × {row.height} mm
                                </td>
                                <td className="py-2.5 px-3 font-mono font-bold text-teal-700 whitespace-nowrap">
                                  {(row.sqm || 0).toFixed(2)} m²
                                </td>
                                <td
                                  className="py-2.5 px-3 text-[11px] text-slate-600 max-w-[220px] truncate"
                                  title={spec}
                                >
                                  {spec}
                                </td>
                                <td className="py-2.5 px-3 font-mono text-[11px] text-slate-800 whitespace-nowrap">
                                  <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                    {outerBarcode}
                                  </code>
                                </td>
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  {row.isDispatched ? (
                                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200 inline-flex items-center gap-1">
                                      <Truck className="w-3 h-3" />
                                      <span>Dispatched</span>
                                    </span>
                                  ) : row.sentToFinished ? (
                                    <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold text-[10px] border border-indigo-200 inline-flex items-center gap-1">
                                      <Check className="w-3 h-3" />
                                      <span>Finished</span>
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 font-bold text-[10px] border border-amber-200 inline-flex items-center gap-1">
                                      <Boxes className="w-3 h-3" />
                                      <span>On Rack</span>
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                  {renderRowActions(row)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </TableHorizontalScrollWrapper>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : viewGrouping === "date" ? (
        /* ═════════════════════════════════════════════════════════════════════════
           DATE-WISE ACCORDION VIEW
           ═════════════════════════════════════════════════════════════════════════ */
        <div className="space-y-4">
          {groupedByDate.map(([dateKey, groupRows]) => {
            const isCollapsed = collapsedDates.has(dateKey);
            const groupUnits = groupRows.length;
            const groupSqm = groupRows.reduce((acc, r) => acc + (r.sqm || 0), 0);
            const isToday = dateKey === todayStr;
            const isYesterday = dateKey === yesterdayStr;

            return (
              <div
                key={dateKey}
                className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs transition-all"
              >
                {/* Date Group Header Banner */}
                <div
                  onClick={() => toggleCollapseDate(dateKey)}
                  className="p-3.5 bg-slate-50/90 hover:bg-slate-100/80 border-b border-slate-200 cursor-pointer flex flex-wrap items-center justify-between gap-3 select-none"
                >
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      className="text-slate-400 hover:text-slate-700 transition-transform"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>

                    <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                      <Calendar className="w-4 h-4" />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-900">
                          {formatRowDisplayDate(dateKey)}
                        </span>
                        {isToday && (
                          <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-black text-[10px]">
                            TODAY
                          </span>
                        )}
                        {isYesterday && (
                          <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-bold text-[10px]">
                            YESTERDAY
                          </span>
                        )}
                        <span className="text-xs text-slate-400 font-mono">({dateKey})</span>
                      </div>
                    </div>
                  </div>

                  {/* Date Group Summary Badges & Print */}
                  <div
                    className="flex items-center gap-2 flex-wrap text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 font-black font-mono shadow-2xs">
                      {groupUnits} {groupUnits === 1 ? "Unit" : "Units"}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 font-bold font-mono">
                      {groupSqm.toFixed(2)} m²
                    </span>

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        handlePrint(
                          groupRows,
                          `${type === "IGU" ? "IGU" : "AUTO CLAVE"} HISTORY - ${dateKey}`,
                          rackFilter === "ALL" ? "All Racks" : rackFilter
                        )
                      }
                      className="h-7 px-2 text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-50 border-slate-300 gap-1 rounded-lg cursor-pointer"
                    >
                      <Printer className="w-3 h-3 text-slate-600" />
                      <span>Print Date</span>
                    </Button>
                  </div>
                </div>

                {/* Table for this specific Date */}
                {!isCollapsed && (
                  <div className="p-1">
                    <TableHorizontalScrollWrapper>
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-black uppercase tracking-wider text-slate-500">
                            <th className="py-2.5 px-3 w-10 text-center">#</th>
                            <th className="py-2.5 px-3">Date & Time</th>
                            <th className="py-2.5 px-3">Rack & Slot</th>
                            <th className="py-2.5 px-3">Shift</th>
                            <th className="py-2.5 px-3">POS #</th>
                            <th className="py-2.5 px-3">PI / Batch</th>
                            <th className="py-2.5 px-3">Customer & Project</th>
                            <th className="py-2.5 px-3">Size (W × H)</th>
                            <th className="py-2.5 px-3">SQM</th>
                            <th className="py-2.5 px-3">Glass Spec</th>
                            <th className="py-2.5 px-3">Outer Barcode</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3 text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {groupRows.map((row, idx) => {
                            const ts = getRowHistoryTimestamp(row);
                            const outerBarcode =
                              row.primaryItem.barcode ||
                              row.primaryItem.serialNumber ||
                              "—";
                            const spec =
                              (row.primaryItem as any)?.glassSpec ||
                              row.primaryItem?.glassType ||
                              "Clear Glass";

                            return (
                              <tr
                                key={row.id || idx}
                                className="hover:bg-slate-50/70 transition-colors"
                              >
                                <td className="py-2.5 px-3 text-center font-mono text-slate-400 font-bold text-[11px]">
                                  {idx + 1}
                                </td>
                                <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                                  {formatRowDateTime(ts)}
                                </td>
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-mono font-bold text-xs border border-slate-200">
                                    {row.rackNo || "Rack A"}{" "}
                                    {row.rackSlot ? `#${row.rackSlot}` : ""}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      row.shift === "Night" || row.shift === "B"
                                        ? "bg-slate-800 text-white"
                                        : "bg-amber-100 text-amber-800"
                                    }`}
                                  >
                                    {row.shift === "B"
                                      ? "Night"
                                      : row.shift === "A"
                                      ? "Day"
                                      : row.shift || "Day"}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 font-mono font-black text-indigo-700 whitespace-nowrap">
                                  POS #{row.posNo}
                                </td>
                                <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                                  {row.piNumber && (
                                    <span className="font-bold">{row.piNumber}</span>
                                  )}
                                  {row.batchNo && (
                                    <span className="text-slate-500 ml-1">
                                      ({row.batchNo})
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 font-bold text-slate-800 max-w-[200px] truncate">
                                  {row.customerName || "—"}
                                  {row.projectName && (
                                    <span className="text-slate-500 font-normal block text-[11px] truncate">
                                      {row.projectName}
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                                  {row.width} × {row.height} mm
                                </td>
                                <td className="py-2.5 px-3 font-mono font-bold text-teal-700 whitespace-nowrap">
                                  {(row.sqm || 0).toFixed(2)} m²
                                </td>
                                <td
                                  className="py-2.5 px-3 text-[11px] text-slate-600 max-w-[220px] truncate"
                                  title={spec}
                                >
                                  {spec}
                                </td>
                                <td className="py-2.5 px-3 font-mono text-[11px] text-slate-800 whitespace-nowrap">
                                  <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                    {outerBarcode}
                                  </code>
                                </td>
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  {row.isDispatched ? (
                                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200 inline-flex items-center gap-1">
                                      <Truck className="w-3 h-3" />
                                      <span>Dispatched</span>
                                    </span>
                                  ) : row.sentToFinished ? (
                                    <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold text-[10px] border border-indigo-200 inline-flex items-center gap-1">
                                      <Check className="w-3 h-3" />
                                      <span>Finished</span>
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 font-bold text-[10px] border border-amber-200 inline-flex items-center gap-1">
                                      <Boxes className="w-3 h-3" />
                                      <span>On Rack</span>
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                  {renderRowActions(row)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </TableHorizontalScrollWrapper>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* ═════════════════════════════════════════════════════════════════════════
           FLAT LIST VIEW
           ═════════════════════════════════════════════════════════════════════════ */
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
          <TableHorizontalScrollWrapper>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-black uppercase tracking-wider text-slate-600">
                  <th className="py-3 px-3 w-10 text-center">#</th>
                  <th className="py-3 px-3">Date & Time</th>
                  <th className="py-3 px-3">Rack & Slot</th>
                  <th className="py-3 px-3">Shift</th>
                  <th className="py-3 px-3">POS #</th>
                  <th className="py-3 px-3">PI / Batch</th>
                  <th className="py-3 px-3">Customer & Project</th>
                  <th className="py-3 px-3">Size (W × H)</th>
                  <th className="py-3 px-3">SQM</th>
                  <th className="py-3 px-3">Glass Spec</th>
                  <th className="py-3 px-3">Outer Barcode</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row, idx) => {
                  const ts = getRowHistoryTimestamp(row);
                  const outerBarcode =
                    row.primaryItem.barcode || row.primaryItem.serialNumber || "—";
                  const spec =
                    (row.primaryItem as any)?.glassSpec ||
                    row.primaryItem?.glassType ||
                    "Clear Glass";

                  return (
                    <tr key={row.id || idx} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-3 text-center font-mono text-slate-400 font-bold text-[11px]">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                        {formatRowDateTime(ts)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-mono font-bold text-xs border border-slate-200">
                          {row.rackNo || "Rack A"} {row.rackSlot ? `#${row.rackSlot}` : ""}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            row.shift === "Night" || row.shift === "B"
                              ? "bg-slate-800 text-white"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {row.shift === "B"
                            ? "Night"
                            : row.shift === "A"
                            ? "Day"
                            : row.shift || "Day"}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-black text-indigo-700 whitespace-nowrap">
                        POS #{row.posNo}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                        {row.piNumber && <span className="font-bold">{row.piNumber}</span>}
                        {row.batchNo && (
                          <span className="text-slate-500 ml-1">({row.batchNo})</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-800 max-w-[200px] truncate">
                        {row.customerName || "—"}
                        {row.projectName && (
                          <span className="text-slate-500 font-normal block text-[11px] truncate">
                            {row.projectName}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                        {row.width} × {row.height} mm
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-teal-700 whitespace-nowrap">
                        {(row.sqm || 0).toFixed(2)} m²
                      </td>
                      <td
                        className="py-2.5 px-3 text-[11px] text-slate-600 max-w-[220px] truncate"
                        title={spec}
                      >
                        {spec}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-800 whitespace-nowrap">
                        <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-bold">
                          {outerBarcode}
                        </code>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {row.isDispatched ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200 inline-flex items-center gap-1">
                            <Truck className="w-3 h-3" />
                            <span>Dispatched</span>
                          </span>
                        ) : row.sentToFinished ? (
                          <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold text-[10px] border border-indigo-200 inline-flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            <span>Finished</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 font-bold text-[10px] border border-amber-200 inline-flex items-center gap-1">
                            <Boxes className="w-3 h-3" />
                            <span>On Rack</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {renderRowActions(row)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableHorizontalScrollWrapper>
        </div>
      )}

      {/* ── Edit Physical Rack Assignment Modal ── */}
      <Dialog open={Boolean(editingRow)} onOpenChange={(open) => !open && setEditingRow(null)}>
        <DialogContent className="max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-slate-900 flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5 text-indigo-600" />
              <span>Edit Rack Assignment & Status</span>
            </DialogTitle>
          </DialogHeader>

          {editingRow && (
            <div className="space-y-4 pt-2">
              {/* Item Summary Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs space-y-1.5">
                <div className="flex items-center justify-between font-mono">
                  <span className="font-black text-indigo-700">POS #{editingRow.row.posNo}</span>
                  <span className="text-slate-500 font-bold">{editingRow.row.customerName}</span>
                </div>
                <div className="text-[11px] text-slate-600 font-medium">
                  {editingRow.row.primaryItem.barcode || editingRow.row.primaryItem.serialNumber} •{" "}
                  {editingRow.row.width} × {editingRow.row.height} mm (
                  {(editingRow.row.sqm || 0).toFixed(2)} m²)
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  {(editingRow.row.primaryItem as any)?.glassSpec ||
                    editingRow.row.primaryItem?.glassType ||
                    "Clear Glass"}
                </div>
              </div>

              {/* Target Rack Selection (Pills A-E) */}
              <div>
                <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1.5">
                  Target Physical Rack
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {RACK_LETTERS.map((rk) => {
                    const isSelected = editingRow.targetRack === rk;
                    return (
                      <button
                        key={rk}
                        type="button"
                        onClick={() => setEditingRow({ ...editingRow, targetRack: rk })}
                        className={`py-2 px-1 text-center rounded-xl text-xs font-black transition-all cursor-pointer border ${
                          isSelected
                            ? "bg-emerald-600 text-white border-emerald-700 shadow-sm"
                            : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {rk}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Slot Number & Shift in 2 columns */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">
                    Rack Slot Number
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="999"
                    value={editingRow.targetSlot}
                    onChange={(e) =>
                      setEditingRow({ ...editingRow, targetSlot: e.target.value })
                    }
                    className="h-9 text-xs font-mono font-bold bg-slate-50 border-slate-200 rounded-xl"
                    placeholder="e.g. 25"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1">
                    Production Shift
                  </label>
                  <select
                    value={editingRow.targetShift}
                    onChange={(e) =>
                      setEditingRow({
                        ...editingRow,
                        targetShift: e.target.value as "Day" | "Night",
                      })
                    }
                    className="w-full h-9 px-2 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl text-slate-700 cursor-pointer"
                  >
                    <option value="Day">Day Shift</option>
                    <option value="Night">Night Shift</option>
                  </select>
                </div>
              </div>

              {/* Destination Status Selection */}
              <div>
                <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block mb-1.5">
                  Destination Status
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setEditingRow({ ...editingRow, targetSentToFinished: false })
                    }
                    className={`p-2.5 rounded-xl text-left border text-xs font-bold transition-all cursor-pointer ${
                      !editingRow.targetSentToFinished
                        ? "bg-amber-50 border-amber-300 text-amber-900 shadow-xs"
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center gap-1 font-black">
                      <Boxes className="w-3.5 h-3.5 text-amber-600" />
                      <span>Active Rack (On Rack)</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      Can be packed, modified, or re-sent.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setEditingRow({ ...editingRow, targetSentToFinished: true })
                    }
                    className={`p-2.5 rounded-xl text-left border text-xs font-bold transition-all cursor-pointer ${
                      editingRow.targetSentToFinished
                        ? "bg-indigo-50 border-indigo-300 text-indigo-900 shadow-xs"
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center gap-1 font-black">
                      <Check className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Sent to Finished</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      Saved in completed packing archive.
                    </div>
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleUnpackFromEditModal}
                  className="h-9 px-3 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border-rose-200 rounded-xl cursor-pointer"
                  title="Remove from physical rack and return to pending queue"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-rose-600 mr-1" />
                  <span>Unpack to Pending</span>
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditingRow(null)}
                    className="h-9 px-3 text-xs font-bold rounded-xl"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSaveEditModal}
                    className="h-9 px-4 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs"
                  >
                    Save Changes
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─────────────────────────────────────────────────────────────────────────────
           PRINTABLE PACKING HISTORY MANIFEST (A4 Document Format)
           ───────────────────────────────────────────────────────────────────────────── */}
      {printJob && (
        <div
          id="printable-history-manifest"
          className="hidden print:block bg-white text-black p-6 font-sans"
        >
          {/* Printable Header */}
          {/* Printable Header */}
          <div className="border-b-2 border-black pb-3 mb-3">
            <div className="flex items-start justify-between gap-4">
              {/* Left Title & Branding */}
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-black uppercase tracking-wider text-gray-700">
                  SEJAL GLASS ARCHITECTURAL SOLUTIONS
                </div>
                <h1 className="text-xl font-black uppercase tracking-tight text-black mt-0.5">
                  {printJob.title}
                </h1>
                <div className="text-[10px] font-bold text-gray-600 tracking-wide mt-0.5">
                  FINISHED GLASS & PACKING OPERATIONS ARCHIVE MANIFEST • {type === "IGU" ? "IGU PACKING LINE" : "AUTO CLAVE PACKING LINE"}
                </div>
              </div>

              {/* Right Manifest Metadata Box with rock-solid alignment */}
              <div className="shrink-0 flex items-center gap-3">
                <div className="text-right text-[11px] space-y-1">
                  <div className="whitespace-nowrap">
                    <span className="font-bold text-gray-600">DATE & TIME:</span>{" "}
                    <span className="font-mono font-black">{printJob.printedAt}</span>
                  </div>
                  <div className="whitespace-nowrap">
                    <span className="font-bold text-gray-600">SHIFT:</span>{" "}
                    <span className="font-mono font-bold px-1.5 py-0.2 bg-gray-100 border border-gray-400 rounded">
                      {printJob.shift} Shift
                    </span>
                  </div>
                  <div className="whitespace-nowrap flex items-center justify-end gap-1.5 mt-1">
                    <span className="font-bold text-gray-600">RACK:</span>
                    <span className="font-mono font-black text-xs border-2 border-black px-2 py-0.5 bg-gray-50 whitespace-nowrap">
                      {printJob.rackLabel}
                    </span>
                  </div>
                </div>

                {/* Scannable Barcode SVG */}
                <div className="border-l border-gray-300 pl-3 flex flex-col items-center justify-center">
                  <div
                    className="w-32 flex justify-center"
                    dangerouslySetInnerHTML={{
                      __html: generateBarcodeSVG(
                        printJob.rackLabel.includes("Rack")
                          ? formatRackBarcode(printJob.rackLabel)
                          : "PACKING-HISTORY",
                        30,
                        1.2
                      ),
                    }}
                  />
                  <div className="text-[9px] font-mono font-bold mt-0.5 tracking-wider text-gray-700">
                    {printJob.rackLabel.includes("Rack")
                      ? formatRackBarcode(printJob.rackLabel)
                      : "SEJAL-PACKING"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Summary Strip on Printed Sheet */}
          <div className="grid grid-cols-3 border-2 border-black p-2 mb-3 bg-gray-50 text-xs font-mono font-bold">
            <div>
              <span className="text-gray-600 font-sans text-[10px] uppercase block">TOTAL UNITS</span>
              <span className="font-black text-sm text-black">{printJob.rows.length} Units</span>
            </div>
            <div className="text-center border-x border-black px-2">
              <span className="text-gray-600 font-sans text-[10px] uppercase block">TOTAL GLASS AREA</span>
              <span className="font-black text-sm text-black">
                {printJob.rows.reduce((acc, r) => acc + (r.sqm || 0), 0).toFixed(2)} m²
              </span>
            </div>
            <div className="text-right">
              <span className="text-gray-600 font-sans text-[10px] uppercase block">TARGET RACK</span>
              <span className="font-black text-sm text-black">{printJob.rackLabel}</span>
            </div>
          </div>

          {/* Printable Table with complete text display and fixed column widths */}
          <table className="w-full border-collapse border border-black text-xs my-2">
            <thead>
              <tr className="bg-gray-100 border-b border-black text-[10px] font-black uppercase text-gray-900">
                <th className="border border-black py-1.5 px-1 text-center w-8">#</th>
                <th className="border border-black py-1.5 px-1.5 text-center w-12">POS #</th>
                <th className="border border-black py-1.5 px-1.5 text-center w-20">PI / BATCH</th>
                <th className="border border-black py-1.5 px-2 text-left w-44">CUSTOMER & PROJECT</th>
                <th className="border border-black py-1.5 px-1.5 text-center w-24 whitespace-nowrap">SIZE (W × H)</th>
                <th className="border border-black py-1.5 px-1 text-center w-12">SQM</th>
                <th className="border border-black py-1.5 px-2 text-left">GLASS SPEC</th>
                <th className="border border-black py-1.5 px-1.5 text-center w-32 whitespace-nowrap">OUTER BARCODE</th>
                <th className="border border-black py-1.5 px-1.5 text-center w-20 whitespace-nowrap">RACK</th>
                <th className="border border-black py-1.5 px-1 text-center w-14">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {printJob.rows.map((row, idx) => (
                <tr key={row.id || idx} className="border-b border-black text-[10px]">
                  <td className="border border-black py-1.5 px-1 text-center font-mono font-bold">
                    {idx + 1}
                  </td>
                  <td className="border border-black py-1.5 px-1 text-center font-mono font-black text-black">
                    {row.posNo}
                  </td>
                  <td className="border border-black py-1.5 px-1.5 text-center font-mono leading-tight">
                    <div className="font-bold">{row.piNumber || "—"}</div>
                    {row.batchNo && <div className="text-[9px] text-gray-600">({row.batchNo})</div>}
                  </td>
                  <td className="border border-black py-1.5 px-2 font-bold leading-snug break-words">
                    <div className="text-black">{row.customerName}</div>
                    {row.projectName && (
                      <div className="text-gray-600 text-[9px] font-normal">{row.projectName}</div>
                    )}
                  </td>
                  <td className="border border-black py-1.5 px-1.5 text-center font-mono whitespace-nowrap font-bold">
                    {row.width} × {row.height}
                  </td>
                  <td className="border border-black py-1.5 px-1 text-center font-mono font-black">
                    {(row.sqm || 0).toFixed(2)}
                  </td>
                  <td className="border border-black py-1.5 px-2 leading-tight text-[9px] break-words">
                    {(row.primaryItem as any)?.glassSpec ||
                      row.primaryItem?.glassType ||
                      "Clear Glass"}
                  </td>
                  <td className="border border-black py-1.5 px-1.5 text-center font-mono font-bold whitespace-nowrap text-[9px]">
                    {row.primaryItem.barcode || row.primaryItem.serialNumber || "—"}
                  </td>
                  <td className="border border-black py-1.5 px-1.5 text-center font-mono font-black whitespace-nowrap">
                    <div>{row.rackNo || "Rack A"}</div>
                    {row.rackSlot && <div className="text-[9px] text-gray-600 font-bold">#{row.rackSlot}</div>}
                  </td>
                  <td className="border border-black py-1.5 px-1 text-center font-bold uppercase text-[9px] whitespace-nowrap">
                    {row.isDispatched
                      ? "Dispatched"
                      : row.sentToFinished
                      ? "Finished"
                      : "On Rack"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Clean sign-off block without duplicate border lines */}
          <div className="grid grid-cols-4 gap-6 mt-10 text-xs font-bold text-center">
            <div>
              <div className="border-b-2 border-black mb-1.5 h-10"></div>
              <div className="text-[10px] tracking-wider uppercase font-black">PACKED BY</div>
              <div className="text-[9px] text-gray-500 font-normal">Operator Signature</div>
            </div>
            <div>
              <div className="border-b-2 border-black mb-1.5 h-10"></div>
              <div className="text-[10px] tracking-wider uppercase font-black">VERIFIED BY (QA)</div>
              <div className="text-[9px] text-gray-500 font-normal">Quality Inspector</div>
            </div>
            <div>
              <div className="border-b-2 border-black mb-1.5 h-10"></div>
              <div className="text-[10px] tracking-wider uppercase font-black">SUPERVISOR</div>
              <div className="text-[9px] text-gray-500 font-normal">Shift In-Charge</div>
            </div>
            <div>
              <div className="border-b-2 border-black mb-1.5 h-10"></div>
              <div className="text-[10px] tracking-wider uppercase font-black">SECURITY / GATE</div>
              <div className="text-[9px] text-gray-500 font-normal">Dispatch Stamp</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
