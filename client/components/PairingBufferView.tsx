import React, { useState, useMemo, useRef, useEffect } from "react";
import { GlassItem, PIMaster } from "@shared/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Link2,
  CheckCircle,
  Clock,
  Search,
  Zap,
  Play,
  X,
  ScanLine,
  Tag,
  AlertOctagon,
  AlertCircle,
  RefreshCw,
  RotateCcw,
  FileText,
  FileSpreadsheet,
  Boxes,
  Layers,
  ArrowRight,
  CheckSquare,
  Square,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Barcode as BarcodeIcon,
  Copy,
  Filter,
  Check,
  AlertTriangle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Truck,
  Building2,
  Briefcase,
  Users,
  ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import { formatBatchNumber, formatPlatformDate, formatPlatformTime, getItemFinish, isDguStickerPairMatch, isDguGlass, isLaminatedGlass, isDlguGlass, isDispatchedItem } from "@/lib/utils";
import { exportStageWipToExcel } from "@/lib/excelExport";
import { TableHorizontalScrollWrapper } from "./TableHorizontalScrollWrapper";
import { WorkstationStageBanner } from "./WorkstationStageBanner";

interface PairingBufferViewProps {
  items: GlassItem[];
  pis?: PIMaster[];
  operator?: string;
  externalSearchTerm?: string;
  onRefresh: () => void;
  onReject: (item: GlassItem) => void;
  onRework: (item: GlassItem) => void;
  onPrintSticker: (item: GlassItem) => void;
  onNavigateTab?: (tab: string) => void;
}

export interface ConsolidatedPositionRow {
  id: string;
  slNo: number;
  piNumber: string;
  piId?: string;
  customerName: string;
  projectName: string;
  posNo: string;
  glassCategory: "DGU" | "Lamination" | "DLGU";
  dlguPhase?: "LamPairing" | "DguPairing";
  finish: "Clear" | "Colour";
  width: number;
  height: number;
  totalQty: number;      // Total ordered in this PI position
  cutQty: number;        // Total cut pieces (arrived at Buffer or subsequent stages)
  remainingQty: number;  // Still in Cutting workstation queue
  inBufferQty: number;   // Currently waiting at Pairing buffer
  finishedQty: number;   // Total assembled & dispatched to Finished warehouse
  totalSqm: number;
  cutSqm: number;
  remainingSqm: number;
  glassCode: string;
  glassType: string;
  orderNo?: string;
  obNo: string;
  sfoNo: string;
  batchNo: string;
  barcode: string;
  rawItems: GlassItem[];
  bufferItems: GlassItem[];
  // DGU 1+1 pairing readiness
  matchingPartnerRow?: ConsolidatedPositionRow | null;
  readyPairsCount: number;
  waitingFinish?: string;
  thickness?: string;
  uploadOrder?: number;
}

