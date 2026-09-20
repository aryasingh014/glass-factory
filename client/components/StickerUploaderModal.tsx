import React, { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  FileText,
  Upload,
  ArrowRight,
  FileCheck,
  Barcode,
  Search,
  Trash2,
  Plus,
  ShieldCheck,
  Sparkles,
  Palette,
  Check,
  AlertTriangle,
  RefreshCw,
  Clock,
  Calendar,
  Boxes,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import { formatPlatformDateTime, formatBatchNumber } from "@/lib/utils";
import * as pdfjsLib from "pdfjs-dist";
import { formatSejalBarcode } from "@/lib/barcode";

// Set pdf.js worker URL to local public asset for fast offline/local compatibility
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";

interface StickerUploaderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (data: { items: any[]; batchNo: string; sfoNo: string }) => void;
}

export interface ParsedStickerItem {
  stickerNo: number;
  orderNo: string;
  obNo: string;
  sfoNo: string;
  batchNo: string;
  posNo: string;
  qty: number;        // Single sticker piece unit qty (default = 1)
  lineQty: number;    // Top header order position total qty (e.g. 5, 27)
  rackNo: string;     // Right side down rack / lot # (e.g. "1", "2", "3")
  width: number;
  height: number;
  sqm: number;
  barcode: string;
  customerName: string;
  projectName: string;
  glassCode: string;
  glassType: string;
  colorOrClear: "Clear" | "Colour";
  glassColor: string;
  glassCategory?: "DGU" | "Lamination" | "DLGU";
  makeup?: string;
  optDate: string;
  delDate: string;
}

