import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertOctagon, RefreshCw } from "lucide-react";
import { GlassItem, ProductionStage } from "@shared/api";
import { toast } from "sonner";

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

  if (!item) return null;

  const handleSubmit = async () => {
    const finalReason = customReason.trim() || reason;
    setLoading(true);

    try {
      if (mode === "reject") {
        const res = await fetch("/api/production/reject", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serialNumber: item.serialNumber,
            piNumber: item.piNumber,
            reason: finalReason,
            operator: "Operator",
          }),
        });

        if (!res.ok) throw new Error("Failed to reject item");
        toast.error(`Item ${item.serialNumber} marked as REJECTED`);
      } else {
        const res = await fetch("/api/production/rework", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serialNumber: item.serialNumber,
            piNumber: item.piNumber,
            targetStage,
            reason: finalReason,
            operator: "Operator",
          }),
        });

        if (!res.ok) throw new Error("Failed to send item to rework");
        toast.warning(`Item ${item.serialNumber} sent to REWORK at ${targetStage} stage`);
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
      <DialogContent className="max-w-md bg-white text-slate-900 border-slate-200 shadow-xl">
        <DialogHeader>
          <DialogTitle className={`text-lg font-bold flex items-center gap-2 ${mode === "reject" ? "text-red-600" : "text-amber-600"}`}>
            {mode === "reject" ? (
              <>
                <AlertOctagon className="w-5 h-5 text-red-600" /> Mark Glass Item as REJECTED
              </>
            ) : (
              <>
                <RefreshCw className="w-5 h-5 text-amber-600" /> Send Glass Item to REWORK
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 my-2 text-xs">
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1 font-mono">
            <div><span className="text-slate-500">PI Number:</span> <span className="font-bold text-purple-700">{item.piNumber}</span></div>
            <div><span className="text-slate-500">Batch / Pos:</span> <span className="font-bold text-slate-900">{item.batchNo || item.sfoNo || "—"}</span> / <span className="text-indigo-700 font-bold">POS {item.posNo || "—"}</span></div>
            <div><span className="text-slate-500">Item:</span> <span className="font-bold text-slate-900">{item.itemCode}</span></div>
            <div><span className="text-slate-500">Serial / Barcode:</span> <span className="text-blue-600 font-bold">{item.serialNumber}</span> ({item.barcode})</div>
            <div><span className="text-slate-500">Current Stage:</span> <span className="text-amber-700 font-bold">{item.currentStage}</span></div>
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
              placeholder="e.g. Edge crack on top left corner after cutting"
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
            {loading ? "Saving..." : mode === "reject" ? "Confirm Reject" : "Send to Rework"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
