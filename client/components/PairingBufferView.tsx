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
} from "lucide-react";
import { toast } from "sonner";
import { formatBatchNumber, formatPlatformDate, formatPlatformTime, getItemFinish, isDguStickerPairMatch, isDguGlass, isLaminatedGlass, isDlguGlass } from "@/lib/utils";
import { exportStageWipToExcel } from "@/lib/excelExport";

interface PairingBufferViewProps {
  items: GlassItem[];
  pis?: PIMaster[];
  operator?: string;
  externalSearchTerm?: string;
  onRefresh: () => void;
  onReject: (item: GlassItem) => void;
  onRework: (item: GlassItem) => void;
  onPrintSticker: (item: GlassItem) => void;
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
}) => {
  // PI / Batch Filter: "ALL" or specific PI ID / PI number
  const [selectedPIFilter, setSelectedPIFilter] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [finishFilter, setFinishFilter] = useState<"ALL" | "COLOUR" | "CLEAR" | "READY" | "BUFFER" | "CUT" | "REMAINING" | "COMPLETED">("ALL");
  const [categoryFilter, setCategoryFilter] = useState<"DGU" | "LAMINATION" | "DLGU">("DGU");
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
      const parentPI = pis.find((p) => p.id === item.piId || p.piNumber === item.piNumber);
      const orderPi = (item.orderNo || item.piNumber || parentPI?.piNumber || `BATCH-${item.batchNo || "1"}`).replace(/^STK-/i, "").trim();
      const customer = parentPI?.customerName || (item as any).customerName || "BRIGHT PLUS FITOUT";

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

    // Also include any PIs from Master if not already mapped
    pis.forEach((p) => {
      const pNum = (p.piNumber || "").replace(/^STK-/i, "").trim();
      if (pNum && !map.has(pNum)) {
        map.set(pNum, {
          id: p.id || pNum,
          piNumber: pNum,
          customerName: p.customerName || "BRIGHT PLUS FITOUT",
          totalItems: p.totalQty || p.itemsCount || 0,
          cutItems: p.completedItemsCount || 0,
        });
      }
    });

    return Array.from(map.values());
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

    items.forEach((item) => {
      if (item.status === "Rejected") return;

      const parentPI = pis.find((p) => p.id === item.piId || p.piNumber === item.piNumber);
      // The PI number displayed in the sticker upload table is item.orderNo (e.g. 2045, 2137, 2139)
      const cleanPiNumber = (item.orderNo || item.piNumber || parentPI?.piNumber || `BATCH-${item.batchNo || "1"}`).replace(/^STK-/i, "").trim();
      const posKey = (item.posNo || String(item.srNo || "1")).trim();
      const finish = getItemFinish(item);
      const isDlgu = item.glassCategory === "DLGU" || isDlguGlass(item);
      const isLam = !isDlgu && (item.glassCategory === "Lamination" || isLaminatedGlass(item));
      const glassCategory: "DGU" | "Lamination" | "DLGU" = isDlgu ? "DLGU" : (isLam ? "Lamination" : "DGU");
      // Differentiate lites by thickness or primary glass type (e.g. 12MM vs 10MM) so matching lites form separate rows to be paired
      const rawThickness = (item.thickness || item.glassType?.match(/^\d+(\.\d+)?\s*MM/i)?.[0] || "").toUpperCase().replace(/\s+/g, "");
      const thicknessKey = rawThickness || (item.glassType?.split("/")[0]?.trim()) || finish;
      const dlguPhaseKey = isDlgu
        ? (item.dlguPhase || (item.completedStages.includes("Lamination") || item.colorOrClear === "Colour" || !item.processRoute?.includes("Lamination") ? "DguPairing" : "LamPairing"))
        : "default";
      const groupKey = `${cleanPiNumber}_pos_${posKey}_${item.width}x${item.height}_${thicknessKey}_${finish}_${glassCategory}_${dlguPhaseKey}`;

      if (!positionMap.has(groupKey)) {
        positionMap.set(groupKey, {
          id: groupKey,
          piNumber: cleanPiNumber,
          piId: item.piId || parentPI?.id,
          customerName: parentPI?.customerName || (item as any).customerName || "BRIGHT PLUS FITOUT",
          projectName: parentPI?.projectName || (item as any).projectName || item.sectionName || "VAL_BY_KAS",
          posNo: posKey,
          glassCategory,
          dlguPhase: isDlgu ? (dlguPhaseKey as "LamPairing" | "DguPairing") : undefined,
          finish,
          width: item.width || 1000,
          height: item.height || 1000,
          rawItems: [],
          bufferItems: [],
          glassCode: item.glassCode || `GL ${posKey} SITE`,
          glassType: item.glassType || item.itemCode || (finish === "Colour" ? "6MM COLOURED TEMPERED" : "6MM CLEAR TEMPERED"),
          obNo: item.obNo || "3705",
          sfoNo: item.sfoNo || cleanPiNumber,
          batchNo: item.batchNo || "5442",
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
      // Total pieces uploaded for this position
      const totalPieces = g.rawItems.reduce((acc: number, curr: any) => acc + (curr.qty || 1), 0);

      // Pieces cut (advanced from cutting)
      const cutPieces = g.rawItems
        .filter((i: any) => i.currentStage?.toLowerCase() !== "cutting")
        .reduce((acc: number, curr: any) => acc + (curr.qty || 1), 0);

      // Pieces still remaining in cutting
      const remainingPieces = g.rawItems
        .filter((i: any) => i.currentStage?.toLowerCase() === "cutting")
        .reduce((acc: number, curr: any) => acc + (curr.qty || 1), 0);

      // Pieces currently waiting in buffer
      const bufferPieces = g.bufferItems.reduce((acc: number, curr: any) => acc + (curr.qty || 1), 0);

      // Pieces assembled and dispatched to Finished
      const finishedPieces = g.rawItems
        .filter((i: any) => i.currentStage?.toLowerCase() === "finished" || i.status === "Completed")
        .reduce((acc: number, curr: any) => acc + (curr.qty || 1), 0);

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
            { orderNo: row.piNumber, piId: row.piId, posNo: row.posNo, width: row.width, height: row.height, obNo: row.obNo, lineQty: row.totalQty, glassCode: row.glassCode, customerName: row.customerName, projectName: row.projectName, glassCategory: row.glassCategory, dlguPhase: row.dlguPhase, completedStages: row.rawItems[0]?.completedStages, colorOrClear: row.finish },
            { orderNo: r.piNumber, piId: r.piId, posNo: r.posNo, width: r.width, height: r.height, obNo: r.obNo, lineQty: r.totalQty, glassCode: r.glassCode, customerName: r.customerName, projectName: r.projectName, glassCategory: r.glassCategory, dlguPhase: r.dlguPhase, completedStages: r.rawItems[0]?.completedStages, colorOrClear: r.finish }
          ) &&
          (r.finish !== row.finish || r.glassType !== row.glassType || r.thickness !== row.thickness || r.id !== row.id)
      );

      if (partner) {
        row.matchingPartnerRow = partner;
        // Ready pairs is the minimum of cut pieces in buffer / available in lamination for both sides
        const partnerAvailable =
          row.glassCategory === "DLGU" && row.finish === "Colour"
            ? partner.rawItems.filter((i) => i.currentStage === "Lamination" || (i.currentStage === "Pairing" && i.completedStages?.includes("Lamination"))).reduce((a, b) => a + (b.qty || 1), 0)
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

        // Process Category Filter (DGU vs Lamination vs DLGU)
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

        // Search Query
        const q = (searchTerm || externalSearchTerm || "").toLowerCase().trim();
        if (!q) return true;

        return (
          row.piNumber.toLowerCase().includes(q) ||
          row.posNo.toLowerCase().includes(q) ||
          row.glassCode.toLowerCase().includes(q) ||
          row.glassType.toLowerCase().includes(q) ||
          row.barcode.toLowerCase().includes(q) ||
          row.customerName.toLowerCase().includes(q) ||
          row.projectName.toLowerCase().includes(q) ||
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
  }, [consolidatedRows, selectedPIFilter, categoryFilter, finishFilter, searchTerm, externalSearchTerm, sortColumn, sortDirection]);

  const dguStickerCount = consolidatedRows
    .filter((r) => r.glassCategory === "DGU")
    .reduce((sum, r) => sum + r.totalQty, 0);
  const lamStickerCount = consolidatedRows
    .filter((r) => r.glassCategory === "Lamination")
    .reduce((sum, r) => sum + r.totalQty, 0);
  const dlguStickerCount = consolidatedRows
    .filter((r) => r.glassCategory === "DLGU")
    .reduce((sum, r) => sum + r.totalQty, 0);

  // Auto-switch to whichever category has items if current category has 0
  useEffect(() => {
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
    if (categoryFilter === "DGU") return r.glassCategory === "DGU";
    if (categoryFilter === "LAMINATION") return r.glassCategory === "Lamination";
    if (categoryFilter === "DLGU") return r.glassCategory === "DLGU";
    return true;
  });
  const scopedAllStickerCount = scopedCategoryRows.reduce((sum, r) => sum + r.totalQty, 0);
  const scopedColourStickerCount = scopedCategoryRows.filter((r) => r.finish === "Colour").reduce((sum, r) => sum + r.totalQty, 0);
  const scopedClearStickerCount = scopedCategoryRows.filter((r) => r.finish === "Clear").reduce((sum, r) => sum + r.totalQty, 0);

  // Overall KPI metrics for the active view (selected PI or all PIs)
  const activeViewMetrics = useMemo(() => {
    const scopeRows = selectedPIFilter === "ALL"
      ? consolidatedRows
      : consolidatedRows.filter((r) => r.piNumber === selectedPIFilter || r.piId === selectedPIFilter);

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
      toast.success(`⚡ Verified barcode for POS #${scanRow.posNo}! Advancing to DGU...`);
      await completeStage(serials, 1, false);
    } else {
      toast.error("❌ Barcode mismatch — please scan the correct glass sticker barcode.");
      setScanInput("");
    }
  };

  const selectedPIObject = pis.find((p) => p.id === selectedPIFilter || p.piNumber === selectedPIFilter);

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* ── 5 PI Executive Production Summary Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Card 1: Total PI Glass Uploaded */}
        <div
          onClick={() => setFinishFilter("ALL")}
          className={`bg-white border-2 border-indigo-100 rounded-2xl p-3.5 shadow-2xs hover:shadow-md transition-all cursor-pointer ${
            finishFilter === "ALL" ? "ring-2 ring-indigo-500 shadow-sm" : ""
          }`}
          title="Click to show All Pieces"
        >
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-extrabold uppercase tracking-wider">
            <span>Total PI Glass</span>
            <Boxes className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">
            {activeViewMetrics.totalPieces} <span className="text-xs font-bold text-slate-500">Pcs</span>
          </div>
          <div className="text-[11px] text-indigo-700 font-semibold mt-0.5">
            {activeViewMetrics.totalSqm.toFixed(2)} m² • {activeViewMetrics.totalPieces} Total Pieces
          </div>
        </div>

        {/* Card 2: Total Glass Cut (Arrived in Buffer / Advanced) */}
        <div
          onClick={() => setFinishFilter(finishFilter === "CUT" ? "ALL" : "CUT")}
          className={`bg-gradient-to-br from-emerald-50/50 via-white to-white border-2 border-emerald-200 rounded-2xl p-3.5 shadow-2xs hover:shadow-md transition-all cursor-pointer ${
            finishFilter === "CUT" ? "ring-2 ring-emerald-500 shadow-sm" : ""
          }`}
          title="Click to filter to Cut Glass positions"
        >
          <div className="flex items-center justify-between text-emerald-800 text-[11px] font-extrabold uppercase tracking-wider">
            <span>Glass Cut (Ready)</span>
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-950 mt-1">
            {activeViewMetrics.cutPieces} <span className="text-xs font-bold text-emerald-700">Pcs ({activeViewMetrics.cutPercent}%)</span>
          </div>
          <div className="text-[11px] text-emerald-700 font-bold mt-0.5">
            {activeViewMetrics.cutSqm.toFixed(2)} m² Cut • {activeViewMetrics.colourCut} Col / {activeViewMetrics.clearCut} Clr
          </div>
        </div>

        {/* Card 3: Glass Remaining in Cutting */}
        <div
          onClick={() => setFinishFilter(finishFilter === "REMAINING" ? "ALL" : "REMAINING")}
          className={`border-2 rounded-2xl p-3.5 shadow-2xs hover:shadow-md transition-all cursor-pointer ${
            finishFilter === "REMAINING" ? "ring-2 ring-amber-500 shadow-sm" : ""
          } ${
            activeViewMetrics.remainingPieces > 0
              ? "bg-gradient-to-br from-amber-50/60 via-white to-white border-amber-300"
              : "bg-white border-slate-200"
          }`}
          title="Click to filter to Pending Cut positions"
        >
          <div className="flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider text-amber-900">
            <span>Remaining in Cutting</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">
            {activeViewMetrics.remainingPieces} <span className="text-xs font-bold text-amber-700">Pcs Left</span>
          </div>
          <div className="text-[11px] text-amber-800 font-semibold mt-0.5">
            {activeViewMetrics.remainingSqm.toFixed(2)} m² Pending Cut on Table
          </div>
        </div>

        {/* Card 4: Staged at Pairing Buffer */}
        <div
          onClick={() => setFinishFilter(finishFilter === "BUFFER" ? "ALL" : "BUFFER")}
          className={`bg-white border-2 border-purple-200 rounded-2xl p-3.5 shadow-2xs hover:shadow-md transition-all cursor-pointer ${
            finishFilter === "BUFFER" ? "ring-2 ring-purple-500 shadow-sm" : ""
          }`}
          title="Click to filter to Panes Staged in Buffer"
        >
          <div className="flex items-center justify-between text-purple-900 text-[11px] font-extrabold uppercase tracking-wider">
            <span>Staged in Buffer</span>
            <Layers className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-black text-purple-950 mt-1">
            {activeViewMetrics.inBufferPieces} <span className="text-xs font-bold text-purple-700">Panes</span>
          </div>
          <div className="text-[11px] text-purple-700 font-semibold mt-0.5">
            {activeViewMetrics.colourBuffer} Col / {activeViewMetrics.clearBuffer} Clr
          </div>
        </div>

        {/* Card 5: Ready Paired Sets */}
        <div
          onClick={() => setFinishFilter(finishFilter === "READY" ? "ALL" : "READY")}
          className={`bg-gradient-to-br from-indigo-50/70 via-white to-white border-2 border-indigo-300 rounded-2xl p-3.5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between cursor-pointer ${
            finishFilter === "READY" ? "ring-2 ring-indigo-500 shadow-sm" : ""
          }`}
          title="Click to filter to Ready Paired Sets"
        >
          <div>
            <div className="flex items-center justify-between text-indigo-900 text-[11px] font-extrabold uppercase tracking-wider">
              <span>Ready Paired Sets</span>
              <Sparkles className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="text-2xl font-black text-indigo-950 mt-1">
              {activeViewMetrics.readyPairs} <span className="text-xs font-bold text-indigo-700">Sets</span>
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
              className="mt-1.5 h-6 text-[10px] font-black bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-2xs gap-1 py-0 w-full"
            >
              <Zap className="w-3 h-3" /> Pair & Advance {activeViewMetrics.readyPairs} Sets
            </Button>
          )}
        </div>
      </div>

      {/* ── Action & Filter Control Bar ── */}
      <div className="bg-white p-2.5 sm:p-3 rounded-2xl border-2 border-slate-200/90 shadow-xs space-y-2.5">
        {/* Row 1: Queue Switcher (DGU vs Lamination vs DLGU) & Primary Export */}
        <div className="flex items-center justify-between gap-2">
          {/* Category Filter (DGU vs Lamination vs DLGU) */}
          <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-xl border border-slate-200/80">
            <button
              type="button"
              onClick={() => {
                setCategoryFilter("DGU");
                setFinishFilter("ALL");
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                categoryFilter === "DGU"
                  ? "bg-teal-600 text-white shadow-xs"
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
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                categoryFilter === "LAMINATION"
                  ? "bg-amber-600 text-white shadow-xs"
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
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                categoryFilter === "DLGU"
                  ? "bg-purple-600 text-white shadow-xs"
                  : "text-purple-800 hover:bg-purple-100/60"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>DLGU Pairing</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                categoryFilter === "DLGU" ? "bg-white/20 text-white" : "bg-purple-200 text-purple-900"
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
                exportStageWipToExcel("Pairing", exportItems, "Pairing_Buffer_Queue");
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs font-extrabold gap-1.5 rounded-xl shrink-0 shadow-2xs px-3"
              title="Export Pairing & Buffer queue to Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Export Excel
            </Button>
          </div>
        </div>

        {/* Row 2: Sub-tabs (All / Colour / Clear) on Left + PI, Search, Refresh on Right */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-slate-100">
          {/* Sub-tabs for Colour vs Clear Glass (Only shown when DGU or Lamination is selected) */}
          {(categoryFilter === "DGU" || categoryFilter === "LAMINATION") ? (
            <div className="flex items-center gap-1 p-0.5 bg-slate-100/90 rounded-xl border border-slate-200/80 animate-in fade-in zoom-in-95 duration-150">
              <button
                type="button"
                onClick={() => setFinishFilter("ALL")}
                className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                  finishFilter === "ALL"
                    ? "bg-white text-slate-900 shadow-xs ring-1 ring-slate-200"
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
                className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                  finishFilter === "COLOUR"
                    ? "bg-purple-600 text-white shadow-xs"
                    : "text-purple-800 hover:bg-purple-100/60"
                }`}
              >
                <span>Colour Glass</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                  finishFilter === "COLOUR" ? "bg-white/20 text-white" : "bg-purple-200 text-purple-900"
                }`}>
                  {scopedColourStickerCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFinishFilter("CLEAR")}
                className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                  finishFilter === "CLEAR"
                    ? "bg-cyan-600 text-white shadow-xs"
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

          {/* Right PI Filter, Search Input & Refresh */}
          <div className="flex items-center gap-2 shrink-0 flex-nowrap ml-auto">
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
                className="bg-white text-slate-900 font-extrabold text-xs rounded-lg px-2 py-1 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer w-[120px] sm:w-[130px] lg:w-[145px] truncate"
              >
                <option value="ALL">All PIs ({availablePIs.length})</option>
                {availablePIs.map((p) => (
                  <option key={p.id} value={p.id || p.piNumber}>
                    PI {formatBatchNumber(p.piNumber)} — {p.customerName}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative w-36 sm:w-44 lg:w-48 shrink">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search POS, Code, Spec..."
                className="pl-7 pr-7 text-xs bg-slate-50 border-slate-200 h-8 rounded-xl focus:bg-white"
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
        </div>
      </div>

      {/* ── Exact Sticker Upload Layout: Batch Check & Correct Table with Cut & Remaining Columns ── */}
      <div className="border-2 border-slate-200 rounded-2xl bg-white shadow-xs overflow-hidden">
        {/* Table Title Bar */}
        <div className="px-4 py-3 bg-slate-100 text-xs font-extrabold text-slate-700 border-b border-slate-200 flex justify-between items-center flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span>
              {activeViewMetrics.cutPieces} of {activeViewMetrics.totalPieces} Pieces Cut •{" "}
              <strong className="text-amber-700">{activeViewMetrics.remainingPieces} Remaining to Cut</strong>
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-500 font-mono">
              Total Area: <strong className="text-slate-900">{activeViewMetrics.totalSqm.toFixed(2)} m²</strong> (Cut:{" "}
              <strong className="text-emerald-700">{activeViewMetrics.cutSqm.toFixed(2)} m²</strong> • Remaining:{" "}
              <strong className="text-amber-700">{activeViewMetrics.remainingSqm.toFixed(2)} m²</strong>)
            </span>
          </div>
        </div>

        {/* The Table with exact columns */}
        <div className="overflow-x-auto w-full max-h-[600px] overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse min-w-full">
            <thead className="bg-slate-100 text-slate-700 uppercase border-b-2 border-slate-200 text-[10px] font-black sticky top-0 z-10 select-none">
              <tr>
                <th className="px-3 py-2.5 w-14 min-w-[60px] text-center whitespace-nowrap">SL NO.</th>
                <th className="px-3 py-2.5 w-28 min-w-[90px] text-center whitespace-nowrap">PI</th>
                <th
                  onClick={() => handleHeaderSort("posNo")}
                  className="px-3 py-2.5 w-24 min-w-[80px] text-center whitespace-nowrap cursor-pointer hover:bg-slate-200/80 transition-colors"
                  title="Click to sort by POS NO."
                >
                  <div className="inline-flex items-center gap-1">
                    <span>POS NO.</span>
                    {sortColumn === "posNo" ? (
                      sortDirection === "asc" ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    )}
                  </div>
                </th>
                <th className="px-3 py-2.5 w-36 min-w-[130px] whitespace-nowrap">FINISH / TYPE</th>
                <th className="px-3 py-2.5 w-28 min-w-[100px] text-center whitespace-nowrap">WIDTH (MM)</th>
                <th className="px-3 py-2.5 w-28 min-w-[100px] text-center whitespace-nowrap">HEIGHT (MM)</th>
                <th
                  onClick={() => handleHeaderSort("totalQty")}
                  className="px-3 py-2.5 w-24 min-w-[85px] text-center whitespace-nowrap cursor-pointer hover:bg-slate-200/80 transition-colors"
                  title="Click to sort by Total Qty"
                >
                  <div className="inline-flex items-center gap-1">
                    <span>TOTAL QTY</span>
                    {sortColumn === "totalQty" ? (
                      sortDirection === "asc" ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleHeaderSort("cutQty")}
                  className="px-3 py-2.5 w-32 min-w-[110px] text-center whitespace-nowrap bg-emerald-50/80 text-emerald-900 border-x border-emerald-200 cursor-pointer hover:bg-emerald-100/80 transition-colors"
                  title="Click to sort by Glass Cut quantity"
                >
                  <div className="inline-flex items-center gap-1">
                    <span>GLASS CUT</span>
                    {sortColumn === "cutQty" ? (
                      sortDirection === "asc" ? <ArrowUp className="w-3 h-3 text-emerald-800" /> : <ArrowDown className="w-3 h-3 text-emerald-800" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-emerald-500" />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleHeaderSort("remainingQty")}
                  className="px-3 py-2.5 w-36 min-w-[130px] text-center whitespace-nowrap bg-amber-50/80 text-amber-900 border-r border-amber-200 cursor-pointer hover:bg-amber-100/80 transition-colors"
                  title="Click to sort by Remaining quantity"
                >
                  <div className="inline-flex items-center gap-1">
                    <span>REMAINING</span>
                    {sortColumn === "remainingQty" ? (
                      sortDirection === "asc" ? <ArrowUp className="w-3 h-3 text-amber-800" /> : <ArrowDown className="w-3 h-3 text-amber-800" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-amber-500" />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleHeaderSort("sqm")}
                  className="px-3 py-2.5 w-24 min-w-[85px] text-right whitespace-nowrap cursor-pointer hover:bg-slate-200/80 transition-colors"
                  title="Click to sort by Area SQM"
                >
                  <div className="inline-flex items-center justify-end gap-1 w-full">
                    <span>SQM</span>
                    {sortColumn === "sqm" ? (
                      sortDirection === "asc" ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    )}
                  </div>
                </th>
                <th className="px-3 py-2.5 min-w-[200px] whitespace-nowrap">1+1 PAIRING / BUFFER STATUS</th>
                <th className="px-3 py-2.5 text-right w-32 min-w-[120px] whitespace-nowrap">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800 font-sans">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center py-12 text-slate-400 whitespace-nowrap">
                    No position records found matching the current PI or filters.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, idx) => {
                  const isExpanded = expandedRowIds.includes(row.id);
                  const isFullyCut = row.remainingQty === 0;
                  const isPartiallyCut = row.cutQty > 0 && row.remainingQty > 0;
                  const isNotCut = row.cutQty === 0;

                  return (
                    <React.Fragment key={row.id}>
                      <tr
                        className={`hover:bg-indigo-50/40 transition-colors ${
                          isExpanded ? "bg-indigo-50/30" : ""
                        }`}
                      >
                        {/* SL NO. with Expand Chevron Toggle */}
                        <td className="px-3 py-2.5 font-mono font-bold text-slate-500 text-center text-xs align-middle whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => toggleExpandRow(row.id)}
                              className={`p-1 rounded-md transition-all cursor-pointer ${
                                isExpanded
                                  ? "bg-indigo-100 text-indigo-700 shadow-2xs"
                                  : "text-slate-400 hover:text-indigo-700 hover:bg-slate-200/80"
                              }`}
                              title={
                                isExpanded
                                  ? "Collapse individual pieces"
                                  : `Expand and view all ${row.totalQty} individual glass pieces`
                              }
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <span>{idx + 1}</span>
                          </div>
                        </td>

                        {/* PI # Pill Badge */}
                        <td className="px-3 py-2.5 text-center align-middle whitespace-nowrap">
                          <span className="inline-flex items-center justify-center px-3 py-1 rounded-full font-mono font-black text-xs bg-purple-50 text-purple-700 border border-purple-200 shadow-2xs whitespace-nowrap">
                            {formatBatchNumber(row.piNumber)}
                          </span>
                        </td>

                        {/* POS NO. Pill Badge */}
                        <td className="px-3 py-2.5 text-center align-middle whitespace-nowrap">
                          <span className="inline-flex items-center justify-center px-3 py-1 rounded-xl font-mono font-black text-xs bg-slate-100 text-slate-900 border border-slate-300 shadow-2xs whitespace-nowrap min-w-[40px]">
                            {row.posNo}
                          </span>
                        </td>

                        {/* FINISH / TYPE */}
                        <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                          {row.finish === "Colour" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-black bg-purple-100 text-purple-800 border border-purple-200 shadow-2xs whitespace-nowrap">
                              Colour
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-black bg-cyan-100 text-cyan-800 border border-cyan-200 shadow-2xs whitespace-nowrap">
                              Clear
                            </span>
                          )}
                        </td>

                        {/* WIDTH (MM) Pill */}
                        <td className="px-3 py-2.5 text-center align-middle whitespace-nowrap">
                          <span className="inline-flex items-center justify-center px-3 py-1 rounded-xl font-mono font-black text-xs bg-white text-slate-900 border border-slate-300 shadow-2xs whitespace-nowrap min-w-[65px]">
                            {row.width}
                          </span>
                        </td>

                        {/* HEIGHT (MM) Pill */}
                        <td className="px-3 py-2.5 text-center align-middle whitespace-nowrap">
                          <span className="inline-flex items-center justify-center px-3 py-1 rounded-xl font-mono font-black text-xs bg-white text-slate-900 border border-slate-300 shadow-2xs whitespace-nowrap min-w-[65px]">
                            {row.height}
                          </span>
                        </td>

                        {/* TOTAL ORDERED QTY - Clickable to Expand All Pieces */}
                        <td className="px-3 py-2.5 text-center align-middle whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => toggleExpandRow(row.id)}
                            title={`Click to view all ${row.totalQty} individual glass piece barcodes & status`}
                            className={`inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-xl font-mono font-black text-xs border shadow-2xs whitespace-nowrap cursor-pointer transition-all hover:scale-105 active:scale-95 ${
                              isExpanded
                                ? "bg-indigo-600 text-white border-indigo-700 ring-2 ring-indigo-300 shadow-sm"
                                : "bg-slate-100 text-slate-900 border-slate-300 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300"
                            }`}
                          >
                            <span>{row.totalQty} pcs</span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5 text-white shrink-0" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            )}
                          </button>
                        </td>

                        {/* GLASS CUT COLUMN */}
                        <td className="px-3 py-2.5 text-center align-middle bg-emerald-50/40 border-x border-emerald-100 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => toggleExpandRow(row.id)}
                            title="Click to view piece cutting status breakdown"
                            className={`inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-xl font-mono font-black text-xs border shadow-2xs whitespace-nowrap cursor-pointer transition-transform hover:scale-105 ${
                              isFullyCut
                                ? "bg-emerald-600 text-white border-emerald-700 ring-2 ring-emerald-300 shadow-xs"
                                : isPartiallyCut
                                ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                : "bg-slate-100 text-slate-400 border-slate-200"
                            }`}
                          >
                            <Check className={`w-3.5 h-3.5 shrink-0 ${isFullyCut ? "text-white" : isPartiallyCut ? "text-emerald-700" : "text-slate-400"}`} />
                            <span>{row.cutQty} Cut</span>
                          </button>
                        </td>

                        {/* REMAINING IN CUTTING COLUMN */}
                        <td className="px-3 py-2.5 text-center align-middle bg-amber-50/40 border-r border-amber-100 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => toggleExpandRow(row.id)}
                            title="Click to view remaining pieces in cutting"
                            className={`inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-xl font-mono font-black text-xs border shadow-2xs whitespace-nowrap cursor-pointer transition-transform hover:scale-105 ${
                              row.remainingQty > 0
                                ? "bg-amber-100 text-amber-900 border-amber-300"
                                : "bg-emerald-50 text-emerald-700 border-emerald-200"
                            }`}
                          >
                            {row.remainingQty > 0 ? (
                              <>
                                <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                <span>{row.remainingQty} Remaining</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span>0 Left (Done)</span>
                              </>
                            )}
                          </button>
                        </td>

                        {/* SQM */}
                        <td className="px-3 py-2.5 text-right font-mono font-black text-emerald-700 whitespace-nowrap text-xs align-middle">
                          {row.totalSqm.toFixed(2)} m²
                        </td>

                        {/* 1+1 PAIRING / BUFFER STATUS */}
                        <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                          <div className="flex items-center whitespace-nowrap">
                            {row.finishedQty > 0 || (row.matchingPartnerRow && row.matchingPartnerRow.finishedQty > 0 && row.remainingQty === 0 && row.inBufferQty === 0) ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-600 text-white border border-emerald-700 shadow-xs whitespace-nowrap">
                                <CheckCircle className="w-3.5 h-3.5 text-white shrink-0" />
                                <span>✓ {row.finishedQty || row.matchingPartnerRow?.finishedQty || row.totalQty} of {row.totalQty} Dispatched to Finished</span>
                              </span>
                            ) : row.readyPairsCount > 0 ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-indigo-100 text-indigo-900 border border-indigo-300 shadow-2xs whitespace-nowrap">
                                <Link2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                <span>✨ {row.readyPairsCount} Pair(s) Ready for Assembly</span>
                              </span>
                            ) : row.inBufferQty > 0 ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-purple-100 text-purple-950 border border-purple-300 shadow-2xs whitespace-nowrap">
                                <Layers className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                                <span>📦 Staged in Buffer ({row.inBufferQty} pcs) • Waiting for {row.waitingFinish || "Partner Lite"}</span>
                              </span>
                            ) : row.rawItems.some((i: any) => i.currentStage === "DGU") ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-teal-100 text-teal-900 border border-teal-300 shadow-2xs whitespace-nowrap">
                                <Layers className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                                <span>⚡ Assembling in DGU Workstation</span>
                              </span>
                            ) : row.rawItems.some((i: any) => i.currentStage === "Lamination") ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-indigo-100 text-indigo-900 border border-indigo-300 shadow-2xs whitespace-nowrap">
                                <Layers className="w-3.5 h-3.5 text-indigo-700 shrink-0" />
                                <span>🔥 Processing in Lamination</span>
                              </span>
                            ) : row.remainingQty > 0 && row.matchingPartnerRow && (row.matchingPartnerRow.inBufferQty > 0 || row.matchingPartnerRow.cutQty > 0) ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-amber-100 text-amber-950 border border-amber-300 shadow-2xs whitespace-nowrap">
                                <Clock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                                <span>
                                  ⏳ Partner Lite has {row.matchingPartnerRow.inBufferQty || row.matchingPartnerRow.cutQty} Cut in Buffer • Cut {row.finish || "this lite"} to Pair
                                </span>
                              </span>
                            ) : isFullyCut ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 whitespace-nowrap">
                                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span>Advanced to Pipeline</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200 whitespace-nowrap">
                                <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span>Waiting on Cutting Table</span>
                              </span>
                            )}
                          </div>
                        </td>

                        {/* ACTIONS */}
                        <td className="px-3 py-2.5 text-right align-middle whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                            {(row.finishedQty > 0 || (row.matchingPartnerRow && row.matchingPartnerRow.finishedQty > 0 && row.remainingQty === 0)) && row.inBufferQty === 0 ? (
                              <span className="text-[10px] font-black text-white bg-emerald-600 border border-emerald-700 px-2.5 py-1 rounded-lg whitespace-nowrap inline-flex items-center gap-1 shadow-2xs">
                                <CheckCircle className="w-3 h-3 text-white" /> Finished ({row.finishedQty || row.matchingPartnerRow?.finishedQty || row.totalQty}/{row.totalQty})
                              </span>
                            ) : row.inBufferQty > 0 ? (
                              row.readyPairsCount > 0 ? (
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    row.glassCategory === "DLGU"
                                      ? handlePairDlguDirect(row.posNo, row.piNumber)
                                      : row.glassCategory === "DGU"
                                      ? handlePairDguDirect(row.posNo, row.piNumber)
                                      : handlePairLaminationDirect(row.posNo, row.piNumber)
                                  }
                                  disabled={loading}
                                  className={`h-7 px-3 text-[11px] font-black text-white rounded-lg shadow-2xs gap-1 whitespace-nowrap ${
                                    row.glassCategory === "DLGU"
                                      ? "bg-teal-600 hover:bg-teal-700"
                                      : row.glassCategory === "DGU"
                                      ? "bg-teal-600 hover:bg-teal-700"
                                      : "bg-indigo-600 hover:bg-indigo-700"
                                  }`}
                                  title={`Pair matching lites and advance to ${row.glassCategory === "DLGU" || row.glassCategory === "DGU" ? "DGU Workstation" : "Lamination"}`}
                                >
                                  <Zap className="w-3 h-3" /> Pair & Advance {row.glassCategory === "DLGU" ? "DLGU" : row.glassCategory === "DGU" ? "DGU" : "Lam"}
                                </Button>
                              ) : (
                                <span className="text-[10px] font-black text-purple-900 bg-purple-50 border border-purple-200 px-2.5 py-1 rounded-lg whitespace-nowrap inline-flex items-center gap-1">
                                  <Layers className="w-3 h-3 text-purple-600" /> In Buffer ({row.inBufferQty})
                                </span>
                              )
                            ) : row.rawItems.some((i: any) => i.currentStage === "DGU") ? (
                              <span className="text-[10px] font-black text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-lg whitespace-nowrap inline-flex items-center gap-1">
                                <Layers className="w-3 h-3 text-teal-600" /> In DGU
                              </span>
                            ) : row.rawItems.some((i: any) => i.currentStage === "Lamination") ? (
                              <span className="text-[10px] font-black text-indigo-800 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg whitespace-nowrap inline-flex items-center gap-1">
                                <Layers className="w-3 h-3 text-indigo-600" /> In Lamination
                              </span>
                            ) : row.remainingQty > 0 && row.matchingPartnerRow && (row.matchingPartnerRow.inBufferQty > 0 || row.matchingPartnerRow.cutQty > 0) ? (
                              <span className="text-[10px] font-black text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg whitespace-nowrap inline-flex items-center gap-1">
                                <Clock className="w-3 h-3 text-amber-600" /> Cut Pending
                              </span>
                            ) : isFullyCut ? (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg whitespace-nowrap">
                                Cut & Passed
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg whitespace-nowrap">
                                In Cutting Queue
                              </span>
                            )}

                            {row.rawItems[0] && (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onPrintSticker(row.rawItems[0]);
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
                                    onReject(row.rawItems[0]);
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
                                    onRework(row.rawItems[0]);
                                  }}
                                  className="w-7 h-7 rounded-full border border-amber-300 bg-white text-amber-600 hover:bg-amber-50 hover:border-amber-400 flex items-center justify-center transition-all shadow-2xs shrink-0 cursor-pointer"
                                  title="Send Item to Rework"
                                >
                                  <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* ── INLINE EXPANDED ROW: ALL INDIVIDUAL GLASS PIECES DRAWER ── */}
                      {isExpanded && (
                        <tr className="bg-indigo-50/25">
                          <td colSpan={12} className="p-0 border-y-2 border-indigo-200">
                            <div className="bg-slate-50/50 p-3">
                              {/* Individual Pieces Sub-Table */}
                              <div className="rounded-xl border-2 border-slate-200/90 bg-white overflow-hidden shadow-2xs">
                                <table className="w-full text-left text-xs border-collapse">
                                  <thead className="bg-slate-100 text-slate-700 uppercase border-b-2 border-slate-200 text-[10px] font-black">
                                    <tr>
                                      <th className="px-3 py-2 w-12 text-center whitespace-nowrap">SL NO.</th>
                                      <th className="px-3 py-2 w-20 text-center whitespace-nowrap">PI</th>
                                      <th className="px-3 py-2 w-20 text-center whitespace-nowrap">POS NO.</th>
                                      <th className="px-3 py-2 w-28 whitespace-nowrap">FINISH / TYPE</th>
                                      <th className="px-3 py-2 w-24 text-center whitespace-nowrap">WIDTH (MM)</th>
                                      <th className="px-3 py-2 w-24 text-center whitespace-nowrap">HEIGHT (MM)</th>
                                      <th className="px-3 py-2 w-16 text-center whitespace-nowrap">QTY</th>
                                      <th className="px-3 py-2 w-20 text-right whitespace-nowrap">SQM</th>
                                      <th className="px-3 py-2 min-w-[140px] whitespace-nowrap">GLASS CODE</th>
                                      <th className="px-3 py-2 min-w-[220px] max-w-[320px] whitespace-nowrap">GLASS TYPE / SPEC</th>
                                      <th className="px-3 py-2 w-16 text-center whitespace-nowrap">OB</th>
                                      <th className="px-3 py-2 w-16 text-center whitespace-nowrap">SFO</th>
                                      <th className="px-3 py-2 w-16 text-center whitespace-nowrap">BATCH</th>
                                      <th className="px-3 py-2 min-w-[180px] whitespace-nowrap">BARCODE</th>
                                      <th className="px-3 py-2 text-right min-w-[120px] whitespace-nowrap">ACTIONS</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 font-sans">
                                    {row.rawItems.length === 0 ? (
                                      <tr>
                                        <td colSpan={15} className="text-center py-4 text-slate-400">
                                          No individual piece records found for this position.
                                        </td>
                                      </tr>
                                    ) : (
                                      [...row.rawItems]
                                        .sort((a, b) => {
                                          const aCut = a.currentStage?.toLowerCase() !== "cutting" && a.status !== "Rejected" ? 1 : 0;
                                          const bCut = b.currentStage?.toLowerCase() !== "cutting" && b.status !== "Rejected" ? 1 : 0;
                                          return bCut - aCut;
                                        })
                                        .map((piece, pIdx) => {
                                        const isFinished = piece.currentStage?.toLowerCase() === "finished" || piece.status === "Completed";
                                        const isCut = piece.currentStage?.toLowerCase() !== "cutting" && piece.status !== "Rejected";
                                        const isBuffer = piece.currentStage?.toLowerCase() === "pairing";
                                        const pieceSqm = parseFloat(
                                          (
                                            ((piece.width || row.width) * (piece.height || row.height)) /
                                            1000000
                                          ).toFixed(2)
                                        );

                                        return (
                                          <tr
                                            key={piece.id || `${row.id}_piece_${pIdx}`}
                                            className={`transition-colors ${
                                              isFinished
                                                ? "bg-emerald-100/60 border-l-4 border-l-emerald-600 hover:bg-emerald-100"
                                                : isCut
                                                ? "bg-emerald-50/80 border-l-4 border-l-emerald-500 hover:bg-emerald-100/70"
                                                : "bg-white hover:bg-amber-50/40 border-l-4 border-l-amber-300"
                                            }`}
                                          >
                                            {/* SL NO. */}
                                            <td className="px-3 py-2 text-center align-middle whitespace-nowrap">
                                              {isFinished ? (
                                                <span className="inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded-md font-mono font-black text-xs bg-emerald-600 text-white border border-emerald-700 shadow-2xs">
                                                  <CheckCircle className="w-3 h-3 text-white shrink-0" />
                                                  <span>{pIdx + 1}</span>
                                                </span>
                                              ) : isCut ? (
                                                <span className="inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded-md font-mono font-black text-xs bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                                                  <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                                                  <span>{pIdx + 1}</span>
                                                </span>
                                              ) : (
                                                <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md font-mono font-bold text-slate-600 text-xs bg-slate-100 border border-slate-200">
                                                  {pIdx + 1}
                                                </span>
                                              )}
                                            </td>

                                            {/* PI */}
                                            <td className="px-3 py-2 text-center align-middle whitespace-nowrap">
                                              <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full font-mono font-black text-[11px] bg-purple-50 text-purple-700 border border-purple-200">
                                                {formatBatchNumber(piece.orderNo || piece.piNumber || row.piNumber)}
                                              </span>
                                            </td>

                                            {/* POS NO. */}
                                            <td className="px-3 py-2 text-center align-middle whitespace-nowrap">
                                              <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg font-mono font-black text-xs bg-slate-100 text-slate-900 border border-slate-300 min-w-[36px]">
                                                {piece.posNo || row.posNo}
                                              </span>
                                            </td>

                                            {/* FINISH / TYPE */}
                                            <td className="px-3 py-2 align-middle whitespace-nowrap">
                                              {row.finish === "Colour" ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-black bg-purple-100 text-purple-800 border border-purple-200">
                                                  Colour
                                                </span>
                                              ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-black bg-cyan-100 text-cyan-800 border border-cyan-200">
                                                  Clear
                                                </span>
                                              )}
                                            </td>

                                            {/* WIDTH (MM) */}
                                            <td className="px-3 py-2 text-center align-middle whitespace-nowrap">
                                              <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg font-mono font-black text-xs bg-white text-slate-900 border border-slate-300 min-w-[50px]">
                                                {piece.width || row.width}
                                              </span>
                                            </td>

                                            {/* HEIGHT (MM) */}
                                            <td className="px-3 py-2 text-center align-middle whitespace-nowrap">
                                              <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg font-mono font-black text-xs bg-white text-slate-900 border border-slate-300 min-w-[50px]">
                                                {piece.height || row.height}
                                              </span>
                                            </td>

                                            {/* QTY */}
                                            <td className="px-3 py-2 text-center align-middle whitespace-nowrap">
                                              {isFinished ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg font-mono font-black text-xs bg-emerald-600 text-white border border-emerald-700 shadow-2xs">
                                                  <CheckCircle className="w-3 h-3 text-white shrink-0" />
                                                  <span>1 pc (Finished)</span>
                                                </span>
                                              ) : isCut ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg font-mono font-black text-xs bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-2xs">
                                                  <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                                                  <span>1 pc (Cut)</span>
                                                </span>
                                              ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg font-mono font-bold text-xs bg-amber-50 text-amber-900 border border-amber-200">
                                                  <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                                                  <span>1 pc (Wait)</span>
                                                </span>
                                              )}
                                            </td>

                                            {/* SQM */}
                                            <td className="px-3 py-2 text-right font-mono font-black text-emerald-700 whitespace-nowrap text-xs align-middle">
                                              {(piece.sqm ? piece.sqm.toFixed(2) : pieceSqm.toFixed(2))} m²
                                            </td>

                                            {/* GLASS CODE */}
                                            <td className="px-3 py-2 font-bold font-mono text-slate-900 text-xs align-middle whitespace-nowrap">
                                              <span className="bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 inline-block">
                                                {piece.glassCode || row.glassCode}
                                              </span>
                                            </td>

                                            {/* GLASS TYPE / SPEC */}
                                            <td className="px-3 py-2 text-slate-800 font-medium text-xs align-middle max-w-[280px] whitespace-nowrap">
                                              <div className="truncate font-bold" title={piece.glassType || row.glassType}>
                                                {piece.glassType || row.glassType}
                                              </div>
                                            </td>

                                            {/* OB */}
                                            <td className="px-3 py-2 text-center font-mono font-bold text-slate-700 text-xs align-middle whitespace-nowrap">
                                              {piece.obNo || row.obNo}
                                            </td>

                                            {/* SFO */}
                                            <td className="px-3 py-2 text-center font-mono font-bold text-purple-700 text-xs align-middle whitespace-nowrap">
                                              {piece.sfoNo || row.sfoNo}
                                            </td>

                                            {/* BATCH */}
                                            <td className="px-3 py-2 text-center font-mono font-bold text-purple-700 text-xs align-middle whitespace-nowrap">
                                              {piece.batchNo || row.batchNo}
                                            </td>

                                            {/* BARCODE */}
                                            <td className="px-3 py-2 align-middle font-mono whitespace-nowrap">
                                              <div className="flex items-center gap-1.5">
                                                <BarcodeIcon className={`w-4 h-4 shrink-0 ${isFinished ? "text-emerald-600" : isCut ? "text-emerald-600" : "text-slate-400"}`} />
                                                <span
                                                  className={`font-black px-2 py-0.5 rounded-md border text-xs ${
                                                    isFinished
                                                      ? "bg-emerald-600 text-white border-emerald-700"
                                                      : isCut
                                                      ? "bg-emerald-100 text-emerald-950 border-emerald-300"
                                                      : "bg-slate-100 text-slate-900 border-slate-300"
                                                  }`}
                                                >
                                                  {piece.barcode || piece.serialNumber || `SN-${row.posNo}-${pIdx + 1}`}
                                                </span>
                                                <button
                                                  type="button"
                                                  onClick={() => handleCopyBarcode(piece.barcode || piece.serialNumber)}
                                                  className="text-slate-400 hover:text-indigo-600 p-1 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                                                  title="Copy barcode to clipboard"
                                                >
                                                  <Copy className="w-3.5 h-3.5" />
                                                </button>
                                              </div>
                                            </td>

                                            {/* ACTIONS */}
                                            <td className="px-3 py-2 text-right align-middle whitespace-nowrap">
                                              <div className="flex items-center justify-end gap-1.5">
                                                {isFinished ? (
                                                  <span className="text-[10px] font-black text-white bg-emerald-600 border border-emerald-700 px-2 py-0.5 rounded-md inline-flex items-center gap-1 whitespace-nowrap shadow-2xs">
                                                    <CheckCircle className="w-3 h-3 text-white" /> Finished & Dispatched
                                                  </span>
                                                ) : isCut ? (
                                                  <span className="text-[10px] font-black text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-md inline-flex items-center gap-1 whitespace-nowrap">
                                                    <Check className="w-3 h-3 text-emerald-600" /> Cut (In Buffer)
                                                  </span>
                                                ) : (
                                                  <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md inline-flex items-center gap-1 whitespace-nowrap">
                                                    <Clock className="w-3 h-3 text-amber-600" /> Waiting in Cutting
                                                  </span>
                                                )}

                                                {isBuffer && (row.finish === "Colour") && (
                                                  <Button
                                                    size="sm"
                                                    onClick={() => completeStage([piece.serialNumber], 1, false)}
                                                    disabled={loading}
                                                    className="h-6 px-2 text-[10px] font-black bg-indigo-600 hover:bg-indigo-700 text-white rounded-md shadow-2xs gap-1"
                                                    title="Advance this single piece to DGU"
                                                  >
                                                    <Zap className="w-2.5 h-2.5" /> Send to DGU
                                                  </Button>
                                                )}
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    onPrintSticker(piece);
                                                  }}
                                                  className="w-7 h-7 rounded-full border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400 flex items-center justify-center transition-all shadow-2xs shrink-0 cursor-pointer"
                                                  title="Print Piece Barcode / QR Sticker"
                                                >
                                                  <Tag className="w-3.5 h-3.5 text-slate-700" />
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    onReject(piece);
                                                  }}
                                                  className="w-7 h-7 rounded-full border border-red-300 bg-white text-red-600 hover:bg-red-50 hover:border-red-400 flex items-center justify-center transition-all shadow-2xs shrink-0 cursor-pointer"
                                                  title="Reject Piece / Report Defect"
                                                >
                                                  <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    onRework(piece);
                                                  }}
                                                  className="w-7 h-7 rounded-full border border-amber-300 bg-white text-amber-600 hover:bg-amber-50 hover:border-amber-400 flex items-center justify-center transition-all shadow-2xs shrink-0 cursor-pointer"
                                                  title="Send Piece to Rework"
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
        </div>

        {/* Table Bottom Footer Summary */}
        <div className="p-3 bg-slate-50 text-xs text-slate-600 font-semibold border-t border-slate-200 flex justify-between items-center flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span>Showing {filteredRows.reduce((a, b) => a + b.totalQty, 0)} pieces</span>
            <span className="text-slate-300">•</span>
            <span>
              {activeViewMetrics.cutPieces} of {activeViewMetrics.totalPieces} Pieces Cut (
              {activeViewMetrics.cutPercent}% complete)
            </span>
          </div>
          <div className="flex items-center gap-3 font-mono">
            <span className="text-emerald-700 font-bold">Cut Area: {activeViewMetrics.cutSqm.toFixed(2)} m²</span>
            <span className="text-slate-300">•</span>
            <span className="text-amber-700 font-bold">Remaining Area: {activeViewMetrics.remainingSqm.toFixed(2)} m²</span>
          </div>
        </div>
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
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 shrink-0"
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
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs gap-1.5 shadow-xs"
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