export const StickerUploaderModal: React.FC<StickerUploaderModalProps> = ({ open, onOpenChange, onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [customerName, setCustomerName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [sfoNo, setSfoNo] = useState("");
  const [obNo, setObNo] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [optDate, setOptDate] = useState("");
  const [batchTitle, setBatchTitle] = useState("");

  // Glass Sticker Finish: Colour or Clear
  const [glassCategory, setGlassCategory] = useState<"Clear" | "Colour">("Clear");
  // Glass Product / Process Category: DGU, Lamination, or DLGU
  const [productCategory, setProductCategory] = useState<"DGU" | "Lamination" | "DLGU">("DGU");
  const [autoDetectedMessage, setAutoDetectedMessage] = useState<string | null>(null);

  // Raw 1-per-sticker items extracted from PDF (for backend production import & sheet tracking)
  const [rawExtractedItems, setRawExtractedItems] = useState<ParsedStickerItem[]>([]);
  const [parsedRows, setParsedRows] = useState<ParsedStickerItem[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isValidated, setIsValidated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [parsingProgress, setParsingProgress] = useState<number>(0);
  const [modalSearchTerm, setModalSearchTerm] = useState("");

  // Duplicate PDF Detection State (1 PDF cannot be uploaded twice)
  const [isPdfDuplicate, setIsPdfDuplicate] = useState(false);
  const [duplicateBatchInfo, setDuplicateBatchInfo] = useState<any | null>(null);
  const [checkingPdfDuplicate, setCheckingPdfDuplicate] = useState(false);
  const [uploadDateTime, setUploadDateTime] = useState<string>("");

  const resetForm = () => {
    setFile(null);
    setIsDragging(false);
    setCustomerName("");
    setProjectName("");
    setSfoNo("");
    setObNo("");
    setBatchNo("");
    setDeliveryDate("");
    setOptDate("");
    setBatchTitle("");
    setGlassCategory("Clear");
    setProductCategory("DGU");
    setAutoDetectedMessage(null);
    setRawExtractedItems([]);
    setParsedRows([]);
    setValidationErrors([]);
    setIsValidated(false);
    setParsingProgress(0);
    setModalSearchTerm("");
    setIsPdfDuplicate(false);
    setDuplicateBatchInfo(null);
    setCheckingPdfDuplicate(false);
    setUploadDateTime("");
  };

  useEffect(() => {
    if (open) {
      resetForm();
    }
  }, [open]);

  // Apply chosen batch finish (Clear/Colour) to all rows in the parsed table
  const applyFinishToAllRows = (finish: "Clear" | "Colour") => {
    const updated = parsedRows.map((r) => ({
      ...r,
      colorOrClear: finish,
      glassColor: finish === "Colour" ? "Coloured Glass" : "Clear Float",
      glassType: r.glassType
        ? (finish === "Colour" && !r.glassType.toLowerCase().includes("colour") && !r.glassType.toLowerCase().includes("tint") && !r.glassType.toLowerCase().includes("syp") && !r.glassType.toLowerCase().includes("stopray")
            ? r.glassType.replace(/clear/gi, "COLOURED")
            : (finish === "Clear" && (r.glassType.toLowerCase().includes("coloured") || r.glassType.toLowerCase().includes("color"))
                ? r.glassType.replace(/coloured|color/gi, "CLEAR")
                : r.glassType))
        : (finish === "Colour" ? "6MM COLOURED TEMPERED" : "6MM CLEAR TEMPERED"),
    }));
    setParsedRows(updated);

    const updatedRaw = rawExtractedItems.map((r) => ({
      ...r,
      colorOrClear: finish,
      glassColor: finish === "Colour" ? "Coloured Glass" : "Clear Float",
      glassType: r.glassType
        ? (finish === "Colour" && !r.glassType.toLowerCase().includes("colour") && !r.glassType.toLowerCase().includes("tint") && !r.glassType.toLowerCase().includes("syp") && !r.glassType.toLowerCase().includes("stopray")
            ? r.glassType.replace(/clear/gi, "COLOURED")
            : (finish === "Clear" && (r.glassType.toLowerCase().includes("coloured") || r.glassType.toLowerCase().includes("color"))
                ? r.glassType.replace(/coloured|color/gi, "CLEAR")
                : r.glassType))
        : (finish === "Colour" ? "6MM COLOURED TEMPERED" : "6MM CLEAR TEMPERED"),
    }));
    setRawExtractedItems(updatedRaw);

    toast.success(`Applied ${finish === "Colour" ? "Coloured Glass" : "Clear Glass"} to all ${updated.length} stickers`);
  };

  // Check if this PDF file or batch was already uploaded in the database
  const checkPdfDuplicate = async (
    fileObj: File | null,
    sfo: string,
    batch: string,
    title: string,
    extractedItems: ParsedStickerItem[]
  ) => {
    setCheckingPdfDuplicate(true);
    try {
      const res = await fetch("/api/sticker/check-duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: fileObj?.name || "",
          sfoNo: sfo,
          batchNo: batch,
          batchTitle: title,
          barcodes: extractedItems.map((r) => r.barcode).filter(Boolean),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.isPdfDuplicate) {
          setIsPdfDuplicate(true);
          setDuplicateBatchInfo(data.existingBatch);
          toast.error(`This PDF "${fileObj?.name || data.existingBatch?.fileName}" has already been uploaded previously!`);
        } else {
          setIsPdfDuplicate(false);
          setDuplicateBatchInfo(null);
        }
      }
    } catch (err) {
      console.error("PDF duplicate check error:", err);
    } finally {
      setCheckingPdfDuplicate(false);
    }
  };

  // Robust PDF Sticker Parser Logic
  const processUploadedPdf = async (uploadedFile: File) => {
    setFile(uploadedFile);
    setValidationErrors([]);
    setIsValidated(false);
    setLoading(true);
    setParsingProgress(0);
    setIsPdfDuplicate(false);
    setDuplicateBatchInfo(null);

    try {
      const arrayBuffer = await uploadedFile.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;

      const totalPages = pdf.numPages;
      if (totalPages === 0) {
        setValidationErrors(["Uploaded PDF contains no pages."]);
        setIsValidated(true);
        setLoading(false);
        return;
      }

      const extractedItems: ParsedStickerItem[] = [];
      const errors: string[] = [];

      let detectedCustomer = "";
      let detectedProject = "";
      let detectedSFO = "";
      let detectedOB = "";
      let detectedBatch = "";
      let detectedDelDate = "";
      let detectedOptDate = "";
      let fullCorpusText = "";

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        setParsingProgress(Math.round((pageNum / totalPages) * 100));

        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();

        const textBlocks = (textContent.items as any[])
          .map((item) => ({
            text: (item.str || "").trim(),
            x: Math.round((item.transform[4] || 0) * 10) / 10,
            y: Math.round((item.transform[5] || 0) * 10) / 10,
          }))
          .filter((b) => b.text.length > 0);

        const fullPageText = textBlocks.map((b) => b.text).join(" ");
        fullCorpusText += " " + fullPageText;

        // 1. Dynamic Barcode Extraction
        const barcodeBlock = textBlocks.find((b) => {
          const clean = b.text.replace(/[\s-]/g, "");
          return /^\d{10,24}$/.test(clean) || /^[A-Z0-9]{10,24}$/i.test(clean);
        });

        // 2. Locate Header Row dynamically (looking for Order / OB / SFO / Batch / POS / Qty / Width / Height)
        const orderHeader = textBlocks.find((b) => /order\s*(#|no)?/i.test(b.text));
        const headerY = orderHeader ? orderHeader.y : 148;

        // Extract value row blocks sitting directly below header
        const valBlocks = textBlocks.filter((b) => {
          const isBelow = b.y >= headerY - 26 && b.y <= headerY - 6;
          const isExcluded = /del\.?\s*date|project|opt\.?\s*date|customer|glass/i.test(b.text);
          return isBelow && !isExcluded && b.x < 280;
        });

        let orderNo = "";
        let obNoVal = "";
        let sfoNoVal = "";
        let batchNoVal = "";
        let posNoVal = "";
        let lineQtyVal = 1;
        let widthVal = 0;
        let heightVal = 0;

        // Position-based or coordinate-based extraction from value row
        valBlocks.forEach((b) => {
          if (b.x < 38) orderNo = b.text;
          else if (b.x < 72) obNoVal = b.text;
          else if (b.x < 108) sfoNoVal = b.text;
          else if (b.x < 144) batchNoVal = b.text;
          else if (b.x < 176) posNoVal = b.text;
          else if (b.x < 208) lineQtyVal = parseInt(b.text, 10) || 1;
          else if (b.x < 238) widthVal = parseFloat(b.text) || 0;
          else if (b.x >= 238 && b.x < 275) heightVal = parseFloat(b.text) || 0;
        });

        // Guard against header labels captured as values
        if (/order|ob|sfo|batch|pos|qty|width|height|project|del|opt/i.test(orderNo)) orderNo = "";
        if (/order|ob|sfo|batch|pos|qty|width|height/i.test(obNoVal)) obNoVal = "";
        if (/order|ob|sfo|batch|pos|qty|width|height/i.test(sfoNoVal)) sfoNoVal = "";
        if (/order|ob|sfo|batch|pos|qty|width|height/i.test(batchNoVal)) batchNoVal = "";

        // Dynamic Pattern Matching Fallbacks across entire page text
        if (!orderNo) {
          const m = fullPageText.match(/Order\s*(?:#|No)?[:\s]*([A-Za-z0-9\-\/]+)/i);
          if (m && !/order|ob|sfo/i.test(m[1])) orderNo = m[1];
        }
        if (!obNoVal) {
          const m = fullPageText.match(/OB\s*(?:#|No)?[:\s]*([A-Za-z0-9\-\/]+)/i);
          if (m && !/order|ob|sfo/i.test(m[1])) obNoVal = m[1];
        }
        if (!sfoNoVal) {
          const m = fullPageText.match(/SFO\s*(?:#|No)?[:\s]*([A-Za-z0-9\-\/]+)/i);
          if (m && !/order|ob|sfo/i.test(m[1])) sfoNoVal = m[1];
        }
        if (!batchNoVal) {
          const m = fullPageText.match(/Batch\s*(?:#|No)?[:\s]*([A-Za-z0-9\-\/]+)/i);
          if (m && !/order|ob|sfo/i.test(m[1])) batchNoVal = m[1];
        }
        if (!posNoVal) {
          const m = fullPageText.match(/POS\s*(?:#|No)?[:\s]*(\d+)/i);
          if (m) posNoVal = m[1];
        }

        // Dynamic dimension extraction if coordinates were offset
        if (!widthVal || !heightVal) {
          const dimMatch = fullPageText.match(/\b(\d{2,4})\s*[xX*]\s*(\d{2,4})\b/);
          if (dimMatch) {
            widthVal = parseFloat(dimMatch[1]) || 1000;
            heightVal = parseFloat(dimMatch[2]) || 1000;
          }
        }
        if (!widthVal) widthVal = 1000;
        if (!heightVal) heightVal = 1000;

        // Deterministic barcode fallback based on sticker page / position
        const cleanExtractedBarcode = barcodeBlock ? barcodeBlock.text.replace(/[\s-]/g, "") : "";
        const finalBarcode = cleanExtractedBarcode || formatSejalBarcode(sfoNoVal || detectedSFO || orderNo || `SFO${pageNum}`, posNoVal || pageNum);

        // 3. Dynamic Customer Name Extraction
        const custCandidates = textBlocks.filter((b) => {
          const text = b.text.trim();
          if (text.length < 3) return false;
          if (/order|sfo|batch|ob|width|height|qty|pos|opt\.?date|del\.?date|project|glass\s*code|cut\//i.test(text)) return false;
          if (/^\d+([xX*]\d+)?$/.test(text)) return false;
          // Look for company keywords or location in the upper middle area below header
          const hasCompanyTerm = /\b(l\.?l\.?c|llc|ltd|limited|inc|corp|co\.|aluminium|aluminum|glass|industries|fitout|contracting|fabrication|facades|metals|cladding|systems|architecture|trading)\b/i.test(text);
          const inCustomerZone = b.y >= headerY - 50 && b.y <= headerY - 20;
          return hasCompanyTerm || inCustomerZone;
        });

        let custName = "";
        if (custCandidates.length > 0) {
          // Prioritize one with company term
          const priorityCust = custCandidates.find((b) =>
            /\b(l\.?l\.?c|llc|ltd|limited|inc|corp|aluminium|aluminum|glass|industries|fitout|contracting|fabrication|facades|metals)\b/i.test(b.text)
          );
          custName = (priorityCust || custCandidates[0]).text.trim();
        }
        if (!detectedCustomer && custName) detectedCustomer = custName;

        // 4. Dynamic Project Name Extraction
        const projHeader = textBlocks.find((b) => /project/i.test(b.text));
        let projName = "";
        if (projHeader) {
          const nextBlock = textBlocks.find(
            (b) => Math.abs(b.y - projHeader.y) <= 6 && b.x > projHeader.x && !/project/i.test(b.text)
          );
          if (nextBlock) {
            projName = nextBlock.text.replace(/^[:;]\s*/, "").trim();
          } else {
            projName = projHeader.text.replace(/^PROJECT[:;\s]*/i, "").trim();
          }
        }
        if (!projName) {
          const projMatch = fullPageText.match(/PROJECT[:;\s]+([A-Za-z0-9_\-\s]+?)(?=\s+(?:GLASS|CUT|OPT|DEL|MADE|\d{2}\/)|$)/i);
          if (projMatch) projName = projMatch[1].trim();
        }
        if (!detectedProject && projName) detectedProject = projName;

        // 5. Dynamic Glass Code Extraction
        const codeHeader = textBlocks.find((b) => /glass\s*code/i.test(b.text));
        let glassCode = "";
        if (codeHeader) {
          const nextBlock = textBlocks.find(
            (b) => Math.abs(b.y - codeHeader.y) <= 6 && b.x > codeHeader.x && !/glass\s*code/i.test(b.text)
          );
          if (nextBlock) {
            glassCode = nextBlock.text.replace(/^[:;]\s*/, "").trim();
          } else {
            glassCode = codeHeader.text.replace(/^Glass Code[:;\s]*/i, "").trim();
          }
        }
        if (!glassCode) {
          const codeMatch = fullPageText.match(/Glass Code[:;\s]*([A-Za-z0-9_\-\s]+?)(?=\s+(?:CUT|OPT|DEL|\d{2}\/)|$)/i);
          if (codeMatch) glassCode = codeMatch[1].trim();
        }
        if (!glassCode) {
          glassCode = `GL ${posNoVal || pageNum}`;
        }

        // 6. Dynamic Glass Specification / Description Extraction
        const cutBlock = textBlocks.find((b) => /CUT\//i.test(b.text));
        let primaryPane = "";
        if (cutBlock) {
          const candidates = textBlocks.filter(
            (b) => b.text.trim().length > 0 && b.y > cutBlock.y && b.y <= cutBlock.y + 30 && b.x < 80 && !/PROJECT|FITOUT|ALUMINIUM|CUSTOMER|ORDER/i.test(b.text)
          );
          candidates.sort((a, b) => a.y - b.y);
          primaryPane = candidates[0]?.text?.trim() || "";
        }

        if (!primaryPane) {
          const directPane = textBlocks.find(
            (b) => b.text.trim().length > 0 && b.y >= 70 && b.y <= 110 && b.x < 80 && /\b(\d+MM|CLEAR|STOPRAY|SUNGUARD|SN\b|SYP|YKN|YBR|TINT|TEMPERED|LAM|FLOAT)\b/i.test(b.text)
          );
          primaryPane = directPane?.text?.trim() || "";
        }
        if (!primaryPane) {
          const glassSpecMatch = fullPageText.match(/\b(\d+MM\s+[A-Za-z0-9\s\/\+\-]+?)(?=\s+(?:PROJECT|Glass Code|CUT|OPT|DEL|\d{2}\/)|$)/i);
          if (glassSpecMatch) primaryPane = glassSpecMatch[1].trim();
        }
        if (!primaryPane) {
          primaryPane = "CLEAR FLOAT";
        }

        const primaryLower = primaryPane.toLowerCase();
        const isPrimaryColour =
          primaryLower.includes("stopray") ||
          primaryLower.includes("sunguard") ||
          primaryLower.includes("sn ") ||
          primaryLower.includes("sn40") ||
          primaryLower.includes("sn50") ||
          primaryLower.includes("sn70") ||
          primaryLower.includes("syp") ||
          primaryLower.includes("ykn") ||
          primaryLower.includes("ybr") ||
          primaryLower.includes("guardian") ||
          primaryLower.includes("grey") ||
          primaryLower.includes("gray") ||
          primaryLower.includes("bronze") ||
          primaryLower.includes("bronz") ||
          primaryLower.includes("blue") ||
          primaryLower.includes("green") ||
          primaryLower.includes("tint") ||
          primaryLower.includes("sunergy") ||
          primaryLower.includes("cool-lite") ||
          primaryLower.includes("cool lite") ||
          primaryLower.includes("solar") ||
          primaryLower.includes("reflective") ||
          primaryLower.includes("antelio") ||
          primaryLower.includes("planibel") ||
          primaryLower.includes("coat") ||
          primaryLower.includes("frosted") ||
          primaryLower.includes("ceramic") ||
          primaryLower.includes("frit") ||
          primaryLower.includes("colour") ||
          primaryLower.includes("color");

        const itemColorType: "Clear" | "Colour" = isPrimaryColour ? "Colour" : "Clear";
        const itemColorName = isPrimaryColour ? "Coloured Glass" : "Clear Float";
        const glassType = primaryPane;

        // 7. Dynamic Dates Extraction
        const optMatch = fullPageText.match(/OPT\.?\s*date\.?\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i);
        const optDateVal = optMatch ? optMatch[1] : (detectedOptDate || new Date().toLocaleDateString("en-GB"));
        if (!detectedOptDate && optMatch) detectedOptDate = optMatch[1];

        const delMatch = fullPageText.match(/DEL\.?\s*date\.?\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i);
        const delDateVal = delMatch ? delMatch[1] : (detectedDelDate || new Date().toLocaleDateString("en-GB"));
        if (!detectedDelDate && delMatch) detectedDelDate = delMatch[1];

        // 8. Dynamic Rack / Sheet Extraction
        let rackNoVal = "1";
        const rackBlock = textBlocks.find(
          (b) => /^\d{1,3}$/.test(b.text) && b.x >= 170 && b.y <= 40 && b.text !== String(pageNum) && !b.text.includes("202")
        );
        if (rackBlock) {
          rackNoVal = rackBlock.text;
        }

        if (!detectedSFO && sfoNoVal) detectedSFO = sfoNoVal;
        if (!detectedOB && obNoVal) detectedOB = obNoVal;
        if (!detectedBatch && batchNoVal) detectedBatch = batchNoVal;

        const unitQty = 1;
        const sqm = parseFloat(((widthVal * heightVal * unitQty) / 1000000).toFixed(2));

        extractedItems.push({
          stickerNo: pageNum,
          orderNo: orderNo || (detectedOB || "1"),
          obNo: obNoVal || (detectedOB || ""),
          sfoNo: sfoNoVal || (detectedSFO || ""),
          batchNo: batchNoVal || (detectedBatch || "1"),
          posNo: posNoVal || String(pageNum),
          qty: unitQty,
          lineQty: lineQtyVal || 1,
          rackNo: rackNoVal || "1",
          width: widthVal,
          height: heightVal,
          sqm,
          barcode: finalBarcode,
          customerName: custName || detectedCustomer || "",
          projectName: projName || detectedProject || "",
          glassCode,
          glassType,
          colorOrClear: itemColorType,
          glassColor: itemColorName,
          optDate: optDateVal,
          delDate: delDateVal,
        });
      }

      if (extractedItems.length === 0) {
        errors.push("No valid sticker records parsed from PDF file.");
      }

      // Save raw individual sticker records for production import
      setRawExtractedItems(extractedItems);

      // Combine stickers with identical PI/Order, POS NO, dimensions, and finish into 1 consolidated row for MODAL TABLE DISPLAY ONLY
      const combinedMap = new Map<string, ParsedStickerItem>();

      for (const item of extractedItems) {
        const orderKey = (item.orderNo || "").trim().toLowerCase();
        const posKey = (item.posNo || "").trim().toLowerCase();
        const finishKey = (item.colorOrClear || "Clear").trim().toLowerCase();
        const groupKey = `${orderKey}_pos_${posKey}_${item.width}x${item.height}_${finishKey}`;

        if (combinedMap.has(groupKey)) {
          const existing = combinedMap.get(groupKey)!;
          const addedQty = item.qty || 1;
          const newQty = (existing.qty || 0) + addedQty;
          existing.qty = newQty;
          existing.lineQty = newQty;
          existing.sqm = parseFloat(((existing.width * existing.height * newQty) / 1000000).toFixed(2));
        } else {
          const initialQty = item.qty || 1;
          combinedMap.set(groupKey, {
            ...item,
            qty: initialQty,
            lineQty: initialQty,
            sqm: parseFloat(((item.width * item.height * initialQty) / 1000000).toFixed(2)),
          });
        }
      }

      const consolidatedItems = Array.from(combinedMap.values()).map((item, idx) => ({
        ...item,
        stickerNo: idx + 1,
      }));

      // Count primary pane finishes across all extracted sticker pages
      const totalClearCount = extractedItems.filter((i) => i.colorOrClear === "Clear").length;
      const totalColourCount = extractedItems.filter((i) => i.colorOrClear === "Colour").length;
      const autoFinish: "Clear" | "Colour" = totalColourCount > totalClearCount ? "Colour" : "Clear";

      // Check full text corpus from PDF and makeup lines to distinguish Lamination from DGU
      const fileNameStr = uploadedFile?.name || file?.name || "";
      const corpusLower = (fileNameStr + " " + fullCorpusText).toLowerCase();
      const hasSpacer = corpusLower.includes("spacer") || corpusLower.includes("dgu") || corpusLower.includes("igu");
      const hasInterlayer = corpusLower.includes("pvb") || corpusLower.includes("sgp") || corpusLower.includes("eva") || corpusLower.includes("lamination") || corpusLower.includes("laminated") || corpusLower.includes("lam");

      let detectedCategory: "DGU" | "Lamination" | "DLGU" = "DGU";
      if (hasSpacer && hasInterlayer) {
        detectedCategory = "DLGU";
      } else if (hasInterlayer && !hasSpacer) {
        detectedCategory = "Lamination";
      } else if (hasSpacer) {
        detectedCategory = "DGU";
      } else if (hasInterlayer) {
        detectedCategory = "Lamination";
      }

      setProductCategory(detectedCategory);

      const autoMsg = `${autoFinish === "Colour" ? "Auto-detected: Coloured Glass" : "Auto-detected: Clear Glass"} • ${
        detectedCategory === "DLGU"
          ? "DLGU (Double Laminated Glazed Unit)"
          : detectedCategory === "Lamination"
          ? "Laminated Glass"
          : "DGU / IGU (Double Glazing)"
      }`;
      setGlassCategory(autoFinish);
      setAutoDetectedMessage(autoMsg);

      // Ensure all extracted items and consolidated rows reflect both finish AND process category
      const finalColorName = autoFinish === "Colour" ? "Coloured Glass" : "Clear Float";
      extractedItems.forEach((i) => {
        i.colorOrClear = autoFinish;
        i.glassColor = finalColorName;
        i.glassCategory = detectedCategory;
      });
      consolidatedItems.forEach((i) => {
        i.colorOrClear = autoFinish;
        i.glassColor = finalColorName;
        i.glassCategory = detectedCategory;
      });

      const fallbackBatchId = detectedBatch || (detectedSFO ? `${detectedSFO}-B1` : `B${Date.now().toString().slice(-4)}`);
      setCustomerName(detectedCustomer || "");
      setProjectName(detectedProject || "");
      setSfoNo(detectedSFO || "");
      setObNo(detectedOB || "");
      setBatchNo(detectedBatch || "");
      setDeliveryDate(detectedDelDate || new Date().toLocaleDateString("en-GB"));
      setOptDate(detectedOptDate || new Date().toLocaleDateString("en-GB"));
      setBatchTitle(fallbackBatchId);

      const now = new Date();
      const formattedUploadTime = now.toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
      setUploadDateTime(formattedUploadTime);

      setParsedRows(consolidatedItems);
      setValidationErrors(errors);
      setIsValidated(true);
      toast.success(
        `Parsed ${extractedItems.length} stickers! Verifying PDF batch...`
      );

      // Check if this PDF file or batch was already uploaded in the database
      await checkPdfDuplicate(
        uploadedFile,
        detectedSFO || "",
        detectedBatch || "",
        fallbackBatchId,
        consolidatedItems
      );
    } catch (err: any) {
      toast.error(`Error parsing PDF stickers: ${err.message || String(err)}`);
      setValidationErrors([`PDF Parsing Error: ${err.message || String(err)}`]);
      setIsValidated(true);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;
    processUploadedPdf(uploadedFile);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processUploadedPdf(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  // Batch Check & Correct row field updater
  const handleItemChange = (index: number, field: keyof ParsedStickerItem, value: any) => {
    const updated = [...parsedRows];
    const item = { ...updated[index] };
    const prevOrder = item.orderNo;
    const prevPos = item.posNo;

    if (field === "width" || field === "height" || field === "qty") {
      const numVal = parseFloat(value) || 0;
      (item as any)[field] = numVal;
      item.sqm = parseFloat(((item.width * item.height * item.qty) / 1000000).toFixed(2));
    } else {
      (item as any)[field] = value;
    }

    updated[index] = item;
    setParsedRows(updated);

    // Sync attribute edits to underlying raw items
    if (field !== "qty" && field !== "stickerNo") {
      setRawExtractedItems((prevRaw) =>
        prevRaw.map((raw) => {
          if (raw.orderNo === prevOrder && raw.posNo === prevPos) {
            const updatedRaw = { ...raw, [field]: value };
            if (field === "width" || field === "height") {
              const w = field === "width" ? (parseFloat(value) || 0) : raw.width;
              const h = field === "height" ? (parseFloat(value) || 0) : raw.height;
              updatedRaw.sqm = parseFloat(((w * h * (raw.qty || 1)) / 1000000).toFixed(2));
            }
            return updatedRaw;
          }
          return raw;
        })
      );
    }
  };

  // Delete individual sticker row
  const handleRemoveItem = (index: number) => {
    const itemToRemove = parsedRows[index];
    const updated = parsedRows.filter((_, idx) => idx !== index);
    setParsedRows(updated);

    if (itemToRemove) {
      setRawExtractedItems((prevRaw) =>
        prevRaw.filter(
          (raw) =>
            !(
              raw.orderNo === itemToRemove.orderNo &&
              raw.posNo === itemToRemove.posNo &&
              raw.width === itemToRemove.width &&
              raw.height === itemToRemove.height
            )
        )
      );
    }
    toast.info("Sticker item removed from batch preview");
  };

  // Add a new blank sticker item row
  const handleAddBlankItem = () => {
    const nextStickerNo = parsedRows.length + 1;
    const genBarcode = formatSejalBarcode(sfoNo || "1", nextStickerNo);
    const newItem: ParsedStickerItem = {
      stickerNo: nextStickerNo,
      orderNo: obNo || sfoNo || String(nextStickerNo),
      obNo: obNo || "",
      sfoNo: sfoNo || "",
      batchNo: batchNo || "1",
      posNo: String(nextStickerNo),
      qty: 1,
      lineQty: 1,
      rackNo: "1",
      width: 1000,
      height: 1000,
      sqm: 1.0,
      barcode: genBarcode,
      customerName: customerName || "",
      projectName: projectName || "",
      glassCode: `GL ${nextStickerNo}`,
      glassType: glassCategory === "Colour" ? "6MM COLOURED TEMPERED" : "6MM CLEAR TEMPERED",
      colorOrClear: glassCategory,
      glassColor: glassCategory === "Colour" ? "Coloured Glass" : "Clear Float",
      optDate: optDate || new Date().toLocaleDateString("en-GB"),
      delDate: deliveryDate || new Date().toLocaleDateString("en-GB"),
    };

    setParsedRows([...parsedRows, newItem]);
    setRawExtractedItems([...rawExtractedItems, newItem]);
    toast.success("Added new sticker label row to batch");
  };

  const handleConfirmImport = async () => {
    if (parsedRows.length === 0 || validationErrors.length > 0 || isPdfDuplicate) return;

    setLoading(true);
    const finalBatchColor = glassCategory === "Colour" ? "Coloured Glass" : "Clear Glass";

    // Use raw sheet-based items for production import so cutting floor sheets & individual stickers are preserved
    const itemsToImport = rawExtractedItems.length > 0 ? rawExtractedItems : parsedRows;

    try {
      const res = await fetch("/api/sticker/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customerName || itemsToImport[0]?.customerName || "Customer",
          projectName: projectName || itemsToImport[0]?.projectName || "Project",
          sfoNo: sfoNo || itemsToImport[0]?.sfoNo || "",
          obNo: obNo || itemsToImport[0]?.obNo || "",
          batchNo: batchNo || itemsToImport[0]?.batchNo || "1",
          deliveryDate: deliveryDate || itemsToImport[0]?.delDate || new Date().toLocaleDateString("en-GB"),
          optDate: optDate || itemsToImport[0]?.optDate || new Date().toLocaleDateString("en-GB"),
          fileName: file?.name || "Stickers.pdf",
          batchTitle: batchTitle ? batchTitle.replace(/^STK-/i, "").replace(/^B(?=\d)/i, "") : (batchNo || "1"),
          colorOrClear: glassCategory,
          finish: glassCategory,
          glassColor: finalBatchColor,
          glassCategory: productCategory,
          items: itemsToImport.map((i) => ({ ...i, glassCategory: productCategory, finish: glassCategory })),
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || "Failed to process sticker batch import");
      }
      const data = await res.json();

      const effectiveBatch = formatBatchNumber(data.batchNo || batchNo || data.piNumber || "");
      const totalStickers = (data.items || itemsToImport).reduce((acc: number, curr: any) => acc + (curr.qty || 1), 0);
      toast.success(`Sticker Batch (${productCategory} • ${glassCategory === "Colour" ? "Coloured" : "Clear"} - Batch: ${effectiveBatch}) imported successfully with ${totalStickers} stickers!`);
      onSuccess({ items: data.items, batchNo: effectiveBatch, sfoNo: data.sfoNo || sfoNo });
      resetForm();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to import sticker batch");
    } finally {
      setLoading(false);
    }
  };

  // Calculate dynamic batch metrics
  const totalBatchSqm = rawExtractedItems.length > 0
    ? rawExtractedItems.reduce((acc, curr) => acc + (curr.sqm || 0), 0)
    : parsedRows.reduce((acc, curr) => acc + (curr.sqm || 0), 0);
  const totalBatchQty = rawExtractedItems.length > 0
    ? rawExtractedItems.reduce((acc, curr) => acc + (curr.qty || 1), 0)
    : parsedRows.reduce((acc, curr) => acc + (curr.qty || 1), 0);

  // Filter parsed rows for in-modal search
  const filteredRows = parsedRows.filter((row) => {
    if (!modalSearchTerm.trim()) return true;
    const term = modalSearchTerm.toLowerCase();
    return (
      String(row.stickerNo).includes(term) ||
      String(row.posNo).toLowerCase().includes(term) ||
      String(row.barcode).toLowerCase().includes(term) ||
      String(row.glassCode).toLowerCase().includes(term) ||
      String(row.glassType).toLowerCase().includes(term) ||
      String(row.colorOrClear).toLowerCase().includes(term) ||
      String(row.glassColor).toLowerCase().includes(term)
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-6xl h-[92vh] max-h-[92vh] flex flex-col p-4 sm:p-5 bg-white text-slate-900 border-slate-200 shadow-2xl rounded-2xl overflow-hidden top-[50%] -translate-y-1/2 left-[50%] -translate-x-1/2">
        {/* Header — Fixed at top */}
        <DialogHeader className="shrink-0 pb-2 border-b border-slate-100">
          <DialogTitle className="text-lg sm:text-xl font-extrabold flex items-center gap-2 text-purple-700">
            <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" />
            Upload Sticker PDF & Batch Check
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 font-medium">
            Upload factory barcode sticker PDF files. Choose whether the glass stickers are <strong>Clear</strong> or <strong>Coloured</strong>, verify all dimensions and barcodes, and import directly into production.
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable Modal Body Container */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-1 my-1">
          {/* Top Options Grid: Finish (Clear vs Coloured) & Process Category (DGU vs Lamination vs DLGU) side-by-side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
            {/* Glass Sticker Type Question Card: CLEAR vs COLOUR */}
            <div className="p-2.5 sm:p-3 bg-gradient-to-r from-purple-50/90 via-indigo-50/50 to-blue-50/80 rounded-xl border-2 border-purple-200 shadow-2xs space-y-2 flex flex-col justify-between">
              <div className="flex items-center justify-between flex-wrap gap-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-purple-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                    ?
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-1.5">
                      <span>Glass Sticker Finish</span>
                      <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded-full bg-purple-200 text-purple-900 uppercase tracking-wide">Required</span>
                    </h4>
                    <p className="text-[10.5px] text-slate-500 font-medium">
                      Select whether this batch is Clear or Coloured
                    </p>
                  </div>
                </div>

                {autoDetectedMessage && (
                  <div className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-white/90 border border-purple-200 text-purple-800 shadow-2xs">
                    🤖 {autoDetectedMessage}
                  </div>
                )}
              </div>

              {/* Clear vs Colour Interactive Selection Cards */}
              <div className="grid grid-cols-2 gap-2 pt-0.5">
                {/* CLEAR GLASS CARD */}
                <button
                  type="button"
                  onClick={() => {
                    setGlassCategory("Clear");
                    if (parsedRows.length > 0) applyFinishToAllRows("Clear");
                  }}
                  className={`p-2 rounded-xl border-2 text-left transition-all flex items-start gap-2 relative cursor-pointer ${
                    glassCategory === "Clear"
                      ? "border-cyan-500 bg-white ring-2 ring-cyan-200 shadow-sm"
                      : "border-slate-200 bg-white/70 hover:bg-white hover:border-slate-300"
                  }`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    glassCategory === "Clear" ? "bg-cyan-100 text-cyan-700" : "bg-slate-100 text-slate-500"
                  }`}>
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-center gap-1">
                      <span className="font-extrabold text-xs text-slate-900 truncate">Clear Glass</span>
                      {glassCategory === "Clear" && (
                        <span className="text-[8px] font-extrabold px-1 py-0.2 rounded bg-cyan-100 text-cyan-800">Selected</span>
                      )}
                    </div>
                    <p className="text-[9.5px] text-slate-500 leading-tight truncate">
                      Float / Ultra Clear / Low-Iron
                    </p>
                  </div>
                  {glassCategory === "Clear" && (
                    <div className="absolute right-2 top-2 w-3.5 h-3.5 rounded-full bg-cyan-600 text-white flex items-center justify-center">
                      <Check className="w-2.5 h-2.5" />
                    </div>
                  )}
                </button>

                {/* COLOURED GLASS CARD */}
                <button
                  type="button"
                  onClick={() => {
                    setGlassCategory("Colour");
                    if (parsedRows.length > 0) applyFinishToAllRows("Colour");
                  }}
                  className={`p-2 rounded-xl border-2 text-left transition-all flex items-start gap-2 relative cursor-pointer ${
                    glassCategory === "Colour"
                      ? "border-purple-600 bg-white ring-2 ring-purple-200 shadow-sm"
                      : "border-slate-200 bg-white/70 hover:bg-white hover:border-slate-300"
                  }`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    glassCategory === "Colour" ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-500"
                  }`}>
                    <Palette className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-center gap-1">
                      <span className="font-extrabold text-xs text-slate-900 truncate">Coloured Glass</span>
                      {glassCategory === "Colour" && (
                        <span className="text-[8px] font-extrabold px-1 py-0.2 rounded bg-purple-100 text-purple-800">Selected</span>
                      )}
                    </div>
                    <p className="text-[9.5px] text-slate-500 leading-tight truncate">
                      Grey, Bronze, Stopray, Tinted
                    </p>
                  </div>
                  {glassCategory === "Colour" && (
                    <div className="absolute right-2 top-2 w-3.5 h-3.5 rounded-full bg-purple-600 text-white flex items-center justify-center">
                      <Check className="w-2.5 h-2.5" />
                    </div>
                  )}
                </button>
              </div>
            </div>

            {/* Glass Process Category Question Card: DGU vs LAMINATION vs DLGU */}
            <div className="p-2.5 sm:p-3 bg-gradient-to-r from-teal-50/80 via-indigo-50/50 to-amber-50/80 rounded-xl border-2 border-indigo-200 shadow-2xs space-y-2 flex flex-col justify-between">
              <div className="flex items-center justify-between flex-wrap gap-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                    <Layers className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-1.5">
                      <span>Process Category</span>
                      <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded-full bg-indigo-200 text-indigo-900 uppercase tracking-wide">Required</span>
                    </h4>
                    <p className="text-[10.5px] text-slate-500 font-medium">
                      Select DGU, Lamination, or DLGU unit route
                    </p>
                  </div>
                </div>
              </div>

              {/* DGU vs LAMINATION vs DLGU Interactive Selection Cards */}
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2 pt-0.5">
                {/* DGU / IGU CARD */}
                <button
                  type="button"
                  onClick={() => {
                    setProductCategory("DGU");
                    setParsedRows((prev) => prev.map((r) => ({ ...r, glassCategory: "DGU" })));
                    setRawExtractedItems((prev) => prev.map((r) => ({ ...r, glassCategory: "DGU" })));
                    toast.info("Process category set to DGU / IGU (Double Glazing)");
                  }}
                  className={`p-2 rounded-xl border-2 text-left transition-all flex items-start gap-1.5 sm:gap-2 relative cursor-pointer ${
                    productCategory === "DGU"
                      ? "border-teal-600 bg-white ring-2 ring-teal-200 shadow-sm"
                      : "border-slate-200 bg-white/70 hover:bg-white hover:border-slate-300"
                  }`}
                >
                  <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    productCategory === "DGU" ? "bg-teal-100 text-teal-700" : "bg-slate-100 text-slate-500"
                  }`}>
                    <Boxes className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0 pr-3 sm:pr-4">
                    <div className="flex items-center gap-1">
                      <span className="font-extrabold text-[11px] sm:text-xs text-slate-900 truncate">DGU / IGU</span>
                    </div>
                    <p className="text-[9px] text-slate-500 leading-tight truncate">
                      Double Glazing
                    </p>
                  </div>
                  {productCategory === "DGU" && (
                    <div className="absolute right-1.5 top-1.5 w-3.5 h-3.5 rounded-full bg-teal-600 text-white flex items-center justify-center">
                      <Check className="w-2.5 h-2.5" />
                    </div>
                  )}
                </button>

                {/* LAMINATION CARD */}
                <button
                  type="button"
                  onClick={() => {
                    setProductCategory("Lamination");
                    setParsedRows((prev) => prev.map((r) => ({ ...r, glassCategory: "Lamination" })));
                    setRawExtractedItems((prev) => prev.map((r) => ({ ...r, glassCategory: "Lamination" })));
                    toast.info("Process category set to Laminated Glass");
                  }}
                  className={`p-2 rounded-xl border-2 text-left transition-all flex items-start gap-1.5 sm:gap-2 relative cursor-pointer ${
                    productCategory === "Lamination"
                      ? "border-amber-600 bg-white ring-2 ring-amber-200 shadow-sm"
                      : "border-slate-200 bg-white/70 hover:bg-white hover:border-slate-300"
                  }`}
                >
                  <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    productCategory === "Lamination" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
                  }`}>
                    <Layers className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0 pr-3 sm:pr-4">
                    <div className="flex items-center gap-1">
                      <span className="font-extrabold text-[11px] sm:text-xs text-slate-900 truncate">Laminated</span>
                    </div>
                    <p className="text-[9px] text-slate-500 leading-tight truncate">
                      PVB / Autoclave
                    </p>
                  </div>
                  {productCategory === "Lamination" && (
                    <div className="absolute right-1.5 top-1.5 w-3.5 h-3.5 rounded-full bg-amber-600 text-white flex items-center justify-center">
                      <Check className="w-2.5 h-2.5" />
                    </div>
                  )}
                </button>

                {/* DLGU CARD */}
                <button
                  type="button"
                  onClick={() => {
                    setProductCategory("DLGU");
                    setParsedRows((prev) => prev.map((r) => ({ ...r, glassCategory: "DLGU" })));
                    setRawExtractedItems((prev) => prev.map((r) => ({ ...r, glassCategory: "DLGU" })));
                    toast.info("Process category set to DLGU (Double Laminated Glazed Unit)");
                  }}
                  className={`p-2 rounded-xl border-2 text-left transition-all flex items-start gap-1.5 sm:gap-2 relative cursor-pointer ${
                    productCategory === "DLGU"
                      ? "border-purple-600 bg-white ring-2 ring-purple-200 shadow-sm"
                      : "border-slate-200 bg-white/70 hover:bg-white hover:border-slate-300"
                  }`}
                >
                  <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    productCategory === "DLGU" ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-500"
                  }`}>
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0 pr-3 sm:pr-4">
                    <div className="flex items-center gap-1">
                      <span className="font-extrabold text-[11px] sm:text-xs text-slate-900 truncate">DLGU</span>
                    </div>
                    <p className="text-[9px] text-slate-500 leading-tight truncate">
                      2-Stage Double Lam
                    </p>
                  </div>
                  {productCategory === "DLGU" && (
                    <div className="absolute right-1.5 top-1.5 w-3.5 h-3.5 rounded-full bg-purple-600 text-white flex items-center justify-center">
                      <Check className="w-2.5 h-2.5" />
                    </div>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Sticker Batch Header Information (Editable) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-purple-50/60 p-2.5 sm:p-3 rounded-xl border border-purple-200/80">
            <div>
              <Label className="text-purple-900 text-[10px] font-extrabold uppercase tracking-wider">Customer Name</Label>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. BRIGHT PLUS FITOUT"
                className="bg-white border-purple-200 text-slate-900 mt-0.5 h-7.5 text-xs font-bold"
              />
            </div>
            <div>
              <Label className="text-purple-900 text-[10px] font-extrabold uppercase tracking-wider">Project Name</Label>
              <Input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g. PROJECT; VAL_BY_KAS"
                className="bg-white border-purple-200 text-slate-900 mt-0.5 h-7.5 text-xs font-bold"
              />
            </div>
            <div>
              <Label className="text-purple-900 text-[10px] font-extrabold uppercase tracking-wider">Factory Batch #</Label>
              <Input
                value={batchNo}
                onChange={(e) => setBatchNo(e.target.value)}
                placeholder="e.g. 5442"
                className="bg-white border-purple-200 text-purple-700 font-mono font-bold mt-0.5 h-7.5 text-xs"
              />
            </div>
          </div>

          {/* Upload Dropzone (Prominent, sleek & visible immediately) */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl text-center cursor-pointer transition-all ${
              file ? "p-2.5 sm:p-3 bg-emerald-50/40 border-emerald-500" : "p-3.5 sm:p-4 bg-slate-50/80 hover:bg-purple-50/40 border-slate-300 hover:border-purple-500 shadow-2xs"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileUpload}
              className="hidden"
            />
            <div className="flex items-center justify-between flex-wrap gap-2 pointer-events-none px-2">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-2xs ${file ? "bg-emerald-100 text-emerald-600" : "bg-purple-100 text-purple-600"}`}>
                  {file ? <FileCheck className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                </div>
                <div className="text-left">
                  <p className="text-xs font-black text-slate-800">
                    {file ? file.name : "Drop Factory Sticker PDF File (.pdf) here or click to browse"}
                  </p>
                  <p className="text-[10px] text-slate-500 font-medium">
                    {file ? `File loaded (${(file.size / 1024).toFixed(1)} KB)` : "Supports multi-page barcode sticker PDF files with auto dimension and barcode extraction"}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                className={`h-7.5 text-xs font-bold pointer-events-auto shadow-2xs rounded-lg px-3 ${file ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-purple-600 hover:bg-purple-700 text-white"}`}
              >
                {file ? "Change PDF" : "Select PDF"}
              </Button>
            </div>
          </div>

          {/* Parsing Spinner Progress Bar */}
          {loading && (
            <div className="p-4 bg-purple-50 border border-purple-200 rounded-2xl space-y-2 text-center">
              <div className="flex items-center justify-center gap-2 text-xs font-extrabold text-purple-900">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
                <span>Parsing PDF Sticker Pages... {parsingProgress}%</span>
              </div>
              <div className="w-full bg-purple-200 h-2 rounded-full overflow-hidden">
                <div className="bg-purple-600 h-full transition-all duration-200 rounded-full" style={{ width: `${parsingProgress}%` }}></div>
              </div>
            </div>
          )}

          {/* Validation Feedback & Interactive Batch Check & Correct Table */}
          {isValidated && !loading && (
            <div className="space-y-3">
              {validationErrors.length > 0 && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl">
                  <div className="flex items-center gap-2 text-red-700 font-extrabold mb-2 text-xs">
                    <AlertCircle className="w-4 h-4" /> Parsing Errors Found ({validationErrors.length})
                  </div>
                  <ul className="text-xs text-red-600 list-disc pl-5 space-y-1 max-h-32 overflow-y-auto font-mono">
                    {validationErrors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Duplicate PDF Protection Alert Banner */}
              {isPdfDuplicate && (
                <div className="p-4 bg-red-50 border-2 border-red-400 rounded-2xl space-y-2 shadow-xs">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center font-bold shrink-0">
                        <AlertTriangle className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="font-extrabold text-red-900 text-sm flex items-center gap-2">
                          <span>PDF Already Uploaded: "{file?.name || duplicateBatchInfo?.fileName}"</span>
                          <span className="px-2 py-0.5 bg-red-200 text-red-800 text-[10px] rounded-full font-black uppercase">
                            Duplicate Blocked
                          </span>
                        </div>
                        <div className="text-xs text-red-700 font-medium mt-0.5">
                          This PDF sticker batch ({duplicateBatchInfo?.piNumber || `${sfoNo}-B${batchNo}`}) was already uploaded into production on <strong>{duplicateBatchInfo?.createdAt ? new Date(duplicateBatchInfo.createdAt).toLocaleDateString() : "a previous session"}</strong> ({duplicateBatchInfo?.itemsCount || totalBatchQty} stickers). <strong>1 PDF cannot be uploaded 2 times.</strong>
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-red-700 bg-red-100 px-3 py-1.5 rounded-lg border border-red-200">
                      Already in Production Database
                    </span>
                  </div>
                </div>
              )}

              {/* Ready for Production Batch Header (Shown when not duplicate) */}
              {validationErrors.length === 0 && !isPdfDuplicate && (
                <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-2xl flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="w-7 h-7 text-emerald-600 shrink-0" />
                    <div>
                      <div className="font-extrabold text-emerald-900 text-sm flex items-center gap-2">
                        <span>Sticker Batch Extracted & Verified — Ready for Import</span>
                        <span className="px-2 py-0.5 bg-emerald-200 text-emerald-800 text-[10px] rounded-full font-extrabold">
                          {glassCategory === "Colour" ? "Coloured Glass" : "Clear Glass"}
                        </span>
                      </div>
                      <div className="text-xs text-emerald-700 font-medium mt-0.5">
                        {totalBatchQty} total sticker pieces extracted & verified. Matching stickers are combined with consolidated QTY.
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 border-l border-emerald-200/80 pl-4 flex-wrap">
                    <div>
                      <div className="text-[10px] text-slate-500 font-bold uppercase">Total Pieces</div>
                      <div className="text-sm font-extrabold text-slate-800 font-mono">{totalBatchQty} pcs</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-bold uppercase">Total Batch Area</div>
                      <div className="text-lg font-extrabold text-emerald-700 font-mono">{totalBatchSqm.toFixed(2)} m²</div>
                    </div>
                    <div className="border-l border-emerald-200/80 pl-4">
                      <div className="text-[10px] text-slate-500 font-bold uppercase">Uploaded At</div>
                      <div className="text-xs font-black text-emerald-950 font-mono flex items-center gap-1.5 bg-emerald-100/90 px-2.5 py-1 rounded-lg border border-emerald-300 shadow-2xs">
                        <Clock className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                        {formatPlatformDateTime(uploadDateTime || new Date())}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Interactive Batch Check & Correct Table */}
              {parsedRows.length > 0 && (
                <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs">
                  {/* Table Control Header Bar */}
                  <div className="px-4 py-3 bg-slate-100 text-xs font-extrabold text-slate-700 border-b border-slate-200 flex justify-between items-center flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Barcode className="w-4 h-4 text-purple-600" />
                      <span>Batch Check & Correct ({totalBatchQty} Total Pieces)</span>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Search inside parsed stickers */}
                      <div className="relative w-56">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <Input
                          placeholder="Search POS, Finish, Code..."
                          value={modalSearchTerm}
                          onChange={(e) => setModalSearchTerm(e.target.value)}
                          className="pl-8 text-xs bg-white border-slate-200 h-7 rounded-lg"
                        />
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleAddBlankItem}
                        className="h-7 text-xs border-purple-200 text-purple-700 hover:bg-purple-50 font-bold gap-1 rounded-lg"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Row
                      </Button>
                    </div>
                  </div>

                  {/* Scrollable Editable Table with full column visibility matching factory standards */}
                  <div className="max-h-96 overflow-x-auto overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse min-w-[1280px]">
                      <thead className="bg-slate-100 text-slate-700 uppercase border-b-2 border-slate-200 text-[10px] font-black sticky top-0 z-10">
                        <tr>
                          <th className="px-3 py-2.5 w-14 text-center">SL NO.</th>
                          <th className="px-3 py-2.5 w-24 text-center">PI</th>
                          <th className="px-3 py-2.5 w-24 text-center">POS NO.</th>
                          <th className="px-3 py-2.5 w-28">FINISH / TYPE</th>
                          <th className="px-3 py-2.5 w-24 text-center">WIDTH (MM)</th>
                          <th className="px-3 py-2.5 w-24 text-center">HEIGHT (MM)</th>
                          <th className="px-3 py-2.5 w-16 text-center">QTY</th>
                          <th className="px-3 py-2.5 w-20 text-right">SQM</th>
                          <th className="px-3 py-2.5 min-w-[140px]">GLASS CODE</th>
                          <th className="px-3 py-2.5 min-w-[200px]">GLASS TYPE / SPEC</th>
                          <th className="px-3 py-2.5 w-20 text-center">OB</th>
                          <th className="px-3 py-2.5 w-24 text-center">SFO</th>
                          <th className="px-3 py-2.5 w-20 text-center">BATCH</th>
                          <th className="px-3 py-2.5 min-w-[170px]">BARCODE</th>
                          <th className="px-2 py-2.5 w-12 text-center">ACTION</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-800 font-sans">
                        {filteredRows.map((row) => {
                          const realIndex = parsedRows.findIndex((r) => r === row);
                          return (
                            <tr key={realIndex} className="hover:bg-purple-50/50 transition-colors">
                              {/* SL NO. */}
                              <td className="px-3 py-2 font-mono font-bold text-slate-500 text-center text-xs">
                                {row.stickerNo}
                              </td>

                              {/* PI # */}
                              <td className="px-2 py-1.5">
                                <Input
                                  value={row.orderNo || ""}
                                  onChange={(e) => handleItemChange(realIndex, "orderNo", e.target.value)}
                                  className="h-8 text-xs font-mono font-bold text-center text-purple-700 bg-white border-slate-300 focus:border-purple-500 w-full min-w-[75px] px-1"
                                />
                              </td>

                              {/* POS NO. */}
                              <td className="px-2 py-1.5">
                                <Input
                                  value={row.posNo}
                                  onChange={(e) => handleItemChange(realIndex, "posNo", e.target.value)}
                                  className="h-8 text-xs font-black font-mono bg-white border-slate-300 focus:border-purple-500 w-full min-w-[65px] px-2 text-center"
                                />
                              </td>

                              {/* FINISH / TYPE */}
                              <td className="px-2 py-1.5 align-middle">
                                <span
                                  className={`inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-xs font-black border whitespace-nowrap min-w-[75px] ${
                                    row.colorOrClear === "Colour"
                                      ? "bg-purple-100 text-purple-800 border-purple-200"
                                      : "bg-cyan-100 text-cyan-800 border-cyan-200"
                                  }`}
                                >
                                  {row.colorOrClear === "Colour" ? "Colour" : "Clear"}
                                </span>
                              </td>

                              {/* WIDTH (MM) */}
                              <td className="px-2 py-1.5">
                                <Input
                                  type="number"
                                  value={row.width}
                                  onChange={(e) => handleItemChange(realIndex, "width", e.target.value)}
                                  className="h-8 text-xs font-black font-mono text-slate-900 bg-white border-slate-300 focus:border-purple-500 w-full min-w-[80px] px-2 text-center"
                                />
                              </td>

                              {/* HEIGHT (MM) */}
                              <td className="px-2 py-1.5">
                                <Input
                                  type="number"
                                  value={row.height}
                                  onChange={(e) => handleItemChange(realIndex, "height", e.target.value)}
                                  className="h-8 text-xs font-black font-mono text-slate-900 bg-white border-slate-300 focus:border-purple-500 w-full min-w-[80px] px-2 text-center"
                                />
                              </td>

                              {/* QTY */}
                              <td className="px-2 py-1.5">
                                <Input
                                  type="number"
                                  value={row.qty}
                                  onChange={(e) => handleItemChange(realIndex, "qty", e.target.value)}
                                  className="h-8 text-xs font-bold font-mono text-center bg-white border-slate-300 focus:border-purple-500 w-full min-w-[50px] px-1"
                                />
                              </td>

                              {/* SQM */}
                              <td className="px-3 py-2 text-right font-mono font-black text-emerald-700 whitespace-nowrap text-xs">
                                {row.sqm.toFixed(2)} m²
                              </td>

                              {/* GLASS CODE */}
                              <td className="px-2 py-1.5">
                                <Input
                                  value={row.glassCode}
                                  onChange={(e) => handleItemChange(realIndex, "glassCode", e.target.value)}
                                  className="h-8 text-xs font-bold text-slate-900 bg-white border-slate-300 focus:border-purple-500 w-full min-w-[130px] px-2"
                                />
                              </td>

                              {/* GLASS TYPE / SPECIFICATION */}
                              <td className="px-2 py-1.5">
                                <Input
                                  value={row.glassType}
                                  onChange={(e) => handleItemChange(realIndex, "glassType", e.target.value)}
                                  className="h-8 text-xs font-medium text-slate-800 bg-white border-slate-300 focus:border-purple-500 w-full min-w-[190px] px-2"
                                />
                              </td>

                              {/* OB # */}
                              <td className="px-2 py-1.5">
                                <Input
                                  value={row.obNo}
                                  onChange={(e) => handleItemChange(realIndex, "obNo", e.target.value)}
                                  className="h-8 text-xs font-mono font-bold text-center bg-white border-slate-300 focus:border-purple-500 w-full min-w-[65px] px-1"
                                />
                              </td>

                              {/* SFO # */}
                              <td className="px-2 py-1.5">
                                <Input
                                  value={row.sfoNo}
                                  onChange={(e) => handleItemChange(realIndex, "sfoNo", e.target.value)}
                                  className="h-8 text-xs font-mono font-bold text-center text-purple-700 bg-white border-slate-300 focus:border-purple-500 w-full min-w-[80px] px-1"
                                />
                              </td>

                              {/* BATCH # */}
                              <td className="px-2 py-1.5">
                                <Input
                                  value={row.batchNo}
                                  onChange={(e) => handleItemChange(realIndex, "batchNo", e.target.value)}
                                  className="h-8 text-xs font-mono font-bold text-center text-purple-700 bg-white border-slate-300 focus:border-purple-500 w-full min-w-[65px] px-1"
                                />
                              </td>

                              {/* BARCODE */}
                              <td className="px-2 py-1.5">
                                <Input
                                  value={row.barcode}
                                  onChange={(e) => handleItemChange(realIndex, "barcode", e.target.value)}
                                  className="h-8 text-xs font-mono font-bold tracking-wider w-full min-w-[150px] px-2 bg-white border-slate-300 text-purple-800 focus:border-purple-500"
                                />
                              </td>

                              {/* ACTION */}
                              <td className="px-2 py-1.5 text-center">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleRemoveItem(realIndex)}
                                  className="h-7 w-7 p-0 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50"
                                  title="Remove Item"
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
                  <div className="p-2.5 bg-slate-50 text-xs text-slate-500 font-semibold border-t border-slate-200 flex justify-between items-center">
                    <span>All sticker fields editable • Click any cell to modify</span>
                    <span className="font-mono text-purple-700 font-bold">Total Batch SQM: {totalBatchSqm.toFixed(2)} m²</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-slate-600 hover:text-slate-900 rounded-xl font-bold text-xs">
            Cancel
          </Button>
          <Button
            disabled={!isValidated || validationErrors.length > 0 || loading || parsedRows.length === 0 || isPdfDuplicate || checkingPdfDuplicate}
            onClick={handleConfirmImport}
            className={`font-extrabold flex items-center gap-2 rounded-xl text-xs px-4 shadow-xs ${
              isPdfDuplicate
                ? "bg-red-500 hover:bg-red-500 text-white cursor-not-allowed"
                : "bg-purple-600 hover:bg-purple-700 text-white"
            }`}
          >
            {loading
              ? "Importing Sticker Batch..."
              : checkingPdfDuplicate
              ? "Verifying PDF..."
              : isPdfDuplicate
              ? "Cannot Upload: PDF Already Uploaded"
              : `Confirm & Import ${totalBatchQty} Stickers (${glassCategory === "Colour" ? "Coloured Glass" : "Clear Glass"})`}
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
