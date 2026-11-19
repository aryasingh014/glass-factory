import React, { useState, useMemo, useRef, useCallback } from "react";
import {
  PackageCheck,
  Layers,
  Printer,
  Boxes,
  Truck,
  Search,
  ArrowRight,
  CheckCircle2,
  Clock,
  Calendar,
  User,
  ShieldCheck,
  FileSpreadsheet,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  Sparkles,
  CheckSquare,
  Square,
  Send,
  Check,
  AlertCircle,
  Building2,
  Briefcase,
  FileText,
  Tag,
  X,
  Play,
  RotateCcw,
  Barcode,
  QrCode,
  Eye,
  History,
} from "lucide-react";
import { GlassItem, PIMaster } from "@shared/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableHorizontalScrollWrapper } from "@/components/TableHorizontalScrollWrapper";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { scannerAudio } from "@/lib/audioBeep";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { cleanScannedBarcode, formatSejalBarcode, generateBarcodeSVG, isItemMatchingCode } from "@/lib/barcode";
import {
  isDguGlass,
  isLaminatedGlass,
  isDlguGlass,
  getItemFinish,
  isDispatchedItem,
  parseRackInfo,
  RackLetter,
  isLaminationStickerPairMatch,
  isPackingIguItem,
  isPackingLamiItem,
} from "@/lib/utils";
import { exportStageWipToExcel } from "@/lib/excelExport";
import { BarcodeStickerModal } from "@/components/BarcodeStickerModal";
import { RackBarcodeModal } from "@/components/RackBarcodeModal";
import { RackDetailsModal } from "@/components/RackDetailsModal";
import { PackingHistoryModule } from "@/components/PackingHistoryModule";
import { formatRackBarcode, parseRackBarcode } from "@shared/barcodeConfig";

export { parseRackInfo };
export type RackLetterType = RackLetter;
export const RACK_OPTIONS: RackLetterType[] = ["Rack A", "Rack B", "Rack C", "Rack D", "Rack E"];

export interface PackingUnitRow {
  id: string;
  primaryItem: GlassItem;
  partnerItem?: GlassItem;
  partnerItems?: GlassItem[];
  allPanes?: GlassItem[];
  allItemIds?: string[];
  allSerials: string[];
  customerName: string;
  projectName?: string;
  pdfFileName?: string;
  piNumber?: string;
  batchNo?: string;
  obNo?: string;
  sfoNo?: string;
  glassCategory?: string;
  finish?: string;
  displayBarcode?: string;
  posNo: string;
  pieceIndex?: number;
  totalPieces?: number;
  width: number;
  height: number;
  qty: number;
  sqm: number;
  makeup?: string;
  rackNo: RackLetterType | string;
  rackSlot?: string;
  shift?: "Day" | "Night" | "A" | "B";
  packedAt?: string;
  packedBy?: string;
  sentToFinished?: boolean;
  sentToFinishedAt?: string;
  sentToFinishedBy?: string;
  isDispatched?: boolean;
  dispatchNoteNo?: string;
}

function resolveValidBarcode(item?: any, fallback?: string): string {
  const b = String(fallback || item?.barcode || "").trim();
  if (b && /^\d{10,24}$/.test(b) && !/width|height/i.test(b)) {
    return b;
  }
  const sfo = item?.sfoNo || item?.orderNo || item?.piNumber || "1344";
  const numPart = item?.serialNumber ? String(item.serialNumber).replace(/\D/g, "") : "";
  const seq = item?.posNo || item?.srNo || numPart || "1";
  return formatSejalBarcode(sfo, seq);
}

interface PackingListViewProps {
  type: "IGU" | "LAMI";
  items: GlassItem[];
  pis: PIMaster[];
  operator: string;
  onRefresh: () => void;
  onNavigateTab?: (tab: string) => void;
  onReject?: (item: GlassItem) => void;
  onRework?: (item: GlassItem) => void;
}

