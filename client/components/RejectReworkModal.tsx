import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertOctagon, RefreshCw, Factory } from "lucide-react";
import { GlassItem, ProductionStage } from "@shared/api";
import { toast } from "sonner";
import { getItemFinish, getGlassPaneRole, isDlguGlass, isDguGlass, isLaminatedGlass } from "@/lib/utils";

interface RejectReworkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "reject" | "rework";
  item: GlassItem | null;
  allItems?: GlassItem[];
  onSuccess: () => void;
}

export const DEFECT_ORIGIN_STATIONS = [
  "Transit / Delivery to Customer",
  "Finished Goods / Dispatch Warehouse",
  "Customer Site / Unloading Damage",
  "Tempering Furnace / Toughening",
  "Edging / CNC / Grinding / Drilling",
  "Cutting Table",
  "Pairing Buffer",
  "DGU Assembly Line",
  "Lamination Line / Autoclave",
  "Quality Control (QC Inspection)",
  "Material / Raw Glass Incoming",
];

const REJECT_REASONS = [
  "Transit / Delivery: Broken in Transit / Customer Delivery",
  "Dispatch / Handling: Broken during Stillage Loading / Transport",
  "Customer Site: Broken on Arrival / Unloading Damage",
  "Final Inspection / Dispatch Warehouse Defect",
  "Tempering: Furnace Breakage / Explosion",
  "Tempering: Roller Wave / Optical Distortion",
  "Tempering: White Haze / Surface Burn",
  "Tempering: Bow / Warp / Bend Defect",
  "Edging: Chipping / Edge Damage",
  "Edging: Grinding / Polishing Defect",
  "Edging: Hole / Cutout Misplacement",
  "Cutting: Wrong Size / Dimension Defect",
  "Cutting: Breakage / Running Crack",
  "Surface Scratch / Scuff Mark",
  "Bubbles / Inclusions / Stones",
  "Spacer Misalignment / Primary Seal Defect",
  "Lamination: Delamination / Interlayer Bubble",
  "Coating Peeling / Pinholes",
  "Sealant / Butyl Smear",
];

// Active processing stages available for rework target selection.
const REWORK_TARGET_STAGES: Exclude<ProductionStage, "Finished" | "Dispatched">[] = ["Cutting", "Polishing", "DGU", "Lamination"];

