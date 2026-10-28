import * as XLSX from "xlsx";
import { GlassItem, ProductionStage, ProductionHistory, PIMaster, isGlassTypeColour, isBatchUploadHistory } from "@shared/api";
import { formatPlatformDateTime, formatBatchNumber, getItemFinish, getDguEffectiveQtyAndSqm, isDlguGlass, isDguGlass, isLaminatedGlass, getDisplayStage } from "./utils";
import { toast } from "sonner";

/**
 * Standard list of required exported Excel columns (in strict required order)
 */
export const STANDARD_EXCEL_COLUMNS = [
  "Sr. No.",
  "Order",
  "OB",
  "SFO",
  "Batch",
  "POS",
  "Barcode",
  "Customer Name",
  "Project Name",
  "Glass Code",
  "Outer Glass (OP)",
  "Spacer / PVB",
  "Inner Glass (IG)",
  "Glass Makeup / Buildup",
  "Product Category",
  "Glass Finish",
  "Width",
  "Height",
  "Order Qty",
  "Stage Qty",
  "Unit",
  "Total SQM",
  "Process Route",
  "Delivery Date",
  "OPT Date",
  "Origin",
  "Delivery Location",
  "Current Stage",
  "Status",
  "Last Updated",
  "Remarks",
] as const;

export type StandardExcelColumn = (typeof STANDARD_EXCEL_COLUMNS)[number];

export interface StandardExportRow {
  "Sr. No.": number;
  "Order": string;
  "OB": string;
  "SFO": string;
  "Batch": string;
  "POS": string;
  "Barcode": string;
  "Customer Name": string;
  "Project Name": string;
  "Glass Code": string;
  "Outer Glass (OP)": string;
  "Spacer / PVB": string;
  "Inner Glass (IG)": string;
  "Glass Makeup / Buildup": string;
  "Product Category": string;
  "Glass Finish": string;
  "Width": number;
  "Height": number;
  "Order Qty": number;
  "Stage Qty": number;
  "Unit": string;
  "Total SQM": number;
  "Process Route": string;
  "Delivery Date": string;
  "OPT Date": string;
  "Origin": string;
  "Delivery Location": string;
  "Current Stage": string;
  "Status": string;
  "Last Updated": string;
  "Remarks": string;
}

export const standardColWidths = [
  { wch: 8 },  // Sr. No.
  { wch: 14 }, // Order
  { wch: 14 }, // OB
  { wch: 14 }, // SFO
  { wch: 16 }, // Batch
  { wch: 8 },  // POS
  { wch: 22 }, // Barcode
  { wch: 32 }, // Customer Name
  { wch: 26 }, // Project Name
  { wch: 22 }, // Glass Code
  { wch: 32 }, // Outer Glass (OP)
  { wch: 22 }, // Spacer / PVB
  { wch: 28 }, // Inner Glass (IG)
  { wch: 40 }, // Glass Makeup / Buildup
  { wch: 18 }, // Product Category
  { wch: 14 }, // Glass Finish
  { wch: 12 }, // Width
  { wch: 12 }, // Height
  { wch: 12 }, // Order Qty
  { wch: 12 }, // Stage Qty
  { wch: 10 }, // Unit
  { wch: 12 }, // Total SQM
  { wch: 28 }, // Process Route
  { wch: 14 }, // Delivery Date
  { wch: 14 }, // OPT Date
  { wch: 14 }, // Origin
  { wch: 18 }, // Delivery Location
  { wch: 16 }, // Current Stage
  { wch: 14 }, // Status
  { wch: 22 }, // Last Updated
  { wch: 28 }, // Remarks
];

/**
 * Trigger browser file download from XLSX workbook
 */
