import React, { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FileText,
  Layers,
  Boxes,
  Calendar,
  Users,
  Building2,
  Upload,
  Search,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  X,
  Filter,
  Trash2,
  Table as TableIcon,
  LayoutGrid,
  Eye,
  FileSpreadsheet,
  Check
} from "lucide-react";
import { PIMaster, GlassItem } from "@shared/api";
import { formatBatchNumber, formatPlatformDate } from "@/lib/utils";
import { toast } from "sonner";

export interface UploadedPdfItem {
  fileName: string;
  batches: PIMaster[];
  totalPieces: number;
  completedPieces: number;
  totalSqm: number;
  customers: string[];
  projects: string[];
  uploadedAt: string;
  finish: "Clear" | "Colour" | "Mixed";
}

export interface ConsolidatedPiRow {
  piNo: string;
  customerName: string;
  projectName: string;
  colorOrClear: "Clear" | "Colour";
  glassTypes: string[];
  totalQty: number;
  totalSqm: number;
  batchNo: string;
  fileName: string;
  matchedBatchId?: string;
  matchedPi?: PIMaster;
  sizes: Array<{
    posNo: string;
    stickerNo?: string;
    serialNumber?: string;
    width: number;
    height: number;
    glassType: string;
    qty: number;
    sqm: number;
    currentStage?: string;
    status?: string;
  }>;
}

interface UploadedPdfsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pdfSummaries: UploadedPdfItem[];
  pis?: PIMaster[];
  items?: GlassItem[];
  onSelectPdfFilter?: (fileName: string) => void;
  onOpenUploadModal?: () => void;
  onDeletePI?: (piId: string) => void;
  onViewPIDocument?: (pi: PIMaster) => void;
  userRole?: string;
}