export const PairingBufferView: React.FC<PairingBufferViewProps> = ({
  items,
  pis = [],
  operator = "Operator",
  externalSearchTerm = "",
  onRefresh,
  onReject,
  onRework,
  onPrintSticker,
  onNavigateTab,
}) => {
  // PI / Batch Filter: "ALL" or specific PI ID / PI number
  const [selectedPIFilter, setSelectedPIFilter] = useState<string>("ALL");
  // Customer / Client Filter: "ALL" or specific customer name
  const [selectedCustomerFilter, setSelectedCustomerFilter] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [finishFilter, setFinishFilter] = useState<"ALL" | "COLOUR" | "CLEAR" | "READY" | "BUFFER" | "CUT" | "REMAINING" | "COMPLETED">("ALL");
  // ponytail: category filter supports unified cross-category ALL_PENDING alongside process queues
  const [categoryFilter, setCategoryFilter] = useState<"ALL_PENDING" | "DGU" | "LAMINATION" | "DLGU">("DGU");
  const [pendingSubFilter, setPendingSubFilter] = useState<"ALL" | "CUTTING" | "BUFFER" | "DGU" | "LAMINATION" | "DLGU">("ALL");
  const [sortColumn, setSortColumn] = useState<"posNo" | "cutQty" | "remainingQty" | "totalQty" | "inBufferQty" | "sqm" | "default">("default");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const handleHeaderSort = (column: "posNo" | "cutQty" | "remainingQty" | "totalQty" | "inBufferQty" | "sqm") => {
    if (sortColumn === column) {
      if (sortDirection === "desc") {
        setSortDirection("asc");
      } else {
        setSortColumn("default");
        setSortDirection("desc");
      }
    } else {
      setSortColumn(column);
      setSortDirection(column === "posNo" ? "asc" : "desc");
    }
  };

  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [expandedRowIds, setExpandedRowIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const toggleExpandRow = (rowId: string) => {
    setExpandedRowIds((prev) =>
      prev.includes(rowId) ? prev.filter((id) => id !== rowId) : [...prev, rowId]
    );
  };

  const toggleExpandAll = () => {
    if (expandedRowIds.length === filteredRows.length && filteredRows.length > 0) {
      setExpandedRowIds([]);
    } else {
      setExpandedRowIds(filteredRows.map((r) => r.id));
    }
  };

  const handleCopyBarcode = (barcode: string) => {
    if (navigator.clipboard && barcode) {
      navigator.clipboard.writeText(barcode);
      toast.success(`Copied barcode: ${barcode}`);
    }
  };

  // Scan modal for Pairing stage
  const [scanRow, setScanRow] = useState<ConsolidatedPositionRow | null>(null);
  const [scanInput, setScanInput] = useState("");
  const scanInputRef = useRef<HTMLInputElement>(null);

  // Available PIs (extracting unique Order/PI numbers from items)
  const availablePIs = useMemo(() => {
    const map = new Map<string, { id: string; piNumber: string; customerName: string; totalItems: number; cutItems: number }>();

    items.forEach((item) => {
      if (isDispatchedItem(item)) return;
      const parentPI = pis.find((p) => p.id === item.piId || p.piNumber === item.piNumber);
      const orderPi = (item.orderNo || item.piNumber || parentPI?.piNumber || `BATCH-${item.batchNo || "1"}`).replace(/^STK-/i, "").trim();
      const customer = parentPI?.customerName || (item as any).customerName || (item as any).clientName || "Customer";

      if (!map.has(orderPi)) {
        map.set(orderPi, {
          id: orderPi,
          piNumber: orderPi,
          customerName: customer,
          totalItems: 0,
          cutItems: 0,
        });
      }
      const entry = map.get(orderPi)!;
      const pieceQty = item.qty || 1;
      entry.totalItems += pieceQty;
      if (item.currentStage?.toLowerCase() !== "cutting" && item.status !== "Rejected") {
        entry.cutItems += pieceQty;
      }
    });

    // Also include any PIs from Master if not already mapped and not completed
    pis.forEach((p) => {
      if (p.status === "Completed" || (p as any).status === "Dispatched") return;
      const pNum = (p.piNumber || "").replace(/^STK-/i, "").trim();
      if (pNum && !map.has(pNum)) {
        map.set(pNum, {
          id: p.id || pNum,
          piNumber: pNum,
          customerName: p.customerName || "Customer",
          totalItems: p.totalQty || p.itemsCount || 0,
          cutItems: p.completedItemsCount || 0,
        });
      }
    });

    return Array.from(map.values());
  }, [items, pis]);

  // Available Customers extracted from uploaded stickers & master PIs
  const availableCustomers = useMemo(() => {
    const map = new Map<string, { name: string; totalItems: number; cutItems: number }>();
    items.forEach((item) => {
      if (isDispatchedItem(item)) return;
      const parentPI = pis.find((p) => p.id === item.piId || p.piNumber === item.piNumber);
      const cust = (parentPI?.customerName || (item as any).customerName || (item as any).clientName || "Customer").trim();
      if (cust) {
        if (!map.has(cust)) {
          map.set(cust, { name: cust, totalItems: 0, cutItems: 0 });
        }
        const entry = map.get(cust)!;
        const pieceQty = item.qty || 1;
        entry.totalItems += pieceQty;
        if (item.currentStage?.toLowerCase() !== "cutting" && item.status !== "Rejected") {
          entry.cutItems += pieceQty;
        }
      }
    });
    pis.forEach((p) => {
      if (p.status === "Completed" || (p as any).status === "Dispatched") return;
      const cust = (p.customerName || "Customer").trim();
      if (cust && !map.has(cust)) {
        map.set(cust, { name: cust, totalItems: p.totalQty || p.itemsCount || 0, cutItems: p.completedItemsCount || 0 });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [items, pis]);

  // Aggregate and build consolidated position rows (matching exact Sticker Upload table layout)
  const consolidatedRows = useMemo<ConsolidatedPositionRow[]>(() => {
    // 1. Group all raw items by (PI / OrderNo, POS NO, WIDTH, HEIGHT, FINISH)
    const positionMap = new Map<string, {
      id: string;
      piNumber: string;
      piId?: string;
      customerName: string;
      projectName: string;
      posNo: string;
      finish: "Clear" | "Colour";
      width: number;
      height: number;
      rawItems: GlassItem[];
      bufferItems: GlassItem[];
      glassCode: string;
      glassType: string;
      obNo: string;
      sfoNo: string;
      batchNo: string;
      barcode: string;
    }>();

    // Index PIs for instant O(1) lookup
    const piMapById = new Map<string, (typeof pis)[0]>();
    const piMapByNumber = new Map<string, (typeof pis)[0]>();
    for (let p = 0; p < pis.length; p++) {
      if (pis[p].id) piMapById.set(pis[p].id, pis[p]);
      if (pis[p].piNumber) piMapByNumber.set(pis[p].piNumber, pis[p]);
    }

    items.forEach((item) => {
      if (item.status === "Rejected" || isDispatchedItem(item)) return;

      const parentPI = (item.piId ? piMapById.get(item.piId) : null) || (item.piNumber ? piMapByNumber.get(item.piNumber) : null);
      // The PI number displayed in the sticker upload table is item.orderNo (e.g. 2045, 2137, 2139)
      const cleanPiNumber = (item.orderNo || item.piNumber || parentPI?.piNumber || `BATCH-${item.batchNo || "1"}`).replace(/^STK-/i, "").trim();
      const posKey = (item.posNo || String(item.srNo || "1")).trim();
      const finish = getItemFinish(item);
      const isDlgu = item.glassCategory === "DLGU" || isDlguGlass(item);
      const isLam = !isDlgu && (item.glassCategory === "Lamination" || isLaminatedGlass(item));
      const glassCategory: "DGU" | "Lamination" | "DLGU" = isDlgu ? "DLGU" : (isLam ? "Lamination" : "DGU");
      // Differentiate lites by thickness or primary glass type (e.g. 12MM vs 10MM) so matching lites form separate rows to be paired
      const rawThickness = (item.thickness || item.glassType?.match(/^\d+(\.\d+)?\s*MM/i)?.[0] || "").toUpperCase().replace(/\s+/g, "");
      const thicknessKey = isDlgu && finish === "Clear" ? "DLGU_CLEAR_LAM" : (rawThickness || (item.glassType?.split("/")[0]?.trim()) || finish);
      const isDlguDoneLam = item.completedStages?.includes("Lamination") || item.colorOrClear === "Colour" || !item.processRoute?.includes("Lamination");
      const dlguPhaseKey = isDlgu
        ? (item.dlguPhase || (isDlguDoneLam ? "DguPairing" : "LamPairing"))
        : "default";
      const effectiveDlguPhase = isDlgu ? (isDlguDoneLam || finish === "Colour" ? "DguPairing" : dlguPhaseKey) : undefined;
      const groupKey = `${cleanPiNumber}_pos_${posKey}_${item.width}x${item.height}_${thicknessKey}_${finish}_${glassCategory}_${effectiveDlguPhase || "default"}`;

      if (!positionMap.has(groupKey)) {
        positionMap.set(groupKey, {
          id: groupKey,
          piNumber: cleanPiNumber,
          piId: item.piId || parentPI?.id,
          customerName: parentPI?.customerName || (item as any).customerName || (item as any).clientName || "Customer",
          projectName: parentPI?.projectName || (item as any).projectName || item.sectionName || "Project",
          posNo: posKey,
          glassCategory,
          dlguPhase: effectiveDlguPhase,
          finish,
          width: item.width || 1000,
          height: item.height || 1000,
          rawItems: [],
          bufferItems: [],
          glassCode: item.glassCode || `GL ${posKey}`,
          glassType: isDlgu && finish === "Clear" ? "13.52MM CLEAR LAMINATED (DLGU Sub-Assembly)" : (item.glassType || item.itemCode || (finish === "Colour" ? "6MM COLOURED TEMPERED" : "6MM CLEAR TEMPERED")),
          orderNo: item.orderNo || cleanPiNumber,
          obNo: item.obNo || "",
          sfoNo: item.sfoNo || cleanPiNumber,
          batchNo: item.batchNo || "1",
          barcode: item.barcode || "",
          thickness: rawThickness,
        } as any);
      }

      const group = positionMap.get(groupKey)!;
      group.rawItems.push(item);
      if (item.currentStage?.toLowerCase() === "pairing") {
        group.bufferItems.push(item);
      }
    });

    // Convert groups into Position Rows with exact Cut & Remaining computations
    const rows: ConsolidatedPositionRow[] = Array.from(positionMap.values()).map((g: any, idx) => {
      // For DLGU Clear, 2 laminated raw panes form 1 composite unit (e.g. 96 panes = 48 units)
      const isDlguClearUnit = g.glassCategory === "DLGU" && g.finish === "Clear";

      // Total pieces uploaded for this position
      const rawTotalPieces = g.rawItems.reduce((acc: number, curr: any) => acc + (curr.qty || 1), 0);
      const totalPieces = isDlguClearUnit ? Math.ceil(rawTotalPieces / 2) : rawTotalPieces;

      // Pieces cut (advanced from cutting)
      const rawCutPieces = g.rawItems
        .filter((i: any) => i.currentStage?.toLowerCase() !== "cutting")
        .reduce((acc: number, curr: any) => acc + (curr.qty || 1), 0);
      const cutPieces = isDlguClearUnit ? Math.ceil(rawCutPieces / 2) : rawCutPieces;

      // Pieces still remaining in cutting
      const rawRemainingPieces = g.rawItems
        .filter((i: any) => i.currentStage?.toLowerCase() === "cutting")
        .reduce((acc: number, curr: any) => acc + (curr.qty || 1), 0);
      const remainingPieces = isDlguClearUnit ? Math.ceil(rawRemainingPieces / 2) : rawRemainingPieces;

      // Pieces currently waiting in buffer
      const rawBufferPieces = g.bufferItems.reduce((acc: number, curr: any) => acc + (curr.qty || 1), 0);
      const bufferPieces = isDlguClearUnit ? Math.ceil(rawBufferPieces / 2) : rawBufferPieces;

      // Pieces assembled and dispatched to Finished
      const rawFinishedPieces = g.rawItems
        .filter((i: any) => i.currentStage?.toLowerCase() === "finished" || i.status === "Completed")
        .reduce((acc: number, curr: any) => acc + (curr.qty || 1), 0);
      const finishedPieces = isDlguClearUnit ? Math.ceil(rawFinishedPieces / 2) : rawFinishedPieces;

      const totalSqm = parseFloat(((g.width * g.height * totalPieces) / 1000000).toFixed(2));
      const cutSqm = parseFloat(((g.width * g.height * cutPieces) / 1000000).toFixed(2));
      const remainingSqm = parseFloat(((g.width * g.height * remainingPieces) / 1000000).toFixed(2));

      const calcThickness = g.thickness || (g.rawItems[0]?.thickness || g.glassType?.match(/^\d+(\.\d+)?\s*MM/i)?.[0] || "").toUpperCase().replace(/\s+/g, "");

      return {
        id: g.id,
        slNo: idx + 1,
        piNumber: g.piNumber,
        piId: g.piId,
        customerName: g.customerName,
        projectName: g.projectName,
        posNo: g.posNo,
        glassCategory: g.glassCategory,
        dlguPhase: g.dlguPhase,
        finish: g.finish,
        thickness: calcThickness,
        width: g.width,
        height: g.height,
        totalQty: totalPieces,
        cutQty: cutPieces,
        remainingQty: remainingPieces,
        inBufferQty: bufferPieces,
        finishedQty: finishedPieces,
        totalSqm,
        cutSqm,
        remainingSqm,
        glassCode: g.glassCode,
        glassType: g.glassType,
        orderNo: g.orderNo,
        obNo: g.obNo,
        sfoNo: g.sfoNo,
        batchNo: g.batchNo,
        barcode: g.barcode,
        rawItems: g.rawItems,
        bufferItems: g.bufferItems,
        uploadOrder: idx,
        readyPairsCount: 0,
      };
    });

    // 2. Compute 1+1 DGU, Lamination & DLGU Pairing status across rows with exact sticker matching
    rows.forEach((row) => {
      const oppositeFinish = row.finish === "Colour" ? "Clear" : "Colour";
      // Find partner row:
      // Match by Order No / PI, POS No, exact Width x Height, OB No, and Customer/Project
      const partner = rows.find(
        (r) =>
          r.id !== row.id &&
          r.glassCategory === row.glassCategory &&
          (row.glassCategory !== "DLGU" || r.dlguPhase === row.dlguPhase) &&
          isDguStickerPairMatch(
            { orderNo: row.orderNo || row.rawItems[0]?.orderNo || row.piNumber, piId: row.piId, posNo: row.posNo, width: row.width, height: row.height, obNo: row.obNo, lineQty: row.totalQty, glassCode: row.glassCode, customerName: row.customerName, projectName: row.projectName, glassCategory: row.glassCategory, dlguPhase: row.dlguPhase, completedStages: row.rawItems[0]?.completedStages, colorOrClear: row.finish },
            { orderNo: r.orderNo || r.rawItems[0]?.orderNo || r.piNumber, piId: r.piId, posNo: r.posNo, width: r.width, height: r.height, obNo: r.obNo, lineQty: r.totalQty, glassCode: r.glassCode, customerName: r.customerName, projectName: r.projectName, glassCategory: r.glassCategory, dlguPhase: r.dlguPhase, completedStages: r.rawItems[0]?.completedStages, colorOrClear: r.finish }
          ) &&
          (r.finish !== row.finish || r.glassType !== row.glassType || r.thickness !== row.thickness || r.id !== row.id)
      );

      if (partner) {
        row.matchingPartnerRow = partner;
        // Ready pairs is the minimum of cut pieces in buffer / available in lamination for both sides
        const partnerAvailable =
          row.glassCategory === "DLGU" && row.finish === "Colour"
            ? (partner.dlguPhase === "DguPairing" ? partner.inBufferQty : Math.ceil(partner.rawItems.filter((i: any) => i.currentStage === "Lamination" || (i.currentStage === "Pairing" && i.completedStages?.includes("Lamination"))).reduce((a: number, b: any) => a + (b.qty || 1), 0) / 2))
            : partner.inBufferQty;
        row.readyPairsCount = Math.min(row.inBufferQty, partnerAvailable);
        row.waitingFinish = partner.finish !== row.finish
          ? partner.finish
          : (partner.thickness ? `${partner.thickness} ${partner.finish}` : (partner.glassType.split("/")[0].trim() as any));
      } else {
        row.matchingPartnerRow = null;
        row.readyPairsCount = 0;
        row.waitingFinish = oppositeFinish;
      }
    });

    // 3. Exact Sticker Upload Sequence:
    // Retain the natural sequence from the sticker upload file (not rearranged by POS number)
    const sortedRows = [...rows].sort((a, b) => (a.uploadOrder ?? 0) - (b.uploadOrder ?? 0));

    sortedRows.forEach((r, idx) => {
      r.slNo = idx + 1;
    });

    return sortedRows;
  }, [items, pis]);

  // ponytail: Cross-category pending status check (cutting remaining OR unpaired panes staged in buffer)
  const isRowPending = (r: ConsolidatedPositionRow) =>
    r.remainingQty > 0 || (r.inBufferQty > 0 && (!r.matchingPartnerRow || r.readyPairsCount < r.inBufferQty));

  // Filter rows based on Selected PI, Finish filter, and Search Query
  const filteredRows = useMemo(() => {
    return consolidatedRows
      .filter((row) => {
        // PI Filter
        if (selectedPIFilter !== "ALL") {
          const matchPI =
            row.piNumber === selectedPIFilter ||
            row.piId === selectedPIFilter ||
            row.sfoNo === selectedPIFilter ||
            row.batchNo === selectedPIFilter;
          if (!matchPI) return false;
        }

        // Customer / Client Filter
        if (selectedCustomerFilter !== "ALL") {
          const matchCust = (row.customerName || (row as any).clientName || "Customer").trim() === selectedCustomerFilter;
          if (!matchCust) return false;
        }

        // Process Category Filter (ALL_PENDING vs DGU vs Lamination vs DLGU)
        if (categoryFilter === "ALL_PENDING") {
          if (!isRowPending(row)) return false;

          // Sub-filters inside Pending Glass tab
          if (pendingSubFilter === "CUTTING" && row.remainingQty === 0) return false;
          if (pendingSubFilter === "BUFFER" && (row.inBufferQty === 0 || (row.matchingPartnerRow && row.readyPairsCount >= row.inBufferQty))) return false;
          if (pendingSubFilter === "DGU" && row.glassCategory !== "DGU") return false;
          if (pendingSubFilter === "LAMINATION" && row.glassCategory !== "Lamination") return false;
          if (pendingSubFilter === "DLGU" && row.glassCategory !== "DLGU") return false;
        } else {
          if (categoryFilter === "DGU" && row.glassCategory !== "DGU") return false;
          if (categoryFilter === "LAMINATION" && row.glassCategory !== "Lamination") return false;
          if (categoryFilter === "DLGU" && row.glassCategory !== "DLGU") return false;

          // Finish & Status Filters
          if (finishFilter === "COLOUR" && row.finish !== "Colour") return false;
          if (finishFilter === "CLEAR" && row.finish !== "Clear") return false;
          if (finishFilter === "READY" && row.readyPairsCount === 0) return false;
          if (finishFilter === "BUFFER" && row.inBufferQty === 0 && (!row.matchingPartnerRow || row.matchingPartnerRow.inBufferQty === 0)) return false;
          if (finishFilter === "CUT" && row.cutQty === 0 && (!row.matchingPartnerRow || row.matchingPartnerRow.cutQty === 0)) return false;
          if (finishFilter === "REMAINING" && row.remainingQty === 0) return false;
          if (finishFilter === "COMPLETED" && row.remainingQty > 0) return false;
        }

        // Search Query
        const q = (searchTerm || externalSearchTerm || "").toLowerCase().trim();
        if (!q) return true;

        const parentPI = pis.find((p) => p.id === row.piId || p.piNumber === row.piNumber);
        return (
          row.piNumber.toLowerCase().includes(q) ||
          row.posNo.toLowerCase().includes(q) ||
          row.glassCode.toLowerCase().includes(q) ||
          row.glassType.toLowerCase().includes(q) ||
          row.barcode.toLowerCase().includes(q) ||
          row.customerName.toLowerCase().includes(q) ||
          row.projectName.toLowerCase().includes(q) ||
          Boolean(parentPI?.fileName && parentPI.fileName.toLowerCase().includes(q)) ||
          row.obNo.toLowerCase().includes(q) ||
          row.sfoNo.toLowerCase().includes(q) ||
          row.batchNo.toLowerCase().includes(q) ||
          `${row.width}x${row.height}`.includes(q) ||
          `${row.width}*${row.height}`.includes(q)
        );
      })
      .sort((a, b) => {
        if (sortColumn === "posNo") {
          const numA = parseInt(a.posNo.replace(/\D/g, "") || "0", 10);
          const numB = parseInt(b.posNo.replace(/\D/g, "") || "0", 10);
          return sortDirection === "asc" ? numA - numB : numB - numA;
        }
        if (sortColumn === "cutQty") {
          return sortDirection === "asc" ? a.cutQty - b.cutQty : b.cutQty - a.cutQty;
        }
        if (sortColumn === "remainingQty") {
          return sortDirection === "asc" ? a.remainingQty - b.remainingQty : b.remainingQty - a.remainingQty;
        }
        if (sortColumn === "totalQty") {
          return sortDirection === "asc" ? a.totalQty - b.totalQty : b.totalQty - a.totalQty;
        }
        if (sortColumn === "inBufferQty") {
          return sortDirection === "asc" ? a.inBufferQty - b.inBufferQty : b.inBufferQty - a.inBufferQty;
        }
        if (sortColumn === "sqm") {
          return sortDirection === "asc" ? a.totalSqm - b.totalSqm : b.totalSqm - a.totalSqm;
        }
        return 0;
      });
  }, [consolidatedRows, selectedPIFilter, categoryFilter, finishFilter, pendingSubFilter, searchTerm, externalSearchTerm, sortColumn, sortDirection]);

  // Customer Grouped View State (Default Closed)
  const [expandedBufferCustomers, setExpandedBufferCustomers] = useState<Record<string, boolean>>({});

  const toggleBufferCustomerExpanded = (key: string) => {
    setExpandedBufferCustomers((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const isBufferCustomerExpanded = (key: string) => {
    return Boolean(expandedBufferCustomers[key]); // Closed by default!
  };

  const setAllBufferCustomersExpanded = (expand: boolean) => {
    const newState: Record<string, boolean> = {};
    groupedCustomerRows.forEach((g) => {
      newState[g.groupKey] = expand;
    });
    setExpandedBufferCustomers(newState);
  };

  const groupedCustomerRows = useMemo(() => {
    const map = new Map<string, { customerName: string; projectName: string; rows: typeof filteredRows }>();

    filteredRows.forEach((row) => {
      const cust = (row.customerName || (row as any).clientName || "Customer").trim();
      const proj = (row.projectName || "").trim();
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
      rows: typeof filteredRows;
      totalPositions: number;
      totalPieces: number;
      cutPieces: number;
      remainingPieces: number;
      inBufferPieces: number;
      readyPairs: number;
      totalSqm: number;
      cutSqm: number;
      remainingSqm: number;
      projects: string[];
      pdfFiles: string[];
      hasColour: boolean;
      hasClear: boolean;
      isFullyCut: boolean;
      progressPct: number;
    }> = [];

    map.forEach(({ customerName, projectName, rows }, groupKey) => {
      let totalPieces = 0;
      let cutPieces = 0;
      let remainingPieces = 0;
      let inBufferPieces = 0;
      let totalSqm = 0;
      let cutSqm = 0;
      let remainingSqm = 0;
      let hasColour = false;
      let hasClear = false;
      const projectsSet = new Set<string>();
      const pdfFilesSet = new Set<string>();
      if (projectName) projectsSet.add(projectName);

      rows.forEach((r) => {
        totalPieces += r.totalQty;
        cutPieces += r.cutQty;
        remainingPieces += r.remainingQty;
        inBufferPieces += r.inBufferQty;
        totalSqm += r.totalSqm;
        cutSqm += r.cutSqm;
        remainingSqm += r.remainingSqm;
        if (r.finish === "Colour") hasColour = true;
        else hasClear = true;
        if (r.projectName) projectsSet.add(r.projectName);

        const parentPI = pis.find((p) => p.id === r.piId || p.piNumber === r.piNumber);
        if (parentPI?.fileName) pdfFilesSet.add(parentPI.fileName);
        r.rawItems.forEach((it) => {
          if ((it as any).fileName) pdfFilesSet.add((it as any).fileName);
        });
      });

      const readyPairs = Math.floor(
        rows
          .filter((r) => r.matchingPartnerRow && r.readyPairsCount > 0)
          .reduce((acc, r) => acc + r.readyPairsCount, 0) / 2
      );

      const isFullyCut = remainingPieces === 0 && totalPieces > 0;
      const progressPct = totalPieces > 0 ? Math.round((cutPieces / totalPieces) * 100) : 0;

      groups.push({
        groupKey,
        customerName,
        projectName,
        rows,
        totalPositions: rows.length,
        totalPieces,
        cutPieces,
        remainingPieces,
        inBufferPieces,
        readyPairs,
        totalSqm,
        cutSqm,
        remainingSqm,
        projects: Array.from(projectsSet),
        pdfFiles: Array.from(pdfFilesSet),
        hasColour,
        hasClear,
        isFullyCut,
        progressPct,
      });
    });

    return groups;
  }, [filteredRows, pis]);

  // Total counts across categories
  const dguStickerCount = consolidatedRows
    .filter((r) => r.glassCategory === "DGU")
    .reduce((sum, r) => sum + r.totalQty, 0);
  const lamStickerCount = consolidatedRows
    .filter((r) => r.glassCategory === "Lamination")
    .reduce((sum, r) => sum + r.totalQty, 0);
  const dlguStickerCount = consolidatedRows
    .filter((r) => r.glassCategory === "DLGU")
    .reduce((sum, r) => sum + r.totalQty, 0);

  // Cross-category pending counts (All 3: DGU + Lamination + DLGU)
  const pendingRows = useMemo(() => consolidatedRows.filter(isRowPending), [consolidatedRows]);
  const pendingPiecesCount = useMemo(() => pendingRows.reduce((sum, r) => sum + r.remainingQty + Math.max(0, r.inBufferQty - r.readyPairsCount), 0), [pendingRows]);
  const pendingCuttingPiecesCount = useMemo(() => pendingRows.filter((r) => r.remainingQty > 0).reduce((sum, r) => sum + r.remainingQty, 0), [pendingRows]);
  const pendingBufferPiecesCount = useMemo(() => pendingRows.filter((r) => r.inBufferQty > 0).reduce((sum, r) => sum + Math.max(0, r.inBufferQty - r.readyPairsCount), 0), [pendingRows]);
  const pendingDguPiecesCount = useMemo(() => pendingRows.filter((r) => r.glassCategory === "DGU").reduce((sum, r) => sum + r.remainingQty + Math.max(0, r.inBufferQty - r.readyPairsCount), 0), [pendingRows]);
  const pendingLamPiecesCount = useMemo(() => pendingRows.filter((r) => r.glassCategory === "Lamination").reduce((sum, r) => sum + r.remainingQty + Math.max(0, r.inBufferQty - r.readyPairsCount), 0), [pendingRows]);
  const pendingDlguPiecesCount = useMemo(() => pendingRows.filter((r) => r.glassCategory === "DLGU").reduce((sum, r) => sum + r.remainingQty + Math.max(0, r.inBufferQty - r.readyPairsCount), 0), [pendingRows]);

  // Auto-switch to whichever category has items if current category has 0
  useEffect(() => {
    if (categoryFilter === "ALL_PENDING") return;
    if (categoryFilter === "DGU" && dguStickerCount === 0) {
      if (dlguStickerCount > 0) setCategoryFilter("DLGU");
      else if (lamStickerCount > 0) setCategoryFilter("LAMINATION");
    } else if (categoryFilter === "LAMINATION" && lamStickerCount === 0) {
      if (dlguStickerCount > 0) setCategoryFilter("DLGU");
      else if (dguStickerCount > 0) setCategoryFilter("DGU");
    } else if (categoryFilter === "DLGU" && dlguStickerCount === 0) {
      if (dguStickerCount > 0) setCategoryFilter("DGU");
      else if (lamStickerCount > 0) setCategoryFilter("LAMINATION");
    }
  }, [dguStickerCount, lamStickerCount, dlguStickerCount, categoryFilter]);

  const scopedCategoryRows = consolidatedRows.filter((r) => {
    if (selectedPIFilter !== "ALL") {
      const matchPI = r.piNumber === selectedPIFilter || r.piId === selectedPIFilter || r.sfoNo === selectedPIFilter || r.batchNo === selectedPIFilter;
      if (!matchPI) return false;
    }
    if (selectedCustomerFilter !== "ALL") {
      const matchCust = (r.customerName || (r as any).clientName || "Customer").trim() === selectedCustomerFilter;
      if (!matchCust) return false;
    }
    if (categoryFilter === "ALL_PENDING") return isRowPending(r);
    if (categoryFilter === "DGU") return r.glassCategory === "DGU";
    if (categoryFilter === "LAMINATION") return r.glassCategory === "Lamination";
    if (categoryFilter === "DLGU") return r.glassCategory === "DLGU";
    return true;
  });
  const scopedAllStickerCount = scopedCategoryRows.reduce((sum, r) => sum + r.totalQty, 0);
  const scopedColourStickerCount = scopedCategoryRows.filter((r) => r.finish === "Colour").reduce((sum, r) => sum + r.totalQty, 0);
  const scopedClearStickerCount = scopedCategoryRows.filter((r) => r.finish === "Clear").reduce((sum, r) => sum + r.totalQty, 0);

  // Overall KPI metrics for the active view (selected PI, Customer, or all PIs)
  const activeViewMetrics = useMemo(() => {
    const scopeRows = consolidatedRows.filter((r) => {
      if (selectedPIFilter !== "ALL") {
        const matchPI = r.piNumber === selectedPIFilter || r.piId === selectedPIFilter;
        if (!matchPI) return false;
      }
      if (selectedCustomerFilter !== "ALL") {
        const matchCust = (r.customerName || (r as any).clientName || "Customer").trim() === selectedCustomerFilter;
        if (!matchCust) return false;
      }
      return true;
    });

    const totalPieces = scopeRows.reduce((a, b) => a + b.totalQty, 0);
    const cutPieces = scopeRows.reduce((a, b) => a + b.cutQty, 0);
    const remainingPieces = scopeRows.reduce((a, b) => a + b.remainingQty, 0);
    const inBufferPieces = scopeRows.reduce((a, b) => a + b.inBufferQty, 0);

    const totalSqm = scopeRows.reduce((a, b) => a + b.totalSqm, 0);
    const cutSqm = scopeRows.reduce((a, b) => a + b.cutSqm, 0);
    const remainingSqm = scopeRows.reduce((a, b) => a + b.remainingSqm, 0);

    const colourRows = scopeRows.filter((r) => r.finish === "Colour");
    const clearRows = scopeRows.filter((r) => r.finish === "Clear");

    const colourCut = colourRows.reduce((a, b) => a + b.cutQty, 0);
    const clearCut = clearRows.reduce((a, b) => a + b.cutQty, 0);

    const colourBuffer = colourRows.reduce((a, b) => a + b.inBufferQty, 0);
    const clearBuffer = clearRows.reduce((a, b) => a + b.inBufferQty, 0);

    // Ready pairs is computed across all matched partner rows (supporting both DGU and Lamination)
    const readyPairs = Math.floor(
      scopeRows
        .filter((r) => r.matchingPartnerRow && r.readyPairsCount > 0)
        .reduce((acc, r) => acc + r.readyPairsCount, 0) / 2
    );
    const cutPercent = totalPieces > 0 ? Math.round((cutPieces / totalPieces) * 100) : 0;

    const colourPieces = colourRows.reduce((a, b) => a + b.totalQty, 0);
    const clearPieces = clearRows.reduce((a, b) => a + b.totalQty, 0);

    return {
      totalItemsCount: scopeRows.length,
      totalPieces,
      colourPieces,
      clearPieces,
      cutPieces,
      remainingPieces,
      inBufferPieces,
      totalSqm,
      cutSqm,
      remainingSqm,
      colourCut,
      clearCut,
      colourBuffer,
      clearBuffer,
      readyPairs,
      cutPercent,
    };
  }, [consolidatedRows, selectedPIFilter]);

  // Complete & Advance stage handler
  const completeStage = async (serialNumbers: string[], advanceQty?: number, advanceAll?: boolean) => {
    if (serialNumbers.length === 0) {
      toast.error("No items selected to advance");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/production/stage-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serialNumbers,
          stage: "Pairing",
          currentStage: "Pairing",
          advanceQty: advanceQty ?? 1,
          advanceAll: advanceAll ?? true,
          operator: operator || "Operator",
          remarks: "Stage completed from Glass Pairing & Buffer to Assembly (DGU / Lamination)",
        }),
      });
      if (!res.ok) throw new Error("Failed to advance stage from Pairing & Buffer");
      const data = await res.json();
      toast.success(data.message || `Advanced ${data.items?.length || serialNumbers.length} item(s) from Pairing & Buffer!`);
      setSelectedRowIds([]);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Error advancing items from Pairing & Buffer");
    } finally {
      setLoading(false);
    }
  };

  // Send All Ready Pairs to Assembly (DGU or Lamination)
  const handleSendAllReadyPairs = async () => {
    const serialsToAdvance: string[] = [];
    const processedPairs = new Set<string>();

    consolidatedRows.forEach((row) => {
      if (row.readyPairsCount > 0 && row.matchingPartnerRow) {
        const pairKey = [row.id, row.matchingPartnerRow.id].sort().join("___");
        if (processedPairs.has(pairKey)) return;
        processedPairs.add(pairKey);

        // Collect matching items in buffer up to ready count
        const colSerials = row.bufferItems.slice(0, row.readyPairsCount).map((i) => i.serialNumber);
        const clrSerials = row.matchingPartnerRow.bufferItems.slice(0, row.readyPairsCount).map((i) => i.serialNumber);
        serialsToAdvance.push(...colSerials, ...clrSerials);
      }
    });

    if (serialsToAdvance.length === 0) {
      toast.info("No ready paired sets available in buffer right now.");
      return;
    }

    await completeStage(serialsToAdvance, undefined, true);
  };

  // Pair & Advance Lamination Sets Directly
  const handlePairLaminationDirect = async (posNo?: string, piNumber?: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/production/pair-lamination", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posNo, piNumber }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || `Paired ${data.pairedSets} set(s) and advanced to Lamination!`);
        onRefresh();
      } else {
        // Fallback to completeStage if needed
        await handleSendAllReadyPairs();
      }
    } catch (err: any) {
      toast.error(err.message || "Error pairing lamination sets");
    } finally {
      setLoading(false);
    }
  };

  // Pair & Advance DGU Sets Directly
  const handlePairDguDirect = async (posNo?: string, piNumber?: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/production/pair-dgu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posNo, piNumber }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || `Paired ${data.pairedSets} DGU set(s) and advanced to DGU Workstation!`);
        onRefresh();
      } else {
        await handleSendAllReadyPairs();
      }
    } catch (err: any) {
      toast.error(err.message || "Error pairing DGU sets");
    } finally {
      setLoading(false);
    }
  };

  // Pair & Advance DLGU Sets Directly
  const handlePairDlguDirect = async (posNo?: string, piNumber?: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/production/pair-dlgu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posNo, piNumber }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || `Paired ${data.pairedSets} DLGU set(s)!`);
        onRefresh();
      } else {
        await handleSendAllReadyPairs();
      }
    } catch (err: any) {
      toast.error(err.message || "Error pairing DLGU sets");
    } finally {
      setLoading(false);
    }
  };

  // Advance selected rows
  const handleAdvanceSelectedRows = async () => {
    if (selectedRowIds.length === 0) return;
    const selectedRows = consolidatedRows.filter((r) => selectedRowIds.includes(r.id));
    const serials = selectedRows.flatMap((r) => r.bufferItems.map((i) => i.serialNumber));

    if (serials.length === 0) {
      toast.error("Selected positions have 0 pieces currently waiting in buffer (they are either still in Cutting or already completed).");
      return;
    }

    await completeStage(serials, undefined, true);
  };

  const toggleSelectAll = () => {
    if (selectedRowIds.length === filteredRows.length && filteredRows.length > 0) {
      setSelectedRowIds([]);
    } else {
      setSelectedRowIds(filteredRows.map((r) => r.id));
    }
  };

  const toggleSelect = (rowId: string) => {
    setSelectedRowIds((prev) =>
      prev.includes(rowId) ? prev.filter((id) => id !== rowId) : [...prev, rowId]
    );
  };

  // Open scan modal for row
  const openScanModal = (row: ConsolidatedPositionRow) => {
    setScanRow(row);
    setScanInput("");
    setTimeout(() => scanInputRef.current?.focus(), 100);
  };

  const handleScanVerify = async () => {
    if (!scanRow) return;
    const val = scanInput.trim().toLowerCase();

    // Check barcode or serial match against buffer items
    const matchedItem = scanRow.bufferItems.find(
      (i) =>
        i.barcode.toLowerCase() === val ||
        i.serialNumber.toLowerCase() === val ||
        scanRow.barcode.toLowerCase() === val
    );

    if (matchedItem || val === scanRow.posNo.toLowerCase() || val === scanRow.piNumber.toLowerCase()) {
      const serials = matchedItem ? [matchedItem.serialNumber] : scanRow.bufferItems.map((i) => i.serialNumber);
      setScanRow(null);
      setScanInput("");
      toast.success(`Verified barcode for POS #${scanRow.posNo}. Advancing to DGU...`);
      await completeStage(serials, 1, false);
    } else {
      toast.error("Barcode mismatch — please scan the correct glass sticker barcode.");
      setScanInput("");
    }
  };

  const selectedPIObject = pis.find((p) => p.id === selectedPIFilter || p.piNumber === selectedPIFilter);

  const totalBufferItems = items.filter((i) => i.currentStage === "Pairing").length;
  const totalBufferSqm = items.filter((i) => i.currentStage === "Pairing").reduce((acc, i) => acc + (i.sqm || 0), 0);
  const readyPairsCount = filteredRows.reduce((acc, r) => acc + (r.readyPairsCount || 0), 0);

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* ── Role-Tailored Workstation Stage Banner & Specs ── */}
      <WorkstationStageBanner
        stage="Pairing"
        totalItems={totalBufferItems}
        totalSqm={totalBufferSqm}
        readyCount={readyPairsCount}
        onNavigateTab={onNavigateTab}
      />

      {/* ── Page Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-4 ppb-panel bg-gradient-to-br from-white/90 to-white/50 backdrop-blur-2xl border-white p-6 rounded-3xl shadow-[0_10px_40px_rgb(22,128,245,0.08)] mb-5 relative overflow-hidden ring-1 ring-slate-900/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-blue-500 to-blue-700 flex items-center justify-center text-white shadow-sm shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">DLGU &amp; Pairing Buffer</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-200">
                1+1 Pane Synchronization
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Automated pairing of Colour + Clear glass pane pairs, staging buffer racks, and advance to DGU/Lamination.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold">
            Buffer Panes: <span className="font-mono text-blue-700 font-black">{activeViewMetrics.inBufferPieces}</span> ({activeViewMetrics.readyPairs} Pairs Ready)
          </div>
        </div>
      </div>

      {/* ── 5 PI Executive Production Summary Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Card 1: Total PI Glass Uploaded */}
        <div
          onClick={() => setFinishFilter("ALL")}
          className={`ppb-panel p-4 transition-all duration-300 cursor-pointer relative overflow-hidden group select-none ${finishFilter === "ALL" ? "border-[#1680f5] ring-2 ring-[#1680f5]/20 shadow-md scale-[1.02]" : "border-transparent hover:border-[#1680f5]/40 hover:shadow-[0_8px_30px_rgb(22,128,245,0.12)]"}`}
          title="Click to show All Pieces"
          role="button" tabIndex={0}
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shrink-0 shadow-sm text-white">
              <Boxes className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider group-hover:text-blue-700 transition-colors">
                Total PI Glass
              </div>
              <div className="text-2xl font-black text-slate-900 mt-0.5 font-mono tracking-tight leading-none">
                {activeViewMetrics.totalPieces} <span className="text-xs font-bold text-blue-700">Pcs</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-3">
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-md">
              {activeViewMetrics.totalSqm.toFixed(1)} m²
            </span>
            <span className="text-[10px] text-slate-400 font-medium">Batch Area</span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-1 text-[11px] text-blue-700 font-semibold">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            <span>Batch glass units</span>
          </div>
        </div>

        {/* Card 2: Total Glass Cut (Arrived in Buffer / Advanced) */}
        <div
          onClick={() => setFinishFilter(finishFilter === "CUT" ? "ALL" : "CUT")}
          className={`ppb-panel p-4 transition-all duration-300 cursor-pointer relative overflow-hidden group select-none ${finishFilter === "CUT" ? "border-[#1680f5] ring-2 ring-[#1680f5]/20 shadow-md scale-[1.02]" : "border-transparent hover:border-[#1680f5]/40 hover:shadow-[0_8px_30px_rgb(22,128,245,0.12)]"}`}
          title="Click to filter to Cut Glass positions"
          role="button" tabIndex={0}
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shrink-0 shadow-sm text-white">
              <CheckCircle className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider group-hover:text-emerald-700 transition-colors">
                Glass Cut (Ready)
              </div>
              <div className="text-2xl font-black text-slate-900 mt-0.5 font-mono tracking-tight leading-none">
                {activeViewMetrics.cutPieces} <span className="text-xs font-bold text-emerald-700">({activeViewMetrics.cutPercent}%)</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-3">
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md">
              {activeViewMetrics.cutSqm.toFixed(1)} m²
            </span>
            <span className="text-[10px] text-slate-400 font-medium">{activeViewMetrics.colourCut} Col / {activeViewMetrics.clearCut} Clr</span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-1 text-[11px] text-emerald-700 font-semibold">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>Ready for buffer</span>
          </div>
        </div>

        {/* Card 3: Glass Remaining in Cutting */}
        <div
          onClick={() => setFinishFilter(finishFilter === "REMAINING" ? "ALL" : "REMAINING")}
          className={`ppb-panel p-4 transition-all duration-300 cursor-pointer relative overflow-hidden group select-none ${finishFilter === "REMAINING" ? "border-[#1680f5] ring-2 ring-[#1680f5]/20 shadow-md scale-[1.02]" : "border-transparent hover:border-[#1680f5]/40 hover:shadow-[0_8px_30px_rgb(22,128,245,0.12)]"}`}
          title="Click to filter to Pending Cut positions"
          role="button" tabIndex={0}
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shrink-0 shadow-sm text-white">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider group-hover:text-amber-700 transition-colors">
                Pending Cutting
              </div>
              <div className="text-2xl font-black text-slate-900 mt-0.5 font-mono tracking-tight leading-none">
                {activeViewMetrics.remainingPieces} <span className="text-xs font-bold text-amber-700">Left</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-3">
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md">
              {activeViewMetrics.remainingSqm.toFixed(1)} m²
            </span>
            <span className="text-[10px] text-slate-400 font-medium">On Table</span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-1 text-[11px] text-amber-700 font-semibold">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            <span>Awaiting CNC Table</span>
          </div>
        </div>

        {/* Card 4: Staged at Pairing Buffer */}
        <div
          onClick={() => setFinishFilter(finishFilter === "BUFFER" ? "ALL" : "BUFFER")}
          className={`ppb-panel p-4 transition-all duration-300 cursor-pointer relative overflow-hidden group select-none ${finishFilter === "BUFFER" ? "border-[#1680f5] ring-2 ring-[#1680f5]/20 shadow-md scale-[1.02]" : "border-transparent hover:border-[#1680f5]/40 hover:shadow-[0_8px_30px_rgb(22,128,245,0.12)]"}`}
          title="Click to filter to Panes Staged in Buffer"
          role="button" tabIndex={0}
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0 shadow-sm text-white">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider group-hover:text-[#1680f5] transition-colors">
                Staged in Buffer
              </div>
              <div className="text-2xl font-black text-slate-900 mt-0.5 font-mono tracking-tight leading-none">
                {activeViewMetrics.inBufferPieces} <span className="text-xs font-bold text-[#1680f5]">Panes</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-3">
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-[#1680f5] bg-blue-50/50 px-1.5 py-0.5 rounded-md">
              {activeViewMetrics.colourBuffer} Col / {activeViewMetrics.clearBuffer} Clr
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-1 text-[11px] text-[#1680f5] font-semibold">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-50/500"></span>
            <span>Staged on buffer harp racks</span>
          </div>
        </div>

        {/* Card 5: Ready Paired Sets */}
        <div
          onClick={() => setFinishFilter(finishFilter === "READY" ? "ALL" : "READY")}
          className={`ppb-panel p-4 transition-all duration-300 border-transparent cursor-pointer hover:shadow-md hover:-translate-y-0.5 relative overflow-hidden group flex flex-col justify-between select-none ${
            finishFilter === "READY" ? "border-indigo-400 ring-2 ring-indigo-500/30 shadow-lg" : "border-slate-200 hover:border-indigo-300 shadow-lg"
          }`}
          title="Click to filter to Ready Paired Sets"
          role="button" tabIndex={0}
        >
          <div>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shrink-0 shadow-sm text-white">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider group-hover:text-indigo-700 transition-colors">
                  Ready Paired Sets
                </div>
                <div className="text-2xl font-black text-slate-900 mt-0.5 font-mono tracking-tight leading-none">
                  {activeViewMetrics.readyPairs} <span className="text-xs font-bold text-indigo-700">Sets</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-3">
              <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-md">
                1+1 Matched
              </span>
            </div>
          </div>
          {activeViewMetrics.readyPairs > 0 && (
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                if (categoryFilter === "DLGU") {
                  handlePairDlguDirect();
                } else if (categoryFilter === "DGU") {
                  handlePairDguDirect();
                } else {
                  handlePairLaminationDirect();
                }
              }}
              disabled={loading}
              className="mt-2.5 h-7 text-xs font-bold bg-gradient-to-r from-blue-500 to-blue-700 hover:bg-blue-700 text-white rounded-xl shadow-lg gap-1 py-0 w-full"
            >
              <Zap className="w-3 h-3" /> Pair &amp; Advance {activeViewMetrics.readyPairs} Sets
            </Button>
          )}
        </div>
      </div>

      {/* ── Action & Filter Control Bar ── */}
      <div className="bg-white/70 backdrop-blur-xl p-3 sm:p-4 rounded-3xl border border-white shadow-[0_8px_30px_rgb(22,128,245,0.06)] space-y-3 relative overflow-hidden ring-1 ring-slate-900/5">
        {/* Row 1: Queue Switcher (Pending Glass vs DGU vs Lamination vs DLGU) & Primary Export */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {/* Category Filter: Pending Glass + DGU + Lamination + DLGU */}
          <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-xl border border-slate-200/80 flex-wrap sm:flex-nowrap">
            {/* Unified Cross-Category Pending Glass Tab */}
            <button
              type="button"
              onClick={() => {
                setCategoryFilter("ALL_PENDING");
                setPendingSubFilter("ALL");
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                categoryFilter === "ALL_PENDING"
                  ? "bg-gradient-to-r from-rose-500 to-rose-700 text-white shadow-lg"
                  : "text-rose-800 hover:bg-rose-100/70"
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Pending Glass</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                categoryFilter === "ALL_PENDING" ? "bg-white/20 text-white" : "bg-rose-200 text-rose-900"
              }`}>
                {pendingPiecesCount}
              </span>
            </button>

            <div className="h-4 w-px bg-slate-300 mx-0.5 hidden sm:block" />

            <button
              type="button"
              onClick={() => {
                setCategoryFilter("DGU");
                setFinishFilter("ALL");
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                categoryFilter === "DGU"
                  ? "bg-gradient-to-r from-teal-500 to-teal-700 text-white shadow-lg"
                  : "text-teal-800 hover:bg-teal-100/60"
              }`}
            >
              <Boxes className="w-3.5 h-3.5" />
              <span>DGU Pairing</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                categoryFilter === "DGU" ? "bg-white/20 text-white" : "bg-teal-200 text-teal-900"
              }`}>
                {dguStickerCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setCategoryFilter("LAMINATION");
                setFinishFilter("ALL");
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                categoryFilter === "LAMINATION"
                  ? "bg-gradient-to-r from-amber-500 to-amber-700 text-white shadow-lg"
                  : "text-amber-800 hover:bg-amber-100/60"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Lamination Pairing</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                categoryFilter === "LAMINATION" ? "bg-white/20 text-white" : "bg-amber-200 text-amber-900"
              }`}>
                {lamStickerCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setCategoryFilter("DLGU");
                setFinishFilter("ALL");
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                categoryFilter === "DLGU"
                  ? "bg-[#1680f5] text-white shadow-md"
                  : "text-slate-600 hover:bg-[#1680f5]/10 hover:text-[#1680f5]"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>DLGU Pairing</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                categoryFilter === "DLGU" ? "bg-white/20 text-white" : "bg-[#1680f5]/20 text-[#1680f5]"
              }`}>
                {dlguStickerCount}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                const exportItems = filteredRows.flatMap((r) => r.rawItems);
                const exportName = categoryFilter === "ALL_PENDING" ? "Pending_Glass_DGU_LAM_DLGU" : `Pairing_Buffer_${categoryFilter}`;
                exportStageWipToExcel("Pairing", exportItems, exportName, pis);
              }}
              className="bg-gradient-to-r from-emerald-500 to-emerald-700 hover:bg-emerald-700 text-white h-8 text-xs font-extrabold gap-1.5 rounded-xl shrink-0 shadow-2xs px-3 cursor-pointer"
              title="Export Pairing & Buffer queue to Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Export Excel
            </Button>
          </div>
        </div>

        {/* Row 2: Sub-tabs, Search & Filters on Left + View Mode Switcher on Right */}
        <div className="flex items-center justify-between flex-wrap gap-2.5 pt-2 border-t border-slate-100">
          {/* Left Side: Sub-tabs + Search Bar + Client / PI Dropdowns */}
          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-[280px]">
            {/* Sub-tabs when Pending Glass is selected */}
            {categoryFilter === "ALL_PENDING" ? (
              <div className="flex items-center gap-1 p-0.5 bg-slate-100/90 rounded-xl border border-slate-200/80 flex-wrap animate-in fade-in zoom-in-95 duration-150">
                <button
                  type="button"
                  onClick={() => setPendingSubFilter("ALL")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                    pendingSubFilter === "ALL"
                      ? "bg-white text-slate-900 shadow-lg ring-1 ring-slate-200"
                      : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                  }`}
                >
                  <span>All Pending</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800">
                    {pendingPiecesCount} pcs
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setPendingSubFilter("CUTTING")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                    pendingSubFilter === "CUTTING"
                      ? "bg-gradient-to-r from-amber-500 to-amber-700 text-white shadow-lg"
                      : "text-amber-800 hover:bg-amber-100/60"
                  }`}
                >
                  <Clock className="w-3 h-3" />
                  <span>Pending Cutting</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    pendingSubFilter === "CUTTING" ? "bg-white/20 text-white" : "bg-amber-200 text-amber-900"
                  }`}>
                    {pendingCuttingPiecesCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setPendingSubFilter("BUFFER")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                    pendingSubFilter === "BUFFER"
                      ? "bg-[#1680f5] text-white shadow-md"
                      : "text-slate-600 hover:bg-[#1680f5]/10 hover:text-[#1680f5]"
                  }`}
                >
                  <Layers className="w-3 h-3" />
                  <span>Waiting Partner (In Buffer)</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    pendingSubFilter === "BUFFER" ? "bg-white/20 text-white" : "bg-[#1680f5]/20 text-[#1680f5]"
                  }`}>
                    {pendingBufferPiecesCount}
                  </span>
                </button>

                <div className="h-4 w-px bg-slate-300 mx-0.5" />

                <button
                  type="button"
                  onClick={() => setPendingSubFilter("DGU")}
                  className={`px-2 py-1 rounded-lg text-[11px] font-black transition-all flex items-center gap-1 cursor-pointer ${
                    pendingSubFilter === "DGU"
                      ? "bg-gradient-to-r from-teal-500 to-teal-700 text-white shadow-lg"
                      : "text-teal-700 hover:bg-teal-50"
                  }`}
                >
                  <span>DGU ({pendingDguPiecesCount})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPendingSubFilter("LAMINATION")}
                  className={`px-2 py-1 rounded-lg text-[11px] font-black transition-all flex items-center gap-1 cursor-pointer ${
                    pendingSubFilter === "LAMINATION"
                      ? "bg-gradient-to-r from-amber-500 to-amber-700 text-white shadow-lg"
                      : "text-amber-700 hover:bg-amber-50"
                  }`}
                >
                  <span>Lam ({pendingLamPiecesCount})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPendingSubFilter("DLGU")}
                  className={`px-2 py-1 rounded-lg text-[11px] font-black transition-all flex items-center gap-1 cursor-pointer ${
                    pendingSubFilter === "DLGU"
                      ? "bg-[#1680f5] text-white shadow-md"
                      : "text-[#1680f5] hover:bg-blue-50/50"
                  }`}
                >
                  <span>DLGU ({pendingDlguPiecesCount})</span>
                </button>
              </div>
            ) : (categoryFilter === "DGU" || categoryFilter === "LAMINATION") ? (
              <div className="flex items-center gap-1 p-0.5 bg-slate-100/90 rounded-xl border border-slate-200/80 animate-in fade-in zoom-in-95 duration-150">
                <button
                  type="button"
                  onClick={() => setFinishFilter("ALL")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                    finishFilter === "ALL"
                      ? "bg-white text-slate-900 shadow-lg ring-1 ring-slate-200"
                      : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                  }`}
                >
                  <span>All</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    finishFilter === "ALL" ? "bg-slate-200 text-slate-800" : "bg-slate-200/60 text-slate-600"
                  }`}>
                    {scopedAllStickerCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setFinishFilter("COLOUR")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                    finishFilter === "COLOUR"
                      ? "bg-[#1680f5] text-white shadow-md"
                      : "text-slate-600 hover:bg-[#1680f5]/10 hover:text-[#1680f5]"
                  }`}
                >
                  <span>Colour Glass</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    finishFilter === "COLOUR" ? "bg-white/20 text-white" : "bg-[#1680f5]/20 text-[#1680f5]"
                  }`}>
                    {scopedColourStickerCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setFinishFilter("CLEAR")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                    finishFilter === "CLEAR"
                      ? "bg-gradient-to-r from-cyan-500 to-cyan-700 text-white shadow-lg"
                      : "text-cyan-800 hover:bg-cyan-100/60"
                  }`}
                >
                  <span>Clear Glass</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    finishFilter === "CLEAR" ? "bg-white/20 text-white" : "bg-cyan-200 text-cyan-900"
                  }`}>
                    {scopedClearStickerCount}
                  </span>
                </button>
              </div>
            ) : <div />}

            {/* Client Filter */}
            {availableCustomers.length > 0 && (
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs shrink-0">
                <span className="text-[11px] font-bold text-slate-500 px-1.5 flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-indigo-600" /> Client:
                </span>
                <select
                  value={selectedCustomerFilter}
                  onChange={(e) => {
                    setSelectedCustomerFilter(e.target.value);
                    setSelectedRowIds([]);
                  }}
                  className="bg-white text-slate-900 font-extrabold text-xs rounded-lg px-2 py-1 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer w-[120px] sm:w-[135px] truncate"
                  title="Filter by Customer / Client Name"
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

            {/* PI Filter */}
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs shrink-0">
              <span className="text-[11px] font-bold text-slate-500 px-1.5 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-slate-400" /> PI:
              </span>
              <select
                value={selectedPIFilter}
                onChange={(e) => {
                  setSelectedPIFilter(e.target.value);
                  setSelectedRowIds([]);
                }}
                className="bg-white text-slate-900 font-extrabold text-xs rounded-lg px-2 py-1 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer w-[115px] sm:w-[125px] truncate"
              >
                <option value="ALL">All PIs ({availablePIs.length})</option>
                {availablePIs.map((p) => (
                  <option key={p.id} value={p.id || p.piNumber}>
                    PI {formatBatchNumber(p.piNumber)} — {p.customerName}
                  </option>
                ))}
              </select>
            </div>

            {/* Search Input */}
            <div className="relative min-w-[170px] max-w-xs flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search POS, Code, Spec..."
                className="pl-7 pr-7 text-xs bg-slate-50 border-slate-200 h-8 rounded-xl focus:bg-white w-full"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Right Side: Expand/Collapse All */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {groupedCustomerRows.length > 0 && (
              <div className="flex items-center gap-1 shrink-0 mr-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setAllBufferCustomersExpanded(true)}
                  className="text-[11px] font-bold text-slate-600 hover:text-indigo-700 h-8 px-2"
                >
                  Expand All
                </Button>
                <span className="text-slate-300">|</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setAllBufferCustomersExpanded(false)}
                  className="text-[11px] font-bold text-slate-600 hover:text-indigo-700 h-8 px-2"
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
            {groupedCustomerRows.length > 0 ? (
              groupedCustomerRows.map((customer) => {
                const isExpanded = isBufferCustomerExpanded(customer.groupKey);
                const isCompleted = customer.isFullyCut || (customer.totalPieces > 0 && customer.cutPieces >= customer.totalPieces);

                return (
                  <div
                    key={customer.groupKey}
                    className={`ppb-panel p-0 overflow-hidden transition-all duration-300 ${
                      isCompleted
                        ? "border-2 border-emerald-500 shadow-[0_8px_30px_rgb(16,185,129,0.12)]"
                        : "hover:border-[#1680f5] shadow-[0_4px_20px_rgb(22,128,245,0.06)] hover:shadow-[0_8px_30px_rgb(22,128,245,0.15)]"
                    }`}
                  >
                    {/* Customer Summary Card Header */}
                    <div
                      onClick={() => toggleBufferCustomerExpanded(customer.groupKey)}
                      className={`w-full m-0 p-4 sm:p-5 cursor-pointer select-none transition-all duration-300 border-b-0 relative overflow-hidden group flex items-start md:items-center justify-between gap-4 flex-col md:flex-row ${
                        isCompleted
                          ? "bg-gradient-to-r from-emerald-50/80 to-teal-50/40 hover:from-emerald-100/60"
                          : "bg-gradient-to-r from-[#f8fafc] to-white hover:from-blue-50/50"
                      }`}
                    >
                      {/* Left: Customer Info */}
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div
                          className={`w-12 h-12 rounded-[14px] text-white flex items-center justify-center font-black text-lg shrink-0 shadow-sm transition-transform duration-300 group-hover:scale-105 ${
                              isCompleted
                                ? "bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-200/50"
                                : "bg-gradient-to-br from-[#1680f5] to-[#1470e0] shadow-blue-200/50"
                            }`}
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
                              className="text-[17px] font-black tracking-tight truncate text-rose-700 flex items-center gap-1.5"
                              title={customer.pdfFiles && customer.pdfFiles.length > 0 ? customer.pdfFiles.join(', ') : customer.customerName}
                            >
                              <FileText className="w-4.5 h-4.5 text-rose-500 shrink-0" />
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
                            {customer.readyPairs > 0 && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse">
                                <Sparkles className="w-3 h-3 text-emerald-600" />
                                {customer.readyPairs} Pairs Ready
                              </span>
                            )}
                            {isCompleted ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-gradient-to-r from-emerald-500 to-emerald-700 text-white shadow-lg border border-emerald-400">
                                <Check className="w-3 h-3 stroke-[3]" /> FULLY CUT
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                                In Production
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

                      {/* Right: Quantities, Progress & Accordion Trigger */}
                      <div className="flex items-center gap-5 shrink-0 justify-between md:justify-end w-full md:w-auto mt-2 md:mt-0">
                        <div className="text-left md:text-right">
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
                              {customer.cutPieces}/{customer.totalPieces} Cut
                            </span>
                            <span className="text-slate-400 mx-1.5">•</span>
                            <span className="text-slate-600">{customer.totalSqm.toFixed(2)} m²</span>
                          </div>
                          <div className="flex items-center gap-2 justify-start md:justify-end mt-1.5">
                            <div
                              className={`w-36 sm:w-44 h-2 rounded-full overflow-hidden ${
                                isCompleted ? "bg-emerald-200" : "bg-slate-200"
                              }`}
                            >
                              <div
                                className={`h-full rounded-full transition-all ${
                                  isCompleted
                                    ? "bg-gradient-to-r from-emerald-500 to-teal-600"
                                    : "bg-gradient-to-r from-indigo-500 to-purple-600"
                                }`}
                                style={{ width: `${customer.progressPct}%` }}
                              />
                            </div>
                            <span
                              className={`text-xs font-mono font-bold ${
                                isCompleted ? "text-emerald-700 font-extrabold" : "text-slate-500"
                              }`}
                            >
                              {customer.progressPct}%
                            </span>
                          </div>
                        </div>

                        <div
                          className={`p-2 rounded-xl transition-all shadow-2xs shrink-0 ${
                            isCompleted
                              ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 group-hover:scale-105"
                              : "bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-700 group-hover:scale-105"
                          }`}
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 stroke-[2.5]" />
                          ) : (
                            <ChevronDown className="w-4 h-4 stroke-[2.5]" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Collapsible Customer Position Rows Table */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50/30 p-5">
                      <div className="ppb-panel p-0 overflow-hidden">
                        <TableHorizontalScrollWrapper>
                          <table className="w-full text-left text-xs border-collapse">
                            <thead className="border-b border-slate-100 text-[10px] font-extrabold text-[#1680f5] uppercase tracking-widest bg-blue-50/40 select-none">
                              <tr>
                                <th className="px-2 py-2 text-center whitespace-nowrap">SL NO.</th>
                                <th className="px-2 py-2 text-center whitespace-nowrap">PI</th>
                                <th className="px-2 py-2 text-center whitespace-nowrap">BATCH</th>
                                <th className="px-2 py-2 text-center whitespace-nowrap">POS NO.</th>
                                <th className="px-2 py-2 whitespace-nowrap">FINISH / TYPE</th>
                                <th className="px-2 py-2 text-center whitespace-nowrap">WIDTH (MM)</th>
                                <th className="px-2 py-2 text-center whitespace-nowrap">HEIGHT (MM)</th>
                                <th className="px-2 py-2 text-center whitespace-nowrap">TOTAL QTY</th>
                                <th className="px-2 py-2 text-center whitespace-nowrap bg-emerald-50/80 text-emerald-900 border-x border-emerald-200">GLASS CUT</th>
                                <th className="px-2 py-2 text-center whitespace-nowrap bg-amber-50/80 text-amber-900 border-r border-amber-200">REMAINING</th>
                                <th className="px-2 py-2 text-right whitespace-nowrap">SQM</th>
                                <th className="px-2 py-2 whitespace-nowrap">1+1 PAIRING / BUFFER STATUS</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-800 font-sans">
                              {customer.rows.map((row) => {
                                const isRowExpanded = expandedRowIds.includes(row.id);
                                const isFullyCut = row.remainingQty === 0;

                                return (
                                  <React.Fragment key={row.id}>
                                    <tr className={`hover:bg-indigo-50/40 transition-colors ${isRowExpanded ? "bg-indigo-50/30" : ""}`}>
                                      <td className="px-2 py-2 font-mono font-bold text-slate-500 text-center text-xs align-middle whitespace-nowrap">
                                        <div className="flex items-center justify-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() => toggleExpandRow(row.id)}
                                            className={`p-1 rounded-md transition-all cursor-pointer ${
                                              isRowExpanded
                                                ? "bg-indigo-100 text-indigo-700 shadow-2xs"
                                                : "text-slate-400 hover:text-indigo-700 hover:bg-slate-200/80"
                                            }`}
                                          >
                                            {isRowExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                          </button>
                                          <span>{row.slNo}</span>
                                        </div>
                                      </td>
                                      <td className="px-2 py-2 font-mono font-bold text-[#1680f5] text-center whitespace-nowrap">
                                        {formatBatchNumber(row.piNumber)}
                                      </td>
                                      <td className="px-2 py-2 font-mono text-center font-bold text-slate-700 whitespace-nowrap">
                                        {formatBatchNumber(row.batchNo || row.piNumber)}
                                      </td>
                                      <td className="px-2 py-2 font-mono text-center font-black text-indigo-900 bg-indigo-50/60 border-x border-indigo-100 whitespace-nowrap">
                                        #{row.posNo}
                                      </td>
                                      <td className="px-2 py-2 whitespace-nowrap">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                                            row.finish === "Colour"
                                              ? "bg-blue-100 text-blue-800 border-blue-200"
                                              : "bg-cyan-100 text-cyan-800 border-cyan-200"
                                          }`}>
                                            {row.finish}
                                          </span>
                                          <span className="text-[11px] font-mono text-slate-600 truncate max-w-[130px]" title={row.glassType}>
                                            {row.glassType}
                                          </span>
                                        </div>
                                      </td>
                                      <td className="px-2 py-2 font-mono text-center font-bold text-slate-700 whitespace-nowrap">
                                        {row.width}
                                      </td>
                                      <td className="px-2 py-2 font-mono text-center font-bold text-slate-700 whitespace-nowrap">
                                        {row.height}
                                      </td>
                                      <td className="px-2 py-2 font-mono text-center font-black text-slate-900 whitespace-nowrap">
                                        {row.totalQty}
                                      </td>
                                      <td className="px-2 py-2 text-center align-middle bg-emerald-50/50 border-x border-emerald-100 whitespace-nowrap font-mono font-black text-emerald-800">
                                        {row.cutQty}
                                      </td>
                                      <td className="px-2 py-2 text-center align-middle bg-amber-50/40 border-r border-amber-100 whitespace-nowrap font-mono font-black text-amber-800">
                                        {row.remainingQty}
                                      </td>
                                      <td className="px-2 py-2 text-right font-mono font-black text-emerald-700 whitespace-nowrap">
                                        {row.totalSqm.toFixed(2)} m²
                                      </td>
                                      <td className="px-2 py-2 align-middle whitespace-nowrap">
                                        {row.readyPairsCount > 0 ? (
                                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-indigo-100 text-indigo-900 border border-indigo-300">
                                            <Sparkles className="w-3 h-3 text-indigo-600" />
                                            <span>✨ {row.readyPairsCount} Pair(s) Ready</span>
                                          </span>
                                        ) : row.inBufferQty > 0 ? (
                                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-950 border border-blue-300">
                                            <Layers className="w-3 h-3 text-[#1680f5]" />
                                            <span>📦 Staged in Buffer ({row.inBufferQty} pcs)</span>
                                          </span>
                                        ) : isFullyCut ? (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                            <Check className="w-3 h-3 text-emerald-600" />
                                            <span>Cut Complete</span>
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                                            <Clock className="w-3 h-3 text-slate-400" />
                                            <span>In Cutting</span>
                                          </span>
                                        )}
                                      </td>
                                    </tr>

                                    {/* Expanded Individual Pieces Sub-Table */}
                                    {isRowExpanded && (
                                      <tr>
                                        <td colSpan={12} className="bg-slate-50/80 p-3 border-b-2 border-slate-200">
                                          <div className="bg-white/80 backdrop-blur-md rounded-2xl border border-white/60 p-4 shadow-[0_8px_30px_rgb(22,128,245,0.06)] hover:shadow-[0_8px_30px_rgb(22,128,245,0.12)] transition-all duration-300 relative overflow-hidden ring-1 ring-slate-900/5">
                                            <div className="text-xs font-black text-slate-800 mb-2 flex items-center justify-between">
                                              <span>POS #{row.posNo} — Individual Glass Panes ({row.rawItems.length} items)</span>
                                              <span className="text-slate-500 font-normal text-[11px]">{row.customerName} • {row.projectName}</span>
                                            </div>
                                            <div className="overflow-x-auto no-scrollbar">
                                              <table className="w-full text-left text-xs">
                                                <thead>
                                                  <tr className="border-b text-[10px] font-black text-slate-500 uppercase bg-slate-50">
                                                    <th className="py-1 px-2">SERIAL</th>
                                                    <th className="py-1 px-2">BARCODE</th>
                                                    <th className="py-1 px-2">FINISH</th>
                                                    <th className="py-1 px-2">STAGE</th>
                                                    <th className="py-1 px-2">STATUS</th>
                                                    <th className="py-1 px-2 text-right">ACTION</th>
                                                  </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                  {row.rawItems.map((piece) => (
                                                    <tr key={piece.id || piece.serialNumber} className="hover:bg-slate-50">
                                                      <td className="py-1.5 px-2 font-mono font-bold text-slate-800">{piece.serialNumber}</td>
                                                      <td className="py-1.5 px-2 font-mono text-slate-600">{piece.barcode}</td>
                                                      <td className="py-1.5 px-2">
                                                        <span className={`px-1.5 py-0.2 rounded text-[9.5px] font-bold ${
                                                          piece.colorOrClear === "Colour" ? "bg-blue-100 text-blue-800" : "bg-cyan-100 text-cyan-800"
                                                        }`}>
                                                          {piece.colorOrClear || row.finish}
                                                        </span>
                                                      </td>
                                                      <td className="py-1.5 px-2 font-bold text-indigo-700">{piece.currentStage}</td>
                                                      <td className="py-1.5 px-2">
                                                        <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold ${
                                                          piece.status === "Completed" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                                                        }`}>
                                                          {piece.status || "In Production"}
                                                        </span>
                                                      </td>
                                                      <td className="py-1.5 px-2 text-right space-x-1">
                                                        <button
                                                          type="button"
                                                          onClick={() => onPrintSticker(piece)}
                                                          className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                                                          title="Print Sticker"
                                                        >
                                                          <Tag className="w-3 h-3 inline" />
                                                        </button>
                                                        <button
                                                          type="button"
                                                          onClick={() => onReject(piece)}
                                                          className="p-1 rounded bg-red-50 hover:bg-red-100 text-red-600"
                                                          title="Reject"
                                                        >
                                                          <AlertCircle className="w-3 h-3 inline" />
                                                        </button>
                                                        <button
                                                          type="button"
                                                          onClick={() => onRework(piece)}
                                                          className="p-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-600"
                                                          title="Rework"
                                                        >
                                                          <RotateCcw className="w-3 h-3 inline" />
                                                        </button>
                                                      </td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            </div>
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </React.Fragment>
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
              <Users className="w-10 h-10 mx-auto mb-2 opacity-30 text-indigo-600" />
              <p className="text-sm font-semibold">No customer buffer items found matching the filters.</p>
            </div>
          )}
        </div>

      {/* ── Scan Verification Modal for Pairing Buffer ── */}
      {scanRow && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                  <ScanLine className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">
                    Scan & Verify Glass — Buffer Stage
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    POS #{scanRow.posNo} • PI {formatBatchNumber(scanRow.piNumber)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setScanRow(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Position / Finish:</span>
                <span className="font-bold text-slate-900">
                  POS {scanRow.posNo} • {scanRow.finish === "Colour" ? "Colour" : "Clear"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Dimensions:</span>
                <span className="font-bold text-emerald-700">{scanRow.width} × {scanRow.height} mm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Buffer Staged Quantity:</span>
                <span className="font-bold text-indigo-700">{scanRow.inBufferQty} pcs in Buffer</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Total PI Cut / Remaining:</span>
                <span className="font-mono font-bold">
                  {scanRow.cutQty} Cut / {scanRow.remainingQty} Remaining
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700">Scan Glass Barcode to Advance</label>
              <div className="flex gap-2">
                <Input
                  ref={scanInputRef}
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleScanVerify()}
                  placeholder="Scan barcode..."
                  className="font-mono text-sm border-slate-300"
                  autoFocus
                />
                <Button
                  onClick={handleScanVerify}
                  disabled={!scanInput.trim()}
                  className="bg-gradient-to-r from-indigo-500 to-indigo-700 hover:bg-indigo-700 text-white font-bold px-4 shrink-0"
                >
                  <ScanLine className="w-4 h-4" />
                </Button>
              </div>
            </div>

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
                  const serials = targetRow.bufferItems.map((i) => i.serialNumber);
                  await completeStage(serials, 1, false);
                }}
                className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-800 text-white font-extrabold text-xs gap-1.5 shadow-[0_4px_14px_rgba(5,150,105,0.4)] border border-emerald-400/50 cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5" /> 1-Click Send to DGU
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