function downloadWorkbook(wb: XLSX.WorkBook, fileName: string) {
  const cleanName = fileName.replace(/[^a-zA-Z0-9_\-]/g, "_");
  const finalFileName = `${cleanName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, finalFileName);
  try {
    toast.success(`Exported: ${finalFileName}`);
  } catch {}
}

/**
 * Resolve full glass makeup / buildup and individual layers:
 * 1. Outer Glass Pane (OP) - e.g. 8MM EMICOOL DSR III ON CLEAR / 8MM SYP YBE 0140N
 * 2. Spacer / PVB Interlayer - e.g. 16MM BLACK SPACER / 1.52MM CLEAR PVB
 * 3. Inner Glass Pane (IG) - e.g. 8MM CLEAR / 13.52MM CLEAR LAMINATED
 */
export function resolveGlassMakeupDetails(
  item: GlassItem,
  allItems: GlassItem[] = [],
  pis: PIMaster[] = []
): {
  makeup: string;
  outerGlass: string;
  spacer: string;
  innerGlass: string;
} {
  const isLam = isLaminatedGlass(item) || (item as any).glassCategory === "Lamination";
  const defaultSpacer = isLam ? "1.52MM CLEAR PVB" : "16MM BLACK SPACER";

  const rawMakeup = item.makeup || (item as any).makeup || "";
  if (rawMakeup && (/spacer/i.test(rawMakeup) || /pvb/i.test(rawMakeup) || /\+/i.test(rawMakeup))) {
    const parts = rawMakeup.split(/\s*[\+\/]\s*/);
    if (parts.length >= 3) {
      return {
        makeup: rawMakeup,
        outerGlass: parts[0]?.trim() || item.glassType,
        spacer: parts[1]?.trim() || defaultSpacer,
        innerGlass: parts[2]?.trim() || (isLam ? "13.52MM CLEAR LAMINATED" : "8MM CLEAR"),
      };
    }
  }

  // Look for paired partner item
  let partner: GlassItem | undefined;
  if ((item as any).dguPairId) {
    const pairId = String((item as any).dguPairId).replace(/^dgu-/, "");
    const parts = pairId.split("-");
    const partnerSerial = parts.find((s) => s !== item.serialNumber);
    if (partnerSerial) {
      partner = allItems.find((i) => i.serialNumber === partnerSerial);
    }
  }

  const finish = getItemFinish(item);
  const isColour = finish === "Colour" || isGlassTypeColour(item.glassType);

  let outerGlass = "";
  let innerGlass = "";
  const spacer = defaultSpacer;

  if (isColour) {
    outerGlass = item.glassType;
    innerGlass = partner?.glassType || (isLam ? "13.52MM CLEAR LAMINATED" : "8MM CLEAR");
  } else {
    outerGlass = partner?.glassType || (/emicool/i.test(partner?.glassType || "") ? partner!.glassType : "8MM EMICOOL DSR III ON CLEAR");
    innerGlass = item.glassType;
  }

  const makeup = rawMakeup || `${outerGlass} + ${spacer} + ${innerGlass}`;

  return {
    makeup,
    outerGlass,
    spacer,
    innerGlass,
  };
}

/**
 * Helper to build comprehensive standard export row objects from GlassItem array,
 * strictly matching the requested 31 columns:
 * 1. Sr. No.
 * 2. Order
 * 3. OB
 * 4. SFO
 * 5. Batch
 * 6. POS
 * 7. Barcode
 * 8. Customer Name
 * 9. Project Name
 * 10. Glass Code
 * 11. Outer Glass (OP)
 * 12. Spacer / PVB
 * 13. Inner Glass (IG)
 * 14. Glass Makeup / Buildup
 * 15. Product Category
 * 16. Glass Finish
 * 17. Width
 * 18. Height
 * 19. Order Qty
 * 20. Stage Qty
 * 21. Unit
 * 22. Total SQM
 * 23. Process Route
 * 24. Delivery Date
 * 25. OPT Date
 * 26. Origin
 * 27. Delivery Location
 * 28. Current Stage
 * 29. Status
 * 30. Last Updated
 * 31. Remarks
 */
export function buildItemExportRows(
  items: GlassItem[],
  stage?: ProductionStage,
  pis: PIMaster[] = []
): StandardExportRow[] {
  return (items || []).filter(Boolean).map((item, idx) => {
    const matchingPI = pis.find(
      (p) => p && item && (p.id === item.piId || p.piNumber === item.piNumber || (item.batchNo && p.batchNo === item.batchNo))
    );
    const finish = getItemFinish(item);
    const eff = getDguEffectiveQtyAndSqm(item, stage || item.currentStage);
    const productType = isDlguGlass(item) || (item as any).glassCategory === "DLGU"
      ? "DLGU Unit"
      : isDguGlass(item) || (item as any).glassCategory === "DGU"
      ? "DGU / IGU Unit"
      : isLaminatedGlass(item) || (item as any).glassCategory === "Lamination"
      ? "Laminated Glass"
      : "General Monolithic";

    const makeupDetails = resolveGlassMakeupDetails(item, items, pis);

    const routeText = Array.isArray(item.processRoute)
      ? item.processRoute.join(" → ")
      : String(item.processRoute || "—");

    return {
      "Sr. No.": idx + 1,
      "Order": item.orderNo || matchingPI?.jobOrderNumber || matchingPI?.proformaInvNo || "—",
      "OB": item.obNo || matchingPI?.obNo || "—",
      "SFO": item.sfoNo || matchingPI?.sfoNo || matchingPI?.jobOrderNumber || "—",
      "Batch": formatBatchNumber(item.batchNo || item.piNumber) || item.batchNo || matchingPI?.batchNo || item.piNumber || "—",
      "POS": item.posNo || String(idx + 1),
      "Barcode": item.barcode || "—",
      "Customer Name": item.customerName || matchingPI?.customerName || "—",
      "Project Name": item.projectName || matchingPI?.projectName || "—",
      "Glass Code": item.glassCode || item.itemCode || "—",
      "Outer Glass (OP)": makeupDetails.outerGlass || item.glassType || "—",
      "Spacer / PVB": makeupDetails.spacer || (isLaminatedGlass(item) ? "1.52MM CLEAR PVB" : "16MM BLACK SPACER"),
      "Inner Glass (IG)": makeupDetails.innerGlass || (item.glassCategory === "Lamination" ? "13.52MM CLEAR LAMINATED" : "8MM CLEAR"),
      "Glass Makeup / Buildup": makeupDetails.makeup || "—",
      "Product Category": productType,
      "Glass Finish": finish,
      "Width": item.width,
      "Height": item.height,
      "Order Qty": item.lineQty || item.qty || 1,
      "Stage Qty": eff.qty,
      "Unit": eff.unitLabel || "PCS",
      "Total SQM": eff.sqm,
      "Process Route": routeText,
      "Delivery Date": item.delDate || matchingPI?.deliveryDate || "—",
      "OPT Date": item.optDate || matchingPI?.sfoDate || matchingPI?.issueDate || "—",
      "Origin": "MADE IN UAE",
      "Delivery Location": item.delLocation || "FACTORY",
      "Current Stage": getDisplayStage(item, item.currentStage),
      "Status": item.status || "Pending",
      "Last Updated": formatPlatformDateTime(item.updatedAt || (item as any).createdAt),
      "Remarks": item.remarks || "",
    };
  });
}

/**
 * 1. Export Active Work In Progress (WIP) Queue for a specific Stage
 * Automatically splits Colour Glass and Clear Glass into separate worksheet tabs in the same Excel file!
 */
export function exportStageWipToExcel(
  stage: ProductionStage,
  items: GlassItem[],
  customTitle?: string,
  pis: PIMaster[] = []
) {
  if (!items || items.length === 0) {
    try {
      toast.error(`No items available to export for ${stage} stage.`);
    } catch {}
    return;
  }

  const wb = XLSX.utils.book_new();

  const colourItems = items.filter((i) => getItemFinish(i) === "Colour");
  const clearItems = items.filter((i) => getItemFinish(i) === "Clear");

  // 1. Colour Glass Sheet (if Colour items exist)
  if (colourItems.length > 0) {
    const colourData = buildItemExportRows(colourItems, stage, pis);
    const wsColour = XLSX.utils.json_to_sheet(colourData);
    wsColour["!cols"] = standardColWidths;
    XLSX.utils.book_append_sheet(wb, wsColour, "Colour Glass");
  }

  // 2. Clear Glass Sheet (if Clear items exist)
  if (clearItems.length > 0) {
    const clearData = buildItemExportRows(clearItems, stage, pis);
    const wsClear = XLSX.utils.json_to_sheet(clearData);
    wsClear["!cols"] = standardColWidths;
    XLSX.utils.book_append_sheet(wb, wsClear, "Clear Glass");
  }

  // 3. Combined All Items Sheet (for full reference)
  const allData = buildItemExportRows(items, stage, pis);
  const wsAll = XLSX.utils.json_to_sheet(allData);
  wsAll["!cols"] = standardColWidths;
  XLSX.utils.book_append_sheet(wb, wsAll, "All Items (Combined)");

  downloadWorkbook(wb, customTitle || `${stage}_Stage_WIP`);
}

/**
 * 2. Export Stage History Logs (Completed items / scan audit log for a stage)
 * Splits Colour & Clear logs into separate sheets if applicable, strictly containing the 31 columns.
 */
export function exportStageHistoryToExcel(
  stage: ProductionStage,
  historyRecords: ProductionHistory[],
  glassItemsLookup: GlassItem[] = [],
  pis: PIMaster[] = []
) {
  const stageRecords = historyRecords.filter((h) => h.stage === stage && !isBatchUploadHistory(h));

  if (stageRecords.length === 0) {
    try {
      toast.error(`No historical completion logs found for ${stage} stage.`);
    } catch {}
    return;
  }

  const mapRecord = (rec: ProductionHistory, idx: number): StandardExportRow => {
    const matchingItem = glassItemsLookup.find(
      (g) => g.serialNumber === rec.serialNumber || g.barcode === rec.barcode
    );
    const matchingPI = pis.find(
      (p) => p.id === matchingItem?.piId || p.piNumber === rec.piNumber || (matchingItem?.batchNo && p.batchNo === matchingItem.batchNo)
    );
    const finish = getItemFinish(matchingItem);
    const eff = matchingItem ? getDguEffectiveQtyAndSqm(matchingItem, stage) : { qty: 1, unitLabel: "PCS", sqm: 0 };
    const productType = matchingItem
      ? (isDlguGlass(matchingItem) || (matchingItem as any).glassCategory === "DLGU"
        ? "DLGU Unit"
        : isDguGlass(matchingItem) || (matchingItem as any).glassCategory === "DGU"
        ? "DGU / IGU Unit"
        : isLaminatedGlass(matchingItem) || (matchingItem as any).glassCategory === "Lamination"
        ? "Laminated Glass"
        : "General Monolithic")
      : "General Monolithic";

    const makeupDetails = matchingItem
      ? resolveGlassMakeupDetails(matchingItem, glassItemsLookup, pis)
      : { makeup: "—", outerGlass: "—", spacer: "—", innerGlass: "—" };

    const routeText = matchingItem
      ? (Array.isArray(matchingItem.processRoute) ? matchingItem.processRoute.join(" → ") : String(matchingItem.processRoute || "—"))
      : "—";

    return {
      "Sr. No.": idx + 1,
      "Order": matchingItem?.orderNo || matchingPI?.jobOrderNumber || "—",
      "OB": matchingItem?.obNo || matchingPI?.obNo || "—",
      "SFO": matchingItem?.sfoNo || matchingPI?.sfoNo || "—",
      "Batch": formatBatchNumber(rec.piNumber || matchingItem?.batchNo) || rec.piNumber || matchingPI?.batchNo || "—",
      "POS": matchingItem?.posNo || "—",
      "Barcode": rec.barcode || matchingItem?.barcode || "—",
      "Customer Name": matchingItem?.customerName || matchingPI?.customerName || "—",
      "Project Name": matchingItem?.projectName || matchingPI?.projectName || "—",
      "Glass Code": matchingItem?.glassCode || matchingItem?.itemCode || "—",
      "Outer Glass (OP)": makeupDetails.outerGlass || matchingItem?.glassType || "—",
      "Spacer / PVB": makeupDetails.spacer || (matchingItem && isLaminatedGlass(matchingItem) ? "1.52MM CLEAR PVB" : "16MM BLACK SPACER"),
      "Inner Glass (IG)": makeupDetails.innerGlass || (matchingItem?.glassCategory === "Lamination" ? "13.52MM CLEAR LAMINATED" : "8MM CLEAR"),
      "Glass Makeup / Buildup": makeupDetails.makeup || "—",
      "Product Category": productType,
      "Glass Finish": finish,
      "Width": matchingItem?.width || 0,
      "Height": matchingItem?.height || 0,
      "Order Qty": matchingItem?.lineQty || matchingItem?.qty || 1,
      "Stage Qty": eff.qty,
      "Unit": eff.unitLabel || "PCS",
      "Total SQM": eff.sqm,
      "Process Route": routeText,
      "Delivery Date": matchingItem?.delDate || matchingPI?.deliveryDate || "—",
      "OPT Date": matchingItem?.optDate || matchingPI?.sfoDate || matchingPI?.issueDate || "—",
      "Origin": "MADE IN UAE",
      "Delivery Location": matchingItem?.delLocation || "FACTORY",
      "Current Stage": rec.stage || matchingItem?.currentStage || "—",
      "Status": rec.status || matchingItem?.status || "Completed",
      "Last Updated": formatPlatformDateTime(rec.timestamp || matchingItem?.updatedAt),
      "Remarks": rec.remarks || matchingItem?.remarks || "",
    };
  };

  const wb = XLSX.utils.book_new();

  const colourRecords = stageRecords.filter((rec) => {
    const item = glassItemsLookup.find((g) => g.serialNumber === rec.serialNumber || g.barcode === rec.barcode);
    return getItemFinish(item) === "Colour";
  });
  const clearRecords = stageRecords.filter((rec) => {
    const item = glassItemsLookup.find((g) => g.serialNumber === rec.serialNumber || g.barcode === rec.barcode);
    return getItemFinish(item) === "Clear";
  });

  if (colourRecords.length > 0) {
    const wsColour = XLSX.utils.json_to_sheet(colourRecords.map(mapRecord));
    wsColour["!cols"] = standardColWidths;
    XLSX.utils.book_append_sheet(wb, wsColour, "Colour Glass Logs");
  }

  if (clearRecords.length > 0) {
    const wsClear = XLSX.utils.json_to_sheet(clearRecords.map(mapRecord));
    wsClear["!cols"] = standardColWidths;
    XLSX.utils.book_append_sheet(wb, wsClear, "Clear Glass Logs");
  }

  const wsAll = XLSX.utils.json_to_sheet(stageRecords.map(mapRecord));
  wsAll["!cols"] = standardColWidths;
  XLSX.utils.book_append_sheet(wb, wsAll, "All Stage Logs");

  downloadWorkbook(wb, `${stage}_Stage_History_Report`);
}

/**
 * 3. Export Selected Rows to Excel (Separate Sheets for Colour & Clear)
 */
export function exportSelectedItemsToExcel(
  stage: ProductionStage,
  selectedItems: GlassItem[],
  customTitle?: string,
  pis: PIMaster[] = []
) {
  if (!selectedItems || selectedItems.length === 0) {
    try {
      toast.error("Please select at least one row to export.");
    } catch {}
    return;
  }

  const wb = XLSX.utils.book_new();

  const colourItems = selectedItems.filter((i) => getItemFinish(i) === "Colour");
  const clearItems = selectedItems.filter((i) => getItemFinish(i) === "Clear");

  if (colourItems.length > 0) {
    const colourData = buildItemExportRows(colourItems, stage, pis);
    const wsColour = XLSX.utils.json_to_sheet(colourData);
    wsColour["!cols"] = standardColWidths;
    XLSX.utils.book_append_sheet(wb, wsColour, "Colour Glass");
  }

  if (clearItems.length > 0) {
    const clearData = buildItemExportRows(clearItems, stage, pis);
    const wsClear = XLSX.utils.json_to_sheet(clearData);
    wsClear["!cols"] = standardColWidths;
    XLSX.utils.book_append_sheet(wb, wsClear, "Clear Glass");
  }

  const allData = buildItemExportRows(selectedItems, stage, pis);
  const wsAll = XLSX.utils.json_to_sheet(allData);
  wsAll["!cols"] = standardColWidths;
  XLSX.utils.book_append_sheet(wb, wsAll, "Selected Items (Combined)");

  downloadWorkbook(wb, customTitle || `${stage}_Selected_Items`);
}

/**
 * 4. Export Partial Dispatch / Delivery Note
 */
export function exportPartialDispatchNoteToExcel(
  pi: PIMaster | undefined,
  dispatchedItems: GlassItem[],
  options?: {
    truckNo?: string;
    driverName?: string;
    deliveryLoc?: string;
    dispatchNoteNo?: string;
  }
) {
  if (!dispatchedItems || dispatchedItems.length === 0) {
    try {
      toast.error("No items selected for dispatch note export.");
    } catch {}
    return;
  }

  const noteNo = options?.dispatchNoteNo || dispatchedItems[0]?.dispatchNoteNo || `DN-${Date.now().toString().slice(-6)}`;
  const customerName = pi?.customerName || dispatchedItems[0]?.customerName || dispatchedItems[0]?.piNumber || "CUSTOMER";

  const rows = buildItemExportRows(dispatchedItems, "Finished", pi ? [pi] : []);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = standardColWidths;
  XLSX.utils.book_append_sheet(wb, ws, "Delivery_Note");
  downloadWorkbook(wb, `Delivery_Note_${noteNo}_${customerName}`);
}

/**
 * 5. Export Batch Progress Matrix (All 4 Stage Balance Sheet)
 */
export function exportBatchProgressMatrixToExcel(pi: PIMaster, items: GlassItem[]) {
  if (!items || items.length === 0) {
    try {
      toast.error("No items available for this batch.");
    } catch {}
    return;
  }

  const wb = XLSX.utils.book_new();

  const colourItems = items.filter((i) => getItemFinish(i) === "Colour");
  const clearItems = items.filter((i) => getItemFinish(i) === "Clear");

  if (colourItems.length > 0) {
    const wsColour = XLSX.utils.json_to_sheet(buildItemExportRows(colourItems, undefined, [pi]));
    wsColour["!cols"] = standardColWidths;
    XLSX.utils.book_append_sheet(wb, wsColour, "Colour Glass");
  }

  if (clearItems.length > 0) {
    const wsClear = XLSX.utils.json_to_sheet(buildItemExportRows(clearItems, undefined, [pi]));
    wsClear["!cols"] = standardColWidths;
    XLSX.utils.book_append_sheet(wb, wsClear, "Clear Glass");
  }

  const wsAll = XLSX.utils.json_to_sheet(buildItemExportRows(items, undefined, [pi]));
  wsAll["!cols"] = standardColWidths;
  XLSX.utils.book_append_sheet(wb, wsAll, "All Batch Items");

  downloadWorkbook(wb, `Batch_Matrix_${pi.piNumber}`);
}