export const PackingListView: React.FC<PackingListViewProps> = ({
  type,
  items,
  pis,
  operator,
  onRefresh,
  onNavigateTab,
  onReject,
  onRework,
}) => {
  const { getAuthHeaders, user, role } = useAuth();
  const effectiveOperator = operator || user?.name || user?.username || "Operator";

  // Shift state: Persisted in localStorage, defaults to Dubai time shift
  const [shift, setShift] = useState<"Day" | "Night">(() => {
    try {
      const saved = localStorage.getItem("sejal_finished_packing_shift");
      if (saved === "Day" || saved === "Night") return saved;
      if (saved === "A") return "Day";
      if (saved === "B") return "Night";
      const now = new Date();
      const dubaiHour = parseInt(
        new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", hour12: false }).format(now),
        10
      );
      return dubaiHour >= 7 && dubaiHour < 19 ? "Day" : "Night";
    } catch {
      return "Day";
    }
  });

  const handleSelectShift = (val: "Day" | "Night") => {
    setShift(val);
    try {
      localStorage.setItem("sejal_finished_packing_shift", val);
    } catch { }
  };

  const [rackLetter, setRackLetter] = useState<RackLetterType>(() => {
    try {
      const saved = localStorage.getItem("sejal_finished_packing_rack_letter");
      if (saved && (RACK_OPTIONS as string[]).includes(saved)) return saved as RackLetterType;
      if (saved === "Rack B" || saved === "RACK B") return "Rack B";
      if (saved === "Rack C" || saved === "RACK C") return "Rack C";
      if (saved === "Rack D" || saved === "RACK D") return "Rack D";
      if (saved === "Rack E" || saved === "RACK E") return "Rack E";
      return "Rack A";
    } catch {
      return "Rack A";
    }
  });

  // Separate persistent rack numbers for Rack A to Rack E (manually entered by operator)
  const [rackSlots, setRackSlots] = useState<Record<RackLetterType, string>>(() => {
    const sanitize = (raw: string | null, def = "") => {
      const s = (raw || "").trim();
      return (s && s.length <= 10) ? s : def;
    };
    try {
      const savedA = sanitize(localStorage.getItem("sejal_finished_packing_rack_slot_Rack A"));
      const savedB = sanitize(localStorage.getItem("sejal_finished_packing_rack_slot_Rack B"));
      const savedC = sanitize(localStorage.getItem("sejal_finished_packing_rack_slot_Rack C"));
      const savedD = sanitize(localStorage.getItem("sejal_finished_packing_rack_slot_Rack D"));
      const savedE = sanitize(localStorage.getItem("sejal_finished_packing_rack_slot_Rack E"));
      const legacy = sanitize(localStorage.getItem("sejal_finished_packing_rack_slot"));

      const slotA = savedA || (rackLetter === "Rack A" ? legacy : "") || "25";
      const slotB = savedB || (rackLetter === "Rack B" ? legacy : "") || "50";
      const slotC = savedC || (rackLetter === "Rack C" ? legacy : "") || "1";
      const slotD = savedD || (rackLetter === "Rack D" ? legacy : "") || "1";
      const slotE = savedE || (rackLetter === "Rack E" ? legacy : "") || "1";
      return { "Rack A": slotA, "Rack B": slotB, "Rack C": slotC, "Rack D": slotD, "Rack E": slotE };
    } catch {
      return { "Rack A": "25", "Rack B": "50", "Rack C": "1", "Rack D": "1", "Rack E": "1" };
    }
  });

  // Current active rack number manually entered by operator
  const rackSlot = rackSlots[rackLetter] || "";

  // The active target rack combines the rack letter and manually entered rack number (e.g. "Rack A - 25")
  const activeTargetRack = useMemo(() => {
    const slot = rackSlot.trim();
    return slot ? `${rackLetter} - ${slot}` : rackLetter;
  }, [rackLetter, rackSlot]);

  const selectedRack = rackLetter;

  const handleSelectRackLetter = (val: RackLetterType) => {
    setRackLetter(val);
    setSelectedPrintSlot("ALL");
    const activeSlotForNewRack = rackSlots[val] || "";
    try {
      localStorage.setItem("sejal_finished_packing_rack_letter", val);
      localStorage.setItem("sejal_finished_packing_rack_slot", activeSlotForNewRack);
      const combined = activeSlotForNewRack.trim() ? `${val} - ${activeSlotForNewRack.trim()}` : val;
      localStorage.setItem("sejal_finished_packing_rack", combined);
    } catch { }
  };

  const handleSetRackSlot = (val: string) => {
    let cleaned = val.replace(/[^a-zA-Z0-9-]/g, "");
    if (cleaned.startsWith("101262")) {
      return;
    }
    cleaned = cleaned.slice(0, 20);

    setRackSlots((prev) => {
      const updated = { ...prev, [rackLetter]: cleaned };
      try {
        localStorage.setItem(`sejal_finished_packing_rack_slot_${rackLetter}`, cleaned);
        localStorage.setItem("sejal_finished_packing_rack_slot", cleaned);
        const combined = cleaned.trim() ? `${rackLetter} - ${cleaned.trim()}` : rackLetter;
        localStorage.setItem("sejal_finished_packing_rack", combined);
      } catch { }
      return updated;
    });
  };

  const handleIncrementRackSlot = (delta: number) => {
    const currentNum = parseInt(rackSlot, 10);
    const nextNum = isNaN(currentNum) ? (delta > 0 ? 1 : 0) : Math.max(1, currentNum + delta);
    handleSetRackSlot(String(nextNum));
  };

  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedCustomerFilter, setSelectedCustomerFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState<boolean>(false);

  const rackSlotInputRef = useRef<HTMLInputElement>(null);
  const [selectedPrintSlot, setSelectedPrintSlot] = useState<string>("ALL");
  const [viewTab, setViewTab] = useState<"pending" | "on_rack" | "history">("on_rack");

  // Sticker modal state
  const [stickerModalItem, setStickerModalItem] = useState<GlassItem | null>(null);
  const [stickerModalOpen, setStickerModalOpen] = useState(false);

  // Rack barcode & details modal state
  const [rackBarcodeModalOpen, setRackBarcodeModalOpen] = useState(false);
  const [rackDetailsModalOpen, setRackDetailsModalOpen] = useState(false);

  const handleOpenSticker = (item: GlassItem) => {
    setStickerModalItem(item);
    setStickerModalOpen(true);
  };

  // Today's Date in UAE / Dubai format
  const todayDubaiFormatted = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Dubai",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date());
    } catch {
      return new Date().toLocaleDateString("en-GB");
    }
  }, []);

  // Live Dubai Time
  const nowDubaiTime = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Dubai",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date());
    } catch {
      return new Date().toLocaleTimeString("en-GB");
    }
  }, []);

  /* ─────────────────────────────────────────────────────────────────────────────
     1. Filter items eligible for this packing workstation:
     - ONLY ITEMS PHYSICALLY SCANNED ONTO A RACK AT STAGE 6 (Finished Glass)
     - IGU: DGU & DLGU items (combined into units)
     - LAMI: Pure Laminated items
     ───────────────────────────────────────────────────────────────────────────── */
  const eligibleItems = useMemo(() => {
    return items.filter((i) => {
      if (i.status === "Rejected") return false;

      // Has physical rack assignment or was packed on rack
      const hasRackAssignment = Boolean(i.packingRackNo && i.packingRackNo.trim());

      // If already dispatched, packed, or assigned to rack
      const isPacked =
        i.packingStatus === "Packed" ||
        hasRackAssignment ||
        Boolean(i.packedAt) ||
        Boolean(i.sentToFinished) ||
        isDispatchedItem(i);
      if (!isPacked) return false;

      // Filter by type: IGU vs LAMI
      if (type === "IGU") {
        return (
          isDguGlass(i) ||
          isDlguGlass(i) ||
          i.glassCategory === "DGU" ||
          i.glassCategory === "DLGU" ||
          Boolean((i as any).dguPairId)
        );
      } else {
        return isLaminatedGlass(i) || (i as any).glassCategory === "Laminated" || i.glassCategory === "Lamination";
      }
    });
  }, [items, type]);

  // Active units currently sitting on a physical rack in Packing (empty once sent to History / Finished)
  const activeRackItems = useMemo(() => {
    return eligibleItems.filter((i) => {
      if (isDispatchedItem(i)) return false;
      // If already sent to Finished/History, it is removed from the active rack (emptying the rack)
      if (i.sentToFinished) return false;
      const pairId = (i as any).dguPairId || (i as any).lamPairId;
      if (pairId) {
        const partnerSentOrDispatched = items.some(
          (other) =>
            other.id !== i.id &&
            ((other as any).dguPairId === pairId || (other as any).lamPairId === pairId) &&
            (other.sentToFinished || isDispatchedItem(other))
        );
        if (partnerSentOrDispatched) return false;
      }
      return true;
    });
  }, [eligibleItems, items]);

  // History units already sent to Finished or Dispatched
  const sentHistoryItems = useMemo(() => {
    return eligibleItems.filter((i) => Boolean(i.sentToFinished || isDispatchedItem(i)));
  }, [eligibleItems]);

  // Incoming units completed at DGU / Lamination that have NOT been assigned a physical rack yet
  const pendingRackItems = useMemo(() => {
    return items.filter((i) => {
      if (i.status === "Rejected" || i.sentToFinished || isDispatchedItem(i)) return false;
      const hasRackAssignment = Boolean(i.packingRackNo && i.packingRackNo.trim());
      if (hasRackAssignment || i.packingStatus === "Packed") return false;
      return type === "IGU" ? isPackingIguItem(i) : isPackingLamiItem(i);
    });
  }, [items, type]);

  /* ─────────────────────────────────────────────────────────────────────────────
     2. Group into unified units (for IGU: pair colour + clear into 1 unit row)
     ───────────────────────────────────────────────────────────────────────────── */


  const getRowMeta = useCallback(
    (it: GlassItem) => {
      const parentPI = pis.find(
        (p) =>
          p.id === it.piId ||
          p.piNumber === it.piNumber ||
          p.piNumber?.replace(/^STK-/i, "") === it.piNumber?.replace(/^STK-/i, "")
      );
      const customerName = (
        parentPI?.customerName ||
        it.customerName ||
        (it as any).customer ||
        (it as any).clientName ||
        "Customer"
      ).trim();
      const projectName = (parentPI?.projectName || (it as any).projectName || it.sectionName || "").trim();
      const pdfFileName = (parentPI?.fileName || (it as any).fileName || "").trim();
      const piNumber = (it.orderNo || it.piNumber || parentPI?.piNumber || "—").replace(/^STK-/i, "");
      const batchNo = it.batchNo || parentPI?.batchNo || "—";
      const obNo = it.obNo || (parentPI as any)?.obNo || "—";
      const sfoNo = it.sfoNo || (it as any).sfo || (parentPI as any)?.sfoNo || (parentPI as any)?.jobOrderNumber || it.orderNo || "—";
      const glassCategory =
        isDlguGlass(it) || (it as any).glassCategory === "DLGU"
          ? "DLGU"
          : isDguGlass(it) || (it as any).glassCategory === "DGU"
            ? "DGU"
            : isLaminatedGlass(it) || (it as any).glassCategory === "Laminated" || (it as any).glassCategory === "Lamination"
              ? "Lamination"
              : "Monolithic";
      const finish = getItemFinish(it);
      const displayBarcode = resolveValidBarcode(it);
      return {
        customerName,
        projectName,
        pdfFileName,
        piNumber,
        batchNo,
        obNo,
        sfoNo,
        glassCategory,
        finish,
        displayBarcode,
      };
    },
    [pis]
  );

  const buildUnitRowsFromItems = useCallback(
    (sourceList: GlassItem[]): PackingUnitRow[] => {
      const posCounts: Record<string, { total: number; current: number }> = {};
      sourceList.forEach((it) => {
        const k = String(it.posNo || it.itemCode || "-").trim();
        if (!posCounts[k]) {
          const matchingAll = items.filter(
            (all) =>
              all.status !== "Rejected" &&
              String(all.posNo || all.itemCode || "-").trim() === k &&
              (all.colorOrClear === it.colorOrClear || (!all.colorOrClear && !it.colorOrClear))
          );
          posCounts[k] = { total: Math.max(1, matchingAll.length, parseInt(String(it.lineQty || 1), 10)), current: 0 };
        }
      });

      if (type === "IGU") {
        const rows: PackingUnitRow[] = [];
        const usedClearIds = new Set<string>();

        const dlguItems = sourceList.filter((i) => isDlguGlass(i) || (i as any).glassCategory === "DLGU");
        const pureDguItems = sourceList.filter((i) => !isDlguGlass(i) && (i as any).glassCategory !== "DLGU");

        // --- A. Process DLGU Units (1 Colour Outer Pane + 2 Clear Laminated Panes = 1 DLGU Unit) ---
        const dlguColour = dlguItems.filter((i) => getItemFinish(i) === "Colour");
        const dlguClear = dlguItems.filter((i) => getItemFinish(i) !== "Colour");

        dlguColour.forEach((col) => {
          const colDguPairId = (col as any).dguPairId;
          let matchingClears = colDguPairId
            ? dlguClear.filter(
              (clr) => !usedClearIds.has(clr.id) && (clr as any).dguPairId === colDguPairId
            ).slice(0, 2)
            : [];

          if (matchingClears.length === 0) {
            matchingClears = dlguClear.filter(
              (clr) =>
                !usedClearIds.has(clr.id) &&
                ((clr.posNo && col.posNo && String(clr.posNo).trim() === String(col.posNo).trim()) ||
                  (clr.width === col.width && clr.height === col.height))
            ).slice(0, 2);
          }

          matchingClears.forEach((clr) => usedClearIds.add(clr.id));

          const primaryPartner = matchingClears[0];
          const rackInfo = parseRackInfo(col.packingRackNo || primaryPartner?.packingRackNo);
          const assignedShift = col.packingShift || primaryPartner?.packingShift || shift;
          const packedAt = col.packedAt || primaryPartner?.packedAt;
          const packedBy = col.packedBy || primaryPartner?.packedBy;
          const isDispatched = Boolean(col.isDispatched || col.currentStage === "Dispatched" || primaryPartner?.isDispatched);
          const dispatchNoteNo = col.dispatchNoteNo || primaryPartner?.dispatchNoteNo;

          const posKey = String(col.posNo || col.itemCode || "-").trim();
          if (posCounts[posKey]) posCounts[posKey].current += 1;
          const pieceIndex = posCounts[posKey]?.current || 1;
          const totalPieces = posCounts[posKey]?.total || 1;

          const meta = getRowMeta(col);

          const allPanes = [col, ...matchingClears];
          const allItemIds = allPanes.map((p) => p.id);

          rows.push({
            id: `dlgu-unit-${col.id}`,
            primaryItem: col,
            partnerItem: primaryPartner,
            partnerItems: matchingClears,
            allPanes,
            allItemIds,
            allSerials: [col.serialNumber, ...matchingClears.map((c) => c.serialNumber)],
            customerName: meta.customerName,
            projectName: meta.projectName,
            pdfFileName: meta.pdfFileName,
            piNumber: meta.piNumber,
            batchNo: meta.batchNo,
            obNo: meta.obNo,
            sfoNo: meta.sfoNo,
            glassCategory: "DLGU",
            finish: meta.finish,
            displayBarcode: meta.displayBarcode,
            posNo: String(col.posNo || col.itemCode || "-"),
            pieceIndex,
            totalPieces,
            width: col.width,
            height: col.height,
            qty: 1,
            sqm: col.sqm || ((col.width * col.height) / 1000000),
            makeup: col.makeup || col.glassType,
            rackNo: rackInfo.rackNo,
            rackSlot: rackInfo.rackSlot,
            shift: assignedShift,
            packedAt,
            packedBy,
            sentToFinished: Boolean(col.sentToFinished || primaryPartner?.sentToFinished),
            sentToFinishedAt: col.sentToFinishedAt || primaryPartner?.sentToFinishedAt,
            sentToFinishedBy: col.sentToFinishedBy || primaryPartner?.sentToFinishedBy,
            isDispatched,
            dispatchNoteNo,
          });
        });

        // --- B. Process Pure DGU Units (1 Colour Outer Pane + 1 Clear Inner Pane = 1 DGU Unit) ---
        const dguColour = pureDguItems.filter((i) => getItemFinish(i) === "Colour");
        const dguClear = pureDguItems.filter((i) => getItemFinish(i) !== "Colour");

        dguColour.forEach((col) => {
          const colDguPairId = (col as any).dguPairId;
          let partner = colDguPairId
            ? dguClear.find(
              (clr) => !usedClearIds.has(clr.id) && (clr as any).dguPairId === colDguPairId
            )
            : null;

          if (!partner) {
            partner = dguClear.find(
              (clr) =>
                !usedClearIds.has(clr.id) &&
                ((clr.posNo && col.posNo && String(clr.posNo).trim() === String(col.posNo).trim()) ||
                  (clr.width === col.width && clr.height === col.height))
            );
          }

          if (partner) usedClearIds.add(partner.id);

          const rackInfo = parseRackInfo(col.packingRackNo || partner?.packingRackNo);
          const assignedShift = col.packingShift || partner?.packingShift || shift;
          const packedAt = col.packedAt || partner?.packedAt;
          const packedBy = col.packedBy || partner?.packedBy;
          const isDispatched = Boolean(col.isDispatched || col.currentStage === "Dispatched" || partner?.isDispatched);
          const dispatchNoteNo = col.dispatchNoteNo || partner?.dispatchNoteNo;

          const posKey = String(col.posNo || col.itemCode || "-").trim();
          if (posCounts[posKey]) posCounts[posKey].current += 1;
          const pieceIndex = posCounts[posKey]?.current || 1;
          const totalPieces = posCounts[posKey]?.total || 1;

          const meta = getRowMeta(col);
          const allPanes = [col, partner].filter(Boolean) as GlassItem[];
          const allItemIds = allPanes.map((p) => p.id);

          rows.push({
            id: `dgu-unit-${col.id}`,
            primaryItem: col,
            partnerItem: partner,
            partnerItems: partner ? [partner] : [],
            allPanes,
            allItemIds,
            allSerials: [col.serialNumber, partner?.serialNumber].filter(Boolean) as string[],
            customerName: meta.customerName,
            projectName: meta.projectName,
            pdfFileName: meta.pdfFileName,
            piNumber: meta.piNumber,
            batchNo: meta.batchNo,
            obNo: meta.obNo,
            sfoNo: meta.sfoNo,
            glassCategory: "DGU",
            finish: meta.finish,
            displayBarcode: meta.displayBarcode,
            posNo: String(col.posNo || col.itemCode || "-"),
            pieceIndex,
            totalPieces,
            width: col.width,
            height: col.height,
            qty: 1,
            sqm: col.sqm || ((col.width * col.height) / 1000000),
            makeup: col.makeup || col.glassType,
            rackNo: rackInfo.rackNo,
            rackSlot: rackInfo.rackSlot,
            shift: assignedShift,
            packedAt,
            packedBy,
            sentToFinished: Boolean(col.sentToFinished || partner?.sentToFinished),
            sentToFinishedAt: col.sentToFinishedAt || partner?.sentToFinishedAt,
            sentToFinishedBy: col.sentToFinishedBy || partner?.sentToFinishedBy,
            isDispatched,
            dispatchNoteNo,
          });
        });

        // --- C. Any orphaned clear panes that were not matched to any colour pane ---
        const allClears = [...dlguClear, ...dguClear];
        allClears.forEach((clr) => {
          if (!usedClearIds.has(clr.id)) {
            // If this clear pane's partner was already sent to finished or dispatched, do NOT show as active manifest orphan!
            const pairId = (clr as any).dguPairId || (clr as any).lamPairId;
            const isPartnerFinished = items.some(
              (other) =>
                other.id !== clr.id &&
                (
                  (pairId && ((other as any).dguPairId === pairId || (other as any).lamPairId === pairId)) ||
                  ((other.posNo && clr.posNo && String(other.posNo).trim() === String(clr.posNo).trim()) &&
                    (other.piId === clr.piId || other.piNumber === clr.piNumber || other.batchNo === clr.batchNo) &&
                    getItemFinish(other) === "Colour")
                ) &&
                Boolean(isDispatchedItem(other))
            );
            if (isPartnerFinished) return;

            const meta = getRowMeta(clr);
            const allPanes = [clr];
            const allItemIds = [clr.id];
            rows.push({
              id: `dgu-clear-solo-${clr.id}`,
              primaryItem: clr,
              allPanes,
              allItemIds,
              allSerials: [clr.serialNumber],
              customerName: meta.customerName,
              projectName: meta.projectName,
              pdfFileName: meta.pdfFileName,
              piNumber: meta.piNumber,
              batchNo: meta.batchNo,
              obNo: meta.obNo,
              sfoNo: meta.sfoNo,
              glassCategory: meta.glassCategory,
              finish: meta.finish,
              displayBarcode: meta.displayBarcode,
              posNo: String(clr.posNo || clr.itemCode || "-"),
              width: clr.width,
              height: clr.height,
              qty: 1,
              sqm: clr.sqm || ((clr.width * clr.height) / 1000000),
              makeup: clr.makeup || clr.glassType,
              rackNo: parseRackInfo(clr.packingRackNo).rackNo,
              rackSlot: parseRackInfo(clr.packingRackNo).rackSlot,
              shift: clr.packingShift || shift,
              packedAt: clr.packedAt,
              packedBy: clr.packedBy,
              sentToFinished: Boolean(clr.sentToFinished),
              sentToFinishedAt: clr.sentToFinishedAt,
              sentToFinishedBy: clr.sentToFinishedBy,
              isDispatched: Boolean(clr.isDispatched || clr.currentStage === "Dispatched"),
              dispatchNoteNo: clr.dispatchNoteNo,
            });
          }
        });

        return rows;
      } else {
        // --- Lamination Line / Auto Clave: Pair complementary lites (e.g. 10mm + 12mm) into 1 assembled Laminated Unit ---
        const rows: PackingUnitRow[] = [];
        const usedPanes = new Set<string>();

        const sortedList = [...sourceList].sort((a, b) => {
          const numA = parseInt(a.serialNumber.replace(/\D/g, ""), 10) || 0;
          const numB = parseInt(b.serialNumber.replace(/\D/g, ""), 10) || 0;
          return numA - numB;
        });

        for (let i = 0; i < sortedList.length; i++) {
          const paneA = sortedList[i];
          if (usedPanes.has(paneA.id)) continue;

          // Find partner pane (by lamPairId or isLaminationStickerPairMatch or same posNo + dimensions)
          const lamPairIdA = (paneA as any).lamPairId;
          let partner = lamPairIdA
            ? sortedList.find(
              (pB) => !usedPanes.has(pB.id) && pB.id !== paneA.id && (pB as any).lamPairId === lamPairIdA
            )
            : null;

          if (!partner) {
            partner =
              sortedList.find(
                (pB) =>
                  !usedPanes.has(pB.id) &&
                  pB.id !== paneA.id &&
                  isLaminationStickerPairMatch(paneA, pB)
              ) || null;
          }

          if (!partner) {
            partner =
              sortedList.find(
                (pB) =>
                  !usedPanes.has(pB.id) &&
                  pB.id !== paneA.id &&
                  String(pB.posNo || "").trim() === String(paneA.posNo || "").trim() &&
                  Number(pB.width) === Number(paneA.width) &&
                  Number(pB.height) === Number(paneA.height) &&
                  (pB.glassType !== paneA.glassType || pB.piNumber !== paneA.piNumber || pB.batchNo !== paneA.batchNo)
              ) || null;
          }

          usedPanes.add(paneA.id);
          if (partner) usedPanes.add(partner.id);

          const rackInfo = parseRackInfo(paneA.packingRackNo || partner?.packingRackNo);
          const posKey = String(paneA.posNo || paneA.itemCode || "-").trim();
          if (posCounts[posKey]) posCounts[posKey].current += 1;
          const pieceIndex = posCounts[posKey]?.current || 1;
          const totalPieces = posCounts[posKey]?.total || 1;

          const meta = getRowMeta(paneA);
          const allPanes = partner ? [paneA, partner] : [paneA];
          const allItemIds = allPanes.map((p) => p.id);
          const allSerials = allPanes.map((p) => p.serialNumber);
          const makeup = paneA.makeup || partner?.makeup || paneA.glassType;

          rows.push({
            id: partner ? `lami-${paneA.id}-${partner.id}` : `lami-${paneA.id}`,
            primaryItem: paneA,
            partnerItem: partner || undefined,
            partnerItems: partner ? [partner] : [],
            allPanes,
            allItemIds,
            allSerials,
            customerName: meta.customerName,
            projectName: meta.projectName,
            pdfFileName: meta.pdfFileName,
            piNumber: meta.piNumber,
            batchNo: meta.batchNo,
            obNo: meta.obNo,
            sfoNo: meta.sfoNo,
            glassCategory: "Lamination",
            finish: meta.finish,
            displayBarcode: meta.displayBarcode,
            posNo: String(paneA.posNo || paneA.itemCode || "-"),
            pieceIndex,
            totalPieces,
            width: paneA.width,
            height: paneA.height,
            qty: 1,
            sqm: paneA.sqm || ((paneA.width * paneA.height) / 1000000),
            makeup,
            rackNo: rackInfo.rackNo,
            rackSlot: rackInfo.rackSlot,
            shift: paneA.packingShift || partner?.packingShift || shift,
            packedAt: paneA.packedAt || partner?.packedAt,
            packedBy: paneA.packedBy || partner?.packedBy,
            sentToFinished: Boolean(paneA.sentToFinished || partner?.sentToFinished),
            sentToFinishedAt: paneA.sentToFinishedAt || partner?.sentToFinishedAt,
            sentToFinishedBy: paneA.sentToFinishedBy || partner?.sentToFinishedBy,
            isDispatched: Boolean(paneA.isDispatched || paneA.currentStage === "Dispatched" || partner?.isDispatched),
            dispatchNoteNo: paneA.dispatchNoteNo || partner?.dispatchNoteNo,
          });
        }

        return rows;
      }
    },
    [items, type, shift, getRowMeta]
  );

  const unitRows = useMemo(() => buildUnitRowsFromItems(activeRackItems), [buildUnitRowsFromItems, activeRackItems]);
  const historyUnitRows = useMemo(
    () => buildUnitRowsFromItems(sentHistoryItems),
    [buildUnitRowsFromItems, sentHistoryItems]
  );
  const allHistoryUnitRows = useMemo(
    () => buildUnitRowsFromItems(sentHistoryItems),
    [buildUnitRowsFromItems, sentHistoryItems]
  );
  const pendingUnitRows = useMemo(
    () => buildUnitRowsFromItems(pendingRackItems),
    [buildUnitRowsFromItems, pendingRackItems]
  );

  // Per-rack count and area metrics for physical rack stickers
  const rackCounts = useMemo(() => {
    const counts: Record<RackLetterType, { units: number; sqm: number }> = {
      "Rack A": { units: 0, sqm: 0 },
      "Rack B": { units: 0, sqm: 0 },
      "Rack C": { units: 0, sqm: 0 },
      "Rack D": { units: 0, sqm: 0 },
      "Rack E": { units: 0, sqm: 0 },
    };
    unitRows.forEach((r) => {
      if (counts[r.rackNo]) {
        counts[r.rackNo].units += 1;
        counts[r.rackNo].sqm += r.sqm || 0;
      }
    });
    return counts;
  }, [unitRows]);

  // Checkbox selection set for Scanned Manifest units
  const [selectedManifestIds, setSelectedManifestIds] = useState<Set<string>>(new Set());

  // Distinct rack slots actually scanned in this rack room with at least 1 unit
  const availableRackSlots = useMemo(() => {
    const slots = new Set<string>();
    [...unitRows, ...historyUnitRows]
      .filter((r) => r.rackNo === rackLetter && r.rackSlot && r.rackSlot.trim())
      .forEach((r) => {
        slots.add(r.rackSlot!.trim());
      });
    return Array.from(slots).sort((a, b) => {
      const numA = parseInt(a, 10);
      const numB = parseInt(b, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });
  }, [unitRows, historyUnitRows, rackLetter]);

  // Formatted Rack No for print and display: e.g. "1(B)", "2(A)", "3(C)", etc.
  const printedRackDisplay = useMemo(() => {
    const letter = rackLetter.replace("Rack ", "").trim();
    const slot = (selectedPrintSlot !== "ALL" ? selectedPrintSlot : rackSlot).trim();
    if (slot) {
      return `${slot}(${letter})`;
    }
    return letter;
  }, [selectedPrintSlot, rackSlot, rackLetter]);

  // Available racks: Rack A to Rack E
  const availableRacks = useMemo(() => ["Rack A", "Rack B", "Rack C", "Rack D", "Rack E"], []);

  // Active unit rows based on selected view tab
  const activeSourceRows = useMemo(() => {
    if (viewTab === "pending") return pendingUnitRows;
    return unitRows;
  }, [viewTab, pendingUnitRows, unitRows]);

  // Available Clients / Customers for dropdown filter
  const availableCustomers = useMemo(() => {
    const custMap = new Map<string, { totalUnits: number; totalSqm: number }>();
    const baseList =
      viewTab === "pending"
        ? activeSourceRows
        : activeSourceRows.filter((r) => r.rackNo === selectedRack);

    baseList.forEach((r) => {
      const name = (r.customerName || "Customer").trim();
      const prev = custMap.get(name) || { totalUnits: 0, totalSqm: 0 };
      custMap.set(name, {
        totalUnits: prev.totalUnits + (r.qty || 1),
        totalSqm: prev.totalSqm + (r.sqm || 0),
      });
    });

    return Array.from(custMap.entries())
      .map(([name, data]) => ({
        name,
        totalUnits: data.totalUnits,
        totalSqm: parseFloat(data.totalSqm.toFixed(2)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [activeSourceRows, selectedRack, viewTab]);

  const displayedRows = useMemo(() => {
    return activeSourceRows.filter((row) => {
      if (viewTab !== "pending") {
        // Filter by selected rack
        if (row.rackNo !== selectedRack) {
          return false;
        }

        // Print rack slot filter (when a specific rack number is chosen in dropdown)
        if (selectedPrintSlot !== "ALL" && row.rackSlot !== selectedPrintSlot) {
          return false;
        }
      }

      // Customer Filter
      if (selectedCustomerFilter !== "ALL" && row.customerName.toLowerCase() !== selectedCustomerFilter.toLowerCase()) {
        return false;
      }

      // Search filter
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const pItm = row.primaryItem;
        const matchCust = row.customerName.toLowerCase().includes(q);
        const matchProj = (row.projectName || "").toLowerCase().includes(q);
        const matchPI = (row.piNumber || "").toLowerCase().includes(q);
        const matchBatch = (row.batchNo || "").toLowerCase().includes(q);
        const matchOb = (row.obNo || "").toLowerCase().includes(q);
        const matchSfo = (row.sfoNo || "").toLowerCase().includes(q);
        const matchPos = row.posNo.toLowerCase().includes(q) || `pos ${row.posNo}`.toLowerCase().includes(q) || `pos#${row.posNo}`.toLowerCase().includes(q);
        const matchSer = row.allSerials.some((s) => s.toLowerCase().includes(q));
        const matchBar = (row.displayBarcode || pItm.barcode || "").toLowerCase().includes(q);
        const matchMakeup = (row.makeup || "").toLowerCase().includes(q);
        const matchSlot = (row.rackSlot || "").toLowerCase().includes(q);
        const matchRack = (row.rackNo || "").toLowerCase().includes(q);
        const matchSpec = (pItm.glassType || "").toLowerCase().includes(q);
        const matchCode = (pItm.glassCode || pItm.itemCode || "").toLowerCase().includes(q);
        const matchLoc = (pItm.delLocation || "").toLowerCase().includes(q);
        const matchDim =
          `${pItm.width}x${pItm.height}`.includes(q) ||
          `${pItm.width}*${pItm.height}`.includes(q) ||
          `${pItm.width} × ${pItm.height}`.includes(q) ||
          String(pItm.width).includes(q) ||
          String(pItm.height).includes(q);
        const matchPartner = row.partnerItems && row.partnerItems.some((pt) =>
          (pt.barcode && pt.barcode.toLowerCase().includes(q)) ||
          (pt.serialNumber && pt.serialNumber.toLowerCase().includes(q)) ||
          (pt.glassType && pt.glassType.toLowerCase().includes(q))
        );

        if (!matchCust && !matchProj && !matchPI && !matchBatch && !matchOb && !matchSfo && !matchPos && !matchSer && !matchBar && !matchMakeup && !matchSlot && !matchRack && !matchSpec && !matchCode && !matchLoc && !matchDim && !matchPartner) {
          return false;
        }
      }

      return true;
    });
  }, [activeSourceRows, selectedRack, selectedPrintSlot, selectedCustomerFilter, searchTerm]);

  // Totals for current displayed rows
  const totalQty = useMemo(() => displayedRows.reduce((acc, curr) => acc + (curr.qty || 1), 0), [displayedRows]);
  const totalSqm = useMemo(() => displayedRows.reduce((acc, curr) => acc + (curr.sqm || 0), 0), [displayedRows]);

  // Collapsible Customer Grouping state (Defaults to all expanded)
  const [expandedCustomerGroups, setExpandedCustomerGroups] = useState<Record<string, boolean>>({});

  const toggleCustomerExpanded = (groupKey: string) => {
    setExpandedCustomerGroups((prev) => {
      const current = prev[groupKey];
      const nextVal = current === undefined ? false : !current;
      return { ...prev, [groupKey]: nextVal };
    });
  };

  const isCustomerExpanded = (groupKey: string) => {
    return expandedCustomerGroups[groupKey] !== false;
  };

  const setAllCustomersExpanded = (expand: boolean) => {
    const updated: Record<string, boolean> = {};
    groupedCustomerRows.forEach((g) => {
      updated[g.groupKey] = expand;
    });
    setExpandedCustomerGroups(updated);
  };

  const groupedCustomerRows = useMemo(() => {
    const map = new Map<string, { customerName: string; projectName: string; rows: PackingUnitRow[] }>();

    displayedRows.forEach((row) => {
      const cust = (row.customerName || "Customer").trim();
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
      rows: PackingUnitRow[];
      totalUnits: number;
      totalSqm: number;
      projects: string[];
      pdfFiles: string[];
      hasColour: boolean;
      hasClear: boolean;
      categories: Set<string>;
      allRowIds: string[];
      isAllSelected: boolean;
      isSomeSelected: boolean;
    }> = [];

    map.forEach(({ customerName, projectName, rows: cRows }, groupKey) => {
      let totalUnits = 0;
      let totalSqm = 0;
      let hasColour = false;
      let hasClear = false;
      const projectsSet = new Set<string>();
      const pdfFilesSet = new Set<string>();
      const categories = new Set<string>();
      const allRowIds = cRows.map((r) => r.id);
      if (projectName) projectsSet.add(projectName);

      cRows.forEach((r) => {
        const qty = r.qty || 1;
      totalUnits += qty;
      totalSqm += (r.sqm || 0);

      const fin = r.finish || getItemFinish(r.primaryItem);
      if (fin === "Colour") hasColour = true;
      else hasClear = true;

      if (r.glassCategory) categories.add(r.glassCategory);
      else if (isDlguGlass(r.primaryItem)) categories.add("DLGU");
      else if (isDguGlass(r.primaryItem)) categories.add("DGU");
      else if (isLaminatedGlass(r.primaryItem)) categories.add("Lamination");

      if (r.projectName) projectsSet.add(r.projectName);
      if (r.pdfFileName) pdfFilesSet.add(r.pdfFileName);
    });

    const selectedInGroup = allRowIds.filter((id) => selectedManifestIds.has(id));
    const isAllSelected = allRowIds.length > 0 && selectedInGroup.length === allRowIds.length;
    const isSomeSelected = selectedInGroup.length > 0 && !isAllSelected;

    groups.push({
      groupKey,
      customerName,
      projectName,
      rows: cRows,
      totalUnits,
      totalSqm: parseFloat(totalSqm.toFixed(2)),
      projects: Array.from(projectsSet),
      pdfFiles: Array.from(pdfFilesSet),
      hasColour,
      hasClear,
      categories,
      allRowIds,
      isAllSelected,
      isSomeSelected,
    });
  });

  return groups;
}, [displayedRows, selectedManifestIds]);

const handleToggleCustomerGroupSelect = (rowIds: string[]) => {
  if (rowIds.length === 0) return;
  const allSelected = rowIds.every((id) => selectedManifestIds.has(id));
  setSelectedManifestIds((prev) => {
    const next = new Set(prev);
    if (allSelected) {
      rowIds.forEach((id) => next.delete(id));
    } else {
      rowIds.forEach((id) => next.add(id));
    }
    return next;
  });
};

const handleToggleSelectAllManifest = () => {
  if (selectedManifestIds.size === displayedRows.length && displayedRows.length > 0) {
    setSelectedManifestIds(new Set());
  } else {
    setSelectedManifestIds(new Set(displayedRows.map((r) => r.id)));
  }
};

const handleToggleSelectManifest = (id: string) => {
  setSelectedManifestIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
};

// Direct Excel Export
const handleExportExcel = () => {
  const exportItems = selectedManifestIds.size > 0
    ? displayedRows.filter((r) => selectedManifestIds.has(r.id)).map((r) => r.primaryItem)
    : displayedRows.map((r) => r.primaryItem);
  if (exportItems.length === 0) {
    toast.info("No items to export");
    return;
  }
  const filename = `Packing_${type}_${selectedRack}_${selectedPrintSlot !== "ALL" ? selectedPrintSlot : "All"}`;
  exportStageWipToExcel("Finished", exportItems, filename, pis);
};

/* ─────────────────────────────────────────────────────────────────────────────
   Assign Pending / Selected Units to Target Rack (1-Scan / 1-Click)
   ───────────────────────────────────────────────────────────────────────────── */
const handleAssignRowsToRack = useCallback(
  async (targetRows: PackingUnitRow[], customSuccessMsg?: string) => {
    if (targetRows.length === 0) return;

    const moveSerials = Array.from(new Set(targetRows.flatMap((r) => r.allSerials)));
    const moveIds = Array.from(
      new Set(
        targetRows.flatMap((r) => r.allItemIds || ([r.primaryItem.id, r.partnerItem?.id].filter(Boolean) as string[]))
      )
    );

    setLoading(true);
    try {
      const res = await fetch("/api/production/pack-to-rack", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          serialNumbers: moveSerials,
          itemIds: moveIds,
          rackNo: activeTargetRack,
          shift,
          operator: effectiveOperator,
          advanceAll: true,
          packPartners: true,
          sentToFinished: false,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || "Failed to assign unit to rack");
      }
      scannerAudio.playSuccess();
      toast.success(
        customSuccessMsg || `Packed ${targetRows.length} unit(s) onto ${activeTargetRack}.`,
        { id: "assign-rack-success" }
      );
      setSelectedManifestIds(new Set());
      onRefresh();
    } catch (err: any) {
      scannerAudio.playError();
      toast.error(err.message || "Error assigning unit to rack");
    } finally {
      setLoading(false);
    }
  },
  [rackSlot, activeTargetRack, shift, effectiveOperator, getAuthHeaders, onRefresh]
);

/* ─────────────────────────────────────────────────────────────────────────────
   Send to Finished Stage (Stage 6)
   ───────────────────────────────────────────────────────────────────────────── */
const handleSendUnitsToFinished = async (targetRows: PackingUnitRow[], customSuccessMsg?: string) => {
  if (targetRows.length === 0) return;

  const allSerialsToSend = Array.from(new Set(targetRows.flatMap((r) => r.allSerials)));
  const allItemIdsToSend = Array.from(
    new Set(
      targetRows.flatMap((r) => r.allItemIds || [r.primaryItem.id, r.partnerItem?.id].filter(Boolean) as string[])
    )
  );

  setLoading(true);
  try {
    const res = await fetch("/api/production/send-to-finished", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({
        serialNumbers: allSerialsToSend,
        itemIds: allItemIdsToSend,
        operator: effectiveOperator,
        sendPartners: true,
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || errJson.message || "Failed to send to Finished stage");
    }

    scannerAudio.playSuccess();
    toast.success(
      customSuccessMsg ||
      `Sent ${targetRows.length} unit(s) to Finished Glass.`,
      { id: "send-finished-success" }
    );

    setSelectedManifestIds(new Set());
    onRefresh();
  } catch (err: any) {
    scannerAudio.playError();
    toast.error(err.message || "Error sending to Finished stage");
  } finally {
    setLoading(false);
  }
};

/* ─────────────────────────────────────────────────────────────────────────────
   Send Entire Selected Rack to History (Empties the rack)
   ───────────────────────────────────────────────────────────────────────────── */
const handleSendRackToHistory = async () => {
  const rackRows = unitRows.filter((r) => r.rackNo === selectedRack);
  if (rackRows.length === 0) {
    toast.warning(`No units currently on ${selectedRack} to send to history.`);
    return;
  }
  await handleSendUnitsToFinished(
    rackRows,
    `✅ Sent all ${rackRows.length} unit(s) from ${selectedRack} to Packing History & Finished Glass. ${selectedRack} is now empty!`
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   Send Selected Units to History
   ───────────────────────────────────────────────────────────────────────────── */
const handleSendSelectedToHistory = async () => {
  const selectedRows = displayedRows.filter((r) => selectedManifestIds.has(r.id));
  if (selectedRows.length === 0) {
    toast.warning("Please select at least one unit to send to history.");
    return;
  }
  await handleSendUnitsToFinished(
    selectedRows,
    `✅ Sent ${selectedRows.length} selected unit(s) to Packing History & Finished Glass.`
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   Print Physical Slip
   ───────────────────────────────────────────────────────────────────────────── */
const handlePrint = () => {
  if (displayedRows.length === 0) {
    toast.error("No items in the selected view to print!");
    return;
  }
  window.print();
};

/* ─────────────────────────────────────────────────────────────────────────────
   Barcode Scanner Integration: Move to Target Rack or Send to Finished
   Strict Single-Sticker Scan: in one time only one sticker will scan!
   ───────────────────────────────────────────────────────────────────────────── */
const isDirectScanningRef = useRef<boolean>(false);

const handleDirectScan = useCallback(
  async (rawBarcode: string) => {
    const clean = cleanScannedBarcode(rawBarcode).trim();
    if (!clean) return;

    if (isDirectScanningRef.current) {
      console.warn("Scan ignored: another scan is currently in progress", clean);
      return;
    }
    isDirectScanningRef.current = true;
    const safetyUnlockTimer = setTimeout(() => {
      isDirectScanningRef.current = false;
    }, 2500);

    try {
      // 0. Check if the scanned barcode is a Rack Barcode (e.g. "RACK-A", "RACK-B", "RACK-C", "RACK-D", "RACK-E")
      const rackMatch = parseRackBarcode(clean);
      if (rackMatch.isRack && rackMatch.rackLetter) {
        scannerAudio.playSuccess();
        const targetLetter = rackMatch.rackLetter;
        handleSelectRackLetter(targetLetter);
        setViewTab("on_rack");
        setSelectedPrintSlot("ALL");

        const activeSlot = (rackSlots[targetLetter] || "").trim();
        const countOnRack = unitRows.filter((r) => r.rackNo === targetLetter).length;

        toast.success(
          `🎯 TARGET RACK CHANGED TO ${targetLetter.toUpperCase()}! Now scan glass stickers to pack onto ${targetLetter} (${countOnRack} units currently on rack).`,
          { id: "rack-select", duration: 4000 }
        );
        return;
      }

      const cleanUpper = clean.toUpperCase();
      const cleanLower = clean.toLowerCase();

      // Robust unit row matcher across all panes, barcodes, serials, POS, and formats
      const doesRowMatchCode = (row: PackingUnitRow) => {
        // 1. Direct serial match across all panes in this assembled unit
        if (row.allSerials && row.allSerials.some((s) => s.toUpperCase() === cleanUpper || s.toLowerCase() === cleanLower)) {
          return true;
        }
        // 2. Barcode or code match across all panes in this assembled unit
        if (
          row.allPanes &&
          row.allPanes.some(
            (p) =>
              (p.barcode && cleanScannedBarcode(p.barcode).toUpperCase() === cleanUpper) ||
              (p.serialNumber && p.serialNumber.toUpperCase() === cleanUpper) ||
              isItemMatchingCode(p, clean)
          )
        ) {
          return true;
        }
        // 3. Display barcode match
        if (row.displayBarcode && cleanScannedBarcode(row.displayBarcode).toUpperCase() === cleanUpper) {
          return true;
        }
        // 4. Primary or partner item fallback
        if (
          isItemMatchingCode(row.primaryItem, clean) ||
          (row.partnerItem && isItemMatchingCode(row.partnerItem, clean)) ||
          (row.partnerItems && row.partnerItems.some((pt) => isItemMatchingCode(pt, clean)))
        ) {
          return true;
        }
        // 5. Exact POS match if scanned (e.g. "POS 7" or "7")
        if (
          row.posNo &&
          (row.posNo === clean ||
            `pos ${row.posNo}`.toLowerCase() === cleanLower ||
            `pos#${row.posNo}`.toLowerCase() === cleanLower)
        ) {
          return true;
        }
        return false;
      };

      // 1. Check Pending Rack queue first (incoming from DGU / Lamination without a physical rack yet)
      let matchedPendingRow = pendingUnitRows.find(doesRowMatchCode);

      // Fallback A: Check pendingRackItems directly in case unitRows didn't catch a lone/un-grouped piece
      if (!matchedPendingRow) {
        const directPendingItem = pendingRackItems.find(
          (it) =>
            isItemMatchingCode(it, clean) ||
            (it.barcode && cleanScannedBarcode(it.barcode).toUpperCase() === cleanUpper) ||
            (it.serialNumber && it.serialNumber.toUpperCase() === cleanUpper)
        );
        if (directPendingItem) {
          matchedPendingRow =
            pendingUnitRows.find((r) => r.allItemIds?.includes(directPendingItem.id)) ||
            buildUnitRowsFromItems([directPendingItem])[0];
        }
      }

      // Fallback B: Scan across raw items list for any pending packing piece awaiting a rack
      if (!matchedPendingRow) {
        const rawPendingItem = items.find(
          (it) =>
            it.status !== "Rejected" &&
            !it.sentToFinished &&
            !it.isDispatched &&
            (!it.packingRackNo || !it.packingRackNo.trim()) &&
            (type === "IGU" ? isPackingIguItem(it) : isPackingLamiItem(it)) &&
            (isItemMatchingCode(it, clean) ||
              (it.barcode && cleanScannedBarcode(it.barcode).toUpperCase() === cleanUpper) ||
              (it.serialNumber && it.serialNumber.toUpperCase() === cleanUpper))
        );
        if (rawPendingItem) {
          matchedPendingRow =
            pendingUnitRows.find((r) => r.allItemIds?.includes(rawPendingItem.id)) ||
            buildUnitRowsFromItems([rawPendingItem])[0];
        }
      }

      if (matchedPendingRow) {
        await handleAssignRowsToRack(
          [matchedPendingRow],
          `Packed POS ${matchedPendingRow.posNo} onto ${activeTargetRack}.`
        );
        setViewTab("on_rack");
        return;
      }

      const findRackedMatch = () =>
        unitRows.find((row) => row.rackNo === selectedRack && doesRowMatchCode(row)) ||
        unitRows.find(doesRowMatchCode);

      const matchedRackedRow = findRackedMatch();

      // Move to target rack if different, or notify if already on target rack
      if (matchedRackedRow) {
        const isSameTargetRack = matchedRackedRow.rackNo === selectedRack;

        if (!isSameTargetRack) {
          const moveSerials = matchedRackedRow.allSerials;
          const moveIds =
            matchedRackedRow.allItemIds ||
            ([matchedRackedRow.primaryItem.id, matchedRackedRow.partnerItem?.id].filter(Boolean) as string[]);

          setLoading(true);
          try {
            const res = await fetch("/api/production/pack-to-rack", {
              method: "POST",
              headers: { "Content-Type": "application/json", ...getAuthHeaders() },
              body: JSON.stringify({
                serialNumbers: moveSerials,
                itemIds: moveIds,
                rackNo: activeTargetRack,
                shift,
                operator: effectiveOperator,
                advanceAll: true,
                packPartners: true,
                sentToFinished: false,
              }),
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw new Error(err.error || err.message || "Failed to move unit to rack");
            }
            scannerAudio.playSuccess();
            toast.success(
              `Moved POS ${matchedRackedRow.posNo} to ${activeTargetRack}.`
            );
            setViewTab("on_rack");
            onRefresh();
          } catch (err: any) {
            scannerAudio.playError();
            toast.error(err.message || "Error moving unit to rack");
          } finally {
            setLoading(false);
          }
          return;
        }

        // Already on the selected target rack
        scannerAudio.playSuccess();
        toast.info(
          `POS ${matchedRackedRow.posNo} is already on ${selectedRack}. Click "Send to History" when ready to empty the rack.`,
          { duration: 3000 }
        );
        return;
      }

      // Check if it was already sent to Finished or dispatched
      const alreadyFinished = allHistoryUnitRows.find(doesRowMatchCode);
      if (alreadyFinished) {
        scannerAudio.playSuccess();
        toast.info(
          `POS ${alreadyFinished.posNo} was already sent to Packing History & Finished Glass (${alreadyFinished.rackNo}${alreadyFinished.rackSlot ? ` - ${alreadyFinished.rackSlot}` : ""}).`
        );
        return;
      } else {
        scannerAudio.playError();
        toast.error(`Barcode "${clean}" not recognized in Pending queue or on any active rack.`);
      }
    } finally {
      clearTimeout(safetyUnlockTimer);
      isDirectScanningRef.current = false;
    }
  },
  [
    selectedRack,
    pendingUnitRows,
    pendingRackItems,
    items,
    unitRows,
    historyUnitRows,
    allHistoryUnitRows,
    rackSlot,
    rackSlots,
    type,
    activeTargetRack,
    shift,
    effectiveOperator,
    getAuthHeaders,
    onRefresh,
    handleAssignRowsToRack,
    handleSelectRackLetter,
    handleSetRackSlot,
    buildUnitRowsFromItems,
  ]
);

useBarcodeScanner({
  onScan: (barcode) => {
    handleDirectScan(barcode);
  },
  enabled: true,
  priority: 10,
  ignoreWhenInputFocused: false,
  maxIntervalMs: 350,
  duplicateCooldownMs: 1200,
});

return (
  <div className="space-y-4 font-sans">
    {/* ── Top Header Bar ── */}
    <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-3">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-white shadow-md ${type === "IGU"
                ? "bg-gradient-to-br from-teal-500 via-teal-600 to-emerald-700"
                : "bg-gradient-to-br from-amber-500 via-amber-600 to-orange-700"
              }`}
          >
            {type === "IGU" ? <Boxes className="w-6 h-6" /> : <Layers className="w-6 h-6" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {type === "IGU" ? "IGU PACKING LIST" : "AUTO CLAVE PACKING LIST"}
              </h1>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Physical rack assignments, customer batch manifests, and finished glass transfer.
            </p>
          </div>
        </div>

        {/* Action Buttons: Print Rack Dropdown, Print Slip, Refresh */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Rack Selector Dropdown to choose which rack to print */}
          <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-300 rounded-xl px-2.5 py-1 shadow-2xs">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap">
              PRINT RACK:
            </span>
            <select
              value={rackLetter}
              onChange={(e) => {
                handleSelectRackLetter(e.target.value as RackLetterType);
                e.currentTarget.blur();
              }}
              className="bg-transparent text-xs font-black text-slate-800 focus:outline-none cursor-pointer py-0.5"
              title="Choose which rack to print"
            >
              {RACK_OPTIONS.map((rk) => {
                const count = unitRows.filter((r) => r.rackNo === rk).length;
                return (
                  <option key={rk} value={rk}>
                    {rk} ({count} {count === 1 ? "unit" : "units"})
                  </option>
                );
              })}
            </select>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => setRackBarcodeModalOpen(true)}
            className="bg-white hover:bg-indigo-50/60 text-indigo-950 border-indigo-200 font-bold text-xs h-9 px-3 gap-1.5 rounded-xl shadow-2xs cursor-pointer"
            title="Print physical wall barcodes for Racks A, B, C, D, E"
          >
            <Barcode className="w-4 h-4 text-indigo-600" />
            <span>Wall Barcodes (A-E)</span>
          </Button>

          <Button
            type="button"
            onClick={handlePrint}
            disabled={displayedRows.length === 0 || viewTab === "pending"}
            className="bg-slate-900 hover:bg-slate-800 text-white font-black text-xs h-9 px-4 gap-2 rounded-xl shadow-xs cursor-pointer"
            title="Print physical A4 packing list slip for this rack"
          >
            <Printer className="w-4 h-4 text-emerald-400" />
            <span>Print Packing List</span>
          </Button>

          {/* Single Unified Send to History Button (One Place in Top Bar) */}
          {viewTab === "on_rack" && (
            <Button
              type="button"
              onClick={
                selectedManifestIds.size > 0
                  ? handleSendSelectedToHistory
                  : handleSendRackToHistory
              }
              disabled={
                loading ||
                (selectedManifestIds.size > 0
                  ? false
                  : unitRows.filter((r) => r.rackNo === selectedRack).length === 0)
              }
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs h-9 px-3.5 gap-2 rounded-xl shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title={
                selectedManifestIds.size > 0
                  ? `Send ${selectedManifestIds.size} selected unit(s) to Packing History & Finished Glass`
                  : `Send all units on ${selectedRack} to Packing History & Finished Glass (empties the rack)`
              }
            >
              <Send className="w-4 h-4" />
              <span>
                {selectedManifestIds.size > 0
                  ? `Send Selected (${selectedManifestIds.size}) to History`
                  : `Send ${selectedRack} to History (${unitRows.filter((r) => r.rackNo === selectedRack).length})`}
              </span>
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={onRefresh}
            className="h-9 px-3 text-xs font-bold rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
            title="Refresh packing data"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Secondary Controls: Target Rack & Slot Number Selector, Active Badge, Date ── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pt-3 border-t border-slate-100">
        {/* Target Rack & Slot Number Selector */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5 bg-slate-100/90 p-1.5 rounded-xl border border-slate-200 shrink-0 shadow-2xs">
            <span className="text-[11px] font-black text-slate-600 uppercase px-1.5 flex items-center gap-1.5 tracking-wider">
              <Boxes className={`w-4 h-4 ${type === "IGU" ? "text-teal-600" : "text-amber-600"}`} />
              <span>TARGET RACK:</span>
            </span>
            {/* Side-by-side Rack Pills with Entered Rack Number & Unit Count */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {RACK_OPTIONS.map((rk) => {
                const isSel = rackLetter === rk;
                const count = unitRows.filter((r) => r.rackNo === rk).length;
                const slot = rackSlots[rk] || "";
                return (
                  <button
                    key={rk}
                    type="button"
                    onClick={() => {
                      handleSelectRackLetter(rk);
                      if (viewTab === "pending") {
                        // Keep current view or allow switching seamlessly
                      }
                    }}
                    className={`h-8 px-2.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 border shadow-2xs ${
                      isSel
                        ? type === "IGU"
                          ? "bg-teal-600 text-white border-teal-700 shadow-xs ring-2 ring-teal-300/50"
                          : "bg-amber-600 text-white border-amber-700 shadow-xs ring-2 ring-amber-300/50"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                    }`}
                    title={`Select ${rk} (Rack No: ${slot || "none"}, ${count} ${count === 1 ? "unit" : "units"})`}
                  >
                    <span>{rk}</span>
                    {slot && (
                      <span
                        className={`px-1 py-0.2 rounded text-[10px] font-mono font-bold tracking-tight ${
                          isSel
                            ? "bg-white/25 text-white"
                            : "bg-slate-100 text-slate-600 border border-slate-200/80"
                        }`}
                        title={`Rack Number: #${slot}`}
                      >
                        #{slot}
                      </span>
                    )}
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                        isSel
                          ? "bg-white/20 text-white"
                          : count > 0
                          ? "bg-emerald-100 text-emerald-800 font-bold border border-emerald-200"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
            <span className="text-slate-300 mx-1">|</span>
            {/* Operator Manually Enters Rack Number Here */}
            <span className="text-[11px] font-black text-slate-600 uppercase px-0.5 tracking-wider">
              NO:
            </span>
            <div
              className={`flex items-center gap-1 bg-white border rounded-lg px-2 py-0.5 shadow-inner transition-colors ${
                !rackSlot.trim()
                  ? "border-amber-400 ring-2 ring-amber-200/60 bg-amber-50/30"
                  : "border-slate-300"
              }`}
            >
              <input
                ref={rackSlotInputRef}
                type="text"
                value={rackSlot}
                onChange={(e) => handleSetRackSlot(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                maxLength={20}
                placeholder="e.g. 25"
                className="min-w-[56px] max-w-[140px] w-24 h-6 text-xs font-mono font-black text-center focus:outline-none text-slate-900 bg-transparent px-1"
                title="Manually enter rack number (e.g. 1, 2, 25, 50)"
              />
              <div className="flex flex-col -space-y-0.5">
                <button
                  type="button"
                  onClick={() => handleIncrementRackSlot(1)}
                  className="text-[9px] text-slate-500 hover:text-slate-900 leading-none cursor-pointer p-0.5"
                  title="Increment rack number (+1)"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => handleIncrementRackSlot(-1)}
                  className="text-[9px] text-slate-500 hover:text-slate-900 leading-none cursor-pointer p-0.5"
                  title="Decrement rack number (-1)"
                >
                  ▼
                </button>
              </div>
              {rackSlot && (
                <button
                  type="button"
                  onClick={() => handleSetRackSlot("")}
                  className="text-slate-400 hover:text-rose-600 text-xs ml-0.5 cursor-pointer font-bold px-0.5"
                  title="Clear rack number"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Active Target Indicator Badge - Clickable to open Rack Manifest & Details */}
          <button
            type="button"
            onClick={() => setRackDetailsModalOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-black shadow-2xs transition-all cursor-pointer hover:shadow-xs ${
              type === "IGU"
                ? "bg-teal-50 hover:bg-teal-100/70 border-teal-200 text-teal-900"
                : "bg-amber-50 hover:bg-amber-100/70 border-amber-200 text-amber-900"
            }`}
            title="Click to inspect all stickers & units on this rack"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Target:</span>
            <span className="font-mono text-xs font-black underline decoration-2">{activeTargetRack}</span>
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700 ml-1">
              Wall: {formatRackBarcode(rackLetter)}
            </span>
          </button>

          {/* Fixed Wall Barcode Button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRackBarcodeModalOpen(true)}
            className="h-8 px-2.5 rounded-xl text-xs font-black border-indigo-200 bg-indigo-50/50 text-indigo-900 hover:bg-indigo-100 hover:border-indigo-300 gap-1.5 shadow-2xs cursor-pointer"
            title={`Print physical wall barcode posters for Racks A, B, C, D, E`}
          >
            <Barcode className="w-3.5 h-3.5 text-indigo-600" />
            <span>Wall Barcodes (A-E)</span>
          </Button>

          {/* Quick Rack Details Inspector */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setRackDetailsModalOpen(true)}
            className="h-8 px-2.5 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 gap-1 cursor-pointer"
            title="Inspect all stickers on this rack"
          >
            <Eye className="w-3.5 h-3.5 text-slate-500" />
            <span>Rack Details</span>
          </Button>
        </div>

        {/* Date & Interactive Shift Selector */}
        <div className="flex items-center justify-end gap-2 flex-wrap">
          {/* Interactive Shift Selector Buttons */}
          <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200 text-xs font-bold shadow-2xs">
            <span className="text-[10px] font-black text-slate-500 uppercase px-1.5 flex items-center gap-1 tracking-wider">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>SHIFT:</span>
            </span>
            {(["Day", "Night"] as const).map((s) => {
              const isSel = shift === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSelectShift(s)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${isSel ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
                    }`}
                >
                  {s}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>{todayDubaiFormatted}</span>
          </div>
        </div>
      </div>
      {/* ── View Mode Tabs: Pending Rack / On Rack / Sent History ── */}
      <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-100">
        <button
          type="button"
          onClick={() => {
            setViewTab("pending");
            setSelectedManifestIds(new Set());
          }}
          className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 border ${
            viewTab === "pending"
              ? "bg-amber-600 text-white border-amber-700 shadow-xs"
              : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Pending Rack</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              viewTab === "pending" ? "bg-white/20 text-white" : "bg-amber-100 text-amber-800"
            }`}
          >
            {pendingUnitRows.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setViewTab("on_rack");
            setSelectedManifestIds(new Set());
          }}
          className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 border ${
            viewTab === "on_rack"
              ? type === "IGU"
                ? "bg-teal-600 text-white border-teal-700 shadow-xs"
                : "bg-amber-600 text-white border-amber-700 shadow-xs"
              : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
          }`}
        >
          <Boxes className="w-3.5 h-3.5" />
          <span>On Rack ({selectedRack})</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              viewTab === "on_rack" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
            }`}
          >
            {unitRows.filter((r) => r.rackNo === selectedRack).length}
          </span>
        </button>

        {/* View Mode 3: Packing Operations History (Date-wise) */}
        <button
          type="button"
          onClick={() => {
            setViewTab("history");
            setSelectedManifestIds(new Set());
          }}
          className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 border ${
            viewTab === "history"
              ? "bg-indigo-600 text-white border-indigo-700 shadow-xs"
              : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
          }`}
          title="Inspect complete date-wise packing and dispatch history"
        >
          <History className="w-3.5 h-3.5" />
          <span>Packing History</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              viewTab === "history" ? "bg-white/20 text-white" : "bg-indigo-100 text-indigo-800 font-bold"
            }`}
          >
            {allHistoryUnitRows.length}
          </span>
        </button>
      </div>
    </div>

    {/* ── View Tab Workspace: Active Workstation vs Packing History Module ── */}
    {viewTab !== "history" ? (
      <>
    {/* ── Search Bar & Client Filter Strip (matching DGU / Assembly Stage View) ── */}
    <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchTerm.trim()) {
                e.preventDefault();
                const codeToScan = searchTerm.trim();
                setSearchTerm("");
                handleDirectScan(codeToScan);
              }
            }}
            placeholder={`Search ${type === "IGU" ? "IGU Packing List" : "Auto Clave Packing List"} queue by Serial, Barcode, POS #, Spec, Order #...`}
            className="pl-9 pr-8 h-9 text-xs bg-slate-50/70 border-slate-200 rounded-xl focus:bg-white"
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
                setSelectedManifestIds(new Set());
                e.currentTarget.blur();
              }}
              className="bg-white text-slate-900 font-extrabold text-xs rounded-lg px-2.5 py-1 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer min-w-[130px] max-w-[240px] truncate"
              title="Filter by Client Name"
            >
              <option value="ALL">All Clients ({availableCustomers.length})</option>
              {availableCustomers.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.totalUnits} {c.totalUnits === 1 ? "unit" : "units"})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Export Excel Button (Header position) */}
        <Button
          type="button"
          size="sm"
          onClick={handleExportExcel}
          className="bg-gradient-to-r from-emerald-500 to-emerald-700 hover:bg-emerald-700 text-white font-extrabold text-xs h-9 px-3.5 gap-1.5 rounded-xl shadow-lg transition-all cursor-pointer shrink-0"
          title={`Export ${type === "IGU" ? "IGU Packing List" : "Auto Clave Packing List"} queue to Excel`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Export Excel</span>
        </Button>
      </div>

      {/* ── Summary Strip with Expand All / Collapse All ── */}
      <div
        className={`flex items-center justify-between flex-wrap gap-2 py-2 px-3 rounded-xl border text-xs ${type === "IGU" ? "bg-teal-50/50 border-teal-200/80" : "bg-amber-50/50 border-amber-200/80"
          }`}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`px-2.5 py-0.5 rounded-full font-black text-[11px] shadow-2xs ${type === "IGU" ? "bg-teal-600 text-white" : "bg-amber-600 text-white"
              }`}
          >
            {displayedRows.length} {type === "IGU" ? "DGU Units" : "Laminated Units"} on {selectedRack}
          </span>

          <span className="text-slate-600 font-semibold flex items-center gap-1">
            Total Area:{" "}
            <strong className="text-emerald-700 font-mono font-black text-sm">{totalSqm.toFixed(2)} m²</strong>
          </span>

          {groupedCustomerRows.length > 0 && (
            <div className="flex items-center gap-1.5 ml-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setAllCustomersExpanded(true)}
                className="h-6 px-2 text-[10px] font-extrabold border-slate-200 text-slate-700 hover:bg-white rounded-lg shadow-2xs cursor-pointer"
              >
                Expand All
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setAllCustomersExpanded(false)}
                className="h-6 px-2 text-[10px] font-extrabold border-slate-200 text-slate-700 hover:bg-white rounded-lg shadow-2xs cursor-pointer"
              >
                Collapse All
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="text-[11px] text-slate-500 font-mono">
            Total in {selectedRack} Manifest:{" "}
            <strong className={type === "IGU" ? "text-teal-700 font-bold" : "text-amber-700 font-bold"}>
              {displayedRows.length} {displayedRows.length === 1 ? "Unit" : "Units"}
            </strong>
          </div>
        </div>
      </div>
    </div>

    {/* ── Bulk Selection Action Strip ── */}
    {selectedManifestIds.size > 0 && (
      <div className="p-3 rounded-2xl flex items-center justify-between gap-3 flex-wrap border shadow-sm animate-in fade-in slide-in-from-top-1 bg-emerald-500/10 border-emerald-300">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full animate-pulse bg-emerald-600" />
          <span className="text-xs font-black text-slate-900">
            {selectedManifestIds.size} unit(s) selected on {selectedRack}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {viewTab === "pending" ? (
            <Button
              type="button"
              size="sm"
              disabled={loading}
              onClick={() => {
                const sel = displayedRows.filter((r) => selectedManifestIds.has(r.id));
                handleAssignRowsToRack(sel);
              }}
              className="bg-teal-600 hover:bg-teal-700 text-white font-black text-xs h-8 px-3.5 rounded-xl gap-1.5 shadow-xs cursor-pointer"
            >
              <Boxes className="w-3.5 h-3.5" />
              <span>Assign Selected ({selectedManifestIds.size}) to {activeTargetRack}</span>
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setSelectedManifestIds(new Set())}
              className="bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs h-7 px-3 rounded-lg border-slate-300 cursor-pointer shadow-2xs"
            >
              Clear Selection
            </Button>
          )}
        </div>
      </div>
    )}

    {/* ── Customer-Grouped Views (Matching DGU / Assembly Stage View) ── */}
    <div className="space-y-3">
      {groupedCustomerRows.length > 0 ? (
        groupedCustomerRows.map((customer) => {
          const isExpanded = isCustomerExpanded(customer.groupKey);

          return (
            <div
              key={customer.groupKey}
              className={`bg-white/80 backdrop-blur-xl border border-white/60 rounded-3xl shadow-[0_8px_30px_rgb(22,128,245,0.05)] hover:shadow-[0_12px_40px_rgb(22,128,245,0.1)] hover:border-[#1680f5]/30 transition-all duration-300 relative overflow-hidden group ${type === "IGU" ? "hover:border-teal-300" : "hover:border-amber-300"
                }`}
            >
              {/* Customer Summary Card Header (Click to Toggle) */}
              <div
                onClick={() => toggleCustomerExpanded(customer.groupKey)}
                className={`p-4 cursor-pointer select-none transition-colors ${type === "IGU"
                    ? "bg-gradient-to-r from-slate-50/70 via-white to-teal-50/20 hover:from-teal-50/30"
                    : "bg-gradient-to-r from-slate-50/70 via-white to-amber-50/20 hover:from-amber-50/30"
                  }`}
              >
                <div className="flex items-start md:items-center justify-between gap-4 flex-col md:flex-row">
                  {/* Left: Customer Info */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl text-white flex items-center justify-center font-black text-sm shrink-0 shadow-lg ${type === "IGU"
                          ? "bg-gradient-to-br from-teal-600 to-cyan-700"
                          : "bg-gradient-to-br from-amber-600 to-orange-700"
                        }`}
                    >
                      <Building2 className="w-5 h-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3
                          className="text-base font-extrabold text-rose-700 truncate flex items-center gap-1.5"
                          title={
                            customer.pdfFiles && customer.pdfFiles.length > 0
                              ? customer.pdfFiles.join(", ")
                              : customer.customerName
                          }
                        >
                          <FileText className="w-4 h-4 text-rose-500 shrink-0" />
                          <span className="truncate">
                            {customer.pdfFiles && customer.pdfFiles.length > 0
                              ? customer.pdfFiles.join(", ")
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
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black border ${cat === "DLGU"
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

                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border ${type === "IGU"
                              ? "bg-teal-100 text-teal-800 border-teal-300"
                              : "bg-amber-100 text-amber-800 border-amber-300"
                            }`}
                        >
                          <Sparkles className="w-3 h-3 text-teal-600" />
                          {customer.totalUnits} {customer.totalUnits === 1 ? "Unit" : "Units"} on {selectedRack}
                        </span>
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
                            <span className="text-rose-600 flex items-center gap-1">
                              <FileText className="w-3 h-3 text-rose-500" />
                              {customer.pdfFiles.length} {customer.pdfFiles.length === 1 ? "PDF" : "PDFs"}
                            </span>
                            <span className="text-slate-300">•</span>
                          </>
                        )}
                        <span className={type === "IGU" ? "text-teal-700 font-bold" : "text-amber-700 font-bold"}>
                          {customer.totalUnits} {customer.totalUnits === 1 ? "Unit" : "Units"}
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-emerald-700 font-bold">{customer.totalSqm.toFixed(2)} m²</span>
                      </div>
                    </div>

                    <div className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-transform">
                      <ChevronDown
                        className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Expanded Table Content */}
              {isExpanded && (
                <div className="border-t border-slate-100">
                  <TableHorizontalScrollWrapper>
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100/80 text-[10px] font-extrabold text-[#1680f5] uppercase tracking-widest bg-gradient-to-r from-blue-50/80 to-transparent">
                          {/* Checkbox */}
                          <th className="py-2.5 px-3 w-8 text-center whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={customer.isAllSelected}
                              ref={(el) => {
                                if (el) el.indeterminate = false;
                              }}
                              onChange={() => handleToggleCustomerGroupSelect(customer.allRowIds)}
                              className="w-[18px] h-[18px] rounded-md border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                              title="Select all in this customer group"
                            />
                          </th>
                          <th className="py-2.5 px-2 text-center whitespace-nowrap">PI</th>
                          <th className="py-2.5 px-2 text-center whitespace-nowrap">Batch</th>
                          <th className="py-2.5 px-2 text-center whitespace-nowrap">OB</th>
                          <th className="py-2.5 px-2 text-center whitespace-nowrap">SFO</th>
                          <th className="py-2.5 px-2 text-center whitespace-nowrap">Pos</th>
                          <th className="py-2.5 px-2 whitespace-nowrap">
                            {type === "IGU" ? "Outer Panel Barcode" : "Barcode"}
                          </th>
                          <th className="py-2.5 px-2 text-center whitespace-nowrap">QTY (Units)</th>
                          <th className="py-2.5 px-2 text-right whitespace-nowrap">SQM</th>
                          <th className="py-2.5 px-2 whitespace-nowrap">Size (W × H)</th>
                          <th className="py-2.5 px-2">
                            {type === "IGU" ? "Outer Panel Glass Spec" : "Glass Specification"}
                          </th>
                          <th className="py-2.5 px-2 whitespace-nowrap">Finish</th>
                          <th className="py-2.5 px-2 whitespace-nowrap">Route Flow</th>
                          <th className="py-2.5 px-2 text-center whitespace-nowrap">Rack</th>
                          <th className="py-2.5 px-2 text-center whitespace-nowrap">Status</th>
                          <th className="py-2.5 px-3 text-right whitespace-nowrap">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {customer.rows.map((row) => {
                          const isSelected = selectedManifestIds.has(row.id);
                          const item = row.primaryItem;
                          const partner = row.partnerItem;
                          const barcode = row.displayBarcode || resolveValidBarcode(item);

                          return (
                            <tr
                              key={row.id}
                              className={`hover:bg-teal-50/50 hover:shadow-inner transition-all duration-200 ${isSelected ? "bg-teal-50/60" : ""
                                }`}
                            >
                              {/* Checkbox */}
                              <td className="py-2.5 px-3 text-center align-middle whitespace-nowrap">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleSelectManifest(row.id)}
                                  className="w-3.5 h-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                                />
                              </td>

                              {/* PI Number */}
                              <td className="py-2.5 px-2 text-center align-middle whitespace-nowrap font-mono">
                                <span className="inline-flex items-center justify-center px-2 py-0.5 rounded font-mono font-bold text-xs bg-blue-50/50 text-[#1680f5] border border-blue-200 shadow-2xs">
                                  {row.piNumber || item.orderNo || item.piNumber || "—"}
                                </span>
                              </td>

                              {/* Batch Number */}
                              <td className="py-2.5 px-2 text-center align-middle whitespace-nowrap font-mono">
                                <span className="inline-flex items-center justify-center px-2 py-0.5 rounded font-mono font-bold text-xs bg-slate-100 text-slate-800 border border-slate-300 shadow-2xs">
                                  {row.batchNo || item.batchNo || item.sfoNo || "—"}
                                </span>
                              </td>

                              {/* OB Number */}
                              <td className="py-2.5 px-2 text-center align-middle whitespace-nowrap font-mono">
                                <span className="inline-flex items-center justify-center px-2 py-0.5 rounded font-mono font-bold text-xs bg-amber-50/70 text-amber-800 border border-amber-200 shadow-2xs">
                                  {row.obNo || item.obNo || "—"}
                                </span>
                              </td>

                              {/* SFO Number */}
                              <td className="py-2.5 px-2 text-center align-middle whitespace-nowrap font-mono">
                                <span className="inline-flex items-center justify-center px-2 py-0.5 rounded font-mono font-bold text-xs bg-cyan-50/70 text-cyan-800 border border-cyan-200 shadow-2xs">
                                  {row.sfoNo || item.sfoNo || "—"}
                                </span>
                              </td>

                              {/* Position Number */}
                              <td className="py-2.5 px-2 text-center align-middle whitespace-nowrap font-mono">
                                <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg font-mono font-extrabold text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs min-w-[32px]">
                                  {row.posNo || item.posNo || "—"}
                                </span>
                                {row.totalPieces && row.totalPieces > 1 && (
                                  <div className="text-[10px] font-bold text-slate-500 font-mono mt-0.5">
                                    Piece {row.pieceIndex} of {row.totalPieces}
                                  </div>
                                )}
                              </td>

                              {/* Barcode */}
                              <td className="py-2.5 px-2 font-mono text-slate-600 align-middle text-[11px] whitespace-nowrap">
                                <div className="font-bold text-slate-900">{barcode}</div>
                                {type === "IGU" && (
                                  <span className="text-[9.5px] text-[#1680f5] block font-mono font-bold">
                                    Scan Target (Colour)
                                  </span>
                                )}
                              </td>

                              {/* QTY */}
                              <td className="py-2.5 px-2 text-center align-middle whitespace-nowrap">
                                <span className="px-2 py-0.5 rounded-lg font-mono font-black text-xs bg-slate-100 text-slate-900 border border-slate-200 shadow-2xs">
                                  {row.qty} {row.qty === 1 ? "unit" : "units"}
                                </span>
                              </td>

                              {/* SQM */}
                              <td className="py-2.5 px-2 text-right font-mono font-bold text-emerald-700 align-middle whitespace-nowrap text-xs">
                                {row.sqm.toFixed(2)} m²
                              </td>

                              {/* Size */}
                              <td className="py-2.5 px-2 font-bold text-slate-900 align-middle whitespace-nowrap">
                                {row.width} × {row.height} mm
                              </td>

                              {/* Glass Specification */}
                              <td className="py-2.5 px-2 text-slate-700 font-medium align-middle max-w-[280px]">
                                <div className="truncate font-bold text-slate-900">
                                  {row.makeup || item.glassType || item.itemCode || "Standard Glass Unit"}
                                </div>
                                {row.glassCategory === "DLGU" ? (
                                  <>
                                    <div className="text-[10px] text-blue-800 font-extrabold flex items-center gap-1 mt-0.5">
                                      <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200 font-bold">
                                        DLGU Unit • Double Laminated IGU
                                      </span>
                                    </div>
                                    {partner && (
                                      <div className="text-[10px] text-purple-900 font-semibold flex items-center gap-1 mt-0.5">
                                        <span>
                                          Inner Lite: {partner.barcode || `POS ${partner.posNo || "—"}`} (
                                          {partner.glassType || "Laminated Clear"})
                                        </span>
                                      </div>
                                    )}
                                  </>
                                ) : row.glassCategory === "DGU" || type === "IGU" ? (
                                  <>
                                    <div className="text-[10px] text-teal-800 font-extrabold flex items-center gap-1 mt-0.5">
                                      <span className="px-1.5 py-0.5 rounded bg-teal-100 text-teal-800 border border-teal-200 font-bold">
                                        Standard DGU / IGU Unit
                                      </span>
                                    </div>
                                    {partner && (
                                      <div className="text-[10px] text-teal-900 font-semibold flex items-center gap-1 mt-0.5">
                                        <span>
                                          Inner Lite: {partner.barcode || `POS ${partner.posNo || "—"}`} (
                                          {partner.glassType || "Clear Float"})
                                        </span>
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <div className="text-[10px] text-amber-800 font-semibold flex items-center gap-1 mt-0.5">
                                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 font-bold">
                                      Laminated Glass Unit
                                    </span>
                                  </div>
                                )}
                              </td>

                              {/* Finish */}
                              <td className="py-2.5 px-2 align-middle whitespace-nowrap">
                                {row.glassCategory === "DLGU" ? (
                                  <span className="px-2 py-0.5 rounded text-[9.5px] font-black bg-blue-100 text-blue-800 border border-blue-200">
                                    DLGU Unit
                                  </span>
                                ) : type === "IGU" ? (
                                  <span className="px-2 py-0.5 rounded text-[9.5px] font-black bg-teal-100 text-teal-800 border border-teal-200">
                                    DGU Unit
                                  </span>
                                ) : (
                                  <span
                                    className={`px-1.5 py-0.2 rounded text-[9.5px] font-black border ${getItemFinish(item) === "Colour"
                                        ? "bg-blue-100 text-blue-800 border-blue-200"
                                        : "bg-cyan-100 text-cyan-800 border-cyan-200"
                                      }`}
                                  >
                                    {getItemFinish(item)}
                                  </span>
                                )}
                              </td>

                              {/* Route Flow */}
                              <td className="py-2.5 px-2 align-middle whitespace-nowrap">
                                <div className="flex items-center gap-1">
                                  {(
                                    item.processRoute || [
                                      "Cutting",
                                      "Pairing",
                                      type === "IGU" ? "DGU" : "Lamination",
                                      "Finished",
                                    ]
                                  ).map((s, sIdx, arr) => {
                                    const isCurrent = s === item.currentStage;
                                    const isDone =
                                      item.completedStages?.includes(s) ||
                                      s === "Cutting" ||
                                      s === "Pairing" ||
                                      (type === "IGU" && s === "DGU") ||
                                      (type === "LAMI" && s === "Lamination");
                                    return (
                                      <React.Fragment key={s}>
                                        <span
                                          className={`px-1.5 py-0.2 rounded font-mono text-[9px] font-bold ${isCurrent
                                              ? type === "IGU"
                                                ? "bg-gradient-to-r from-teal-500 to-teal-700 text-white"
                                                : "bg-gradient-to-r from-amber-500 to-amber-700 text-white"
                                              : isDone
                                                ? "bg-emerald-100 text-emerald-700"
                                                : "bg-slate-100 text-slate-400"
                                            }`}
                                        >
                                          {s}
                                        </span>
                                        {sIdx < arr.length - 1 && (
                                          <ArrowRight className="w-2.5 h-2.5 text-slate-300 shrink-0" />
                                        )}
                                      </React.Fragment>
                                    );
                                  })}
                                </div>
                              </td>

                              {/* Physical Rack */}
                              <td className="py-2.5 px-2 text-center align-middle whitespace-nowrap">
                                {viewTab === "pending" ? (
                                  <span className="px-2.5 py-0.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 font-mono font-bold text-xs inline-flex items-center justify-center gap-1 shadow-2xs">
                                    <Clock className="w-3 h-3 text-amber-600" />
                                    <span>Unassigned</span>
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-0.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 font-mono font-black text-xs inline-flex items-center justify-center gap-1 shadow-2xs">
                                    <Boxes className="w-3 h-3 text-teal-600" />
                                    <span>{row.rackNo}{row.rackSlot ? ` (#${row.rackSlot})` : ""}</span>
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-2 text-center align-middle whitespace-nowrap">
                                {viewTab === "pending" ? (
                                  <span className="px-2.5 py-0.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-800 font-bold text-[11px] inline-flex items-center gap-1 shadow-2xs">
                                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                                    <span>Pending Rack</span>
                                  </span>
                                ) : row.isDispatched ? (
                                  <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 font-bold text-[11px] inline-flex items-center gap-1 shadow-2xs">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
                                    <span>Dispatched</span>
                                  </span>
                                ) : row.sentToFinished ? (
                                  <span className="px-2.5 py-0.5 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 font-bold text-[11px] inline-flex items-center gap-1 shadow-2xs">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>On Rack • In Finished</span>
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-0.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 font-bold text-[11px] inline-flex items-center gap-1 shadow-2xs">
                                    <Boxes className="w-3.5 h-3.5 text-teal-600" />
                                    <span>On Rack</span>
                                  </span>
                                )}
                              </td>

                              {/* Actions */}
                              <td className="py-2.5 px-3 text-right align-middle whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1.5">
                                  {viewTab === "pending" ? (
                                    <button
                                      type="button"
                                      disabled={loading}
                                      onClick={() => handleAssignRowsToRack([row])}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-black shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                                      title={`Assign to ${activeTargetRack}`}
                                    >
                                      <Boxes className="w-3 h-3" />
                                      <span>Assign to {activeTargetRack}</span>
                                    </button>
                                  ) : row.sentToFinished ? (
                                    <span className="text-emerald-700 font-black text-xs inline-flex items-center gap-1">
                                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                                      <span>Sent</span>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={loading}
                                      onClick={() => handleSendUnitsToFinished([row])}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                                      title="Send unit from rack into Finished Glass stage"
                                    >
                                      <Send className="w-3 h-3" />
                                      <span>Send to History</span>
                                    </button>
                                  )}

                                  {/* Barcode Sticker Print Button */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenSticker(item);
                                    }}
                                    className="w-7 h-7 rounded-full border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400 flex items-center justify-center transition-all shadow-2xs shrink-0 cursor-pointer"
                                    title="Print Barcode / QR Sticker"
                                  >
                                    <Tag className="w-3.5 h-3.5 text-slate-700" />
                                  </button>

                                  {/* Reject Button */}
                                  {onReject && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onReject({
                                          ...item,
                                          partnerItem: row.partnerItem,
                                          allSerials: row.allSerials,
                                          isDguPair: Boolean(row.partnerItem),
                                          glassCategory: row.glassCategory,
                                        } as any);
                                      }}
                                      className="w-7 h-7 rounded-full border border-red-300 bg-white text-red-600 hover:bg-red-50 hover:border-red-400 flex items-center justify-center transition-all shadow-2xs shrink-0 cursor-pointer"
                                      title="Reject Item / Report Defect"
                                    >
                                      <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                                    </button>
                                  )}

                                  {/* Rework Button */}
                                  {onRework && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onRework({
                                          ...item,
                                          partnerItem: row.partnerItem,
                                          allSerials: row.allSerials,
                                          isDguPair: Boolean(row.partnerItem),
                                          glassCategory: row.glassCategory,
                                        } as any);
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
                        })}
                      </tbody>
                    </table>
                  </TableHorizontalScrollWrapper>
                </div>
              )}
            </div>
          );
        })
      ) : (
        <div className="text-center py-12 px-4 bg-white rounded-3xl border-2 border-dashed border-slate-200 max-w-xl mx-auto my-6 space-y-4 shadow-sm">
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto shadow-2xs ${type === "IGU" ? "bg-teal-50 text-teal-600" : "bg-amber-50 text-amber-600"
              }`}
          >
            <Boxes className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h4 className="font-black text-slate-800 text-base">
              {`No units on ${selectedRack}${selectedPrintSlot !== "ALL" ? ` (Rack ${selectedPrintSlot})` : ""}`}
            </h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {searchTerm || selectedCustomerFilter !== "ALL"
                ? "No items match your active search or client filter. Try clearing the filter."
                : `Units scanned or manually sent from ${type === "IGU" ? "DGU Assembly" : "Lamination Line"} will appear directly on their allocated rack here. You can also scan a sticker barcode above to move units onto ${selectedRack}.`}
            </p>
          </div>
          {(searchTerm || selectedCustomerFilter !== "ALL") && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setSearchTerm("");
                setSelectedCustomerFilter("ALL");
              }}
              className="text-xs font-bold"
            >
              Clear Filters
            </Button>
          )}
        </div>
      )}
    </div>
    </>
    ) : (
      /* ── Dedicated Packing Operations History Module with Date-wise Filtering ── */
      <PackingHistoryModule
        type={type}
        rows={allHistoryUnitRows}
        onOpenSticker={handleOpenSticker}
        onRefresh={onRefresh}
      />
    )}

    {/* ─────────────────────────────────────────────────────────────────────────────
         PRINTABLE PACKING LIST (A4 Strictly matching user's requirements)
         Suppressed when printing rack wall barcodes
         ───────────────────────────────────────────────────────────────────────────── */}
    {!rackBarcodeModalOpen && (
      <div id="printable-packing-list" className="hidden print:block bg-white text-black p-6 font-sans">
        {/* Printable Header */}
        <div className="flex items-start justify-between border-b-2 border-black pb-4 mb-4">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight">
              {type === "IGU" ? "IGU PACKING LIST" : "AUTO CLAVE PACKING LIST"}
            </h1>
            <div className="text-xs font-bold uppercase tracking-wide text-gray-700 mt-0.5">
              SEJAL GLASS MANUFACTURING PRODUCTS LLC
            </div>
          </div>

          <div className="text-right text-xs space-y-1.5">
            <div>
              <span className="font-bold">DATE:</span>{" "}
              <span className="font-mono font-bold">{todayDubaiFormatted}</span>
              <span className="font-bold ml-3">TIME:</span>{" "}
              <span className="font-mono font-bold">{nowDubaiTime}</span>
              <span className="font-bold ml-3">SHIFT:</span>{" "}
              <span className="font-mono font-bold">{shift}</span>
            </div>
            <div className="flex items-center justify-end gap-3">
              <div>
                <span className="font-bold">RACK NO:</span>{" "}
                <span className="font-mono font-black text-sm border-2 border-black px-2.5 py-0.5 ml-1">
                  {printedRackDisplay}
                </span>
              </div>
              {/* Scannable Rack Barcode SVG on Printed Slip */}
              <div
                className="w-36 flex justify-end"
                dangerouslySetInnerHTML={{
                  __html: generateBarcodeSVG(formatRackBarcode(rackLetter, selectedPrintSlot !== "ALL" ? selectedPrintSlot : rackSlot), 34, 1.4),
                }}
              />
            </div>
          </div>
        </div>

        {/* Printable Table matching sketch */}
        <table className="w-full border-collapse border border-black text-xs my-3">
          <thead>
            <tr className="bg-gray-100 border-b border-black text-[10px] font-black uppercase">
              <th className="border border-black py-2 px-1 text-center w-10">SNO</th>
              <th className="border border-black py-2 px-2 text-left">CUSTOMER NAME</th>
              <th className="border border-black py-2 px-1.5 text-center w-20">PI NO</th>
              <th className="border border-black py-2 px-1.5 text-center w-20">BATCH NO</th>
              <th className="border border-black py-2 px-1.5 text-center w-20">OB NO</th>
              <th className="border border-black py-2 px-1.5 text-center w-20">SFO NO</th>
              <th className="border border-black py-2 px-1.5 text-center w-16">POS NO</th>
              <th className="border border-black py-2 px-1.5 text-right w-16">WIDTH</th>
              <th className="border border-black py-2 px-1.5 text-right w-16">HEIGHT</th>
              <th className="border border-black py-2 px-1.5 text-center w-14">QTY</th>
            </tr>
          </thead>
          <tbody>
            {displayedRows.map((row, idx) => (
              <tr key={row.id} className="border-b border-gray-300">
                <td className="border border-black py-1.5 px-1 text-center font-mono font-bold">{idx + 1}</td>
                <td className="border border-black py-1.5 px-2 font-bold truncate max-w-xs">{row.customerName}</td>
                <td className="border border-black py-1.5 px-1.5 text-center font-mono font-bold">{row.piNumber || "—"}</td>
                <td className="border border-black py-1.5 px-1.5 text-center font-mono font-bold">{row.batchNo || "—"}</td>
                <td className="border border-black py-1.5 px-1.5 text-center font-mono font-bold">{row.obNo || "—"}</td>
                <td className="border border-black py-1.5 px-1.5 text-center font-mono font-bold">{row.sfoNo || "—"}</td>
                <td className="border border-black py-1.5 px-1.5 text-center font-mono font-bold">{row.posNo}</td>
                <td className="border border-black py-1.5 px-1.5 text-right font-mono">{row.width}</td>
                <td className="border border-black py-1.5 px-1.5 text-right font-mono">{row.height}</td>
                <td className="border border-black py-1.5 px-1.5 text-center font-mono font-black">{row.qty}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black font-black text-xs bg-gray-50">
              <td colSpan={9} className="border border-black py-2 px-3 text-right uppercase">
                TOTAL QTY:
              </td>
              <td className="border border-black py-2 px-1.5 text-center font-mono font-black text-sm">
                {totalQty}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Printable Footer with empty line for physical pen signature and Total Area */}
        <div className="mt-8 pt-4 border-t border-black flex items-end justify-between">
          <div className="text-xs text-gray-800 font-bold font-mono">
            Total Area: {totalSqm.toFixed(2)} m²
          </div>

          {/* Operator Signature (Empty line for physical signature) */}
          <div className="text-right flex items-end justify-end">
            <span className="text-xs font-bold mr-2">Operator SIGN:</span>
            <span className="inline-block border-b-2 border-black w-56 pb-1"></span>
          </div>
        </div>
      </div>
    )}

    {/* ── Physical Rack Barcode Sticker Modal ── */}
    <RackBarcodeModal
      open={rackBarcodeModalOpen}
      onOpenChange={setRackBarcodeModalOpen}
      type={type}
      currentRack={rackLetter}
      currentSlot={rackSlot}
      rackSlots={rackSlots}
      rackCounts={rackCounts}
      onSelectRack={(rk, sl) => {
        handleSelectRackLetter(rk);
        if (sl) handleSetRackSlot(sl);
      }}
    />

    {/* ── Rack Details & Sticker Manifest Modal ── */}
    <RackDetailsModal
      open={rackDetailsModalOpen}
      onOpenChange={setRackDetailsModalOpen}
      type={type}
      rackLetter={rackLetter}
      rackSlot={rackSlot}
      shift={shift}
      rows={unitRows}
      onOpenSticker={handleOpenSticker}
      onOpenRackBarcodeModal={() => {
        setRackDetailsModalOpen(false);
        setRackBarcodeModalOpen(true);
      }}
      onPrintPackingList={handlePrint}
      onSendUnitsToFinished={handleSendUnitsToFinished}
      loading={loading}
    />

    {/* ── Physical Barcode Sticker Modal ── */}
    <BarcodeStickerModal
      open={stickerModalOpen}
      onOpenChange={setStickerModalOpen}
      item={stickerModalItem}
      pi={pis.find((p) => p.id === stickerModalItem?.piId || p.piNumber === stickerModalItem?.piNumber) || null}
    />
  </div>
);
};

export default PackingListView;
