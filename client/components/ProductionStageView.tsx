import React, { useState, useRef, useMemo, useEffect, useCallback } from "react";
import ReactDOM from "react-dom";
import { useSearchParams } from "react-router-dom";
import { GlassItem, ProductionStage, PIMaster } from "@shared/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PairingBufferView } from "@/components/PairingBufferView";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { getDguEffectiveQtyAndSqm, formatBatchNumber, formatPlatformDate, formatPlatformTime, getItemFinish, isDguStickerPairMatch, isDguGlass, isLaminatedGlass, isDlguGlass, isDispatchedItem } from "@/lib/utils";
import { formatSejalBarcode, isItemMatchingCode } from "@/lib/barcode";
import { scannerAudio } from "@/lib/audioBeep";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { CameraScannerModal } from "@/components/CameraScannerModal";
import { useAuth } from "@/context/AuthContext";
import {
  Trash2,
  CheckCircle,
  AlertOctagon,
  AlertCircle,
  RefreshCw,
  Camera,
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
  Building2,
  Briefcase,
  Users,
  ChevronUp,
  ClipboardList,
  PackageCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  exportStageWipToExcel,
  exportStageHistoryToExcel,
  exportSelectedItemsToExcel,
  exportPartialDispatchNoteToExcel,
} from "@/lib/excelExport";
import { TableHorizontalScrollWrapper } from "./TableHorizontalScrollWrapper";
import { WorkstationStageBanner } from "./WorkstationStageBanner";

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
  onNavigateTab?: (tab: string) => void;
}

// Stage color map
const STAGE_COLORS: Record<string, string> = {
  Cutting:    "bg-blue-100 text-[#1680f5]",
  Polishing:  "bg-cyan-100 text-cyan-700",
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
  partnerItems?: GlassItem[]; // All paired partner panes (e.g. DLGU 2 clear panes)
  isDguPair: boolean; // true if paired 1 Col + 1 Clr unit
  dguPairReady: boolean;
  dguWaitingFinish?: "Clear" | "Colour";
  isHolding?: boolean;
  holdingReason?: string;
  allSerials: string[]; // Serial numbers to complete when advancing this row
  effectiveSqm: number;
  displaySerial: string;
  displayBarcode: string;
  glassCategory?: "DGU" | "DLGU" | "Laminated" | "General";
}

