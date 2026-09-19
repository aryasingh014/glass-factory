import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertOctagon, RefreshCw } from "lucide-react";
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

const REJECT_REASONS = [
  "Crack / Breakage",
  "Wrong Size / Dimension Defect",
  "Edge Damage / Chipping",
  "Surface Scratch",
  "Bubbles / Inclusions",
  "Spacer Misalignment",
  "Lamination Delamination",
  "Coating Peeling",
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
  const [reason, setReason] = useState(REJECT_REASONS[0]);
  const [customReason, setCustomReason] = useState("");
  const [targetStage, setTargetStage] = useState<ProductionStage>("Cutting");
  const [loading, setLoading] = useState(false);
  const [selectedDefectivePane, setSelectedDefectivePane] = useState<"PRIMARY" | "PARTNER" | "ASSEMBLY">("PRIMARY");

  if (!item) return null;

  const partnerItem = (item as any).partnerItem as GlassItem | undefined;
  const allSerials = ((item as any).allSerials as string[] | undefined) || (partnerItem ? [item.serialNumber, partnerItem.serialNumber] : [item.serialNumber]);
  const isPairUnit = Boolean(partnerItem || (allSerials && allSerials.length > 1) || (item as any).isDguPair || item.currentStage === "DGU" || item.currentStage === "Lamination");
  const glassCat = (item as any).glassCategory || item.glassType;

  const primaryRole = getGlassPaneRole(item);
  const primaryFinish = getItemFinish(item);
  const partnerRole = partnerItem ? getGlassPaneRole(partnerItem) : null;
  const partnerFinish = partnerItem ? getItemFinish(partnerItem) : null;

  const handleSubmit = async () => {
    const defectiveCode = isPairUnit
      ? selectedDefectivePane === "PRIMARY"
        ? primaryRole.code
        : selectedDefectivePane === "PARTNER"
        ? partnerRole?.code || (primaryRole.code === "OP" ? "IP" : "OP")
        : "ASSEMBLY"
      : primaryRole.code || "SINGLE";

    const defectiveSerial = isPairUnit
      ? selectedDefectivePane === "PRIMARY"
        ? item.serialNumber
        : selectedDefectivePane === "PARTNER"
        ? partnerItem?.serialNumber || "PARTNER"
        : undefined
      : item.serialNumber;

    const prefix = isPairUnit
      ? selectedDefectivePane === "PRIMARY"
        ? `[Defect on ${primaryRole.code} • ${primaryFinish} #${item.serialNumber}] `
        : selectedDefectivePane === "PARTNER"
        ? `[Defect on ${partnerRole?.code || (primaryRole.code === "OP" ? "IP" : "OP")} • ${partnerFinish || (primaryFinish === "Colour" ? "Clear" : "Colour")} #${partnerItem?.serialNumber || "Partner"}] `
        : `[Defect on Assembly / Sealant / PVB] `
      : "";

    const finalReason = `${prefix}${customReason.trim() || reason}`;
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
            reason: finalReason,
            defectivePane: defectiveCode,
            defectiveSerialNumber: defectiveSerial,
            operator: "Operator",
          }),
        });

        if (!res.ok) throw new Error("Failed to reject item");
        if (isPairUnit) {
          toast.error(`Paired Unit (${allSerials.join(" + ")}) marked as REJECTED (${defectiveCode})`);
        } else {
          toast.error(`Item ${item.serialNumber} marked as REJECTED`);
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
                {isPairUnit ? "Mark Paired Unit as REJECTED" : "Mark Glass Item as REJECTED"}
              </>
            ) : (
              <>
                <RefreshCw className="w-5 h-5 text-amber-600" />
                {isPairUnit ? "Send Paired Unit to REWORK" : "Send Glass Item to REWORK"}
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 my-2 text-xs">
          {/* Paired Unit Banner */}
          {isPairUnit && (
            <div className={`p-3 rounded-xl border flex items-start gap-2.5 ${mode === "reject" ? "bg-red-50/80 border-red-200 text-red-900" : "bg-amber-50/80 border-amber-200 text-amber-900"}`}>
              <AlertOctagon className={`w-4 h-4 shrink-0 mt-0.5 ${mode === "reject" ? "text-red-600" : "text-amber-600"}`} />
              <div>
                <div className="font-extrabold text-xs">
                  {glassCat === "DLGU" ? "DLGU Multi-Pane Rejection" : "Paired Glass Unit (1+1)"}
                </div>
                <div className="text-[11px] mt-0.5 opacity-90 leading-relaxed">
                  Select which exact pane (Outer / Inner / Assembly) caused the defect so the cutting shop-floor knows what to re-cut.
                </div>
              </div>
            </div>
          )}

          {/* Defective Pane Selector (For DGU / Lamination / DLGU) */}
          {isPairUnit && (
            <div className="space-y-1.5">
              <Label className="text-slate-800 font-bold flex items-center justify-between text-xs">
                <span>Which Pane Has the Defect?</span>
                <span className="text-[10px] font-semibold text-purple-700 uppercase tracking-wide">Required Selection</span>
              </Label>
              
              <div className="space-y-1.5">
                {/* Option 1: Primary Pane */}
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

                {/* Option 2: Partner Pane */}
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

                {/* Option 3: Assembly Defect (Both / Spacer / Sealant / PVB) */}
                <label className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                  selectedDefectivePane === "ASSEMBLY"
                    ? "bg-purple-50/80 border-purple-400 ring-2 ring-purple-200"
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
              </div>
            </div>
          )}

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2 font-mono">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-slate-500 font-sans text-[11px]">PI Number:</span>{" "}
                <span className="font-bold text-purple-700">{item.piNumber}</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[11px] font-black border uppercase tracking-wide font-sans shadow-2xs ${primaryRole.colorClass}`}>
                {primaryRole.code} • {primaryRole.name}
              </span>
            </div>

            <div>
              <span className="text-slate-500 font-sans text-[11px]">Batch / Pos:</span>{" "}
              <span className="font-bold text-slate-900">{item.batchNo || item.sfoNo || "—"}</span> /{" "}
              <span className="text-indigo-700 font-bold">POS {item.posNo || "—"}</span>
            </div>

            <div>
              <span className="text-slate-500 font-sans text-[11px]">Item / Category:</span>{" "}
              <span className="font-bold text-slate-900">{item.itemCode || "—"}</span>{" "}
              {glassCat && <span className="text-purple-700 font-bold font-sans">({glassCat})</span>}
            </div>
            
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-slate-500 font-sans text-[11px]">Current Stage:</span>{" "}
                <span className="text-amber-700 font-bold font-sans">{item.currentStage}</span>
              </div>
              {item.width > 0 && item.height > 0 && (
                <div className="text-[11px] font-bold text-slate-600">
                  {item.width} × {item.height} mm
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
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-slate-600 hover:text-slate-900 text-xs">
            Cancel
          </Button>
          <Button
            disabled={loading}
            onClick={handleSubmit}
            className={`text-white font-bold text-xs ${
              mode === "reject"
                ? "bg-red-600 hover:bg-red-700"
                : "bg-amber-600 hover:bg-amber-700"
            }`}
          >
            {loading ? "Saving..." : mode === "reject" ? (isPairUnit ? "Confirm Reject Unit" : "Confirm Reject") : (isPairUnit ? "Send Unit to Rework" : "Send to Rework")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