export const RejectReworkModal: React.FC<RejectReworkModalProps> = ({
  open,
  onOpenChange,
  mode,
  item,
  allItems = [],
  onSuccess,
}) => {
  const [defectStation, setDefectStation] = useState<string>("Transit / Delivery to Customer");
  const [reason, setReason] = useState(REJECT_REASONS[0]);
  const [customReason, setCustomReason] = useState("");
  const [targetStage, setTargetStage] = useState<ProductionStage>("Cutting");
  const [autoReworkEnabled, setAutoReworkEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState(false);
  const [selectedDefectivePane, setSelectedDefectivePane] = useState<string>("OP");

  if (!item) return null;

  const partnerItem = (item as any).partnerItem as GlassItem | undefined;
  const glassCat = (item as any).glassCategory || item.glassType || "";

  const isDlgu = Boolean(
    glassCat === "DLGU" ||
    (item as any).glassCategory === "DLGU" ||
    isDlguGlass(item) ||
    partnerItem?.glassCategory === "DLGU" ||
    /dlgu/i.test(item.category || "") ||
    /dlgu/i.test(item.glassType || "") ||
    (/laminated/i.test(item.glassType || "") && /dgu|dlgu/i.test(item.glassType || item.category || ""))
  );

  const isDgu = Boolean(
    !isDlgu &&
    (isDguGlass(item) ||
      item.glassCategory === "DGU" ||
      (item as any).glassCategory === "DGU" ||
      /dgu/i.test(item.category || "") ||
      item.processRoute?.includes("DGU"))
  );

  const isLam = Boolean(
    !isDlgu &&
    !isDgu &&
    (isLaminatedGlass(item) ||
      item.glassCategory === "Lamination" ||
      (item as any).glassCategory === "Lamination" ||
      /lamination/i.test(item.category || "") ||
      item.processRoute?.includes("Lamination"))
  );

  const isCompositeUnit = Boolean(
    isDlgu ||
    isDgu ||
    isLam ||
    partnerItem ||
    ((item as any).allSerials && (item as any).allSerials.length > 1) ||
    (item as any).isDguPair ||
    item.currentStage === "DGU" ||
    item.currentStage === "Lamination"
  );

  const isPairUnit = isCompositeUnit;

  // Sibling panes lookup — finds the other physical panes that belong to the SAME unit as `item`.
  // Priority: (1) shared dguPairId, (2) shared lamPairId, (3) positional fallback scoped to same stage.
  // Always excludes `item` itself and Rejected panes.
  const siblingPanes = React.useMemo(() => {
    if (!allItems || allItems.length === 0 || !item) return [];

    const dguPairId = (item as any).dguPairId;
    const lamPairId = (item as any).lamPairId;

    // 1. Tightest bond: shared dguPairId (all 3 panes of a DLGU unit share this after Phase-2 pairing)
    if (dguPairId) {
      const byDguPair = allItems.filter(
        (other) =>
          other.id !== item.id &&
          other.serialNumber !== item.serialNumber &&
          other.status !== "Rejected" &&
          (other as any).dguPairId === dguPairId
      );
      if (byDguPair.length > 0) return byDguPair;
    }

    // 2. lamPairId (links the 2 clear panes during Phase-1 / Lamination stage)
    if (lamPairId) {
      const byLamPair = allItems.filter(
        (other) =>
          other.id !== item.id &&
          other.serialNumber !== item.serialNumber &&
          other.status !== "Rejected" &&
          (other as any).lamPairId === lamPairId
      );
      if (byLamPair.length > 0) return byLamPair;
    }

    // 3. Positional fallback: same posNo + PI + dimensions + same currentStage (avoids picking a
    //    pane from a different unit at the same position that's at a different production stage).
    return allItems.filter(
      (other) =>
        other.id !== item.id &&
        other.serialNumber !== item.serialNumber &&
        other.status !== "Rejected" &&
        other.posNo === item.posNo &&
        other.currentStage === item.currentStage &&
        (other.piId === item.piId || other.piNumber === item.piNumber || other.sfoNo === item.sfoNo) &&
        Math.abs((other.width || 0) - (item.width || 0)) < 2 &&
        Math.abs((other.height || 0) - (item.height || 0)) < 2
    );
  }, [allItems, item]);

  // DLGU Panes (1 Colour OP + 2 Clear IP)
  const dlguPanes = React.useMemo(() => {
    if (!isDlgu) return { opItem: null, ip1Item: null, ip2Item: null, allSerials: [] };
    const colours = siblingPanes.filter((p) => getItemFinish(p) === "Colour");
    const clears = siblingPanes.filter((p) => getItemFinish(p) === "Clear");

    const op = getItemFinish(item) === "Colour" ? item : (colours[0] || partnerItem || null);
    
    let ip1: GlassItem | null = null;
    let ip2: GlassItem | null = null;

    if (getItemFinish(item) === "Clear") {
      ip1 = item;
      const otherClear = clears.find((c) => c.serialNumber !== item.serialNumber && c.id !== item.id) || clears[1];
      ip2 = otherClear || (partnerItem && partnerItem.serialNumber !== item.serialNumber ? partnerItem : null);
    } else {
      ip1 = clears[0] || (partnerItem && getItemFinish(partnerItem) === "Clear" ? partnerItem : null);
      ip2 = clears[1] || (clears[0] && clears.length > 1 ? clears[1] : null);
    }

    const serials = [op?.serialNumber, ip1?.serialNumber, ip2?.serialNumber].filter(Boolean) as string[];
    return { opItem: op, ip1Item: ip1, ip2Item: ip2, allSerials: serials };
  }, [isDlgu, siblingPanes, item, partnerItem]);

  // DGU Panes (1 Colour OP + 1 Clear IP)
  const dguPanes = React.useMemo(() => {
    if (!isDgu) return { opItem: null, ipItem: null, allSerials: [] };
    const colours = siblingPanes.filter((p) => getItemFinish(p) === "Colour");
    const clears = siblingPanes.filter((p) => getItemFinish(p) === "Clear");

    const op = getItemFinish(item) === "Colour" ? item : (colours[0] || partnerItem || null);
    const ip = getItemFinish(item) === "Clear" ? item : (clears[0] || partnerItem || null);
    const serials = [op?.serialNumber, ip?.serialNumber].filter(Boolean) as string[];
    return { opItem: op, ipItem: ip, allSerials: serials };
  }, [isDgu, siblingPanes, item, partnerItem]);

  // Lamination Panes (2 Clear Panes)
  const lamPanes = React.useMemo(() => {
    if (!isLam) return { ply1Item: null, ply2Item: null, allSerials: [] };
    const clears = siblingPanes;
    const ply1 = item;
    const ply2 = clears.find((c) => c.serialNumber !== item.serialNumber && c.id !== item.id) || partnerItem || null;
    const serials = [ply1?.serialNumber, ply2?.serialNumber].filter(Boolean) as string[];
    return { ply1Item: ply1, ply2Item: ply2, allSerials: serials };
  }, [isLam, siblingPanes, item, partnerItem]);

  const primaryRole = getGlassPaneRole(item);
  const primaryFinish = getItemFinish(item);
  const partnerRole = partnerItem ? getGlassPaneRole(partnerItem) : null;
  const partnerFinish = partnerItem ? getItemFinish(partnerItem) : null;

  const allSerials = React.useMemo(() => {
    if (isDlgu && dlguPanes.allSerials.length > 0) return dlguPanes.allSerials;
    if (isDgu && dguPanes.allSerials.length > 0) return dguPanes.allSerials;
    if (isLam && lamPanes.allSerials.length > 0) return lamPanes.allSerials;
    if ((item as any).allSerials && Array.isArray((item as any).allSerials)) return (item as any).allSerials;
    if (partnerItem) return [item.serialNumber, partnerItem.serialNumber];
    return [item.serialNumber];
  }, [isDlgu, isDgu, isLam, dlguPanes, dguPanes, lamPanes, item, partnerItem]);

  // Sync / Reset initial selection when modal opens or item changes
  React.useEffect(() => {
    if (open) {
      if (isDlgu) {
        if (getItemFinish(item) === "Clear") {
          setSelectedDefectivePane("IP_PLY1");
        } else {
          setSelectedDefectivePane("OP");
        }
      } else if (isDgu) {
        if (getItemFinish(item) === "Clear") {
          setSelectedDefectivePane("IP");
        } else {
          setSelectedDefectivePane("OP");
        }
      } else if (isLam) {
        setSelectedDefectivePane("IP_PLY1");
      } else if (isPairUnit) {
        setSelectedDefectivePane("PRIMARY");
      } else {
        setSelectedDefectivePane(primaryRole.code || "SINGLE");
      }

      // Smartly set default station based on item context
      if (item?.currentStage === "Finished" || item?.status === "Completed") {
        setDefectStation("Transit / Delivery to Customer");
        setReason("Transit / Delivery: Broken in Transit / Customer Delivery");
      } else if (item?.currentStage === "Polishing") {
        setDefectStation("Edging / CNC / Grinding / Drilling");
        setReason("Edging: Grinding / Polishing Defect");
      } else if (item?.currentStage === "DGU") {
        setDefectStation("DGU Assembly Line");
        setReason("Spacer Misalignment / Primary Seal Defect");
      } else if (item?.currentStage === "Lamination") {
        setDefectStation("Lamination Line / Autoclave");
        setReason("Lamination: Delamination / Interlayer Bubble");
      } else {
        setDefectStation("Tempering Furnace / Toughening");
        setReason("Tempering: Furnace Breakage / Explosion");
      }
      setCustomReason("");
    }
  }, [open, item?.id, item?.serialNumber, item?.currentStage, isDlgu, isDgu, isLam, isPairUnit]);

  // Dynamically resolve the active pane details based on current selection
  const activePaneInfo = React.useMemo(() => {
    if (!isPairUnit && !isDlgu && !isDgu && !isLam) {
      return {
        badgeText: `${primaryRole.code} • ${primaryRole.name}`,
        badgeClass: primaryRole.colorClass,
        finishText: `${primaryRole.code} • ${primaryFinish}`,
        finishClass: primaryFinish === "Colour" ? "bg-purple-100 text-purple-800 border-purple-200" : "bg-cyan-100 text-cyan-800 border-cyan-200",
        serialNumber: item.serialNumber,
        glassType: item.glassType || item.glassCode || "Glass Unit",
        glassCode: item.glassCode || item.itemCode,
        paneTitle: primaryRole.name,
        width: item.width,
        height: item.height,
        roleCode: primaryRole.code,
      };
    }

    if (isDlgu) {
      if (selectedDefectivePane === "OP") {
        const op = dlguPanes.opItem || item;
        return {
          badgeText: "OP • OUTER PANE",
          badgeClass: "bg-purple-100 text-purple-800 border-purple-200",
          finishText: "OP • Colour",
          finishClass: "bg-purple-100 text-purple-800 border-purple-200",
          serialNumber: op?.serialNumber || item.serialNumber,
          glassType: op?.glassType || "8MM GUARDIAN SUNGUARD SN GREY 50 T",
          glassCode: op?.glassCode || op?.itemCode || item.itemCode,
          paneTitle: "Outer Pane (Coated / Face A)",
          width: op?.width || item.width,
          height: op?.height || item.height,
          roleCode: "OP",
        };
      }
      if (selectedDefectivePane === "IP_PLY1" || selectedDefectivePane === "IP1") {
        const ip1 = dlguPanes.ip1Item || item;
        return {
          badgeText: "IP 1 • INNER LAMI PLY 1",
          badgeClass: "bg-cyan-100 text-cyan-800 border-cyan-200",
          finishText: "IP 1 • Clear",
          finishClass: "bg-cyan-100 text-cyan-800 border-cyan-200",
          serialNumber: ip1?.serialNumber || item.serialNumber,
          glassType: ip1?.glassType || "6MM CLEAR (Front Laminated Pane)",
          glassCode: ip1?.glassCode || ip1?.itemCode || item.itemCode,
          paneTitle: "Inner Lami Lite 1 (Front Clear Float)",
          width: ip1?.width || item.width,
          height: ip1?.height || item.height,
          roleCode: "IP",
        };
      }
      if (selectedDefectivePane === "IP_PLY2" || selectedDefectivePane === "IP2") {
        const ip2 = dlguPanes.ip2Item;
        return {
          badgeText: "IP 2 • INNER LAMI PLY 2",
          badgeClass: "bg-cyan-100 text-cyan-800 border-cyan-200",
          finishText: "IP 2 • Clear",
          finishClass: "bg-cyan-100 text-cyan-800 border-cyan-200",
          serialNumber: ip2?.serialNumber || (dlguPanes.ip1Item ? `${dlguPanes.ip1Item.serialNumber}-B` : `${item.serialNumber}-B`),
          glassType: ip2?.glassType || "6MM CLEAR (Back Laminated Pane)",
          glassCode: ip2?.glassCode || ip2?.itemCode || item.itemCode,
          paneTitle: "Inner Lami Lite 2 (Back Clear Float)",
          width: ip2?.width || item.width,
          height: ip2?.height || item.height,
          roleCode: "IP",
        };
      }
      if (selectedDefectivePane === "BOTH_CLEAR" || selectedDefectivePane === "BOTH_IP" || selectedDefectivePane === "IP_BOTH") {
        const ip1 = dlguPanes.ip1Item || (getItemFinish(item) === "Clear" ? item : null);
        const ip1Serial = ip1?.serialNumber || (getItemFinish(item) === "Clear" ? item.serialNumber : "IP1");
        const ip2Serial = dlguPanes.ip2Item?.serialNumber || (ip1?.serialNumber ? `${ip1.serialNumber}-B` : `${item.serialNumber}-B`);
        return {
          badgeText: "BOTH CLEAR • INNER LAMI (IP 1 + IP 2)",
          badgeClass: "bg-cyan-100 text-cyan-800 border-cyan-200",
          finishText: "Both Clears (IP 1 + IP 2)",
          finishClass: "bg-cyan-100 text-cyan-800 border-cyan-200",
          serialNumber: `${ip1Serial} & ${ip2Serial}`,
          glassType: ip1?.glassType || "6MM CLEAR (Both Inner Laminated Panes)",
          glassCode: ip1?.glassCode || ip1?.itemCode || item.itemCode,
          paneTitle: "Both Inner Lami Panes (IP 1 + IP 2 • Front & Back Clear)",
          width: item.width,
          height: item.height,
          roleCode: "BOTH_CLEAR",
        };
      }
      // FULL DLGU UNIT
      return {
        badgeText: "FULL GLASS • WHOLE DLGU UNIT",
        badgeClass: "bg-red-100 text-red-800 border-red-200",
        finishText: "Full DLGU Unit (3 Panes)",
        finishClass: "bg-red-100 text-red-800 border-red-200",
        serialNumber: allSerials.join(" + "),
        glassType: item.glassType || "DLGU 3-Pane Unit (OP + IP1 + IP2)",
        glassCode: item.itemCode,
        paneTitle: "Full DLGU Unit (All 3 Panes)",
        width: item.width,
        height: item.height,
        roleCode: "UNIT",
      };
    }

    if (isDgu) {
      if (selectedDefectivePane === "OP") {
        const op = dguPanes.opItem || item;
        return {
          badgeText: "OP • OUTER PANE",
          badgeClass: "bg-purple-100 text-purple-800 border-purple-200",
          finishText: "OP • Colour",
          finishClass: "bg-purple-100 text-purple-800 border-purple-200",
          serialNumber: op?.serialNumber || item.serialNumber,
          glassType: op?.glassType || "Coated / Colour Glass Lite",
          glassCode: op?.glassCode || item.itemCode,
          paneTitle: "Outer Pane (Coated / Colour)",
          width: op?.width || item.width,
          height: op?.height || item.height,
          roleCode: "OP",
        };
      }
      if (selectedDefectivePane === "IP") {
        const ip = dguPanes.ipItem || item;
        return {
          badgeText: "IP • INNER PANE",
          badgeClass: "bg-cyan-100 text-cyan-800 border-cyan-200",
          finishText: "IP • Clear",
          finishClass: "bg-cyan-100 text-cyan-800 border-cyan-200",
          serialNumber: ip?.serialNumber || item.serialNumber,
          glassType: ip?.glassType || "Clear Float Glass Lite",
          glassCode: ip?.glassCode || item.itemCode,
          paneTitle: "Inner Pane (Clear Float)",
          width: ip?.width || item.width,
          height: ip?.height || item.height,
          roleCode: "IP",
        };
      }
      return {
        badgeText: "FULL GLASS • WHOLE DGU UNIT",
        badgeClass: "bg-red-100 text-red-800 border-red-200",
        finishText: "Full DGU Unit (Both Panes)",
        finishClass: "bg-red-100 text-red-800 border-red-200",
        serialNumber: allSerials.join(" + "),
        glassType: item.glassType || "DGU 2-Pane Unit (OP + IP)",
        glassCode: item.itemCode,
        paneTitle: "Full DGU Unit (Both Panes)",
        width: item.width,
        height: item.height,
        roleCode: "UNIT",
      };
    }

    if (isLam) {
      if (selectedDefectivePane === "IP_PLY1" || selectedDefectivePane === "PLY1") {
        const ply1 = lamPanes.ply1Item || item;
        return {
          badgeText: "IP 1 • LAMI PLY 1",
          badgeClass: "bg-cyan-100 text-cyan-800 border-cyan-200",
          finishText: "IP 1 • Clear",
          finishClass: "bg-cyan-100 text-cyan-800 border-cyan-200",
          serialNumber: ply1?.serialNumber || item.serialNumber,
          glassType: ply1?.glassType || "Clear Float Glass Lite",
          glassCode: ply1?.glassCode || item.itemCode,
          paneTitle: "Front Laminated Pane (Ply 1)",
          width: ply1?.width || item.width,
          height: ply1?.height || item.height,
          roleCode: "IP",
        };
      }
      if (selectedDefectivePane === "IP_PLY2" || selectedDefectivePane === "PLY2") {
        const ply2 = lamPanes.ply2Item;
        return {
          badgeText: "IP 2 • LAMI PLY 2",
          badgeClass: "bg-cyan-100 text-cyan-800 border-cyan-200",
          finishText: "IP 2 • Clear",
          finishClass: "bg-cyan-100 text-cyan-800 border-cyan-200",
          serialNumber: ply2?.serialNumber || `${item.serialNumber}-B`,
          glassType: ply2?.glassType || "Clear Float Glass Lite",
          glassCode: ply2?.glassCode || item.itemCode,
          paneTitle: "Back Laminated Pane (Ply 2)",
          width: ply2?.width || item.width,
          height: ply2?.height || item.height,
          roleCode: "IP",
        };
      }
      return {
        badgeText: "FULL GLASS • WHOLE LAMI UNIT",
        badgeClass: "bg-red-100 text-red-800 border-red-200",
        finishText: "Full Laminated Unit (Both Panes)",
        finishClass: "bg-red-100 text-red-800 border-red-200",
        serialNumber: allSerials.join(" + "),
        glassType: item.glassType || "Laminated Glass Unit (Ply 1 + Ply 2)",
        glassCode: item.itemCode,
        paneTitle: "Full Laminated Unit (Both Panes)",
        width: item.width,
        height: item.height,
        roleCode: "UNIT",
      };
    }

    // Default Fallback
    return {
      badgeText: `${primaryRole.code} • ${primaryRole.name}`,
      badgeClass: primaryRole.colorClass,
      finishText: `${primaryRole.code} • ${primaryFinish}`,
      finishClass: primaryFinish === "Colour" ? "bg-purple-100 text-purple-800 border-purple-200" : "bg-cyan-100 text-cyan-800 border-cyan-200",
      serialNumber: item.serialNumber,
      glassType: item.glassType || item.glassCode || "Glass Lite",
      glassCode: item.glassCode || item.itemCode,
      paneTitle: primaryRole.name,
      width: item.width,
      height: item.height,
      roleCode: primaryRole.code,
    };
  }, [
    isPairUnit,
    isDlgu,
    isDgu,
    isLam,
    selectedDefectivePane,
    item,
    dlguPanes,
    dguPanes,
    lamPanes,
    primaryRole,
    primaryFinish,
    partnerRole,
    partnerFinish,
    allSerials,
  ]);

  const isCompletedOrFinished = Boolean(item.status === "Completed" || item.currentStage === "Finished");
  const isCuttingStage = Boolean(item.currentStage === "Cutting");

  const handleSubmit = async () => {
    if (isCuttingStage) {
      toast.error("Quality rejection and rework start after the Cutting stage.");
      return;
    }

    let defectiveCode = "SINGLE";
    let defectiveSerial: string | undefined = item.serialNumber;
    let targetSerialsToProcess: string[] = [item.serialNumber];
    let isSinglePane = true;

    if (isDlgu) {
      if (selectedDefectivePane === "OP") {
        defectiveCode = "OP";
        defectiveSerial = dlguPanes.opItem?.serialNumber || item.serialNumber;
        targetSerialsToProcess = [defectiveSerial];
        isSinglePane = true;
      } else if (selectedDefectivePane === "IP_PLY1" || selectedDefectivePane === "IP1") {
        defectiveCode = "IP_PLY1";
        defectiveSerial = dlguPanes.ip1Item?.serialNumber || item.serialNumber;
        targetSerialsToProcess = [defectiveSerial];
        isSinglePane = true;
      } else if (selectedDefectivePane === "IP_PLY2" || selectedDefectivePane === "IP2") {
        defectiveCode = "IP_PLY2";
        defectiveSerial = dlguPanes.ip2Item?.serialNumber || (dlguPanes.ip1Item ? `${dlguPanes.ip1Item.serialNumber}-B` : `${item.serialNumber}-B`);
        targetSerialsToProcess = dlguPanes.ip2Item?.serialNumber ? [dlguPanes.ip2Item.serialNumber] : [item.serialNumber];
        isSinglePane = true;
      } else if (selectedDefectivePane === "BOTH_CLEAR" || selectedDefectivePane === "BOTH_IP" || selectedDefectivePane === "IP_BOTH") {
        defectiveCode = "BOTH_CLEAR";
        const clearSerials: string[] = [];
        if (dlguPanes.ip1Item?.serialNumber) clearSerials.push(dlguPanes.ip1Item.serialNumber);
        if (dlguPanes.ip2Item?.serialNumber) clearSerials.push(dlguPanes.ip2Item.serialNumber);
        if (clearSerials.length === 0) {
          if (getItemFinish(item) === "Clear") {
            clearSerials.push(item.serialNumber);
          } else {
            const clears = siblingPanes.filter((p) => getItemFinish(p) === "Clear");
            clears.forEach((c) => clearSerials.push(c.serialNumber));
          }
        }
        if (clearSerials.length === 1 && dlguPanes.ip1Item?.serialNumber) {
          clearSerials.push(`${dlguPanes.ip1Item.serialNumber}-B`);
        }
        targetSerialsToProcess = clearSerials.length > 0 ? clearSerials : [item.serialNumber];
        defectiveSerial = targetSerialsToProcess.join(" + ");
        isSinglePane = false;
      } else {
        defectiveCode = "WHOLE_UNIT";
        defectiveSerial = undefined;
        targetSerialsToProcess = allSerials;
        isSinglePane = false;
      }
    } else if (isDgu) {
      if (selectedDefectivePane === "OP") {
        defectiveCode = "OP";
        defectiveSerial = dguPanes.opItem?.serialNumber || item.serialNumber;
        targetSerialsToProcess = [defectiveSerial];
        isSinglePane = true;
      } else if (selectedDefectivePane === "IP") {
        defectiveCode = "IP";
        defectiveSerial = dguPanes.ipItem?.serialNumber || item.serialNumber;
        targetSerialsToProcess = [defectiveSerial];
        isSinglePane = true;
      } else {
        defectiveCode = "WHOLE_UNIT";
        defectiveSerial = undefined;
        targetSerialsToProcess = allSerials;
        isSinglePane = false;
      }
    } else if (isLam) {
      if (selectedDefectivePane === "IP_PLY1" || selectedDefectivePane === "PLY1") {
        defectiveCode = "IP_PLY1";
        defectiveSerial = lamPanes.ply1Item?.serialNumber || item.serialNumber;
        targetSerialsToProcess = [defectiveSerial];
        isSinglePane = true;
      } else if (selectedDefectivePane === "IP_PLY2" || selectedDefectivePane === "PLY2") {
        defectiveCode = "IP_PLY2";
        defectiveSerial = lamPanes.ply2Item?.serialNumber || `${item.serialNumber}-B`;
        targetSerialsToProcess = lamPanes.ply2Item?.serialNumber ? [lamPanes.ply2Item.serialNumber] : [item.serialNumber];
        isSinglePane = true;
      } else {
        defectiveCode = "WHOLE_UNIT";
        defectiveSerial = undefined;
        targetSerialsToProcess = allSerials;
        isSinglePane = false;
      }
    } else {
      defectiveCode = primaryRole.code || "SINGLE";
      defectiveSerial = item.serialNumber;
      targetSerialsToProcess = [item.serialNumber];
      isSinglePane = true;
    }

    const finalReason = customReason.trim() || reason;
    setLoading(true);

    try {
      if (mode === "reject") {
        const res = await fetch("/api/production/reject", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serialNumber: targetSerialsToProcess[0] || item.serialNumber,
            serialNumbers: targetSerialsToProcess,
            singlePaneOnly: isSinglePane,
            piNumber: item.piNumber,
            defectStation,
            reason: finalReason,
            defectivePane: defectiveCode,
            defectiveSerialNumber: defectiveSerial,
            autoRework: autoReworkEnabled,
            reworkTargetStage: "Cutting",
            operator: "Operator",
          }),
        });

        if (!res.ok) throw new Error("Failed to reject item");
        if (autoReworkEnabled) {
          if (defectiveCode === "BOTH_CLEAR") {
            toast.error(`Both Clear Panes (${targetSerialsToProcess.map((s) => `#${s}`).join(" + ")}) marked as REJECTED & Remake dispatched to Cutting`);
          } else if (!isSinglePane && isCompositeUnit) {
            toast.error(`Full Unit (${allSerials.join(" + ")}) marked as REJECTED & Remake dispatched to Cutting`);
          } else {
            toast.error(`Pane ${defectiveSerial || targetSerialsToProcess[0]} (${activePaneInfo.badgeText}) marked as REJECTED & Remake dispatched to Cutting`);
          }
        } else {
          if (defectiveCode === "BOTH_CLEAR") {
            toast.error(`Both Clear Panes (${targetSerialsToProcess.map((s) => `#${s}`).join(" + ")}) marked as REJECTED`);
          } else if (!isSinglePane && isCompositeUnit) {
            toast.error(`Full Unit (${allSerials.join(" + ")}) marked as REJECTED (${defectiveCode})`);
          } else {
            toast.error(`Pane ${defectiveSerial || targetSerialsToProcess[0]} (${activePaneInfo.badgeText}) marked as REJECTED`);
          }
        }
      } else {
        const res = await fetch("/api/production/rework", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serialNumber: targetSerialsToProcess[0] || item.serialNumber,
            serialNumbers: targetSerialsToProcess,
            singlePaneOnly: isSinglePane,
            piNumber: item.piNumber,
            targetStage,
            defectStation,
            reason: finalReason,
            defectivePane: defectiveCode,
            defectiveSerialNumber: defectiveSerial,
            operator: "Operator",
          }),
        });

        if (!res.ok) throw new Error("Failed to send item to rework");
        if (defectiveCode === "BOTH_CLEAR") {
          toast.warning(`Both Clear Panes (${targetSerialsToProcess.map((s) => `#${s}`).join(" + ")}) sent to REWORK at ${targetStage} stage`);
        } else if (!isSinglePane && isCompositeUnit) {
          toast.warning(`Full Unit (${allSerials.join(" + ")}) sent to REWORK at ${targetStage} stage`);
        } else {
          toast.warning(`Pane ${defectiveSerial || targetSerialsToProcess[0]} (${activePaneInfo.badgeText}) sent to REWORK at ${targetStage} stage`);
        }
      }

      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to process request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white text-slate-900 border-slate-200 shadow-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-extrabold flex items-center gap-2.5 text-slate-900">
            <div className={`w-8 h-8 rounded-lg ${mode === "reject" ? "bg-rose-600" : "bg-amber-600"} text-white flex items-center justify-center shadow-sm shrink-0`}>
              {mode === "reject" ? <AlertOctagon className="w-4 h-4 text-white" /> : <RefreshCw className="w-4 h-4 text-white" />}
            </div>
            <span>
              {mode === "reject"
                ? (isDlgu ? "Mark DLGU Unit as REJECTED" : isDgu ? "Mark DGU Unit as REJECTED" : isLam ? "Mark Laminated Unit as REJECTED" : "Mark Glass Item as REJECTED")
                : (isDlgu ? "Send DLGU Unit to REWORK" : isDgu ? "Send DGU Unit to REWORK" : isLam ? "Send Laminated Unit to REWORK" : "Send Glass Item to REWORK")
              }
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 my-2 text-xs">
          {/* Cutting Stage Block Banner */}
          {isCuttingStage && (
            <div className="p-3 rounded-xl border bg-slate-100 border-slate-300 text-slate-800 flex items-start gap-2.5">
              <AlertOctagon className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-extrabold text-xs text-slate-900">
                  Initial Cutting Stage Glass Piece
                </div>
                <div className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                  Quality rejection and rework workflows begin after the Cutting stage (at Edging, Tempering, Pairing Buffer, DGU, or Lamination).
                </div>
              </div>
            </div>
          )}

          {/* Finished / Completed Block Banner */}
          {mode === "reject" && isCompletedOrFinished && (
            <div className="p-3 rounded-xl border bg-amber-50/80 border-amber-300 text-amber-900 flex items-start gap-2.5">
              <AlertOctagon className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-extrabold text-xs text-amber-950">
                  Completed / Dispatched Stage Unit Rejection
                </div>
                <div className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                  Glass unit has reached Finished / Dispatch stage (e.g. broken during delivery to customer). Rejecting will record the scrap defect and immediately route a replacement remake ticket to Cutting.
                </div>
              </div>
            </div>
          )}

          {/* Multi-Pane Composite Unit Banner */}
          {isCompositeUnit && (
            <div className={`p-3 rounded-xl border flex items-start gap-2.5 ${mode === "reject" ? "bg-red-50/80 border-red-200 text-red-900" : "bg-amber-50/80 border-amber-200 text-amber-900"}`}>
              <AlertOctagon className={`w-4 h-4 shrink-0 mt-0.5 ${mode === "reject" ? "text-red-600" : "text-amber-600"}`} />
              <div>
                <div className="font-extrabold text-xs">
                  {isDlgu
                    ? "DLGU 3-Pane Unit (Outer Lite + 2 Laminated Clear Inner Lites)"
                    : isDgu
                    ? "DGU Paired Glass Unit (Outer Lite + Inner Lite)"
                    : "Laminated Glass Unit (Ply 1 + Ply 2)"}
                </div>
                <div className="text-[11px] mt-0.5 opacity-90 leading-relaxed">
                  {isDlgu
                    ? "Select whether OP (Colour), IP 1 (Clear), IP 2 (Clear), Both Clears (IP 1 + IP 2), or Full Glass is defective so cutting knows what to re-cut."
                    : "Select whether OP (Colour), IP (Clear), or Full Glass is defective."}
                </div>
              </div>
            </div>
          )}

          {/* Defective Pane Selector */}
          {isCompositeUnit && (
            <div className="space-y-1.5">
              <Label className="text-slate-800 font-bold flex items-center justify-between text-xs">
                <span>Which Pane Has the Defect?</span>
                <span className="text-[10px] font-semibold text-purple-700 uppercase tracking-wide">Required Selection</span>
              </Label>
              
              <div className="space-y-1.5">
                {isDlgu ? (
                  <>
                    {/* DLGU Option 1: Outer Pane (OP) */}
                    <label className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                      selectedDefectivePane === "OP"
                        ? "bg-purple-50/80 border-purple-400 ring-2 ring-purple-200"
                        : "bg-white border-slate-200 hover:bg-slate-50"
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name="defectivePaneSelection"
                          checked={selectedDefectivePane === "OP"}
                          onChange={() => setSelectedDefectivePane("OP")}
                          className="text-purple-600 focus:ring-purple-500 w-3.5 h-3.5"
                        />
                        <div>
                          <div className="font-bold text-slate-900 text-xs">
                            Outer Pane (OP • Coated) — #{dlguPanes.opItem?.serialNumber || (getItemFinish(item) === "Colour" ? item.serialNumber : "OP Colour Lite")}
                          </div>
                          <div className="text-[10.5px] text-slate-500 font-mono truncate max-w-[240px]">
                            {dlguPanes.opItem?.glassType || "8MM GUARDIAN SUNGUARD SN GREY 50 T"}
                          </div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black border bg-purple-100 text-purple-800 border-purple-200">
                        OP • Colour
                      </span>
                    </label>

                    {/* DLGU Option 2: Inner Lami Lite 1 (IP 1) */}
                    <label className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                      selectedDefectivePane === "IP_PLY1" || selectedDefectivePane === "IP1"
                        ? "bg-cyan-50/80 border-cyan-400 ring-2 ring-cyan-200"
                        : "bg-white border-slate-200 hover:bg-slate-50"
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name="defectivePaneSelection"
                          checked={selectedDefectivePane === "IP_PLY1" || selectedDefectivePane === "IP1"}
                          onChange={() => setSelectedDefectivePane("IP_PLY1")}
                          className="text-cyan-600 focus:ring-cyan-500 w-3.5 h-3.5"
                        />
                        <div>
                          <div className="font-bold text-slate-900 text-xs">
                            Inner Lami Lite 1 (IP 1 • Ply A) — #{dlguPanes.ip1Item?.serialNumber || (getItemFinish(item) === "Clear" ? item.serialNumber : "IP 1 Clear Lite")}
                          </div>
                          <div className="text-[10.5px] text-slate-500 font-mono truncate max-w-[240px]">
                            {dlguPanes.ip1Item?.glassType || "6MM CLEAR (Front Laminated Pane)"}
                          </div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black border bg-cyan-100 text-cyan-800 border-cyan-200">
                        IP 1 • Clear
                      </span>
                    </label>

                    {/* DLGU Option 3: Inner Lami Lite 2 (IP 2) */}
                    <label className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                      selectedDefectivePane === "IP_PLY2" || selectedDefectivePane === "IP2"
                        ? "bg-cyan-50/80 border-cyan-400 ring-2 ring-cyan-200"
                        : "bg-white border-slate-200 hover:bg-slate-50"
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name="defectivePaneSelection"
                          checked={selectedDefectivePane === "IP_PLY2" || selectedDefectivePane === "IP2"}
                          onChange={() => setSelectedDefectivePane("IP_PLY2")}
                          className="text-cyan-600 focus:ring-cyan-500 w-3.5 h-3.5"
                        />
                        <div>
                          <div className="font-bold text-slate-900 text-xs">
                            Inner Lami Lite 2 (IP 2 • Ply B) — #{dlguPanes.ip2Item?.serialNumber || (dlguPanes.ip1Item ? `${dlguPanes.ip1Item.serialNumber}-B` : `${item.serialNumber}-B`)}
                          </div>
                          <div className="text-[10.5px] text-slate-500 font-mono truncate max-w-[240px]">
                            {dlguPanes.ip2Item?.glassType || "6MM CLEAR (Back Laminated Pane)"}
                          </div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black border bg-cyan-100 text-cyan-800 border-cyan-200">
                        IP 2 • Clear
                      </span>
                    </label>

                    {/* DLGU Option 4: Both Inner Clear Lites (IP 1 + IP 2) */}
                    <label className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                      selectedDefectivePane === "BOTH_CLEAR" || selectedDefectivePane === "BOTH_IP" || selectedDefectivePane === "IP_BOTH"
                        ? "bg-cyan-50/80 border-cyan-400 ring-2 ring-cyan-200"
                        : "bg-white border-slate-200 hover:bg-slate-50"
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name="defectivePaneSelection"
                          checked={selectedDefectivePane === "BOTH_CLEAR" || selectedDefectivePane === "BOTH_IP" || selectedDefectivePane === "IP_BOTH"}
                          onChange={() => setSelectedDefectivePane("BOTH_CLEAR")}
                          className="text-cyan-600 focus:ring-cyan-500 w-3.5 h-3.5"
                        />
                        <div>
                          <div className="font-bold text-slate-900 text-xs">
                            Both Clear Lites (IP 1 + IP 2 • Lami Pair) — #{dlguPanes.ip1Item?.serialNumber || (getItemFinish(item) === "Clear" ? item.serialNumber : "IP1")} & #{dlguPanes.ip2Item?.serialNumber || (dlguPanes.ip1Item ? `${dlguPanes.ip1Item.serialNumber}-B` : `${item.serialNumber}-B`)}
                          </div>
                          <div className="text-[10.5px] text-slate-500 font-mono truncate max-w-[240px]">
                            Both laminated clear float panes defective (OP Colour stays intact)
                          </div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black border bg-cyan-100 text-cyan-800 border-cyan-200">
                        Both Clear
                      </span>
                    </label>

                    {/* DLGU Option 5: Full DLGU Glass / Whole Unit */}
                    <label className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                      selectedDefectivePane === "ASSEMBLY" || selectedDefectivePane === "WHOLE_UNIT"
                        ? "bg-red-50/80 border-red-400 ring-2 ring-red-200"
                        : "bg-white border-slate-200 hover:bg-slate-50"
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name="defectivePaneSelection"
                          checked={selectedDefectivePane === "ASSEMBLY" || selectedDefectivePane === "WHOLE_UNIT"}
                          onChange={() => setSelectedDefectivePane("ASSEMBLY")}
                          className="text-red-600 focus:ring-red-500 w-3.5 h-3.5"
                        />
                        <div>
                          <div className="font-bold text-slate-900 text-xs">
                            Full Glass / Whole DLGU Unit (All 3 Panes)
                          </div>
                          <div className="text-[10.5px] text-slate-500">
                            Entire unit rejected (OP + IP 1 + IP 2 all sent for remake)
                          </div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-red-100 border border-red-200 text-red-800">
                        Full Glass
                      </span>
                    </label>
                  </>
                ) : isDgu ? (
                  <>
                    {/* DGU Option 1: Outer Pane (OP) */}
                    <label className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                      selectedDefectivePane === "OP"
                        ? "bg-purple-50/80 border-purple-400 ring-2 ring-purple-200"
                        : "bg-white border-slate-200 hover:bg-slate-50"
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name="defectivePaneSelection"
                          checked={selectedDefectivePane === "OP"}
                          onChange={() => setSelectedDefectivePane("OP")}
                          className="text-purple-600 focus:ring-purple-500 w-3.5 h-3.5"
                        />
                        <div>
                          <div className="font-bold text-slate-900 text-xs">
                            Outer Pane (OP • Coated/Colour) — #{dguPanes.opItem?.serialNumber || item.serialNumber}
                          </div>
                          <div className="text-[10.5px] text-slate-500 font-mono truncate max-w-[240px]">
                            {dguPanes.opItem?.glassType || "Coated / Colour Glass Lite"}
                          </div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black border bg-purple-100 text-purple-800 border-purple-200">
                        OP • Colour
                      </span>
                    </label>

                    {/* DGU Option 2: Inner Pane (IP) */}
                    <label className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                      selectedDefectivePane === "IP" || selectedDefectivePane === "IP_PLY1"
                        ? "bg-cyan-50/80 border-cyan-400 ring-2 ring-cyan-200"
                        : "bg-white border-slate-200 hover:bg-slate-50"
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name="defectivePaneSelection"
                          checked={selectedDefectivePane === "IP" || selectedDefectivePane === "IP_PLY1"}
                          onChange={() => setSelectedDefectivePane("IP")}
                          className="text-cyan-600 focus:ring-cyan-500 w-3.5 h-3.5"
                        />
                        <div>
                          <div className="font-bold text-slate-900 text-xs">
                            Inner Pane (IP • Clear Float) — #{dguPanes.ipItem?.serialNumber || item.serialNumber}
                          </div>
                          <div className="text-[10.5px] text-slate-500 font-mono truncate max-w-[240px]">
                            {dguPanes.ipItem?.glassType || "Clear Float Glass Lite"}
                          </div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black border bg-cyan-100 text-cyan-800 border-cyan-200">
                        IP • Clear
                      </span>
                    </label>

                    {/* DGU Option 3: Full Glass / Both Panes */}
                    <label className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                      selectedDefectivePane === "ASSEMBLY" || selectedDefectivePane === "WHOLE_UNIT"
                        ? "bg-red-50/80 border-red-400 ring-2 ring-red-200"
                        : "bg-white border-slate-200 hover:bg-slate-50"
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name="defectivePaneSelection"
                          checked={selectedDefectivePane === "ASSEMBLY" || selectedDefectivePane === "WHOLE_UNIT"}
                          onChange={() => setSelectedDefectivePane("ASSEMBLY")}
                          className="text-red-600 focus:ring-red-500 w-3.5 h-3.5"
                        />
                        <div>
                          <div className="font-bold text-slate-900 text-xs">
                            Full Glass / Whole DGU Unit (Both Panes)
                          </div>
                          <div className="text-[10.5px] text-slate-500">
                            Entire unit rejected (OP + IP both sent for remake)
                          </div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-red-100 border border-red-200 text-red-800">
                        Full Glass
                      </span>
                    </label>
                  </>
                ) : isLam ? (
                  <>
                    {/* Lam Option 1: Ply 1 */}
                    <label className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                      selectedDefectivePane === "IP_PLY1" || selectedDefectivePane === "PLY1"
                        ? "bg-cyan-50/80 border-cyan-400 ring-2 ring-cyan-200"
                        : "bg-white border-slate-200 hover:bg-slate-50"
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name="defectivePaneSelection"
                          checked={selectedDefectivePane === "IP_PLY1" || selectedDefectivePane === "PLY1"}
                          onChange={() => setSelectedDefectivePane("IP_PLY1")}
                          className="text-cyan-600 focus:ring-cyan-500 w-3.5 h-3.5"
                        />
                        <div>
                          <div className="font-bold text-slate-900 text-xs">
                            Lami Lite 1 (IP 1 • Front Ply) — #{lamPanes.ply1Item?.serialNumber || item.serialNumber}
                          </div>
                          <div className="text-[10.5px] text-slate-500 font-mono truncate max-w-[240px]">
                            {lamPanes.ply1Item?.glassType || "Clear Float Glass Lite"}
                          </div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black border bg-cyan-100 text-cyan-800 border-cyan-200">
                        IP 1 • Clear
                      </span>
                    </label>

                    {/* Lam Option 2: Ply 2 */}
                    <label className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                      selectedDefectivePane === "IP_PLY2" || selectedDefectivePane === "PLY2"
                        ? "bg-cyan-50/80 border-cyan-400 ring-2 ring-cyan-200"
                        : "bg-white border-slate-200 hover:bg-slate-50"
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name="defectivePaneSelection"
                          checked={selectedDefectivePane === "IP_PLY2" || selectedDefectivePane === "PLY2"}
                          onChange={() => setSelectedDefectivePane("IP_PLY2")}
                          className="text-cyan-600 focus:ring-cyan-500 w-3.5 h-3.5"
                        />
                        <div>
                          <div className="font-bold text-slate-900 text-xs">
                            Lami Lite 2 (IP 2 • Back Ply) — #{lamPanes.ply2Item?.serialNumber || `${item.serialNumber}-B`}
                          </div>
                          <div className="text-[10.5px] text-slate-500 font-mono truncate max-w-[240px]">
                            {lamPanes.ply2Item?.glassType || "Clear Float Glass Lite"}
                          </div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black border bg-cyan-100 text-cyan-800 border-cyan-200">
                        IP 2 • Clear
                      </span>
                    </label>

                    {/* Lam Option 3: Full Glass / Both Panes */}
                    <label className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                      selectedDefectivePane === "ASSEMBLY" || selectedDefectivePane === "WHOLE_UNIT"
                        ? "bg-red-50/80 border-red-400 ring-2 ring-red-200"
                        : "bg-white border-slate-200 hover:bg-slate-50"
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name="defectivePaneSelection"
                          checked={selectedDefectivePane === "ASSEMBLY" || selectedDefectivePane === "WHOLE_UNIT"}
                          onChange={() => setSelectedDefectivePane("ASSEMBLY")}
                          className="text-red-600 focus:ring-red-500 w-3.5 h-3.5"
                        />
                        <div>
                          <div className="font-bold text-slate-900 text-xs">
                            Full Glass / Whole Laminated Unit (Both Panes)
                          </div>
                          <div className="text-[10.5px] text-slate-500">
                            Entire laminated unit rejected (Ply 1 + Ply 2 both sent for remake)
                          </div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-red-100 border border-red-200 text-red-800">
                        Full Glass
                      </span>
                    </label>
                  </>
                ) : null}
              </div>
            </div>
          )}

          {/* Active Target Pane Summary Details Card */}
          <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-slate-600 text-[11px] font-semibold">
                PI Number: <span className="font-bold text-purple-900">{item.piNumber || item.batchNo}</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${activePaneInfo.badgeClass}`}>
                {activePaneInfo.badgeText}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-slate-600 text-[11px] font-semibold">
                Batch / Pos: <span className="font-bold text-slate-900">{item.batchNo || item.piNumber}</span> / POS <span className="font-bold text-purple-900">{item.posNo}</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${activePaneInfo.finishClass}`}>
                {activePaneInfo.finishText}
              </span>
            </div>

            <div className="flex items-center justify-between text-slate-700">
              <span>Selected Lite: <strong className="font-mono font-bold text-slate-900">#{activePaneInfo.serialNumber}</strong></span>
              <span className="text-[11px] text-slate-500">({activePaneInfo.paneTitle})</span>
            </div>

            <div className="text-[11px] text-slate-700">
              <span className="text-slate-500">Glass Spec:</span> <strong className="font-mono">{activePaneInfo.glassType}</strong>
            </div>

            {item.itemCode && (
              <div className="text-[11px] text-slate-700 truncate">
                <span className="text-slate-500">Item / Category:</span> <strong>{item.itemCode}</strong>
                {isDlgu && <span className="ml-1 text-purple-700 font-bold">(DLGU)</span>}
              </div>
            )}

            <div className="flex items-center justify-between pt-1 border-t border-slate-200/80 text-[11px]">
              <span className="text-slate-500">
                Current Stage: <strong className="text-amber-700">{item.currentStage || "Cutting"}</strong>
              </span>
              <span className="text-slate-500 font-mono font-bold">
                {item.width} × {item.height} mm
              </span>
            </div>
          </div>

          {/* Defect Origin Station Field */}
          <div className="space-y-1.5">
            <Label className="text-slate-800 font-bold flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5">
                <Factory className="w-3.5 h-3.5 text-purple-600" />
                Defect Origin Station
              </span>
              <span className="text-[10px] font-semibold text-slate-500">Where defect occurred</span>
            </Label>
            <Select value={defectStation} onValueChange={setDefectStation}>
              <SelectTrigger className="w-full bg-white border-slate-300 text-slate-900 h-9 font-medium">
                <SelectValue placeholder="Select station where defect occurred" />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-900 shadow-xl max-h-56">
                {DEFECT_ORIGIN_STATIONS.map((station) => (
                  <SelectItem key={station} value={station} className="text-xs focus:bg-purple-50 focus:text-purple-900 cursor-pointer">
                    {station}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Defect Reason Field */}
          <div className="space-y-1.5">
            <Label className="text-slate-800 font-bold text-xs">Defect / Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="w-full bg-white border-slate-300 text-slate-900 h-9 font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-900 shadow-xl max-h-56">
                {REJECT_REASONS.map((r) => (
                  <SelectItem key={r} value={r} className="text-xs focus:bg-purple-50 focus:text-purple-900 cursor-pointer">
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Optional Remarks Field */}
          <div className="space-y-1">
            <Label className="text-slate-700 text-xs">Additional Remarks (Optional)</Label>
            <input
              type="text"
              placeholder="e.g. Surface scratch on bottom right side"
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              className="w-full p-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-purple-500 focus:border-purple-500 outline-hidden"
            />
          </div>

          {/* Rework Target Stage (When in Rework Mode) */}
          {mode === "rework" && (
            <div className="space-y-1.5">
              <Label className="text-slate-800 font-bold text-xs">Send Directly to Target Stage</Label>
              <Select value={targetStage} onValueChange={(val) => setTargetStage(val as ProductionStage)}>
                <SelectTrigger className="w-full bg-white border-slate-300 text-slate-900 h-9 font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200 text-slate-900 shadow-xl">
                  {REWORK_TARGET_STAGES.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs focus:bg-purple-50 focus:text-purple-900 cursor-pointer">
                      {s} Workstation
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Auto Remake Ticket Toggle (When in Reject Mode) */}
          {mode === "reject" && !isCuttingStage && (
            <div className="p-3 bg-purple-50/80 border border-purple-200 rounded-xl space-y-1.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoReworkEnabled}
                  onChange={(e) => setAutoReworkEnabled(e.target.checked)}
                  className="rounded text-purple-600 focus:ring-purple-500 h-4 w-4"
                />
                <span className="font-extrabold text-purple-950 text-xs">
                  Automatically Create & Dispatch Remake Ticket to Cutting Table
                </span>
              </label>
              <p className="text-[11px] text-purple-800 ml-6 leading-relaxed">
                {selectedDefectivePane === "ASSEMBLY" || selectedDefectivePane === "WHOLE_UNIT"
                  ? "All panes (Full Glass) will be queued in Cutting as remake pieces."
                  : `Only defective pane (${activePaneInfo.badgeText}) will be queued in Cutting. Surviving partner panes wait in the pairing buffer.`}
              </p>
            </div>
          )}
        </div>

        {/* Modal Action Buttons */}
        <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-200">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSubmit}
            disabled={loading || isCuttingStage}
            className={`text-xs font-bold gap-1.5 text-white ${
              mode === "reject"
                ? "bg-red-600 hover:bg-red-700"
                : "bg-amber-600 hover:bg-amber-700"
            }`}
          >
            {loading ? (
              "Processing..."
            ) : mode === "reject" ? (
              <>
                <AlertOctagon className="w-3.5 h-3.5" />
                Confirm Rejection & Remake
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                Confirm Rework Routing
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
