import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Trash2,
  FilePlus,
  Save,
  Layers,
  Calculator,
  Building2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

interface ManualPIItemInput {
  id: string;
  itemCode: string;
  glassType: string;
  width: number | string;
  height: number | string;
  quantity: number | string;
  delLocation: string;
  remarks: string;
}

interface ManualPIModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export const ManualPIModal: React.FC<ManualPIModalProps> = ({
  open,
  onOpenChange,
  onSuccess,
}) => {
  const { getAuthHeaders } = useAuth();
  const [customerName, setCustomerName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [proformaInvNo, setProformaInvNo] = useState("");
  const [jobOrderNumber, setJobOrderNumber] = useState("");
  const [sfoDate, setSfoDate] = useState(new Date().toISOString().slice(0, 10));
  const [deliveryDate, setDeliveryDate] = useState("");
  const [refContact, setRefContact] = useState("");
  const [glassDescription, setGlassDescription] = useState("");
  const [dispatchType, setDispatchType] = useState("TRUCK");
  const [loading, setLoading] = useState(false);

  const [items, setItems] = useState<ManualPIItemInput[]>([
    {
      id: "row-1",
      itemCode: "GL-01",
      glassType: "6MM CLEAR ANNEALED",
      width: 1200,
      height: 2000,
      quantity: 5,
      delLocation: "FACTORY",
      remarks: "",
    },
  ]);

  const handleAddItem = () => {
    const nextIdx = items.length + 1;
    setItems([
      ...items,
      {
        id: `row-${Date.now()}-${nextIdx}`,
        itemCode: `GL-${String(nextIdx).padStart(2, "0")}`,
        glassType: items[items.length - 1]?.glassType || "6MM CLEAR ANNEALED",
        width: 1000,
        height: 1500,
        quantity: 1,
        delLocation: "FACTORY",
        remarks: "",
      },
    ]);
  };

  const handleRemoveItem = (id: string) => {
    if (items.length <= 1) {
      toast.warning("At least one glass item is required.");
      return;
    }
    setItems(items.filter((item) => item.id !== id));
  };

  const handleItemChange = (
    id: string,
    field: keyof ManualPIItemInput,
    value: any
  ) => {
    setItems(
      items.map((item) => {
        if (item.id === id) {
          return { ...item, [field]: value };
        }
        return item;
      })
    );
  };

  const calculateRowSqm = (w: number | string, h: number | string, q: number | string) => {
    const width = parseFloat(String(w)) || 0;
    const height = parseFloat(String(h)) || 0;
    const qty = parseInt(String(q), 10) || 0;
    return parseFloat(((width * height * qty) / 1000000).toFixed(3));
  };

  const totalSqm = items.reduce((acc, curr) => {
    return acc + calculateRowSqm(curr.width, curr.height, curr.quantity);
  }, 0);

  const totalQty = items.reduce((acc, curr) => {
    return acc + (parseInt(String(curr.quantity), 10) || 0);
  }, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!customerName.trim()) {
      toast.error("Please enter a Customer Name.");
      return;
    }
    if (!projectName.trim()) {
      toast.error("Please enter a Project Name.");
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const w = parseFloat(String(item.width));
      const h = parseFloat(String(item.height));
      const q = parseInt(String(item.quantity), 10);

      if (!item.itemCode.trim()) {
        toast.error(`Item #${i + 1}: Please specify an Item Code.`);
        return;
      }
      if (isNaN(w) || w <= 0 || isNaN(h) || h <= 0) {
        toast.error(`Item #${i + 1}: Width and Height must be positive numbers.`);
        return;
      }
      if (isNaN(q) || q <= 0) {
        toast.error(`Item #${i + 1}: Quantity must be at least 1.`);
        return;
      }
    }

    setLoading(true);

    try {
      const payload = {
        customerName,
        projectName,
        proformaInvNo,
        jobOrderNumber,
        sfoDate,
        deliveryDate,
        refContact,
        glassDescription: glassDescription || items[0]?.glassType || "Clear Glass",
        dispatchType,
        items: items.map((item) => ({
          itemCode: item.itemCode,
          glassType: item.glassType,
          width: parseFloat(String(item.width)),
          height: parseFloat(String(item.height)),
          quantity: parseInt(String(item.quantity), 10),
          delLocation: item.delLocation,
          remarks: item.remarks,
        })),
      };

      const res = await fetch("/api/excel/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to create PI");
      }

      toast.success(`PI Status ${data.pi?.piNumber || ""} created successfully!`);
      onOpenChange(false);
      if (onSuccess) onSuccess();

      // Reset form
      setCustomerName("");
      setProjectName("");
      setProformaInvNo("");
      setJobOrderNumber("");
      setGlassDescription("");
      setItems([
        {
          id: "row-1",
          itemCode: "GL-01",
          glassType: "6MM CLEAR ANNEALED",
          width: 1200,
          height: 2000,
          quantity: 5,
          delLocation: "FACTORY",
          remarks: "",
        },
      ]);
    } catch (err: any) {
      toast.error(err.message || "Error generating PI");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto bg-white text-slate-900 border-slate-200 shadow-2xl p-6">
        <DialogHeader className="border-b border-slate-100 pb-4">
          <DialogTitle className="text-xl font-black flex items-center gap-2.5 text-slate-900">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-sm shrink-0">
              <FilePlus className="w-5 h-5 text-white" />
            </div>
            <span>Manual PI Generation & Order Entry</span>
          </DialogTitle>
          <DialogDescription className="text-slate-500 text-xs font-medium mt-1">
            Fill in the customer, order header info, and glass item specifications manually to generate a PI Status record.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          {/* Header Metadata Section */}
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 space-y-4">
            <div className="flex items-center gap-2 text-xs font-extrabold text-slate-800 uppercase tracking-wider border-b border-slate-200/60 pb-2">
              <Building2 className="w-4 h-4 text-blue-600" /> Order Header Information
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
              <div>
                <Label className="text-slate-700 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1">
                  Customer Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  required
                  placeholder="e.g. MERAKI FACADE & GLAZING LLC"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="bg-white border-slate-300 text-xs font-medium mt-1 h-9"
                />
              </div>

              <div>
                <Label className="text-slate-700 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1">
                  Project Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  required
                  placeholder="e.g. ASTRA TWIN TOWER"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="bg-white border-slate-300 text-xs font-medium mt-1 h-9"
                />
              </div>

              <div>
                <Label className="text-slate-700 text-[11px] font-bold uppercase tracking-wider">
                  PI Status Number (Optional)
                </Label>
                <Input
                  placeholder="Auto-generated if left blank"
                  value={proformaInvNo}
                  onChange={(e) => setProformaInvNo(e.target.value)}
                  className="bg-white border-slate-300 text-xs font-medium mt-1 h-9"
                />
              </div>

              <div>
                <Label className="text-slate-700 text-[11px] font-bold uppercase tracking-wider">
                  Job / Order Number
                </Label>
                <Input
                  placeholder="e.g. P-1526"
                  value={jobOrderNumber}
                  onChange={(e) => setJobOrderNumber(e.target.value)}
                  className="bg-white border-slate-300 text-xs font-medium mt-1 h-9"
                />
              </div>

              <div>
                <Label className="text-slate-700 text-[11px] font-bold uppercase tracking-wider">
                  Issue / SFO Date
                </Label>
                <Input
                  type="date"
                  value={sfoDate}
                  onChange={(e) => setSfoDate(e.target.value)}
                  className="bg-white border-slate-300 text-xs font-medium mt-1 h-9"
                />
              </div>

              <div>
                <Label className="text-slate-700 text-[11px] font-bold uppercase tracking-wider">
                  Target Delivery Date
                </Label>
                <Input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="bg-white border-slate-300 text-xs font-medium mt-1 h-9"
                />
              </div>

              <div>
                <Label className="text-slate-700 text-[11px] font-bold uppercase tracking-wider">
                  Reference Contact
                </Label>
                <Input
                  placeholder="e.g. JEET GADA"
                  value={refContact}
                  onChange={(e) => setRefContact(e.target.value)}
                  className="bg-white border-slate-300 text-xs font-medium mt-1 h-9"
                />
              </div>

              <div>
                <Label className="text-slate-700 text-[11px] font-bold uppercase tracking-wider">
                  Dispatch Method / Location
                </Label>
                <select
                  value={dispatchType}
                  onChange={(e) => setDispatchType(e.target.value)}
                  className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-900 mt-1 shadow-2xs focus:ring-1 focus:ring-blue-500"
                >
                  <option value="TRUCK">TRUCK DISPATCH</option>
                  <option value="FACTORY">FACTORY PICKUP</option>
                  <option value="SITE">DIRECT SITE DELIVERY</option>
                </select>
              </div>

              <div>
                <Label className="text-slate-700 text-[11px] font-bold uppercase tracking-wider">
                  Glass Type Overview
                </Label>
                <Input
                  placeholder="e.g. 24MM DGU (8mm + 12mm + 4mm)"
                  value={glassDescription}
                  onChange={(e) => setGlassDescription(e.target.value)}
                  className="bg-white border-slate-300 text-xs font-medium mt-1 h-9"
                />
              </div>
            </div>
          </div>

          {/* Glass Items Specifications Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                <Layers className="w-4 h-4 text-purple-600" /> Glass Items & Dimensions ({items.length})
              </div>
              <Button
                type="button"
                onClick={handleAddItem}
                size="sm"
                variant="outline"
                className="border-purple-200 text-purple-700 hover:bg-purple-50 text-xs font-bold gap-1 h-8 rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" /> Add Glass Row
              </Button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-x-auto bg-white shadow-2xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100/80 text-slate-700 font-extrabold border-b border-slate-200 text-[11px] uppercase tracking-wider">
                    <th className="py-2.5 px-3 w-10 text-center">#</th>
                    <th className="py-2.5 px-3 w-28">Item Code</th>
                    <th className="py-2.5 px-3 min-w-[200px]">Glass Specification</th>
                    <th className="py-2.5 px-3 w-24 text-right">Width (mm)</th>
                    <th className="py-2.5 px-3 w-24 text-right">Height (mm)</th>
                    <th className="py-2.5 px-3 w-20 text-center">Qty</th>
                    <th className="py-2.5 px-3 w-24 text-right">SQM</th>
                    <th className="py-2.5 px-3 w-28">Delivery</th>
                    <th className="py-2.5 px-3 min-w-[120px]">Remarks</th>
                    <th className="py-2.5 px-3 w-10 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((row, idx) => {
                    const rowSqm = calculateRowSqm(row.width, row.height, row.quantity);

                    return (
                      <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2 px-3 text-center text-slate-400 font-bold text-xs">{idx + 1}</td>

                        <td className="py-2 px-2">
                          <Input
                            value={row.itemCode}
                            onChange={(e) => handleItemChange(row.id, "itemCode", e.target.value)}
                            placeholder="e.g. GL-01"
                            className="h-8 text-xs font-semibold uppercase bg-white border-slate-300"
                          />
                        </td>

                        <td className="py-2 px-2">
                          <Input
                            value={row.glassType}
                            onChange={(e) => handleItemChange(row.id, "glassType", e.target.value)}
                            placeholder="e.g. 6MM CLEAR ANNEALED"
                            className="h-8 text-xs font-medium bg-white border-slate-300"
                          />
                        </td>

                        <td className="py-2 px-2">
                          <Input
                            type="number"
                            value={row.width}
                            onChange={(e) => handleItemChange(row.id, "width", e.target.value)}
                            className="h-8 text-xs font-bold text-right bg-white border-slate-300"
                          />
                        </td>

                        <td className="py-2 px-2">
                          <Input
                            type="number"
                            value={row.height}
                            onChange={(e) => handleItemChange(row.id, "height", e.target.value)}
                            className="h-8 text-xs font-bold text-right bg-white border-slate-300"
                          />
                        </td>

                        <td className="py-2 px-2">
                          <Input
                            type="number"
                            min="1"
                            value={row.quantity}
                            onChange={(e) => handleItemChange(row.id, "quantity", e.target.value)}
                            className="h-8 text-xs font-bold text-center bg-white border-slate-300"
                          />
                        </td>

                        <td className="py-2 px-3 text-right font-mono font-bold text-purple-700 text-xs">
                          {rowSqm.toFixed(3)} m²
                        </td>

                        <td className="py-2 px-2">
                          <select
                            value={row.delLocation}
                            onChange={(e) => handleItemChange(row.id, "delLocation", e.target.value)}
                            className="w-full h-8 rounded-md border border-slate-300 bg-white px-2 py-0 text-xs font-medium"
                          >
                            <option value="FACTORY">FACTORY</option>
                            <option value="SITE">SITE</option>
                          </select>
                        </td>

                        <td className="py-2 px-2">
                          <Input
                            value={row.remarks}
                            onChange={(e) => handleItemChange(row.id, "remarks", e.target.value)}
                            placeholder="Optional notes"
                            className="h-8 text-xs font-normal bg-white border-slate-300"
                          />
                        </td>

                        <td className="py-2 px-2 text-center">
                          <Button
                            type="button"
                            onClick={() => handleRemoveItem(row.id)}
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Total Calculation Summary Banner */}
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-md">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-purple-500/20 border border-purple-400/30 rounded-xl text-purple-300">
                <Calculator className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">PI Order Summary</div>
                <div className="text-sm font-extrabold text-white">
                  {items.length} Line Items | {totalQty} Total Glass Units
                </div>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Area</div>
                <div className="text-xl font-black text-[#fce4b8] font-mono">{totalSqm.toFixed(2)} SQM</div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-bold h-9 px-4 rounded-xl"
                >
                  Cancel
                </Button>

                <Button
                  type="submit"
                  disabled={loading}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-xs h-9 px-5 rounded-xl shadow-lg gap-2"
                >
                  {loading ? (
                    <Sparkles className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {loading ? "Generating PI..." : "Generate & Save PI Status"}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
