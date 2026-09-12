import React, { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { GlassItem, ProductionStage, PIMaster } from "@shared/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PairingBufferView } from "@/components/PairingBufferView";
import { getDguEffectiveQtyAndSqm, formatBatchNumber, formatPlatformDate, formatPlatformTime, getItemFinish, isDguStickerPairMatch, isDguGlass, isLaminatedGlass, isDlguGlass } from "@/lib/utils";
import {
  CheckCircle,
  AlertOctagon,
  AlertCircle,
  RefreshCw,
  RotateCcw,
  Search,
  Tag,
  CheckSquare,
  Square,
  Box,
  Boxes,
  Play,
  ScanLine,
  X,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Layers,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Zap,
  Scissors,
  FileText,
  FileSpreadsheet,
  Eye,
  SlidersHorizontal,
  Link2,
  Check,
  Calendar,
  Clock,
  GripVertical,
  MousePointer,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import {
  exportStageWipToExcel,
  exportStageHistoryToExcel,
  exportSelectedItemsToExcel,
  exportPartialDispatchNoteToExcel,
} from "@/lib/excelExport";

interface ProductionStageViewProps {
  stage: ProductionStage;
  items: GlassItem[];
  pis?: PIMaster[];
  operator?: string;
  externalSearchTerm?: string;
  onRefresh: () => void;
  onOptimisticAdvance?: (serialNumbers: string[], fromStage: ProductionStage) => void;
  onReject: (item: GlassItem) => void;
  onRework: (item: GlassItem) => void;
  onPrintSticker: (item: GlassItem) => void;
}

// Stage color map
const STAGE_COLORS: Record<string, string> = {
  Cutting:    "bg-purple-100 text-purple-700",
  Pairing:    "bg-indigo-100 text-indigo-700",
  DGU:        "bg-teal-100 text-teal-700",
  Lamination: "bg-amber-100 text-amber-700",
  Finished:   "bg-emerald-100 text-emerald-700",
};

// Next stage label
function getNextStageLabel(item: GlassItem, currentStage: ProductionStage): string {
  const idx = item.processRoute.indexOf(currentStage);
  if (idx >= 0 && idx < item.processRoute.length - 1) {
    return item.processRoute[idx + 1];
  }
  return "Finished";
}

// Unified Stage Row Model (For DGU / DLGU: combines paired 1 Colour + 1 Clear pane into 1 Unit row represented by Colour Glass)
interface StageRowItem {
  id: string; // unique row id
  item: GlassItem; // Primary glass pane (in DGU: Colour Glass pane if paired/unpaired colour, Clear pane if unpaired clear)
  partnerItem?: GlassItem | null; // Paired partner pane (in DGU: Clear Glass pane)
  isDguPair: boolean; // true if paired 1 Col + 1 Clr unit
  dguPairReady: boolean;
  dguWaitingFinish?: "Clear" | "Colour";
  allSerials: string[]; // Serial numbers to complete when advancing this row
  effectiveSqm: number;
  displaySerial: string;
  displayBarcode: string;
  glassCategory?: "DGU" | "DLGU" | "Laminated" | "General";
}

export const ProductionStageView: React.FC<ProductionStageViewProps> = ({
  stage,
  items,
  pis = [],
  operator = "Operator",
  externalSearchTerm = "",
  onRefresh,
  onOptimisticAdvance,
  onReject,
  onRework,
  onPrintSticker,
}) => {
  // Batch selection state (for Cutting stage drill-down)
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  // Batch table filters & sorting (Cutting stage)
  const [batchSearchTerm, setBatchSearchTerm] = useState("");
  const [batchCategoryFilter, setBatchCategoryFilter] = useState<"ALL" | "DLGU" | "DGU" | "LAMINATION">("ALL");
  const [batchSortField, setBatchSortField] = useState<string>("piNumber");
  const [batchSortAsc, setBatchSortAsc] = useState<boolean>(true);

  // Sticker workspace filters & controls
  const [searchTerm, setSearchTerm] = useState("");
  const [finishFilter, setFinishFilter] = useState<"ALL" | "CLEAR" | "COLOUR" | "PAIRED" | "WAITING" | "DLGU" | "DGU" | "LAMINATION" | "GENERAL" | "DIRECT_LAM" | "DLGU_LAM">("ALL");
  const [groupBy, setGroupBy] = useState<"SHEET" | "SFO" | "NONE">("SHEET");
  const [selectedSheetRackNo, setSelectedSheetRackNo] = useState<string>("ALL");
  const [selectedSheetRackNos, setSelectedSheetRackNos] = useState<string[]>(["ALL"]);
  const [isSheetDropdownOpen, setIsSheetDropdownOpen] = useState(false);
  const [isDraggingSheets, setIsDraggingSheets] = useState(false);
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);
  const [lastClickedSheetIndex, setLastClickedSheetIndex] = useState<number | null>(null);
  const sheetDropdownRef = useRef<HTMLDivElement>(null);
  const sheetScrollContainerRef = useRef<HTMLDivElement>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [rangeFromInput, setRangeFromInput] = useState<string>("1");
  const [rangeToInput, setRangeToInput] = useState<string>("10");
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedSheets, setExpandedSheets] = useState<Record<string, boolean>>({});

  const toggleSheetExpand = (rackNo: string) => {
    setExpandedSheets((prev) => ({
      ...prev,
      [rackNo]: !prev[rackNo],
    }));
  };

  const expandAllSheets = () => {
    const allExp: Record<string, boolean> = {};
    sheetGroups.forEach((g) => {
      allExp[g.rackNo] = true;
    });
    setExpandedSheets(allExp);
  };

  const collapseAllSheets = () => {
    setExpandedSheets({});
  };

  // Scan verification: row being scanned and verified at this stage
  const [scanRow, setScanRow] = useState<StageRowItem | null>(null);
  const [scanInput, setScanInput] = useState("");
  const scanInputRef = useRef<HTMLInputElement>(null);

  const isFinished = stage === "Finished";

  // Helper to determine if an item is Clear or Coloured
  // Helper to determine exact DGU pairing status for an individual pane (1 Colour + 1 Clear)
  const getDguPartnerStatus = (item: GlassItem) => {
    const itemFinish = getItemFinish(item);
    const oppositeFinish = itemFinish === "Colour" ? "Clear" : "Colour";

    // Find matching opposite pane currently at DGU
    const partnerAtDgu = items.find(
      (i) =>
        i.currentStage === "DGU" &&
        i.status !== "Rejected" &&
        i.serialNumber !== item.serialNumber &&
        getItemFinish(i) === oppositeFinish &&
        ((item.posNo && i.posNo && item.posNo === i.posNo) ||
          (i.width === item.width && i.height === item.height))
    );

    if (partnerAtDgu) {
      return {
        ready: true,
        label: `Pair Ready (1 Col + 1 Clr)`,
        partner: partnerAtDgu,
        oppositeFinish,
      };
    }

    // Find if opposite pane is still waiting in Cutting
    const partnerInCutting = items.find(
      (i) =>
        i.currentStage === "Cutting" &&
        i.status !== "Rejected" &&
        i.serialNumber !== item.serialNumber &&
        getItemFinish(i) === oppositeFinish &&
        ((item.posNo && i.posNo && item.posNo === i.posNo) ||
          (i.width === item.width && i.height === item.height))
    );

    return {
      ready: false,
      label: partnerInCutting
        ? `Waiting for ${oppositeFinish} pane in Cutting`
        : `No matching ${oppositeFinish} pane found`,
      partner: null,
      oppositeFinish,
    };
  };

  // Build Batch Summaries across all items & PIs
  const batchSummaries = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        piNumber: string;
        customerName: string;
        projectName: string;
        jobOrderNumber: string;
        sfoNo: string;
        items: GlassItem[];
        stageItems: GlassItem[];
      }
    >();

    items.forEach((item) => {
      const key = item.piId || item.piNumber || item.batchNo || "default";
      const parentPI = pis.find((p) => p.id === item.piId || p.piNumber === item.piNumber);
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          piNumber: (item.piNumber || parentPI?.piNumber || `BATCH-${item.batchNo || "1"}`).replace(/^STK-/i, ""),
          customerName: parentPI?.customerName || "BRIGHT PLUS FITOUT",
          projectName: parentPI?.projectName || item.sectionName || "VAL_BY_KAS",
          jobOrderNumber: parentPI?.jobOrderNumber || item.orderNo || item.sfoNo || "",
          sfoNo: item.sfoNo || parentPI?.sfoNo || "",
          items: [],
          stageItems: [],
        });
      }
      const b = map.get(key)!;
      b.items.push(item);
      if (item.currentStage?.toLowerCase() === stage?.toLowerCase() && item.status !== "Rejected") {
        b.stageItems.push(item);
      }
    });

    // Also include any PIs from Master if not present
    pis.forEach((p) => {
      if (!map.has(p.id) && !map.has(p.piNumber)) {
        map.set(p.id, {
          id: p.id,
          piNumber: (p.piNumber || "").replace(/^STK-/i, ""),
          customerName: p.customerName || "BRIGHT PLUS FITOUT",
          projectName: p.projectName || "VAL_BY_KAS",
          jobOrderNumber: p.jobOrderNumber || p.sfoNo || "",
          sfoNo: p.sfoNo || "",
          items: [],
          stageItems: [],
        });
      }
    });

    return Array.from(map.values()).map((b) => {
      const parentPI = pis.find((p) => p.id === b.id || p.piNumber === b.piNumber);
      const stageSqm = b.stageItems.reduce((acc, curr) => acc + (curr.sqm || 0), 0);
      const allSqm = b.items.reduce((acc, curr) => acc + (curr.sqm || 0), 0);
      const clearItems = b.items.filter((i) => getItemFinish(i) === "Clear").reduce((acc, curr) => acc + (curr.qty || 1), 0);
      const colourItems = b.items.filter((i) => getItemFinish(i) === "Colour").reduce((acc, curr) => acc + (curr.qty || 1), 0);

      const isColour =
        parentPI?.colorOrClear === "Colour" ||
        (parentPI as any)?.category?.toLowerCase().includes("colour") ||
        (parentPI as any)?.category?.toLowerCase().includes("color") ||
        colourItems > 0 ||
        b.items.some((i) => i.colorOrClear === "Colour" || getItemFinish(i) === "Colour");

      const finish: "Clear" | "Colour" = isColour ? "Colour" : "Clear";

      const stageItemsPieces = b.stageItems.reduce((acc, curr) => acc + (curr.qty || 1), 0);
      const totalCount = Math.max(
        b.items.reduce((acc, curr) => acc + (curr.qty || 1), 0),
        parentPI?.totalQty || parentPI?.itemsCount || 0
      );

      const completedCount =
        stageItemsPieces === 0 && totalCount > 0
          ? totalCount
          : b.items.filter(
              (i) =>
                i.completedStages?.includes(stage) ||
                (stage === "Cutting" && i.currentStage !== "Cutting") ||
                i.status === "Completed"
            ).reduce((acc, curr) => acc + (curr.qty || 1), 0);

      const totalSqmVal = parentPI?.totalSqm || (allSqm > 0 ? allSqm : stageSqm > 0 ? stageSqm : 0);

      const createdAt = parentPI?.createdAt || b.items[0]?.updatedAt || "";
      const issueDate = parentPI?.issueDate || parentPI?.sfoDate || "";

      const isDlgu = parentPI?.glassCategory === "DLGU" || b.items.some((i) => isDlguGlass(i) || (i as any).glassCategory === "DLGU");
      const isLam = !isDlgu && ((parentPI?.glassCategory === "Lamination" || b.items.some((i) => isLaminatedGlass(i))) && parentPI?.glassCategory !== "DGU");
      const glassCategory: "DLGU" | "DGU" | "Lamination" = isDlgu ? "DLGU" : (isLam ? "Lamination" : "DGU");
      const dlguPieces = b.items.filter((i) => isDlguGlass(i) || (i as any).glassCategory === "DLGU").reduce((acc, curr) => acc + (curr.qty || 1), 0);
      const dguPieces = b.items.filter((i) => (isDguGlass(i) || (i as any).glassCategory === "DGU") && !isDlguGlass(i) && (i as any).glassCategory !== "DLGU").reduce((acc, curr) => acc + (curr.qty || 1), 0);
      const lamPieces = b.items.filter((i) => (isLaminatedGlass(i) || (i as any).glassCategory === "Lamination") && !isDlguGlass(i) && (i as any).glassCategory !== "DLGU").reduce((acc, curr) => acc + (curr.qty || 1), 0);

      return {
        id: b.id,
        piNumber: b.piNumber,
        customerName: b.customerName,
        projectName: b.projectName,
        jobOrderNumber: b.jobOrderNumber,
        sfoNo: b.sfoNo,
        totalItems: totalCount,
        stageItemsCount: stageItemsPieces,
        completedCount: completedCount || parentPI?.completedItemsCount || 0,
        totalSqm: totalSqmVal,
        finish,
        glassCategory,
        dlguPieces,
        dguPieces,
        lamPieces,
        clearCount: clearItems,
        colourCount: colourItems,
        status: parentPI?.status || (stageItemsPieces === 0 && totalCount > 0 ? "Completed" : "In Production"),
        createdAt,
        issueDate,
      };
    });
  }, [items, pis, stage]);

  // Filtered Batches for the Cutting Table View
  const filteredBatches = useMemo(() => {
    return batchSummaries
      .filter((b) => {
        // Category filter (DLGU vs DGU vs LAMINATION)
        if (batchCategoryFilter === "DLGU" && b.glassCategory !== "DLGU") return false;
        if (batchCategoryFilter === "DGU" && b.glassCategory !== "DGU") return false;
        if (batchCategoryFilter === "LAMINATION" && b.glassCategory !== "Lamination") return false;

        const q = (batchSearchTerm || externalSearchTerm || "").toLowerCase().trim();
        if (!q) return true;
        return (
          b.piNumber.toLowerCase().includes(q) ||
          b.customerName.toLowerCase().includes(q) ||
          b.projectName.toLowerCase().includes(q) ||
          (b.jobOrderNumber && b.jobOrderNumber.toLowerCase().includes(q)) ||
          (b.sfoNo && b.sfoNo.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        let valA: any = a[batchSortField as keyof typeof a] || "";
        let valB: any = b[batchSortField as keyof typeof b] || "";
        if (typeof valA === "string") valA = valA.toLowerCase();
        if (typeof valB === "string") valB = valB.toLowerCase();
        if (valA < valB) return batchSortAsc ? -1 : 1;
        if (valA > valB) return batchSortAsc ? 1 : -1;
        return 0;
      });
  }, [batchSummaries, batchCategoryFilter, batchSearchTerm, externalSearchTerm, batchSortField, batchSortAsc]);

  const batchDlguCount = batchSummaries.filter((b) => b.glassCategory === "DLGU").length;
  const batchDguCount = batchSummaries.filter((b) => b.glassCategory === "DGU").length;
  const batchLamCount = batchSummaries.filter((b) => b.glassCategory === "Lamination").length;

  const handleBatchSort = (field: string) => {
    if (batchSortField === field) {
      setBatchSortAsc(!batchSortAsc);
    } else {
      setBatchSortField(field);
      setBatchSortAsc(true);
    }
  };

  const renderSortIcon = (field: string) => {
    if (batchSortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 inline-block text-slate-300" />;
    return batchSortAsc ? (
      <ArrowUp className="w-3 h-3 ml-1 inline-block text-purple-600 font-bold" />
    ) : (
      <ArrowDown className="w-3 h-3 ml-1 inline-block text-purple-600 font-bold" />
    );
  };

  // Close sheet dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sheetDropdownRef.current && !sheetDropdownRef.current.contains(e.target as Node)) {
        setIsSheetDropdownOpen(false);
        setIsDraggingSheets(false);
      }
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    if (isSheetDropdownOpen || isExportMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isSheetDropdownOpen, isExportMenuOpen]);


  // Reset batch drilldown, sheet selection, and search when stage changes
  React.useEffect(() => {
    setSelectedBatchId(null);
    setSelectedSheetRackNo("ALL");
    setSelectedSheetRackNos(["ALL"]);
    setIsSheetDropdownOpen(false);
    setIsDraggingSheets(false);
    setSelectedRowIds([]);
    setSearchTerm("");
    setFinishFilter("ALL");
    setExpandedSheets({});
  }, [stage]);

  // Selected Batch Information (Only relevant for Cutting stage drilldown)
  const selectedBatch = useMemo(() => {
    if (!selectedBatchId || stage !== "Cutting") return null;
    return batchSummaries.find((b) => b.id === selectedBatchId || b.piNumber === selectedBatchId) || null;
  }, [batchSummaries, selectedBatchId, stage]);

  // Base raw items for this stage (filtered by selected batch ONLY in Cutting stage)
  const stageItems = useMemo(() => {
    return items.filter((item) => {
      if (item.currentStage?.toLowerCase() !== stage?.toLowerCase()) return false;
      if (item.status === "Rejected") return false;
      if (stage === "Cutting" && selectedBatchId) {
        const cleanSelected = selectedBatchId.replace(/^STK-/i, "");
        const parentPI = pis.find(
          (p) =>
            p.id === selectedBatchId ||
            p.piNumber === selectedBatchId ||
            p.piNumber?.replace(/^STK-/i, "") === cleanSelected
        );
        const matches =
          item.piId === selectedBatchId ||
          item.piNumber === selectedBatchId ||
          item.piNumber?.replace(/^STK-/i, "") === cleanSelected ||
          (parentPI &&
            (item.piId === parentPI.id ||
              item.piNumber === parentPI.piNumber ||
              item.piNumber?.replace(/^STK-/i, "") === parentPI.piNumber?.replace(/^STK-/i, ""))) ||
          item.batchNo === selectedBatchId ||
          item.sfoNo === selectedBatchId ||
          item.orderNo === selectedBatchId;

        if (!matches) return false;
      }
      return true;
    });
  }, [items, stage, selectedBatchId, pis]);

  const rawClearCount = stageItems.filter((i) => getItemFinish(i) === "Clear").reduce((acc, curr) => acc + (curr.qty || 1), 0);
  const rawColourCount = stageItems.filter((i) => getItemFinish(i) === "Colour").reduce((acc, curr) => acc + (curr.qty || 1), 0);

  // DGU / Pairing Calculation: Matches 1 Colour + 1 Clear pane (Flexible 1-to-1 pairing)
  const dguStats = useMemo(() => {
    if (stage !== "DGU" && stage !== "Pairing") return null;
    const dguColourPanes = stageItems.filter((i) => getItemFinish(i) === "Colour");
    const dguClearPanes = stageItems.filter((i) => getItemFinish(i) === "Clear");

    const readyPairs = Math.min(dguColourPanes.length, dguClearPanes.length);
    const waitingColour = Math.max(0, dguColourPanes.length - readyPairs);
    const waitingClear = Math.max(0, dguClearPanes.length - readyPairs);
    const totalWaiting = waitingColour + waitingClear;

    return {
      colourCount: dguColourPanes.length,
      clearCount: dguClearPanes.length,
      readyPairs,
      waitingColour,
      waitingClear,
      totalWaiting,
    };
  }, [stage, stageItems]);

  /* ─────────────────────────────────────────────────────────────────────────────
     STAGE ROWS BUILDER:
     - In CUTTING / LAMINATION: Each sticker pane is 1 row.
     - In PAIRING BUFFER: Shows cut panes with 1+1 pairing matches & waiting status.
     - In DGU ASSEMBLY: 1 Colour + 1 Clear pane combine into 1 DGU Unit row.
     - In FINISHED / DISPATCH WAREHOUSE:
       * DGU items are combined into 1 DGU Unit row (with partner inner lite).
       * Laminated Glass items (from Lamination workstation) are displayed as their own rows.
       * General Glass items (monolithic / single panes) are displayed as their own rows.
       * Both Clear and Colour glass are displayed and never omitted.
     ───────────────────────────────────────────────────────────────────────────── */
  const stageRows = useMemo<StageRowItem[]>(() => {
    // 1. Simple stages: Cutting or generic (every pane is a row)
    if (stage === "Cutting" || (stage !== "DGU" && stage !== "Pairing" && stage !== "Finished" && stage !== "Lamination")) {
      return stageItems.map((item) => ({
        id: item.id || item.serialNumber,
        item,
        partnerItem: null,
        isDguPair: false,
        dguPairReady: false,
        glassCategory: (isDlguGlass(item) || item.glassCategory === "DLGU") ? "DLGU" : (isDguGlass(item) || item.glassCategory === "DGU") ? "DGU" : (isLaminatedGlass(item) || item.glassCategory === "Lamination") ? "Laminated" : "General",
        allSerials: [item.serialNumber],
        effectiveSqm: item.sqm || 0,
        displaySerial: item.serialNumber,
        displayBarcode: item.barcode,
      }));
    }

    // 2. Lamination Workstation: Pairs matching cut panes into 1 Laminated Glass Unit row
    if (stage === "Lamination") {
      const usedLam = new Set<string>();
      const rows: StageRowItem[] = [];

      // --- DLGU Phase-1: Group by server-stamped lamPairId ---
      const dlguItems = stageItems.filter(
        (i) => (i as any).glassCategory === "DLGU" || (i as any).dlguPhase === "LamPairing"
      );

      if (dlguItems.length > 0) {
        // Group by lamPairId (stamped by server when pairs advance from Pairing→Lamination)
        const byPairId = new Map<string, typeof dlguItems>();
        const noPairId: typeof dlguItems = [];

        dlguItems.forEach((item) => {
          const pid = (item as any).lamPairId as string | undefined;
          if (pid) {
            if (!byPairId.has(pid)) byPairId.set(pid, []);
            byPairId.get(pid)!.push(item);
          } else {
            noPairId.push(item);
          }
        });

        // Render paired groups (each lamPairId = 1 row)
        byPairId.forEach((panes, pid) => {
          // Primary pane = shorter glassType name (6MM before 13.52MM)
          const sorted = [...panes].sort((a, b) => a.glassType.localeCompare(b.glassType));
          const paneA = sorted[0];
          const paneB = sorted[1];
          panes.forEach((p) => usedLam.add(p.serialNumber));
          rows.push({
            id: `lam-dlgu-${pid}`,
            item: paneA,
            partnerItem: paneB || null,
            isDguPair: true,
            dguPairReady: true,
            glassCategory: "Laminated",
            allSerials: panes.map((p) => p.serialNumber),
            effectiveSqm: paneA.sqm || parseFloat(((paneA.width * paneA.height) / 1000000).toFixed(2)),
            displaySerial: paneA.serialNumber,
            displayBarcode: paneA.barcode,
          });
        });

        // Fallback: DLGU items with no lamPairId — pair by posNo + dimensions
        if (noPairId.length > 0) {
          const glassTypes = [...new Set(noPairId.map((i) => i.glassType))].sort();
          const typeA = glassTypes[0];
          const typeB = glassTypes[1];
          const panesA = noPairId.filter((i) => i.glassType === typeA);
          const panesB = noPairId.filter((i) => i.glassType === typeB);
          panesA.forEach((paneA) => {
            if (usedLam.has(paneA.serialNumber)) return;
            const match = panesB.find(
              (paneB) =>
                !usedLam.has(paneB.serialNumber) &&
                String(paneB.posNo || "").trim() === String(paneA.posNo || "").trim() &&
                Number(paneB.width) === Number(paneA.width) &&
                Number(paneB.height) === Number(paneA.height)
            );
            usedLam.add(paneA.serialNumber);
            if (match) usedLam.add(match.serialNumber);
            rows.push({
              id: `lam-dlgu-fb-${paneA.serialNumber}`,
              item: paneA,
              partnerItem: match || null,
              isDguPair: !!match,
              dguPairReady: true,
              glassCategory: "Laminated",
              allSerials: match ? [paneA.serialNumber, match.serialNumber] : [paneA.serialNumber],
              effectiveSqm: paneA.sqm || parseFloat(((paneA.width * paneA.height) / 1000000).toFixed(2)),
              displaySerial: paneA.serialNumber,
              displayBarcode: paneA.barcode,
            });
          });
          // Any unmatched typeB
          panesB.filter((p) => !usedLam.has(p.serialNumber)).forEach((paneB) => {
            usedLam.add(paneB.serialNumber);
            rows.push({
              id: `lam-dlgu-fb-${paneB.serialNumber}`,
              item: paneB,
              partnerItem: null,
              isDguPair: false,
              dguPairReady: true,
              glassCategory: "Laminated",
              allSerials: [paneB.serialNumber],
              effectiveSqm: paneB.sqm || parseFloat(((paneB.width * paneB.height) / 1000000).toFixed(2)),
              displaySerial: paneB.serialNumber,
              displayBarcode: paneB.barcode,
            });
          });
        }
      }

      // --- Regular Lamination glass (non-DLGU) ---
      const regularLamItems = stageItems.filter(
        (i) => isLaminatedGlass(i) && !((i as any).glassCategory === "DLGU" || (i as any).dlguPhase)
      ).sort((a, b) => {
        const numA = parseInt(a.serialNumber.replace(/\D/g, ""), 10) || 0;
        const numB = parseInt(b.serialNumber.replace(/\D/g, ""), 10) || 0;
        return numA - numB;
      });

      for (let i = 0; i < regularLamItems.length; i++) {
        const paneA = regularLamItems[i];
        if (usedLam.has(paneA.serialNumber)) continue;
        const match = regularLamItems.find(
          (paneB) =>
            paneB.serialNumber !== paneA.serialNumber &&
            !usedLam.has(paneB.serialNumber) &&
            isDguStickerPairMatch(paneA, paneB)
        );
        if (match) {
          usedLam.add(paneA.serialNumber);
          usedLam.add(match.serialNumber);
          rows.push({
            id: `lam-pair-${paneA.serialNumber}-${match.serialNumber}`,
            item: paneA,
            partnerItem: match,
            isDguPair: true,
            dguPairReady: true,
            glassCategory: "Laminated",
            allSerials: [paneA.serialNumber, match.serialNumber],
            effectiveSqm: paneA.sqm || parseFloat(((paneA.width * paneA.height) / 1000000).toFixed(2)),
            displaySerial: paneA.serialNumber,
            displayBarcode: paneA.barcode,
          });
        } else {
          usedLam.add(paneA.serialNumber);
          rows.push({
            id: `lam-single-${paneA.serialNumber}`,
            item: paneA,
            partnerItem: null,
            isDguPair: false,
            dguPairReady: true,
            glassCategory: "Laminated",
            allSerials: [paneA.serialNumber],
            effectiveSqm: paneA.sqm || parseFloat(((paneA.width * paneA.height) / 1000000).toFixed(2)),
            displaySerial: paneA.serialNumber,
            displayBarcode: paneA.barcode,
          });
        }
      }

      return rows;
    }

    // 2. Finished / Dispatch Warehouse: Supports DLGU Units + DGU Units + Laminated Glass + General Glass
    if (stage === "Finished") {
      const rows: StageRowItem[] = [];

      // A. DLGU Items in Finished Warehouse
      const dlguItems = stageItems.filter((i) => isDlguGlass(i) || (i as any).glassCategory === "DLGU");
      // B. Standard DGU / IGU Items (Pure DGU without Lamination)
      const dguItems = stageItems.filter((i) => (isDguGlass(i) || (i as any).glassCategory === "DGU") && !isDlguGlass(i) && (i as any).glassCategory !== "DLGU");
      // C. Laminated Items (Pure Lamination without DGU/DLGU)
      const lamItems = stageItems.filter((i) => (isLaminatedGlass(i) || (i as any).glassCategory === "Lamination") && !isDguGlass(i) && !isDlguGlass(i) && (i as any).glassCategory !== "DLGU");
      // D. General Monolithic Items
      const generalItems = stageItems.filter((i) => !isDguGlass(i) && !isDlguGlass(i) && !isLaminatedGlass(i) && (i as any).glassCategory !== "DLGU" && (i as any).glassCategory !== "DGU" && (i as any).glassCategory !== "Lamination");

      // Process DLGU Units (1 Colour Pane + 2 Clear Laminated Panes = 1 DLGU Unit)
      const dlguColourPanes = dlguItems.filter((i) => getItemFinish(i) === "Colour");
      const dlguClearPanes = dlguItems.filter((i) => getItemFinish(i) === "Clear");
      const usedDlguClear = new Set<string>();

      if (dlguColourPanes.length > 0) {
        dlguColourPanes.forEach((col) => {
          // Find all clear panes belonging to this DLGU unit (same position, dimensions, order/PI)
          const matchingClears = dlguClearPanes.filter(
            (clr) => !usedDlguClear.has(clr.serialNumber) && isDguStickerPairMatch(col, clr)
          );

          const primaryClear = matchingClears[0] || null;
          const allUnitSerials = [col.serialNumber];

          matchingClears.forEach((clr) => {
            usedDlguClear.add(clr.serialNumber);
            allUnitSerials.push(clr.serialNumber);
          });

          rows.push({
            id: `finished-dlgu-pair-${col.serialNumber}`,
            item: col,
            partnerItem: primaryClear,
            isDguPair: true,
            dguPairReady: true,
            glassCategory: "DLGU",
            allSerials: allUnitSerials,
            effectiveSqm: col.sqm || parseFloat(((col.width * col.height) / 1000000).toFixed(2)),
            displaySerial: col.serialNumber,
            displayBarcode: col.barcode,
          });
        });

        // Any orphaned clear panes not matched with any colour pane
        dlguClearPanes.forEach((clr) => {
          if (!usedDlguClear.has(clr.serialNumber)) {
            usedDlguClear.add(clr.serialNumber);
            rows.push({
              id: `finished-dlgu-clr-${clr.serialNumber}`,
              item: clr,
              partnerItem: null,
              isDguPair: false,
              dguPairReady: true,
              glassCategory: "DLGU",
              allSerials: [clr.serialNumber],
              effectiveSqm: clr.sqm || parseFloat(((clr.width * clr.height) / 1000000).toFixed(2)),
              displaySerial: clr.serialNumber,
              displayBarcode: clr.barcode,
            });
          }
        });
      } else {
        // If only clear DLGU panes exist, pair complementary lites (e.g. 6mm + 13.52mm)
        const sortedClearDlgu = [...dlguClearPanes].sort((a, b) => {
          const numA = parseInt(a.serialNumber.replace(/\D/g, ""), 10) || 0;
          const numB = parseInt(b.serialNumber.replace(/\D/g, ""), 10) || 0;
          return numA - numB;
        });

        for (let i = 0; i < sortedClearDlgu.length; i++) {
          const paneA = sortedClearDlgu[i];
          if (usedDlguClear.has(paneA.serialNumber)) continue;

          const match = sortedClearDlgu.find(
            (paneB) =>
              paneB.serialNumber !== paneA.serialNumber &&
              !usedDlguClear.has(paneB.serialNumber) &&
              isDguStickerPairMatch(paneA, paneB)
          );

          if (match) {
            usedDlguClear.add(paneA.serialNumber);
            usedDlguClear.add(match.serialNumber);
            rows.push({
              id: `finished-dlgu-pair-${paneA.serialNumber}-${match.serialNumber}`,
              item: paneA,
              partnerItem: match,
              isDguPair: true,
              dguPairReady: true,
              glassCategory: "DLGU",
              allSerials: [paneA.serialNumber, match.serialNumber],
              effectiveSqm: paneA.sqm || parseFloat(((paneA.width * paneA.height) / 1000000).toFixed(2)),
              displaySerial: paneA.serialNumber,
              displayBarcode: paneA.barcode,
            });
          } else {
            usedDlguClear.add(paneA.serialNumber);
            rows.push({
              id: `finished-dlgu-clr-${paneA.serialNumber}`,
              item: paneA,
              partnerItem: null,
              isDguPair: false,
              dguPairReady: true,
              glassCategory: "DLGU",
              allSerials: [paneA.serialNumber],
              effectiveSqm: paneA.sqm || parseFloat(((paneA.width * paneA.height) / 1000000).toFixed(2)),
              displaySerial: paneA.serialNumber,
              displayBarcode: paneA.barcode,
            });
          }
        }
      }

      // Process DGU Units (Pair Colour with Clear DGU panes)
      const dguColourPanes = dguItems.filter((i) => getItemFinish(i) === "Colour");
      const dguClearPanes = dguItems.filter((i) => getItemFinish(i) === "Clear");
      const usedDguClear = new Set<string>();

      dguColourPanes.forEach((col) => {
        const match = dguClearPanes.find(
          (clr) => !usedDguClear.has(clr.serialNumber) && isDguStickerPairMatch(col, clr)
        );

        if (match) {
          usedDguClear.add(match.serialNumber);
          rows.push({
            id: `finished-dgu-pair-${col.serialNumber}-${match.serialNumber}`,
            item: col,
            partnerItem: match,
            isDguPair: true,
            dguPairReady: true,
            glassCategory: "DGU",
            allSerials: [col.serialNumber, match.serialNumber],
            effectiveSqm: col.sqm || parseFloat(((col.width * col.height) / 1000000).toFixed(2)),
            displaySerial: col.serialNumber,
            displayBarcode: col.barcode,
          });
        } else {
          rows.push({
            id: `finished-dgu-col-${col.serialNumber}`,
            item: col,
            partnerItem: null,
            isDguPair: false,
            dguPairReady: true,
            glassCategory: "DGU",
            allSerials: [col.serialNumber],
            effectiveSqm: col.sqm || parseFloat(((col.width * col.height) / 1000000).toFixed(2)),
            displaySerial: col.serialNumber,
            displayBarcode: col.barcode,
          });
        }
      });

      dguClearPanes.forEach((clr) => {
        if (!usedDguClear.has(clr.serialNumber)) {
          rows.push({
            id: `finished-dgu-clr-${clr.serialNumber}`,
            item: clr,
            partnerItem: null,
            isDguPair: false,
            dguPairReady: true,
            glassCategory: "DGU",
            allSerials: [clr.serialNumber],
            effectiveSqm: clr.sqm || parseFloat(((clr.width * clr.height) / 1000000).toFixed(2)),
            displaySerial: clr.serialNumber,
            displayBarcode: clr.barcode,
          });
        }
      });

      // Process Laminated Items (Pair complementary laminated panes together so each unit is 1 row)
      const usedFinishedLam = new Set<string>();
      const sortedLamItems = [...lamItems].sort((a, b) => {
        const numA = parseInt(a.serialNumber.replace(/\D/g, ""), 10) || 0;
        const numB = parseInt(b.serialNumber.replace(/\D/g, ""), 10) || 0;
        return numA - numB;
      });

      for (let i = 0; i < sortedLamItems.length; i++) {
        const paneA = sortedLamItems[i];
        if (usedFinishedLam.has(paneA.serialNumber)) continue;

        const match = sortedLamItems.find(
          (paneB) =>
            paneB.serialNumber !== paneA.serialNumber &&
            !usedFinishedLam.has(paneB.serialNumber) &&
            isDguStickerPairMatch(paneA, paneB)
        );

        if (match) {
          usedFinishedLam.add(paneA.serialNumber);
          usedFinishedLam.add(match.serialNumber);
          const calcEffectiveSqm = paneA.sqm || parseFloat(((paneA.width * paneA.height * (paneA.qty || 1)) / 1000000).toFixed(2));
          rows.push({
            id: `finished-lam-pair-${paneA.serialNumber}-${match.serialNumber}`,
            item: paneA,
            partnerItem: match,
            isDguPair: true,
            dguPairReady: true,
            glassCategory: "Laminated",
            allSerials: [paneA.serialNumber, match.serialNumber],
            effectiveSqm: calcEffectiveSqm,
            displaySerial: paneA.serialNumber,
            displayBarcode: paneA.barcode,
          });
        } else {
          usedFinishedLam.add(paneA.serialNumber);
          const calcEffectiveSqm = paneA.sqm || parseFloat(((paneA.width * paneA.height * (paneA.qty || 1)) / 1000000).toFixed(2));
          rows.push({
            id: `finished-laminated-${paneA.id || paneA.serialNumber}`,
            item: paneA,
            partnerItem: null,
            isDguPair: false,
            dguPairReady: true,
            glassCategory: "Laminated",
            allSerials: [paneA.serialNumber],
            effectiveSqm: calcEffectiveSqm,
            displaySerial: paneA.serialNumber,
            displayBarcode: paneA.barcode,
          });
        }
      }

      // Process General / Monolithic Items
      generalItems.forEach((item) => {
        const calcEffectiveSqm = item.sqm || parseFloat(((item.width * item.height * (item.qty || 1)) / 1000000).toFixed(2));
        rows.push({
          id: `finished-general-${item.id || item.serialNumber}`,
          item,
          partnerItem: null,
          isDguPair: false,
          dguPairReady: true,
          glassCategory: "General",
          allSerials: [item.serialNumber],
          effectiveSqm: calcEffectiveSqm,
          displaySerial: item.serialNumber,
          displayBarcode: item.barcode,
        });
      });

      return rows;
    }

    // 3. Pairing Buffer / DGU Assembly Stages: Strictly filter to DGU / DLGU items for DGU stage
    const activeDguItems = stage === "DGU" ? stageItems.filter((i) => isDguGlass(i) || isDlguGlass(i)) : stageItems;
    const stageColourPanes = activeDguItems.filter((i) => getItemFinish(i) === "Colour");
    const stageClearPanes = activeDguItems.filter((i) => getItemFinish(i) === "Clear");

    const usedClearSet = new Set<string>();
    const rows: StageRowItem[] = [];

    // 1. For each Colour pane, find matching Clear pane matching all sticker criteria (Order No, OB #, POS #, Width, Height, Glass Code, etc.)
    stageColourPanes.forEach((col) => {
      const match = stageClearPanes.find(
        (clr) => !usedClearSet.has(clr.serialNumber) && isDguStickerPairMatch(col, clr)
      );

      const isDlgu =
        isDlguGlass(col) ||
        (col as any).glassCategory === "DLGU" ||
        (match && (isDlguGlass(match) || (match as any).glassCategory === "DLGU" || (match.processRoute && match.processRoute.includes("Lamination"))));

      if (match) {
        usedClearSet.add(match.serialNumber);
        rows.push({
          id: `${stage.toLowerCase()}-pair-${col.serialNumber}-${match.serialNumber}`,
          item: col, // Colour Glass is the primary unit pane (Outer Panel)
          partnerItem: match, // Clear Glass is the paired inner lite
          isDguPair: true,
          dguPairReady: true,
          glassCategory: isDlgu ? "DLGU" : "DGU",
          allSerials: [col.serialNumber, match.serialNumber],
          effectiveSqm: col.sqm || parseFloat(((col.width * col.height) / 1000000).toFixed(2)),
          displaySerial: col.serialNumber,
          displayBarcode: col.barcode,
        });
      } else {
        // Unpaired Colour pane
        rows.push({
          id: `${stage.toLowerCase()}-col-${col.serialNumber}`,
          item: col,
          partnerItem: null,
          isDguPair: false,
          dguPairReady: false,
          dguWaitingFinish: "Clear",
          glassCategory: isDlgu ? "DLGU" : "DGU",
          allSerials: [col.serialNumber],
          effectiveSqm: col.sqm || parseFloat(((col.width * col.height) / 1000000).toFixed(2)),
          displaySerial: col.serialNumber,
          displayBarcode: col.barcode,
        });
      }
    });

    // 2. Clear panes handling in Pairing Buffer only:
    if (stage === "Pairing") {
      stageClearPanes.forEach((clr) => {
        if (!usedClearSet.has(clr.serialNumber)) {
          rows.push({
            id: `pairing-unpaired-clr-${clr.serialNumber}`,
            item: clr,
            partnerItem: null,
            isDguPair: false,
            dguPairReady: false,
            dguWaitingFinish: "Colour",
            glassCategory: isDlguGlass(clr) ? "DLGU" : "DGU",
            allSerials: [clr.serialNumber],
            effectiveSqm: clr.sqm || parseFloat(((clr.width * clr.height) / 1000000).toFixed(2)),
            displaySerial: clr.serialNumber,
            displayBarcode: clr.barcode,
          });
        }
      });
    }

    return rows;
  }, [stage, stageItems]);

  const totalStagePieces =
    stage === "Finished" || stage === "DGU" || stage === "Lamination"
      ? stageRows.length
      : stageItems.reduce((acc, curr) => acc + (curr.qty || 1), 0);

  const finishedDlguCount = useMemo(() => stageRows.filter((r) => r.glassCategory === "DLGU").length, [stageRows]);
  const finishedDguCount = useMemo(() => stageRows.filter((r) => r.glassCategory === "DGU").length, [stageRows]);
  const finishedLamCount = useMemo(() => stageRows.filter((r) => r.glassCategory === "Laminated").length, [stageRows]);
  const finishedGenCount = useMemo(() => stageRows.filter((r) => r.glassCategory === "General").length, [stageRows]);

  const dguDlguCount = useMemo(() => stageRows.filter((r) => r.glassCategory === "DLGU" && r.isDguPair).length, [stageRows]);
  const dguStandardCount = useMemo(() => stageRows.filter((r) => r.glassCategory === "DGU" && r.isDguPair).length, [stageRows]);

  const lamDlguCount = useMemo(
    () => stageRows.filter((r) => isDlguGlass(r.item) || (r.item as any).glassCategory === "DLGU").length,
    [stageRows]
  );
  const lamDirectCount = useMemo(
    () => stageRows.filter((r) => !isDlguGlass(r.item) && (r.item as any).glassCategory !== "DLGU").length,
    [stageRows]
  );

  // Filtered Rows for display based on filters & search
  const filteredRows = useMemo(() => {
    return stageRows.filter((row) => {
      const item = row.item;
      const finish = getItemFinish(item);

      if (stage === "DGU") {
        if (finishFilter === "DLGU" && row.glassCategory !== "DLGU") return false;
        if (finishFilter === "DGU" && row.glassCategory !== "DGU") return false;
        if (finishFilter === "PAIRED" && !row.isDguPair) return false;
        if (finishFilter === "WAITING" && row.isDguPair) return false;
        if (finishFilter === "CLEAR" && (row.isDguPair || finish !== "Clear")) return false;
        if (finishFilter === "COLOUR" && (row.isDguPair || finish !== "Colour")) return false;
      } else if (stage === "Pairing") {
        if (finishFilter === "PAIRED" && !row.isDguPair) return false;
        if (finishFilter === "WAITING" && row.isDguPair) return false;
        if (finishFilter === "CLEAR" && (row.isDguPair || finish !== "Clear")) return false;
        if (finishFilter === "COLOUR" && (row.isDguPair || finish !== "Colour")) return false;
      } else if (stage === "Finished") {
        if (finishFilter === "DLGU" && row.glassCategory !== "DLGU") return false;
        if (finishFilter === "DGU" && row.glassCategory !== "DGU") return false;
        if (finishFilter === "LAMINATION" && row.glassCategory !== "Laminated") return false;
        if (finishFilter === "GENERAL" && row.glassCategory !== "General") return false;
      } else if (stage === "Lamination") {
        const isDlgu = isDlguGlass(item) || (item as any).glassCategory === "DLGU";
        if (finishFilter === "DIRECT_LAM" && isDlgu) return false;
        if (finishFilter === "DLGU_LAM" && !isDlgu) return false;
        if (finishFilter === "CLEAR" && finish !== "Clear") return false;
        if (finishFilter === "COLOUR" && finish !== "Colour") return false;
      } else {
        if (finishFilter === "CLEAR" && finish !== "Clear") return false;
        if (finishFilter === "COLOUR" && finish !== "Colour") return false;
      }

      const query = (searchTerm || externalSearchTerm || "").toLowerCase().trim();
      if (!query) return true;

      const partnerMatch = row.partnerItem
        ? row.partnerItem.serialNumber.toLowerCase().includes(query) ||
          row.partnerItem.barcode.toLowerCase().includes(query) ||
          row.partnerItem.glassType.toLowerCase().includes(query)
        : false;

      return (
        row.displaySerial.toLowerCase().includes(query) ||
        row.displayBarcode.toLowerCase().includes(query) ||
        item.itemCode.toLowerCase().includes(query) ||
        item.piNumber.toLowerCase().includes(query) ||
        item.glassType.toLowerCase().includes(query) ||
        (item.orderNo && item.orderNo.toLowerCase().includes(query)) ||
        (item.batchNo && item.batchNo.toLowerCase().includes(query)) ||
        (item.rackNo && item.rackNo.toLowerCase().includes(query)) ||
        partnerMatch
      );
    });
  }, [stageRows, stage, finishFilter, searchTerm, externalSearchTerm]);

  // Group rows by Raw Sheet / Pattern (Rack #)
  const sheetGroups = useMemo(() => {
    const map = new Map<string, StageRowItem[]>();
    filteredRows.forEach((row) => {
      const key = row.item.rackNo || "1";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    });

    return Array.from(map.entries())
      .map(([rackNo, groupRows]) => {
        const totalSqm = groupRows.reduce((acc, curr) => acc + (curr.effectiveSqm || 0), 0);
        const sfoSet = Array.from(new Set(groupRows.map((r) => r.item.sfoNo || r.item.piNumber).filter(Boolean)));
        const obSet = Array.from(new Set(groupRows.map((r) => r.item.obNo).filter(Boolean)));
        const finish = getItemFinish(groupRows[0].item);
        return {
          rackNo,
          rows: groupRows,
          items: groupRows.map((r) => r.item),
          totalSqm,
          sfoList: sfoSet,
          obList: obSet,
          finish,
        };
      })
      .sort((a, b) => {
        const numA = parseInt(a.rackNo, 10) || 0;
        const numB = parseInt(b.rackNo, 10) || 0;
        return numA - numB;
      });
  }, [filteredRows]);

  // Active Multi-Sheet Selection State
  const isAllSheetsSelected = useMemo(() => {
    return (
      selectedSheetRackNos.includes("ALL") ||
      selectedSheetRackNos.length === 0 ||
      (sheetGroups.length > 0 && selectedSheetRackNos.length >= sheetGroups.length)
    );
  }, [selectedSheetRackNos, sheetGroups.length]);

  const isSingleSheet = useMemo(() => {
    return !isAllSheetsSelected && selectedSheetRackNos.length === 1;
  }, [isAllSheetsSelected, selectedSheetRackNos]);

  const singleSheetRackNo = isSingleSheet ? selectedSheetRackNos[0] : null;

  const activeRackNo = useMemo(() => {
    if (isAllSheetsSelected) return "ALL";
    if (isSingleSheet && singleSheetRackNo) return singleSheetRackNo;
    return selectedSheetRackNos.join(",");
  }, [isAllSheetsSelected, isSingleSheet, singleSheetRackNo, selectedSheetRackNos]);

  const currentSheetIndex = useMemo(() => {
    if (!isSingleSheet || !singleSheetRackNo) return -1;
    return sheetGroups.findIndex((g) => g.rackNo === singleSheetRackNo);
  }, [sheetGroups, isSingleSheet, singleSheetRackNo]);

  const currentGroup = useMemo(() => {
    if (!isSingleSheet || !singleSheetRackNo) return null;
    return sheetGroups.find((g) => g.rackNo === singleSheetRackNo) || null;
  }, [sheetGroups, isSingleSheet, singleSheetRackNo]);

  const displayedSheetGroups = useMemo(() => {
    if (stage !== "Cutting") return [];
    if (isAllSheetsSelected) {
      return sheetGroups;
    }
    return sheetGroups.filter((g) => selectedSheetRackNos.includes(g.rackNo));
  }, [stage, sheetGroups, isAllSheetsSelected, selectedSheetRackNos]);

  const displayedRows = useMemo(() => {
    if (isAllSheetsSelected) {
      return filteredRows;
    }
    return filteredRows.filter((r) => selectedSheetRackNos.includes(r.item.rackNo || "1"));
  }, [filteredRows, isAllSheetsSelected, selectedSheetRackNos]);

  const handleSheetMouseDown = (index: number, rackNo: string, e: React.MouseEvent) => {
    // Shift + Click range selection
    if (e.shiftKey && lastClickedSheetIndex !== null) {
      const start = Math.min(lastClickedSheetIndex, index);
      const end = Math.max(lastClickedSheetIndex, index);
      const range = sheetGroups.slice(start, end + 1).map((g) => g.rackNo);
      setSelectedSheetRackNos(range);
      setSelectedRowIds([]);
      return;
    }

    // Ctrl / Cmd + Click toggle
    if (e.ctrlKey || e.metaKey) {
      setSelectedSheetRackNos((prev) => {
        const withoutAll = prev.filter((r) => r !== "ALL");
        const next = withoutAll.includes(rackNo) ? withoutAll.filter((r) => r !== rackNo) : [...withoutAll, rackNo];
        return next.length === 0 ? ["ALL"] : next;
      });
      setLastClickedSheetIndex(index);
      setSelectedRowIds([]);
      return;
    }

    // Start drag selection
    setIsDraggingSheets(true);
    setDragStartIndex(index);
    setLastClickedSheetIndex(index);
    setSelectedSheetRackNos([rackNo]);
    setSelectedRowIds([]);
  };

  const handleSheetMouseEnter = (index: number) => {
    if (!isDraggingSheets || dragStartIndex === null) return;
    const start = Math.min(dragStartIndex, index);
    const end = Math.max(dragStartIndex, index);
    const range = sheetGroups.slice(start, end + 1).map((g) => g.rackNo);
    setSelectedSheetRackNos(range);
    setSelectedRowIds([]);
  };

  const handleToggleSheet = (rackNo: string) => {
    if (rackNo === "ALL") {
      setSelectedSheetRackNos(["ALL"]);
      setSelectedRowIds([]);
      return;
    }
    setSelectedSheetRackNos((prev) => {
      const withoutAll = prev.filter((r) => r !== "ALL");
      const next = withoutAll.includes(rackNo) ? withoutAll.filter((r) => r !== rackNo) : [...withoutAll, rackNo];
      return next.length === 0 ? ["ALL"] : next;
    });
    setSelectedRowIds([]);
  };

  const handleSelectAllSheets = () => {
    setSelectedSheetRackNos(["ALL"]);
    setSelectedRowIds([]);
  };

  const handleAdvanceSheet = async (groupRows: StageRowItem[]) => {
    const serials = groupRows.flatMap((r) => r.allSerials);
    await completeStage(serials);
  };

  const goToPrevSheet = () => {
    if (isAllSheetsSelected) {
      if (sheetGroups.length > 0) setSelectedSheetRackNos([sheetGroups[sheetGroups.length - 1].rackNo]);
    } else {
      const firstRack = selectedSheetRackNos[0];
      const idx = sheetGroups.findIndex((g) => g.rackNo === firstRack);
      if (idx <= 0) {
        setSelectedSheetRackNos(["ALL"]);
      } else {
        setSelectedSheetRackNos([sheetGroups[idx - 1].rackNo]);
      }
    }
    setSelectedRowIds([]);
  };

  const goToNextSheet = () => {
    if (isAllSheetsSelected) {
      if (sheetGroups.length > 0) setSelectedSheetRackNos([sheetGroups[0].rackNo]);
    } else {
      const lastRack = selectedSheetRackNos[selectedSheetRackNos.length - 1];
      const idx = sheetGroups.findIndex((g) => g.rackNo === lastRack);
      if (idx < sheetGroups.length - 1) {
        setSelectedSheetRackNos([sheetGroups[idx + 1].rackNo]);
      } else {
        setSelectedSheetRackNos(["ALL"]);
      }
    }
    setSelectedRowIds([]);
  };

  const handleAdvanceSelectedSheets = async () => {
    const serials = displayedRows.flatMap((r) => r.allSerials);
    await completeStage(serials);
  };

  // Apply custom direct range inputs (e.g. from Sheet 1 to 25)
  const handleApplyRangeInput = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const fromNum = parseInt(rangeFromInput, 10);
    const toNum = parseInt(rangeToInput, 10);
    if (isNaN(fromNum) || isNaN(toNum)) return;
    const minNum = Math.min(fromNum, toNum);
    const maxNum = Math.max(fromNum, toNum);

    const matchedRacks = sheetGroups
      .filter((g) => {
        const num = parseInt(g.rackNo, 10);
        return !isNaN(num) && num >= minNum && num <= maxNum;
      })
      .map((g) => g.rackNo);

    if (matchedRacks.length > 0) {
      setSelectedSheetRackNos(matchedRacks);
      setSelectedRowIds([]);
    }
  };

  // Global drag handler with automatic container auto-scrolling
  useEffect(() => {
    let animFrame: number | null = null;
    let lastClientY = 0;

    const autoScrollLoop = () => {
      if (!isDraggingSheets || !sheetScrollContainerRef.current) return;
      const container = sheetScrollContainerRef.current;
      const rect = container.getBoundingClientRect();
      const topEdge = rect.top + 45;
      const bottomEdge = rect.bottom - 45;

      if (lastClientY > bottomEdge && lastClientY <= rect.bottom + 120) {
        const delta = Math.min(22, Math.max(4, (lastClientY - bottomEdge) / 2));
        container.scrollTop += delta;
      } else if (lastClientY < topEdge && lastClientY >= rect.top - 120) {
        const delta = Math.min(22, Math.max(4, (topEdge - lastClientY) / 2));
        container.scrollTop -= delta;
      }

      animFrame = requestAnimationFrame(autoScrollLoop);
    };

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isDraggingSheets || dragStartIndex === null || !sheetScrollContainerRef.current) return;
      lastClientY = e.clientY;

      // Find element under pointer
      const element = document.elementFromPoint(e.clientX, e.clientY);
      if (element) {
        const sheetRow = element.closest("[data-sheet-index]") as HTMLElement | null;
        if (sheetRow && sheetRow.dataset.sheetIndex !== undefined) {
          const currentIndex = parseInt(sheetRow.dataset.sheetIndex, 10);
          if (!isNaN(currentIndex)) {
            const start = Math.min(dragStartIndex, currentIndex);
            const end = Math.max(dragStartIndex, currentIndex);
            const range = sheetGroups.slice(start, end + 1).map((g) => g.rackNo);
            setSelectedSheetRackNos(range);
            setSelectedRowIds([]);
          }
        }
      }
    };

    const handleGlobalMouseUp = () => {
      setIsDraggingSheets(false);
      setDragStartIndex(null);
      if (animFrame) {
        cancelAnimationFrame(animFrame);
        animFrame = null;
      }
    };

    if (isDraggingSheets) {
      window.addEventListener("mousemove", handleGlobalMouseMove, { passive: true });
      window.addEventListener("mouseup", handleGlobalMouseUp);
      animFrame = requestAnimationFrame(autoScrollLoop);
    }

    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
      if (animFrame) cancelAnimationFrame(animFrame);
    };
  }, [isDraggingSheets, dragStartIndex, sheetGroups]);

  const toggleSelectAll = () => {
    const selectableRows =
      stage === "DGU"
        ? displayedRows.filter((r) => r.dguPairReady)
        : displayedRows;

    if (selectableRows.length === 0) return;

    const allSelectableSelected = selectableRows.every((r) => selectedRowIds.includes(r.id));
    if (allSelectableSelected) {
      setSelectedRowIds([]);
    } else {
      setSelectedRowIds(selectableRows.map((r) => r.id));
    }
  };

  const toggleSelect = (rowId: string) => {
    const row = displayedRows.find((r) => r.id === rowId);
    if (stage === "DGU" && row && !row.dguPairReady) {
      toast.warning("Cannot select: matching Clear glass has not been cut yet.");
      return;
    }
    setSelectedRowIds((prev) =>
      prev.includes(rowId) ? prev.filter((s) => s !== rowId) : [...prev, rowId]
    );
  };

  // Open the scan modal for any row
  const openScanModal = (row: StageRowItem) => {
    setScanRow(row);
    setScanInput("");
    setTimeout(() => scanInputRef.current?.focus(), 100);
  };

  const handleScanVerify = async () => {
    if (!scanRow) return;
    const val = scanInput.trim();
    const targetItem = scanRow.item;
    const partnerItem = scanRow.partnerItem;
    const nextStage = getNextStageLabel(targetItem, stage);

    // Accept primary barcode/serial (Colour Glass in DGU) or partner barcode/serial
    const isMatch =
      val === scanRow.displayBarcode ||
      val === scanRow.displaySerial ||
      val === targetItem.barcode ||
      val === targetItem.serialNumber ||
      (partnerItem && (val === partnerItem.barcode || val === partnerItem.serialNumber));

    if (isMatch) {
      setScanRow(null);
      setScanInput("");

      /* ── CUTTING WORKSTATION AUTO-SCAN RULES ── */
      if (stage === "Cutting") {
        if (activeRackNo !== "ALL" && currentGroup) {
          const sheetSerials = currentGroup.rows.flatMap((r) => r.allSerials);
          toast.success(
            `⚡ Sheet Auto-Scan: Scanned sticker (${targetItem.serialNumber})! Auto-advancing all ${sheetSerials.length} panel(s) on Sheet ${activeRackNo} to ${nextStage}.`
          );
          await completeStage(sheetSerials, undefined, true);
          return;
        }

        const piBatchItems = items
          .filter(
            (i) =>
              (i.piId === targetItem.piId || i.piNumber === targetItem.piNumber) &&
              i.currentStage === "Cutting" &&
              i.status !== "Rejected"
          )
          .sort((a, b) => (a.srNo || 0) - (b.srNo || 0));

        if (piBatchItems.length > 0) {
          const firstItem = piBatchItems[0];
          const lastItem = piBatchItems[piBatchItems.length - 1];

          const isFirst =
            targetItem.serialNumber === firstItem.serialNumber ||
            targetItem.barcode === firstItem.barcode ||
            targetItem.srNo === 1;

          const isLast =
            targetItem.serialNumber === lastItem.serialNumber ||
            targetItem.barcode === lastItem.barcode ||
            targetItem.srNo === piBatchItems.length;

          if (isFirst || isLast) {
            const batchSerials = piBatchItems.map((i) => i.serialNumber);
            toast.success(
              `⚡ Entire Batch Auto-Scan: Scanned ${isFirst ? "First" : "Last"} sticker (${targetItem.serialNumber})! Auto-advancing all ${piBatchItems.length} stickers in entire batch to ${nextStage}.`
            );
            await completeStage(batchSerials, undefined, true);
            return;
          }
        }
      }

      /* ── DGU 1 COLOUR + 1 CLEAR COMBINED UNIT ADVANCEMENT ── */
      if (stage === "DGU") {
        if (!scanRow.dguPairReady || !partnerItem) {
          toast.error(
            `❌ Cannot assemble DGU: The matching ${scanRow.dguWaitingFinish || "Clear"} glass pane has NOT been cut yet.`
          );
          setScanInput("");
          return;
        }

        toast.success(
          `⚡ DGU Unit Assembled & Verified (${targetItem.serialNumber} + ${partnerItem.serialNumber})! Advancing to ${nextStage}...`
        );
        await completeStage(scanRow.allSerials, undefined, true);
        return;
      }

      // Single item advance with QTY decrement (each scan advances 1 piece)
      const remainingPieces = (targetItem.qty || 1) - 1;
      toast.success(
        remainingPieces > 0
          ? `⚡ Scanned 1 pc of ${targetItem.serialNumber} (POS #${targetItem.posNo})! Count reduced by 1 (${remainingPieces} pcs remaining in ${stage}).`
          : `⚡ Scanned & Completed final piece of ${targetItem.serialNumber}! Advancing to ${nextStage}...`
      );
      await completeStage(scanRow.allSerials, 1, false);
    } else {
      toast.error("❌ Barcode mismatch — please scan the correct sticker barcode.");
      setScanInput("");
    }
  };

  const completeStage = async (serialNumbers: string[], advanceQty?: number, advanceAll?: boolean) => {
    // 1. Instant optimistic local UI transition (0 ms)
    onOptimisticAdvance?.(serialNumbers, stage);
    setSelectedRowIds([]);

    // 2. Perform backend stage advancement
    try {
      const res = await fetch("/api/production/stage-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serialNumbers,
          advanceQty: advanceQty ?? 1,
          advanceAll: advanceAll ?? false,
          operator: operator || "Operator",
          remarks: `Completed ${stage} stage`,
        }),
      });
      if (!res.ok) throw new Error("Failed to advance stage");
      const data = await res.json();
      if (data.skippedCount > 0) {
        toast.warning(`Advanced ${data.items.length} item(s). ${data.skippedCount} skipped.`);
      } else {
        toast.success(data.message || `Advanced ${data.items.length} item(s) from ${stage}!`);
      }
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Error completing stage");
      onRefresh();
    }
  };

  const handleBatchComplete = async () => {
    if (selectedRowIds.length === 0) return;

    const selectedRows = stageRows.filter((r) => selectedRowIds.includes(r.id));
    if (stage === "DGU") {
      const unready = selectedRows.filter((r) => !r.dguPairReady);
      if (unready.length > 0) {
        toast.error(
          `❌ Cannot advance: ${unready.length} selected pane(s) do not have their matching partner cut yet (1 Colour + 1 Clear required).`
        );
        return;
      }
    }

    const serialsToAdvance = Array.from(new Set(selectedRows.flatMap((r) => r.allSerials)));
    setSelectedRowIds([]);
    await completeStage(serialsToAdvance, undefined, true);
  };

  const handleSendAllDguToDispatch = async () => {
    const readyRows = displayedRows.filter((r) => r.dguPairReady);
    if (readyRows.length === 0) {
      toast.error(
        "❌ Cannot advance: No ready paired DGU units found (both Colour + Clear panels must be cut)."
      );
      return;
    }
    const serialsToAdvance = Array.from(new Set(readyRows.flatMap((r) => r.allSerials)));
    setSelectedRowIds([]);
    await completeStage(serialsToAdvance, undefined, true);
  };

  const handleSendAllToFinished = async () => {
    if (displayedRows.length === 0) {
      toast.error("❌ Cannot advance: No items found in the queue.");
      return;
    }
    const serialsToAdvance = Array.from(new Set(displayedRows.flatMap((r) => r.allSerials)));
    setSelectedRowIds([]);
    await completeStage(serialsToAdvance, undefined, true);
  };

  /* ─────────────────────────────────────────────────────────────────────────────
     PAIRING & BUFFER STAGE: CONSOLIDATED STICKER FORMAT WITH CUT & REMAINING TRACKING
     ───────────────────────────────────────────────────────────────────────────── */
  if (stage === "Pairing") {
    return (
      <PairingBufferView
        items={items}
        pis={pis}
        operator={operator}
        externalSearchTerm={externalSearchTerm}
        onRefresh={onRefresh}
        onReject={onReject}
        onRework={onRework}
        onPrintSticker={onPrintSticker}
      />
    );
  }

  /* ─────────────────────────────────────────────────────────────────────────────
     CUTTING STAGE: BATCH OVERVIEW VIEW (When no batch is selected)
     ───────────────────────────────────────────────────────────────────────────── */
  if (stage === "Cutting" && !selectedBatchId) {
    const totalCuttingPending = batchSummaries.reduce((a, b) => a + b.stageItemsCount, 0);
    const totalCuttingSqm = batchSummaries.reduce((a, b) => a + b.totalSqm, 0);

    return (
      <div className="space-y-4 animate-in fade-in duration-200">
        {/* ── Top Header Banner with Stage Stats ── */}
        <div className="bg-gradient-to-r from-purple-900 via-purple-800 to-indigo-900 rounded-2xl p-5 text-white shadow-lg flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 text-white flex items-center justify-center shadow-inner">
              <Scissors className="w-6 h-6 text-purple-200" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-black tracking-tight">Cutting Workstation — Batch Queues</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-500/30 text-purple-200 border border-purple-400/30">
                  Step 1 in Pipeline
                </span>
              </div>
              <p className="text-xs text-purple-200/90 font-medium mt-0.5 max-w-xl">
                Select any sticker batch below to enter the cutting floor, organize raw sheets, and execute auto-scan rules.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="bg-white/10 backdrop-blur-sm border border-white/15 px-3.5 py-2 rounded-xl text-center">
              <div className="text-[10px] text-purple-200 font-bold uppercase tracking-wider">Active Batches</div>
              <div className="text-lg font-black text-white">{batchSummaries.length}</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm border border-white/15 px-3.5 py-2 rounded-xl text-center">
              <div className="text-[10px] text-purple-200 font-bold uppercase tracking-wider">Pending Glass</div>
              <div className="text-lg font-black text-white">{totalCuttingPending} Items</div>
            </div>
            <div className="bg-purple-600/60 backdrop-blur-sm border border-purple-400/30 px-3.5 py-2 rounded-xl text-center">
              <div className="text-[10px] text-purple-200 font-bold uppercase tracking-wider">Total Area</div>
              <div className="text-lg font-black text-white">{totalCuttingSqm.toFixed(1)} m²</div>
            </div>
          </div>
        </div>

        {/* ── Filter Bar with FINISH Tabs (Clear / Colour / All) & Search ── */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            {/* DLGU vs DGU vs LAMINATION PROCESS QUEUE TABS */}
            <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setBatchCategoryFilter("ALL")}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                  batchCategoryFilter === "ALL"
                    ? "bg-white text-slate-900 shadow-xs ring-1 ring-slate-200"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                }`}
              >
                <span>All Queues</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    batchCategoryFilter === "ALL" ? "bg-slate-200 text-slate-800" : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {batchSummaries.length}
                </span>
              </button>

              {batchDlguCount > 0 && (
                <button
                  type="button"
                  onClick={() => setBatchCategoryFilter("DLGU")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                    batchCategoryFilter === "DLGU"
                      ? "bg-purple-600 text-white shadow-xs"
                      : "text-purple-800 hover:bg-purple-100/60"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>DLGU Queue</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                      batchCategoryFilter === "DLGU" ? "bg-white/20 text-white" : "bg-purple-200 text-purple-900"
                    }`}
                  >
                    {batchDlguCount}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setBatchCategoryFilter("DGU")}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                  batchCategoryFilter === "DGU"
                    ? "bg-teal-600 text-white shadow-xs"
                    : "text-teal-800 hover:bg-teal-100/60"
                }`}
              >
                <Boxes className="w-3.5 h-3.5" />
                <span>DGU Queue</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    batchCategoryFilter === "DGU" ? "bg-white/20 text-white" : "bg-teal-200 text-teal-900"
                  }`}
                >
                  {batchDguCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setBatchCategoryFilter("LAMINATION")}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                  batchCategoryFilter === "LAMINATION"
                    ? "bg-amber-600 text-white shadow-xs"
                    : "text-amber-800 hover:bg-amber-100/60"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Lamination Queue</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    batchCategoryFilter === "LAMINATION" ? "bg-white/20 text-white" : "bg-amber-200 text-amber-900"
                  }`}
                >
                  {batchLamCount}
                </span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative flex-1 max-w-md w-full">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <Input
                value={batchSearchTerm}
                onChange={(e) => setBatchSearchTerm(e.target.value)}
                placeholder="Search batch by SFO, Job Order, Customer, Project..."
                className="pl-9 h-9 bg-slate-50 border-slate-200 text-slate-900 text-xs rounded-xl focus:bg-white"
              />
              {batchSearchTerm && (
                <button
                  onClick={() => setBatchSearchTerm("")}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Export Batches Excel Button */}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  const exportData = filteredBatches.map((b, idx) => ({
                    "Sr No": idx + 1,
                    "Batch Number": formatBatchNumber(b.piNumber),
                    "Customer": b.customerName,
                    "Project": b.projectName,
                    "Job Order No": b.jobOrderNumber || "—",
                    "SFO No": b.sfoNo || "—",
                    "Finish": b.finish,
                    "Completed Items": b.completedCount,
                    "Total Items": b.totalItems,
                    "Total SQM": b.totalSqm.toFixed(2),
                    "Uploaded Date": formatPlatformDate(b.createdAt),
                    "Status": b.status,
                  }));
                  exportStageWipToExcel("Cutting", items, "Cutting_Batches_Summary");
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs h-9 px-3.5 gap-1.5 rounded-xl shadow-xs shrink-0"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Export Batches (.xlsx)</span>
              </Button>
            </div>
          </div>
        </div>

        {/* ── BATCH TABLE ── */}
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
          {filteredBatches.length > 0 ? (
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider bg-slate-50/80">
                    <th
                      className="py-3 px-3.5 cursor-pointer whitespace-nowrap"
                      onClick={() => handleBatchSort("piNumber")}
                    >
                      BATCH NO {renderSortIcon("piNumber")}
                    </th>
                    <th
                      className="py-3 px-3.5 cursor-pointer whitespace-nowrap"
                      onClick={() => handleBatchSort("customerName")}
                    >
                      CUSTOMER {renderSortIcon("customerName")}
                    </th>
                    <th
                      className="py-3 px-3.5 cursor-pointer whitespace-nowrap"
                      onClick={() => handleBatchSort("projectName")}
                    >
                      PROJECT / JOB ORDER {renderSortIcon("projectName")}
                    </th>
                    <th
                      className="py-3 px-3 cursor-pointer whitespace-nowrap text-center"
                      onClick={() => handleBatchSort("finish")}
                    >
                      FINISH {renderSortIcon("finish")}
                    </th>
                    <th
                      className="py-3 px-3 cursor-pointer text-center whitespace-nowrap"
                      onClick={() => handleBatchSort("completedCount")}
                    >
                      COMPLETED {renderSortIcon("completedCount")}
                    </th>
                    <th
                      className="py-3 px-3 cursor-pointer text-right whitespace-nowrap"
                      onClick={() => handleBatchSort("totalSqm")}
                    >
                      SQM {renderSortIcon("totalSqm")}
                    </th>
                    <th
                      className="py-3 px-3 cursor-pointer whitespace-nowrap"
                      onClick={() => handleBatchSort("createdAt")}
                    >
                      UPLOADED AT {renderSortIcon("createdAt")}
                    </th>
                    <th className="py-3 px-3 text-center whitespace-nowrap">
                      STATUS
                    </th>
                    <th className="py-3 px-3.5 text-right whitespace-nowrap">
                      ACTION
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBatches.map((b) => {
                    const isBatchCompleted =
                      (b.stageItemsCount === 0 && b.totalItems > 0) ||
                      (b.completedCount >= b.totalItems && b.totalItems > 0) ||
                      b.status === "Completed";

                    return (
                      <tr
                        key={b.id}
                        onClick={() => {
                          if (!isBatchCompleted) {
                            setSelectedBatchId(b.id);
                            setSelectedSheetRackNo("ALL");
                            setExpandedSheets({});
                          }
                        }}
                        className={`transition-colors ${
                          isBatchCompleted
                            ? "bg-slate-50/40 hover:bg-slate-50/70 cursor-default"
                            : "hover:bg-purple-50/40 cursor-pointer group"
                        }`}
                      >
                        <td className="py-3 px-3.5 font-bold font-mono text-purple-700">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{formatBatchNumber(b.piNumber)}</span>
                            {b.glassCategory === "DLGU" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-purple-100 text-purple-900 border border-purple-200 shadow-2xs">
                                <Sparkles className="w-3 h-3 text-purple-700" /> DLGU
                              </span>
                            ) : b.glassCategory === "DGU" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-teal-100 text-teal-800 border border-teal-200 shadow-2xs">
                                <Boxes className="w-3 h-3 text-teal-600" /> DGU
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-200 shadow-2xs">
                                <Layers className="w-3 h-3 text-amber-700" /> Lamination
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3.5 font-medium text-slate-800">
                          {b.customerName}
                        </td>
                        <td className="py-3 px-3.5 text-slate-600">
                          <span className="font-semibold text-slate-800">{b.projectName}</span>
                          {b.jobOrderNumber && (
                            <span className="text-[11px] text-purple-600 font-mono block">
                              JO: {b.jobOrderNumber}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                              b.finish === "Colour"
                                ? "bg-purple-100 text-purple-800 border-purple-200"
                                : "bg-cyan-100 text-cyan-800 border-cyan-200"
                            }`}
                          >
                            {b.finish === "Colour" ? "Colour" : "Clear"}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center font-mono">
                          <span className="font-bold text-emerald-700">{b.completedCount}</span>
                          <span className="text-slate-400 text-[10px]"> / {b.totalItems}</span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-800">
                          {b.totalSqm.toFixed(2)} m²
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap font-mono text-xs">
                          <div className="flex items-center gap-1.5 font-bold text-slate-800">
                            <Calendar className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                            {formatPlatformDate(b.createdAt || b.issueDate)}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium mt-0.5">
                            <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            {formatPlatformTime(b.createdAt)}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <StatusBadge status={isBatchCompleted ? "Completed" : "In Production"} />
                        </td>
                        <td className="py-3 px-3.5 text-right">
                          {isBatchCompleted ? (
                            <Button
                              size="sm"
                              disabled={true}
                              className="bg-slate-100 text-slate-400 border border-slate-200 text-xs font-bold gap-1 rounded-xl shadow-none h-7 px-3 cursor-not-allowed opacity-80"
                              title="All glass cut and completed for this batch"
                            >
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span>All Cut</span>
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedBatchId(b.id);
                                setSelectedSheetRackNo("ALL");
                                setExpandedSheets({});
                              }}
                              className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold gap-1 rounded-xl shadow-2xs h-7 px-3 group-hover:scale-105 transition-transform"
                            >
                              <span>Open Floor</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400">
              <Box className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-semibold">No batches found matching the filters.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ─────────────────────────────────────────────────────────────────────────────
     STANDARD WORKSTATION VIEW (Cutting Drill-down, DGU, Lamination, Finished)
     ───────────────────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* ── Cutting Batch Breadcrumb Header ── */}
      {stage === "Cutting" && selectedBatch && (
        <div className="bg-white border-2 border-purple-300 rounded-2xl p-3.5 shadow-xs flex items-center justify-between flex-wrap gap-3">
          {/* Left: Back button + Batch info */}
          <div className="flex items-center gap-3 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedBatchId(null);
                setSelectedSheetRackNo("ALL");
              }}
              className="border-purple-200 text-purple-700 hover:bg-purple-50 h-8 w-8 p-0 rounded-xl shrink-0"
              title="Back to All Batches"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="whitespace-nowrap">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-slate-900 text-sm">
                  Batch: {formatBatchNumber(selectedBatch.piNumber)}
                </span>
                {selectedBatch.glassCategory === "DLGU" ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-900 border border-purple-200 inline-flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-purple-700" /> DLGU Queue ➔ Pairing
                  </span>
                ) : selectedBatch.glassCategory === "DGU" ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-teal-100 text-teal-800 border border-teal-200 inline-flex items-center gap-1">
                    <Boxes className="w-3 h-3 text-teal-600" /> DGU Queue ➔ Pairing
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-200 inline-flex items-center gap-1">
                    <Layers className="w-3 h-3 text-amber-700" /> Lamination Queue ➔ Buffer
                  </span>
                )}
                <span
                  className={`px-2 py-0.2 rounded-full text-[10px] font-black border ${
                    selectedBatch.finish === "Colour"
                      ? "bg-purple-100 text-purple-800 border-purple-200"
                      : "bg-cyan-100 text-cyan-800 border-cyan-200"
                  }`}
                >
                  {selectedBatch.finish === "Colour" ? "Colour Finish" : "Clear Finish"}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium leading-tight mt-0.5">
                {selectedBatch.customerName} • {selectedBatch.projectName}
                {selectedBatch.jobOrderNumber ? ` • JO: ${selectedBatch.jobOrderNumber}` : ""}
              </p>
            </div>
          </div>

          {/* Center: Non-clickable Glass Stats Badges (Total Glass & Remaining Glass) */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-xl border border-slate-200/80 shrink-0">
            <div className="px-3 py-1.5 rounded-lg text-xs font-black bg-white text-slate-800 shadow-xs ring-1 ring-slate-200 flex items-center gap-1.5 cursor-default select-none">
              <span>Total Glass</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-slate-200 text-slate-800">
                {selectedBatch.totalItems || totalStagePieces}
              </span>
            </div>

            {rawClearCount > 0 && (
              <div className="px-3 py-1.5 rounded-lg text-xs font-black bg-cyan-100 text-cyan-900 border border-cyan-200 flex items-center gap-1.5 cursor-default select-none">
                <span>Clear Glass</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-cyan-200 text-cyan-900">
                  {rawClearCount}
                </span>
              </div>
            )}

            {rawColourCount > 0 && (
              <div className="px-3 py-1.5 rounded-lg text-xs font-black bg-purple-600 text-white shadow-xs flex items-center gap-1.5 cursor-default select-none">
                <span>Remaining Glass</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-white/20 text-white">
                  {rawColourCount}
                </span>
              </div>
            )}
          </div>

          {/* Right: Search Input */}
          <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-xs sm:max-w-md justify-end">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={`Search Cutting queue by Serial, Barcode, Size...`}
                className="pl-9 h-9 bg-slate-50 border-slate-200 text-slate-900 text-xs rounded-xl focus:bg-white"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Scan Verification Modal ── */}
      {scanRow && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                    <ScanLine className="w-4 h-4" />
                  </div>
                  <h3 className="font-extrabold text-slate-900 text-sm">
                    {stage === "DGU" ? "Scan Colour Glass Sticker (DGU Unit)" : `Scan to Confirm — ${stage} Stage`}
                  </h3>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 ml-10">
                  Scan barcode to advance to{" "}
                  <span className="font-bold text-emerald-700">
                    {getNextStageLabel(scanRow.item, stage)}
                  </span>
                </p>
              </div>
              <button
                onClick={() => setScanRow(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Process route progress */}
            <div className="flex items-center gap-1 flex-wrap">
              {scanRow.item.processRoute.map((s, idx) => {
                const isCurrent = s === stage;
                const isDone = scanRow.item.completedStages?.includes(s);
                return (
                  <React.Fragment key={s}>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-extrabold transition-all
                        ${STAGE_COLORS[s] || "bg-slate-100 text-slate-700"}
                        ${isCurrent ? "ring-2 ring-offset-1 ring-current scale-110" : ""}
                        ${isDone && !isCurrent ? "opacity-40 line-through" : ""}
                      `}
                    >
                      {s}
                    </span>
                    {idx < scanRow.item.processRoute.length - 1 && (
                      <ArrowRight className="w-3 h-3 text-slate-300 shrink-0" />
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Item details */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">
                  {stage === "DGU" ? "Colour Lite Serial (Primary)" : "Serial Number"}
                </span>
                <span className="font-mono font-bold text-blue-700">{scanRow.displaySerial}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">
                  {stage === "DGU" ? "Colour Lite Barcode" : "Barcode"}
                </span>
                <span className="font-mono font-bold text-slate-900">{scanRow.displayBarcode}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Dimensions</span>
                <span className="font-bold text-emerald-700">
                  {scanRow.item.width} × {scanRow.item.height} mm
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Glass Type / Description</span>
                <span className="font-semibold text-slate-800 text-right max-w-[200px] truncate">
                  {scanRow.item.glassType || scanRow.item.itemCode}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Remaining Quantity to Scan</span>
                <span className="font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-lg font-mono text-xs border border-purple-200">
                  {scanRow.item.qty || 1} {scanRow.item.qty === 1 ? "pc" : "pcs"} remaining
                </span>
              </div>

              {stage === "DGU" && scanRow.partnerItem && (
                <div className="border-t border-teal-200 pt-2 mt-2 bg-teal-50/70 -mx-3 -mb-3 p-3 rounded-b-xl space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-teal-900 font-bold flex items-center gap-1">
                      <Link2 className="w-3.5 h-3.5 text-teal-600" /> Paired Clear Inner Lite:
                    </span>
                    <span className="font-mono font-extrabold text-teal-800">
                      {scanRow.partnerItem.serialNumber}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-teal-700">
                    <span>Clear Barcode:</span>
                    <span className="font-mono">{scanRow.partnerItem.barcode}</span>
                  </div>
                  <div className="text-[10px] text-emerald-800 font-extrabold flex items-center gap-1 pt-0.5">
                    <Check className="w-3 h-3 text-emerald-600" /> Ready to assemble into 1 DGU Unit. Scanning Colour barcode advances both panes.
                  </div>
                </div>
              )}
            </div>

            {/* Warning / Instruction */}
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="text-[11px] text-blue-800 font-semibold">
                {(scanRow.item.qty || 1) > 1
                  ? `This line has ${scanRow.item.qty} pieces remaining. Each scan will advance 1 piece (${scanRow.item.qty} scans to finish line).`
                  : stage === "DGU"
                  ? "Scan the Colour Glass sticker barcode to confirm & advance this assembled DGU Unit."
                  : `Scan the barcode on the glass sticker to confirm this item is at the ${stage} workstation.`}
              </span>
            </div>

            {/* Scan input */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700">
                {stage === "DGU" ? "Scan Colour Glass Barcode" : "Scan or Enter Barcode / Serial"}
              </label>
              <div className="flex gap-2">
                <Input
                  ref={scanInputRef}
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleScanVerify()}
                  placeholder={stage === "DGU" ? `Scan Colour Barcode (${scanRow.displayBarcode})...` : "Scan barcode here..."}
                  className="font-mono text-sm border-slate-300 focus:border-emerald-500 focus:ring-emerald-500"
                  autoFocus
                />
                <Button
                  onClick={handleScanVerify}
                  disabled={!scanInput.trim()}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 shrink-0"
                >
                  <ScanLine className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-[10px] text-slate-400">Press Enter or click scan icon to verify and complete.</p>
            </div>

            {/* Quick Action Footer */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setScanRow(null)}
                className="text-xs font-bold text-slate-600"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={async () => {
                  const targetRow = scanRow;
                  setScanRow(null);
                  await completeStage(targetRow.allSerials, undefined, true);
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs gap-1.5 shadow-xs"
              >
                <Zap className="w-3.5 h-3.5" /> 1-Click Complete & Advance
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lamination Line Header ── */}
      {stage === "Lamination" && (
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-200 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3 text-xs shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center font-black text-sm shadow-2xs">
              🛡️
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-extrabold text-amber-950 text-sm">Lamination Workstation & Line</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                  Autoclave / Pre-Lam
                </span>
                {lamDirectCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                    {lamDirectCount} Direct Lamination Units (Next: Finished)
                  </span>
                )}
                {lamDlguCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-300">
                    {lamDlguCount} DLGU Sub-Assembly Units (Next: DGU Assembly)
                  </span>
                )}
              </div>
              <span className="text-amber-800 text-xs font-medium block mt-0.5">
                Two types of glass processed: Direct Laminated glass (advances directly to Finished) & DLGU laminated sub-assemblies (advances to DGU Assembly Line).
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="bg-amber-600 text-white px-3.5 py-1.5 rounded-xl text-center shadow-2xs">
              <div className="text-[10px] text-amber-100 font-bold uppercase">Total in Lamination</div>
              <div className="text-sm font-black">
                {totalStagePieces} {totalStagePieces === 1 ? "Unit" : "Units"}
              </div>
              <div className="text-[9.5px] text-amber-200 font-medium">({stageItems.length} Panes)</div>
            </div>
          </div>
        </div>
      )}

      {/* ── DGU Assembly Line Header ── */}
      {stage === "DGU" && (
        <div className="bg-gradient-to-r from-teal-500/10 via-teal-500/5 to-transparent border border-teal-200 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3 text-xs shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center font-black text-sm shadow-2xs">
              🪟
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-extrabold text-teal-950 text-sm">DGU / IGU Assembly Line</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-teal-100 text-teal-800 border border-teal-300">
                  Insulated Glass Assembly
                </span>
                {dguStandardCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-900 border border-teal-300">
                    {dguStandardCount} Standard DGU Units
                  </span>
                )}
                {dguDlguCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-300">
                    {dguDlguCount} DLGU Units (Laminated IGU)
                  </span>
                )}
              </div>
              <span className="text-teal-800 text-xs font-medium block mt-0.5">
                Two types of insulated glass: Standard DGU Units (Monolithic Colour + Clear Float) & DLGU Units (Outer Colour + Laminated Inner Sub-Assembly).
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="bg-teal-600 text-white px-3.5 py-1.5 rounded-xl text-center shadow-2xs">
              <div className="text-[10px] text-teal-100 font-bold uppercase">Total in DGU</div>
              <div className="text-sm font-black">
                {stageRows.length} {stageRows.length === 1 ? "Unit" : "Units"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Finished Items Warehouse Info Banner ── */}
      {stage === "Finished" && (
        <div className="bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-200 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3 text-xs shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black text-sm shadow-2xs">
              ✓
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-extrabold text-emerald-950 text-sm">Finished Items Warehouse Inventory</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                  Dispatch Ready
                </span>
                {finishedDlguCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-200">
                    {finishedDlguCount} DLGU Units
                  </span>
                )}
                {finishedDguCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
                    {finishedDguCount} DGU / IGU Units
                  </span>
                )}
                {finishedLamCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    {finishedLamCount} Laminated Units
                  </span>
                )}
                {finishedGenCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                    {finishedGenCount} General Glass
                  </span>
                )}
              </div>
              <span className="text-emerald-700 text-xs font-medium block mt-0.5">
                Completed glass ready for dispatch across all production lines (DLGU Units, DGU Units, Laminated Glass & General Glass).
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="bg-emerald-600 text-white px-3.5 py-1.5 rounded-xl text-center shadow-2xs">
              <div className="text-[10px] text-emerald-100 font-bold uppercase">Total Dispatch Ready</div>
              <div className="text-sm font-black">
                {stageRows.length} {stageRows.length === 1 ? "Unit" : "Units"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Unified Single-Line Header Controls: Finish Tabs + Search + Action Buttons (For Non-Cutting Workstations or General Stage View) ── */}
      {stage !== "Cutting" && (
        <div className="bg-white p-3 rounded-2xl border border-slate-200/90 shadow-xs flex items-center justify-between flex-wrap gap-3">
          {/* Left: Finish Filter Tabs */}
          <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-xl border border-slate-200/80 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => setFinishFilter("ALL")}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                finishFilter === "ALL"
                  ? "bg-white text-slate-900 shadow-xs ring-1 ring-slate-200"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
              }`}
            >
              <span>{stage === "DGU" ? "All DGU Queue" : stage === "Finished" ? "All Finished" : stage === "Lamination" ? "All Lamination Line" : "All Glass"}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                  finishFilter === "ALL" ? "bg-slate-200 text-slate-800" : "bg-slate-200/60 text-slate-600"
                }`}
              >
                {totalStagePieces}
              </span>
            </button>

            {stage === "Lamination" ? (
              <>
                {lamDirectCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setFinishFilter("DIRECT_LAM")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                      finishFilter === "DIRECT_LAM"
                        ? "bg-amber-600 text-white shadow-xs"
                        : "text-amber-800 hover:bg-amber-100/60"
                    }`}
                  >
                    <span>Direct Laminated Glass</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                        finishFilter === "DIRECT_LAM" ? "bg-white/20 text-white" : "bg-amber-200 text-amber-900"
                      }`}
                    >
                      {lamDirectCount}
                    </span>
                  </button>
                )}

                {lamDlguCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setFinishFilter("DLGU_LAM")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                      finishFilter === "DLGU_LAM"
                        ? "bg-purple-600 text-white shadow-xs"
                        : "text-purple-800 hover:bg-purple-100/60"
                    }`}
                  >
                    <span>DLGU Sub-Assembly</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                        finishFilter === "DLGU_LAM" ? "bg-white/20 text-white" : "bg-purple-200 text-purple-900"
                      }`}
                    >
                      {lamDlguCount}
                    </span>
                  </button>
                )}
              </>
            ) : stage === "DGU" ? (
              <>
                {dguStandardCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setFinishFilter("DGU")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                      finishFilter === "DGU"
                        ? "bg-teal-600 text-white shadow-xs"
                        : "text-teal-800 hover:bg-teal-100/60"
                    }`}
                  >
                    <span>Standard DGU Units</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                        finishFilter === "DGU" ? "bg-white/20 text-white" : "bg-teal-200 text-teal-900"
                      }`}
                    >
                      {dguStandardCount}
                    </span>
                  </button>
                )}

                {dguDlguCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setFinishFilter("DLGU")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                      finishFilter === "DLGU"
                        ? "bg-purple-600 text-white shadow-xs"
                        : "text-purple-800 hover:bg-purple-100/60"
                    }`}
                  >
                    <span>DLGU Units</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                        finishFilter === "DLGU" ? "bg-white/20 text-white" : "bg-purple-200 text-purple-900"
                      }`}
                    >
                      {dguDlguCount}
                    </span>
                  </button>
                )}

                {stageRows.some((r) => !r.isDguPair) && (
                  <button
                    type="button"
                    onClick={() => setFinishFilter("WAITING")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                      finishFilter === "WAITING"
                        ? "bg-amber-600 text-white shadow-xs"
                        : "text-amber-800 hover:bg-amber-100/60"
                    }`}
                  >
                    <span>⏳ Waiting Panes</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                        finishFilter === "WAITING" ? "bg-white/20 text-white" : "bg-amber-200 text-amber-900"
                      }`}
                    >
                      {stageRows.filter((r) => !r.isDguPair).length}
                    </span>
                  </button>
                )}
              </>
            ) : stage === "Finished" ? (
              <>
                {finishedDlguCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setFinishFilter("DLGU")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                      finishFilter === "DLGU"
                        ? "bg-purple-600 text-white shadow-xs"
                        : "text-purple-800 hover:bg-purple-100/60"
                    }`}
                  >
                    <span>DLGU Units</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                        finishFilter === "DLGU" ? "bg-white/20 text-white" : "bg-purple-200 text-purple-900"
                      }`}
                    >
                      {finishedDlguCount}
                    </span>
                  </button>
                )}

                {finishedDguCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setFinishFilter("DGU")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                      finishFilter === "DGU"
                        ? "bg-teal-600 text-white shadow-xs"
                        : "text-teal-800 hover:bg-teal-100/60"
                    }`}
                  >
                    <span>DGU / IGU Units</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                        finishFilter === "DGU" ? "bg-white/20 text-white" : "bg-teal-200 text-teal-900"
                      }`}
                    >
                      {finishedDguCount}
                    </span>
                  </button>
                )}

                {finishedLamCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setFinishFilter("LAMINATION")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                      finishFilter === "LAMINATION"
                        ? "bg-amber-600 text-white shadow-xs"
                        : "text-amber-800 hover:bg-amber-100/60"
                    }`}
                  >
                    <span>Laminated Glass</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                        finishFilter === "LAMINATION" ? "bg-white/20 text-white" : "bg-amber-200 text-amber-900"
                      }`}
                    >
                      {finishedLamCount}
                    </span>
                  </button>
                )}

                {finishedGenCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setFinishFilter("GENERAL")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                      finishFilter === "GENERAL"
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "text-indigo-800 hover:bg-indigo-100/60"
                    }`}
                  >
                    <span>General Glass</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                        finishFilter === "GENERAL" ? "bg-white/20 text-white" : "bg-indigo-200 text-indigo-900"
                      }`}
                    >
                      {finishedGenCount}
                    </span>
                  </button>
                )}
              </>
            ) : (
              <>
                {rawClearCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setFinishFilter("CLEAR")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                      finishFilter === "CLEAR"
                        ? "bg-cyan-600 text-white shadow-xs"
                        : "text-cyan-800 hover:bg-cyan-100/60"
                    }`}
                  >
                    <span>Clear Glass</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                        finishFilter === "CLEAR" ? "bg-white/20 text-white" : "bg-cyan-200 text-cyan-900"
                      }`}
                    >
                      {rawClearCount}
                    </span>
                  </button>
                )}

                {rawColourCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setFinishFilter("COLOUR")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                      finishFilter === "COLOUR"
                        ? "bg-purple-600 text-white shadow-xs"
                        : "text-purple-800 hover:bg-purple-100/60"
                    }`}
                  >
                    <span>Coloured Glass</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                        finishFilter === "COLOUR" ? "bg-white/20 text-white" : "bg-purple-200 text-purple-900"
                      }`}
                    >
                      {rawColourCount}
                    </span>
                  </button>
                )}
              </>
            )}
          </div>

          {/* Center & Right: Search Input + Export Excel Dropdown */}
          <div className="flex items-center gap-2 flex-1 min-w-[280px] max-w-xl justify-end">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={`Search ${stage} queue by Serial, Barcode, Size...`}
                className="pl-9 h-9 bg-slate-50 border-slate-200 text-slate-900 text-xs rounded-xl focus:bg-white"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* EXPORT EXCEL DROPDOWN BUTTON (Header Position) */}
            <div className="relative inline-block text-left shrink-0" ref={exportMenuRef}>
              <Button
                type="button"
                size="sm"
                onClick={() => setIsExportMenuOpen((prev) => !prev)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs h-9 px-3 gap-1.5 rounded-xl shadow-xs transition-all"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Export Excel</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${isExportMenuOpen ? "rotate-180" : ""}`} />
              </Button>

              {isExportMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-64 bg-white border-2 border-emerald-300 rounded-2xl shadow-2xl z-50 p-2 space-y-1 animate-in fade-in zoom-in-95">
                  <div className="px-2.5 py-1.5 text-[11px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    Export Excel Options ({stage})
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsExportMenuOpen(false);
                      const exportItems = displayedRows.map((r) => r.item);
                      exportStageWipToExcel(stage, exportItems, `${stage}_Stage_Queue`);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-800 hover:bg-emerald-50 hover:text-emerald-900 transition-colors flex items-center gap-2"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <div>Export Current Stage WIP ({displayedRows.length} Items)</div>
                      <div className="text-[10px] text-slate-400 font-normal">Active table queue & details</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      setIsExportMenuOpen(false);
                      try {
                        toast.info(`Fetching completed ${stage} stage logs...`);
                        const res = await fetch("/api/reports");
                        const data = await res.json();
                        exportStageHistoryToExcel(stage, data.history || [], items);
                      } catch {
                        toast.error("Failed to fetch stage completion history.");
                      }
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-800 hover:bg-blue-50 hover:text-blue-900 transition-colors flex items-center gap-2"
                  >
                    <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                    <div>
                      <div>Export Stage Completion Log</div>
                      <div className="text-[10px] text-slate-400 font-normal">Audit history of completed scans</div>
                    </div>
                  </button>

                  {selectedRowIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsExportMenuOpen(false);
                        const selectedRows = stageRows.filter((r) => selectedRowIds.includes(r.id));
                        exportSelectedItemsToExcel(stage, selectedRows.map((r) => r.item));
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-800 hover:bg-purple-50 hover:text-purple-900 transition-colors flex items-center gap-2"
                    >
                      <CheckSquare className="w-4 h-4 text-purple-600 shrink-0" />
                      <div>
                        <div>Export Selected Rows ({selectedRowIds.length})</div>
                        <div className="text-[10px] text-slate-400 font-normal">Only items checked in table</div>
                      </div>
                    </button>
                  )}

                  {stage === "Finished" && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsExportMenuOpen(false);
                        const targetItems = selectedRowIds.length > 0
                          ? stageRows.filter((r) => selectedRowIds.includes(r.id)).map((r) => r.item)
                          : displayedRows.map((r) => r.item);

                        const parentPI = pis.find((p) => p.id === targetItems[0]?.piId || p.piNumber === targetItems[0]?.piNumber);
                        exportPartialDispatchNoteToExcel(parentPI, targetItems);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-emerald-950 bg-emerald-50 hover:bg-emerald-100 transition-colors flex items-center gap-2 border border-emerald-200"
                    >
                      <Truck className="w-4 h-4 text-emerald-700 shrink-0" />
                      <div>
                        <div>Export Partial Delivery Note (.xlsx)</div>
                        <div className="text-[10px] text-emerald-700 font-medium">
                          {selectedRowIds.length > 0 ? `${selectedRowIds.length} items selected for shipment` : "Full warehouse delivery note"}
                        </div>
                      </div>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Sheet-Wise Navigation Header (Cutting stage) ── */}
      {stage === "Cutting" && (
        <div className="bg-white border-2 border-purple-200/90 rounded-2xl p-3.5 shadow-xs space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Custom Multi-Select & Drag-to-Select Sheet Dropdown */}
              <div className="relative inline-flex items-center" ref={sheetDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsSheetDropdownOpen((prev) => !prev)}
                  className="flex items-center justify-between gap-2.5 px-3.5 py-2 bg-gradient-to-r from-purple-50 via-indigo-50/60 to-purple-50 border-2 border-purple-300 hover:border-purple-500 text-purple-950 font-black text-xs rounded-xl shadow-xs focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer transition-all min-w-[290px] max-w-[420px] text-left"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-sm">📑</span>
                    <span className="truncate">
                      {isAllSheetsSelected
                        ? `All Glasses in Batch (${filteredRows.reduce((a, b) => a + (b.item.qty || 1), 0)} Pieces • ${filteredRows.reduce((a, b) => a + (b.effectiveSqm || 0), 0).toFixed(2)} m²)`
                        : isSingleSheet
                        ? `Raw Sheet ${singleSheetRackNo} — ${displayedRows.reduce((a, b) => a + (b.item.qty || 1), 0)} Pieces (${displayedRows.reduce((a, b) => a + (b.effectiveSqm || 0), 0).toFixed(2)} m²)`
                        : `Selected ${selectedSheetRackNos.length} Sheets (Sheets ${selectedSheetRackNos.join(", ")} • ${displayedRows.reduce((a, b) => a + (b.item.qty || 1), 0)} Pcs)`}
                    </span>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-purple-600 shrink-0 transition-transform duration-200 ${isSheetDropdownOpen ? "rotate-180" : ""}`} />
                </button>

                {/* Dropdown Popup Menu */}
                {isSheetDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1.5 w-[380px] sm:w-[460px] max-w-[94vw] bg-white border-2 border-purple-300 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-2 duration-150">
                    {/* Header with Drag Hint & Quick Presets */}
                    <div className="p-3 bg-gradient-to-r from-purple-50 via-indigo-50 to-purple-50 border-b border-purple-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-black text-xs text-purple-950">
                          <Layers className="w-3.5 h-3.5 text-purple-600" />
                          <span>Select Raw Sheets for Cutting</span>
                        </div>
                        <span className="text-[10px] font-bold text-purple-800 bg-purple-200/90 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <MousePointer className="w-3 h-3" /> Drag / Shift+Click to multi-select
                        </span>
                      </div>


                      {/* Direct Range Selector Inputs */}
                      <form onSubmit={handleApplyRangeInput} className="flex items-center gap-1.5 mt-2 bg-white/90 p-1.5 rounded-xl border border-purple-200 shadow-2xs flex-wrap">
                        <span className="text-[10px] font-bold text-slate-600">From Sheet:</span>
                        <input
                          type="number"
                          min="1"
                          max={sheetGroups.length || 100}
                          value={rangeFromInput}
                          onChange={(e) => setRangeFromInput(e.target.value)}
                          className="w-12 h-6 px-1 text-center text-xs font-black bg-purple-50 border border-purple-200 rounded-md text-purple-950 focus:outline-none focus:ring-1 focus:ring-purple-500"
                        />
                        <span className="text-[10px] font-bold text-slate-600">to</span>
                        <input
                          type="number"
                          min="1"
                          max={sheetGroups.length || 100}
                          value={rangeToInput}
                          onChange={(e) => setRangeToInput(e.target.value)}
                          className="w-12 h-6 px-1 text-center text-xs font-black bg-purple-50 border border-purple-200 rounded-md text-purple-950 focus:outline-none focus:ring-1 focus:ring-purple-500"
                        />
                        <button
                          type="submit"
                          className="h-6 px-2.5 text-[10.5px] font-extrabold bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors shadow-2xs ml-auto cursor-pointer"
                        >
                          Select Range
                        </button>
                      </form>
                    </div>

                    {/* Scrollable Sheet List (Interactive Click & Drag with Auto-scroll) */}
                    <div
                      ref={sheetScrollContainerRef}
                      className="max-h-[340px] overflow-y-auto p-1.5 space-y-1 select-none scroll-smooth"
                    >
                      {/* All Glasses Row */}
                      <div
                        onClick={handleSelectAllSheets}
                        className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-colors ${
                          isAllSheetsSelected
                            ? "bg-purple-600 text-white shadow-xs"
                            : "hover:bg-purple-50 text-slate-800"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-base">📑</span>
                          <div>
                            <div className="font-extrabold text-xs">All Glasses in Batch</div>
                            <div className={`text-[10px] ${isAllSheetsSelected ? "text-purple-100" : "text-slate-500"}`}>
                              All {sheetGroups.length} raw sheets combined
                            </div>
                          </div>
                        </div>
                        <div className="text-right font-mono text-xs">
                          <div className="font-extrabold">{filteredRows.reduce((a, b) => a + (b.item.qty || 1), 0)} Pieces</div>
                          <div className={`text-[10px] ${isAllSheetsSelected ? "text-purple-200" : "text-slate-500"}`}>
                            {filteredRows.reduce((a, b) => a + (b.effectiveSqm || 0), 0).toFixed(2)} m²
                          </div>
                        </div>
                      </div>

                      {/* Individual Sheet Items */}
                      {sheetGroups.map((g, index) => {
                        const isSelected = !isAllSheetsSelected && selectedSheetRackNos.includes(g.rackNo);
                        const piecesCount = g.rows.reduce((a, b) => a + (b.item.qty || 1), 0);
                        return (
                          <div
                            key={g.rackNo}
                            data-sheet-index={index}
                            onMouseDown={(e) => handleSheetMouseDown(index, g.rackNo, e)}
                            onMouseEnter={() => handleSheetMouseEnter(index)}
                            className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-all border ${
                              isSelected
                                ? "bg-purple-600 text-white border-purple-700 shadow-xs scale-[1.005]"
                                : isAllSheetsSelected
                                ? "bg-slate-50/70 border-slate-100 text-slate-700 hover:bg-purple-50"
                                : "hover:bg-purple-50 text-slate-800 border-transparent"
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <GripVertical className={`w-3.5 h-3.5 shrink-0 ${isSelected ? "text-purple-200" : "text-slate-300"}`} />
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleSheet(g.rackNo);
                                }}
                                className="cursor-pointer"
                              >
                                {isSelected ? (
                                  <CheckSquare className="w-4 h-4 text-white" />
                                ) : (
                                  <Square className="w-4 h-4 text-slate-400" />
                                )}
                              </div>
                              <div className="font-extrabold text-xs truncate">
                                Raw Sheet {g.rackNo}
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0 text-right font-mono text-xs">
                              <div>
                                <div className="font-bold">{piecesCount} {piecesCount === 1 ? "Piece" : "Pieces"}</div>
                                <div className={`text-[10px] ${isSelected ? "text-purple-200" : "text-slate-400"}`}>
                                  {g.totalSqm.toFixed(2)} m²
                                </div>
                              </div>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                isSelected ? "bg-white/20 text-white" : "bg-purple-100 text-purple-800"
                              }`}>
                                {g.finish === "Colour" ? "Colour" : "Clear"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Footer Summary & Done Button */}
                    <div className="p-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                      <div className="text-[11px] font-extrabold text-slate-700 font-mono">
                        {isAllSheetsSelected
                          ? `All ${sheetGroups.length} Sheets (${filteredRows.reduce((a, b) => a + (b.item.qty || 1), 0)} Pieces)`
                          : `${selectedSheetRackNos.length} of ${sheetGroups.length} Sheets Selected (${displayedRows.reduce((a, b) => a + (b.item.qty || 1), 0)} Pieces)`}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setIsSheetDropdownOpen(false)}
                        className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold h-7 px-3 rounded-lg shadow-2xs"
                      >
                        Apply / Close
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Prev / Next Sheet Navigation Buttons */}
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={goToPrevSheet}
                  disabled={isAllSheetsSelected && currentSheetIndex <= 0}
                  className="h-8 px-2.5 text-xs font-bold gap-1 rounded-xl border-purple-200 text-purple-700 hover:bg-purple-50 disabled:opacity-40"
                  title="Previous Sheet"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Prev
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={goToNextSheet}
                  disabled={currentSheetIndex >= sheetGroups.length - 1}
                  className="h-8 px-2.5 text-xs font-bold gap-1 rounded-xl border-purple-200 text-purple-700 hover:bg-purple-50 disabled:opacity-40"
                  title="Next Sheet"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* Sheet Index Indicator & Export Excel Dropdown in Top Bar */}
            <div className="flex items-center gap-2.5">
              <div className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-900 border border-purple-200 text-[11px] font-black font-mono">
                {isAllSheetsSelected
                  ? `All ${sheetGroups.length} Sheets`
                  : isSingleSheet
                  ? `Sheet ${currentSheetIndex + 1} of ${sheetGroups.length}`
                  : `${selectedSheetRackNos.length} of ${sheetGroups.length} Sheets`}
              </div>

              {/* EXPORT EXCEL DROPDOWN BUTTON IN TOP BAR */}
              <div className="relative inline-block text-left" ref={exportMenuRef}>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setIsExportMenuOpen((prev) => !prev)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs h-8 px-3 gap-1.5 rounded-xl shadow-xs transition-all"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Export Excel</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${isExportMenuOpen ? "rotate-180" : ""}`} />
                </Button>

                {isExportMenuOpen && (
                  <div className="absolute right-0 mt-1.5 w-64 bg-white border-2 border-emerald-300 rounded-2xl shadow-2xl z-50 p-2 space-y-1 animate-in fade-in zoom-in-95">
                    <div className="px-2.5 py-1.5 text-[11px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
                      Export Excel Options ({stage})
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setIsExportMenuOpen(false);
                        const exportItems = displayedRows.map((r) => r.item);
                        exportStageWipToExcel(stage, exportItems, `${stage}_Stage_Queue`);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-800 hover:bg-emerald-50 hover:text-emerald-900 transition-colors flex items-center gap-2"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div>
                        <div>Export Current Stage WIP ({displayedRows.length} Items)</div>
                        <div className="text-[10px] text-slate-400 font-normal">Active table queue & details</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        setIsExportMenuOpen(false);
                        try {
                          toast.info(`Fetching completed ${stage} stage logs...`);
                          const res = await fetch("/api/reports");
                          const data = await res.json();
                          exportStageHistoryToExcel(stage, data.history || [], items);
                        } catch {
                          toast.error("Failed to fetch stage completion history.");
                        }
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-800 hover:bg-blue-50 hover:text-blue-900 transition-colors flex items-center gap-2"
                    >
                      <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                      <div>
                        <div>Export Stage Completion Log</div>
                        <div className="text-[10px] text-slate-400 font-normal">Audit history of completed scans</div>
                      </div>
                    </button>

                    {selectedRowIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsExportMenuOpen(false);
                          const selectedRows = stageRows.filter((r) => selectedRowIds.includes(r.id));
                          exportSelectedItemsToExcel(stage, selectedRows.map((r) => r.item));
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-800 hover:bg-purple-50 hover:text-purple-900 transition-colors flex items-center gap-2"
                      >
                        <CheckSquare className="w-4 h-4 text-purple-600 shrink-0" />
                        <div>
                          <div>Export Selected Rows ({selectedRowIds.length})</div>
                          <div className="text-[10px] text-slate-400 font-normal">Only items checked in table</div>
                        </div>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Glass Items / DGU Units Table View ── */}
      <div className="border-2 border-slate-200/90 rounded-2xl bg-white shadow-xs overflow-hidden">
        {/* Table Summary Sub-bar */}
        <div className="p-3 bg-gradient-to-r from-slate-50 via-teal-50/20 to-blue-50/30 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-2.5 flex-wrap">
            {stage === "Cutting" && (
              <label className="flex items-center gap-2 cursor-pointer bg-white px-2.5 py-1.5 rounded-xl border-2 border-purple-300 shadow-2xs hover:bg-purple-50 transition-colors mr-1">
                <input
                  type="checkbox"
                  checked={selectedRowIds.length === displayedRows.length && displayedRows.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                />
                <span className="text-xs font-black text-purple-950 select-none">
                  Select All Sheets ({displayedSheetGroups.length})
                </span>
              </label>
            )}

            {stage === "Lamination" ? (
              <span className="font-black text-slate-900">
                Lamination Queue ({displayedRows.length} {displayedRows.length === 1 ? "Unit" : "Units"})
              </span>
            ) : stage === "DGU" ? (
              <span className="font-black text-slate-900">
                All DGU Units in Queue ({displayedRows.length} {displayedRows.length === 1 ? "Unit" : "Units"})
              </span>
            ) : stage === "Finished" ? (
              <span className="font-black text-slate-900">
                Finished Products in Warehouse ({displayedRows.length} {displayedRows.length === 1 ? "Unit" : "Units"})
              </span>
            ) : null}

            {stage === "Lamination" ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black border bg-amber-100 text-amber-900 border-amber-300">
                {displayedRows.length} {displayedRows.length === 1 ? "Laminated Unit" : "Laminated Units"} ({lamDirectCount} Direct / {lamDlguCount} DLGU)
              </span>
            ) : stage === "DGU" ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black border bg-teal-100 text-teal-900 border-teal-300">
                {displayedRows.length} DGU Units ({dguStandardCount} Standard DGU / {dguDlguCount} DLGU)
                {(dguStats?.totalWaiting ?? 0) > 0 && ` / ${dguStats?.totalWaiting} Waiting`}
              </span>
            ) : stage === "Finished" ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black border bg-emerald-100 text-emerald-900 border-emerald-300">
                {displayedRows.length} {displayedRows.length === 1 ? "Finished Unit" : "Finished Units"}
              </span>
            ) : (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                  finishFilter === "COLOUR" || (rawClearCount === 0 && rawColourCount > 0) || (currentGroup && currentGroup.finish === "Colour")
                    ? "bg-purple-100 text-purple-800 border-purple-200"
                    : "bg-cyan-100 text-cyan-800 border-cyan-200"
                }`}
              >
                {currentGroup
                  ? currentGroup.finish === "Colour"
                    ? "Coloured Glass"
                    : "Clear Glass"
                  : finishFilter === "COLOUR" || (rawClearCount === 0 && rawColourCount > 0)
                  ? `${rawColourCount} Coloured`
                  : finishFilter === "CLEAR" || (rawColourCount === 0 && rawClearCount > 0)
                  ? `${rawClearCount} Clear`
                  : `${rawClearCount} Clear / ${rawColourCount} Coloured`}
              </span>
            )}

            <span className="text-slate-500 font-medium">
              Total Area:{" "}
              <strong className="text-emerald-700 font-mono font-black">
                {displayedRows.reduce((a, b) => a + (b.effectiveSqm || 0), 0).toFixed(2)} m²
              </strong>
            </span>

            {stage === "Cutting" && displayedSheetGroups.length > 1 && (
              <div className="flex items-center gap-1.5 ml-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={expandAllSheets}
                  className="h-6 px-2 text-[10px] font-extrabold border-purple-200 text-purple-700 hover:bg-purple-50 rounded-lg shadow-2xs"
                >
                  Expand All
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={collapseAllSheets}
                  className="h-6 px-2 text-[10px] font-extrabold border-slate-200 text-slate-600 hover:bg-slate-100 rounded-lg shadow-2xs"
                >
                  Collapse All
                </Button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {stage === "Cutting" && selectedRowIds.length > 0 && (
              <Button
                size="sm"
                onClick={handleBatchComplete}
                disabled={loading}
                className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-extrabold text-xs h-7 px-3 gap-1.5 rounded-xl shadow-xs animate-in fade-in"
              >
                <CheckCircle className="w-3.5 h-3.5" /> Cut & Advance Selected ({displayedRows.filter((r) => selectedRowIds.includes(r.id)).reduce((a, b) => a + (b.item.qty || 1), 0)} pcs)
              </Button>
            )}

            {stage === "DGU" && (
              selectedRowIds.length > 0 ? (
                <Button
                  size="sm"
                  onClick={handleBatchComplete}
                  disabled={
                    loading ||
                    stageRows
                      .filter((r) => selectedRowIds.includes(r.id))
                      .filter((r) => r.dguPairReady).length === 0
                  }
                  className={`font-black text-xs h-7 px-3 gap-1.5 rounded-xl shadow-xs animate-in fade-in ${
                    stageRows
                      .filter((r) => selectedRowIds.includes(r.id))
                      .filter((r) => r.dguPairReady).length === 0
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                  }`}
                  title={
                    stageRows
                      .filter((r) => selectedRowIds.includes(r.id))
                      .filter((r) => r.dguPairReady).length === 0
                      ? "Cannot dispatch: none of the selected panes have matching Clear glass cut yet"
                      : "Send ready paired DGU units to Dispatch"
                  }
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>
                    Send Selected to Dispatch (
                    {
                      stageRows
                        .filter((r) => selectedRowIds.includes(r.id))
                        .filter((r) => r.dguPairReady).length
                    } Paired)
                  </span>
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleSendAllDguToDispatch}
                  disabled={loading || displayedRows.filter((r) => r.dguPairReady).length === 0}
                  className={`font-black text-xs h-7 px-3 gap-1.5 rounded-xl shadow-xs ${
                    displayedRows.filter((r) => r.dguPairReady).length === 0
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                  }`}
                  title="Send all ready paired DGU units to Dispatch"
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>Send All to Dispatch ({displayedRows.filter((r) => r.dguPairReady).length} Paired)</span>
                </Button>
              )
            )}

            {stage === "Lamination" && (
              selectedRowIds.length > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleBatchComplete}
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-black text-xs h-7 px-3 gap-1.5 rounded-xl shadow-xs animate-in fade-in transition-all"
                  title="Send selected items in Lamination queue to Finished"
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>
                    Send Selected to Finished ({stageRows.filter((r) => selectedRowIds.includes(r.id)).length})
                  </span>
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSendAllToFinished}
                  disabled={loading || displayedRows.length === 0}
                  className={`font-black text-xs h-7 px-3 gap-1.5 rounded-xl shadow-xs transition-all ${
                    displayedRows.length === 0
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                  }`}
                  title="Send all items in Lamination queue to Finished"
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>Send All in Finished ({displayedRows.length})</span>
                </Button>
              )
            )}





            <div className="text-[11px] text-slate-500 font-mono">
              {stage === "Cutting" && currentGroup ? (
                <>
                  SFO: <strong className="text-purple-700">{currentGroup.sfoList.join(", ")}</strong>
                  {currentGroup.obList.length > 0 && <span className="ml-1.5">(OB: {currentGroup.obList.join(", ")})</span>}
                </>
              ) : stage === "Cutting" && selectedBatch ? (
                <>
                  SFO:{" "}
                  <strong className="text-purple-700">
                    {selectedBatch.sfoNo || selectedBatch.jobOrderNumber || "Batch"}
                  </strong>
                  {selectedBatch.jobOrderNumber && (
                    <span className="ml-1.5">(JO: {selectedBatch.jobOrderNumber})</span>
                  )}
                </>
              ) : stage === "DGU" ? (
                <>
                  Total in DGU Queue:{" "}
                  <strong className="text-teal-700 font-bold">
                    {stageRows.length} {stageRows.length === 1 ? "DGU Unit" : "DGU Units"}
                  </strong>
                </>
              ) : stage === "Lamination" ? (
                <>
                  Total in Lamination Queue:{" "}
                  <strong className="text-amber-700 font-bold">
                    {stageRows.length} {stageRows.length === 1 ? "Laminated Unit" : "Laminated Units"} ({stageItems.length} Panes)
                  </strong>
                </>
              ) : stage === "Finished" ? (
                <>
                  Total in Finished Queue:{" "}
                  <strong className="text-emerald-700 font-bold">
                    {stageRows.length} {stageRows.length === 1 ? "Finished Unit" : "Finished Units"}
                  </strong>
                </>
              ) : (
                <>
                  Total In Stage Queue: <strong className="text-purple-700 font-bold">{stageItems.length} Stickers</strong>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Table of Glass Items / DGU Units ── */}
        {stage === "Cutting" ? (
          /* Cutting Workstation: Sheet-Grouped View (Each Sheet shown ONE time, Click Sheet to view all data) */
          <div className="space-y-3 p-3 bg-slate-50/50">
            {displayedSheetGroups.length === 0 ? (
              <div className="text-center py-10 text-slate-400">
                No raw sheets found in this cutting queue.
              </div>
            ) : (
              displayedSheetGroups.map((group) => {
                const isExpanded = isSingleSheet || !!expandedSheets[group.rackNo];
                const allGroupRowIds = group.rows.map((r) => r.id);
                const isGroupAllSelected = allGroupRowIds.every((id) => selectedRowIds.includes(id));
                const isGroupSomeSelected = !isGroupAllSelected && allGroupRowIds.some((id) => selectedRowIds.includes(id));
                const totalPieces = group.rows.reduce((a, b) => a + (b.item.qty || 1), 0);

                return (
                  <div
                    key={group.rackNo}
                    className="border-2 border-purple-200/90 rounded-2xl bg-white shadow-xs overflow-hidden transition-all"
                  >
                    {/* Sheet Header Row (Displays Sheet ONE time only) */}
                    <div
                      onClick={() => toggleSheetExpand(group.rackNo)}
                      className={`p-3 sm:p-3.5 flex items-center justify-between flex-wrap gap-3 cursor-pointer transition-colors select-none ${
                        isExpanded
                          ? "bg-gradient-to-r from-purple-50 via-indigo-50/40 to-purple-50 border-b border-purple-200"
                          : "hover:bg-purple-50/50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Checkbox for entire sheet (Only shown when collapsed) */}
                        {!isExpanded && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isGroupAllSelected) {
                                setSelectedRowIds((prev) => prev.filter((id) => !allGroupRowIds.includes(id)));
                              } else {
                                setSelectedRowIds((prev) => Array.from(new Set([...prev, ...allGroupRowIds])));
                              }
                            }}
                            className="cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={isGroupAllSelected}
                              onChange={() => {}}
                              className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                            />
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center font-black text-xs shadow-2xs">
                            {group.rackNo}
                          </div>
                          <div>
                            <div className="font-extrabold text-sm text-slate-900 flex items-center gap-2 flex-wrap">
                              <span>Raw Sheet {group.rackNo}</span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                                {totalPieces} {totalPieces === 1 ? "Piece" : "Pieces"} • {group.totalSqm.toFixed(2)} m²
                              </span>
                              <span
                                className={`text-[9.5px] font-black px-1.5 py-0.2 rounded border ${
                                  group.finish === "Colour"
                                    ? "bg-purple-100 text-purple-800 border-purple-200"
                                    : "bg-cyan-100 text-cyan-800 border-cyan-200"
                                }`}
                              >
                                {group.finish === "Colour" ? "Colour" : "Clear"}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center gap-2 flex-wrap">
                              <span>SFO: <strong className="text-purple-700">{group.sfoList.join(", ")}</strong></span>
                              {group.obList.length > 0 && <span>(OB: {group.obList.join(", ")})</span>}
                              <span className="text-slate-300">•</span>
                              <span className="truncate max-w-[280px] sm:max-w-md text-slate-700 font-sans font-medium">
                                {group.items[0]?.glassType || "Standard Float"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right Action & Expand Trigger */}
                      <div className="flex items-center gap-2.5 ml-auto">
                        <Button
                          type="button"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAdvanceSheet(group.rows);
                          }}
                          className="h-8 text-xs font-black bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl shadow-xs gap-1.5 cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-purple-200" />
                          <span>Cut & Advance Sheet {group.rackNo} ({totalPieces} pcs)</span>
                        </Button>

                        <div className="flex items-center gap-1 text-xs font-bold text-purple-700 bg-white border border-purple-200 px-2.5 py-1.5 rounded-xl shadow-2xs">
                          <span>{isExpanded ? "Hide Data" : `Show All Data (${totalPieces})`}</span>
                          <ChevronDown className={`w-4 h-4 text-purple-600 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                        </div>
                      </div>
                    </div>

                    {/* Expanded Data Table (Shows all panels for this sheet) */}
                    {isExpanded && (
                      <div className="overflow-x-auto w-full border-t border-slate-100 bg-white">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/70">
                              <th className="py-2.5 px-3 w-8 text-center">
                                <input
                                  type="checkbox"
                                  checked={isGroupAllSelected}
                                  onChange={() => {
                                    if (isGroupAllSelected) {
                                      setSelectedRowIds((prev) => prev.filter((id) => !allGroupRowIds.includes(id)));
                                    } else {
                                      setSelectedRowIds((prev) => Array.from(new Set([...prev, ...allGroupRowIds])));
                                    }
                                  }}
                                  className="w-3.5 h-3.5 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                />
                              </th>
                              <th className="py-2.5 px-2">Sticker Serial</th>
                              <th className="py-2.5 px-2">Barcode</th>
                              <th className="py-2.5 px-2 text-center">QTY</th>
                              <th className="py-2.5 px-2 text-right">SQM</th>
                              <th className="py-2.5 px-2">Size (W × H)</th>
                              <th className="py-2.5 px-2">Glass Type / Description</th>
                              <th className="py-2.5 px-2">Finish</th>
                              <th className="py-2.5 px-2">Route Flow</th>
                              <th className="py-2.5 px-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {group.rows.map((row) => {
                              const isSelected = selectedRowIds.includes(row.id);
                              const item = row.item;
                              const itemFinish = getItemFinish(item);

                              return (
                                <tr
                                  key={row.id}
                                  className={`hover:bg-purple-50/40 transition-colors ${
                                    isSelected ? "bg-purple-50/70" : ""
                                  }`}
                                >
                                  <td className="py-2.5 px-3 text-center align-middle">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleSelect(row.id)}
                                      className="w-3.5 h-3.5 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                    />
                                  </td>
                                  <td className="py-2.5 px-2 font-mono font-bold align-middle">
                                    <span className="text-purple-700">{row.displaySerial}</span>
                                  </td>
                                  <td className="py-2.5 px-2 font-mono text-slate-600 align-middle text-[11px]">
                                    {row.displayBarcode}
                                  </td>
                                  <td className="py-2.5 px-2 text-center align-middle whitespace-nowrap">
                                    <span className="px-2 py-0.5 rounded-lg font-mono font-black text-xs bg-slate-100 text-slate-900 border border-slate-200 shadow-2xs">
                                      {item.qty || 1} {item.qty === 1 ? "pc" : "pcs"}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-2 text-right font-mono font-bold text-emerald-700 align-middle whitespace-nowrap text-xs">
                                    {(row.effectiveSqm || item.sqm || 0).toFixed(2)} m²
                                  </td>
                                  <td className="py-2.5 px-2 font-bold text-slate-900 align-middle whitespace-nowrap">
                                    {item.width} × {item.height} mm
                                  </td>
                                  <td className="py-2.5 px-2 text-slate-700 font-medium align-middle max-w-[240px]">
                                    <div className="truncate font-bold text-slate-900">{item.glassType || item.itemCode}</div>
                                  </td>
                                  <td className="py-2.5 px-2 align-middle whitespace-nowrap">
                                    <div className="flex items-center gap-1">
                                      {isLaminatedGlass(item) ? (
                                        <span className="px-1.5 py-0.2 rounded text-[9.5px] font-black border bg-amber-100 text-amber-900 border-amber-200 inline-flex items-center gap-0.5">
                                          <Layers className="w-2.5 h-2.5" /> LAM
                                        </span>
                                      ) : (
                                        <span className="px-1.5 py-0.2 rounded text-[9.5px] font-black border bg-teal-100 text-teal-800 border-teal-200 inline-flex items-center gap-0.5">
                                          <Boxes className="w-2.5 h-2.5" /> DGU
                                        </span>
                                      )}
                                      <span
                                        className={`px-1.5 py-0.2 rounded text-[9.5px] font-black border ${
                                          itemFinish === "Colour"
                                            ? "bg-purple-100 text-purple-800 border-purple-200"
                                            : "bg-cyan-100 text-cyan-800 border-cyan-200"
                                        }`}
                                      >
                                        {itemFinish === "Colour" ? "Colour" : "Clear"}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-2 align-middle whitespace-nowrap">
                                    <div className="flex items-center gap-1">
                                      {item.processRoute.map((s, sIdx) => {
                                        const isCurrent = s === item.currentStage;
                                        const isDone = item.completedStages?.includes(s);
                                        return (
                                          <React.Fragment key={s}>
                                            <span
                                              className={`px-1.5 py-0.2 rounded font-mono text-[9px] font-bold ${
                                                isCurrent
                                                  ? "bg-teal-600 text-white"
                                                  : isDone
                                                  ? "bg-emerald-100 text-emerald-700"
                                                  : "bg-slate-100 text-slate-400"
                                              }`}
                                            >
                                              {s}
                                            </span>
                                            {sIdx < item.processRoute.length - 1 && (
                                              <ArrowRight className="w-2.5 h-2.5 text-slate-300 shrink-0" />
                                            )}
                                          </React.Fragment>
                                        );
                                      })}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 text-right align-middle whitespace-nowrap">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <Button
                                        type="button"
                                        size="sm"
                                        onClick={() => completeStage(row.allSerials)}
                                        className="h-7 px-2.5 text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white gap-1 rounded-lg"
                                      >
                                        <Play className="w-3 h-3 fill-current" /> Scan
                                      </Button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onPrintSticker(item);
                                        }}
                                        className="w-7 h-7 rounded-full border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400 flex items-center justify-center transition-all shadow-2xs shrink-0 cursor-pointer"
                                        title="Print Barcode / QR Sticker"
                                      >
                                        <Tag className="w-3.5 h-3.5 text-slate-700" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onReject(item);
                                        }}
                                        className="w-7 h-7 rounded-full border border-red-300 bg-white text-red-600 hover:bg-red-50 hover:border-red-400 flex items-center justify-center transition-all shadow-2xs shrink-0 cursor-pointer"
                                        title="Reject Item / Report Defect"
                                      >
                                        <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onRework(item);
                                        }}
                                        className="w-7 h-7 rounded-full border border-amber-300 bg-white text-amber-600 hover:bg-amber-50 hover:border-amber-400 flex items-center justify-center transition-all shadow-2xs shrink-0 cursor-pointer"
                                        title="Send Item to Rework"
                                      >
                                        <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                                      </button>
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
        ) : (
          /* Regular Table for DGU / Pairing / Finished Stage */
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/60">
                  {stage !== "Finished" && (
                    <th className="py-2.5 px-3 w-8 text-center">
                      <input
                        type="checkbox"
                        checked={
                          stage === "DGU"
                            ? displayedRows.filter((r) => r.dguPairReady).length > 0 &&
                              displayedRows.filter((r) => r.dguPairReady).every((r) => selectedRowIds.includes(r.id))
                            : selectedRowIds.length === displayedRows.length && displayedRows.length > 0
                        }
                        disabled={stage === "DGU" && displayedRows.filter((r) => r.dguPairReady).length === 0}
                        onChange={toggleSelectAll}
                        className="w-3.5 h-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      />
                    </th>
                  )}
                  <th className="py-2.5 px-2">
                    {stage === "DGU" ? "Outer Panel Serial" : stage === "Finished" ? "Unit / Sticker Serial" : "Sticker Serial"}
                  </th>
                  <th className="py-2.5 px-2">
                    {stage === "DGU" ? "Outer Panel Barcode" : "Barcode"}
                  </th>
                  <th className="py-2.5 px-2 text-center">{stage === "DGU" ? "QTY (Units)" : stage === "Finished" ? "QTY (Units/Pcs)" : "QTY"}</th>
                  <th className="py-2.5 px-2 text-right">SQM</th>
                  <th className="py-2.5 px-2">Size (W × H)</th>
                  <th className="py-2.5 px-2">{stage === "DGU" ? "Outer Panel Glass Spec" : "Glass Type / Specification"}</th>
                  <th className="py-2.5 px-2">{stage === "Finished" ? "Product Type & Finish" : "Finish"}</th>
                  <th className="py-2.5 px-2">Route Flow</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedRows.length === 0 ? (
                  <tr>
                    <td colSpan={stage === "Finished" ? 9 : 10} className="text-center py-12 text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-2 max-w-md mx-auto">
                        <span className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-200 text-teal-600 flex items-center justify-center font-bold text-lg">
                          🪟
                        </span>
                        <div className="font-extrabold text-slate-800 text-sm">
                          {stage === "DGU" ? "No DGU Units in Queue" : "No items found in this view"}
                        </div>
                        <p className="text-xs text-slate-500">
                          {stage === "DGU"
                            ? "After cutting, Clear glass waits in the Glass Pairing & Buffer. When Colour glass is cut, both panes come together for pairing and then advance here to the DGU Assembly Line."
                            : "No records match the selected filter or search criteria."}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  displayedRows.map((row) => {
                    const isSelected = selectedRowIds.includes(row.id);
                    const item = row.item;
                    const partner = row.partnerItem;
                    const itemFinish = getItemFinish(item);

                    return (
                      <tr
                        key={row.id}
                        className={`hover:bg-teal-50/30 transition-colors ${
                          isSelected ? "bg-teal-50/60" : ""
                        }`}
                      >
                        {stage !== "Finished" && (
                          <td className="py-2.5 px-3 text-center align-middle">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={stage === "DGU" && !row.dguPairReady}
                              onChange={() => toggleSelect(row.id)}
                              className={`w-3.5 h-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500 ${
                                stage === "DGU" && !row.dguPairReady
                                  ? "opacity-30 cursor-not-allowed"
                                  : "cursor-pointer"
                              }`}
                              title={
                                stage === "DGU" && !row.dguPairReady
                                  ? "Cannot select: matching Clear glass has not been cut yet"
                                  : "Select row"
                              }
                            />
                          </td>
                        )}

                        {/* Sticker Serial */}
                        <td className="py-2.5 px-2 font-mono font-bold align-middle">
                          <span className="text-purple-700">
                            {row.displaySerial}
                          </span>
                          {stage === "Lamination" && (
                            isDlguGlass(item) || (item as any).glassCategory === "DLGU" ? (
                              <span className="text-[9.5px] text-purple-700 font-extrabold block whitespace-nowrap">
                                DLGU Sub-Assembly
                              </span>
                            ) : (
                              <span className="text-[9.5px] text-amber-700 font-extrabold block whitespace-nowrap">
                                Direct Lamination
                              </span>
                            )
                          )}
                          {stage === "DGU" && (
                            row.glassCategory === "DLGU" ? (
                              <span className="text-[9.5px] text-purple-700 font-extrabold block whitespace-nowrap">
                                DLGU Unit (Outer Lite)
                              </span>
                            ) : (
                              <span className="text-[9.5px] text-teal-700 font-extrabold block whitespace-nowrap">
                                DGU Unit (Outer Lite)
                              </span>
                            )
                          )}
                          {stage === "Finished" && (
                            row.glassCategory === "DLGU" ? (
                              <span className="text-[9.5px] text-purple-700 font-extrabold block whitespace-nowrap">
                                DLGU Unit
                              </span>
                            ) : row.glassCategory === "DGU" || row.isDguPair ? (
                              <span className="text-[9.5px] text-teal-700 font-extrabold block whitespace-nowrap">
                                DGU / IGU Unit
                              </span>
                            ) : row.glassCategory === "Laminated" ? (
                              <span className="text-[9.5px] text-amber-700 font-extrabold block whitespace-nowrap">
                                Laminated Unit
                              </span>
                            ) : (
                              <span className="text-[9.5px] text-indigo-700 font-extrabold block whitespace-nowrap">
                                General Glass
                              </span>
                            )
                          )}
                        </td>

                        {/* Barcode */}
                        <td className="py-2.5 px-2 font-mono text-slate-600 align-middle text-[11px]">
                          <div>{row.displayBarcode}</div>
                          {stage === "DGU" && (
                            <span className="text-[9.5px] text-purple-700 block font-mono font-bold">
                              Scan Target (Colour)
                            </span>
                          )}
                          {stage === "Finished" && row.isDguPair && partner && (
                            <span className="text-[9.5px] text-teal-700 block font-mono font-semibold">
                              + Inner: {partner.barcode}
                            </span>
                          )}
                        </td>

                        {/* QTY */}
                        <td className="py-2.5 px-2 text-center align-middle whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-lg font-mono font-black text-xs bg-slate-100 text-slate-900 border border-slate-200 shadow-2xs">
                            {item.qty || 1} {stage === "DGU" || (stage === "Finished" && (row.isDguPair || row.glassCategory === "DGU" || row.glassCategory === "DLGU")) ? (item.qty === 1 ? "unit" : "units") : item.qty === 1 ? "pc" : "pcs"}
                          </span>
                        </td>

                        {/* SQM */}
                        <td className="py-2.5 px-2 text-right font-mono font-bold text-emerald-700 align-middle whitespace-nowrap text-xs">
                          {(row.effectiveSqm || item.sqm || 0).toFixed(2)} m²
                        </td>

                        {/* Size */}
                        <td className="py-2.5 px-2 font-bold text-slate-900 align-middle whitespace-nowrap">
                          {item.width} × {item.height} mm
                        </td>

                        {/* Glass Type / Description */}
                        <td className="py-2.5 px-2 text-slate-700 font-medium align-middle max-w-[280px]">
                          <div className="truncate font-bold text-slate-900">
                            {item.glassType || item.itemCode || item.glassCode || item.category || "Outer Panel Glass"}
                          </div>
                          {stage === "Lamination" && (
                            isDlguGlass(item) || (item as any).glassCategory === "DLGU" ? (
                              <div className="text-[10px] text-purple-800 font-semibold flex items-center gap-1 mt-0.5">
                                <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200 font-bold">
                                  DLGU Inner Lam • Next: DGU Assembly Line
                                </span>
                              </div>
                            ) : (
                              <div className="text-[10px] text-amber-800 font-semibold flex items-center gap-1 mt-0.5">
                                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 font-bold">
                                  Direct Lamination • Next: Finished Warehouse
                                </span>
                              </div>
                            )
                          )}
                          {stage === "DGU" && (
                            row.glassCategory === "DLGU" ? (
                              <>
                                <div className="text-[10px] text-purple-800 font-extrabold flex items-center gap-1 mt-0.5">
                                  <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200 font-bold">
                                    DLGU Unit • Double Laminated IGU
                                  </span>
                                </div>
                                {partner ? (
                                  <div className="text-[10px] text-purple-900 font-semibold flex items-center gap-1 mt-0.5">
                                    <span>Inner Lite: {partner.serialNumber} ({partner.glassType || "Laminated Clear Float"})</span>
                                  </div>
                                ) : (
                                  <div className="text-[10px] text-amber-700 font-semibold mt-0.5">
                                    <span>⏳ Waiting for Laminated Clear Inner Pane</span>
                                  </div>
                                )}
                              </>
                            ) : (
                              <>
                                <div className="text-[10px] text-teal-800 font-extrabold flex items-center gap-1 mt-0.5">
                                  <span className="px-1.5 py-0.5 rounded bg-teal-100 text-teal-800 border border-teal-200 font-bold">
                                    Standard DGU / IGU Unit
                                  </span>
                                </div>
                                {partner ? (
                                  <div className="text-[10px] text-teal-900 font-semibold flex items-center gap-1 mt-0.5">
                                    <span>Inner Lite: {partner.serialNumber} ({partner.glassType || "Clear Float"})</span>
                                  </div>
                                ) : (
                                  <div className="text-[10px] text-amber-700 font-semibold mt-0.5">
                                    <span>⏳ Waiting for Clear Float Inner Pane</span>
                                  </div>
                                )}
                              </>
                            )
                          )}
                          {stage === "Finished" && (
                            row.glassCategory === "DLGU" ? (
                              <div className="text-[10px] text-purple-800 font-semibold flex items-center gap-1 mt-0.5">
                                <span>Double Laminated Glazed Unit (DLGU){partner ? ` • Inner: ${partner.serialNumber}` : ""}</span>
                              </div>
                            ) : row.glassCategory === "DGU" && row.isDguPair && partner ? (
                              <div className="text-[10px] text-teal-800 font-semibold flex items-center gap-1 mt-0.5">
                                <span>Paired DGU: Inner Lite {partner.serialNumber}</span>
                              </div>
                            ) : row.glassCategory === "Laminated" ? (
                              <div className="text-[10px] text-amber-800 font-semibold flex items-center gap-1 mt-0.5">
                                <span>Laminated Glass • Autoclaved</span>
                              </div>
                            ) : (
                              <div className="text-[10px] text-slate-500 font-semibold flex items-center gap-1 mt-0.5">
                                <span>General Monolithic / Single Pane</span>
                              </div>
                            )
                          )}
                        </td>

                        {/* Finish */}
                        <td className="py-2.5 px-2 align-middle whitespace-nowrap">
                          {stage === "Lamination" ? (
                            isDlguGlass(item) || (item as any).glassCategory === "DLGU" ? (
                              <span className="px-2 py-0.5 rounded text-[9.5px] font-black bg-purple-100 text-purple-800 border border-purple-200">
                                DLGU (To DGU)
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[9.5px] font-black bg-amber-100 text-amber-800 border border-amber-200">
                                Direct Lam
                              </span>
                            )
                          ) : stage === "DGU" ? (
                            row.glassCategory === "DLGU" ? (
                              <span className="px-2 py-0.5 rounded text-[9.5px] font-black bg-purple-100 text-purple-800 border border-purple-200">
                                DLGU Unit
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[9.5px] font-black bg-teal-100 text-teal-800 border border-teal-200">
                                DGU Unit
                              </span>
                            )
                          ) : stage === "Finished" && row.glassCategory === "DLGU" ? (
                            <span className="px-2 py-0.5 rounded text-[9.5px] font-black bg-purple-100 text-purple-800 border border-purple-200">
                              DLGU Unit
                            </span>
                          ) : stage === "Finished" && (row.glassCategory === "DGU" || row.isDguPair) ? (
                            <span className="px-2 py-0.5 rounded text-[9.5px] font-black bg-teal-100 text-teal-800 border border-teal-200">
                              DGU Unit
                            </span>
                          ) : (
                            <span
                              className={`px-1.5 py-0.2 rounded text-[9.5px] font-black border ${
                                itemFinish === "Colour"
                                  ? "bg-purple-100 text-purple-800 border-purple-200"
                                  : "bg-cyan-100 text-cyan-800 border-cyan-200"
                              }`}
                            >
                              {itemFinish === "Colour" ? "Colour" : "Clear"}
                            </span>
                          )}
                        </td>

                        {/* Route Flow */}
                        <td className="py-2.5 px-2 align-middle whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            {item.processRoute.map((s, sIdx) => {
                              const isCurrent = s === item.currentStage;
                              const isDone = item.completedStages?.includes(s);
                              return (
                                <React.Fragment key={s}>
                                  <span
                                    className={`px-1.5 py-0.2 rounded font-mono text-[9px] font-bold ${
                                      isCurrent
                                        ? "bg-teal-600 text-white"
                                        : isDone
                                        ? "bg-emerald-100 text-emerald-700"
                                        : "bg-slate-100 text-slate-400"
                                    }`}
                                  >
                                    {s}
                                  </span>
                                  {sIdx < item.processRoute.length - 1 && (
                                    <ArrowRight className="w-2.5 h-2.5 text-slate-300 shrink-0" />
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-2.5 px-3 text-right align-middle whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {!isFinished && (
                              <Button
                                size="sm"
                                disabled={loading || (stage === "DGU" && !row.dguPairReady)}
                                onClick={() => openScanModal(row)}
                                className={`h-7 px-2.5 text-xs font-bold text-white rounded-lg shadow-2xs gap-1 ${
                                  stage === "DGU" && !row.dguPairReady
                                    ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                                    : "bg-teal-600 hover:bg-teal-700"
                                }`}
                                title={
                                  stage === "DGU" && !row.dguPairReady
                                    ? `Cannot assemble: waiting for matching ${row.dguWaitingFinish} glass`
                                    : stage === "DGU"
                                    ? "Scan Outer Panel Colour barcode to complete DGU Unit"
                                    : "Scan & verify"
                                }
                              >
                                <Play className="w-3 h-3 fill-current" /> {stage === "DGU" ? "Scan & Finish" : "Scan"}
                              </Button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onPrintSticker(item);
                              }}
                              className="w-7 h-7 rounded-full border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400 flex items-center justify-center transition-all shadow-2xs shrink-0 cursor-pointer"
                              title="Print Barcode / QR Sticker"
                            >
                              <Tag className="w-3.5 h-3.5 text-slate-700" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onReject(item);
                              }}
                              className="w-7 h-7 rounded-full border border-red-300 bg-white text-red-600 hover:bg-red-50 hover:border-red-400 flex items-center justify-center transition-all shadow-2xs shrink-0 cursor-pointer"
                              title="Reject Item / Report Defect"
                            >
                              <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRework(item);
                              }}
                              className="w-7 h-7 rounded-full border border-amber-300 bg-white text-amber-600 hover:bg-amber-50 hover:border-amber-400 flex items-center justify-center transition-all shadow-2xs shrink-0 cursor-pointer"
                              title="Send Item to Rework"
                            >
                              <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                            </button>
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
      </div>
    </div>
  );
};
