import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertOctagon, RefreshCw, Factory } from "lucide-react";
import { GlassItem, ProductionStage } from "@shared/api";
import { toast } from "sonner";
import { getItemFinish, getGlassPaneRole } from "@/lib/utils";

interface RejectReworkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "reject" | "rework";
  item: GlassItem | null;
  onSuccess: () => void;
}

export const DEFECT_ORIGIN_STATIONS = [
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
// Note: "Finished" is intentionally excluded as rework targets must be active processing workstations.
const REWORK_TARGET_STAGES: Exclude<ProductionStage, "Finished">[] = ["Cutting", "DGU", "Lamination"];

export const RejectReworkModal: React.FC<RejectReworkModalProps> = ({
  open,
  onOpenChange,
  mode,
  item,
  onSuccess,
}) => {
  const [defectStation, setDefectStation] = useState<string>("Tempering Furnace / Toughening");
  const [reason, setReason] = useState(REJECT_REASONS[0]);
  const [customReason, setCustomReason] = useState("");
  const [targetStage, setTargetStage] = useState<ProductionStage>("Cutting");
  const [autoReworkEnabled, setAutoReworkEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState(false);
  const [selectedDefectivePane, setSelectedDefectivePane] = useState<string>("OP");

  if (!item) return null;

  const partnerItem = (item as any).partnerItem as GlassItem | undefined;
  const allSerials = ((item as any).allSerials as string[] | undefined) || (partnerItem ? [item.serialNumber, partnerItem.serialNumber] : [item.serialNumber]);
  const isPairUnit = Boolean(partnerItem || (allSerials && allSerials.length > 1) || (item as any).isDguPair || item.currentStage === "DGU" || item.currentStage === "Lamination");
  const glassCat = (item as any).glassCategory || item.glassType;

  const primaryRole = getGlassPaneRole(item);
  const primaryFinish = getItemFinish(item);
  const partnerRole = partnerItem ? getGlassPaneRole(partnerItem) : null;
  const partnerFinish = partnerItem ? getItemFinish(partnerItem) : null;

  const isDlgu = Boolean(
    glassCat === "DLGU" ||
    (item as any).glassCategory === "DLGU" ||
    partnerItem?.glassCategory === "DLGU" ||
    /dlgu/i.test(item.glassType || "") ||
    /laminated/i.test(item.glassType || partnerItem?.glassType || "")
  );

  const isPrimaryOp = primaryRole.code === "OP";
  const opItem = isPrimaryOp ? item : partnerItem;
  const ipItem = isPrimaryOp ? partnerItem : item;

  // Sync / Reset initial selection when modal opens or item changes
  React.useEffect(() => {
    if (open) {
      if (isDlgu) {
        setSelectedDefectivePane("OP");
      } else if (isPairUnit) {
        setSelectedDefectivePane("PRIMARY");
      } else {
        setSelectedDefectivePane(primaryRole.code || "SINGLE");
      }
      // Smartly set default station based on item context if applicable
      if (item?.currentStage === "DGU") {
        setDefectStation("DGU Assembly Line");
      } else if (item?.currentStage === "Lamination") {
        setDefectStation("Lamination Line / Autoclave");
      } else {
        setDefectStation("Tempering Furnace / Toughening");
      }
      setCustomReason("");
      setReason(REJECT_REASONS[0]);
    }
  }, [open, item?.id, item?.serialNumber, item?.currentStage]);

  // Dynamically resolve the active pane details based on current selection
  const activePaneInfo = React.useMemo(() => {
    if (!isPairUnit) {
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
        return {
          badgeText: "OP • OUTER PANE",
          badgeClass: "bg-purple-100 text-purple-800 border-purple-200",
          finishText: "OP • Colour",
          finishClass: "bg-purple-100 text-purple-800 border-purple-200",
          serialNumber: opItem?.serialNumber || item.serialNumber,
          glassType: opItem?.glassType || "8MM GUARDIAN SUNGUARD SN GREY 50 T",
          glassCode: opItem?.glassCode || opItem?.itemCode || item.itemCode,
          paneTitle: "Outer Pane (Coated / Face A)",
          width: opItem?.width || item.width,
          height: opItem?.height || item.height,
          roleCode: "OP",
        };
      }
      if (selectedDefectivePane === "IP_PLY1") {
        return {
          badgeText: "IP • INNER LAMI PLY 1",
          badgeClass: "bg-cyan-100 text-cyan-800 border-cyan-200",
          finishText: "IP • Ply 1 (Clear)",
          finishClass: "bg-cyan-100 text-cyan-800 border-cyan-200",
          serialNumber: ipItem?.serialNumber || item.serialNumber,
          glassType: ipItem?.glassType || "6MM CLEAR (Front Laminated Pane)",
          glassCode: ipItem?.glassCode || ipItem?.itemCode || item.itemCode,
          paneTitle: "Inner Lami Lite 1 (Front Clear Float)",
          width: ipItem?.width || item.width,
          height: ipItem?.height || item.height,
          roleCode: "IP",
        };
      }
      if (selectedDefectivePane === "IP_PLY2") {
        return {
          badgeText: "IP • INNER LAMI PLY 2",
          badgeClass: "bg-cyan-100 text-cyan-800 border-cyan-200",
          finishText: "IP • Ply 2 (Clear)",
          finishClass: "bg-cyan-100 text-cyan-800 border-cyan-200",
          serialNumber: ipItem ? `${ipItem.serialNumber}-B` : `${item.serialNumber}-B`,
          glassType: ipItem?.glassType || "6MM CLEAR (Back Laminated Pane)",
          glassCode: ipItem?.glassCode || ipItem?.itemCode || item.itemCode,
          paneTitle: "Inner Lami Lite 2 (Back Clear Float)",
          width: ipItem?.width || item.width,
          height: ipItem?.height || item.height,
          roleCode: "IP",
        };
      }
      // ASSEMBLY
      return {
        badgeText: "WHOLE UNIT • ASSEMBLY",
        badgeClass: "bg-slate-100 text-slate-700 border-slate-300",
        finishText: "Complete DLGU Unit",
        finishClass: "bg-slate-100 text-slate-700 border-slate-200",
        serialNumber: allSerials.join(" + "),
        glassType: item.glassType || "DLGU 3-Pane Unit",
        glassCode: item.itemCode,
        paneTitle: "Unit Assembly / Spacer / Interlayer",
        width: item.width,
        height: item.height,
        roleCode: "UNIT",
      };
    }

    // Standard 2-Pane Pair
    if (selectedDefectivePane === "PRIMARY") {
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
    }
    if (selectedDefectivePane === "PARTNER") {
      const code = partnerRole?.code || (primaryRole.code === "OP" ? "IP" : "OP");
      const name = partnerRole?.name || (code === "OP" ? "Outer Pane" : "Inner Pane");
      const finish = partnerFinish || (code === "OP" ? "Colour" : "Clear");
      const colorClass = partnerRole?.colorClass || (code === "OP" ? "bg-purple-100 text-purple-800 border-purple-200" : "bg-cyan-100 text-cyan-800 border-cyan-200");
      return {
        badgeText: `${code} • ${name}`,
        badgeClass: colorClass,
        finishText: `${code} • ${finish}`,
        finishClass: finish === "Colour" ? "bg-purple-100 text-purple-800 border-purple-200" : "bg-cyan-100 text-cyan-800 border-cyan-200",
        serialNumber: partnerItem?.serialNumber || "Partner Lite",
        glassType: partnerItem?.glassType || partnerItem?.glassCode || (code === "OP" ? "Coated Glass Lite" : "Clear Float Glass Lite"),
        glassCode: partnerItem?.glassCode || partnerItem?.itemCode || item.itemCode,
        paneTitle: name,
        width: partnerItem?.width || item.width,
        height: partnerItem?.height || item.height,
        roleCode: code,
      };
    }

    // ASSEMBLY for standard pair
    return {
      badgeText: "WHOLE UNIT • ASSEMBLY",
      badgeClass: "bg-slate-100 text-slate-700 border-slate-300",
      finishText: "Complete Paired Unit",
      finishClass: "bg-slate-100 text-slate-700 border-slate-200",
      serialNumber: allSerials.join(" + "),
      glassType: item.glassType || "Paired Glass Unit",
      glassCode: item.itemCode,
      paneTitle: "Unit Assembly / Sealant / Spacer",
      width: item.width,
      height: item.height,
      roleCode: "UNIT",
    };
  }, [
    isPairUnit,
    isDlgu,
    selectedDefectivePane,
    item,
    opItem,
    ipItem,
    partnerItem,
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

    if (mode === "reject" && isCompletedOrFinished) {
      toast.error("Glass items completed at the Finished stage cannot be rejected.");
      return;
    }

    let defectiveCode = "SINGLE";
    let defectiveSerial: string | undefined = item.serialNumber;
    let prefix = "";

    if (!isPairUnit) {
      defectiveCode = primaryRole.code || "SINGLE";
      defectiveSerial = item.serialNumber;
      prefix = "";
    } else if (isDlgu) {
      if (selectedDefectivePane === "OP") {
        defectiveCode = "OP";
        defectiveSerial = opItem?.serialNumber || item.serialNumber;
        prefix = `[Defect on OP • Outer Pane #${defectiveSerial}] `;
      } else if (selectedDefectivePane === "IP_PLY1") {
        defectiveCode = "IP_PLY1";
        defectiveSerial = ipItem?.serialNumber || item.serialNumber;
        prefix = `[Defect on Inner Lami Ply 1 (Front Clear) #${defectiveSerial}] `;
      } else if (selectedDefectivePane === "IP_PLY2") {
        defectiveCode = "IP_PLY2";
        defectiveSerial = ipItem ? `${ipItem.serialNumber}-B` : "IP-Ply2";
        prefix = `[Defect on Inner Lami Ply 2 (Back Clear) #${defectiveSerial}] `;
      } else {
        defectiveCode = "ASSEMBLY";
        defectiveSerial = undefined;
        prefix = `[Defect on Unit Assembly / Spacer / PVB] `;
      }
    } else {
      if (selectedDefectivePane === "PRIMARY") {
        defectiveCode = primaryRole.code;
        defectiveSerial = item.serialNumber;
        prefix = `[Defect on ${primaryRole.code} • ${primaryFinish} #${item.serialNumber}] `;
      } else if (selectedDefectivePane === "PARTNER") {
        defectiveCode = partnerRole?.code || (primaryRole.code === "OP" ? "IP" : "OP");
        defectiveSerial = partnerItem?.serialNumber || "PARTNER";
        prefix = `[Defect on ${defectiveCode} • #${defectiveSerial}] `;
      } else {
        defectiveCode = "ASSEMBLY";
        defectiveSerial = undefined;
        prefix = `[Defect on Assembly / Sealant / PVB] `;
      }
    }

    const finalReason = customReason.trim() || reason;
    setLoading(true);

    try {
      if (mode === "reject") {
        const res = await fetch("/api/production/reject", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serialNumber: item.serialNumber,
            serialNumbers: allSerials,
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
          if (isPairUnit) {
            toast.error(`Paired Unit (${allSerials.join(" + ")}) marked as REJECTED & Remake dispatched to Cutting`);
          } else {
            toast.error(`Item ${item.serialNumber} marked as REJECTED & Remake dispatched to Cutting`);
          }
        } else {
          if (isPairUnit) {
            toast.error(`Paired Unit (${allSerials.join(" + ")}) marked as REJECTED (${defectiveCode})`);
          } else {
            toast.error(`Item ${item.serialNumber} marked as REJECTED`);
          }
        }
      } else {
        const res = await fetch("/api/production/rework", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serialNumber: item.serialNumber,
            serialNumbers: allSerials,
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
        if (isPairUnit) {
          toast.warning(`Paired Unit (${allSerials.join(" + ")}) sent to REWORK at ${targetStage} stage`);
        } else {
          toast.warning(`Item ${item.serialNumber} sent to REWORK at ${targetStage} stage`);
        }
      }

      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Error processing request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white text-slate-900 border-slate-200 shadow-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className={`text-lg font-bold flex items-center gap-2 ${mode === "reject" ? "text-red-600" : "text-amber-600"}`}>
            {mode === "reject" ? (
              <>
                <AlertOctagon className="w-5 h-5 text-red-600" />
                {isPairUnit ? (isDlgu ? "Mark DLGU Unit as REJECTED" : "Mark Paired Unit as REJECTED") : "Mark Glass Item as REJECTED"}
              </>
            ) : (
              <>
                <RefreshCw className="w-5 h-5 text-amber-600" />
                {isPairUnit ? (isDlgu ? "Send DLGU Unit to REWORK" : "Send Paired Unit to REWORK") : "Send Glass Item to REWORK"}
              </>
            )}
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
            <div className="p-3 rounded-xl border bg-slate-100 border-slate-300 text-slate-800 flex items-start gap-2.5">
              <AlertOctagon className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-extrabold text-xs text-slate-900">
                  Completed Glass Unit (Finished Stage)
                </div>
                <div className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                  Glass items that have completed all processing stages and reached the Finished stage cannot be rejected.
                </div>
              </div>
            </div>
          )}

          {/* Paired Unit Banner */}
          {isPairUnit && (
            <div className={`p-3 rounded-xl border flex items-start gap-2.5 ${mode === "reject" ? "bg-red-50/80 border-red-200 text-red-900" : "bg-amber-50/80 border-amber-200 text-amber-900"}`}>
              <AlertOctagon className={`w-4 h-4 shrink-0 mt-0.5 ${mode === "reject" ? "text-red-600" : "text-amber-600"}`} />
              <div>
                <div className="font-extrabold text-xs">
                  {isDlgu ? "DLGU 3-Pane Unit (Outer Lite + 2 Lami Inner Lites)" : "Paired Glass Unit (1+1)"}
                </div>
                <div className="text-[11px] mt-0.5 opacity-90 leading-relaxed">
                  {isDlgu
                    ? "DLGU has 1 Outer Coated Lite and 2 Laminated Clear Inner Lites. Select the exact lite that has the defect."
                    : "Select which exact pane (Outer / Inner / Assembly) caused the defect so the cutting shop-floor knows what to re-cut."}
                </div>
              </div>
            </div>
          )}

          {/* Defective Pane Selector */}
          {isPairUnit && (
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
                            Outer Pane (OP • Coated) — #{opItem?.serialNumber || item.serialNumber}
                          </div>
                          <div className="text-[10.5px] text-slate-500 font-mono truncate max-w-[240px]">
                            {opItem?.glassType || "8MM GUARDIAN SUNGUARD SN GREY 50 T"}
                          </div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black border bg-purple-100 text-purple-800 border-purple-200">
                        OP • Colour
                      </span>
                    </label>

                    {/* DLGU Option 2: Inner Lami Lite 1 (Ply A) */}
                    <label className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                      selectedDefectivePane === "IP_PLY1"
                        ? "bg-cyan-50/80 border-cyan-400 ring-2 ring-cyan-200"
                        : "bg-white border-slate-200 hover:bg-slate-50"
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name="defectivePaneSelection"
                          checked={selectedDefectivePane === "IP_PLY1"}
                          onChange={() => setSelectedDefectivePane("IP_PLY1")}
                          className="text-cyan-600 focus:ring-cyan-500 w-3.5 h-3.5"
                        />
                        <div>
                          <div className="font-bold text-slate-900 text-xs">
                            Inner Lami Lite 1 (IP • Ply A) — #{ipItem?.serialNumber || item.serialNumber}
                          </div>
                          <div className="text-[10.5px] text-slate-500 font-mono truncate max-w-[240px]">
                            6MM CLEAR (Front Laminated Pane)
                          </div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black border bg-cyan-100 text-cyan-800 border-cyan-200">
                        IP • Ply 1
                      </span>
                    </label>

                    {/* DLGU Option 3: Inner Lami Lite 2 (Ply B) */}
                    <label className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                      selectedDefectivePane === "IP_PLY2"
                        ? "bg-cyan-50/80 border-cyan-400 ring-2 ring-cyan-200"
                        : "bg-white border-slate-200 hover:bg-slate-50"
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name="defectivePaneSelection"
                          checked={selectedDefectivePane === "IP_PLY2"}
                          onChange={() => setSelectedDefectivePane("IP_PLY2")}
                          className="text-cyan-600 focus:ring-cyan-500 w-3.5 h-3.5"
                        />
                        <div>
                          <div className="font-bold text-slate-900 text-xs">
                            Inner Lami Lite 2 (IP • Ply B) — #{ipItem ? `${ipItem.serialNumber}-B` : "Partner Lite"}
                          </div>
                          <div className="text-[10.5px] text-slate-500 font-mono truncate max-w-[240px]">
                            6MM CLEAR (Back Laminated Pane)
                          </div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black border bg-cyan-100 text-cyan-800 border-cyan-200">
                        IP • Ply 2
                      </span>
                    </label>

                    {/* DLGU Option 4: Assembly Defect */}
                    <label className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                      selectedDefectivePane === "ASSEMBLY"
                        ? "bg-slate-100 border-slate-400 ring-2 ring-slate-300"
                        : "bg-white border-slate-200 hover:bg-slate-50"
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name="defectivePaneSelection"
                          checked={selectedDefectivePane === "ASSEMBLY"}
                          onChange={() => setSelectedDefectivePane("ASSEMBLY")}
                          className="text-slate-600 focus:ring-slate-500 w-3.5 h-3.5"
                        />
                        <div>
                          <div className="font-bold text-slate-900 text-xs">
                            Unit Assembly / Spacer / PVB Delamination
                          </div>
                          <div className="text-[10.5px] text-slate-500">
                            Spacer misalignment, butyl leak, or interlayer bubble
                          </div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 border border-slate-200 text-slate-700">
                        Whole Unit
                      </span>
                    </label>
                  </>
                ) : (
                  <>
                    {/* Standard Pair Option 1: Primary Pane */}
                    <label className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                      selectedDefectivePane === "PRIMARY"
                        ? "bg-purple-50/80 border-purple-400 ring-2 ring-purple-200"
                        : "bg-white border-slate-200 hover:bg-slate-50"
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name="defectivePaneSelection"
                          checked={selectedDefectivePane === "PRIMARY"}
                          onChange={() => setSelectedDefectivePane("PRIMARY")}
                          className="text-purple-600 focus:ring-purple-500 w-3.5 h-3.5"
                        />
                        <div>
                          <div className="font-bold text-slate-900 text-xs">
                            {primaryRole.code === "OP" ? "Outer Pane (OP)" : "Inner Pane (IP)"} — #{item.serialNumber}
                          </div>
                          <div className="text-[10.5px] text-slate-500 font-mono truncate max-w-[240px]">
                            {item.glassType || item.glassCode || "Glass Lite"}
                          </div>
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${primaryRole.colorClass}`}>
                        {primaryRole.code} • {primaryFinish}
                      </span>
                    </label>

                    {/* Standard Pair Option 2: Partner Pane */}
                    {partnerItem && partnerRole ? (
                      <label className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                        selectedDefectivePane === "PARTNER"
                          ? "bg-purple-50/80 border-purple-400 ring-2 ring-purple-200"
                          : "bg-white border-slate-200 hover:bg-slate-50"
                      }`}>
                        <div className="flex items-center gap-2.5">
                          <input
                            type="radio"
                            name="defectivePaneSelection"
                            checked={selectedDefectivePane === "PARTNER"}
                            onChange={() => setSelectedDefectivePane("PARTNER")}
                            className="text-purple-600 focus:ring-purple-500 w-3.5 h-3.5"
                          />
                          <div>
                            <div className="font-bold text-slate-900 text-xs">
                              {partnerRole.code === "OP" ? "Outer Pane (OP)" : "Inner Pane (IP)"} — #{partnerItem.serialNumber}
                            </div>
                            <div className="text-[10.5px] text-slate-500 font-mono truncate max-w-[240px]">
                              {partnerItem.glassType || partnerItem.glassCode || "Glass Lite"}
                            </div>
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${partnerRole.colorClass}`}>
                          {partnerRole.code} • {partnerFinish}
                        </span>
                      </label>
                    ) : (
                      <label className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                        selectedDefectivePane === "PARTNER"
                          ? "bg-purple-50/80 border-purple-400 ring-2 ring-purple-200"
                          : "bg-white border-slate-200 hover:bg-slate-50"
                      }`}>
                        <div className="flex items-center gap-2.5">
                          <input
                            type="radio"
                            name="defectivePaneSelection"
                            checked={selectedDefectivePane === "PARTNER"}
                            onChange={() => setSelectedDefectivePane("PARTNER")}
                            className="text-purple-600 focus:ring-purple-500 w-3.5 h-3.5"
                          />
                          <div>
                            <div className="font-bold text-slate-900 text-xs">
                              {primaryRole.code === "OP" ? "Matching Inner Pane (IP)" : "Matching Outer Pane (OP)"}
                            </div>
                            <div className="text-[10.5px] text-slate-500">
                              Opposite partner lite in this unit
                            </div>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-100 text-cyan-800 border border-cyan-200">
                          {primaryRole.code === "OP" ? "IP • Clear" : "OP • Colour"}
                        </span>
                      </label>
                    )}

                    {/* Standard Pair Option 3: Assembly Defect */}
                    <label className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                      selectedDefectivePane === "ASSEMBLY"
                        ? "bg-slate-100 border-slate-400 ring-2 ring-slate-300"
                        : "bg-white border-slate-200 hover:bg-slate-50"
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name="defectivePaneSelection"
                          checked={selectedDefectivePane === "ASSEMBLY"}
                          onChange={() => setSelectedDefectivePane("ASSEMBLY")}
                          className="text-purple-600 focus:ring-purple-500 w-3.5 h-3.5"
                        />
                        <div>
                          <div className="font-bold text-slate-900 text-xs">
                            Unit Assembly Defect (Both Panes / Sealant / PVB)
                          </div>
                          <div className="text-[10.5px] text-slate-500">
                            Spacer misalignment, butyl smear, or delamination
                          </div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 border border-slate-200 text-slate-700">
                        Whole Unit
                      </span>
                    </label>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2.5 font-mono transition-all">
            {/* Top row: PI Number and dynamic Pane Badge */}
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-slate-500 font-sans text-[11px]">PI Number:</span>{" "}
                <span className="font-bold text-purple-700">{item.piNumber}</span>
              </div>
              <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-black border uppercase tracking-wide font-sans shadow-2xs ${activePaneInfo.badgeClass}`}>
                {activePaneInfo.badgeText}
              </span>
            </div>

            {/* Batch & Position */}
            <div className="flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-500 font-sans text-[11px]">Batch / Pos:</span>{" "}
                <span className="font-bold text-slate-900">{item.batchNo || item.sfoNo || "—"}</span> /{" "}
                <span className="text-indigo-700 font-black">POS {item.posNo || "—"}</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${activePaneInfo.finishClass}`}>
                {activePaneInfo.finishText}
              </span>
            </div>

            {/* Selected Lite Serial */}
            <div className="text-xs">
              <span className="text-slate-500 font-sans text-[11px]">Selected Lite:</span>{" "}
              <span className="font-bold text-slate-900 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                #{activePaneInfo.serialNumber}
              </span>
              <span className="text-slate-500 font-sans text-[10.5px] ml-1.5 font-medium">
                ({activePaneInfo.paneTitle})
              </span>
            </div>

            {/* Glass Spec / Description */}
            <div className="text-xs">
              <span className="text-slate-500 font-sans text-[11px]">Glass Spec:</span>{" "}
              <span className="font-bold text-slate-800 text-[11px] leading-tight">
                {activePaneInfo.glassType}
              </span>
            </div>

            {/* Item & Category */}
            <div>
              <span className="text-slate-500 font-sans text-[11px]">Item / Category:</span>{" "}
              <span className="font-bold text-slate-900">{activePaneInfo.glassCode || item.itemCode || "—"}</span>{" "}
              {glassCat && <span className="text-purple-700 font-bold font-sans">({glassCat})</span>}
            </div>
            
            {/* Current Stage & Dimensions */}
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-slate-500 font-sans text-[11px]">Current Stage:</span>{" "}
                <span className="text-amber-700 font-bold font-sans">{item.currentStage}</span>
              </div>
              {activePaneInfo.width > 0 && activePaneInfo.height > 0 && (
                <div className="text-[11px] font-bold text-slate-600">
                  {activePaneInfo.width} × {activePaneInfo.height} mm
                </div>
              )}
            </div>
          </div>

          {mode === "rework" && (
            <div>
              <Label className="text-slate-700 font-bold mb-1 block">Select Target Rework Stage</Label>
              <Select value={targetStage} onValueChange={(val) => setTargetStage(val as ProductionStage)}>
                <SelectTrigger className="bg-white border-slate-300 text-slate-900 font-semibold">
                  <SelectValue placeholder="Select target stage" />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200 text-slate-900">
                  {REWORK_TARGET_STAGES.map((stg) => (
                    <SelectItem key={stg} value={stg}>{stg} Stage</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Defect Origin Station Dropdown */}
          <div>
            <Label className="text-slate-700 font-bold mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Factory className="w-3.5 h-3.5 text-indigo-600" />
                <span>Defect Origin Station</span>
              </span>
              <span className="text-[10.5px] font-semibold text-slate-400">Where defect occurred</span>
            </Label>
            <Select value={defectStation} onValueChange={setDefectStation}>
              <SelectTrigger className="bg-white border-slate-300 text-slate-900 font-bold">
                <SelectValue placeholder="Select station" />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-900">
                {DEFECT_ORIGIN_STATIONS.map((station) => (
                  <SelectItem key={station} value={station} className="font-semibold cursor-pointer">
                    {station}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-slate-700 font-bold mb-1 block">Defect / Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="bg-white border-slate-300 text-slate-900 font-semibold">
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-900">
                {REJECT_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-slate-700 font-bold mb-1 block">Additional Remarks (Optional)</Label>
            <input
              type="text"
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="e.g. Surface scratch on bottom right side"
              className="w-full bg-white border border-slate-300 rounded p-2 text-slate-900 placeholder:text-slate-400 font-medium"
            />
          </div>

          {mode === "reject" && (
            <div className="bg-emerald-50/90 border border-emerald-300/80 p-3 rounded-xl flex items-start gap-2.5 transition-all">
              <input
                type="checkbox"
                id="auto-rework-checkbox"
                checked={autoReworkEnabled}
                onChange={(e) => setAutoReworkEnabled(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <label htmlFor="auto-rework-checkbox" className="cursor-pointer select-none">
                <div className="font-bold text-emerald-900 text-xs flex items-center gap-1.5">
                  <span>Automatically dispatch Remake ticket to Cutting</span>
                  <span className="bg-emerald-200 text-emerald-800 text-[10px] px-1.5 py-0.5 rounded font-black">
                    RECOMMENDED
                  </span>
                </div>
                <div className="text-[11px] text-emerald-700 mt-0.5 leading-relaxed">
                  Logs rejection to QA scrap report while immediately routing replacement piece to the Cutting queue for re-cutting.
                </div>
              </label>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-slate-600 hover:text-slate-900 text-xs">
            Cancel
          </Button>
          <Button
            disabled={loading || (mode === "reject" && isCompletedOrFinished) || isCuttingStage}
            onClick={handleSubmit}
            className={`text-white font-bold text-xs ${
              (mode === "reject" && isCompletedOrFinished) || isCuttingStage
                ? "bg-slate-400 cursor-not-allowed"
                : mode === "reject"
                ? autoReworkEnabled
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-rose-700 hover:bg-rose-800"
                : "bg-amber-600 hover:bg-amber-700"
            }`}
          >
            {loading
              ? "Saving..."
              : isCuttingStage
              ? "Disabled at Cutting Stage"
              : mode === "reject"
              ? isCompletedOrFinished
                ? "Cannot Reject Finished Glass"
                : autoReworkEnabled
                ? isPairUnit
                  ? "Reject & Send Remake to Cutting"
                  : "Reject & Send Remake to Cutting"
                : isPairUnit
                ? "Confirm Reject Unit (Scrap Only)"
                : "Confirm Reject (Scrap Only)"
              : isPairUnit
              ? "Send Unit to Rework"
              : "Send to Rework"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
