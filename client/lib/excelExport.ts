import * as XLSX from "xlsx";
import { GlassItem, ProductionStage, ProductionHistory, PIMaster } from "@shared/api";
import { formatPlatformDate, formatPlatformDateTime, formatBatchNumber, getItemFinish, getDguEffectiveQtyAndSqm, isDlguGlass, isDguGlass, isLaminatedGlass, getDisplayStage } from "./utils";
import { toast } from "sonner";

export const excelSaver = {
  save: (wb: XLSX.WorkBook, fileName: string) => {
    XLSX.writeFile(wb, fileName);
  },
};

/**
 * Trigger browser file download from XLSX workbook
 */
function downloadWorkbook(wb: XLSX.WorkBook, fileName: string) {
  const cleanName = fileName.replace(/[^a-zA-Z0-9_\-]/g, "_");
  const finalFileName = `${cleanName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  excelSaver.save(wb, finalFileName);
  try {
    toast.success(`Exported: ${finalFileName}`);
  } catch {}
}

/**
 * Resolve full glass makeup / buildup and individual layers:
 * 1. Outer Glass Pane (OP) - e.g. 8MM EMICOOL DSR III ON CLEAR / 8MM SYP YBE 0140N
 * 2. Spacer / Cavity Bar - e.g. 16MM BLACK SPACER / 12MM AIR SPACER
 * 3. Inner Glass Pane (IP) - e.g. 8MM CLEAR / 13.52MM CLEAR LAMINATED
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
  const rawMakeup = item.makeup || (item as any).makeup || "";
  if (rawMakeup && /spacer/i.test(rawMakeup)) {
    const parts = rawMakeup.split(/\s*[\+\/]\s*/);
    if (parts.length >= 3) {
      return {
        makeup: rawMakeup,
        outerGlass: parts[0]?.trim() || item.glassType,
        spacer: parts[1]?.trim() || "16MM BLACK SPACER",
        innerGlass: parts[2]?.trim() || "8MM CLEAR",
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
  const isColour = finish === "Colour" || /emicool|syp|stopray|tint|sunguard|dsr/i.test(item.glassType);

  let outerGlass = "";
  let innerGlass = "";
  const spacer = "16MM BLACK SPACER";

  if (isColour) {
    outerGlass = item.glassType;
    innerGlass = partner?.glassType || (item.glassCategory === "Lamination" ? "13.52MM CLEAR LAMINATED" : "8MM CLEAR");
  } else {
    outerGlass = partner?.glassType || (/emicool/i.test(partner?.glassType || "") ? partner!.glassType : "8MM EMICOOL DSR III ON CLEAR");
    innerGlass = item.glassType;
  }

  const makeup = `${outerGlass} + ${spacer} + ${innerGlass}`;

  return {
    makeup,
    outerGlass,
    spacer,
    innerGlass,
  };
}

/**
 * Helper to build comprehensive standard export row objects from GlassItem array,
 * incorporating every sticker field:
 * - Order #, OB #, SFO #, Batch #, POS #, Barcode, Serial Number
 * - Customer Name, Project Name, Glass Code, Glass Description
 * - 3-Layer Glass Makeup: Outer Glass (OP), Spacer / Cavity, Inner Glass (IP)
 * - Dimensions, Quantities, Unit, SQM, Rack No, Process Route, Dates, Origin
 */
function buildItemExportRows(items: GlassItem[], stage: ProductionStage, pis: PIMaster[] = []) {
  return (items || []).filter(Boolean).map((item, idx) => {
    const matchingPI = pis.find(
      (p) => p && item && (p.id === item.piId || p.piNumber === item.piNumber || (item.batchNo && p.batchNo === item.batchNo))
    );
    const finish = getItemFinish(item);
    const eff = getDguEffectiveQtyAndSqm(item, stage);
    const productType = isDlguGlass(item) || (item as any).glassCategory === "DLGU"
      ? "DLGU Unit"
      : isDguGlass(item) || (item as any).glassCategory === "DGU"
      ? "DGU / IGU Unit"
      : isLaminatedGlass(item) || (item as any).glassCategory === "Lamination"
      ? "Laminated Glass"
      : "General Monolithic";

    const makeupDetails = resolveGlassMakeupDetails(item, items, pis);

    // Stage-specific tracking details helper
    let stageDetails = "";
    if (stage === "Cutting") {
      stageDetails = `Rack: ${item.rackNo || "1"} | Finish: ${finish}`;
    } else if (stage === "Polishing") {
      stageDetails = `Edge Polishing | Finish: ${finish}`;
    } else if (stage === "Pairing") {
      stageDetails = (item as any).dguPairId
        ? `Paired Ref: ${(item as any).dguPairId}`
        : item.glassCategory === "DGU" || item.glassCategory === "DLGU"
        ? "Waiting for Partner Pane"
        : "Single Pane Buffer";
    } else if (stage === "DGU" || stage === "Lamination") {
      stageDetails = (item as any).dguPairId
        ? `Assembly Unit: ${(item as any).dguPairId}`
        : `${productType} Assembly`;
    } else if (stage === "Finished" || stage === "Dispatched") {
      stageDetails = (item as any).isDispatched || item.currentStage === "Dispatched"
        ? `Dispatched (DN: ${item.dispatchNoteNo || "N/A"})`
        : "Ready in Warehouse";
    }

    const routeText = Array.isArray(item.processRoute)
      ? item.processRoute.join(" → ")
      : String(item.processRoute || "—");

    return {
      "Sr No": idx + 1,
      "Order #": item.orderNo || matchingPI?.jobOrderNumber || matchingPI?.proformaInvNo || "—",
      "OB #": item.obNo || matchingPI?.obNo || "—",
      "SFO #": item.sfoNo || matchingPI?.sfoNo || matchingPI?.jobOrderNumber || "—",
      "Batch #": formatBatchNumber(item.batchNo || item.piNumber) || item.batchNo || matchingPI?.batchNo || item.piNumber,
      "POS #": item.posNo || String(idx + 1),
      "Barcode": item.barcode,
      "Serial Number": item.serialNumber,
      "Customer Name": item.customerName || matchingPI?.customerName || "—",
      "Project Name": item.projectName || matchingPI?.projectName || "—",
      "Glass Code": item.glassCode || item.itemCode || "—",
      "Glass Description": item.glassType,
      "Glass Makeup / Buildup": makeupDetails.makeup,
      "Outer Glass (OP)": makeupDetails.outerGlass,
      "Spacer / Cavity": makeupDetails.spacer,
      "Inner Glass (IP)": makeupDetails.innerGlass,
      "Product Category": productType,
      "Glass Finish": finish,
      "Width (mm)": item.width,
      "Height (mm)": item.height,
      "Order Qty (Line Qty)": item.lineQty || item.qty || 1,
      "Stage Qty": eff.qty,
      "Unit": eff.unitLabel,
      "Total SQM": eff.sqm,
      "Sheet / Rack No": item.rackNo || "—",
      "Process Route": routeText,
      "Delivery Date": item.delDate || matchingPI?.deliveryDate || "—",
      "OPT Date": item.optDate || matchingPI?.sfoDate || matchingPI?.issueDate || "—",
      "Origin": "MADE IN UAE",
      "Delivery Location": item.delLocation || "FACTORY",
      "Current Stage": getDisplayStage(item, item.currentStage),
      "Completed Stages": item.completedStages && item.completedStages.length > 0 ? item.completedStages.join(", ") : "None",
      "Stage Specific Details": stageDetails,
      "Status": item.status,
      "Last Updated": formatPlatformDateTime(item.updatedAt),
      "Remarks": item.remarks || "",
    };
  });
}

const standardColWidths = [
  { wch: 6 },  // Sr No
  { wch: 12 }, // Order #
  { wch: 12 }, // OB #
  { wch: 12 }, // SFO #
  { wch: 14 }, // Batch #
  { wch: 8 },  // POS #
  { wch: 22 }, // Barcode
  { wch: 14 }, // Serial Number
  { wch: 32 }, // Customer Name
  { wch: 24 }, // Project Name
  { wch: 22 }, // Glass Code
  { wch: 36 }, // Glass Description
  { wch: 38 }, // Glass Makeup / Buildup
  { wch: 32 }, // Outer Glass (OP)
  { wch: 20 }, // Spacer / Cavity
  { wch: 28 }, // Inner Glass (IP)
  { wch: 18 }, // Product Category
  { wch: 12 }, // Glass Finish
  { wch: 12 }, // Width (mm)
  { wch: 12 }, // Height (mm)
  { wch: 14 }, // Order Qty (Line Qty)
  { wch: 10 }, // Stage Qty
  { wch: 10 }, // Unit
  { wch: 12 }, // Total SQM
  { wch: 14 }, // Sheet / Rack No
  { wch: 26 }, // Process Route
  { wch: 14 }, // Delivery Date
  { wch: 14 }, // OPT Date
  { wch: 14 }, // Origin
  { wch: 16 }, // Delivery Location
  { wch: 16 }, // Current Stage
  { wch: 24 }, // Completed Stages
  { wch: 28 }, // Stage Specific Details
  { wch: 14 }, // Status
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
 * Splits Colour & Clear logs into separate sheets if applicable
 */
export function exportStageHistoryToExcel(
  stage: ProductionStage,
  historyRecords: ProductionHistory[],
  glassItemsLookup: GlassItem[] = [],
  pis: PIMaster[] = []
) {
  const stageRecords = historyRecords.filter((h) => h.stage === stage);

  if (stageRecords.length === 0) {
    try {
      toast.error(`No historical completion logs found for ${stage} stage.`);
    } catch {}
    return;
  }

  const mapRecord = (rec: ProductionHistory, idx: number) => {
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
      : "—";

    const makeupDetails = matchingItem
      ? resolveGlassMakeupDetails(matchingItem, glassItemsLookup, pis)
      : { makeup: "—", outerGlass: "—", spacer: "—", innerGlass: "—" };

    return {
      "Log ID": rec.id,
      "Sr No": idx + 1,
      "Completed Date & Time (GST)": formatPlatformDateTime(rec.timestamp),
      "Workstation Stage": rec.stage,
      "Operator": rec.operator || "Operator",
      "Order #": matchingItem?.orderNo || matchingPI?.jobOrderNumber || "—",
      "OB #": matchingItem?.obNo || matchingPI?.obNo || "—",
      "SFO #": matchingItem?.sfoNo || matchingPI?.sfoNo || "—",
      "Batch #": formatBatchNumber(rec.piNumber || matchingItem?.batchNo) || rec.piNumber,
      "POS #": matchingItem?.posNo || "—",
      "Barcode": rec.barcode || matchingItem?.barcode || "—",
      "Serial Number": rec.serialNumber,
      "Customer Name": matchingItem?.customerName || matchingPI?.customerName || "—",
      "Project Name": matchingItem?.projectName || matchingPI?.projectName || "—",
      "Glass Code": matchingItem?.glassCode || matchingItem?.itemCode || "—",
      "Glass Description": matchingItem?.glassType || "—",
      "Glass Makeup / Buildup": makeupDetails.makeup,
      "Outer Glass (OP)": makeupDetails.outerGlass,
      "Spacer / Cavity": makeupDetails.spacer,
      "Inner Glass (IP)": makeupDetails.innerGlass,
      "Product Category": productType,
      "Glass Finish": finish,
      "Width (mm)": matchingItem?.width || "—",
      "Height (mm)": matchingItem?.height || "—",
      "Order Qty (Line Qty)": matchingItem?.lineQty || matchingItem?.qty || 1,
      "Processed QTY": eff.qty,
      "Unit": eff.unitLabel,
      "Total SQM": eff.sqm,
      "Sheet / Rack No": matchingItem?.rackNo || "—",
      "Process Route": Array.isArray(matchingItem?.processRoute) ? matchingItem.processRoute.join(" → ") : String(matchingItem?.processRoute || "—"),
      "Delivery Date": matchingItem?.delDate || matchingPI?.deliveryDate || "—",
      "OPT Date": matchingItem?.optDate || matchingPI?.sfoDate || matchingPI?.issueDate || "—",
      "Origin": "MADE IN UAE",
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
    { wch: 12 }, // Order #
    { wch: 12 }, // OB #
    { wch: 12 }, // SFO #
    { wch: 14 }, // Batch #
    { wch: 8 },  // POS #
    { wch: 22 }, // Barcode
    { wch: 14 }, // Serial Number
    { wch: 30 }, // Customer Name
    { wch: 22 }, // Project Name
    { wch: 20 }, // Glass Code
    { wch: 34 }, // Glass Description
    { wch: 38 }, // Glass Makeup
    { wch: 30 }, // Outer Glass (OP)
    { wch: 20 }, // Spacer / Cavity
    { wch: 28 }, // Inner Glass (IP)
    { wch: 18 }, // Product Category
    { wch: 12 }, // Glass Finish
    { wch: 12 }, // Width
    { wch: 12 }, // Height
    { wch: 14 }, // Order Qty
    { wch: 14 }, // Processed QTY
    { wch: 10 }, // Unit
    { wch: 12 }, // Total SQM
    { wch: 14 }, // Sheet / Rack No
    { wch: 26 }, // Process Route
    { wch: 14 }, // Delivery Date
    { wch: 14 }, // OPT Date
    { wch: 14 }, // Origin
    { wch: 14 }, // Scan Status
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
    try {
      toast.error("No items selected for dispatch note export.");
    } catch {}
    return;
  }

  const noteNo = options?.dispatchNoteNo || dispatchedItems[0]?.dispatchNoteNo || `DN-${Date.now().toString().slice(-6)}`;
  const customerName = pi?.customerName || dispatchedItems[0]?.customerName || dispatchedItems[0]?.piNumber || "CUSTOMER";
  const projectName = pi?.projectName || dispatchedItems[0]?.projectName || dispatchedItems[0]?.sfoNo || "PROJECT";
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

    const makeupDetails = resolveGlassMakeupDetails(item, dispatchedItems, pi ? [pi] : []);

    return [
      idx + 1,                                  // A: Sr No
      item.orderNo || pi?.jobOrderNumber || "—",// B: Order #
      item.obNo || pi?.obNo || "—",             // C: OB #
      item.sfoNo || pi?.sfoNo || "—",           // D: SFO #
      item.batchNo || pi?.batchNo || "—",       // E: Batch #
      item.posNo || String(idx + 1),            // F: Pos #
      item.barcode,                             // G: Barcode
      item.serialNumber,                        // H: Serial #
      item.glassCode || item.itemCode || "—",   // I: Glass Code
      item.glassType,                           // J: Glass Description
      makeupDetails.makeup,                     // K: Glass Makeup / Buildup
      makeupDetails.outerGlass,                 // L: Outer Glass (OP)
      makeupDetails.spacer,                     // M: Spacer / Cavity
      makeupDetails.innerGlass,                 // N: Inner Glass (IP)
      productType,                              // O: Product Type
      getItemFinish(item),                      // P: Finish (Colour / Clear)
      item.width,                               // Q: Width (mm)
      item.height,                              // R: Height (mm)
      item.lineQty || item.qty || 1,            // S: Order Qty (Line Qty)
      eff.qty,                                  // T: Dispatched Qty
      eff.sqm,                                  // U: Total SQM
      item.rackNo || "—",                       // V: Rack / Sheet No
      item.delDate || pi?.deliveryDate || "—",  // W: Delivery Date
      "MADE IN UAE",                            // X: Origin
      item.remarks || "DISPATCHED",             // Y: Remarks
    ];
  });

  // Sheet layout structure: Header, Metadata, Item Table, Summary Footer
  const sheetData: (string | number)[][] = [
    ["SEJAL GLASS - PARTIAL DISPATCH DELIVERY NOTE / PACKING LIST"],
    ["--------------------------------------------------------------------------------"],
    ["Delivery Note No:", noteNo, "", "Dispatch Date:", dispatchDate],
    ["Customer Name:", customerName, "", "Project Name:", projectName],
    ["Job Order / SFO:", pi?.jobOrderNumber || dispatchedItems[0]?.sfoNo || "—", "", "Dispatch Location:", options?.deliveryLoc || pi?.dispatchTo || dispatchedItems[0]?.delLocation || "FACTORY"],
    ["Vehicle / Truck No:", options?.truckNo || dispatchedItems[0]?.vehicleNo || "—", "", "Driver Name:", options?.driverName || dispatchedItems[0]?.driverName || "—"],
    [], // Blank line
    [
      "Sr No",
      "Order #",
      "OB #",
      "SFO #",
      "Batch #",
      "POS #",
      "Barcode",
      "Serial Number",
      "Glass Code",
      "Glass Description",
      "Glass Makeup / Buildup",
      "Outer Glass (OP)",
      "Spacer / Cavity",
      "Inner Glass (IP)",
      "Product Type",
      "Finish",
      "Width (mm)",
      "Height (mm)",
      "Order Qty",
      "Dispatched QTY",
      "Total SQM",
      "Rack No",
      "Delivery Date",
      "Origin",
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
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      `Total Items: ${dispatchedItems.length}`,
      "",
      totalPieces,
      parseFloat(totalSqm.toFixed(2)),
      "",
      "",
      "",
      "Total Shipped in Truck",
    ],
    [],
    ["Authorized Dispatch Stamp:", "", "", "", "", "Driver Signature:", "", "", "", "", "Received By (Customer):"],
  ];

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Styling / Widths
  ws["!cols"] = [
    { wch: 6 },  // Sr No
    { wch: 12 }, // Order #
    { wch: 12 }, // OB #
    { wch: 12 }, // SFO #
    { wch: 14 }, // Batch #
    { wch: 8 },  // POS #
    { wch: 22 }, // Barcode
    { wch: 14 }, // Serial Number
    { wch: 22 }, // Glass Code
    { wch: 34 }, // Glass Description
    { wch: 38 }, // Glass Makeup / Buildup
    { wch: 30 }, // Outer Glass (OP)
    { wch: 20 }, // Spacer / Cavity
    { wch: 28 }, // Inner Glass (IP)
    { wch: 18 }, // Product Type
    { wch: 12 }, // Finish
    { wch: 12 }, // Width
    { wch: 12 }, // Height
    { wch: 12 }, // Order Qty
    { wch: 16 }, // Dispatched QTY
    { wch: 14 }, // Total SQM
    { wch: 12 }, // Rack No
    { wch: 14 }, // Delivery Date
    { wch: 14 }, // Origin
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
    try {
      toast.error("No items available for this batch.");
    } catch {}
    return;
  }

  const mapBatchRow = (item: GlassItem, idx: number) => {
    const eff = getDguEffectiveQtyAndSqm(item);
    const completedStages = item.completedStages || [];

    const isCut = completedStages.includes("Cutting") || item.currentStage !== "Cutting";
    const isPolished = completedStages.includes("Polishing") || (item.currentStage !== "Cutting" && item.currentStage !== "Polishing");
    const isPairing = completedStages.includes("Pairing");
    const isDgu = completedStages.includes("DGU") || (item.currentStage !== "Cutting" && item.currentStage !== "Polishing" && item.currentStage !== "Pairing" && item.currentStage !== "DGU");
    const isLam = completedStages.includes("Lamination") || (item.currentStage === "Finished" && item.processRoute.includes("Lamination"));
    const isDispatched = (item as any).isDispatched === true || (item as any).currentStage === "Dispatched" || Boolean((item as any).dispatchedAt);

    const makeupDetails = resolveGlassMakeupDetails(item, items, [pi]);

    return {
      "Sr No": idx + 1,
      "Order #": item.orderNo || pi.jobOrderNumber || pi.proformaInvNo || "—",
      "OB #": item.obNo || pi.obNo || "—",
      "SFO #": item.sfoNo || pi.sfoNo || "—",
      "Batch Number": formatBatchNumber(pi.piNumber) || pi.piNumber,
      "POS #": item.posNo || String(idx + 1),
      "Barcode": item.barcode,
      "Serial Number": item.serialNumber,
      "Customer": item.customerName || pi.customerName,
      "Project": item.projectName || pi.projectName,
      "Glass Code": item.glassCode || item.itemCode || "—",
      "Glass Description": item.glassType,
      "Glass Makeup / Buildup": makeupDetails.makeup,
      "Outer Glass (OP)": makeupDetails.outerGlass,
      "Spacer / Cavity": makeupDetails.spacer,
      "Inner Glass (IP)": makeupDetails.innerGlass,
      "Glass Finish": getItemFinish(item),
      "Width (mm)": item.width,
      "Height (mm)": item.height,
      "Order QTY (Line Qty)": item.lineQty || item.qty || 1,
      "Stage Qty": eff.qty,
      "Order SQM": eff.sqm,
      "Sheet / Rack No": item.rackNo || "—",
      "Process Route": Array.isArray(item.processRoute) ? item.processRoute.join(" → ") : String(item.processRoute || "—"),
      "Delivery Date": item.delDate || pi.deliveryDate || "—",
      "OPT Date": item.optDate || pi.sfoDate || pi.issueDate || "—",
      "Origin": "MADE IN UAE",
      "Current Workstation": item.currentStage,
      "Cutting Status": isCut ? "DONE" : "PENDING",
      "Polishing Status": item.processRoute.includes("Polishing") ? (isPolished ? "DONE" : "PENDING") : "N/A",
      "Pairing Status": item.processRoute.includes("Pairing") ? (isPairing ? "DONE" : "PENDING") : "N/A",
      "DGU / IGU Status": item.processRoute.includes("DGU") ? (isDgu ? "DONE" : "PENDING") : "N/A",
      "Lamination Status": item.processRoute.includes("Lamination") ? (isLam ? "DONE" : "PENDING") : "N/A",
      "Dispatch Status": isDispatched ? "DISPATCHED" : "PENDING",
      "Overall Status": item.status,
    };
  };

  const matrixWidths = [
    { wch: 6 },  // Sr No
    { wch: 12 }, // Order #
    { wch: 12 }, // OB #
    { wch: 12 }, // SFO #
    { wch: 14 }, // Batch Number
    { wch: 8 },  // POS #
    { wch: 22 }, // Barcode
    { wch: 14 }, // Serial Number
    { wch: 28 }, // Customer
    { wch: 22 }, // Project
    { wch: 20 }, // Glass Code
    { wch: 32 }, // Glass Description
    { wch: 38 }, // Glass Makeup
    { wch: 30 }, // Outer Glass (OP)
    { wch: 20 }, // Spacer / Cavity
    { wch: 28 }, // Inner Glass (IP)
    { wch: 12 }, // Glass Finish
    { wch: 12 }, // Width
    { wch: 12 }, // Height
    { wch: 14 }, // Order QTY
    { wch: 10 }, // Stage Qty
    { wch: 12 }, // Order SQM
    { wch: 14 }, // Sheet / Rack No
    { wch: 26 }, // Process Route
    { wch: 14 }, // Delivery Date
    { wch: 14 }, // OPT Date
    { wch: 14 }, // Origin
    { wch: 16 }, // Current Workstation
    { wch: 14 }, // Cutting Status
    { wch: 14 }, // Polishing Status
    { wch: 14 }, // Pairing Status
    { wch: 14 }, // DGU Status
    { wch: 14 }, // Lamination Status
    { wch: 14 }, // Dispatch Status
    { wch: 14 }, // Overall Status
  ];

  const wb = XLSX.utils.book_new();

  const colourItems = items.filter((i) => getItemFinish(i) === "Colour");
  const clearItems = items.filter((i) => getItemFinish(i) === "Clear");

  if (colourItems.length > 0) {
    const wsColour = XLSX.utils.json_to_sheet(colourItems.map(mapBatchRow));
    wsColour["!cols"] = matrixWidths;
    XLSX.utils.book_append_sheet(wb, wsColour, "Colour Glass");
  }

  if (clearItems.length > 0) {
    const wsClear = XLSX.utils.json_to_sheet(clearItems.map(mapBatchRow));
    wsClear["!cols"] = matrixWidths;
    XLSX.utils.book_append_sheet(wb, wsClear, "Clear Glass");
  }

  const wsAll = XLSX.utils.json_to_sheet(items.map(mapBatchRow));
  wsAll["!cols"] = matrixWidths;
  XLSX.utils.book_append_sheet(wb, wsAll, "All Batch Items");

  downloadWorkbook(wb, `Batch_Matrix_${pi.piNumber}`);
}