export const UploadedPdfsModal: React.FC<UploadedPdfsModalProps> = ({
  open,
  onOpenChange,
  pdfSummaries,
  pis = [],
  items = [],
  onSelectPdfFilter,
  onOpenUploadModal,
  onDeletePI,
  onViewPIDocument,
  userRole,
}) => {
  // View mode: 'table' (exact match to user screenshot) or 'cards' (PDF summary cards)
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPdfFilter, setSelectedPdfFilter] = useState<string>("ALL");
  const [finishFilter, setFinishFilter] = useState<"ALL" | "CLEAR" | "COLOUR">("ALL");

  // Pagination for the PIs & Batches Table
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);

  // Expanded rows for item/size breakdown
  const [expandedPiKeys, setExpandedPiKeys] = useState<Record<string, boolean>>({});

  // Expanded PDF cards in cards view
  const [expandedPdfCards, setExpandedPdfCards] = useState<Record<string, boolean>>({});

  const togglePiExpand = (key: string) => {
    setExpandedPiKeys((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const togglePdfCardExpand = (fileName: string) => {
    setExpandedPdfCards((prev) => ({
      ...prev,
      [fileName]: !prev[fileName],
    }));
  };

  // Grand totals across all PDF summaries
  const grandTotalBatches = pdfSummaries.reduce((acc, p) => acc + p.batches.length, 0);
  const grandTotalPieces = pdfSummaries.reduce((acc, p) => acc + p.totalPieces, 0);
  const grandTotalSqm = pdfSummaries.reduce((acc, p) => acc + p.totalSqm, 0);

  // =========================================================================
  // BUILD CONSOLIDATED PI ROWS MATCHING THE QUICK CHECK TABLE
  // =========================================================================
  const consolidatedPiRows: ConsolidatedPiRow[] = useMemo(() => {
    // If we have items in memory, group items by PI
    if (items && items.length > 0) {
      // Map to correlate each item with its PDF fileName & PIMaster
      const itemToPiMap = new Map<string, PIMaster>();
      pis.forEach((pi) => {
        const cleanId = (pi.id || "").replace(/^STK-/i, "");
        const cleanPiNo = (pi.piNumber || "").replace(/^STK-/i, "");
        items.forEach((item) => {
          if (
            item.piId === pi.id ||
            item.piNumber === pi.piNumber ||
            item.piId === cleanId ||
            item.piNumber === cleanPiNo ||
            item.batchNo === cleanPiNo ||
            item.batchNo === pi.piNumber ||
            (item.sfoNo && (item.sfoNo === pi.piNumber || item.sfoNo === cleanPiNo))
          ) {
            itemToPiMap.set(item.id, pi);
          }
        });
      });

      // Group items by PI number (orderNo or piNumber) + batchNo
      const piGroupMap = new Map<string, {
        piNo: string;
        customerName: string;
        projectName: string;
        colorOrClear: "Clear" | "Colour";
        glassTypes: Set<string>;
        totalQty: number;
        totalSqm: number;
        batchNo: string;
        fileName: string;
        matchedBatchId?: string;
        matchedPi?: PIMaster;
        // Map of unique size positions: posNo -> size item
        sizeMap: Map<string, {
          posNo: string;
          stickerNo?: string;
          serialNumber?: string;
          width: number;
          height: number;
          glassType: string;
          qty: number;
          sqm: number;
          currentStage?: string;
          status?: string;
        }>;
      }>();

      items.forEach((item) => {
        const cleanPi = (item.orderNo || item.piNumber || item.piId || "PI-1").trim();
        const matchedPi = itemToPiMap.get(item.id) || pis.find(
          (p) => p.id === item.piId || p.piNumber === item.piNumber || p.batchNo === item.batchNo
        );
        const rawFileName = matchedPi?.fileName || (matchedPi?.jobOrderNumber ? `${matchedPi.jobOrderNumber}.pdf` : `${matchedPi?.piNumber || "Upload"}.pdf`);
        const batchNo = item.batchNo || matchedPi?.batchNo || matchedPi?.piNumber || "1";

        // Group key: combination of PDF/Batch and clean PI number
        const groupKey = `${rawFileName.trim().toLowerCase()}__${batchNo}__${cleanPi}`;

        if (!piGroupMap.has(groupKey)) {
          piGroupMap.set(groupKey, {
            piNo: cleanPi,
            customerName: item.customerName || matchedPi?.customerName || "Customer",
            projectName: item.projectName || matchedPi?.projectName || "Project",
            colorOrClear: (item.colorOrClear === "Colour" || item.finish === "Colour" || matchedPi?.colorOrClear === "Colour") ? "Colour" : "Clear",
            glassTypes: new Set<string>(),
            totalQty: 0,
            totalSqm: 0,
            batchNo: batchNo,
            fileName: rawFileName,
            matchedBatchId: matchedPi?.id,
            matchedPi: matchedPi,
            sizeMap: new Map(),
          });
        }

        const group = piGroupMap.get(groupKey)!;
        const itemQty = item.qty || 1;
        const itemSqm = item.sqm || 0;

        group.totalQty += itemQty;
        group.totalSqm += itemSqm;

        if (item.glassType) {
          group.glassTypes.add(item.glassType);
        }

        // Sub-group by position number or dimension
        const sizeKey = item.posNo ? `POS-${item.posNo}` : `${item.width}x${item.height}x${item.glassType}`;
        const stickerMatch = item.remarks?.match(/Sticker #(\d+)/);
        const stickerNo = stickerMatch ? stickerMatch[1] : (item.srNo ? String(item.srNo) : item.serialNumber);

        if (!group.sizeMap.has(sizeKey)) {
          group.sizeMap.set(sizeKey, {
            posNo: item.posNo || String(group.sizeMap.size + 1),
            stickerNo: stickerNo,
            serialNumber: item.serialNumber,
            width: item.width,
            height: item.height,
            glassType: item.glassType || "Glass Spec",
            qty: itemQty,
            sqm: itemSqm,
            currentStage: item.currentStage,
            status: item.status,
          });
        } else {
          const existingSize = group.sizeMap.get(sizeKey)!;
          existingSize.qty += itemQty;
          existingSize.sqm += itemSqm;
        }
      });

      return Array.from(piGroupMap.values()).map((g) => ({
        piNo: g.piNo,
        customerName: g.customerName,
        projectName: g.projectName,
        colorOrClear: g.colorOrClear,
        glassTypes: Array.from(g.glassTypes),
        totalQty: g.totalQty,
        totalSqm: parseFloat(g.totalSqm.toFixed(2)),
        batchNo: g.batchNo,
        fileName: g.fileName,
        matchedBatchId: g.matchedBatchId,
        matchedPi: g.matchedPi,
        sizes: Array.from(g.sizeMap.values()),
      }));
    }

    // Fallback: If items are empty, generate from PIMaster list
    return pis.map((pi) => {
      const rawFileName = pi.fileName || (pi.jobOrderNumber ? `${pi.jobOrderNumber}.pdf` : `${pi.piNumber}.pdf`);
      return {
        piNo: pi.proformaInvNo || pi.piNumber || "PI-1",
        customerName: pi.customerName || "Customer",
        projectName: pi.projectName || "Project",
        colorOrClear: pi.colorOrClear === "Colour" ? "Colour" : "Clear",
        glassTypes: pi.glassDescription ? [pi.glassDescription] : [],
        totalQty: pi.totalQty || pi.itemsCount || 1,
        totalSqm: parseFloat((pi.totalSqm || 0).toFixed(2)),
        batchNo: pi.batchNo || pi.piNumber,
        fileName: rawFileName,
        matchedBatchId: pi.id,
        matchedPi: pi,
        sizes: [],
      };
    });
  }, [items, pis]);

  // =========================================================================
  // FILTERING THE CONSOLIDATED PI ROWS
  // =========================================================================
  const filteredPiRows = useMemo(() => {
    return consolidatedPiRows.filter((row) => {
      // PDF filter
      if (selectedPdfFilter !== "ALL") {
        if (row.fileName.toLowerCase() !== selectedPdfFilter.toLowerCase()) {
          return false;
        }
      }

      // Finish filter
      if (finishFilter === "CLEAR" && row.colorOrClear === "Colour") return false;
      if (finishFilter === "COLOUR" && row.colorOrClear !== "Colour") return false;

      // Search query filter
      if (searchTerm.trim()) {
        const rawQuery = searchTerm.trim().toLowerCase();
        const terms = rawQuery.split(/\s+/).filter(Boolean);

        const matchesRow = terms.every((term) => {
          const cleanTerm = term
            .replace(/^[#]/, "")
            .replace(/^pi[-_ ]?/i, "")
            .replace(/^batch[-_ ]?/i, "");

          const matchesPi =
            row.piNo.toLowerCase().includes(term) ||
            (Boolean(cleanTerm) && row.piNo.toLowerCase().includes(cleanTerm));

          const matchesCustomer = row.customerName.toLowerCase().includes(term);

          const matchesProject = row.projectName.toLowerCase().includes(term);

          const matchesBatch =
            row.batchNo.toLowerCase().includes(term) ||
            (Boolean(cleanTerm) && row.batchNo.toLowerCase().includes(cleanTerm)) ||
            formatBatchNumber(row.batchNo).toLowerCase().includes(term);

          const matchesFinish =
            row.colorOrClear.toLowerCase() === term ||
            (term === "color" && row.colorOrClear.toLowerCase() === "colour") ||
            (term === "colour" && row.colorOrClear.toLowerCase() === "colour") ||
            (term === "clear" && row.colorOrClear.toLowerCase() === "clear");

          const matchesGlassType = row.glassTypes.some((g) => g.toLowerCase().includes(term));

          const matchesSizes = row.sizes.some((s) => {
            const posMatch =
              s.posNo &&
              (s.posNo.toLowerCase().includes(term) ||
                `pos ${s.posNo}`.toLowerCase().includes(term) ||
                `pos#${s.posNo}`.toLowerCase().includes(term));
            const stickerMatch =
              s.stickerNo &&
              (s.stickerNo.toLowerCase().includes(term) ||
                (Boolean(cleanTerm) && s.stickerNo.toLowerCase().includes(cleanTerm)));
            const serialMatch = s.serialNumber && s.serialNumber.toLowerCase().includes(term);
            const sizeGlassMatch = s.glassType && s.glassType.toLowerCase().includes(term);
            const dimMatch =
              `${s.width}x${s.height}`.includes(term) ||
              `${s.width}*${s.height}`.includes(term) ||
              `${s.width} × ${s.height}`.includes(term);
            return Boolean(posMatch || stickerMatch || serialMatch || sizeGlassMatch || dimMatch);
          });

          return (
            matchesPi ||
            matchesCustomer ||
            matchesProject ||
            matchesBatch ||
            matchesFinish ||
            matchesGlassType ||
            matchesSizes
          );
        });

        if (!matchesRow) {
          return false;
        }
      }

      return true;
    });
  }, [consolidatedPiRows, selectedPdfFilter, finishFilter, searchTerm]);

  // Pagination calculations
  const totalPages = pageSize === -1 ? 1 : Math.max(1, Math.ceil(filteredPiRows.length / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);
  const paginatedPiRows = pageSize === -1
    ? filteredPiRows
    : filteredPiRows.slice((validCurrentPage - 1) * pageSize, validCurrentPage * pageSize);

  // Summary counts for filtered view
  const filteredTotalQty = filteredPiRows.reduce((acc, r) => acc + r.totalQty, 0);
  const filteredTotalSqm = filteredPiRows.reduce((acc, r) => acc + r.totalSqm, 0);
  const filteredBatchesCount = useMemo(() => {
    const set = new Set<string>();
    filteredPiRows.forEach((r) => set.add(`${r.fileName}__${r.batchNo}`));
    return set.size;
  }, [filteredPiRows]);

  // Filtered PDF list for card view
  const filteredPdfs = pdfSummaries.filter((p) => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;
    const terms = q.split(/\s+/).filter(Boolean);
    return terms.every((term) => {
      const cleanTerm = term
        .replace(/^[#]/, "")
        .replace(/^pi[-_ ]?/i, "")
        .replace(/^batch[-_ ]?/i, "");
      return (
        p.fileName.toLowerCase().includes(term) ||
        p.customers.some((c) => c.toLowerCase().includes(term)) ||
        p.projects.some((pr) => pr.toLowerCase().includes(term)) ||
        p.batches.some(
          (b) =>
            (b.batchNo && b.batchNo.toLowerCase().includes(term)) ||
            (b.piNumber && b.piNumber.toLowerCase().includes(term)) ||
            (Boolean(cleanTerm) && b.batchNo && b.batchNo.toLowerCase().includes(cleanTerm)) ||
            (Boolean(cleanTerm) && b.piNumber && b.piNumber.toLowerCase().includes(cleanTerm))
        )
      );
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[96vw] max-h-[92vh] flex flex-col p-0 overflow-hidden rounded-2xl shadow-2xl border-slate-200 bg-white">
        {/* MODAL HEADER */}
        <div className="px-6 py-4 bg-gradient-to-r from-rose-50 via-slate-50 to-white border-b border-slate-200 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-rose-600 flex items-center justify-center text-white shadow-md shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <DialogTitle className="text-lg font-black text-slate-900 tracking-tight">
                  Uploaded Sticker PDFs &amp; Batches
                </DialogTitle>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-200">
                  {pdfSummaries.length} {pdfSummaries.length === 1 ? "PDF File" : "PDF Files"}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">
                  {consolidatedPiRows.length} PIs
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                  {grandTotalBatches} Batches
                </span>
              </div>
              <DialogDescription className="text-xs text-slate-500 font-medium mt-0.5">
                Full production order breakdown of all uploaded sticker PDF documents, grouped by PI, Customer, Glass Specification, and Batch.
              </DialogDescription>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View switcher: Table view vs Cards view */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-2xs">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`px-3 py-1.5 text-xs font-black rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === "table"
                    ? "bg-purple-600 text-white shadow-2xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                }`}
                title="View consolidated PIs & Batches table matching Quick Check"
              >
                <TableIcon className="w-3.5 h-3.5" /> PIs &amp; Batches Table
              </button>
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                className={`px-3 py-1.5 text-xs font-black rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === "cards"
                    ? "bg-purple-600 text-white shadow-2xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                }`}
                title="View PDF summary cards"
              >
                <LayoutGrid className="w-3.5 h-3.5" /> PDF Source Files
              </button>
            </div>

            {onOpenUploadModal && (
              <Button
                onClick={() => {
                  onOpenChange(false);
                  onOpenUploadModal();
                }}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-1.5 rounded-xl shadow-xs h-9 px-3.5"
              >
                <Upload className="w-3.5 h-3.5" /> Upload New PDF
              </Button>
            )}
          </div>
        </div>

        {/* SUB-HEADER CONTROLS & FILTER TOOLBAR */}
        <div className="px-6 py-2.5 bg-slate-50/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Left: Summary Metrics */}
          <div className="flex items-center gap-3.5 text-xs font-bold text-slate-600 flex-wrap">
            <div className="flex items-center gap-1">
              <span className="text-slate-400">Showing:</span>
              <span className="font-mono text-purple-700 font-black">{filteredPiRows.length} PIs</span>
            </div>
            <span className="text-slate-300">•</span>
            <div className="flex items-center gap-1">
              <span className="text-slate-400">Total Qty:</span>
              <span className="font-mono text-slate-900 font-black">{filteredTotalQty} pcs</span>
            </div>
            <span className="text-slate-300">•</span>
            <div className="flex items-center gap-1">
              <span className="text-slate-400">Total SQM:</span>
              <span className="font-mono text-emerald-700 font-black">{filteredTotalSqm.toFixed(2)} m²</span>
            </div>
            <span className="text-slate-300">•</span>
            <div className="flex items-center gap-1">
              <span className="text-slate-400">Batches:</span>
              <span className="font-mono text-blue-700 font-black">{filteredBatchesCount}</span>
            </div>
          </div>

          {/* Right: PDF Dropdown filter, Finish Filter & Search */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Filter by PDF file dropdown */}
            <div className="flex items-center gap-1.5 bg-white rounded-lg px-2.5 py-1 border border-slate-200 shadow-2xs">
              <FileText className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <select
                value={selectedPdfFilter}
                onChange={(e) => {
                  setSelectedPdfFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="text-xs font-bold bg-transparent border-0 text-slate-700 focus:outline-hidden cursor-pointer max-w-[190px] truncate"
                title="Filter by uploaded PDF file"
              >
                <option value="ALL">All PDFs ({pdfSummaries.length})</option>
                {pdfSummaries.map((pdf) => (
                  <option key={pdf.fileName} value={pdf.fileName}>
                    {pdf.fileName} ({pdf.batches.length} {pdf.batches.length === 1 ? "Batch" : "Batches"})
                  </option>
                ))}
              </select>
              {selectedPdfFilter !== "ALL" && (
                <button
                  type="button"
                  onClick={() => setSelectedPdfFilter("ALL")}
                  className="text-[10px] text-rose-600 hover:text-rose-800 font-black ml-1 px-1 rounded hover:bg-rose-50 cursor-pointer"
                  title="Clear PDF file filter"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Finish Filter Pills */}
            <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200 shadow-2xs">
              <button
                type="button"
                onClick={() => {
                  setFinishFilter("ALL");
                  setCurrentPage(1);
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer ${
                  finishFilter === "ALL" ? "bg-slate-800 text-white" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => {
                  setFinishFilter("CLEAR");
                  setCurrentPage(1);
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer ${
                  finishFilter === "CLEAR" ? "bg-cyan-600 text-white" : "text-cyan-800 hover:bg-cyan-50"
                }`}
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => {
                  setFinishFilter("COLOUR");
                  setCurrentPage(1);
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer ${
                  finishFilter === "COLOUR" ? "bg-purple-600 text-white" : "text-purple-800 hover:bg-purple-50"
                }`}
              >
                Colour
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-48 sm:w-56">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search PI, customer, batch..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-7 pr-7 text-xs bg-white border-slate-200 rounded-lg h-8"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    setCurrentPage(1);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* MODAL MAIN CONTENT BODY */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50">
          {viewMode === "table" ? (
            /* ========================================================================= */
            /* VIEW MODE A: CONSOLIDATED PIs & BATCHES TABLE (MATCHES SCREENSHOT EXACTLY) */
            /* ========================================================================= */
            <div className="flex flex-col space-y-3">
              <div className="border border-slate-200 rounded-2xl bg-white shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm border-collapse min-w-[850px]">
                    <thead className="bg-slate-100/90 text-slate-700 uppercase border-b-2 border-slate-200 text-[11px] font-black tracking-wider sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-3 w-28 text-center">SL NO.</th>
                        <th className="px-3 py-3 w-28 text-center">PI</th>
                        <th className="px-3 py-3 min-w-[200px]">CUSTOMER / PROJECT</th>
                        <th className="px-3 py-3 min-w-[190px]">FINISH / TYPE</th>
                        <th className="px-3 py-3 w-24 text-center">QTY</th>
                        <th className="px-3 py-3 w-28 text-right">SQM</th>
                        <th className="px-3 py-3 w-28 text-center">BATCH</th>
                        <th className="px-2 py-3 w-24 text-center">ACTION</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800 font-sans">
                      {paginatedPiRows.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center">
                            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                            <h4 className="text-sm font-bold text-slate-700">No matching PIs or batches found</h4>
                            <p className="text-xs text-slate-500 mt-1">
                              {searchTerm || selectedPdfFilter !== "ALL" || finishFilter !== "ALL"
                                ? "Try clearing search filters or changing the PDF selector."
                                : "Upload a sticker PDF to see the consolidated PI breakdown."}
                            </p>
                          </td>
                        </tr>
                      ) : (
                        paginatedPiRows.map((group, groupIdx) => {
                          const pageOffset = (validCurrentPage - 1) * (pageSize === -1 ? 0 : pageSize);
                          const slNo = groupIdx + 1 + pageOffset;
                          const rowKey = `${group.fileName}__${group.batchNo}__${group.piNo}`;
                          const isExpanded = !!expandedPiKeys[rowKey];
                          const sizesCount = group.sizes.length > 0 ? group.sizes.length : 1;

                          return (
                            <React.Fragment key={`${group.fileName}__${group.batchNo}__${group.piNo}__${groupIdx}`}>
                              <tr className="hover:bg-purple-50/40 transition-colors">
                                {/* 1. SL NO. */}
                                <td className="px-3 py-2.5 text-center align-middle">
                                  <div className="flex flex-col items-center gap-0.5">
                                    <span className="font-mono font-black text-slate-800 text-xs sm:text-sm">
                                      #{slNo}
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-purple-100 text-purple-800 border border-purple-200 whitespace-nowrap shadow-2xs">
                                      {sizesCount} {sizesCount === 1 ? "Size" : "Sizes"}
                                    </span>
                                  </div>
                                </td>

                                {/* 2. PI */}
                                <td className="px-2 py-2 text-center align-middle">
                                  <span className="inline-flex items-center justify-center font-mono font-black text-xs sm:text-sm text-purple-700 bg-white border border-slate-300 rounded-xl px-3 py-1.5 min-w-[75px] shadow-2xs">
                                    {group.piNo || "—"}
                                  </span>
                                </td>

                                {/* 3. CUSTOMER / PROJECT */}
                                <td className="px-3 py-2.5 align-middle">
                                  <div className="flex flex-col text-left">
                                    <span
                                      className="text-xs font-bold text-slate-900 truncate max-w-[220px]"
                                      title={group.customerName}
                                    >
                                      {group.customerName || "Customer"}
                                    </span>
                                    {group.projectName && (
                                      <span
                                        className="text-[11px] text-slate-500 font-mono truncate max-w-[220px]"
                                        title={group.projectName}
                                      >
                                        {group.projectName}
                                      </span>
                                    )}
                                  </div>
                                </td>

                                {/* 4. FINISH / TYPE */}
                                <td className="px-3 py-2.5 align-middle">
                                  <div className="flex flex-col gap-1 items-start">
                                    <span
                                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black border uppercase tracking-wider ${
                                        group.colorOrClear === "Colour"
                                          ? "bg-purple-100 text-purple-800 border-purple-200"
                                          : "bg-cyan-100 text-cyan-800 border-cyan-200"
                                      }`}
                                    >
                                      {group.colorOrClear === "Colour" ? "COLOUR" : "CLEAR"}
                                    </span>
                                    <span
                                      className="text-[11px] font-medium text-slate-700 truncate max-w-[210px]"
                                      title={group.glassTypes.join(", ") || "Glass Spec"}
                                    >
                                      {group.glassTypes.join(", ") || "Glass Spec"}
                                    </span>
                                  </div>
                                </td>

                                {/* 5. QTY */}
                                <td className="px-2 py-2 text-center align-middle">
                                  <span className="inline-flex items-center justify-center font-mono font-black text-xs sm:text-sm bg-purple-50 text-purple-900 border border-purple-200 rounded-lg py-1 px-3 shadow-2xs">
                                    {group.totalQty}
                                  </span>
                                </td>

                                {/* 6. SQM */}
                                <td className="px-3 py-2 text-right font-mono font-black text-emerald-700 whitespace-nowrap text-xs sm:text-sm align-middle">
                                  {group.totalSqm.toFixed(2)} m²
                                </td>

                                {/* 7. BATCH */}
                                <td className="px-2 py-2 text-center align-middle">
                                  <span className="inline-flex items-center justify-center font-mono font-black text-xs sm:text-sm text-purple-700 bg-white border border-slate-300 rounded-xl px-3 py-1.5 min-w-[65px] shadow-2xs">
                                    {formatBatchNumber(group.batchNo || group.piNo)}
                                  </span>
                                </td>

                                {/* 8. ACTION */}
                                <td className="px-2 py-2 text-center align-middle">
                                  <div className="flex items-center justify-center gap-1">
                                    {/* Expand/Collapse Chevron with Sizes Count */}
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => togglePiExpand(rowKey)}
                                      className="h-7 px-1.5 text-[11px] font-bold text-purple-700 hover:bg-purple-100 rounded-md gap-0.5 cursor-pointer"
                                      title="Toggle item and sizes breakdown for this PI"
                                    >
                                      {isExpanded ? (
                                        <ChevronUp className="w-3.5 h-3.5" />
                                      ) : (
                                        <ChevronDown className="w-3.5 h-3.5" />
                                      )}
                                      <span>{sizesCount}</span>
                                    </Button>

                                    {/* View PI Document Modal */}
                                    {onViewPIDocument && group.matchedPi && (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                          if (group.matchedPi) onViewPIDocument(group.matchedPi);
                                        }}
                                        className="h-7 w-7 p-0 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 cursor-pointer"
                                        title="View full PI Document"
                                      >
                                        <Eye className="w-3.5 h-3.5" />
                                      </Button>
                                    )}

                                    {/* Delete PI Trash button */}
                                    {onDeletePI && group.matchedBatchId && (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                          if (userRole === "Operator") {
                                            toast.error("You do not have permission to delete batches");
                                            return;
                                          }
                                          if (group.matchedBatchId) {
                                            onDeletePI(group.matchedBatchId);
                                          }
                                        }}
                                        className="h-7 w-7 p-0 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 cursor-pointer"
                                        title="Delete PI batch"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </Button>
                                    )}
                                  </div>
                                </td>
                              </tr>

                              {/* COLLAPSIBLE BREAKDOWN OF SIZES FOR THIS PI */}
                              {isExpanded && (
                                <tr className="bg-purple-50/50 border-y border-purple-200">
                                  <td colSpan={8} className="px-5 py-3">
                                    <div className="flex items-center justify-between text-[11px] font-black text-purple-900 mb-2">
                                      <span className="flex items-center gap-1.5">
                                        <Boxes className="w-3.5 h-3.5 text-purple-600" />
                                        Item Breakdown for PI {group.piNo} ({group.totalQty} total pcs • {group.totalSqm.toFixed(2)} m²):
                                      </span>
                                      <span className="text-[10px] text-purple-700 font-mono font-medium">
                                        Source PDF: {group.fileName}
                                      </span>
                                    </div>

                                    {group.sizes.length === 0 ? (
                                      <div className="text-xs text-slate-500 italic p-2 bg-white rounded-lg border border-purple-100">
                                        Detailed sticker positions are being tracked under Batch #{formatBatchNumber(group.batchNo)}.
                                      </div>
                                    ) : (
                                      <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                                        {group.sizes.map((subItem, sIdx) => (
                                          <div
                                            key={sIdx}
                                            className="flex items-center justify-between text-xs bg-white p-2 rounded-lg border border-purple-200 shadow-2xs flex-wrap gap-2 hover:border-purple-300"
                                          >
                                            <div className="flex items-center gap-2.5 flex-wrap">
                                              {subItem.stickerNo && (
                                                <span className="font-mono font-bold text-slate-500 text-[11px] bg-slate-100 px-1.5 py-0.5 rounded">
                                                  #{subItem.stickerNo}
                                                </span>
                                              )}
                                              <span className="font-bold text-slate-800">
                                                POS #{subItem.posNo}
                                              </span>
                                              <span className="font-mono text-purple-900 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded text-[11px] font-black">
                                                {subItem.width} × {subItem.height} mm
                                              </span>
                                              <span
                                                className="text-slate-600 font-medium text-[11px] truncate max-w-[240px]"
                                                title={subItem.glassType}
                                              >
                                                {subItem.glassType}
                                              </span>
                                            </div>

                                            <div className="flex items-center gap-3">
                                              <div className="flex items-center gap-1 font-mono">
                                                <span className="text-[10px] uppercase font-bold text-slate-400">Qty:</span>
                                                <span className="text-xs font-black text-purple-900 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                                                  {subItem.qty} pcs
                                                </span>
                                              </div>
                                              <div className="font-mono font-black text-emerald-700 text-xs">
                                                {subItem.sqm.toFixed(2)} m²
                                              </div>
                                              {subItem.currentStage && (
                                                <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                                                  {subItem.currentStage}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
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
              </div>

              {/* PAGINATION & FOOTER BAR (MATCHES SCREENSHOT EXACTLY) */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between flex-wrap gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-slate-800">
                    Current Page: <span className="text-purple-700 font-black">{validCurrentPage}</span> of {totalPages}
                  </span>
                  <span className="text-slate-400 font-medium">
                    ({filteredPiRows.length} PIs)
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={validCurrentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="h-7 text-xs px-2 gap-1 rounded-lg cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" /> Prev
                    </Button>

                    <span className="px-2 text-xs font-black text-slate-700 font-mono">
                      Page {validCurrentPage} / {totalPages}
                    </span>

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={validCurrentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="h-7 text-xs px-2 gap-1 rounded-lg cursor-pointer"
                    >
                      Next <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="h-7 text-xs rounded-lg border border-slate-300 bg-white px-2 font-bold text-slate-700 cursor-pointer shadow-2xs"
                  >
                    <option value={10}>10 / page</option>
                    <option value={20}>20 / page</option>
                    <option value={50}>50 / page</option>
                    <option value={-1}>All items</option>
                  </select>
                </div>
              </div>
            </div>
          ) : (
            /* ========================================================================= */
            /* VIEW MODE B: PDF SOURCE FILE SUMMARY CARDS (WITH INLINE TABLE EXPANDER)  */
            /* ========================================================================= */
            <div className="space-y-4">
              {filteredPdfs.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border-2 border-dashed border-slate-200">
                  <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <h4 className="text-sm font-bold text-slate-700">No matching uploaded PDFs found</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    {searchTerm ? "Try clearing your search term." : "Upload a sticker PDF to start tracking production batches."}
                  </p>
                </div>
              ) : (
                filteredPdfs.map((pdf, idx) => {
                  const isCardExpanded = !!expandedPdfCards[pdf.fileName];
                  const pdfPiRows = consolidatedPiRows.filter(
                    (r) => r.fileName.toLowerCase() === pdf.fileName.toLowerCase()
                  );

                  return (
                    <div
                      key={pdf.fileName + idx}
                      className="bg-white rounded-xl border border-slate-200 hover:border-rose-300 shadow-xs hover:shadow-md transition-all p-4.5 space-y-3"
                    >
                      {/* Top Bar of Card */}
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 font-bold shrink-0">
                            <FileText className="w-4.5 h-4.5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-bold text-slate-900 text-sm">{pdf.fileName}</span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                  pdf.finish === "Colour"
                                    ? "bg-purple-100 text-purple-800 border border-purple-200"
                                    : pdf.finish === "Clear"
                                    ? "bg-cyan-100 text-cyan-800 border border-cyan-200"
                                    : "bg-slate-100 text-slate-800 border border-slate-200"
                                }`}
                              >
                                {pdf.finish === "Colour" ? "Coloured Glass" : pdf.finish === "Clear" ? "Clear Glass" : "Mixed Finish"}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200">
                                {pdf.batches.length} {pdf.batches.length === 1 ? "Batch" : "Batches"}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-50 text-purple-700 border border-purple-200">
                                {pdfPiRows.length} PIs
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-slate-500 font-medium mt-1 flex-wrap">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-slate-400" />
                                Uploaded: <strong className="text-slate-700 font-mono">{formatPlatformDate(pdf.uploadedAt)}</strong>
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Toggle inline PI table for this specific PDF */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => togglePdfCardExpand(pdf.fileName)}
                            className="h-8 text-xs font-bold gap-1 text-purple-700 border-purple-200 hover:bg-purple-50 cursor-pointer"
                          >
                            <TableIcon className="w-3.5 h-3.5 text-purple-600" />
                            {isCardExpanded ? "Hide PIs Table" : `View PIs Table (${pdfPiRows.length})`}
                          </Button>

                          {onSelectPdfFilter && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                onSelectPdfFilter(pdf.fileName);
                                onOpenChange(false);
                              }}
                              className="h-8 text-xs font-bold gap-1 text-slate-700 hover:text-blue-700 hover:border-blue-300 cursor-pointer"
                            >
                              <Filter className="w-3 h-3 text-blue-600" />
                              Filter in Module
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Middle: Customers & Projects */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs bg-slate-50/80 p-2.5 rounded-lg border border-slate-100">
                        <div className="flex items-center gap-2 truncate">
                          <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="text-slate-500 font-medium">Customer:</span>
                          <strong className="text-slate-800 truncate" title={pdf.customers.join(", ")}>
                            {pdf.customers.join(", ") || "General Customer"}
                          </strong>
                        </div>
                        <div className="flex items-center gap-2 truncate">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="text-slate-500 font-medium">Project:</span>
                          <strong className="text-slate-800 truncate" title={pdf.projects.join(", ")}>
                            {pdf.projects.join(", ") || "General Project"}
                          </strong>
                        </div>
                      </div>

                      {/* Batches generated from this PDF */}
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                          <span>Generated Production Batches ({pdf.batches.length}):</span>
                          <span className="font-mono text-slate-700 normal-case font-bold">
                            {pdf.completedPieces}/{pdf.totalPieces} pcs completed ({pdf.totalSqm.toFixed(2)} m²)
                          </span>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          {pdf.batches.map((batch) => (
                            <div
                              key={batch.id}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50/70 border border-blue-200 text-xs font-mono font-bold text-blue-900"
                            >
                              <Layers className="w-3 h-3 text-blue-600" />
                              <span>{formatBatchNumber(batch.batchNo || batch.piNumber)}</span>
                              <span className="text-[10px] text-blue-600 font-sans font-semibold">
                                ({batch.totalQty || batch.itemsCount || 0} pcs)
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* INLINE EXPANDED TABLE OF PIs FOR THIS PDF */}
                      {isCardExpanded && (
                        <div className="pt-3 border-t border-slate-200 mt-2">
                          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs bg-white">
                            <div className="px-3.5 py-2 bg-purple-50/70 border-b border-purple-200 flex items-center justify-between text-xs font-bold text-purple-900">
                              <span>PIs Breakdown for {pdf.fileName} ({pdfPiRows.length} PIs):</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedPdfFilter(pdf.fileName);
                                  setViewMode("table");
                                }}
                                className="text-[11px] text-purple-700 hover:underline font-black flex items-center gap-1 cursor-pointer"
                              >
                                Open Full Table View <ChevronRight className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs border-collapse">
                                <thead className="bg-slate-100 text-slate-700 uppercase border-b border-slate-200 text-[10px] font-black">
                                  <tr>
                                    <th className="px-2 py-2 text-center">SL NO.</th>
                                    <th className="px-2 py-2 text-center">PI</th>
                                    <th className="px-3 py-2">CUSTOMER / PROJECT</th>
                                    <th className="px-3 py-2">FINISH / TYPE</th>
                                    <th className="px-2 py-2 text-center">QTY</th>
                                    <th className="px-3 py-2 text-right">SQM</th>
                                    <th className="px-2 py-2 text-center">BATCH</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {pdfPiRows.map((row, rIdx) => (
                                    <tr key={rIdx} className="hover:bg-purple-50/30">
                                      <td className="px-2 py-1.5 text-center font-mono font-bold text-slate-700">
                                        #{rIdx + 1}
                                        <span className="block text-[9px] text-purple-700 font-sans font-bold">
                                          {row.sizes.length} Sizes
                                        </span>
                                      </td>
                                      <td className="px-2 py-1.5 text-center font-mono font-black text-purple-700">
                                        <span className="bg-white border border-slate-300 rounded px-2 py-0.5">
                                          {row.piNo}
                                        </span>
                                      </td>
                                      <td className="px-3 py-1.5">
                                        <div className="font-bold text-slate-900 truncate max-w-[180px]">{row.customerName}</div>
                                        <div className="text-[10px] text-slate-500 font-mono truncate max-w-[180px]">{row.projectName}</div>
                                      </td>
                                      <td className="px-3 py-1.5">
                                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase ${row.colorOrClear === "Colour" ? "bg-purple-100 text-purple-800" : "bg-cyan-100 text-cyan-800"}`}>
                                          {row.colorOrClear}
                                        </span>
                                        <div className="text-[10px] text-slate-600 truncate max-w-[180px] mt-0.5">{row.glassTypes.join(", ")}</div>
                                      </td>
                                      <td className="px-2 py-1.5 text-center font-mono font-black text-purple-900">
                                        {row.totalQty}
                                      </td>
                                      <td className="px-3 py-1.5 text-right font-mono font-black text-emerald-700">
                                        {row.totalSqm.toFixed(2)} m²
                                      </td>
                                      <td className="px-2 py-1.5 text-center font-mono font-black text-purple-700">
                                        {formatBatchNumber(row.batchNo)}
                                      </td>
                                    </tr>
                                  ))}
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

        {/* MODAL FOOTER */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <span>
              Total Uploaded: <strong className="text-slate-800 font-bold">{pdfSummaries.length}</strong> PDF files
            </span>
            <span className="text-slate-300">•</span>
            <span>
              <strong className="text-purple-700 font-bold">{consolidatedPiRows.length}</strong> unique PIs
            </span>
            <span className="text-slate-300">•</span>
            <span>
              <strong className="text-blue-700 font-bold">{grandTotalBatches}</strong> production batches
            </span>
          </div>
          <Button
            onClick={() => onOpenChange(false)}
            className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl h-8.5 px-4 cursor-pointer"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