export function resolveValidBarcode(item?: any, fallback?: string): string {
  const b = String(fallback || item?.barcode || "").trim();
  // Valid barcodes are pure numeric digits (e.g. 1012627016100044) and not alphanumeric glass codes (e.g. SACW...)
  if (b && /^\d{10,24}$/.test(b) && !/width|height/i.test(b)) {
    return b;
  }
  const sfo = item?.sfoNo || item?.orderNo || item?.piNumber || "1344";
  const numPart = item?.serialNumber ? String(item.serialNumber).replace(/\D/g, "") : "";
  const seq = item?.posNo || item?.srNo || numPart || "1";
  return formatSejalBarcode(sfo, seq);
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
  onNavigateTab,
}) => {
  const { user: authUser, getAuthHeaders } = useAuth();
  const effectiveOperator = operator && operator !== "Operator" ? operator : (authUser?.name || authUser?.username || "Operator");

  // Batch selection state (for Cutting stage drill-down synced with browser history)
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedBatchId = stage === "Cutting" ? (searchParams.get("batch") || null) : null;

  const setSelectedBatchId = useCallback((newBatchId: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (newBatchId) {
        next.set("batch", newBatchId);
      } else {
        next.delete("batch");
      }
      return next;
    });
  }, [setSearchParams]);

  // Batch table filters & sorting (Cutting stage)
  const [batchSearchTerm, setBatchSearchTerm] = useState("");
  const [selectedPdfFilter, setSelectedPdfFilter] = useState<string>("ALL");
  const [batchCategoryFilter, setBatchCategoryFilter] = useState<"ALL" | "DLGU" | "DGU" | "LAMINATION">("ALL");
  const [batchFinishFilter, setBatchFinishFilter] = useState<"ALL" | "CLEAR" | "COLOUR">("ALL");
  const [batchSortField, setBatchSortField] = useState<string>("piNumber");
  const [batchSortAsc, setBatchSortAsc] = useState<boolean>(true);

  // Sticker workspace filters & controls
  const [searchTerm, setSearchTerm] = useState("");
  // Customer / Client Filter: "ALL" or specific customer name
  const [selectedCustomerFilter, setSelectedCustomerFilter] = useState<string>("ALL");
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
  const exportBtnRef = useRef<HTMLButtonElement>(null);
  const [exportMenuPos, setExportMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [rangeFromInput, setRangeFromInput] = useState<string>("1");
  const [rangeToInput, setRangeToInput] = useState<string>("10");
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  // Finished/Dispatch stage: tracks which rows have the partner IP-glass panel expanded
  const [expandedPartnerRows, setExpandedPartnerRows] = useState<Set<string>>(new Set());
  const togglePartnerExpand = (rowId: string) =>
    setExpandedPartnerRows((prev) => {
      const next = new Set(prev);
      next.has(rowId) ? next.delete(rowId) : next.add(rowId);
      return next;
    });
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
  const [stageCameraOpen, setStageCameraOpen] = useState(false);
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

  // Build Batch Summaries across all items & PIs (Only computed for Cutting stage to keep stage switching ultra fast)
  const allBatchSummaries = useMemo(() => {
    if (stage !== "Cutting") return [];
    const map = new Map<
      string,
      {
        id: string;
        piNumber: string;
        batchNo?: string;
        customerName: string;
        projectName: string;
        jobOrderNumber: string;
        sfoNo: string;
        fileName?: string;
        items: GlassItem[];
        stageItems: GlassItem[];
      }
    >();

    items.forEach((item) => {
      if (isDispatchedItem(item)) return;
      if (item.status === "Rejected") return;

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
          stageItems: [],
        });
      }
      const b = map.get(key)!;
      b.items.push(item);
      if (item.currentStage?.toLowerCase() === stage?.toLowerCase()) {
        b.stageItems.push(item);
      }
    });

    // Also include any PIs from Master if not present and not completed
    pis.forEach((p) => {
      if (p.status === "Completed" || (p as any).status === "Dispatched") return;
      if (!map.has(p.id) && !map.has(p.piNumber)) {
        map.set(p.id, {
          id: p.id,
          piNumber: (p.piNumber || "").replace(/^STK-/i, ""),
          batchNo: p.batchNo || "",
          customerName: p.customerName || "Customer",
          projectName: p.projectName || "Project",
          jobOrderNumber: p.jobOrderNumber || p.sfoNo || "",
          sfoNo: p.sfoNo || "",
          fileName: p.fileName || "",
          items: [],
          stageItems: [],
        });
      }
    });

    const summaries = Array.from(map.values()).map((b) => {
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
          : Math.max(0, totalCount - stageItemsPieces);

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
        batchNo: (b as any).batchNo || parentPI?.batchNo || "",
        customerName: b.customerName,
        projectName: b.projectName,
        jobOrderNumber: b.jobOrderNumber,
        sfoNo: b.sfoNo,
        fileName: (b as any).fileName || parentPI?.fileName || "",
        totalItems: totalCount,
        stageItemsCount: stageItemsPieces,
        completedCount: completedCount,
        totalSqm: totalSqmVal,
        finish,
        glassCategory,
        dlguPieces,
        dguPieces,
        lamPieces,
        clearCount: clearItems,
        colourCount: colourItems,
        status: stageItemsPieces > 0 ? "In Production" : (parentPI?.status || (stageItemsPieces === 0 && totalCount > 0 ? "Completed" : "In Production")),
        createdAt,
        issueDate,
      };
    });

    summaries.sort((a, b) => {
      const cComp = (a.customerName || "").localeCompare(b.customerName || "", undefined, { sensitivity: "base" });
      if (cComp !== 0) return cComp;
      const pComp = (a.projectName || "").localeCompare(b.projectName || "", undefined, { sensitivity: "base" });
      if (pComp !== 0) return pComp;
      const numA = parseInt(String(a.batchNo || a.piNumber || "").replace(/\D/g, ""), 10) || 0;
      const numB = parseInt(String(b.batchNo || b.piNumber || "").replace(/\D/g, ""), 10) || 0;
      if (numA !== numB) return numB - numA;
      return String(b.piNumber || "").localeCompare(String(a.piNumber || ""));
    });

    return summaries;
  }, [items, pis, stage]);

  const batchSummaries = useMemo(() => {
    if (stage !== "Cutting") return [];
    return allBatchSummaries.filter((b) => {
      if (stage === "Cutting" && b.stageItemsCount === 0) return false;
      return true;
    });
  }, [allBatchSummaries, stage]);

  // PDF Summaries for Cutting Stage Batches
  const cuttingPdfsSummary = useMemo(() => {
    if (stage !== "Cutting") return [];
    const map = new Map<
      string,
      {
        fileName: string;
        batches: typeof batchSummaries;
        totalPieces: number;
        completedPieces: number;
        stageItemsCount: number;
        totalSqm: number;
        finish: "Clear" | "Colour" | "Mixed";
      }
    >();

    batchSummaries.forEach((b) => {
      const rawFileName = ((b as any).fileName || (b.jobOrderNumber ? `${b.jobOrderNumber}.pdf` : `${b.piNumber}.pdf`)) || "";
      if (!rawFileName) return;
      const key = rawFileName.trim().toLowerCase();

      if (!map.has(key)) {
        map.set(key, {
          fileName: (b as any).fileName || rawFileName,
          batches: [],
          totalPieces: 0,
          completedPieces: 0,
          stageItemsCount: 0,
          totalSqm: 0,
          finish: b.finish === "Colour" ? "Colour" : "Clear",
        });
      }

      const entry = map.get(key)!;
      entry.batches.push(b);
      entry.totalPieces += b.totalItems;
      entry.completedPieces += b.completedCount;
      entry.stageItemsCount += b.stageItemsCount;
      entry.totalSqm += b.totalSqm;

      if (entry.finish !== "Mixed") {
        if ((b.finish === "Colour" && entry.finish === "Clear") || (b.finish !== "Colour" && entry.finish === "Colour")) {
          entry.finish = "Mixed";
        }
      }
    });

    return Array.from(map.values());
  }, [batchSummaries, stage]);

  // Filtered Batches for the Cutting Table View
  const filteredBatches = useMemo(() => {
    if (stage !== "Cutting") return [];
    return batchSummaries
      .filter((b) => {
        // Category filter (DLGU vs DGU vs LAMINATION)
        if (batchCategoryFilter === "DLGU" && b.glassCategory !== "DLGU") return false;
        if (batchCategoryFilter === "DGU" && b.glassCategory !== "DGU") return false;
        if (batchCategoryFilter === "LAMINATION" && b.glassCategory !== "Lamination") return false;

        // Finish filter (All vs Clear vs Coloured)
        if (batchFinishFilter === "CLEAR" && b.finish === "Colour") return false;
        if (batchFinishFilter === "COLOUR" && b.finish !== "Colour") return false;

        // PDF file filter
        if (selectedPdfFilter !== "ALL") {
          const bFileName = (((b as any).fileName || (b.jobOrderNumber ? `${b.jobOrderNumber}.pdf` : `${b.piNumber}.pdf`)) || "").trim().toLowerCase();
          if (bFileName !== selectedPdfFilter.trim().toLowerCase()) return false;
        }

        const q = (batchSearchTerm || externalSearchTerm || "").toLowerCase().trim();
        if (!q) return true;
        return (
          b.piNumber.toLowerCase().includes(q) ||
          b.customerName.toLowerCase().includes(q) ||
          b.projectName.toLowerCase().includes(q) ||
          ((b as any).fileName && (b as any).fileName.toLowerCase().includes(q)) ||
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
  }, [batchSummaries, batchCategoryFilter, batchFinishFilter, selectedPdfFilter, batchSearchTerm, externalSearchTerm, batchSortField, batchSortAsc]);

  // Batches filtered by current PDF filter (base pool for cutting)
  const pdfFilteredBatches = useMemo(() => {
    if (stage !== "Cutting") return [];
    if (selectedPdfFilter === "ALL") return batchSummaries;
    return batchSummaries.filter((b) => {
      const bFileName = (((b as any).fileName || (b.jobOrderNumber ? `${b.jobOrderNumber}.pdf` : `${b.piNumber}.pdf`)) || "").trim().toLowerCase();
      return bFileName === selectedPdfFilter.trim().toLowerCase();
    });
  }, [batchSummaries, selectedPdfFilter, stage]);

  // Queue counts (DGU, Lamination, DLGU, All) filtered by PDF & active Finish filter
  const queueFilteredBatches = useMemo(() => {
    return pdfFilteredBatches.filter((b) => {
      if (batchFinishFilter === "CLEAR" && b.finish === "Colour") return false;
      if (batchFinishFilter === "COLOUR" && b.finish !== "Colour") return false;
      return true;
    });
  }, [pdfFilteredBatches, batchFinishFilter]);

  const batchDlguCount = queueFilteredBatches.filter((b) => b.glassCategory === "DLGU").length;
  const batchDguCount = queueFilteredBatches.filter((b) => b.glassCategory === "DGU").length;
  const batchLamCount = queueFilteredBatches.filter((b) => b.glassCategory === "Lamination").length;
  const batchAllQueueCount = queueFilteredBatches.length;

  // Finish counts (All, Clear, Coloured) filtered by PDF & active Category / Queue filter
  const categoryFilteredBatches = useMemo(() => {
    return pdfFilteredBatches.filter((b) => {
      if (batchCategoryFilter === "DLGU" && b.glassCategory !== "DLGU") return false;
      if (batchCategoryFilter === "DGU" && b.glassCategory !== "DGU") return false;
      if (batchCategoryFilter === "LAMINATION" && b.glassCategory !== "Lamination") return false;
      return true;
    });
  }, [pdfFilteredBatches, batchCategoryFilter]);

  const batchClearCount = categoryFilteredBatches.filter((b) => b.finish !== "Colour").length;
  const batchColourCount = categoryFilteredBatches.filter((b) => b.finish === "Colour").length;
  const batchAllFinishCount = categoryFilteredBatches.length;

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
      <ArrowUp className="w-3 h-3 ml-1 inline-block text-[#1680f5] font-bold" />
    ) : (
      <ArrowDown className="w-3 h-3 ml-1 inline-block text-[#1680f5] font-bold" />
    );
  };

  // Cutting Batch Selection - Customer Grouped View State (Default Closed)
  const [expandedBatchCustomers, setExpandedBatchCustomers] = useState<Record<string, boolean>>({});

  const toggleBatchCustomerExpanded = (key: string) => {
    setExpandedBatchCustomers((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const isBatchCustomerExpanded = (key: string) => {
    // In Cutting stage, expand all customer groups by default
    if (stage === "Cutting") {
      return expandedBatchCustomers[key] !== undefined ? Boolean(expandedBatchCustomers[key]) : true;
    }
    return Boolean(expandedBatchCustomers[key]);
  };

  const setAllBatchCustomersExpanded = (expand: boolean) => {
    const newState: Record<string, boolean> = {};
    groupedCustomerBatches.forEach((g) => {
      newState[g.groupKey] = expand;
    });
    setExpandedBatchCustomers(newState);
  };

  // Non-Cutting Stages (DGU, Lamination, Finished) Customer Grouped View State (Default Closed)
  const [expandedStageCustomers, setExpandedStageCustomers] = useState<Record<string, boolean>>({});

  const toggleStageCustomerExpanded = (key: string) => {
    setExpandedStageCustomers((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const isStageCustomerExpanded = (key: string) => {
    return Boolean(expandedStageCustomers[key]); // Closed by default!
  };

  const setAllStageCustomersExpanded = (expand: boolean) => {
    const newState: Record<string, boolean> = {};
    groupedStageCustomerRows.forEach((g) => {
      newState[g.groupKey] = expand;
    });
    setExpandedStageCustomers(newState);
  };

  const groupedCustomerBatches = useMemo(() => {
    if (filteredBatches.length === 0) return [];
    const map = new Map<string, { customerName: string; projectName: string; batches: typeof filteredBatches }>();

    filteredBatches.forEach((b) => {
      const cust = (b.customerName || "Customer").trim();
      const proj = (b.projectName || "").trim();
      // Group by Customer and Project so different projects are never mixed together
      const groupKey = proj ? `${cust}:::${proj}` : `${cust}:::(No Project)`;
      if (!map.has(groupKey)) {
        map.set(groupKey, { customerName: cust, projectName: proj, batches: [] });
      }
      map.get(groupKey)!.batches.push(b);
    });

    const groups: Array<{
      groupKey: string;
      customerName: string;
      projectName: string;
      batches: typeof filteredBatches;
      totalBatches: number;
      totalPieces: number;
      completedPieces: number;
      stageItemsCount: number;
      totalSqm: number;
      hasColour: boolean;
      hasClear: boolean;
      categories: Set<string>;
      projects: string[];
      pdfFiles: string[];
      isAllCompleted: boolean;
      status: string;
      progressPct: number;
    }> = [];

    map.forEach(({ customerName, projectName, batches }, groupKey) => {
      let totalPieces = 0;
      let completedPieces = 0;
      let stageItemsCount = 0;
      let totalSqm = 0;
      let hasColour = false;
      let hasClear = false;
      const categories = new Set<string>();
      const projectsSet = new Set<string>();
      const pdfFilesSet = new Set<string>();
      if (projectName) projectsSet.add(projectName);

      batches.forEach((b) => {
        totalPieces += b.totalItems;
        completedPieces += b.completedCount;
        stageItemsCount += b.stageItemsCount;
        totalSqm += b.totalSqm;
        if (b.finish === "Colour") hasColour = true;
        else hasClear = true;
        categories.add(b.glassCategory);
        if (b.projectName) projectsSet.add(b.projectName);
        if ((b as any).fileName) pdfFilesSet.add((b as any).fileName);
      });

      const isAllCompleted =
        stageItemsCount === 0 &&
        totalPieces > 0 &&
        completedPieces >= totalPieces &&
        batches.every((b) => b.stageItemsCount === 0 && b.completedCount >= b.totalItems);

      const progressPct = totalPieces > 0 ? Math.round((completedPieces / totalPieces) * 100) : 0;

      groups.push({
        groupKey,
        customerName,
        projectName,
        batches,
        totalBatches: batches.length,
        totalPieces,
        completedPieces,
        stageItemsCount,
        totalSqm,
        hasColour,
        hasClear,
        categories,
        projects: Array.from(projectsSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
        pdfFiles: Array.from(pdfFilesSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
        isAllCompleted,
        status: isAllCompleted ? "Completed" : "In Production",
        progressPct,
      });
    });

    // Stable sort customer groups so they NEVER jump or change positions when batches are deleted
    groups.sort((a, b) => {
      const cComp = a.customerName.localeCompare(b.customerName, undefined, { sensitivity: "base" });
      if (cComp !== 0) return cComp;
      return a.projectName.localeCompare(b.projectName, undefined, { sensitivity: "base" });
    });

    // Stable sort batches inside each customer group by numeric batch number descending (newest batch first)
    groups.forEach((g) => {
      g.batches.sort((a, b) => {
        const numA = parseInt(String(a.batchNo || a.piNumber || "").replace(/\D/g, ""), 10) || 0;
        const numB = parseInt(String(b.batchNo || b.piNumber || "").replace(/\D/g, ""), 10) || 0;
        if (numA !== numB) return numB - numA;
        return String(b.piNumber || "").localeCompare(String(a.piNumber || ""));
      });
    });

    return groups;
  }, [filteredBatches]);

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
    setSelectedPdfFilter("ALL");
    setFinishFilter("ALL");
    setExpandedSheets({});
  }, [stage]);

  // Delete confirmation state (for piece-wise and sheet-wise delete in cutting)
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    type: "sheet" | "item";
    title: string;
    description: string;
    serialNumbers: string[];
    loading?: boolean;
  }>({
    open: false,
    type: "item",
    title: "",
    description: "",
    serialNumbers: [],
    loading: false,
  });

  const handleDeleteSheet = (group: { rackNo: string; rows: Array<{ allSerials?: string[]; item: GlassItem }>; items: GlassItem[] }) => {
    const serials = group.rows.flatMap((r) => r.allSerials && r.allSerials.length > 0 ? r.allSerials : [r.item.serialNumber]);
    const uniqueSerials = Array.from(new Set(serials));
    const totalPieces = group.rows.reduce((a, b) => a + (b.item.qty || 1), 0);

    setDeleteDialog({
      open: true,
      type: "sheet",
      title: `Delete Raw Sheet ${group.rackNo}`,
      description: `Are you sure you want to permanently delete Raw Sheet ${group.rackNo} containing ${totalPieces} piece(s)? This will remove all associated glass stickers from the cutting queue.`,
      serialNumbers: uniqueSerials,
      loading: false,
    });
  };

  const handleDeleteItem = (item: GlassItem) => {
    setDeleteDialog({
      open: true,
      type: "item",
      title: `Delete Glass Piece #${item.serialNumber}`,
      description: `Are you sure you want to permanently delete sticker #${item.serialNumber} (POS ${item.posNo || "—"}, ${item.glassType || item.itemCode || "Glass Unit"})?`,
      serialNumbers: [item.serialNumber],
      loading: false,
    });
  };

  const executeDelete = async () => {
    if (deleteDialog.serialNumbers.length === 0) return;
    setDeleteDialog((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch("/api/production/delete-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serialNumbers: deleteDialog.serialNumbers,
          reason: deleteDialog.type === "sheet" ? "Deleted Raw Sheet" : "Deleted individual glass piece",
          operator: operator || "Operator",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to delete item(s)");
      }

      toast.success(
        deleteDialog.type === "sheet"
          ? `${deleteDialog.title} deleted successfully (${deleteDialog.serialNumbers.length} stickers)`
          : `Glass item #${deleteDialog.serialNumbers[0]} deleted successfully`
      );

      setDeleteDialog({ open: false, type: "item", title: "", description: "", serialNumbers: [], loading: false });
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Error deleting item(s)");
      setDeleteDialog((prev) => ({ ...prev, loading: false }));
    }
  };

  // Dispatch shipment modal state
  const [dispatchDialog, setDispatchDialog] = useState<{
    open: boolean;
    loading: boolean;
    rows: StageRowItem[];
    dispatchNoteNo: string;
    vehicleNo: string;
    driverName: string;
    remarks: string;
    dispatchedAt: string;
  }>({
    open: false,
    loading: false,
    rows: [],
    dispatchNoteNo: "",
    vehicleNo: "",
    driverName: "",
    remarks: "",
    dispatchedAt: "",
  });

  const openDispatchModal = (targetRows: StageRowItem[]) => {
    if (!targetRows || targetRows.length === 0) {
      toast.warning("No glass units selected to dispatch.");
      return;
    }

    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const randSuffix = String(Math.floor(1000 + Math.random() * 9000));
    const suggestedNoteNo = `DN-${dateStr}-${randSuffix}`;
    const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

    setDispatchDialog({
      open: true,
      loading: false,
      rows: targetRows,
      dispatchNoteNo: suggestedNoteNo,
      vehicleNo: "",
      driverName: "",
      remarks: "",
      dispatchedAt: localIso,
    });
  };

  const handleConfirmDispatch = async () => {
    if (!dispatchDialog.rows || dispatchDialog.rows.length === 0) return;

    setDispatchDialog((prev) => ({ ...prev, loading: true }));
    try {
      const serialsToDispatch = new Set<string>();
      const itemIdsToDispatch = new Set<string>();

      for (const r of dispatchDialog.rows) {
        if (r.allSerials && r.allSerials.length > 0) {
          r.allSerials.forEach((s) => serialsToDispatch.add(s));
        } else if (r.item?.serialNumber) {
          serialsToDispatch.add(r.item.serialNumber);
        }
        if (r.item?.id) itemIdsToDispatch.add(r.item.id);
        if (r.partnerItem?.id) itemIdsToDispatch.add(r.partnerItem.id);
      }

      const finalNoteNo = dispatchDialog.dispatchNoteNo?.trim() || `DN-${Date.now()}`;
      const res = await fetch("/api/production/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serialNumbers: Array.from(serialsToDispatch),
          itemIds: Array.from(itemIdsToDispatch),
          dispatchNoteNo: finalNoteNo,
          vehicleNo: (dispatchDialog.vehicleNo || "").trim(),
          driverName: (dispatchDialog.driverName || "").trim(),
          remarks: (dispatchDialog.remarks || "").trim(),
          dispatchedAt: new Date().toISOString(),
          operator: operator || "Dispatch Officer",
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to dispatch items.");
      }

      const data = await res.json();
      toast.success(
        `Successfully dispatched ${dispatchDialog.rows.length} units (${data.count} pieces)!`,
        {
          action: onNavigateTab
            ? {
                label: "View History",
                onClick: () => onNavigateTab("dispatched-history"),
              }
            : undefined,
          duration: 6000,
        }
      );

      setDispatchDialog((prev) => ({ ...prev, open: false, loading: false, rows: [] }));
      setSelectedRowIds([]);

      if (onRefresh) {
        onRefresh();
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to dispatch items.");
      setDispatchDialog((prev) => ({ ...prev, loading: false }));
    }
  };

  // Selected Batch Information (Only relevant for Cutting stage drilldown)
  const selectedBatch = useMemo(() => {
    if (!selectedBatchId || stage !== "Cutting") return null;
    return allBatchSummaries.find((b) => b.id === selectedBatchId || b.piNumber === selectedBatchId) || null;
  }, [allBatchSummaries, selectedBatchId, stage]);

  // Base raw items for this stage (filtered by selected batch ONLY in Cutting stage)
  const stageItems = useMemo(() => {
    return items.filter((item) => {
      // Dispatched items must strictly only appear in Dispatched History
      if (isDispatchedItem(item)) return false;
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
        displayBarcode: resolveValidBarcode(item),
      }));
    }

    // 2. Lamination Workstation: Pairs matching cut panes into 1 Laminated Glass Unit row
    if (stage === "Lamination") {
      const usedLam = new Set<string>();
      const rows: StageRowItem[] = [];

      // Pre-compute an index of all Colour / DGU partner items cut status across all items (O(N) single pass)
      const colourCutIndex = new Map<string, { total: number; cut: number }>();
      for (let i = 0; i < items.length; i++) {
        const other = items[i];
        if (
          getItemFinish(other) === "Colour" ||
          isDguGlass(other) ||
          (Array.isArray(other.processRoute) && other.processRoute.includes("DGU"))
        ) {
          const otherPos = String(other.posNo || "").replace(/\D/g, "") || String(other.posNo || "").trim().toLowerCase();
          const otherOrder = (other.orderNo || other.piNumber || other.sfoNo || "").trim().toLowerCase();
          const otherPiId = (other.piId || "").trim().toLowerCase();
          const isCut = other.currentStage !== "Cutting" || (Array.isArray(other.completedStages) && other.completedStages.includes("Cutting"));

          const keys = [
            `${otherOrder}_${otherPos}_${Number(other.width)}_${Number(other.height)}`,
            otherPiId ? `${otherPiId}_${otherPos}_${Number(other.width)}_${Number(other.height)}` : null,
            `pos_${otherPos}_${Number(other.width)}_${Number(other.height)}`,
          ].filter(Boolean) as string[];

          for (let k = 0; k < keys.length; k++) {
            const entry = colourCutIndex.get(keys[k]) || { total: 0, cut: 0 };
            entry.total += 1;
            if (isCut) entry.cut += 1;
            colourCutIndex.set(keys[k], entry);
          }
        }
      }

      const isItemDlgu = (pane: GlassItem) => {
        if (!pane) return false;
        if (pane.glassCategory === "Lamination" || (pane.glassCategory as string) === "Laminated") return false;
        if (Array.isArray(pane.processRoute) && pane.processRoute.includes("Lamination") && !pane.processRoute.includes("DGU")) return false;
        if (pane.glassCategory === "DLGU" || isDlguGlass(pane)) return true;
        if (
          Array.isArray(pane.processRoute) &&
          pane.processRoute.includes("Lamination") &&
          pane.processRoute.includes("DGU")
        ) {
          return true;
        }
        return false;
      };

      const checkIsDlguHolding = (pane: GlassItem) => {
        if (!pane || !isItemDlgu(pane)) return false;

        const cleanPos = String(pane.posNo || "").replace(/\D/g, "") || String(pane.posNo || "").trim().toLowerCase();
        const cleanOrder = (pane.orderNo || pane.piNumber || pane.sfoNo || "").trim().toLowerCase();
        const cleanPiId = (pane.piId || "").trim().toLowerCase();
        const w = Number(pane.width);
        const h = Number(pane.height);

        // O(1) Map lookups
        const primaryKey = `${cleanOrder}_${cleanPos}_${w}_${h}`;
        const piKey = cleanPiId ? `${cleanPiId}_${cleanPos}_${w}_${h}` : null;
        const posKey = `pos_${cleanPos}_${w}_${h}`;

        const entry = colourCutIndex.get(primaryKey) || (piKey ? colourCutIndex.get(piKey) : null) || colourCutIndex.get(posKey);

        if (entry && entry.total > 0) {
          // If any colour pane is NOT cut yet (cut < total), hold!
          return entry.cut < entry.total;
        }

        // If no colour partner glass found in items at all, hold
        return true;
      };

      // --- DLGU Phase-1: Group by server-stamped lamPairId ---
      const dlguItems = stageItems.filter((i) => isItemDlgu(i));

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
          const sorted = [...panes].sort((a, b) => String(a.glassType || "").localeCompare(String(b.glassType || "")));
          const paneA = sorted[0];
          const paneB = sorted[1];
          panes.forEach((p) => usedLam.add(p.serialNumber));
          rows.push({
            id: `lam-dlgu-${pid}`,
            item: paneA,
            partnerItem: paneB || null,
            isDguPair: true,
            dguPairReady: true,
            isHolding: false,
            holdingReason: undefined,
            glassCategory: "DLGU",
            allSerials: panes.map((p) => p.serialNumber),
            effectiveSqm: paneA.sqm || parseFloat(((paneA.width * paneA.height) / 1000000).toFixed(2)),
            displaySerial: paneA.serialNumber,
            displayBarcode: resolveValidBarcode(paneA),
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
              isHolding: false,
              holdingReason: undefined,
              glassCategory: "DLGU",
              allSerials: match ? [paneA.serialNumber, match.serialNumber] : [paneA.serialNumber],
              effectiveSqm: paneA.sqm || parseFloat(((paneA.width * paneA.height) / 1000000).toFixed(2)),
              displaySerial: paneA.serialNumber,
              displayBarcode: resolveValidBarcode(paneA),
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
              isHolding: false,
              holdingReason: undefined,
              glassCategory: "DLGU",
              allSerials: [paneB.serialNumber],
              effectiveSqm: paneB.sqm || parseFloat(((paneB.width * paneB.height) / 1000000).toFixed(2)),
              displaySerial: paneB.serialNumber,
              displayBarcode: resolveValidBarcode(paneB),
            });
          });
        }
      }

      // --- Regular Direct Lamination glass (non-DLGU: completely independent, always active & selectable) ---
      const regularLamItems = stageItems.filter(
        (i) => !isItemDlgu(i)
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
            isHolding: false,
            glassCategory: "Laminated",
            allSerials: [paneA.serialNumber, match.serialNumber],
            effectiveSqm: paneA.sqm || parseFloat(((paneA.width * paneA.height) / 1000000).toFixed(2)),
            displaySerial: paneA.serialNumber,
            displayBarcode: resolveValidBarcode(paneA),
          });
        } else {
          usedLam.add(paneA.serialNumber);
          rows.push({
            id: `lam-single-${paneA.serialNumber}`,
            item: paneA,
            partnerItem: null,
            isDguPair: false,
            dguPairReady: true,
            isHolding: false,
            glassCategory: "Laminated",
            allSerials: [paneA.serialNumber],
            effectiveSqm: paneA.sqm || parseFloat(((paneA.width * paneA.height) / 1000000).toFixed(2)),
            displaySerial: paneA.serialNumber,
            displayBarcode: resolveValidBarcode(paneA),
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
          // Find clear panes belonging to this DLGU unit (same position, dimensions, order/PI)
          const colDguPairId = (col as any).dguPairId;
          let matchingClears = colDguPairId
            ? dlguClearPanes.filter(
                (clr) => !usedDlguClear.has(clr.serialNumber) && (clr as any).dguPairId === colDguPairId
              ).slice(0, 2)
            : [];

          if (matchingClears.length === 0) {
            matchingClears = dlguClearPanes.filter(
              (clr) => !usedDlguClear.has(clr.serialNumber) && isDguStickerPairMatch(col, clr)
            ).slice(0, 2);
          }

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
            displayBarcode: resolveValidBarcode(col),
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
              displayBarcode: resolveValidBarcode(clr),
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
              displayBarcode: resolveValidBarcode(paneA),
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
              displayBarcode: resolveValidBarcode(paneA),
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
            displayBarcode: resolveValidBarcode(col),
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
            displayBarcode: resolveValidBarcode(col),
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
            displayBarcode: resolveValidBarcode(clr),
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
            displayBarcode: resolveValidBarcode(paneA),
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
            displayBarcode: resolveValidBarcode(paneA),
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
          displayBarcode: resolveValidBarcode(item),
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
      const colDguPairId = (col as any).dguPairId;
      let match = colDguPairId
        ? stageClearPanes.find((clr) => !usedClearSet.has(clr.serialNumber) && (clr as any).dguPairId === colDguPairId)
        : undefined;

      if (!match) {
        match = stageClearPanes.find(
          (clr) => !usedClearSet.has(clr.serialNumber) && isDguStickerPairMatch(col, clr)
        );
      }

      const isDlgu =
        isDlguGlass(col) ||
        (col as any).glassCategory === "DLGU" ||
        (match && (isDlguGlass(match) || (match as any).glassCategory === "DLGU" || (match.processRoute && match.processRoute.includes("Lamination"))));

      if (match) {
        usedClearSet.add(match.serialNumber);

        const allUnitSerials = [col.serialNumber, match.serialNumber];
        if (isDlgu) {
          const matchLamPairId = (match as any).lamPairId;
          const matchDguPairId = (match as any).dguPairId;
          const siblingClear = stageClearPanes.find(
            (clr) =>
              !usedClearSet.has(clr.serialNumber) &&
              clr.id !== match!.id &&
              (
                (matchDguPairId && (clr as any).dguPairId === matchDguPairId) ||
                (matchLamPairId && (clr as any).lamPairId === matchLamPairId) ||
                isDguStickerPairMatch(col, clr)
              )
          );
          if (siblingClear) {
            usedClearSet.add(siblingClear.serialNumber);
            allUnitSerials.push(siblingClear.serialNumber);
          }
        }

        rows.push({
          id: `${stage.toLowerCase()}-pair-${col.serialNumber}-${match.serialNumber}`,
          item: col, // Colour Glass is the primary unit pane (Outer Panel)
          partnerItem: match, // Clear Glass is the paired inner lite
          isDguPair: true,
          dguPairReady: true,
          glassCategory: isDlgu ? "DLGU" : "DGU",
          allSerials: allUnitSerials,
          effectiveSqm: col.sqm || parseFloat(((col.width * col.height) / 1000000).toFixed(2)),
          displaySerial: col.serialNumber,
          displayBarcode: resolveValidBarcode(col),
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
          displayBarcode: resolveValidBarcode(col),
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
            displayBarcode: resolveValidBarcode(clr),
          });
        }
      });
    }

    return rows;
  }, [stage, stageItems, items]);

  const totalStagePieces =
    stage === "Finished" || stage === "DGU" || stage === "Lamination"
      ? stageRows.length
      : stageItems.reduce((acc, curr) => acc + (curr.qty || 1), 0);

  const totalStageSqm = stageItems.reduce((acc, curr) => acc + (curr.sqm || 0), 0);

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

  // Available Customers extracted from current stage items & master PIs
  const availableCustomers = useMemo(() => {
    const map = new Map<string, { name: string; totalItems: number }>();
    stageRows.forEach((r) => {
      const parentPI = pis.find((p) => p.id === r.item.piId || p.piNumber === r.item.piNumber);
      const cust = (parentPI?.customerName || (r.item as any).customerName || (r.item as any).clientName || "Customer").trim();
      if (cust) {
        if (!map.has(cust)) map.set(cust, { name: cust, totalItems: 0 });
        map.get(cust)!.totalItems += r.isDguPair ? 1 : (r.item.qty || 1);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [stageRows, pis]);

  // Filtered Rows for display based on filters & search
  const filteredRows = useMemo(() => {
    return stageRows.filter((row) => {
      const item = row.item;
      const finish = getItemFinish(item);

      // Customer / Client Filter
      if (selectedCustomerFilter !== "ALL") {
        const parentPI = pis.find((p) => p.id === item.piId || p.piNumber === item.piNumber);
        const cust = (parentPI?.customerName || (item as any).customerName || (item as any).clientName || "Customer").trim();
        if (cust !== selectedCustomerFilter) return false;
      }

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

      const parentPI = pis.find((p) => p.id === item.piId || p.piNumber === item.piNumber);

      return (
        row.displaySerial.toLowerCase().includes(query) ||
        row.displayBarcode.toLowerCase().includes(query) ||
        item.itemCode.toLowerCase().includes(query) ||
        item.piNumber.toLowerCase().includes(query) ||
        item.glassType.toLowerCase().includes(query) ||
        (item.orderNo && item.orderNo.toLowerCase().includes(query)) ||
        (item.batchNo && item.batchNo.toLowerCase().includes(query)) ||
        (item.rackNo && item.rackNo.toLowerCase().includes(query)) ||
        (parentPI?.fileName && parentPI.fileName.toLowerCase().includes(query)) ||
        (parentPI?.customerName && parentPI.customerName.toLowerCase().includes(query)) ||
        (parentPI?.projectName && parentPI.projectName.toLowerCase().includes(query)) ||
        partnerMatch
      );
    });
  }, [stageRows, stage, finishFilter, selectedCustomerFilter, searchTerm, externalSearchTerm, pis]);

  // Non-Cutting Customer Grouping (DGU, Lamination, Finished)
  const groupedStageCustomerRows = useMemo(() => {
    const map = new Map<string, { customerName: string; projectName: string; rows: StageRowItem[] }>();

    filteredRows.forEach((row) => {
      const parentPI = pis.find(
        (p) =>
          p.id === row.item.piId ||
          p.piNumber === row.item.piNumber ||
          p.piNumber?.replace(/^STK-/i, "") === row.item.piNumber?.replace(/^STK-/i, "")
      );
      const cust = (
        parentPI?.customerName ||
        (row.item as any).customerName ||
        (row.item as any).customer ||
        (row.item as any).clientName ||
        "Customer"
      ).trim();
      const proj = (parentPI?.projectName || (row.item as any).projectName || row.item.sectionName || "").trim();
      const groupKey = proj ? `${cust}:::${proj}` : `${cust}:::(No Project)`;

      if (!map.has(groupKey)) {
        map.set(groupKey, { customerName: cust, projectName: proj, rows: [] });
      }
      map.get(groupKey)!.rows.push(row);
    });

    const groups: Array<{
      groupKey: string;
      customerName: string;
      projectName: string;
      rows: StageRowItem[];
      totalUnits: number;
      totalSqm: number;
      projects: string[];
      pdfFiles: string[];
      hasColour: boolean;
      hasClear: boolean;
      categories: Set<string>;
      dguReadyUnits: number;
      holdingUnits: number;
      allRowIds: string[];
      isAllSelected: boolean;
      isSomeSelected: boolean;
    }> = [];

    map.forEach(({ customerName, projectName, rows: cRows }, groupKey) => {
      let totalUnits = 0;
      let totalSqm = 0;
      let hasColour = false;
      let hasClear = false;
      let dguReadyUnits = 0;
      let holdingUnits = 0;
      const projectsSet = new Set<string>();
      const pdfFilesSet = new Set<string>();
      const categories = new Set<string>();
      const allRowIds = cRows.map((r) => r.id);
      if (projectName) projectsSet.add(projectName);

      cRows.forEach((r) => {
        const qty = r.item.qty || 1;
        totalUnits += qty;
        totalSqm += (r.effectiveSqm || r.item.sqm || 0);

        const finish = getItemFinish(r.item);
        if (finish === "Colour") hasColour = true;
        else hasClear = true;

        if (r.glassCategory) categories.add(r.glassCategory);
        else if (isDlguGlass(r.item)) categories.add("DLGU");
        else if (isDguGlass(r.item)) categories.add("DGU");
        else if (isLaminatedGlass(r.item)) categories.add("Lamination");

        const parentPI = pis.find((p) => p.id === r.item.piId || p.piNumber === r.item.piNumber);
        const proj = parentPI?.projectName || (r.item as any).projectName || r.item.sectionName;
        if (proj) projectsSet.add(proj);
        if (parentPI?.fileName) pdfFilesSet.add(parentPI.fileName);
        if ((r.item as any).fileName) pdfFilesSet.add((r.item as any).fileName);

        if (r.dguPairReady) dguReadyUnits += 1;
        if (r.isHolding) holdingUnits += 1;
      });

      const isAllSelected = allRowIds.length > 0 && allRowIds.every((id) => selectedRowIds.includes(id));
      const isSomeSelected = !isAllSelected && allRowIds.some((id) => selectedRowIds.includes(id));

      groups.push({
        groupKey,
        customerName,
        projectName,
        rows: cRows,
        totalUnits,
        totalSqm,
        projects: Array.from(projectsSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
        pdfFiles: Array.from(pdfFilesSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
        hasColour,
        hasClear,
        categories,
        dguReadyUnits,
        holdingUnits,
        allRowIds,
        isAllSelected,
        isSomeSelected,
      });
    });

    // Stable sort customer groups so they NEVER jump or change positions
    groups.sort((a, b) => {
      const cComp = a.customerName.localeCompare(b.customerName, undefined, { sensitivity: "base" });
      if (cComp !== 0) return cComp;
      return a.projectName.localeCompare(b.projectName, undefined, { sensitivity: "base" });
    });

    // Stable sort rows inside each customer group by POS / serialNumber
    groups.forEach((g) => {
      g.rows.sort((a, b) => {
        const posA = parseInt(String(a.item.posNo || a.item.srNo || "").replace(/\D/g, ""), 10) || 0;
        const posB = parseInt(String(b.item.posNo || b.item.srNo || "").replace(/\D/g, ""), 10) || 0;
        if (posA !== posB) return posA - posB;
        return (a.displaySerial || "").localeCompare(b.displaySerial || "");
      });
    });

    return groups;
  }, [filteredRows, pis, selectedRowIds]);

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
        // Stably sort rows inside this sheet by posNo / srNo / serial
        groupRows.sort((a, b) => {
          const posA = parseInt(String(a.item.posNo || a.item.srNo || "").replace(/\D/g, ""), 10) || 0;
          const posB = parseInt(String(b.item.posNo || b.item.srNo || "").replace(/\D/g, ""), 10) || 0;
          if (posA !== posB) return posA - posB;
          return (a.displaySerial || "").localeCompare(b.displaySerial || "");
        });

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

  // ponytail: Handle drag selection from grip handle only
  const handleSheetGripMouseDown = (index: number, rackNo: string, e: React.MouseEvent) => {
    e.stopPropagation();
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

  // ponytail: Independent multi-sheet checkbox toggle (allows selecting arbitrary combinations like 2, 4, 5, 7)
  const handleToggleSheet = (rackNo: string) => {
    if (rackNo === "ALL") {
      setSelectedSheetRackNos(["ALL"]);
      setSelectedRowIds([]);
      return;
    }
    setSelectedSheetRackNos((prev) => {
      // If currently "ALL" or all sheets were selected, clicking one sheet checks only that sheet
      const isCurrentlyAll = prev.includes("ALL") || prev.length === 0 || (sheetGroups.length > 0 && prev.length >= sheetGroups.length);
      if (isCurrentlyAll) {
        return [rackNo];
      }
      // If already selected, toggle off
      if (prev.includes(rackNo)) {
        const next = prev.filter((r) => r !== rackNo);
        return next.length === 0 ? ["ALL"] : next;
      } else {
        // Toggle on and sort numerically
        return [...prev, rackNo].sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));
      }
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
        : stage === "Lamination"
        ? displayedRows.filter((r) => !r.isHolding)
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
    if (stage === "Lamination" && row && row.isHolding) {
      toast.warning("Cannot select: matching Colour glass has not been cut in Cutting Workstation yet. Glass is held in Lamination staging.");
      return;
    }
    setSelectedRowIds((prev) =>
      prev.includes(rowId) ? prev.filter((s) => s !== rowId) : [...prev, rowId]
    );
  };

  // Open the scan modal for any row
  const openScanModal = (row: StageRowItem) => {
    if (stage === "Lamination" && row.isHolding) {
      toast.warning("Cannot advance DLGU glass: The matching Colour glass has not been cut in Cutting Workstation yet. Please cut the Colour glass first before releasing from Lamination.");
      return;
    }
    setScanRow(row);
    setScanInput("");
    setTimeout(() => scanInputRef.current?.focus(), 100);
  };

  const handleScanVerify = async (manualCode?: string) => {
    if (!scanRow) return;
    const val = (typeof manualCode === "string" ? manualCode : scanInput).trim();
    if (!val) return;

    const cleanVal = val.replace(/^QR-/i, "").trim().toLowerCase();
    const targetItem = scanRow.item;
    const partnerItem = scanRow.partnerItem;
    const nextStage = getNextStageLabel(targetItem, stage);

    // Accept primary barcode/serial (Colour Glass in DGU) or partner barcode/serial
    const validCodes = [
      scanRow.displayBarcode,
      resolveValidBarcode(targetItem, scanRow.displayBarcode),
      formatSejalBarcode(targetItem.sfoNo || targetItem.piNumber, targetItem.posNo || targetItem.srNo || 1),
      targetItem.barcode,
      targetItem.qrId,
      targetItem.serialNumber,
      scanRow.displaySerial,
      partnerItem?.barcode,
      partnerItem?.serialNumber,
      partnerItem ? resolveValidBarcode(partnerItem) : undefined,
      partnerItem ? formatSejalBarcode(partnerItem.sfoNo || partnerItem.piNumber, partnerItem.posNo || partnerItem.srNo || 1) : undefined,
    ]
      .filter(Boolean)
      .map((s) => String(s).trim().toLowerCase());

    const isMatch =
      isItemMatchingCode(targetItem, val) ||
      (partnerItem ? isItemMatchingCode(partnerItem, val) : false) ||
      validCodes.includes(cleanVal) ||
      validCodes.includes(val.toLowerCase()) ||
      validCodes.some((b) => b.replace(/^qr-/i, "") === cleanVal);

    if (isMatch) {
      setScanRow(null);
      setScanInput("");

      /* ── DGU 1 COLOUR + 1 CLEAR COMBINED UNIT ADVANCEMENT ── */
      if (stage === "DGU") {
        if (!scanRow.dguPairReady || !partnerItem) {
          scannerAudio.playWarning();
          toast.error(
            `Cannot assemble DGU: The matching ${scanRow.dguWaitingFinish || "Clear"} glass pane has NOT been cut yet.`
          );
          setScanInput("");
          return;
        }

        scannerAudio.playPairSuccess();
        toast.success(
          `DGU Unit Assembled & Verified (${targetItem.serialNumber} + ${partnerItem.serialNumber}). Advancing to ${nextStage}...`
        );
        await completeStage(scanRow.allSerials, undefined, true);
        return;
      }

      scannerAudio.playSuccess();
      // Single piece advance: each valid sticker scan advances 1 piece individually
      const remainingPieces = (targetItem.qty || 1) - 1;
      toast.success(
        remainingPieces > 0
          ? `Scanned 1 pc of ${targetItem.serialNumber} (POS #${targetItem.posNo}). Count reduced by 1 (${remainingPieces} pcs remaining in ${stage}).`
          : `Scanned & Completed piece ${targetItem.serialNumber}. Advancing to ${nextStage}...`
      );
      await completeStage(scanRow.allSerials, 1, false);
    } else {
      scannerAudio.playError();
      toast.error(`Barcode mismatch: scanned "${val}". Expected: ${scanRow.displayBarcode} or #${scanRow.displaySerial}`);
      setScanInput("");
    }
  };

  // Hardware barcode scanner gun listener for verification modal
  useBarcodeScanner({
    enabled: Boolean(scanRow),
    onScan: (scanned) => {
      setScanInput(scanned);
      setTimeout(() => {
        handleScanVerify(scanned);
      }, 50);
    },
  });

  const completeStage = async (serialNumbers: string[], advanceQty?: number, advanceAll?: boolean) => {
    // 1. Instant optimistic local UI transition (0 ms)
    onOptimisticAdvance?.(serialNumbers, stage);
    setSelectedRowIds([]);

    // 2. Perform backend stage advancement
    try {
      const res = await fetch("/api/production/stage-complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          serialNumbers,
          advanceQty: advanceQty ?? 1,
          stage,
          currentStage: stage,
          operator: effectiveOperator,
          remarks: `Completed ${stage} stage by ${effectiveOperator}`,
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
          `Cannot advance: ${unready.length} selected pane(s) do not have their matching partner cut yet (1 Colour + 1 Clear required).`
        );
        return;
      }
    }
    if (stage === "Lamination") {
      const holding = selectedRows.filter((r) => r.isHolding);
      if (holding.length > 0) {
        toast.error(
          `Cannot advance: ${holding.length} DLGU unit(s) must hold in Lamination staging until the matching Colour glass is cut in Cutting Workstation.`
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
        "Cannot advance: No ready paired DGU units found (both Colour + Clear panels must be cut)."
      );
      return;
    }
    const serialsToAdvance = Array.from(new Set(readyRows.flatMap((r) => r.allSerials)));
    setSelectedRowIds([]);
    await completeStage(serialsToAdvance, undefined, true);
  };

  const handleSendAllToFinished = async () => {
    if (displayedRows.length === 0) {
      toast.error("Cannot advance: No items found in the queue.");
      return;
    }
    const readyRows = stage === "Lamination" ? displayedRows.filter((r) => !r.isHolding) : displayedRows;
    if (readyRows.length === 0) {
      toast.error("Cannot advance: All DLGU items are holding in Lamination staging awaiting Colour glass cutting.");
      return;
    }
    const serialsToAdvance = Array.from(new Set(readyRows.flatMap((r) => r.allSerials)));
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
        onNavigateTab={onNavigateTab}
      />
    );
  }

  /* ─────────────────────────────────────────────────────────────────────────────
     CUTTING STAGE: BATCH OVERVIEW VIEW (When no batch is selected)
     ───────────────────────────────────────────────────────────────────────────── */
  if (stage === "Cutting" && !selectedBatchId) {
    return (
      <div className="space-y-4 animate-in fade-in duration-200">

        {/* ── Filter Bar with FINISH Tabs (Clear / Colour / All) & Search ── */}
        <div className="ppb-panel bg-white border border-slate-100 p-5 shadow-[0_4px_20px_rgb(22,128,245,0.04)] space-y-4 mb-4">
          {/* Top Row: Queue Tabs & Finish Filter Tabs (Left) & Export Batches Button (Right) */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2.5 flex-wrap">
              {/* DLGU vs DGU vs LAMINATION PROCESS QUEUE TABS */}
              <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-xl border border-slate-200 overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={() => setBatchCategoryFilter("ALL")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                    batchCategoryFilter === "ALL"
                      ? "bg-white text-slate-900 shadow-lg ring-1 ring-slate-200"
                      : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                  }`}
                >
                  <span>All Queues</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                      batchCategoryFilter === "ALL" ? "bg-slate-200 text-slate-800" : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {batchAllQueueCount}
                  </span>
                </button>

                {batchDlguCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setBatchCategoryFilter("DLGU")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                      batchCategoryFilter === "DLGU"
                        ? "bg-[#1680f5] text-white shadow-md"
                        : "text-slate-600 hover:bg-[#1680f5]/10 hover:text-[#1680f5]"
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>DLGU Queue</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                        batchCategoryFilter === "DLGU" ? "bg-white/20 text-white" : "bg-[#1680f5]/20 text-[#1680f5]"
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
                      ? "bg-gradient-to-r from-teal-500 to-teal-700 text-white shadow-lg"
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
                      ? "bg-gradient-to-r from-amber-500 to-amber-700 text-white shadow-lg"
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

              {/* FINISH FILTER TABS (All Glass / Clear Glass / Coloured Glass) */}
              <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-xl border border-slate-200/80 flex-wrap">
                <button
                  type="button"
                  onClick={() => setBatchFinishFilter("ALL")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                    batchFinishFilter === "ALL"
                      ? "bg-white text-slate-900 shadow-xs ring-1 ring-slate-200"
                      : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                  }`}
                >
                  <span>All Glass</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                      batchFinishFilter === "ALL" ? "bg-slate-200 text-slate-800" : "bg-slate-200/60 text-slate-600"
                    }`}
                  >
                    {batchAllFinishCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setBatchFinishFilter("CLEAR")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                    batchFinishFilter === "CLEAR"
                      ? "bg-cyan-600 text-white shadow-xs"
                      : "text-cyan-800 hover:bg-cyan-100/60"
                  }`}
                >
                  <span>Clear Glass</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                      batchFinishFilter === "CLEAR" ? "bg-white/20 text-white" : "bg-cyan-200 text-cyan-900"
                    }`}
                  >
                    {batchClearCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setBatchFinishFilter("COLOUR")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                    batchFinishFilter === "COLOUR"
                      ? "bg-purple-600 text-white shadow-xs"
                      : "text-purple-800 hover:bg-purple-100/60"
                  }`}
                >
                  <span>Coloured Glass</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                      batchFinishFilter === "COLOUR" ? "bg-white/20 text-white" : "bg-purple-200 text-purple-900"
                    }`}
                  >
                    {batchColourCount}
                  </span>
                </button>
              </div>
            </div>

            {/* Export Batches Excel Button (Top Row - Right Side) */}
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
              className="bg-gradient-to-r from-emerald-500 to-emerald-700 hover:bg-emerald-700 text-white font-extrabold text-xs h-9 px-3.5 gap-1.5 rounded-xl shadow-lg shrink-0"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export Batches (.xlsx)</span>
            </Button>
          </div>

          {/* Bottom Row: Search Bar (Left Side) & View Mode Switcher (Right Side - Parallel) */}
          <div className="flex items-center justify-between flex-wrap gap-3 pt-2.5 border-t border-slate-100">
            {/* Search Input (Left side) */}
            <div className="relative flex-1 min-w-[260px] max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <Input
                value={batchSearchTerm}
                onChange={(e) => setBatchSearchTerm(e.target.value)}
                placeholder="Search batch by Customer, Job Order, Project..."
                className="pl-9 h-9 bg-slate-50 border-slate-200 text-slate-900 text-xs rounded-xl focus:bg-white"
              />
              {batchSearchTerm && (
                <button
                  onClick={() => setBatchSearchTerm("")}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Right side: PDF Dropdown & Expand/Collapse All */}
            <div className="flex items-center gap-2 flex-wrap">
              {cuttingPdfsSummary.length > 0 && (
                <div className="flex items-center gap-1.5 bg-slate-100/90 rounded-lg px-2.5 py-1 border border-slate-200 shadow-2xs">
                  <FileText className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  <select
                    value={selectedPdfFilter}
                    onChange={(e) => setSelectedPdfFilter(e.target.value)}
                    className="text-xs font-bold bg-transparent border-0 text-slate-700 focus:outline-hidden cursor-pointer max-w-[260px] truncate"
                    title="Filter cutting batches by uploaded PDF"
                  >
                    <option value="ALL">All PDFs ({cuttingPdfsSummary.length})</option>
                    {cuttingPdfsSummary.map((pdf) => (
                      <option key={pdf.fileName} value={pdf.fileName}>
                        {pdf.fileName} ({pdf.batches.length} {pdf.batches.length === 1 ? "batch" : "batches"})
                      </option>
                    ))}
                  </select>
                  {selectedPdfFilter !== "ALL" && (
                    <button
                      type="button"
                      onClick={() => setSelectedPdfFilter("ALL")}
                      className="text-[10px] text-rose-600 hover:text-rose-800 font-black ml-1 px-1 rounded hover:bg-rose-100 cursor-pointer"
                      title="Clear PDF filter"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}

              {groupedCustomerBatches.length > 0 && (
                <div className="flex items-center gap-1 mr-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setAllBatchCustomersExpanded(true)}
                    className="text-[11px] font-bold text-slate-600 hover:text-[#1680f5] h-8 px-2"
                  >
                    Expand All
                  </Button>
                  <span className="text-slate-300">|</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setAllBatchCustomersExpanded(false)}
                    className="text-[11px] font-bold text-slate-600 hover:text-[#1680f5] h-8 px-2"
                  >
                    Collapse All
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── VIEW 1: GROUP BY CUSTOMER (DEFAULT CLOSED) ── */}
        <div className="space-y-3">
            {groupedCustomerBatches.length > 0 ? (
              groupedCustomerBatches.map((customer) => {
                const isExpanded = isBatchCustomerExpanded(customer.groupKey);
                const isCompleted =
                  customer.stageItemsCount === 0 &&
                  (customer.isAllCompleted ||
                    customer.status === "Completed" ||
                    (customer.totalPieces > 0 && customer.completedPieces >= customer.totalPieces));

                return (
                  <div
                    key={customer.groupKey}
                    className={`ppb-panel p-0 overflow-hidden transition-all duration-300 ${isCompleted ? "border-2 border-emerald-500 shadow-[0_8px_30px_rgb(16,185,129,0.12)]" : "hover:border-[#1680f5] shadow-[0_4px_20px_rgb(22,128,245,0.06)] hover:shadow-[0_8px_30px_rgb(22,128,245,0.15)]"}`}
                  >
                    {/* Customer Header - Click to toggle */}
                    <div
                      onClick={() => toggleBatchCustomerExpanded(customer.groupKey)}
                      className={`w-full block m-0 p-5 cursor-pointer select-none transition-all duration-300 border-b-0 ${isCompleted ? "bg-gradient-to-r from-emerald-50/80 to-teal-50/40 hover:from-emerald-100/60" : "bg-gradient-to-r from-[#f8fafc] to-white hover:from-blue-50/50"}`}
                    >
                      <div className="w-full flex items-center justify-between gap-6 flex-wrap md:flex-nowrap">
                        {/* Left: Customer Info & Badges */}
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div
                            className={`w-12 h-12 rounded-[14px] text-white flex items-center justify-center font-black text-lg shrink-0 shadow-sm transition-transform duration-300 hover:scale-105 ${isCompleted ? "bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-200/50" : "bg-gradient-to-br from-[#1680f5] to-[#1470e0] shadow-blue-200/50"}`}
                          >
                            {isCompleted ? (
                              <CheckCircle className="w-5 h-5 text-emerald-50" />
                            ) : (
                              <Building2 className="w-5 h-5" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3
                                className="text-[17px] font-black tracking-tight truncate text-rose-700 flex items-center gap-2"
                                title={customer.pdfFiles?.join(', ') || customer.customerName}
                              >
                                <FileText className="w-5 h-5 text-rose-500 shrink-0" />
                                <span className="truncate">
                                  {customer.pdfFiles && customer.pdfFiles.length > 0
                                    ? customer.pdfFiles.join(', ')
                                    : customer.customerName}
                                </span>
                              </h3>
                              {customer.projectName && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-50 text-blue-800 border border-blue-200 shadow-2xs">
                                  <Briefcase className="w-3 h-3 text-blue-600" />
                                  {customer.projectName}
                                </span>
                              )}
                              {customer.hasColour && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-200">
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
                                      ? "bg-blue-100 text-purple-900 border-blue-200"
                                      : cat === "DGU"
                                      ? "bg-teal-100 text-teal-900 border-teal-200"
                                      : "bg-amber-100 text-amber-900 border-amber-200"
                                  }`}
                                >
                                  {cat} Queue
                                </span>
                              ))}
                              {isCompleted ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-gradient-to-r from-emerald-500 to-emerald-700 text-white shadow-lg border border-emerald-400">
                                  <Check className="w-3 h-3 stroke-[3]" /> FULLY CUT
                                </span>
                              ) : (
                                <StatusBadge status={customer.status} />
                              )}
                            </div>
                            <div className="text-xs text-slate-500 font-medium truncate mt-0.5 flex items-center gap-2 flex-wrap">
                              <span className="font-extrabold text-slate-900 flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                <span>{customer.customerName}</span>
                              </span>
                              {customer.projectName && (
                                <>
                                  <span className="text-slate-300">•</span>
                                  <span className="flex items-center gap-1">
                                    <span className="text-slate-400 font-semibold">Project:</span>
                                    <span className="font-bold text-slate-700">{customer.projectName}</span>
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right: Quantities, Progress & Accordion Trigger */}
                        <div className="flex items-center gap-5 shrink-0 justify-end ml-auto">
                          <div className="text-right">
                            <div className="font-mono text-xs font-black text-slate-900 flex items-center justify-end gap-1.5 flex-wrap">
                              {customer.pdfFiles && customer.pdfFiles.length > 0 && (
                                <>
                                  <span className="text-rose-700 font-bold inline-flex items-center gap-0.5" title={`Source: ${customer.pdfFiles.join(', ')}`}>
                                    <FileText className="w-3 h-3 text-rose-500" />
                                    {customer.pdfFiles.length} {customer.pdfFiles.length === 1 ? 'PDF' : 'PDFs'}
                                  </span>
                                  <span className="text-slate-400">•</span>
                                </>
                              )}
                              <span className={isCompleted ? "text-emerald-900 font-bold" : ""}>
                                {customer.completedPieces}/{customer.totalPieces} pcs
                              </span>
                              <span className="text-slate-400">•</span>
                              <span className="text-slate-600">{customer.totalSqm.toFixed(2)} m²</span>
                            </div>
                            <div className="flex items-center gap-2 justify-end mt-1">
                              <div
                                className={`w-36 md:w-44 h-2 rounded-full overflow-hidden ${
                                  isCompleted ? "bg-emerald-200" : "bg-slate-200"
                                }`}
                              >
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    isCompleted
                                      ? "bg-gradient-to-r from-emerald-500 to-teal-600"
                                      : "bg-gradient-to-r from-[#1680f5] to-[#1470e0]"
                                  }`}
                                  style={{ width: `${customer.progressPct}%` }}
                                />
                              </div>
                              <span
                                className={`text-[10px] font-mono ${
                                  isCompleted ? "text-emerald-700 font-extrabold" : "text-slate-500 font-bold"
                                }`}
                              >
                                {customer.progressPct}%
                              </span>
                            </div>
                          </div>

                          <div
                            className={`p-1.5 rounded-lg transition-colors ${
                              isCompleted
                                ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                                : "bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-[#1680f5]"
                            }`}
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Collapsible Customer Sub-Table */}
                    {isExpanded && (
                      <div className="border-t border-slate-200 bg-slate-50/50 p-3.5">
                        <div className="ppb-panel p-0 overflow-hidden shadow-[0_4px_20px_rgb(22,128,245,0.04)] border-slate-100/60">
                          <TableHorizontalScrollWrapper>
                            <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-slate-100/80 text-[10px] font-extrabold text-[#1680f5] uppercase tracking-widest bg-gradient-to-r from-blue-50/80 to-transparent">
                                <th className="py-2.5 px-3.5 whitespace-nowrap">BATCH NO</th>
                                <th className="py-2.5 px-3.5 whitespace-nowrap">SOURCE PDF</th>
                                <th className="py-2.5 px-3.5 whitespace-nowrap">PROJECT</th>
                                <th className="py-2.5 px-3 text-center whitespace-nowrap">FINISH</th>
                                <th className="py-2.5 px-3 text-center whitespace-nowrap">COMPLETED</th>
                                <th className="py-2.5 px-3 text-right whitespace-nowrap">SQM</th>
                                <th className="py-2.5 px-3 whitespace-nowrap">UPLOADED AT</th>
                                <th className="py-2.5 px-3 text-center whitespace-nowrap">STATUS</th>
                                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">ACTION</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {customer.batches.map((b) => {
                                const isBatchCompleted =
                                  b.stageItemsCount === 0 &&
                                  b.totalItems > 0 &&
                                  (b.completedCount >= b.totalItems || b.status === "Completed");

                                return (
                                  <tr
                                    key={b.id}
                                    onClick={() => {
                                      if (!isBatchCompleted) {
                                        setSelectedBatchId(b.id);
                                        setSelectedSheetRackNo("ALL");
                                        setSelectedSheetRackNos(["ALL"]);
                                        setFinishFilter("ALL");
                                        setSelectedRowIds([]);
                                        setExpandedSheets({});
                                      }
                                    }}
                                    className={`transition-colors ${
                                      isBatchCompleted
                                        ? "bg-slate-50/40 hover:bg-slate-50/70 cursor-default"
                                        : "hover:bg-blue-50/40 transition-colors cursor-pointer group"
                                    }`}
                                  >
                                    <td className="py-2.5 px-3.5 font-bold font-mono text-[#1680f5]">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span>{formatBatchNumber((b as any).batchNo || b.piNumber)}</span>
                                        {b.glassCategory === "DLGU" ? (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-[#1680f5]/10 text-[#1680f5] border border-[#1680f5]/20 shadow-2xs">
                                            <Sparkles className="w-3 h-3 text-[#1680f5]" /> DLGU
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
                                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                                      <div className="flex items-center gap-1.5 text-slate-700 max-w-[200px] truncate" title={(b as any).fileName || "Sticker PDF"}>
                                        <FileText className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                        <span className="truncate text-xs font-mono font-bold text-slate-800">{(b as any).fileName || "Sticker PDF"}</span>
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-3.5 text-slate-600">
                                      <span className="font-semibold text-slate-800">{b.projectName || "—"}</span>
                                    </td>
                                    <td className="py-2.5 px-3 text-center">
                                      <span
                                        className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                                          b.finish === "Colour"
                                            ? "bg-blue-100 text-blue-800 border-blue-200"
                                            : "bg-cyan-100 text-cyan-800 border-cyan-200"
                                        }`}
                                      >
                                        {b.finish === "Colour" ? "Colour" : "Clear"}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 text-center font-mono">
                                      <span className="font-bold text-emerald-700">{b.completedCount}</span>
                                      <span className="text-slate-400 text-[10px]"> / {b.totalItems}</span>
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">
                                      {b.totalSqm.toFixed(2)} m²
                                    </td>
                                    <td className="py-2.5 px-3 whitespace-nowrap font-mono text-xs">
                                      <div className="flex items-center gap-1.5 font-bold text-slate-800">
                                        <Calendar className="w-3.5 h-3.5 text-[#1680f5] shrink-0" />
                                        {formatPlatformDate(b.createdAt || b.issueDate)}
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                      <StatusBadge status={isBatchCompleted ? "Completed" : "In Production"} />
                                    </td>
                                    <td className="py-2.5 px-3.5 text-right">
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
                                            setSelectedSheetRackNos(["ALL"]);
                                            setFinishFilter("ALL");
                                            setSelectedRowIds([]);
                                            setExpandedSheets({});
                                          }}
                                          className="bg-[#1680f5] hover:bg-[#1470e0] text-white text-xs font-bold gap-1 rounded-xl shadow-2xs h-7 px-3 group-hover:scale-105 transition-transform"
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
                        </TableHorizontalScrollWrapper>
                      </div>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="py-12 text-center text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">
                <Users className="w-10 h-10 mx-auto mb-2 opacity-30 text-[#1680f5]" />
                <p className="text-sm font-semibold">No customer batches found matching the filters.</p>
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
      {stage === "Cutting" && selectedBatchId && (
        <div className="bg-white border-2 border-blue-300 rounded-2xl p-3.5 shadow-lg flex items-center justify-between flex-wrap gap-3">
          {/* Left: Back button + Batch info */}
          <div className="flex items-center gap-3 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedBatchId(null);
                setSelectedSheetRackNo("ALL");
                setSelectedSheetRackNos(["ALL"]);
                setFinishFilter("ALL");
                setSelectedRowIds([]);
              }}
              className="border-blue-300 text-blue-800 bg-blue-50/50 hover:bg-blue-100 hover:border-blue-400 h-9 px-3 gap-1.5 rounded-xl shrink-0 font-extrabold text-xs shadow-2xs transition-all cursor-pointer"
              title="Back to All Batches"
            >
              <ArrowLeft className="w-4 h-4 text-[#1680f5]" />
              <span>Back to Batches</span>
            </Button>
            <div className="whitespace-nowrap">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-slate-900 text-sm">
                  Batch: {formatBatchNumber((selectedBatch as any)?.batchNo || selectedBatch?.piNumber || selectedBatchId)}
                </span>
                {selectedBatch?.glassCategory === "DLGU" ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#1680f5]/10 text-[#1680f5] border border-[#1680f5]/20 inline-flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-[#1680f5]" /> DLGU Queue ➔ Pairing
                  </span>
                ) : selectedBatch?.glassCategory === "DGU" ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-teal-100 text-teal-800 border border-teal-200 inline-flex items-center gap-1">
                    <Boxes className="w-3 h-3 text-teal-600" /> DGU Queue ➔ Pairing
                  </span>
                ) : selectedBatch?.glassCategory === "Lamination" ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-200 inline-flex items-center gap-1">
                    <Layers className="w-3 h-3 text-amber-700" /> Lamination Queue ➔ Buffer
                  </span>
                ) : null}
                {selectedBatch?.finish && (
                  <span
                    className={`px-2 py-0.2 rounded-full text-[10px] font-black border ${
                      selectedBatch.finish === "Colour"
                        ? "bg-blue-100 text-blue-800 border-blue-200"
                        : "bg-cyan-100 text-cyan-800 border-cyan-200"
                    }`}
                  >
                    {selectedBatch.finish === "Colour" ? "Colour Finish" : "Clear Finish"}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 font-medium leading-tight mt-0.5">
                {selectedBatch?.customerName || "Customer"} • {selectedBatch?.projectName || "Project"}
                {selectedBatch?.jobOrderNumber ? ` • JO: ${selectedBatch.jobOrderNumber}` : ""}
              </p>
            </div>
          </div>

          {/* Center: Finish Filter Tabs (All Glass / Clear Glass / Coloured Glass) */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-xl border border-slate-200/80 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => {
                setFinishFilter("ALL");
                setSelectedSheetRackNos(["ALL"]);
                setSelectedRowIds([]);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                finishFilter === "ALL"
                  ? "bg-white text-slate-900 shadow-xs ring-1 ring-slate-200"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
              }`}
            >
              <span>All Glass</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                  finishFilter === "ALL" ? "bg-slate-200 text-slate-800" : "bg-slate-200/60 text-slate-600"
                }`}
              >
                {selectedBatch?.totalItems || totalStagePieces}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setFinishFilter("CLEAR");
                setSelectedSheetRackNos(["ALL"]);
                setSelectedRowIds([]);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
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

            <button
              type="button"
              onClick={() => {
                setFinishFilter("COLOUR");
                setSelectedSheetRackNos(["ALL"]);
                setSelectedRowIds([]);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
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

      {/* ── Unified Header Controls: Finish Tabs + Action Buttons + Search & Filters (For Non-Cutting Workstations or General Stage View) ── */}
      {stage !== "Cutting" && (
        <div className="ppb-panel bg-gradient-to-br from-white/90 to-white/50 backdrop-blur-2xl border-white p-6 rounded-3xl shadow-[0_10px_40px_rgb(22,128,245,0.08)] space-y-4 mb-5 relative overflow-visible ring-1 ring-slate-900/5">
          {/* Row 1: Category / Finish Filter Tabs (Left) & Primary Action Buttons (Right) */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            {/* Left: Finish Filter Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-50/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-inner flex-wrap">
              <button
                type="button"
                onClick={() => setFinishFilter("ALL")}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                  finishFilter === "ALL"
                    ? "bg-white text-slate-900 shadow-lg ring-1 ring-slate-200"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                }`}
              >
                <span>{stage === "DGU" ? "All DGU Queue" : stage === "Finished" ? "All Finished" : stage === "Lamination" ? "All Lamination Line" : stage === "Polishing" ? "All Polishing Queue" : "All Glass"}</span>
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
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                        finishFilter === "DIRECT_LAM"
                          ? "bg-gradient-to-r from-amber-500 to-amber-700 text-white shadow-lg"
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
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                        finishFilter === "DLGU_LAM"
                          ? "bg-[#1680f5] text-white shadow-md"
                          : "text-slate-600 hover:bg-[#1680f5]/10 hover:text-[#1680f5]"
                      }`}
                    >
                      <span>DLGU Sub-Assembly</span>
                      <span
                        className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                          finishFilter === "DLGU_LAM" ? "bg-white/20 text-white" : "bg-[#1680f5]/20 text-[#1680f5]"
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
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                        finishFilter === "DGU"
                          ? "bg-gradient-to-r from-teal-500 to-teal-700 text-white shadow-lg"
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
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                        finishFilter === "DLGU"
                          ? "bg-[#1680f5] text-white shadow-md"
                          : "text-slate-600 hover:bg-[#1680f5]/10 hover:text-[#1680f5]"
                      }`}
                    >
                      <span>DLGU Units</span>
                      <span
                        className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                          finishFilter === "DLGU" ? "bg-white/20 text-white" : "bg-[#1680f5]/20 text-[#1680f5]"
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
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                        finishFilter === "WAITING"
                          ? "bg-gradient-to-r from-amber-500 to-amber-700 text-white shadow-lg"
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
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                        finishFilter === "DLGU"
                          ? "bg-[#1680f5] text-white shadow-md"
                          : "text-slate-600 hover:bg-[#1680f5]/10 hover:text-[#1680f5]"
                      }`}
                    >
                      <span>DLGU Units</span>
                      <span
                        className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                          finishFilter === "DLGU" ? "bg-white/20 text-white" : "bg-[#1680f5]/20 text-[#1680f5]"
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
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                        finishFilter === "DGU"
                          ? "bg-gradient-to-r from-teal-500 to-teal-700 text-white shadow-lg"
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
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                        finishFilter === "LAMINATION"
                          ? "bg-gradient-to-r from-amber-500 to-amber-700 text-white shadow-lg"
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
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                        finishFilter === "GENERAL"
                          ? "bg-gradient-to-r from-indigo-500 to-indigo-700 text-white shadow-lg"
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
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                        finishFilter === "CLEAR"
                          ? "bg-gradient-to-r from-cyan-500 to-cyan-700 text-white shadow-lg"
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
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                        finishFilter === "COLOUR"
                          ? "bg-[#1680f5] text-white shadow-md"
                          : "text-slate-600 hover:bg-[#1680f5]/10 hover:text-[#1680f5]"
                      }`}
                    >
                      <span>Coloured Glass</span>
                      <span
                        className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                          finishFilter === "COLOUR" ? "bg-white/20 text-white" : "bg-[#1680f5]/20 text-[#1680f5]"
                        }`}
                      >
                        {rawColourCount}
                      </span>
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Right: Primary Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {stage === "Polishing" && selectedRowIds.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleBatchComplete}
                  disabled={loading || stageRows.filter((r) => selectedRowIds.includes(r.id)).length === 0}
                  className="bg-cyan-600 hover:bg-cyan-700 active:bg-cyan-800 bg-gradient-to-r from-cyan-600 via-teal-600 to-cyan-700 hover:from-cyan-700 hover:to-teal-800 text-white font-black text-xs h-9 px-3.5 gap-1.5 rounded-xl border border-cyan-400/50 shadow-[0_4px_14px_rgba(6,182,212,0.4)] hover:shadow-lg active:scale-95 shrink-0 animate-in fade-in transition-all cursor-pointer"
                  title="Advance selected polished glass pieces to Pairing workstation"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>
                    Polish & Advance Selected ({displayedRows.filter((r) => selectedRowIds.includes(r.id)).reduce((a, b) => a + (b.item.qty || 1), 0)} pcs)
                  </span>
                </Button>
              )}

              {stage === "DGU" && selectedRowIds.length > 0 && (
                <Button
                  size="sm"
                  onClick={handleBatchComplete}
                  disabled={
                    loading ||
                    stageRows
                      .filter((r) => selectedRowIds.includes(r.id))
                      .filter((r) => r.dguPairReady).length === 0
                  }
                  className={`font-black text-xs h-9 px-3.5 gap-1.5 rounded-xl shrink-0 animate-in fade-in transition-all ${
                    stageRows
                      .filter((r) => selectedRowIds.includes(r.id))
                      .filter((r) => r.dguPairReady).length === 0
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed border-transparent shadow-none"
                      : "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-800 text-white border border-emerald-400/50 shadow-[0_4px_14px_rgba(5,150,105,0.4)] hover:shadow-lg active:scale-95 cursor-pointer"
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
              )}

              {stage === "Lamination" && selectedRowIds.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleBatchComplete}
                  disabled={
                    loading ||
                    stageRows.filter((r) => selectedRowIds.includes(r.id) && !r.isHolding).length === 0
                  }
                  className={`font-black text-xs h-9 px-3.5 gap-1.5 rounded-xl shrink-0 animate-in fade-in transition-all ${
                    stageRows.filter((r) => selectedRowIds.includes(r.id) && !r.isHolding).length === 0
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed border-transparent shadow-none"
                      : "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-800 text-white border border-emerald-400/50 shadow-[0_4px_14px_rgba(5,150,105,0.4)] hover:shadow-lg active:scale-95 cursor-pointer"
                  }`}
                  title={
                    stageRows.filter((r) => selectedRowIds.includes(r.id) && !r.isHolding).length === 0
                      ? "Cannot advance: Selected DLGU units are holding in staging until matching Colour glass is cut"
                      : "Advance selected ready items from Lamination"
                  }
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>
                    Advance Ready Selected ({stageRows.filter((r) => selectedRowIds.includes(r.id) && !r.isHolding).length})
                  </span>
                </Button>
              )}

              {stage === "Finished" && selectedRowIds.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    const selectedRows = stageRows.filter((r) => selectedRowIds.includes(r.id));
                    openDispatchModal(selectedRows);
                  }}
                  disabled={loading || stageRows.filter((r) => selectedRowIds.includes(r.id)).length === 0}
                  className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-800 text-white font-black text-xs h-9 px-3.5 gap-1.5 rounded-xl border border-emerald-400/50 shadow-[0_4px_14px_rgba(5,150,105,0.4)] hover:shadow-lg active:scale-95 shrink-0 animate-in fade-in transition-all cursor-pointer"
                  title="Dispatch selected glass units to Dispatched History"
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>
                    Send Selected to Dispatch ({stageRows.filter((r) => selectedRowIds.includes(r.id)).length} Units)
                  </span>
                </Button>
              )}

              {/* EXPORT EXCEL DROPDOWN BUTTON (Header Position) */}
              <div className="relative inline-block text-left shrink-0" ref={exportMenuRef}>
                <Button
                  ref={exportBtnRef}
                  type="button"
                  size="sm"
                  onClick={() => {
                    const willOpen = !isExportMenuOpen;
                    if (willOpen && exportBtnRef.current) {
                      const rect = exportBtnRef.current.getBoundingClientRect();
                      setExportMenuPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
                    }
                    setIsExportMenuOpen(willOpen);
                  }}
                  className="bg-gradient-to-r from-emerald-500 to-emerald-700 hover:bg-emerald-700 text-white font-extrabold text-xs h-9 px-3 gap-1.5 rounded-xl shadow-lg transition-all cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Export Excel</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${isExportMenuOpen ? "rotate-180" : ""}`} />
                </Button>

                {isExportMenuOpen && exportMenuPos && ReactDOM.createPortal(
                  <div
                    style={{ position: "fixed", top: exportMenuPos.top, right: exportMenuPos.right, zIndex: 9999 }}
                    className="w-64 bg-white border-2 border-emerald-300 rounded-2xl shadow-2xl p-2 space-y-1 animate-in fade-in zoom-in-95"
                  >
                    <div className="px-2.5 py-1.5 text-[11px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
                      Export Excel Options ({stage})
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setIsExportMenuOpen(false);
                        const exportItems = displayedRows.map((r) => r.item);
                        exportStageWipToExcel(stage, exportItems, `${stage}_Stage_Queue`, pis);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-800 hover:bg-emerald-50 hover:text-emerald-900 transition-colors flex items-center gap-2 cursor-pointer"
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
                          exportStageHistoryToExcel(stage, data.history || [], items, pis);
                        } catch {
                          toast.error("Failed to fetch stage completion history.");
                        }
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-800 hover:bg-blue-50 hover:text-blue-900 transition-colors flex items-center gap-2 cursor-pointer"
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
                          exportSelectedItemsToExcel(stage, selectedRows.map((r) => r.item), undefined, pis);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-800 hover:bg-blue-50/50 hover:text-purple-900 transition-colors flex items-center gap-2 cursor-pointer"
                      >
                        <CheckSquare className="w-4 h-4 text-[#1680f5] shrink-0" />
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
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-emerald-950 bg-emerald-50 hover:bg-emerald-100 transition-colors flex items-center gap-2 border border-emerald-200 cursor-pointer"
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
                  </div>,
                  document.body
                )}
              </div>

              {stage === "Finished" && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onNavigateTab ? onNavigateTab("dispatched-history") : undefined}
                  className="bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-extrabold text-xs h-9 px-3.5 gap-1.5 rounded-xl shadow-lg transition-all cursor-pointer shrink-0"
                  title="View complete historical archive of all dispatched glass items and units"
                >
                  <PackageCheck className="w-3.5 h-3.5" />
                  <span>Dispatched History</span>
                </Button>
              )}
            </div>
          </div>

          {/* Row 2: Universal Search + Client Filter */}
          <div className="flex items-center gap-3 pt-2.5 border-t border-slate-100 flex-wrap sm:flex-nowrap">
            {/* Universal Search Bar */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={`Search ${stage} queue by Serial, Barcode, Order #, Dimensions...`}
                className="pl-9 pr-8 h-9 bg-slate-50 border-slate-200 text-slate-900 text-xs rounded-xl focus:bg-white transition-all w-full"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Client Filter Dropdown */}
            {availableCustomers.length > 0 && (
              <div className="flex items-center gap-1.5 bg-slate-100/90 px-2.5 py-1 rounded-xl border border-slate-200 text-xs shrink-0">
                <span className="text-[11px] font-extrabold text-slate-600 flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-indigo-600" /> Client:
                </span>
                <select
                  value={selectedCustomerFilter}
                  onChange={(e) => {
                    setSelectedCustomerFilter(e.target.value);
                    setSelectedRowIds([]);
                  }}
                  className="bg-white text-slate-900 font-extrabold text-xs rounded-lg px-2.5 py-1 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer min-w-[130px] max-w-[240px] truncate"
                  title="Filter stage queue by Customer Name"
                >
                  <option value="ALL">All Clients ({availableCustomers.length})</option>
                  {availableCustomers.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.totalItems} pcs)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Sheet-Wise Navigation Header (Cutting stage) ── */}
      {stage === "Cutting" && (
        <div className="ppb-panel bg-white border border-slate-100 p-4 shadow-[0_4px_20px_rgb(22,128,245,0.04)] space-y-3 mb-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Custom Multi-Select & Drag-to-Select Sheet Dropdown */}
              <div className="relative inline-flex items-center" ref={sheetDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsSheetDropdownOpen((prev) => !prev)}
                  className="flex items-center justify-between gap-2.5 px-4 py-2 bg-gradient-to-r from-blue-50/80 to-[#f8fafc] border border-blue-100 hover:border-[#1680f5]/40 hover:shadow-[0_4px_12px_rgb(22,128,245,0.08)] text-[#1680f5] font-black text-xs rounded-xl shadow-lg focus:outline-none focus:ring-2 focus:ring-[#1680f5]/50 cursor-pointer transition-all min-w-[290px] max-w-[420px] text-left"
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
                  <ChevronDown className={`w-4 h-4 text-[#1680f5] shrink-0 transition-transform duration-200 ${isSheetDropdownOpen ? "rotate-180" : ""}`} />
                </button>

                {/* Dropdown Popup Menu */}
                {isSheetDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1.5 w-[380px] sm:w-[460px] max-w-[94vw] bg-white border border-blue-200 rounded-2xl shadow-[0_8px_30px_rgb(22,128,245,0.15)] z-50 overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-2 duration-150">
                    {/* Header with Drag Hint & Quick Presets */}
                    <div className="p-3 bg-gradient-to-r from-blue-50/90 to-[#f8fafc] border-b border-blue-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-black text-xs text-[#1680f5]">
                          <Layers className="w-3.5 h-3.5 text-[#1680f5]" />
                          <span>Select Raw Sheets for Cutting</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={handleSelectAllSheets}
                            className="px-2 py-0.5 text-[10.5px] font-black bg-[#1680f5]/10 hover:bg-[#1680f5]/20 text-[#1680f5] rounded-md transition-colors cursor-pointer"
                          >
                            All Sheets
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSheetRackNos([]);
                              setSelectedRowIds([]);
                            }}
                            className="px-2 py-0.5 text-[10.5px] font-black bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors cursor-pointer"
                          >
                            Reset
                          </button>
                        </div>
                      </div>

                      {/* Direct Range Selector Inputs */}
                      <form onSubmit={handleApplyRangeInput} className="flex items-center gap-1.5 bg-white p-1.5 rounded-xl border border-blue-100 shadow-2xs flex-wrap">
                        <span className="text-[10px] font-bold text-slate-500">From Sheet:</span>
                        <input
                          type="number"
                          min="1"
                          max={sheetGroups.length || 100}
                          value={rangeFromInput}
                          onChange={(e) => setRangeFromInput(e.target.value)}
                          className="w-12 h-6 px-1 text-center text-xs font-black bg-blue-50/50 border border-blue-200 rounded-md text-blue-950 focus:outline-none focus:ring-1 focus:ring-[#1680f5]"
                        />
                        <span className="text-[10px] font-bold text-slate-600">to</span>
                        <input
                          type="number"
                          min="1"
                          max={sheetGroups.length || 100}
                          value={rangeToInput}
                          onChange={(e) => setRangeToInput(e.target.value)}
                          className="w-12 h-6 px-1 text-center text-xs font-black bg-blue-50/50 border border-blue-200 rounded-md text-blue-950 focus:outline-none focus:ring-1 focus:ring-[#1680f5]"
                        />
                        <button
                          type="submit"
                          className="h-6 px-2.5 text-[10.5px] font-extrabold bg-[#1680f5] hover:bg-[#1470e0] text-white rounded-md transition-colors shadow-2xs ml-auto cursor-pointer"
                        >
                          Select Range
                        </button>
                      </form>
                    </div>

                    {/* Scrollable Sheet List (Interactive Click Checkboxes & Drag) */}
                    <div
                      ref={sheetScrollContainerRef}
                      className="max-h-[340px] overflow-y-auto p-1.5 space-y-1 select-none scroll-smooth"
                    >
                      {/* All Glasses Row */}
                      <div
                        onClick={handleSelectAllSheets}
                        className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-colors ${isAllSheetsSelected ? "bg-[#1680f5] text-white shadow-md" : "hover:bg-blue-50 text-slate-800"}`}
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
                            onClick={() => handleToggleSheet(g.rackNo)}
                            className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-all border ${isSelected ? "bg-[#1680f5] text-white border-blue-600 shadow-md scale-[1.005]" : isAllSheetsSelected ? "bg-slate-50/70 border-slate-100 text-slate-700 hover:bg-blue-50" : "hover:bg-blue-50 text-slate-800 border-transparent"}`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                onMouseDown={(e) => handleSheetGripMouseDown(index, g.rackNo, e)}
                                onMouseEnter={() => handleSheetMouseEnter(index)}
                                className="cursor-grab p-0.5"
                                title="Drag to select range"
                              >
                                <GripVertical className={`w-3.5 h-3.5 shrink-0 ${isSelected ? "text-purple-200" : "text-slate-300"}`} />
                              </div>
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleSheet(g.rackNo);
                                }}
                                className="cursor-pointer p-0.5"
                                title={isSelected ? `Uncheck Sheet ${g.rackNo}` : `Check Sheet ${g.rackNo}`}
                              >
                                {isSelected ? (
                                  <CheckSquare className="w-4 h-4 text-white" />
                                ) : (
                                  <Square className="w-4 h-4 text-slate-400 hover:text-[#1680f5]" />
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
                                isSelected ? "bg-white/20 text-white" : "bg-blue-100 text-blue-800"
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
                        className="bg-[#1680f5] hover:bg-gradient-to-r from-blue-500 to-blue-700 text-white text-xs font-bold h-7 px-3 rounded-lg shadow-sm cursor-pointer"
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
                  className="h-8 px-2.5 text-xs font-bold gap-1 rounded-xl border-blue-200 text-[#1680f5] hover:bg-blue-50/50 disabled:opacity-40"
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
                  className="h-8 px-2.5 text-xs font-bold gap-1 rounded-xl border-blue-200 text-[#1680f5] hover:bg-blue-50/50 disabled:opacity-40"
                  title="Next Sheet"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* Sheet Index Indicator & Export Excel Dropdown in Top Bar */}
            <div className="flex items-center gap-2.5">
              <div className="px-2.5 py-1 rounded-lg bg-blue-50/50 text-purple-900 border border-blue-200 text-[11px] font-black font-mono">
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
                  className="bg-gradient-to-r from-emerald-500 to-emerald-700 hover:bg-emerald-700 text-white font-extrabold text-xs h-8 px-3 gap-1.5 rounded-xl shadow-lg transition-all"
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
                        exportStageWipToExcel(stage, exportItems, `${stage}_Stage_Queue`, pis);
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
                          exportStageHistoryToExcel(stage, data.history || [], items, pis);
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
                          exportSelectedItemsToExcel(stage, selectedRows.map((r) => r.item), undefined, pis);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-800 hover:bg-blue-50/50 hover:text-purple-900 transition-colors flex items-center gap-2"
                      >
                        <CheckSquare className="w-4 h-4 text-[#1680f5] shrink-0" />
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
      <div className="ppb-panel p-0 overflow-hidden shadow-[0_12px_40px_rgb(22,128,245,0.12)] border border-slate-100/50 bg-white/60 backdrop-blur-xl rounded-3xl">
        {/* Table Summary Sub-bar */}
        <div className="ppb-panel-heading bg-gradient-to-r from-blue-50/50 via-white to-transparent border-b border-slate-100/80 p-5 m-0 flex items-center justify-between flex-wrap gap-4 relative overflow-hidden">
          <div className="flex items-center gap-2.5 flex-wrap">
            {stage === "Cutting" && (
              <label className="flex items-center gap-2 cursor-pointer bg-white px-2.5 py-1.5 rounded-xl border-2 border-blue-300 shadow-2xs hover:bg-blue-50/50 transition-colors mr-1">
                <input
                  type="checkbox"
                  checked={selectedRowIds.length === displayedRows.length && displayedRows.length > 0}
                  onChange={toggleSelectAll}
                  className="w-[18px] h-[18px] rounded-md border-slate-300 text-[#1680f5] focus:ring-[#1680f5] cursor-pointer"
                />
                <span className="text-xs font-black text-blue-950 select-none">
                  Select All Sheets ({displayedSheetGroups.length})
                </span>
              </label>
            )}

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
                    ? "bg-blue-100 text-blue-800 border-blue-200"
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
                  className="h-6 px-2 text-[10px] font-extrabold border-blue-200 text-[#1680f5] hover:bg-blue-50/50 rounded-lg shadow-2xs"
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

            {stage !== "Cutting" && groupedStageCustomerRows.length > 0 && (
              <div className="flex items-center gap-1 ml-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setAllStageCustomersExpanded(true)}
                  className="h-6 px-2 text-[10px] font-extrabold border-slate-200 text-slate-600 hover:bg-slate-100 rounded-lg shadow-2xs"
                >
                  Expand All
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setAllStageCustomersExpanded(false)}
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
                className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-800 text-white font-black text-xs h-7 px-3.5 gap-1.5 rounded-xl shadow-[0_4px_14px_rgba(5,150,105,0.4)] border border-emerald-400/50 hover:shadow-lg active:scale-95 transition-all animate-in fade-in"
              >
                <CheckCircle className="w-3.5 h-3.5 text-white" /> Cut & Advance Selected ({displayedRows.filter((r) => selectedRowIds.includes(r.id)).reduce((a, b) => a + (b.item.qty || 1), 0)} pcs)
              </Button>
            )}

            {stage === "Polishing" && selectedRowIds.length > 0 && (
              <Button
                size="sm"
                onClick={handleBatchComplete}
                disabled={loading}
                className="bg-cyan-600 hover:bg-cyan-700 active:bg-cyan-800 bg-gradient-to-r from-cyan-600 via-teal-600 to-cyan-700 hover:from-cyan-700 hover:to-teal-800 text-white font-black text-xs h-7 px-3.5 gap-1.5 rounded-xl shadow-[0_4px_14px_rgba(6,182,212,0.4)] border border-cyan-400/50 hover:shadow-lg active:scale-95 transition-all animate-in fade-in cursor-pointer"
                title="Advance selected polished glass pieces to Pairing"
              >
                <CheckCircle className="w-3.5 h-3.5 text-white" /> Polish & Advance Selected ({displayedRows.filter((r) => selectedRowIds.includes(r.id)).reduce((a, b) => a + (b.item.qty || 1), 0)} pcs)
              </Button>
            )}





            <div className="text-[11px] text-slate-500 font-mono">
              {stage === "Cutting" ? (
                <>
                  Total in Cutting Queue:{" "}
                  <strong className="text-[#1680f5] font-bold">
                    {displayedSheetGroups.length} {displayedSheetGroups.length === 1 ? "Sheet" : "Sheets"} ({stageRows.length} pcs)
                  </strong>
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
                    {stageRows.length} {stageRows.length === 1 ? "Laminated Unit" : "Laminated Units"}
                  </strong>
                </>
              ) : stage === "Finished" ? (
                <>
                  Total in Finished Queue:{" "}
                  <strong className="text-emerald-700 font-bold">
                    {stageRows.length} {stageRows.length === 1 ? "Finished Unit" : "Finished Units"}
                  </strong>
                </>
              ) : stage === "Polishing" ? (
                <>
                  Total in Polishing Queue:{" "}
                  <strong className="text-cyan-700 font-bold">
                    {stageRows.length} {stageRows.length === 1 ? "Pane" : "Panes"}
                  </strong>
                </>
              ) : (
                <>
                  Total In Stage Queue: <strong className="text-[#1680f5] font-bold">{stageItems.length} Stickers</strong>
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
              <div className="text-center py-12 px-4 bg-white rounded-2xl border-2 border-dashed border-blue-200 max-w-xl mx-auto my-6 space-y-4 shadow-lg">
                <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-2xs">
                  <CheckCircle className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-black text-slate-800 text-base">
                    All sheets in this batch have been cut!
                  </h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    All raw glass sheets have been cut and successfully advanced to the next stage (Glass Pairing / Buffer).
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
                  <Button
                    type="button"
                    onClick={() => {
                      setSelectedBatchId(null);
                      setSelectedSheetRackNo("ALL");
                      setSelectedSheetRackNos(["ALL"]);
                      setFinishFilter("ALL");
                      setSelectedRowIds([]);
                    }}
                    className="bg-[#1680f5] hover:bg-[#1470e0] text-white font-extrabold text-xs h-9 px-4 gap-2 rounded-xl shadow-lg transition-all cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to All Batches</span>
                  </Button>
                  {onNavigateTab && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onNavigateTab("Pairing")}
                      className="border-indigo-300 text-indigo-700 hover:bg-indigo-50 font-extrabold text-xs h-9 px-4 gap-2 rounded-xl transition-all cursor-pointer"
                    >
                      <span>Go to Glass Pairing</span>
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              displayedSheetGroups.map((group, groupIndex) => {
                const isExpanded = isSingleSheet || !!expandedSheets[group.rackNo];
                const allGroupRowIds = group.rows.map((r) => r.id);
                const isGroupAllSelected = allGroupRowIds.every((id) => selectedRowIds.includes(id));
                const isGroupSomeSelected = !isGroupAllSelected && allGroupRowIds.some((id) => selectedRowIds.includes(id));
                const totalPieces = group.rows.reduce((a, b) => a + (b.item.qty || 1), 0);

                return (
                  <div
                    key={group.rackNo}
                    className="ppb-panel p-0 overflow-hidden transition-all duration-300 hover:border-[#1680f5] shadow-[0_4px_20px_rgb(22,128,245,0.04)]"
                  >
                    {/* Sheet Header Row (Displays Sheet ONE time only) */}
                    <div
                      onClick={() => toggleSheetExpand(group.rackNo)}
                      className={`ppb-panel-heading m-0 p-4 flex items-center justify-between flex-wrap gap-3 cursor-pointer transition-all duration-300 border-b-0 ${isExpanded ? "bg-gradient-to-r from-blue-50/80 to-[#f8fafc]" : "hover:bg-blue-50/40"}`}
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
                              className="w-[18px] h-[18px] rounded-md border-slate-300 text-[#1680f5] focus:ring-[#1680f5] cursor-pointer"
                            />
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          <div 
                            className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1680f5] to-[#1470e0] text-white flex items-center justify-center font-black text-sm shadow-md hover:scale-105 transition-transform duration-300"
                            title={`Sheet Serial #${groupIndex + 1}`}
                          >
                            {groupIndex + 1}
                          </div>
                          <div>
                            <div className="font-extrabold text-sm text-slate-900 flex items-center gap-2 flex-wrap">
                              <span>Raw Sheet {group.rackNo}</span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1680f5]/10 text-[#1680f5] border border-[#1680f5]/20">
                                {totalPieces} {totalPieces === 1 ? "Piece" : "Pieces"} • {group.totalSqm.toFixed(2)} m²
                              </span>
                              <span
                                className={`text-[9.5px] font-black px-1.5 py-0.2 rounded border ${
                                  group.finish === "Colour"
                                    ? "bg-blue-100 text-blue-800 border-blue-200"
                                    : "bg-cyan-100 text-cyan-800 border-cyan-200"
                                }`}
                              >
                                {group.finish === "Colour" ? "Colour" : "Clear"}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center gap-2 flex-wrap">
                              {group.items[0]?.piNumber && (
                                <span className="px-2 py-0.5 rounded-full bg-blue-50/50 text-[#1680f5] border border-blue-200 font-bold">
                                  PI: {formatBatchNumber(group.items[0].piNumber)}
                                </span>
                              )}
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300 font-bold">
                                Batch: {group.items[0]?.batchNo || group.items[0]?.sfoNo || group.sfoList.join(", ") || "—"}
                              </span>
                              <span>SFO: <strong className="text-[#1680f5]">{group.sfoList.join(", ")}</strong></span>
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
                      <div className="flex items-center gap-2 flex-wrap ml-auto">
                        <Button
                          type="button"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAdvanceSheet(group.rows);
                          }}
                          className="h-8 text-xs font-black bg-orange-600 hover:bg-orange-700 active:bg-orange-800 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl shadow-[0_4px_14px_rgba(234,88,12,0.4)] gap-1.5 cursor-pointer transition-all hover:-translate-y-0.5 border border-orange-400/50"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-orange-100" />
                          <span>Cut & Advance Sheet {group.rackNo} ({totalPieces} pcs)</span>
                        </Button>

                        <div className="flex items-center gap-1 text-xs font-bold text-[#1680f5] bg-blue-50/50 backdrop-blur-sm border border-blue-200/60 px-3 py-1.5 rounded-xl shadow-sm hover:shadow-md cursor-pointer">
                          <span>{isExpanded ? "Hide Data" : `Show All Data (${totalPieces})`}</span>
                          <ChevronDown className={`w-4 h-4 text-[#1680f5] transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                        </div>

                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSheet(group);
                          }}
                          className="h-8 text-xs font-bold border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-300 rounded-xl shadow-2xs gap-1.5 cursor-pointer shrink-0"
                          title={`Delete Sheet ${group.rackNo} (${totalPieces} pcs)`}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-600" />
                          <span>Delete Sheet {group.rackNo}</span>
                        </Button>
                      </div>
                    </div>

                    {/* Expanded Data Table (Shows all panels for this sheet) */}
                    {isExpanded && (
                      <TableHorizontalScrollWrapper className="border-t border-slate-100/50 bg-white/50 backdrop-blur-sm rounded-b-3xl">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-slate-100/80 text-[10px] font-extrabold text-[#1680f5] uppercase tracking-widest bg-gradient-to-r from-blue-50/80 to-transparent">
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
                                  className="w-[18px] h-[18px] rounded-md border-slate-300 text-[#1680f5] focus:ring-[#1680f5] cursor-pointer"
                                />
                              </th>
                              <th className="py-2.5 px-2 text-center whitespace-nowrap">PI</th>
                              <th className="py-2.5 px-2 text-center whitespace-nowrap">Batch</th>
                              <th className="py-2.5 px-2 text-center whitespace-nowrap">Pos</th>
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
                                  className={`hover:bg-blue-50/40 transition-colors ${isSelected ? "bg-blue-50/70" : ""}`}
                                >
                                  <td className="py-2.5 px-3 text-center align-middle">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleSelect(row.id)}
                                      className="w-3.5 h-3.5 rounded border-slate-300 text-[#1680f5] focus:ring-[#1680f5] cursor-pointer"
                                    />
                                  </td>
                                  {/* PI Number */}
                                  <td className="py-2.5 px-2 text-center align-middle whitespace-nowrap font-mono">
                                    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded font-mono font-bold text-xs bg-blue-50/50 text-[#1680f5] border border-blue-200 shadow-2xs">
                                      {item.orderNo || item.piNumber || (row as any).piNumber || "—"}
                                    </span>
                                  </td>
                                  {/* Batch Number */}
                                  <td className="py-2.5 px-2 text-center align-middle whitespace-nowrap font-mono">
                                    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded font-mono font-bold text-xs bg-slate-100 text-slate-800 border border-slate-300 shadow-2xs">
                                      {item.batchNo || item.sfoNo || (row as any).batchNo || (row as any).sfoNo || "—"}
                                    </span>
                                  </td>
                                  {/* Pos Number */}
                                  <td className="py-2.5 px-2 text-center align-middle whitespace-nowrap font-mono">
                                    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg font-mono font-extrabold text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs min-w-[32px]">
                                      {item.posNo || (row as any).posNo || "—"}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-2 font-mono font-bold align-middle">
                                    <span className="text-[#1680f5]">{row.displaySerial}</span>
                                  </td>
                                  <td className="py-2.5 px-2 font-mono text-slate-600 align-middle text-[11px]">
                                    {resolveValidBarcode(item, row.displayBarcode)}
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
                                            ? "bg-blue-100 text-blue-800 border-blue-200"
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
                                                  ? "bg-gradient-to-r from-teal-500 to-teal-700 text-white"
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
                                        className="h-7 px-2.5 text-xs font-bold bg-gradient-to-r from-teal-500 to-teal-700 hover:bg-teal-700 text-white gap-1 rounded-lg"
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
                                          handleDeleteItem(item);
                                        }}
                                        className="w-7 h-7 rounded-full border border-rose-300 bg-white text-rose-600 hover:bg-rose-50 hover:border-rose-400 flex items-center justify-center transition-all shadow-2xs shrink-0 cursor-pointer"
                                        title={`Delete Piece #${item.serialNumber}`}
                                      >
                                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </TableHorizontalScrollWrapper>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* Non-Cutting Stage View (Customer-Grouped by default, or Flat Table) */
          (() => {
            const renderStageRowsTable = (rows: StageRowItem[]) => {
              const selectableRows =
                stage === "DGU"
                  ? rows.filter((r) => r.dguPairReady)
                  : stage === "Lamination"
                  ? rows.filter((r) => !r.isHolding)
                  : rows;

              const allSelectableSelected =
                selectableRows.length > 0 && selectableRows.every((r) => selectedRowIds.includes(r.id));

              const handleToggleCustomerSelectAll = () => {
                if (selectableRows.length === 0) return;
                const ids = selectableRows.map((r) => r.id);
                if (allSelectableSelected) {
                  setSelectedRowIds((prev) => prev.filter((id) => !ids.includes(id)));
                } else {
                  setSelectedRowIds((prev) => Array.from(new Set([...prev, ...ids])));
                }
              };

              return (
                <TableHorizontalScrollWrapper>
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100/80 text-[10px] font-extrabold text-[#1680f5] uppercase tracking-widest bg-gradient-to-r from-blue-50/80 to-transparent">
                        {stage !== "Finished" && (
                          <th className="py-2.5 px-3 w-8 text-center">
                            <input
                              type="checkbox"
                              checked={allSelectableSelected}
                              disabled={selectableRows.length === 0}
                              onChange={handleToggleCustomerSelectAll}
                              className="w-[18px] h-[18px] rounded-md border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                              title={
                                stage === "DGU" && selectableRows.length === 0
                                  ? "Cannot select all: no DGU units have matching Clear glass cut yet"
                                  : stage === "Lamination" && selectableRows.length === 0
                                  ? "Cannot select all: all DLGU items are holding in staging awaiting Colour glass cutting"
                                  : "Select all"
                              }
                            />
                          </th>
                        )}
                        <th className="py-2.5 px-2 text-center whitespace-nowrap">PI</th>
                        <th className="py-2.5 px-2 text-center whitespace-nowrap">Batch</th>
                        <th className="py-2.5 px-2 text-center whitespace-nowrap">Pos</th>

                        <th className="py-2.5 px-2">
                          {stage === "DGU" ? "Outer Panel Barcode" : "Barcode"}
                        </th>
                        <th className="py-2.5 px-2 text-center">{stage === "DGU" || stage === "Lamination" ? "QTY (Units)" : stage === "Finished" ? "QTY (Units/Pcs)" : "QTY"}</th>
                        <th className="py-2.5 px-2 text-right">SQM</th>
                        <th className="py-2.5 px-2">Size (W × H)</th>
                        <th className="py-2.5 px-2">{stage === "DGU" ? "Outer Panel Glass Spec" : "Glass Type / Specification"}</th>
                        <th className="py-2.5 px-2">{stage === "Finished" ? "Product Type & Finish" : "Finish"}</th>
                        <th className="py-2.5 px-2">Route Flow</th>
                        {stage === "Finished" && <th className="py-2.5 px-2 text-center whitespace-nowrap">IP Glass</th>}
                        <th className="py-2.5 px-3 text-right">
                          {stage === "Polishing" && rows.some((r) => selectedRowIds.includes(r.id)) ? (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => {
                                const currentTableSelected = rows.filter((r) => selectedRowIds.includes(r.id));
                                const serialsToAdvance = Array.from(new Set(currentTableSelected.flatMap((r) => r.allSerials)));
                                setSelectedRowIds((prev) => prev.filter((id) => !currentTableSelected.some((r) => r.id === id)));
                                completeStage(serialsToAdvance, undefined, true);
                              }}
                              disabled={loading}
                              className="h-7 px-3 text-[11px] font-black bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg shadow-sm gap-1 transition-all cursor-pointer inline-flex items-center"
                              title="Advance all selected items in this table"
                            >
                              <CheckCircle className="w-3.5 h-3.5" /> Advance Selected ({rows.filter((r) => selectedRowIds.includes(r.id)).reduce((a, b) => a + (b.item.qty || 1), 0)} pcs)
                            </Button>
                          ) : (
                            "Actions"
                          )}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.length === 0 ? (
                        <tr>
                          <td colSpan={stage === "Finished" ? 13 : 13} className="text-center py-12 text-slate-500">
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
                        rows.map((row) => {
                          const isSelected = selectedRowIds.includes(row.id);
                          const item = row.item;
                          let partner = row.partnerItem;
                          if (!partner && stage === "Finished") {
                            partner =
                              items.find(
                                (other) =>
                                  other.id !== item.id &&
                                  other.serialNumber !== item.serialNumber &&
                                  isDguStickerPairMatch(item, other)
                              ) || null;
                          }

                          const allPartners: GlassItem[] =
                            row.partnerItems && row.partnerItems.length > 0
                              ? row.partnerItems
                              : partner
                              ? [partner]
                              : [];

                          const itemFinish = getItemFinish(item);
                          const hasPartner = stage === "Finished" && allPartners.length > 0;
                          const isPartnerExpanded = expandedPartnerRows.has(row.id);
                          // Column count for the partner sub-row colspan
                          const colSpanCount = 13;

                          return (
                            <React.Fragment key={row.id}>
                            <tr
                              className={`hover:bg-teal-50/50 hover:shadow-inner transition-all duration-200 ${
                                isSelected ? "bg-teal-50/60" : ""
                              } ${hasPartner && isPartnerExpanded ? "border-b-0 bg-teal-50/20" : ""}`}
                            >
                              {stage !== "Finished" && (
                                <td className="py-2.5 px-3 text-center align-middle">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    disabled={(stage === "DGU" && !row.dguPairReady) || (stage === "Lamination" && !!row.isHolding)}
                                    onChange={() => toggleSelect(row.id)}
                                    className={`w-3.5 h-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500 ${
                                      (stage === "DGU" && !row.dguPairReady) || (stage === "Lamination" && !!row.isHolding)
                                        ? "opacity-30 cursor-not-allowed"
                                        : "cursor-pointer"
                                    }`}
                                    title={
                                      stage === "DGU" && !row.dguPairReady
                                        ? "Cannot select: matching Clear glass has not been cut yet"
                                        : stage === "Lamination" && row.isHolding
                                        ? "Cannot select: DLGU glass is held in Lamination staging awaiting Colour glass cutting"
                                        : "Select row"
                                    }
                                  />
                                </td>
                              )}

                              {/* PI Number */}
                              <td className="py-2.5 px-2 text-center align-middle whitespace-nowrap font-mono">
                                <span className="inline-flex items-center justify-center px-2 py-0.5 rounded font-mono font-bold text-xs bg-blue-50/50 text-[#1680f5] border border-blue-200 shadow-2xs">
                                  {item.orderNo || item.piNumber || (row as any).piNumber || "—"}
                                </span>
                              </td>

                              {/* Batch Number */}
                              <td className="py-2.5 px-2 text-center align-middle whitespace-nowrap font-mono">
                                <span className="inline-flex items-center justify-center px-2 py-0.5 rounded font-mono font-bold text-xs bg-slate-100 text-slate-800 border border-slate-300 shadow-2xs">
                                  {item.batchNo || item.sfoNo || (row as any).batchNo || (row as any).sfoNo || "—"}
                                </span>
                              </td>

                              {/* Position Number */}
                              <td className="py-2.5 px-2 text-center align-middle whitespace-nowrap font-mono">
                                <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg font-mono font-extrabold text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs min-w-[32px]">
                                  {item.posNo || (row as any).posNo || "—"}
                                </span>
                              </td>



                              {/* Barcode */}
                              <td className="py-2.5 px-2 font-mono text-slate-600 align-middle text-[11px] whitespace-nowrap">
                                <div>{resolveValidBarcode(item, row.displayBarcode)}</div>
                                {stage === "DGU" && (
                                  <span className="text-[9.5px] text-[#1680f5] block font-mono font-bold">
                                    Scan Target (Colour)
                                  </span>
                                )}
                              </td>

                              {/* QTY */}
                              <td className="py-2.5 px-2 text-center align-middle whitespace-nowrap">
                                <span className="px-2 py-0.5 rounded-lg font-mono font-black text-xs bg-slate-100 text-slate-900 border border-slate-200 shadow-2xs">
                                  {item.qty || 1} {stage === "DGU" || stage === "Lamination" || (stage === "Finished" && (row.isDguPair || row.glassCategory === "DGU" || row.glassCategory === "DLGU" || row.glassCategory === "Laminated")) ? (item.qty === 1 ? "unit" : "units") : item.qty === 1 ? "pc" : "pcs"}
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
                                    <div className="text-[10px] font-semibold flex flex-col gap-0.5 mt-0.5">
                                      <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200 font-bold inline-block w-fit">
                                        DLGU Inner Lam • Sub-Assembly Unit
                                      </span>
                                      <span className="text-emerald-700 font-bold flex items-center gap-1 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded w-fit">
                                        <CheckCircle className="w-3 h-3 text-emerald-600" />
                                        Ready to complete Lamination & advance to Pairing Buffer
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
                                      <div className="text-[10px] text-blue-800 font-extrabold flex items-center gap-1 mt-0.5">
                                        <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200 font-bold">
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
                                    <div className="text-[10px] text-[#1680f5] font-medium mt-0.5">
                                      Double Laminated Unit (DLGU)
                                    </div>
                                  ) : row.glassCategory === "DGU" || row.isDguPair ? (
                                    <div className="text-[10px] text-teal-700 font-medium mt-0.5">
                                      Paired DGU / IGU Unit
                                    </div>
                                  ) : row.glassCategory === "Laminated" ? (
                                    <div className="text-[10px] text-amber-700 font-medium mt-0.5">
                                      Laminated Glass Unit
                                    </div>
                                  ) : (
                                    <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                                      General Monolithic Glass
                                    </div>
                                  )
                                )}
                              </td>

                              {/* Finish */}
                              <td className="py-2.5 px-2 align-middle whitespace-nowrap">
                                {stage === "Lamination" ? (
                                  isDlguGlass(item) || (item as any).glassCategory === "DLGU" ? (
                                    <span className="px-2 py-0.5 rounded text-[9.5px] font-black bg-blue-100 text-blue-800 border border-blue-200">
                                      DLGU (To DGU)
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded text-[9.5px] font-black bg-amber-100 text-amber-800 border border-amber-200">
                                      Direct Lam
                                    </span>
                                  )
                                ) : stage === "DGU" ? (
                                  row.glassCategory === "DLGU" ? (
                                    <span className="px-2 py-0.5 rounded text-[9.5px] font-black bg-blue-100 text-blue-800 border border-blue-200">
                                      DLGU Unit
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded text-[9.5px] font-black bg-teal-100 text-teal-800 border border-teal-200">
                                      DGU Unit
                                    </span>
                                  )
                                ) : stage === "Finished" && row.glassCategory === "DLGU" ? (
                                  <span className="px-2 py-0.5 rounded text-[9.5px] font-black bg-blue-100 text-blue-800 border border-blue-200">
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
                                        ? "bg-blue-100 text-blue-800 border-blue-200"
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
                                              ? "bg-gradient-to-r from-teal-500 to-teal-700 text-white"
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

                              {/* IP Glass expand column (Finished stage only) */}
                              {stage === "Finished" && (
                                <td className="py-2.5 px-2 align-middle text-center whitespace-nowrap">
                                  {hasPartner ? (
                                    <button
                                      type="button"
                                      onClick={() => togglePartnerExpand(row.id)}
                                      title={isPartnerExpanded ? "Hide IP (Inner Pane) Glass details" : "Show IP (Inner Pane) Glass details"}
                                      className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg text-[10.5px] font-bold border transition-all cursor-pointer shadow-2xs ${
                                        isPartnerExpanded
                                          ? "bg-teal-700 text-white border-teal-800 ring-2 ring-teal-200"
                                          : "bg-teal-50 text-teal-800 border-teal-300 hover:bg-teal-100 hover:border-teal-400"
                                      }`}
                                    >
                                      <Link2 className="w-3.5 h-3.5 text-current shrink-0" />
                                      <span>IP Glass</span>
                                      <ChevronDown className={`w-3.5 h-3.5 text-current shrink-0 transition-transform duration-200 ${isPartnerExpanded ? "rotate-180" : ""}`} />
                                    </button>
                                  ) : (
                                    <span className="text-[10px] text-slate-400 font-medium px-2 py-0.5 rounded bg-slate-100 border border-slate-200">
                                      Single Lite
                                    </span>
                                  )}
                                </td>
                              )}

                              {/* Actions */}
                              <td className="py-2.5 px-3 text-right align-middle whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1.5">
                                  {isFinished ? (
                                    <Button
                                      size="sm"
                                      disabled={loading}
                                      onClick={() => openDispatchModal([row])}
                                      className="h-7 px-2.5 text-xs font-bold rounded-lg shadow-2xs gap-1 bg-gradient-to-r from-emerald-500 to-emerald-700 hover:bg-emerald-700 text-white cursor-pointer shrink-0"
                                      title="Dispatch this glass unit to Dispatched History"
                                    >
                                      <Truck className="w-3.5 h-3.5" />
                                      <span>Dispatch</span>
                                    </Button>
                                  ) : (
                                    <Button
                                      size="sm"
                                      disabled={loading || (stage === "DGU" && !row.dguPairReady) || (stage === "Lamination" && !!row.isHolding)}
                                      onClick={() => openScanModal(row)}
                                      className={`h-7 px-2.5 text-xs font-bold rounded-lg shadow-2xs gap-1 ${
                                        (stage === "DGU" && !row.dguPairReady) || (stage === "Lamination" && !!row.isHolding)
                                          ? "bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-100 cursor-not-allowed font-extrabold"
                                          : "bg-gradient-to-r from-teal-500 to-teal-700 hover:bg-teal-700 text-white"
                                      }`}
                                      title={
                                        stage === "DGU" && !row.dguPairReady
                                          ? `Cannot assemble: waiting for matching ${row.dguWaitingFinish} glass`
                                          : stage === "Lamination" && row.isHolding
                                          ? "Held in Lamination Staging: Cannot advance until matching Colour glass is cut in Cutting Workstation"
                                          : stage === "DGU"
                                          ? "Scan Outer Panel Colour barcode to complete DGU Unit"
                                          : "Scan & verify"
                                      }
                                    >
                                      {stage === "Lamination" && row.isHolding ? (
                                        <>
                                          <Clock className="w-3 h-3 text-amber-600 animate-pulse" /> Holding (Cut Pending)
                                        </>
                                      ) : (
                                        <>
                                          <Play className="w-3 h-3 fill-current" /> {stage === "DGU" ? "Scan & Finish" : "Scan"}
                                        </>
                                      )}
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
                                      onReject({
                                        ...item,
                                        partnerItem: row.partnerItem,
                                        allSerials: row.allSerials,
                                        isDguPair: row.isDguPair,
                                        glassCategory: row.glassCategory,
                                      } as any);
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
                                      onRework({
                                        ...item,
                                        partnerItem: row.partnerItem,
                                        allSerials: row.allSerials,
                                        isDguPair: row.isDguPair,
                                        glassCategory: row.glassCategory,
                                      } as any);
                                    }}
                                    className="w-7 h-7 rounded-full border border-amber-300 bg-white text-amber-600 hover:bg-amber-50 hover:border-amber-400 flex items-center justify-center transition-all shadow-2xs shrink-0 cursor-pointer"
                                    title="Send Item to Rework"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {/* ── IP Glass Partner Detail Sub-Row (Expandable Dropdown for Finished/Dispatch Stage) ── */}
                            {stage === "Finished" && hasPartner && isPartnerExpanded && (
                              <tr className="bg-slate-100/90 border-b-2 border-teal-400/80 shadow-inner">
                                <td colSpan={colSpanCount} className="p-0">
                                  <div className="sticky left-0 w-full max-w-6xl p-3 sm:p-4">
                                    <div className="bg-white rounded-2xl border-2 border-teal-400 shadow-lg overflow-hidden">
                                      {/* Header bar of the expanded IP pane */}
                                      <div className="px-4 py-3 bg-gradient-to-r from-teal-50 via-slate-50 to-indigo-50/40 border-b border-teal-200/80 flex items-center justify-between flex-wrap gap-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="w-7 h-7 rounded-lg bg-gradient-to-r from-teal-500 to-teal-700 text-white flex items-center justify-center shrink-0 shadow-2xs">
                                            <Link2 className="w-4 h-4" />
                                          </span>
                                          <div>
                                            <div className="text-xs font-black text-slate-900 flex items-center gap-2 flex-wrap">
                                              <span>Partner Glass Details — Inner Pane (IP)</span>
                                              <span className="text-slate-400 font-normal">•</span>
                                              <span className="text-teal-800 font-bold">
                                                Paired with Outer Pane (OP) #{item.serialNumber}
                                              </span>
                                            </div>
                                            <div className="text-[10px] text-slate-500 font-medium">
                                              Order / PI: {item.orderNo || item.piNumber || "—"} • Batch: {item.batchNo || item.sfoNo || "—"} • Position #{item.posNo || "—"}
                                            </div>
                                          </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                          <span
                                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-black border ${
                                              row.glassCategory === "DLGU"
                                                ? "bg-blue-100 text-purple-900 border-blue-300"
                                                : row.glassCategory === "Laminated"
                                                ? "bg-amber-100 text-amber-900 border-amber-300"
                                                : "bg-teal-100 text-teal-900 border-teal-300"
                                            }`}
                                          >
                                            {row.glassCategory === "DLGU"
                                              ? "DLGU Double Laminated Unit"
                                              : row.glassCategory === "Laminated"
                                              ? "Laminated Unit"
                                              : "DGU / IGU Unit"}
                                          </span>

                                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                            Verified Complete Unit
                                          </span>

                                          <button
                                            type="button"
                                            onClick={() => togglePartnerExpand(row.id)}
                                            className="text-xs font-bold text-slate-600 hover:text-slate-900 px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 transition-colors flex items-center gap-1 cursor-pointer shadow-2xs ml-1"
                                          >
                                            <ChevronUp className="w-3.5 h-3.5" />
                                            <span>Hide</span>
                                          </button>
                                        </div>
                                      </div>

                                      {/* List of partner IP panes */}
                                      <div className="p-3.5 sm:p-4 space-y-3 bg-slate-50/50">
                                        {allPartners.map((p, pIdx) => {
                                          const pFinish = getItemFinish(p);
                                          const pBarcode = resolveValidBarcode(p);
                                          return (
                                            <div
                                              key={p.id || p.serialNumber || pIdx}
                                              className="bg-gradient-to-br from-teal-50/80 to-white/60 backdrop-blur-sm rounded-2xl border border-teal-200 p-4 shadow-sm hover:shadow-md hover:border-teal-400 transition-all"
                                            >
                                              <div className="flex items-center justify-between flex-wrap gap-2 pb-2.5 border-b border-slate-100 mb-3">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                  <span className="px-2 py-0.5 rounded-md bg-teal-100 text-teal-900 text-xs font-mono font-black border border-teal-200">
                                                    IP Pane #{pIdx + 1}
                                                  </span>
                                                  <span className="text-xs font-mono font-black text-[#1680f5] bg-blue-50/50 px-2 py-0.5 rounded border border-blue-200">
                                                    Serial: {p.serialNumber}
                                                  </span>
                                                  <span className="text-xs font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                                    Barcode: <span className="font-bold text-slate-900">{pBarcode}</span>
                                                  </span>
                                                  <span className="text-xs font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 font-bold">
                                                    POS: {p.posNo || "—"}
                                                  </span>
                                                  <span
                                                    className={`px-2 py-0.5 rounded text-[10px] font-black border ${
                                                      pFinish === "Colour"
                                                        ? "bg-blue-100 text-blue-800 border-blue-200"
                                                        : "bg-cyan-100 text-cyan-800 border-cyan-200"
                                                    }`}
                                                  >
                                                    {pFinish} Finish
                                                  </span>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                  <button
                                                    type="button"
                                                    onClick={() => onPrintSticker(p)}
                                                    className="px-2.5 py-1 rounded-lg text-xs font-bold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 shadow-2xs cursor-pointer"
                                                    title="Print IP Glass Sticker"
                                                  >
                                                    <Tag className="w-3.5 h-3.5 text-slate-600" />
                                                    <span>Print IP Sticker</span>
                                                  </button>
                                                </div>
                                              </div>

                                              {/* Grid details */}
                                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-12 gap-2.5 text-xs">
                                                <div className="bg-slate-50/80 rounded-lg p-2.5 border border-slate-200/80 col-span-2 sm:col-span-1 md:col-span-3">
                                                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Glass Specification</div>
                                                  <div className="font-bold text-slate-900 truncate mt-1 text-xs" title={p.glassType || p.itemCode || ""}>
                                                    {p.glassType || p.itemCode || "Clear Float Glass"}
                                                  </div>
                                                </div>

                                                <div className="bg-slate-50/80 rounded-lg p-2.5 border border-slate-200/80 col-span-1 md:col-span-2">
                                                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Dimensions (W × H)</div>
                                                  <div className="font-bold text-slate-900 mt-1 text-xs font-mono">
                                                    {p.width} × {p.height} mm
                                                  </div>
                                                </div>

                                                <div className="bg-slate-50/80 rounded-lg p-2.5 border border-slate-200/80 col-span-1 md:col-span-2">
                                                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Area (SQM) & QTY</div>
                                                  <div className="font-bold text-emerald-700 mt-1 text-xs font-mono">
                                                    {(p.sqm || ((p.width * p.height) / 1000000)).toFixed(2)} m² • {p.qty || 1} {p.qty === 1 ? "pc" : "pcs"}
                                                  </div>
                                                </div>

                                                <div className="bg-slate-50/80 rounded-lg p-2.5 border border-slate-200/80 col-span-1 md:col-span-2">
                                                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current Location</div>
                                                  <div className="font-bold text-teal-700 mt-1 text-xs flex items-center gap-1">
                                                    <CheckCircle className="w-3 h-3 text-emerald-600 shrink-0" />
                                                    <span>{p.currentStage || "Finished Warehouse"}</span>
                                                  </div>
                                                </div>

                                                <div className="bg-slate-50/80 rounded-lg p-2.5 border border-slate-200/80 col-span-2 sm:col-span-2 md:col-span-3">
                                                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Route Flow</div>
                                                  <div className="flex items-center gap-1 mt-1 overflow-x-auto no-scrollbar">
                                                    {p.processRoute.map((stg, stgIdx) => (
                                                      <React.Fragment key={stg}>
                                                        <span
                                                          className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold whitespace-nowrap shrink-0 ${
                                                            stg === p.currentStage
                                                              ? "bg-gradient-to-r from-teal-500 to-teal-700 text-white"
                                                              : p.completedStages?.includes(stg)
                                                              ? "bg-emerald-100 text-emerald-700"
                                                              : "bg-slate-200 text-slate-600"
                                                          }`}
                                                        >
                                                          {stg}
                                                        </span>
                                                        {stgIdx < p.processRoute.length - 1 && (
                                                          <ArrowRight className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                                        )}
                                                      </React.Fragment>
                                                    ))}
                                                  </div>
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>

                                      <div className="px-4 py-2 bg-teal-50/70 border-t border-teal-200/70 text-[11px] text-teal-900 flex items-center justify-between flex-wrap gap-2">
                                        <div className="flex items-center gap-1.5 font-medium">
                                          <Sparkles className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                                          <span>
                                            <strong>Pair Verification:</strong> Outer Pane (OP #{item.serialNumber}) & Inner Pane (IP) are verified together in Finished Dispatch Queue.
                                          </span>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => togglePartnerExpand(row.id)}
                                          className="text-[11px] font-bold text-teal-800 hover:text-teal-950 underline cursor-pointer"
                                        >
                                          Close Details ▲
                                        </button>
                                      </div>
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
              <div className="space-y-3">
                {groupedStageCustomerRows.length > 0 ? (
                  groupedStageCustomerRows.map((customer) => {
                    const isExpanded = isStageCustomerExpanded(customer.groupKey);

                    return (
                      <div
                        key={customer.groupKey}
                        className={`bg-white/80 backdrop-blur-xl border border-white/60 rounded-3xl shadow-[0_8px_30px_rgb(22,128,245,0.05)] hover:shadow-[0_12px_40px_rgb(22,128,245,0.1)] hover:border-[#1680f5]/30 transition-all duration-300 relative overflow-hidden group ${
                          stage === "DGU"
                            ? "hover:border-teal-300"
                            : stage === "Lamination"
                            ? "hover:border-amber-300"
                            : "hover:border-emerald-300"
                        }`}
                      >
                        {/* Customer Summary Card Header (Click to Toggle - Closed by default) */}
                        <div
                          onClick={() => toggleStageCustomerExpanded(customer.groupKey)}
                          className={`p-4 cursor-pointer select-none transition-colors ${
                            stage === "DGU"
                              ? "bg-gradient-to-r from-slate-50/70 via-white to-teal-50/20 hover:from-teal-50/30"
                              : stage === "Lamination"
                              ? "bg-gradient-to-r from-slate-50/70 via-white to-amber-50/20 hover:from-amber-50/30"
                              : "bg-gradient-to-r from-slate-50/70 via-white to-emerald-50/20 hover:from-emerald-50/30"
                          }`}
                        >
                          <div className="flex items-start md:items-center justify-between gap-4 flex-col md:flex-row">
                            {/* Left: Customer Info */}
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <div
                                className={`w-10 h-10 rounded-xl text-white flex items-center justify-center font-black text-sm shrink-0 shadow-lg ${
                                  stage === "DGU"
                                    ? "bg-gradient-to-br from-teal-600 to-cyan-700"
                                    : stage === "Lamination"
                                    ? "bg-gradient-to-br from-amber-600 to-orange-700"
                                    : "bg-gradient-to-br from-emerald-600 to-teal-700"
                                }`}
                              >
                                <Building2 className="w-5 h-5" />
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3
                                    className="text-base font-extrabold text-rose-700 truncate flex items-center gap-1.5"
                                    title={customer.pdfFiles && customer.pdfFiles.length > 0 ? customer.pdfFiles.join(', ') : customer.customerName}
                                  >
                                    <FileText className="w-4 h-4 text-rose-500 shrink-0" />
                                    <span className="truncate">
                                      {customer.pdfFiles && customer.pdfFiles.length > 0
                                        ? customer.pdfFiles.join(', ')
                                        : customer.customerName}
                                    </span>
                                  </h3>

                                  {customer.projectName && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-50 text-blue-800 border border-blue-200 shadow-2xs">
                                      <Briefcase className="w-3 h-3 text-blue-600" />
                                      {customer.projectName}
                                    </span>
                                  )}

                                  {customer.hasColour && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-200">
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
                                          ? "bg-blue-100 text-purple-900 border-blue-200"
                                          : cat === "DGU"
                                          ? "bg-teal-100 text-teal-900 border-teal-200"
                                          : cat === "Lamination" || cat === "Laminated"
                                          ? "bg-amber-100 text-amber-900 border-amber-200"
                                          : "bg-slate-100 text-slate-800 border-slate-200"
                                      }`}
                                    >
                                      {cat}
                                    </span>
                                  ))}

                                  {stage === "DGU" && customer.dguReadyUnits > 0 && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse">
                                      <Sparkles className="w-3 h-3 text-emerald-600" />
                                      {customer.dguReadyUnits} Units Ready to Assemble
                                    </span>
                                  )}

                                  {stage === "Lamination" && customer.holdingUnits > 0 && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                                      <Clock className="w-3 h-3 text-amber-600" />
                                      {customer.holdingUnits} Holding (Colour Cut Pending)
                                    </span>
                                  )}
                                </div>

                                <div className="text-xs text-slate-500 font-medium truncate mt-0.5 flex items-center gap-2 flex-wrap">
                                  <span className="font-extrabold text-slate-900 flex items-center gap-1.5">
                                    <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                    <span>{customer.customerName}</span>
                                  </span>
                                  {customer.projectName && (
                                    <>
                                      <span className="text-slate-300">•</span>
                                      <span className="flex items-center gap-1">
                                        <span className="text-slate-400 font-semibold">Project:</span>
                                        <span className="font-bold text-slate-700">{customer.projectName}</span>
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Right: Quantities & Chevron */}
                            <div className="flex items-center gap-4 shrink-0 justify-between w-full md:w-auto">
                              <div className="text-right">
                                <div className="font-mono text-xs font-black text-slate-900 flex items-center justify-end gap-1.5 flex-wrap">
                                  {customer.pdfFiles && customer.pdfFiles.length > 0 && (
                                    <>
                                      <span className="text-rose-700 font-bold inline-flex items-center gap-0.5" title={`Source: ${customer.pdfFiles.join(', ')}`}>
                                        <FileText className="w-3 h-3 text-rose-500" />
                                        {customer.pdfFiles.length} {customer.pdfFiles.length === 1 ? 'PDF' : 'PDFs'}
                                      </span>
                                      <span className="text-slate-400">•</span>
                                    </>
                                  )}
                                  <span
                                    className={
                                      stage === "DGU"
                                        ? "text-teal-700"
                                        : stage === "Lamination"
                                        ? "text-amber-700"
                                        : "text-emerald-700"
                                    }
                                  >
                                    {customer.totalUnits}{" "}
                                    {(stage === "DGU" ||
                                      stage === "Lamination" ||
                                      customer.categories.has("DGU") ||
                                      customer.categories.has("DLGU") ||
                                      customer.categories.has("Lamination") ||
                                      customer.categories.has("Laminated") ||
                                      (stage === "Finished" &&
                                        (customer.categories.has("DGU") ||
                                          customer.categories.has("DLGU") ||
                                          customer.categories.has("Laminated"))))
                                      ? customer.totalUnits === 1
                                        ? "Unit"
                                        : "Units"
                                      : customer.totalUnits === 1
                                      ? "Piece"
                                      : "Pieces"}
                                  </span>
                                  <span className="text-slate-400">•</span>
                                  <span className="text-slate-600">{customer.totalSqm.toFixed(2)} m²</span>
                                </div>
                              </div>

                              {stage === "Polishing" && customer.rows.some((r) => selectedRowIds.includes(r.id)) && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const custSelected = customer.rows.filter((r) => selectedRowIds.includes(r.id));
                                    const serialsToAdvance = Array.from(new Set(custSelected.flatMap((r) => r.allSerials)));
                                    setSelectedRowIds((prev) => prev.filter((id) => !custSelected.some((r) => r.id === id)));
                                    completeStage(serialsToAdvance, undefined, true);
                                  }}
                                  disabled={loading}
                                  className="h-8 px-3 text-xs font-black bg-gradient-to-r from-cyan-600 via-teal-600 to-cyan-700 hover:from-cyan-700 hover:to-teal-800 text-white rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer shrink-0 animate-in fade-in"
                                  title={`Polish & Advance ${customer.rows.filter((r) => selectedRowIds.includes(r.id)).length} selected items for ${customer.customerName}`}
                                >
                                  <CheckCircle className="w-3.5 h-3.5 text-white" />
                                  <span>
                                    Polish & Advance ({customer.rows.filter((r) => selectedRowIds.includes(r.id)).reduce((a, b) => a + (b.item.qty || 1), 0)} pcs)
                                  </span>
                                </button>
                              )}

                              {stage === "Finished" && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openDispatchModal(customer.rows);
                                  }}
                                  disabled={loading || customer.rows.length === 0}
                                  className="h-8 px-3 text-xs font-black bg-gradient-to-r from-emerald-500 to-emerald-700 hover:bg-emerald-700 text-white rounded-xl flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer shrink-0"
                                  title={`Dispatch all ${customer.totalUnits} units for ${customer.customerName}`}
                                >
                                  <Truck className="w-3.5 h-3.5" />
                                  <span>Dispatch ({customer.totalUnits})</span>
                                </button>
                              )}

                              <div
                                className={`p-1.5 rounded-lg transition-colors ${
                                  stage === "DGU"
                                    ? "bg-slate-100 text-slate-600 hover:bg-teal-100 hover:text-teal-700"
                                    : stage === "Lamination"
                                    ? "bg-slate-100 text-slate-600 hover:bg-amber-100 hover:text-amber-700"
                                    : "bg-slate-100 text-slate-600 hover:bg-emerald-100 hover:text-emerald-700"
                                }`}
                              >
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Collapsible Sub-Table for Customer (Rendered only when expanded) */}
                        {isExpanded && (
                          <div className="border-t border-slate-200 bg-slate-50/50 p-3.5">
                            <div className="ppb-panel p-0 overflow-hidden shadow-[0_4px_20px_rgb(22,128,245,0.04)] border-slate-100/60">
                              {renderStageRowsTable(customer.rows)}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="py-12 text-center text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">
                    <Users className="w-10 h-10 mx-auto mb-2 opacity-30 text-teal-600" />
                    <p className="text-sm font-semibold">No customer records found matching the filters.</p>
                  </div>
                )}
              </div>
            );
          })()
        )}
      </div>

      {/* Dispatch Confirmation & Details Modal */}
      <Dialog
        open={dispatchDialog.open}
        onOpenChange={(open) => {
          if (!open && !dispatchDialog.loading) {
            setDispatchDialog((prev) => ({ ...prev, open: false }));
          }
        }}
      >
        <DialogContent className="max-w-2xl bg-white text-slate-900 border-slate-200 shadow-2xl p-0 overflow-hidden rounded-2xl">
          <DialogHeader className="p-5 pb-3 bg-gradient-to-r from-emerald-50 via-teal-50/60 to-emerald-50 border-b border-emerald-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-700 text-white flex items-center justify-center shadow-md">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <DialogTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                    <span>Dispatch Ready Glass Units</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      {dispatchDialog.rows.length} {dispatchDialog.rows.length === 1 ? "Unit" : "Units"}
                    </span>
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-500 mt-0.5">
                    Items will be archived permanently into Dispatched History and cleared from the Dispatch workstation.
                  </DialogDescription>
                </div>
              </div>
            </div>
          </DialogHeader>

          <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Quick Metrics Banner */}
            <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Units</div>
                <div className="text-lg font-black text-slate-900 font-mono mt-0.5">{dispatchDialog.rows.length}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Panes</div>
                <div className="text-lg font-black text-slate-900 font-mono mt-0.5">
                  {dispatchDialog.rows.reduce((acc, r) => acc + (r.allSerials?.length || 1), 0)}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Area</div>
                <div className="text-lg font-black text-emerald-700 font-mono mt-0.5">
                  {dispatchDialog.rows.reduce((acc, r) => acc + (r.effectiveSqm || 0), 0).toFixed(2)} m²
                </div>
              </div>
            </div>



            {/* Selected Units Preview List */}
            <div className="space-y-1.5 pt-1">
              <div className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                <span>Items Being Dispatched ({dispatchDialog.rows.length})</span>
                <span className="text-[10px] text-slate-400 font-normal">All paired partner panes included</span>
              </div>
              <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50/50">
                {dispatchDialog.rows.map((row, idx) => (
                  <div key={row.id || idx} className="p-2.5 flex items-center justify-between text-xs hover:bg-white transition-colors">
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-mono font-bold text-slate-800 shrink-0">#{idx + 1}</span>
                      <span className="font-mono text-[#1680f5] font-extrabold bg-blue-50/50 px-1.5 py-0.5 rounded border border-blue-200">
                        {row.displaySerial || row.item.serialNumber}
                      </span>
                      <span className="font-medium text-slate-700 truncate">{row.item.orderNo || row.item.piNumber}</span>
                      <span className="text-slate-400">•</span>
                      <span className="text-slate-500">{row.item.width} × {row.item.height} mm</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                        {row.glassCategory || "Monolithic"}
                      </span>
                      <span className="font-mono font-bold text-emerald-700">
                        {(row.effectiveSqm || 0).toFixed(2)} m²
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={dispatchDialog.loading}
              onClick={() => setDispatchDialog((prev) => ({ ...prev, open: false }))}
              className="text-xs font-bold text-slate-700"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={dispatchDialog.loading}
              onClick={handleConfirmDispatch}
              className="text-xs font-black bg-gradient-to-r from-emerald-500 to-emerald-700 hover:bg-emerald-700 text-white gap-2 px-5 h-9 rounded-xl shadow-lg cursor-pointer"
            >
              <Truck className="w-4 h-4" />
              <span>{dispatchDialog.loading ? "Dispatching..." : `Confirm & Dispatch (${dispatchDialog.rows.length} Units)`}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog
        open={deleteDialog.open}
        onOpenChange={(open) => {
          if (!open && !deleteDialog.loading) {
            setDeleteDialog((prev) => ({ ...prev, open: false }));
          }
        }}
      >
        <DialogContent className="max-w-md bg-white text-slate-900 border-slate-200 shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5 text-red-600" />
              <span>{deleteDialog.title}</span>
            </DialogTitle>
            <DialogDescription className="text-slate-600 text-xs mt-1 leading-relaxed">
              {deleteDialog.description}
            </DialogDescription>
          </DialogHeader>

          <div className="bg-red-50/70 border border-red-200 rounded-xl p-3 text-xs text-red-900 flex items-start gap-2.5 my-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-red-950">Permanent Action</div>
              <div className="text-[11px] text-red-800 mt-0.5">
                This item will be deleted from the active cutting queue and database. This action cannot be undone.
              </div>
            </div>
          </div>

          <DialogFooter className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <Button
              type="button"
              variant="outline"
              disabled={deleteDialog.loading}
              onClick={() => setDeleteDialog((prev) => ({ ...prev, open: false }))}
              className="text-xs font-bold text-slate-700"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={deleteDialog.loading}
              onClick={executeDelete}
              className="text-xs font-bold bg-red-600 hover:bg-red-700 text-white gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{deleteDialog.loading ? "Deleting..." : "Delete Permanently"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Barcode / QR Scanner Verification Dialog */}
      <Dialog
        open={Boolean(scanRow)}
        onOpenChange={(open) => {
          if (!open) {
            setScanRow(null);
            setScanInput("");
          }
        }}
      >
        <DialogContent className="max-w-lg bg-white text-slate-900 border-slate-200 shadow-2xl rounded-2xl">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-base font-extrabold flex items-center gap-2 text-slate-900">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
                  <ScanLine className="w-4 h-4" />
                </div>
                <span>Scan Verification ({stage})</span>
              </DialogTitle>
              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                Ready for Gun
              </span>
            </div>
            <DialogDescription className="text-xs text-slate-500 mt-1">
              Aim your barcode scanner gun at the glass sticker or use the camera / input below.
            </DialogDescription>
          </DialogHeader>

          {scanRow && (
            <div className="space-y-4 my-2">
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

              {/* Specification Card */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">
                    {stage === "DGU" ? "Colour Lite Serial (Primary):" : "Item Serial:"}
                  </span>
                  <span className="font-mono font-bold text-blue-700">{scanRow.displaySerial}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Expected Barcode:</span>
                  <span className="font-mono font-bold text-slate-900">{resolveValidBarcode(scanRow.item, scanRow.displayBarcode)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Glass Spec:</span>
                  <span className="font-semibold text-slate-800 truncate max-w-[220px]">
                    {scanRow.item.glassType || scanRow.item.itemCode}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Dimensions:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {scanRow.item.width} × {scanRow.item.height} mm
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-slate-200">
                  <span className="text-slate-500">Remaining to Scan:</span>
                  <span className="font-bold text-[#1680f5] bg-blue-100 px-2 py-0.5 rounded-lg font-mono text-xs border border-blue-200">
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
                  </div>
                )}
              </div>

              {/* Barcode Gun Input */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                  Scan Barcode Gun Input
                </label>
                <div className="flex gap-2">
                  <Input
                    ref={scanInputRef}
                    autoFocus
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleScanVerify();
                      }
                    }}
                    placeholder={stage === "DGU" ? `Scan Colour Barcode (${resolveValidBarcode(scanRow.item, scanRow.displayBarcode)})...` : "Scan sticker barcode..."}
                    className="font-mono text-sm bg-slate-50 border-slate-300 text-slate-900 focus:bg-white"
                  />
                  <Button
                    type="button"
                    onClick={() => setStageCameraOpen(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 gap-1"
                    title="Scan with phone/device camera"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Camera</span>
                  </Button>
                  <Button
                    type="button"
                    onClick={() => handleScanVerify()}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4"
                  >
                    Verify
                  </Button>
                </div>
              </div>

              {/* Quick Preset Button */}
              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                <span>Quick Test:</span>
                <button
                  type="button"
                  onClick={() => {
                    const expected = resolveValidBarcode(scanRow.item, scanRow.displayBarcode);
                    setScanInput(expected);
                  }}
                  className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-mono font-bold hover:bg-emerald-100 cursor-pointer"
                >
                  Use Expected Barcode
                </button>
              </div>
            </div>
          )}

          <DialogFooter className="flex items-center justify-between pt-2 border-t border-slate-200">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setScanRow(null);
                setScanInput("");
              }}
              className="text-xs font-bold"
            >
              Cancel
            </Button>
            {scanRow && (
              <Button
                type="button"
                onClick={async () => {
                  const targetRow = scanRow;
                  setScanRow(null);
                  await completeStage(targetRow.allSerials, 1, false);
                }}
                className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs gap-1.5 shadow-sm"
              >
                <Zap className="w-3.5 h-3.5" /> 1-Click Advance (1 pc)
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Camera Scanner for Stage Verification */}
      {stageCameraOpen && (
        <CameraScannerModal
          open={stageCameraOpen}
          onOpenChange={setStageCameraOpen}
          onScan={(code) => {
            setScanInput(code);
            setTimeout(() => {
              handleScanVerify();
            }, 100);
          }}
          title={`Scan with Camera (${stage})`}
        />
      )}

      {/* Floating Sticky Bulk Advance Bar when rows are selected in Polishing Workstation */}
      {stage === "Polishing" && selectedRowIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white backdrop-blur-md px-5 py-3 rounded-2xl shadow-2xl border border-cyan-500/50 flex items-center gap-4 animate-in slide-in-from-bottom-5 duration-200">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-xs font-bold text-slate-200">
              <strong className="text-cyan-300 font-mono text-sm">
                {displayedRows.filter((r) => selectedRowIds.includes(r.id)).reduce((a, b) => a + (b.item.qty || 1), 0)}
              </strong>{" "}
              pieces selected for Polishing
            </span>
          </div>

          <div className="h-4 w-px bg-slate-700" />

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleBatchComplete}
              disabled={loading}
              className="bg-gradient-to-r from-cyan-600 via-teal-600 to-cyan-700 hover:from-cyan-700 hover:to-teal-800 text-white font-black text-xs h-8 px-4 gap-1.5 rounded-xl shadow-md active:scale-95 cursor-pointer"
            >
              <CheckCircle className="w-3.5 h-3.5 text-white" />
              <span>Polish & Advance Selected</span>
            </Button>

            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setSelectedRowIds([])}
              className="text-slate-400 hover:text-white hover:bg-slate-800 text-xs h-8 px-2.5 rounded-xl cursor-pointer"
            >
              Clear
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
