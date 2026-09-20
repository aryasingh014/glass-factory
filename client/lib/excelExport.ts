import * as XLSX from "xlsx";
import { GlassItem, ProductionStage, ProductionHistory, PIMaster } from "@shared/api";
import { formatPlatformDate, formatPlatformDateTime, formatBatchNumber, getItemFinish, getDguEffectiveQtyAndSqm, isDlguGlass, isDguGlass, isLaminatedGlass, getDisplayStage } from "./utils";
import { toast } from "sonner";

/**
 * Trigger browser file download from XLSX workbook
 */
function downloadWorkbook(wb: XLSX.WorkBook, fileName: string) {
  const cleanName = fileName.replace(/[^a-zA-Z0-9_\-]/g, "_");
  const finalFileName = `${cleanName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, finalFileName);
  toast.success(`Exported: ${finalFileName}`);
}

/**
 * Helper to build standard export row objects from GlassItem array
 */
function buildItemExportRows(items: GlassItem[], stage: ProductionStage) {
  return items.map((item, idx) => {
    const finish = getItemFinish(item);
    const eff = getDguEffectiveQtyAndSqm(item, stage);
    const productType = isDlguGlass(item) || (item as any).glassCategory === "DLGU"
      ? "DLGU Unit"
      : isDguGlass(item) || (item as any).glassCategory === "DGU"
      ? "DGU / IGU Unit"
      : isLaminatedGlass(item) || (item as any).glassCategory === "Lamination"
      ? "Laminated Glass"
      : "General Monolithic";

    return {
      "Sr No": idx + 1,
      "Batch Number": formatBatchNumber(item.batchNo || item.piNumber) || item.batchNo || item.piNumber,
      "SFO No": item.sfoNo || "—",
      "OB No": item.obNo || "—",
      "Barcode": item.barcode,
      "Serial Number": item.serialNumber,
      "POS No": item.posNo || String(idx + 1),
      "Glass Code": item.glassCode || item.itemCode || "—",
      "Glass Description": item.glassType,
      "Product Category": productType,
      "Glass Finish": finish,
      "Width (mm)": item.width,
      "Height (mm)": item.height,
      "Sheet / Rack No": item.rackNo || item.category || "—",
      "Quantity": eff.qty,
      "Unit": eff.unitLabel,
      "Total SQM": eff.sqm,
      "Current Stage": getDisplayStage(item, item.currentStage),
      "Status": item.status,
      "Last Updated": formatPlatformDateTime(item.updatedAt),
      "Remarks": item.remarks || "",
    };
  });
}

const standardColWidths = [
  { wch: 6 },  // Sr No
  { wch: 16 }, // Batch Number
  { wch: 14 }, // SFO No
  { wch: 14 }, // OB No
  { wch: 20 }, // Barcode
  { wch: 12 }, // Serial Number
  { wch: 8 },  // POS No
  { wch: 14 }, // Glass Code
  { wch: 32 }, // Glass Description
  { wch: 12 }, // Glass Finish
  { wch: 12 }, // Width
  { wch: 12 }, // Height
  { wch: 16 }, // Sheet / Rack
  { wch: 10 }, // Quantity
  { wch: 12 }, // Unit
  { wch: 12 }, // Total SQM
  { wch: 14 }, // Current Stage
  { wch: 12 }, // Status
  { wch: 22 }, // Last Updated
  { wch: 25 }, // Remarks
];

/**
 * 1. Export Active Work In Progress (WIP) Queue for a specific Stage
 * Automatically splits Colour Glass and Clear Glass into separate worksheet tabs in the same Excel file!
 */
export function exportStageWipToExcel(
  stage: ProductionStage,
  items: GlassItem[],
  customTitle?: string
) {
  if (!items || items.length === 0) {
    toast.error(`No items available to export for ${stage} stage.`);
    return;
  }

  const wb = XLSX.utils.book_new();

  const colourItems = items.filter((i) => getItemFinish(i) === "Colour");
  const clearItems = items.filter((i) => getItemFinish(i) === "Clear");

  // 1. Colour Glass Sheet (if Colour items exist)
  if (colourItems.length > 0) {
    const colourData = buildItemExportRows(colourItems, stage);
    const wsColour = XLSX.utils.json_to_sheet(colourData);
    wsColour["!cols"] = standardColWidths;
    XLSX.utils.book_append_sheet(wb, wsColour, "Colour Glass");
  }

  // 2. Clear Glass Sheet (if Clear items exist)
  if (clearItems.length > 0) {
    const clearData = buildItemExportRows(clearItems, stage);
    const wsClear = XLSX.utils.json_to_sheet(clearData);
    wsClear["!cols"] = standardColWidths;
    XLSX.utils.book_append_sheet(wb, wsClear, "Clear Glass");
  }

  // 3. Combined All Items Sheet (for full reference)
  const allData = buildItemExportRows(items, stage);
  const wsAll = XLSX.utils.json_to_sheet(allData);
  wsAll["!cols"] = standardColWidths;
  XLSX.utils.book_append_sheet(wb, wsAll, "All Items (Combined)");

  downloadWorkbook(wb, customTitle || `${stage}_Stage_WIP`);
}

/**
 * 2. Export Stage History Logs (Completed items / scan audit log for a stage)
 * Splits Colour & Clear logs into separate sheets if applicable
 */
export function exportStageHistoryToExcel(
  stage: ProductionStage,
  historyRecords: ProductionHistory[],
  glassItemsLookup: GlassItem[] = []
) {
  const stageRecords = historyRecords.filter((h) => h.stage === stage);

  if (stageRecords.length === 0) {
    toast.error(`No historical completion logs found for ${stage} stage.`);
    return;
  }

  const mapRecord = (rec: ProductionHistory, idx: number) => {
    const matchingItem = glassItemsLookup.find(
      (g) => g.serialNumber === rec.serialNumber || g.barcode === rec.barcode
    );
    const finish = getItemFinish(matchingItem);

    return {
      "Log ID": rec.id,
      "Sr No": idx + 1,
      "Completed Date & Time (GST)": formatPlatformDateTime(rec.timestamp),
      "Workstation Stage": rec.stage,
      "Operator": rec.operator || "Operator",
      "Serial Number": rec.serialNumber,
      "Barcode": rec.barcode,
      "Batch Number": formatBatchNumber(rec.piNumber) || rec.piNumber,
      "SFO No": matchingItem?.sfoNo || "—",
      "OB No": matchingItem?.obNo || "—",
      "Glass Description": matchingItem?.glassType || "—",
      "Glass Finish": finish,
      "Width (mm)": matchingItem?.width || "—",
      "Height (mm)": matchingItem?.height || "—",
      "Processed QTY": matchingItem?.qty || 1,
      "Total SQM": matchingItem?.sqm || "—",
      "Scan Status": rec.status,
      "Remarks / Pairing Details": rec.remarks || "",
    };
  };

  const historyWidths = [
    { wch: 14 }, // Log ID
    { wch: 6 },  // Sr No
    { wch: 22 }, // Completed Date & Time
    { wch: 16 }, // Workstation Stage
    { wch: 16 }, // Operator
    { wch: 14 }, // Serial Number
    { wch: 20 }, // Barcode
    { wch: 16 }, // Batch Number
    { wch: 14 }, // SFO No
    { wch: 14 }, // OB No
    { wch: 30 }, // Glass Description
    { wch: 12 }, // Finish
    { wch: 12 }, // Width
    { wch: 12 }, // Height
    { wch: 14 }, // Processed QTY
    { wch: 12 }, // Total SQM
    { wch: 12 }, // Scan Status
    { wch: 35 }, // Remarks
  ];

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
    wsColour["!cols"] = historyWidths;
    XLSX.utils.book_append_sheet(wb, wsColour, "Colour Glass Logs");
  }

  if (clearRecords.length > 0) {
    const wsClear = XLSX.utils.json_to_sheet(clearRecords.map(mapRecord));
    wsClear["!cols"] = historyWidths;
    XLSX.utils.book_append_sheet(wb, wsClear, "Clear Glass Logs");
  }

  const wsAll = XLSX.utils.json_to_sheet(stageRecords.map(mapRecord));
  wsAll["!cols"] = historyWidths;
  XLSX.utils.book_append_sheet(wb, wsAll, "All Stage Logs");

  downloadWorkbook(wb, `${stage}_Stage_History_Report`);
}

/**
 * 3. Export Selected Rows to Excel (Separate Sheets for Colour & Clear)
 */
export function exportSelectedItemsToExcel(
  stage: ProductionStage,
  selectedItems: GlassItem[],
  customTitle?: string
) {
  if (!selectedItems || selectedItems.length === 0) {
    toast.error("Please select at least one row to export.");
    return;
  }

  const wb = XLSX.utils.book_new();

  const colourItems = selectedItems.filter((i) => getItemFinish(i) === "Colour");
  const clearItems = selectedItems.filter((i) => getItemFinish(i) === "Clear");

  if (colourItems.length > 0) {
    const colourData = buildItemExportRows(colourItems, stage);
    const wsColour = XLSX.utils.json_to_sheet(colourData);
    wsColour["!cols"] = standardColWidths;
    XLSX.utils.book_append_sheet(wb, wsColour, "Colour Glass");
  }

  if (clearItems.length > 0) {
    const clearData = buildItemExportRows(clearItems, stage);
    const wsClear = XLSX.utils.json_to_sheet(clearData);
    wsClear["!cols"] = standardColWidths;
    XLSX.utils.book_append_sheet(wb, wsClear, "Clear Glass");
  }

  const allData = buildItemExportRows(selectedItems, stage);
  const wsAll = XLSX.utils.json_to_sheet(allData);
  wsAll["!cols"] = standardColWidths;
  XLSX.utils.book_append_sheet(wb, wsAll, "Selected Items (Combined)");

  downloadWorkbook(wb, customTitle || `${stage}_Selected_Items`);
}

/**
 * 4. Export Partial Dispatch / Delivery Note (Formal Packing List in Excel)
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
    toast.error("No items selected for dispatch note export.");
    return;
  }

  const noteNo = options?.dispatchNoteNo || `DN-${Date.now().toString().slice(-6)}`;
  const customerName = pi?.customerName || dispatchedItems[0]?.piNumber || "CUSTOMER";
  const projectName = pi?.projectName || dispatchedItems[0]?.sfoNo || "PROJECT";
  const dispatchDate = formatPlatformDate(new Date());

  // Calculate totals
  let totalPieces = 0;
  let totalSqm = 0;

  const itemRows = dispatchedItems.map((item, idx) => {
    const eff = getDguEffectiveQtyAndSqm(item, "Finished");
    totalPieces += eff.qty;
    totalSqm += eff.sqm;

    const productType = isDlguGlass(item) || (item as any).glassCategory === "DLGU"
      ? "DLGU Unit"
      : isDguGlass(item) || (item as any).glassCategory === "DGU"
      ? "DGU / IGU Unit"
      : isLaminatedGlass(item) || (item as any).glassCategory === "Lamination"
      ? "Laminated Glass"
      : "General Monolithic";

    return [
      idx + 1,                                  // A: Sr No
      item.barcode,                             // B: Barcode
      item.serialNumber,                        // C: Serial #
      item.posNo || String(idx + 1),            // D: Pos #
      item.itemCode || item.glassCode || "—",   // E: Item Code
      item.glassType,                           // F: Glass Description
      productType,                              // G: Product Type (DLGU / DGU / Lam / Mono)
      getItemFinish(item),                      // H: Finish (Colour / Clear)
      item.width,                               // I: Width (mm)
      item.height,                              // J: Height (mm)
      eff.qty,                                  // K: Dispatched Qty
      eff.sqm,                                  // L: Total SQM
      item.remarks || "DISPATCHED",             // M: Remarks
    ];
  });

  // Sheet layout structure: Header, Metadata, Item Table, Summary Footer
  const sheetData: (string | number)[][] = [
    ["SEJAL GLASS - PARTIAL DISPATCH DELIVERY NOTE / PACKING LIST"],
    ["--------------------------------------------------------------------------------"],
    ["Delivery Note No:", noteNo, "", "Dispatch Date:", dispatchDate],
    ["Customer Name:", customerName, "", "Project Name:", projectName],
    ["Job Order / SFO:", pi?.jobOrderNumber || dispatchedItems[0]?.sfoNo || "—", "", "Dispatch Location:", options?.deliveryLoc || pi?.dispatchTo || "FACTORY"],
    ["Vehicle / Truck No:", options?.truckNo || "—", "", "Driver Name:", options?.driverName || "—"],
    [], // Blank line
    [
      "Sr No",
      "Barcode",
      "Serial Number",
      "POS No",
      "Item Code",
      "Glass Description",
      "Product Type",
      "Finish",
      "Width (mm)",
      "Height (mm)",
      "Dispatched QTY",
      "Total SQM",
      "Remarks / Location",
    ],
    ...itemRows,
    [], // Blank line
    [
      "SUMMARY TOTALS:",
      "",
      "",
      "",
      "",
      "",
      `Total Items: ${dispatchedItems.length}`,
      "",
      "",
      "",
      totalPieces,
      parseFloat(totalSqm.toFixed(2)),
      "Total Shipped in Truck",
    ],
    [],
    ["Authorized Dispatch Stamp:", "", "", "", "Driver Signature:", "", "", "", "Received By (Customer):"],
  ];

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Styling / Widths
  ws["!cols"] = [
    { wch: 6 },  // Sr No
    { wch: 20 }, // Barcode
    { wch: 14 }, // Serial Number
    { wch: 8 },  // POS No
    { wch: 14 }, // Item Code
    { wch: 32 }, // Glass Description
    { wch: 18 }, // Product Type
    { wch: 12 }, // Finish
    { wch: 12 }, // Width
    { wch: 12 }, // Height
    { wch: 16 }, // Dispatched QTY
    { wch: 14 }, // Total SQM
    { wch: 25 }, // Remarks
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Delivery_Note");
  downloadWorkbook(wb, `Delivery_Note_${noteNo}_${customerName}`);
}

/**
 * 5. Export Batch Progress Matrix (All 4 Stage Balance Sheet)
 */
export function exportBatchProgressMatrixToExcel(pi: PIMaster, items: GlassItem[]) {
  if (!items || items.length === 0) {
    toast.error("No items available for this batch.");
    return;
  }

  const mapBatchRow = (item: GlassItem, idx: number) => {
    const eff = getDguEffectiveQtyAndSqm(item);
    const completedStages = item.completedStages || [];

    const isCut = completedStages.includes("Cutting") || item.currentStage !== "Cutting";
    const isPairing = completedStages.includes("Pairing");
    const isDgu = completedStages.includes("DGU") || (item.currentStage !== "Cutting" && item.currentStage !== "Pairing" && item.currentStage !== "DGU");
    const isLam = completedStages.includes("Lamination") || (item.currentStage === "Finished" && item.processRoute.includes("Lamination"));
    const isDispatched = item.currentStage === "Finished" && item.status === "Completed";

    return {
      "Sr No": idx + 1,
      "Batch Number": formatBatchNumber(pi.piNumber) || pi.piNumber,
      "Customer": pi.customerName,
      "Project": pi.projectName,
      "POS No": item.posNo || String(idx + 1),
      "Barcode": item.barcode,
      "Serial Number": item.serialNumber,
      "Glass Description": item.glassType,
      "Glass Finish": getItemFinish(item),
      "Width (mm)": item.width,
      "Height (mm)": item.height,
      "Order QTY": eff.qty,
      "Order SQM": eff.sqm,
      "Process Route": item.processRoute.join(" → "),
      "Current Workstation": item.currentStage,
      "Cutting Status": isCut ? "DONE" : "PENDING",
      "Pairing Status": item.processRoute.includes("Pairing") ? (isPairing ? "DONE" : "PENDING") : "N/A",
      "DGU / IGU Status": item.processRoute.includes("DGU") ? (isDgu ? "DONE" : "PENDING") : "N/A",
      "Lamination Status": item.processRoute.includes("Lamination") ? (isLam ? "DONE" : "PENDING") : "N/A",
      "Dispatch Status": isDispatched ? "DISPATCHED" : "PENDING",
      "Overall Status": item.status,
    };
  };

  const wb = XLSX.utils.book_new();

  const colourItems = items.filter((i) => getItemFinish(i) === "Colour");
  const clearItems = items.filter((i) => getItemFinish(i) === "Clear");

  if (colourItems.length > 0) {
    const wsColour = XLSX.utils.json_to_sheet(colourItems.map(mapBatchRow));
    XLSX.utils.book_append_sheet(wb, wsColour, "Colour Glass");
  }

  if (clearItems.length > 0) {
    const wsClear = XLSX.utils.json_to_sheet(clearItems.map(mapBatchRow));
    XLSX.utils.book_append_sheet(wb, wsClear, "Clear Glass");
  }

  const wsAll = XLSX.utils.json_to_sheet(items.map(mapBatchRow));
  XLSX.utils.book_append_sheet(wb, wsAll, "All Batch Items");

  downloadWorkbook(wb, `Batch_Matrix_${pi.piNumber}`);
}
