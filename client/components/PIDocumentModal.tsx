import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, CheckCircle, FileText, Trash2 } from "lucide-react";
import { PIMaster, GlassItem } from "@shared/api";
import { generateQRCodeSVG } from "@/lib/barcode";
import { formatAENumber, formatAEDCurrency, formatDubaiDateTime, getDguEffectiveQtyAndSqm } from "@/lib/utils";

interface PIDocumentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pi: PIMaster | null;
  items: GlassItem[];
  onReleaseToProduction?: (piId: string) => void;
  onDeletePI?: (piId: string) => void;
}

export const PIDocumentModal: React.FC<PIDocumentModalProps> = ({
  open,
  onOpenChange,
  pi,
  items,
  onReleaseToProduction,
  onDeletePI,
}) => {
  if (!pi) return null;

  const isSticker =
    pi.piNumber?.startsWith("STK-") ||
    pi.piNumber?.startsWith("SFO-") ||
    pi.id?.startsWith("stk-") ||
    pi.proformaInvNo?.startsWith("STK-") ||
    pi.piNumber?.includes("STK-");

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto bg-white text-slate-900 border-slate-200 shadow-xl">
        <DialogHeader className="flex flex-row items-center justify-between border-b border-slate-200 pb-3">
          <DialogTitle className="text-xl font-bold flex items-center gap-2 text-blue-600">
            <FileText className="w-5 h-5 text-blue-600" />
            {isSticker
              ? `Sticker Batch & Shop Floor Order (${pi.piNumber})`
              : `PI Status & Shop Floor Order (${pi.piNumber})`}
          </DialogTitle>
          <div className="flex items-center gap-2">
            {onDeletePI && (
              <Button
                onClick={() => { onDeletePI(pi.id); onOpenChange(false); }}
                size="sm"
                variant="outline"
                className="border-red-200 text-red-600 hover:bg-red-50 text-xs gap-1 font-semibold"
              >
                <Trash2 className="w-4 h-4" /> {isSticker ? "Delete Sticker Batch" : "Delete PI"}
              </Button>
            )}
            {onReleaseToProduction && (
              <Button
                onClick={() => onReleaseToProduction(pi.id)}
                disabled={pi.status === "In Production" || pi.status === "Completed"}
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white gap-1 text-xs font-semibold"
              >
                <CheckCircle className="w-4 h-4" />{" "}
                {pi.status === "In Production"
                  ? "In Production"
                  : pi.status === "Completed"
                  ? "Completed"
                  : "Release to Production"}
              </Button>
            )}
            <Button onClick={handlePrint} size="sm" variant="outline" className="border-slate-300 text-slate-700 hover:bg-slate-100 text-xs gap-1 font-semibold">
              <Printer className="w-4 h-4" /> Print Document
            </Button>
          </div>
        </DialogHeader>

          {/* Printable PI Content matching Sejal Glass Dubai layout */}
          <div id="printable-pi-document" className="bg-white text-slate-900 p-6 rounded-xl my-2 font-sans text-xs space-y-5 border border-slate-300 shadow-sm print:p-0 print:border-none print:shadow-none">
            {/* Top Row: Customer Name & Official Sejal Glass Logo */}
            <div className="border-2 border-slate-900 rounded-t-lg bg-white overflow-hidden">
              <div className="flex justify-between items-center p-4 border-b-2 border-slate-900">
                <div>
                  <h1 className="text-xl font-black tracking-tight text-[#0a1628] uppercase font-sans">
                    {pi.customerName || "—"}
                  </h1>
                  <p className="text-[11px] font-extrabold text-[#c5a04f] uppercase mt-0.5 tracking-wide">
                    Cutting List - {pi.glassDescription || items[0]?.glassType || "—"}
                  </p>
                </div>

                {/* Official Sejal Glass Logo */}
                <div className="flex items-center gap-3">
                  <img
                    src="/sejal-glass-logo.png"
                    alt="SEJAL GLASS"
                    className="h-12 object-contain"
                  />
                </div>
              </div>

              {/* Metadata Table Grid with UAE Tax & License Information */}
              <div className="divide-y border-b-2 border-slate-900 text-xs font-bold text-slate-900">
                <div className="grid grid-cols-12 divide-x divide-slate-800 bg-slate-50">
                  <div className="col-span-6 p-2 flex items-center gap-2">
                    <span className="font-extrabold text-slate-950">Project Name :</span>
                    <span className="text-[#1a3a6b] font-extrabold italic text-sm">{pi.projectName || "—"}</span>
                  </div>
                  <div className="col-span-3 p-2 flex items-center gap-2">
                    <span className="font-extrabold text-slate-950">Job / Order No :</span>
                    <span className="font-mono font-black text-slate-900">{pi.jobOrderNumber || "—"}</span>
                  </div>
                  <div className="col-span-3 p-2 flex items-center gap-2">
                    <span className="font-extrabold text-slate-950">Issue Date :</span>
                    <span className="font-mono">{pi.sfoDate || pi.issueDate || "—"}</span>
                  </div>
                </div>

                <div className="grid grid-cols-12 divide-x divide-slate-800">
                  <div className="col-span-4 p-2 flex items-center gap-2">
                    <span className="font-extrabold text-slate-950">SFO No :</span>
                    <span className="font-mono font-bold text-slate-700">{pi.sfoNo || items[0]?.sfoNo || pi.jobOrderNumber || ""}</span>
                  </div>
                  <div className="col-span-4 p-2 flex items-center gap-2">
                    <span className="font-extrabold text-slate-950">OB No :</span>
                    <span className="font-mono font-extrabold text-[#1a3a6b]">{pi.obNo || items[0]?.obNo || ""}</span>
                  </div>
                  <div className="col-span-4 p-2 flex items-center gap-2">
                    <span className="font-extrabold text-slate-950">SO No / Date :</span>
                  </div>
                </div>

                <div className="grid grid-cols-12 divide-x divide-slate-800 bg-slate-50">
                  <div className="col-span-6 p-2 flex items-center gap-2">
                    <span className="font-extrabold text-slate-950">Total Qty. :</span>
                    <span className="font-mono font-black text-[#1a3a6b] text-sm">
                      {items.reduce((acc, i) => acc + getDguEffectiveQtyAndSqm(i).qty, 0)} Nos
                    </span>
                  </div>
                  <div className="col-span-6 p-2 flex items-center gap-2">
                    <span className="font-extrabold text-slate-950">Total SQM :</span>
                    <span className="font-mono font-black text-emerald-800 text-sm">
                      {items.reduce((acc, i) => acc + getDguEffectiveQtyAndSqm(i).sqm, 0).toFixed(2)} Sq.mtr
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Render Sections (Grouped by Category / Glass Specification) */}
            {(() => {
              // Helper function to detect item category (Clear Glass vs Sand Blasted Glass)
              const getItemCategory = (item: GlassItem) => {
                const combined = `${item.category || ""} ${item.glassType || ""} ${item.sketch || ""} ${item.remarks || ""} ${item.sectionName || ""}`.toLowerCase();
                if (
                  combined.includes("sand") ||
                  combined.includes("blasted") ||
                  combined.includes("casement") ||
                  combined.includes("top hung") ||
                  combined.includes("sketch-02") ||
                  combined.includes("sketch-03")
                ) {
                  return "Sand Blasted Glass";
                }
                return "Clear Glass";
              };

              // Group items into Sections (Clear Glass vs Sand Blasted Glass)
              const sectionMap: { [key: string]: GlassItem[] } = {};
              items.forEach((item) => {
                const secKey = getItemCategory(item);
                if (!sectionMap[secKey]) sectionMap[secKey] = [];
                sectionMap[secKey].push(item);
              });

              const sections = Object.entries(sectionMap);

              return (
                <div className="space-y-6">
                  {sections.map(([secName, secItems], sIdx) => {
                    const isSand = secName.includes("Sand");
                    const secTotalQty = secItems.reduce((acc, i) => acc + getDguEffectiveQtyAndSqm(i).qty, 0);
                    const secTotalSqm = secItems.reduce((acc, i) => acc + getDguEffectiveQtyAndSqm(i).sqm, 0);

                    const glassSpecText = secItems[0]?.glassType || pi.glassDescription || "—";
                    const secTitle = secItems[0]?.sectionName || secName;

                    return (
                      <div key={sIdx} className="border-2 border-slate-900 rounded-lg overflow-hidden">
                        {/* Section Title Banner */}
                        <div className="bg-slate-100 p-2.5 border-b-2 border-slate-900">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-black text-slate-900 text-xs uppercase tracking-wide flex items-center gap-2">
                              <span className="w-2.5 h-2.5 bg-[#1a3a6b] rounded-full inline-block"></span>
                              Section {sIdx + 1}: {secName} ({secTitle})
                            </span>
                            <span className="font-bold text-[11px] text-slate-700">
                              Subtotal Qty: <strong className="text-[#1a3a6b] font-mono">{secTotalQty}</strong> | SQM: <strong className="text-emerald-800 font-mono">{secTotalSqm.toFixed(2)}</strong>
                            </span>
                          </div>
                          <div className="text-[11px] font-extrabold italic text-slate-900 bg-white p-2 rounded border border-slate-300">
                            {glassSpecText}
                          </div>
                        </div>

                        {/* Section Item Table */}
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-[#0a1628] text-white font-extrabold uppercase text-[10px] tracking-wider text-center">
                              <th className="border border-slate-700 py-2 px-1 w-10">Sl.</th>
                              <th className="border border-slate-700 py-2 px-2 text-left w-32">Item Code</th>
                              <th className="border border-slate-700 py-1 px-1" colSpan={2}>Measure</th>
                              <th className="border border-slate-700 py-2 px-1 w-14">Qty.</th>
                              <th className="border border-slate-700 py-2 px-2 w-20">Sqm.</th>
                              <th className="border border-slate-700 py-2 px-2 text-left">Remarks</th>
                              <th className="border border-slate-700 py-2 px-2 w-24">Del. Location</th>
                              <th className="border border-slate-700 py-2 px-2 text-left w-36">Sketch</th>
                            </tr>
                            <tr className="bg-slate-200 text-slate-900 font-bold uppercase text-[9px] text-center border-b-2 border-slate-900">
                              <th className="border border-slate-400 py-1"></th>
                              <th className="border border-slate-400 py-1"></th>
                              <th className="border border-slate-400 py-1 w-16">Width</th>
                              <th className="border border-slate-400 py-1 w-16">Height</th>
                              <th className="border border-slate-400 py-1" colSpan={5}></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-300 text-slate-900 font-medium">
                            {secItems.map((item, idx) => {
                              const eff = getDguEffectiveQtyAndSqm(item);
                              return (
                                <tr key={item.id} className="hover:bg-slate-50 border-b border-slate-300">
                                  <td className="border border-slate-300 py-1.5 px-1 text-center font-mono font-bold">{item.srNo || idx + 1}</td>
                                  <td className="border border-slate-300 py-1.5 px-2 font-black font-mono text-[#1a3a6b]">{item.itemCode}</td>
                                  <td className="border border-slate-300 py-1.5 px-1 text-center font-extrabold font-mono">{item.width}</td>
                                  <td className="border border-slate-300 py-1.5 px-1 text-center font-extrabold font-mono">{item.height}</td>
                                  <td className="border border-slate-300 py-1.5 px-1 text-center font-black text-slate-950">{eff.qty}</td>
                                  <td className="border border-slate-300 py-1.5 px-2 text-center font-extrabold text-emerald-800 font-mono">{eff.sqm.toFixed(2)}</td>
                                  <td className="border border-slate-300 py-1.5 px-2 text-[10px] text-slate-800 italic">{item.remarks || "-"}</td>
                                  <td className="border border-slate-300 py-1.5 px-2 text-center font-bold text-slate-700">{item.delLocation || "—"}</td>
                                  <td className="border border-slate-300 py-1.5 px-2 text-[10px] font-mono text-slate-600 font-semibold">{item.sketch || "—"}</td>
                                </tr>
                              );
                            })}

                            {/* Section Subtotal Row */}
                            <tr className="bg-slate-200 font-black border-t-2 border-slate-800 text-slate-950 text-xs">
                              <td colSpan={4} className="py-2 px-3 text-right uppercase tracking-wider">Subtotal ({secName}):</td>
                              <td className="py-2 text-center text-[#1a3a6b] font-mono text-sm">{secTotalQty}</td>
                              <td className="py-2 text-center text-emerald-800 font-mono text-sm">{secTotalSqm.toFixed(2)}</td>
                              <td colSpan={3}></td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* UAE 5% VAT Pricing & Grand Total Summary Box */}
            {(() => {
              const estimatedRatePerSqm = 280; // AED 280 / SQM
              const netAmount = pi.totalSqm * estimatedRatePerSqm;
              const vat5Percent = netAmount * 0.05;
              const grandTotalVatInclusive = netAmount + vat5Percent;

              return (
                <div className="border-4 border-[#0a1628] rounded-lg p-5 bg-[#0a1628] text-white space-y-3 shadow-md">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                    <div>
                      <div className="text-xs uppercase font-extrabold text-[#c5a04f] tracking-wider">
                        {isSticker ? "SEJAL GLASS DUBAI OFFICIAL STICKER BATCH STATUS" : "SEJAL GLASS DUBAI OFFICIAL PI STATUS"}
                      </div>
                      <div className="text-base font-black tracking-tight text-white uppercase mt-0.5">
                        {pi.projectName} - Total Production & Valuation Sheet
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Total Items / Area</div>
                      <div className="text-lg font-black font-mono text-[#fce4b8]">{pi.totalQty} Nos | {pi.totalSqm} SQM</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center pt-1">
                    <div className="bg-[#1a3a6b]/40 p-2.5 rounded border border-[#1a3a6b]">
                      <div className="text-[10px] uppercase font-bold text-slate-300">Unit Rate</div>
                      <div className="text-sm font-black font-mono text-white">AED {estimatedRatePerSqm.toFixed(2)} / SQM</div>
                    </div>
                    <div className="bg-[#1a3a6b]/40 p-2.5 rounded border border-[#1a3a6b]">
                      <div className="text-[10px] uppercase font-bold text-slate-300">Net Amount (excl. VAT)</div>
                      <div className="text-sm font-black font-mono text-cyan-300">AED {netAmount.toFixed(2)}</div>
                    </div>
                    <div className="bg-[#1a3a6b]/40 p-2.5 rounded border border-[#1a3a6b]">
                      <div className="text-[10px] uppercase font-bold text-slate-300">UAE 5% VAT Amount</div>
                      <div className="text-sm font-black font-mono text-amber-300">AED {vat5Percent.toFixed(2)}</div>
                    </div>
                    <div className="bg-[#c5a04f]/20 p-2.5 rounded border border-[#c5a04f]">
                      <div className="text-[10px] uppercase font-extrabold text-[#fce4b8]">Grand Total (VAT Inclusive)</div>
                      <div className="text-base font-black font-mono text-[#fce4b8]">AED {grandTotalVatInclusive.toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Footer & QR Verification */}
            <div className="border-2 border-slate-900 p-4 rounded-lg bg-slate-50 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] font-semibold text-slate-800">
                <div><span className="font-bold text-slate-950">Ref Glass W.O.:</span> {pi.refGlassWo || "—"}</div>
                <div><span className="font-bold text-slate-950">Ref Alum W.O.:</span> {pi.refAlumWo || "—"}</div>
                <div><span className="font-bold text-slate-950">Internal Note:</span> Sejal Glass Manufacturing Plant Inspection Passed</div>
                <div><span className="font-bold text-slate-950">Status:</span> Approved for Factory Production & Scan Verification</div>
              </div>

              <div className="flex justify-between items-end pt-4 border-t border-slate-300">
                <div className="flex items-center gap-3">
                  <div
                    className="w-20 h-20 border border-slate-400 p-1 bg-white rounded"
                    dangerouslySetInnerHTML={{ __html: generateQRCodeSVG(`PI:${pi.piNumber}|JOB:${pi.jobOrderNumber}|PROJ:${pi.projectName}`, 80) }}
                  />
                  <div className="text-[10px] text-slate-600 space-y-0.5 font-medium">
                    <p className="font-extrabold text-[#0a1628]">Sejal Glass Digital Verification System</p>
                    <p className="font-mono">Generated: {formatDubaiDateTime(new Date())}</p>
                    <p className="text-emerald-700 font-bold">Status: UAE Tax & Quality Validated</p>
                  </div>
                </div>

                <div className="text-center space-y-6">
                  <div className="w-56 border-b-2 border-slate-900 mx-auto"></div>
                  <p className="font-extrabold text-[11px] uppercase tracking-wider text-slate-900">
                    {pi.customerName || "AUTHORIZED SIGNATORY"}<br />
                    <span className="text-[10px] font-normal text-slate-600">Authorized Signatory & Factory Stamp</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
      </DialogContent>
    </Dialog>
  );
};
