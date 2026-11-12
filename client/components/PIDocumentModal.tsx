import React, { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Printer,
  CheckCircle,
  FileSpreadsheet,
  Trash2,
  Search,
  Copy,
  Check,
  Building,
  Briefcase,
  Layers,
  Sparkles,
} from "lucide-react";
import { PIMaster, GlassItem } from "@shared/api";
import { formatBatchNumber, formatPlatformDate, getItemFinish } from "@/lib/utils";
import { TableHorizontalScrollWrapper } from "./TableHorizontalScrollWrapper";
import { toast } from "sonner";

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
  const [searchTerm, setSearchTerm] = useState("");
  const [finishFilter, setFinishFilter] = useState<"ALL" | "Colour" | "Clear">("ALL");
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null);

  if (!pi) return null;

  const handleCopyBarcode = (rowId: string, barcode: string) => {
    if (!barcode || barcode === "—") return;
    navigator.clipboard.writeText(barcode);
    setCopiedItemId(rowId);
    toast.success(`Copied barcode: ${barcode}`);
    setTimeout(() => {
      setCopiedItemId((prev) => (prev === rowId ? null : prev));
    }, 2000);
  };

  const batchNumberFormatted = formatBatchNumber(pi.piNumber);

  // Filter items based on search and finish
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const finish = getItemFinish(item);
      if (finishFilter === "Colour" && finish !== "Colour") return false;
      if (finishFilter === "Clear" && finish !== "Clear") return false;

      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase().trim();
      const piVal = String(item.orderNo || item.piNumber || pi.proformaInvNo || pi.piNumber || "").toLowerCase();
      const posVal = String(item.posNo || "").toLowerCase();
      const codeVal = String(item.glassCode || item.itemCode || "").toLowerCase();
      const specVal = String(item.glassType || item.category || "").toLowerCase();
      const obVal = String(item.obNo || pi.obNo || "").toLowerCase();
      const sfoVal = String(item.sfoNo || pi.sfoNo || pi.jobOrderNumber || item.orderNo || "").toLowerCase();
      const batchVal = String(item.batchNo || pi.piNumber || "").toLowerCase();
      const barcodeVal = String(item.barcode || item.serialNumber || "").toLowerCase();

      return (
        piVal.includes(q) ||
        posVal.includes(q) ||
        codeVal.includes(q) ||
        specVal.includes(q) ||
        obVal.includes(q) ||
        sfoVal.includes(q) ||
        batchVal.includes(q) ||
        barcodeVal.includes(q)
      );
    }).sort((a, b) => {
      const posA = a.srNo != null ? a.srNo : parseInt(String(a.posNo || "").replace(/\D/g, ""), 10) || 0;
      const posB = b.srNo != null ? b.srNo : parseInt(String(b.posNo || "").replace(/\D/g, ""), 10) || 0;
      if (posA !== posB) return posA - posB;
      return (a.serialNumber || "").localeCompare(b.serialNumber || "");
    });
  }, [items, searchTerm, finishFilter, pi]);

  const totalQty = useMemo(() => {
    return filteredItems.reduce((acc, curr) => acc + (curr.qty || 1), 0);
  }, [filteredItems]);

  const totalSqm = useMemo(() => {
    return filteredItems.reduce(
      (acc, curr) => acc + (curr.sqm || ((curr.width * curr.height * (curr.qty || 1)) / 1000000)),
      0
    );
  }, [filteredItems]);

  const colourCount = useMemo(() => {
    return items.filter((i) => getItemFinish(i) === "Colour").reduce((acc, curr) => acc + (curr.qty || 1), 0);
  }, [items]);

  const clearCount = useMemo(() => {
    return items.filter((i) => getItemFinish(i) === "Clear").reduce((acc, curr) => acc + (curr.qty || 1), 0);
  }, [items]);

  const handlePrint = () => {
    try {
      const printFrame = document.createElement("iframe");
      printFrame.name = "batch-print-frame";
      printFrame.style.position = "fixed";
      printFrame.style.right = "0";
      printFrame.style.bottom = "0";
      printFrame.style.width = "0";
      printFrame.style.height = "0";
      printFrame.style.border = "none";
      document.body.appendChild(printFrame);

      const frameDoc = printFrame.contentWindow?.document;
      if (!frameDoc) {
        window.print();
        return;
      }

      const rowsHtml = filteredItems.map((item, idx) => {
        const finish = getItemFinish(item);
        const isColour = finish === "Colour";
        const itemQty = item.qty || 1;
        const itemSqm = item.sqm || ((item.width * item.height * itemQty) / 1000000);
        const piDisplay = item.orderNo || item.piNumber || pi.proformaInvNo || pi.piNumber || "—";
        const posDisplay = item.posNo || "—";
        const glassCodeDisplay = item.glassCode || item.itemCode || "—";
        const glassTypeDisplay = item.glassType || item.category || "—";
        const obDisplay = item.obNo || pi.obNo || "—";
        const sfoDisplay = item.sfoNo || pi.sfoNo || pi.jobOrderNumber || item.orderNo || "—";
        const batchDisplay = formatBatchNumber(item.batchNo || pi.piNumber || "");
        const barcodeDisplay = item.barcode || item.serialNumber || "—";
        const badgeBg = isColour ? "#f3e8ff" : "#cffafe";
        const badgeColor = isColour ? "#6b21a8" : "#155e75";
        const badgeBorder = isColour ? "#d8b4fe" : "#a5f3fc";

        return `
          <tr style="background: ${idx % 2 === 1 ? '#f8fafc' : '#ffffff'};">
            <td style="text-align: center; font-weight: 700; font-family: monospace;">${item.srNo != null ? item.srNo : idx + 1}</td>
            <td style="font-weight: 700; font-family: monospace; color: #6b21a8;">${piDisplay}</td>
            <td style="text-align: center; font-weight: 700; font-family: monospace;">${posDisplay}</td>
            <td style="text-align: center;">
              <span style="display: inline-block; padding: 1px 6px; border-radius: 9999px; font-size: 8px; font-weight: 800; background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeBorder};">
                ${finish}
              </span>
            </td>
            <td style="text-align: right; font-weight: 700; font-family: monospace;">${item.width}</td>
            <td style="text-align: right; font-weight: 700; font-family: monospace;">${item.height}</td>
            <td style="text-align: center; font-weight: 800; font-family: monospace;">${itemQty}</td>
            <td style="text-align: right; font-weight: 700; font-family: monospace; color: #065f46;">${itemSqm.toFixed(2)}</td>
            <td style="font-weight: 700; font-family: monospace; color: #1e3a8a;">${glassCodeDisplay}</td>
            <td style="font-weight: 600;">${glassTypeDisplay}</td>
            <td style="text-align: center; font-family: monospace;">${obDisplay}</td>
            <td style="text-align: center; font-family: monospace;">${sfoDisplay}</td>
            <td style="text-align: center; font-weight: 700; font-family: monospace; color: #6b21a8;">${batchDisplay}</td>
            <td style="font-family: monospace; font-size: 8.5px; font-weight: 700;">${barcodeDisplay}</td>
          </tr>
        `;
      }).join("");

      const sfoDisplay = pi.sfoNo || items[0]?.sfoNo || pi.jobOrderNumber || "—";
      const obDisplay = pi.obNo || items[0]?.obNo || "—";
      const issueDate = pi.sfoDate || pi.issueDate || formatPlatformDate(pi.createdAt);
      const totalBatchQty = items.reduce((acc, i) => acc + (i.qty || 1), 0);
      const totalBatchArea = items.reduce((acc, i) => acc + (i.sqm || ((i.width * i.height * (i.qty || 1)) / 1000000)), 0).toFixed(2);
      const printDateStr = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Dubai" });
      const printTimeStr = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Dubai" });

      const printHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>Batch_${batchNumberFormatted}_Glass_Details</title>
            <style>
              @page {
                size: A4 landscape;
                margin: 7mm 6mm;
              }
              * { box-sizing: border-box; }
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                color: #0f172a;
                background: #ffffff;
                margin: 0;
                padding: 0;
                font-size: 9px;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .header-card {
                border: 2px solid #0f172a;
                border-radius: 6px;
                margin-bottom: 8px;
                overflow: hidden;
              }
              .top-row {
                background: #0f172a;
                color: #ffffff;
                padding: 6px 10px;
                display: flex;
                align-items: center;
                justify-content: space-between;
              }
              .customer-name {
                font-size: 13px;
                font-weight: 900;
                text-transform: uppercase;
                letter-spacing: 0.5px;
              }
              .project-name {
                font-size: 10px;
                color: #e2e8f0;
                margin-top: 1px;
                font-weight: 600;
              }
              .meta-grid {
                display: grid;
                grid-template-columns: repeat(6, 1fr);
                background: #f8fafc;
                border-top: 1px solid #cbd5e1;
              }
              .meta-cell {
                padding: 4px 8px;
                border-right: 1px solid #cbd5e1;
              }
              .meta-cell:last-child {
                border-right: none;
              }
              .meta-label {
                font-size: 8px;
                font-weight: 800;
                color: #64748b;
                text-transform: uppercase;
                display: block;
              }
              .meta-val {
                font-size: 11px;
                font-weight: 900;
                color: #0f172a;
                font-family: monospace;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 4px;
                font-size: 8.5px;
              }
              thead {
                display: table-header-group;
              }
              tfoot {
                display: table-footer-group;
              }
              tr {
                page-break-inside: avoid;
              }
              th {
                background: #0f172a !important;
                color: #ffffff !important;
                font-weight: 800;
                text-transform: uppercase;
                padding: 4px 3px;
                border: 1px solid #334155;
                font-size: 8px;
                letter-spacing: 0.3px;
              }
              td {
                padding: 3px 4px;
                border: 1px solid #cbd5e1;
                vertical-align: middle;
              }
              .doc-footer {
                margin-top: 6px;
                font-size: 8px;
                color: #64748b;
                display: flex;
                justify-content: space-between;
                border-top: 1px dashed #cbd5e1;
                padding-top: 4px;
              }
            </style>
          </head>
          <body>
            <div class="header-card">
              <div class="top-row">
                <div>
                  <div style="font-size: 8px; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">
                    SEJAL GLASS MANUFACTURING PRODUCTS LLC &bull; BATCH PRODUCTION DETAILS
                  </div>
                  <div class="customer-name">${pi.customerName || "Customer Order"}</div>
                  <div class="project-name">Project: <b>${pi.projectName || "Standard Project"}</b> &bull; Status: <b>${pi.status || "In Production"}</b></div>
                </div>
                <div style="text-align: right; display: flex; gap: 8px;">
                  <div style="background: rgba(255,255,255,0.12); padding: 4px 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2);">
                    <div style="font-size: 7.5px; text-transform: uppercase; color: #cbd5e1; font-weight: 700;">Total Batch Qty</div>
                    <div style="font-size: 13px; font-weight: 900; color: #67e8f9; font-family: monospace;">${totalBatchQty} Nos</div>
                  </div>
                  <div style="background: rgba(255,255,255,0.12); padding: 4px 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2);">
                    <div style="font-size: 7.5px; text-transform: uppercase; color: #cbd5e1; font-weight: 700;">Total Batch Area</div>
                    <div style="font-size: 13px; font-weight: 900; color: #6ee7b7; font-family: monospace;">${totalBatchArea} m²</div>
                  </div>
                </div>
              </div>
              <div class="meta-grid">
                <div class="meta-cell">
                  <span class="meta-label">Batch No</span>
                  <span class="meta-val" style="color: #7e22ce;">${batchNumberFormatted}</span>
                </div>
                <div class="meta-cell">
                  <span class="meta-label">SFO No</span>
                  <span class="meta-val">${sfoDisplay}</span>
                </div>
                <div class="meta-cell">
                  <span class="meta-label">OB No</span>
                  <span class="meta-val">${obDisplay}</span>
                </div>
                <div class="meta-cell">
                  <span class="meta-label">Issue Date</span>
                  <span class="meta-val">${issueDate}</span>
                </div>
                <div class="meta-cell">
                  <span class="meta-label">Colour Glass</span>
                  <span class="meta-val" style="color: #7e22ce;">${colourCount} Pcs</span>
                </div>
                <div class="meta-cell">
                  <span class="meta-label">Clear Glass</span>
                  <span class="meta-val" style="color: #0e7490;">${clearCount} Pcs</span>
                </div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th style="width: 32px; text-align: center;">SL NO.</th>
                  <th style="width: 55px; text-align: left;">PI</th>
                  <th style="width: 40px; text-align: center;">POS NO.</th>
                  <th style="width: 50px; text-align: center;">FINISH</th>
                  <th style="width: 48px; text-align: right;">WIDTH (MM)</th>
                  <th style="width: 48px; text-align: right;">HEIGHT (MM)</th>
                  <th style="width: 35px; text-align: center;">QTY</th>
                  <th style="width: 42px; text-align: right;">SQM</th>
                  <th style="text-align: left;">GLASS CODE</th>
                  <th style="text-align: left;">GLASS TYPE / SPEC</th>
                  <th style="width: 45px; text-align: center;">OB</th>
                  <th style="width: 45px; text-align: center;">SFO</th>
                  <th style="width: 50px; text-align: center;">BATCH</th>
                  <th style="width: 100px; text-align: left;">BARCODE</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
              <tfoot>
                <tr style="background: #e2e8f0; font-weight: 900; font-size: 9px; border-top: 2px solid #0f172a;">
                  <td colspan="4" style="text-align: right; text-transform: uppercase; padding: 5px;">
                    TOTAL (${filteredItems.length} ITEMS):
                  </td>
                  <td colspan="2" style="text-align: center; color: #64748b; font-family: monospace;">—</td>
                  <td style="text-align: center; font-weight: 900; font-family: monospace; color: #1e3a8a; font-size: 10px;">
                    ${totalQty}
                  </td>
                  <td style="text-align: right; font-weight: 900; font-family: monospace; color: #065f46; font-size: 10px;">
                    ${totalSqm.toFixed(2)}
                  </td>
                  <td colspan="6" style="color: #475569; font-size: 8px; font-weight: 600;">
                    Effective total quantity and area for all listed items
                  </td>
                </tr>
              </tfoot>
            </table>

            <div class="doc-footer">
              <span>Printed on: ${printDateStr} at ${printTimeStr} (Dubai Plant Time)</span>
              <span>Sejal Glass Operations System &bull; Batch Production Glass Details</span>
            </div>
          </body>
        </html>
      `;

      frameDoc.open();
      frameDoc.write(printHtml);
      frameDoc.close();

      setTimeout(() => {
        try {
          printFrame.contentWindow?.focus();
          printFrame.contentWindow?.print();
        } catch {
          window.print();
        } finally {
          setTimeout(() => {
            if (document.body.contains(printFrame)) {
              document.body.removeChild(printFrame);
            }
          }, 2000);
        }
      }, 350);
    } catch {
      window.print();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[96vw] xl:max-w-7xl max-h-[94vh] flex flex-col p-0 overflow-hidden bg-slate-50 text-slate-900 border-slate-300 shadow-2xl print:max-h-none print:h-auto print:overflow-visible print:border-none print:shadow-none print:p-0 print:bg-white">
        {/* Header Bar */}
        <DialogHeader className="flex flex-row items-center justify-between px-6 py-3.5 bg-white border-b border-slate-200 shrink-0 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-sm shrink-0">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </div>
            <div>
              <DialogTitle className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                <span>Batch Production Glass Details</span>
                <span className="font-mono text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg text-xs sm:text-sm">
                  Batch {batchNumberFormatted}
                </span>
                <span
                  className={`text-[11px] font-black px-2.5 py-0.5 rounded-full border ${
                    pi.status === "Completed"
                      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                      : pi.status === "In Production"
                      ? "bg-blue-100 text-blue-800 border-blue-300"
                      : "bg-amber-100 text-amber-800 border-amber-300"
                  }`}
                >
                  {pi.status || "Pending"}
                </span>
              </DialogTitle>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {items.length} total glass items loaded • {pi.projectName || "Standard Project"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onDeletePI && (
              <Button
                onClick={() => {
                  onDeletePI(pi.id);
                  onOpenChange(false);
                }}
                size="sm"
                variant="outline"
                className="border-red-200 text-red-600 hover:bg-red-50 text-xs gap-1 font-bold h-8 rounded-lg"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Batch
              </Button>
            )}
            {onReleaseToProduction && (
              <Button
                onClick={() => onReleaseToProduction(pi.id)}
                disabled={pi.status === "In Production" || pi.status === "Completed"}
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white gap-1 text-xs font-bold h-8 rounded-lg"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                {pi.status === "In Production"
                  ? "In Production"
                  : pi.status === "Completed"
                  ? "Completed"
                  : "Release to Production"}
              </Button>
            )}
            <Button
              onClick={handlePrint}
              size="sm"
              variant="outline"
              className="border-slate-300 text-slate-700 hover:bg-slate-100 text-xs gap-1.5 font-bold h-8 rounded-lg"
            >
              <Printer className="w-3.5 h-3.5" /> Print Details
            </Button>
          </div>
        </DialogHeader>

        {/* Scrollable Container with Batch Metadata + 14-Column Table */}
        <div id="printable-batch-details" className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 print:p-0 print:overflow-visible">
          {/* Metadata Banner Card */}
          <div className="bg-white border-2 border-slate-900 rounded-xl overflow-hidden shadow-xs print:border print:shadow-none">
            {/* Top Identity Row */}
            <div className="p-3.5 sm:p-4 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-slate-900">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-600/30 border border-purple-400/40 flex items-center justify-center font-bold text-white shrink-0">
                  <Building className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black tracking-tight uppercase">
                    {pi.customerName || "SEJAL GLASS MANUFACTURING PRODUCTS LLC"}
                  </h2>
                  <div className="flex items-center gap-2 text-xs font-semibold text-purple-200 mt-0.5">
                    <Briefcase className="w-3.5 h-3.5 text-[#c5a04f]" />
                    <span>Project: <strong className="text-white font-bold">{pi.projectName || "—"}</strong></span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 text-right">
                <div className="bg-white/10 px-3 py-1.5 rounded-lg border border-white/15">
                  <div className="text-[10px] uppercase font-bold text-slate-300">Total Batch Quantity</div>
                  <div className="text-base font-black font-mono text-cyan-300">
                    {items.reduce((acc, i) => acc + (i.qty || 1), 0)} Nos
                  </div>
                </div>
                <div className="bg-white/10 px-3 py-1.5 rounded-lg border border-white/15">
                  <div className="text-[10px] uppercase font-bold text-slate-300">Total Batch Area</div>
                  <div className="text-base font-black font-mono text-emerald-300">
                    {items.reduce((acc, i) => acc + (i.sqm || ((i.width * i.height * (i.qty || 1)) / 1000000)), 0).toFixed(2)} m²
                  </div>
                </div>
              </div>
            </div>

            {/* Metadata Fields Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 divide-x divide-y sm:divide-y-0 divide-slate-200 bg-slate-50 text-xs">
              <div className="p-2.5">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase block">BATCH NO</span>
                <span className="font-mono font-black text-purple-700 text-sm">{batchNumberFormatted}</span>
              </div>
              <div className="p-2.5">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase block">SFO NO</span>
                <span className="font-mono font-bold text-slate-900">{pi.sfoNo || items[0]?.sfoNo || pi.jobOrderNumber || "—"}</span>
              </div>
              <div className="p-2.5">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase block">OB NO</span>
                <span className="font-mono font-bold text-[#1a3a6b]">{pi.obNo || items[0]?.obNo || "—"}</span>
              </div>
              <div className="p-2.5">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase block">ISSUE DATE</span>
                <span className="font-mono font-bold text-slate-800">{pi.sfoDate || pi.issueDate || formatPlatformDate(pi.createdAt)}</span>
              </div>
              <div className="p-2.5">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase block">COLOUR GLASS</span>
                <span className="font-mono font-black text-purple-700">{colourCount} Pcs</span>
              </div>
              <div className="p-2.5">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase block">CLEAR GLASS</span>
                <span className="font-mono font-black text-cyan-700">{clearCount} Pcs</span>
              </div>
            </div>
          </div>

          {/* Interactive Filter & Search Controls (Hidden on print) */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs print:hidden">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-72">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Search POS, Barcode, Spec, SFO..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 h-8 text-xs bg-slate-50 border-slate-200 rounded-lg"
                />
              </div>

              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="text-xs text-purple-700 hover:underline font-bold shrink-0"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
              <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setFinishFilter("ALL")}
                  className={`px-2.5 py-1 rounded-md text-xs font-black transition-all ${
                    finishFilter === "ALL"
                      ? "bg-white text-purple-900 shadow-2xs font-black"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  All ({items.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFinishFilter("Colour")}
                  className={`px-2.5 py-1 rounded-md text-xs font-black transition-all ${
                    finishFilter === "Colour"
                      ? "bg-purple-600 text-white shadow-2xs"
                      : "text-purple-700 hover:text-purple-900"
                  }`}
                >
                  Colour ({colourCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFinishFilter("Clear")}
                  className={`px-2.5 py-1 rounded-md text-xs font-black transition-all ${
                    finishFilter === "Clear"
                      ? "bg-cyan-600 text-white shadow-2xs"
                      : "text-cyan-700 hover:text-cyan-900"
                  }`}
                >
                  Clear ({clearCount})
                </button>
              </div>

              <div className="text-xs font-bold text-slate-500 font-mono">
                Showing <strong className="text-slate-900">{filteredItems.length}</strong> of {items.length}
              </div>
            </div>
          </div>

          {/* ── 14-Column Glass Details Production Table ── */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs print:border-none print:shadow-none">
            <TableHorizontalScrollWrapper>
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#0a1628] text-white font-extrabold uppercase text-[10px] tracking-wider border-b-2 border-slate-900">
                    <th className="py-2.5 px-2 text-center whitespace-nowrap border-r border-slate-800 w-12">
                      SL NO.
                    </th>
                    <th className="py-2.5 px-3 text-left whitespace-nowrap border-r border-slate-800 min-w-[90px]">
                      PI
                    </th>
                    <th className="py-2.5 px-2.5 text-center whitespace-nowrap border-r border-slate-800 w-16">
                      POS NO.
                    </th>
                    <th className="py-2.5 px-2.5 text-center whitespace-nowrap border-r border-slate-800 w-24">
                      FINISH / TYPE
                    </th>
                    <th className="py-2.5 px-2.5 text-right whitespace-nowrap border-r border-slate-800 w-20">
                      WIDTH (MM)
                    </th>
                    <th className="py-2.5 px-2.5 text-right whitespace-nowrap border-r border-slate-800 w-20">
                      HEIGHT (MM)
                    </th>
                    <th className="py-2.5 px-2 text-center whitespace-nowrap border-r border-slate-800 w-14">
                      QTY
                    </th>
                    <th className="py-2.5 px-2.5 text-right whitespace-nowrap border-r border-slate-800 w-18">
                      SQM
                    </th>
                    <th className="py-2.5 px-3 text-left whitespace-nowrap border-r border-slate-800 min-w-[130px]">
                      GLASS CODE
                    </th>
                    <th className="py-2.5 px-3 text-left whitespace-nowrap border-r border-slate-800 min-w-[220px]">
                      GLASS TYPE / SPEC
                    </th>
                    <th className="py-2.5 px-2.5 text-center whitespace-nowrap border-r border-slate-800 min-w-[80px]">
                      OB
                    </th>
                    <th className="py-2.5 px-2.5 text-center whitespace-nowrap border-r border-slate-800 min-w-[80px]">
                      SFO
                    </th>
                    <th className="py-2.5 px-2.5 text-center whitespace-nowrap border-r border-slate-800 min-w-[90px]">
                      BATCH
                    </th>
                    <th className="py-2.5 px-3 text-left whitespace-nowrap min-w-[170px]">
                      BARCODE
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-medium">
                  {filteredItems.length > 0 ? (
                    filteredItems.map((item, idx) => {
                      const finish = getItemFinish(item);
                      const isColour = finish === "Colour";
                      const itemQty = item.qty || 1;
                      const itemSqm = item.sqm || (item.width * item.height * itemQty) / 1000000;
                      const piDisplay = item.orderNo || item.piNumber || pi.proformaInvNo || pi.piNumber || "—";
                      const posDisplay = item.posNo || "—";
                      const glassCodeDisplay = item.glassCode || item.itemCode || "—";
                      const glassTypeDisplay = item.glassType || item.category || "—";
                      const obDisplay = item.obNo || pi.obNo || "—";
                      const sfoDisplay = item.sfoNo || pi.sfoNo || pi.jobOrderNumber || item.orderNo || "—";
                      const batchDisplay = formatBatchNumber(item.batchNo || pi.piNumber || "");
                      const barcodeDisplay = item.barcode || item.serialNumber || "—";

                      return (
                        <tr
                          key={item.id || idx}
                          className="hover:bg-purple-50/50 transition-colors border-b border-slate-200"
                        >
                          {/* 1. SL NO. */}
                          <td className="py-2 px-2 text-center font-mono font-bold text-slate-600 border-r border-slate-200">
                            {item.srNo != null ? item.srNo : idx + 1}
                          </td>

                          {/* 2. PI */}
                          <td className="py-2 px-3 font-mono font-bold text-purple-700 whitespace-nowrap border-r border-slate-200">
                            {piDisplay}
                          </td>

                          {/* 3. POS NO. */}
                          <td className="py-2 px-2.5 text-center font-mono font-bold text-slate-800 border-r border-slate-200">
                            {posDisplay}
                          </td>

                          {/* 4. FINISH / TYPE */}
                          <td className="py-2 px-2.5 text-center whitespace-nowrap border-r border-slate-200">
                            {isColour ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-200">
                                Colour
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-cyan-100 text-cyan-800 border border-cyan-200">
                                Clear
                              </span>
                            )}
                          </td>

                          {/* 5. WIDTH (MM) */}
                          <td className="py-2 px-2.5 text-right font-mono font-extrabold text-slate-900 border-r border-slate-200">
                            {item.width}
                          </td>

                          {/* 6. HEIGHT (MM) */}
                          <td className="py-2 px-2.5 text-right font-mono font-extrabold text-slate-900 border-r border-slate-200">
                            {item.height}
                          </td>

                          {/* 7. QTY */}
                          <td className="py-2 px-2 text-center font-mono font-black text-slate-950 border-r border-slate-200">
                            {itemQty}
                          </td>

                          {/* 8. SQM */}
                          <td className="py-2 px-2.5 text-right font-mono font-extrabold text-emerald-800 border-r border-slate-200">
                            {itemSqm.toFixed(2)}
                          </td>

                          {/* 9. GLASS CODE */}
                          <td className="py-2 px-3 font-mono font-bold text-[#1a3a6b] whitespace-nowrap border-r border-slate-200">
                            {glassCodeDisplay}
                          </td>

                          {/* 10. GLASS TYPE / SPEC */}
                          <td className="py-2 px-3 text-slate-900 font-semibold border-r border-slate-200 min-w-[220px]">
                            {glassTypeDisplay}
                          </td>

                          {/* 11. OB */}
                          <td className="py-2 px-2.5 text-center font-mono font-bold text-slate-700 whitespace-nowrap border-r border-slate-200">
                            {obDisplay}
                          </td>

                          {/* 12. SFO */}
                          <td className="py-2 px-2.5 text-center font-mono font-bold text-slate-700 whitespace-nowrap border-r border-slate-200">
                            {sfoDisplay}
                          </td>

                          {/* 13. BATCH */}
                          <td className="py-2 px-2.5 text-center font-mono font-bold text-purple-700 whitespace-nowrap border-r border-slate-200">
                            {batchDisplay}
                          </td>

                          {/* 14. BARCODE */}
                          <td className="py-2 px-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-[11px] font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 tracking-tight">
                                {barcodeDisplay}
                              </span>
                              {barcodeDisplay !== "—" && (
                                <button
                                  type="button"
                                  onClick={() => handleCopyBarcode(item.id || `item-${idx}`, barcodeDisplay)}
                                  className="text-slate-400 hover:text-purple-600 p-0.5 rounded transition-colors print:hidden cursor-pointer"
                                  title="Copy barcode to clipboard"
                                >
                                  {copiedItemId === (item.id || `item-${idx}`) ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={14} className="py-8 text-center text-slate-400 italic">
                        No glass items found matching current search or filters.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-black text-slate-950 text-xs border-t-2 border-slate-900">
                    <td colSpan={4} className="py-3 px-3 text-right uppercase tracking-wider">
                      TOTAL ({filteredItems.length} ITEMS):
                    </td>
                    <td colSpan={2} className="py-3 px-2 text-center text-slate-400 font-mono text-[11px]">
                      —
                    </td>
                    <td className="py-3 px-2 text-center font-mono font-black text-[#1a3a6b] text-sm">
                      {totalQty}
                    </td>
                    <td className="py-3 px-2.5 text-right font-mono font-black text-emerald-800 text-sm">
                      {totalSqm.toFixed(2)}
                    </td>
                    <td colSpan={6} className="py-3 px-3 text-slate-500 font-semibold text-[11px]">
                      Sum of effective quantities and area for displayed items
                    </td>
                  </tr>
                </tfoot>
              </table>
            </TableHorizontalScrollWrapper>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
