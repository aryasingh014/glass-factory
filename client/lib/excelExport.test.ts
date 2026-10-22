import { describe, it, expect, vi, beforeEach } from "vitest";
import * as XLSX from "xlsx";
import * as fs from "fs";
import {
  exportStageWipToExcel,
  exportStageHistoryToExcel,
  exportSelectedItemsToExcel,
  exportPartialDispatchNoteToExcel,
  exportBatchProgressMatrixToExcel,
  excelSaver,
} from "./excelExport";
import { ProductionStage } from "@shared/api";

describe("Stage Export Functionality & Sticker Fields Verification", () => {
  const db = JSON.parse(fs.readFileSync("./server/data/db.json", "utf8"));
  const fallbackItems = Array.from({ length: 5 }, (_, i) => ({
    id: `item-test-0${i + 1}`,
    serialNumber: `S00${i + 1}`,
    barcode: `101262701349000${i + 1}`,
    qrId: `S00${i + 1}`,
    piId: "pi-01",
    piNumber: "1349",
    customerName: "ALUTEC FACADE",
    projectName: "DUBAI CREEK TOWER",
    orderNo: "ORD-101",
    obNo: "OB-202",
    sfoNo: "1349",
    posNo: String(i + 1),
    srNo: i + 1,
    glassType: "8MM SYP YBE 0140N #2 + 16MM BLACK SPACER + 8MM CLEAR",
    glassCode: "SACW-01",
    colorOrClear: i % 2 === 0 ? "Colour" : "Clear",
    width: 1200,
    height: 2400,
    qty: 2,
    sqm: 5.76,
    rackNo: "1",
    currentStage: "Cutting",
    completedStages: [],
    processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
    glassCategory: "DGU",
    status: "In Production",
  }));
  const items = Array.isArray(db.glassItemsDatabase) && db.glassItemsDatabase.length >= 5 ? db.glassItemsDatabase : fallbackItems;
  const pis = Array.isArray(db.piDatabase) && db.piDatabase.length > 0 ? db.piDatabase : [{ id: "pi-01", piNumber: "1349", customerName: "ALUTEC FACADE", projectName: "DUBAI CREEK TOWER" }];
  const history = Array.isArray(db.productionHistoryDatabase) && db.productionHistoryDatabase.length > 0 ? db.productionHistoryDatabase : [{
    id: "hist-01",
    serialNumber: "S001",
    barcode: "1012627013490001",
    piNumber: "1349",
    stage: "Cutting",
    status: "Completed",
    operator: "Tester",
    timestamp: new Date().toISOString(),
    remarks: "Tested",
  }];

  const capturedFiles: Record<string, any> = {};

  beforeEach(() => {
    vi.spyOn(excelSaver, "save").mockImplementation((wb: any, filename: string) => {
      capturedFiles[filename] = wb;
    });
  });

  const stages: ProductionStage[] = ["Cutting", "Polishing", "Pairing", "DGU", "Lamination", "Finished"];

  it("should export Stage WIP for all stages with all sticker and ERP details", () => {
    stages.forEach((st) => {
      const sampleItems = items.slice(0, 15);
      exportStageWipToExcel(st, sampleItems, `${st}_Test_WIP`, pis);

      const foundFilename = Object.keys(capturedFiles).find((f) => f.includes(`${st}_Test_WIP`));
      expect(foundFilename).toBeDefined();

      const wb = capturedFiles[foundFilename!];
      expect(wb.SheetNames).toContain("All Items (Combined)");

      const combinedSheet = wb.Sheets["All Items (Combined)"];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(combinedSheet);
      expect(rows.length).toBeGreaterThan(0);

      const firstRow = rows[0];

      // Verify all sticker details are present in the exported file:
      expect(firstRow).toHaveProperty("Order #");
      expect(firstRow).toHaveProperty("OB #");
      expect(firstRow).toHaveProperty("SFO #");
      expect(firstRow).toHaveProperty("Batch #");
      expect(firstRow).toHaveProperty("POS #");
      expect(firstRow).toHaveProperty("Barcode");
      expect(firstRow).toHaveProperty("Serial Number");
      expect(firstRow).toHaveProperty("Customer Name");
      expect(firstRow).toHaveProperty("Project Name");
      expect(firstRow).toHaveProperty("Glass Code");
      expect(firstRow).toHaveProperty("Glass Description");
      expect(firstRow).toHaveProperty("Glass Makeup / Buildup");
      expect(firstRow).toHaveProperty("Outer Glass (OP)");
      expect(firstRow).toHaveProperty("Spacer / Cavity");
      expect(firstRow).toHaveProperty("Inner Glass (IP)");
      expect(firstRow).toHaveProperty("Product Category");
      expect(firstRow).toHaveProperty("Glass Finish");
      expect(firstRow).toHaveProperty("Width (mm)");
      expect(firstRow).toHaveProperty("Height (mm)");
      expect(firstRow).toHaveProperty("Order Qty (Line Qty)");
      expect(firstRow).toHaveProperty("Stage Qty");
      expect(firstRow).toHaveProperty("Unit");
      expect(firstRow).toHaveProperty("Total SQM");
      expect(firstRow).toHaveProperty("Sheet / Rack No");
      expect(firstRow).toHaveProperty("Process Route");
      expect(firstRow).toHaveProperty("Delivery Date");
      expect(firstRow).toHaveProperty("OPT Date");
      expect(firstRow).toHaveProperty("Origin");
      expect(firstRow["Origin"]).toBe("MADE IN UAE");
      expect(firstRow).toHaveProperty("Delivery Location");
      expect(firstRow).toHaveProperty("Current Stage");
      expect(firstRow).toHaveProperty("Completed Stages");
      expect(firstRow).toHaveProperty("Stage Specific Details");
      expect(firstRow).toHaveProperty("Status");
      expect(firstRow).toHaveProperty("Last Updated");
      expect(firstRow).toHaveProperty("Remarks");
    });
  });

  it("should export Stage History Logs with all sticker and audit details", () => {
    stages.forEach((st) => {
      const stageHist = history.slice(0, 10).map((h: any) => ({ ...h, stage: st }));
      exportStageHistoryToExcel(st, stageHist, items, pis);

      const foundFilename = Object.keys(capturedFiles).find((f) => f.includes(`${st}_Stage_History_Report`));
      expect(foundFilename).toBeDefined();

      const wb = capturedFiles[foundFilename!];
      const sheet = wb.Sheets[wb.SheetNames[wb.SheetNames.length - 1]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
      expect(rows.length).toBeGreaterThan(0);

      const firstRow = rows[0];
      expect(firstRow).toHaveProperty("Log ID");
      expect(firstRow).toHaveProperty("Workstation Stage");
      expect(firstRow).toHaveProperty("Operator");
      expect(firstRow).toHaveProperty("Order #");
      expect(firstRow).toHaveProperty("OB #");
      expect(firstRow).toHaveProperty("SFO #");
      expect(firstRow).toHaveProperty("Batch #");
      expect(firstRow).toHaveProperty("POS #");
      expect(firstRow).toHaveProperty("Barcode");
      expect(firstRow).toHaveProperty("Customer Name");
      expect(firstRow).toHaveProperty("Project Name");
      expect(firstRow).toHaveProperty("Glass Code");
      expect(firstRow).toHaveProperty("Glass Description");
      expect(firstRow).toHaveProperty("Glass Makeup / Buildup");
      expect(firstRow).toHaveProperty("Width (mm)");
      expect(firstRow).toHaveProperty("Height (mm)");
      expect(firstRow).toHaveProperty("Order Qty (Line Qty)");
      expect(firstRow).toHaveProperty("Processed QTY");
      expect(firstRow).toHaveProperty("Total SQM");
      expect(firstRow).toHaveProperty("Sheet / Rack No");
      expect(firstRow).toHaveProperty("Process Route");
      expect(firstRow).toHaveProperty("Delivery Date");
      expect(firstRow).toHaveProperty("OPT Date");
      expect(firstRow).toHaveProperty("Origin");
      expect(firstRow["Origin"]).toBe("MADE IN UAE");
      expect(firstRow).toHaveProperty("Scan Status");
    });
  });

  it("should export Selected Items with all sticker fields", () => {
    exportSelectedItemsToExcel("Cutting", items.slice(0, 3), "Selected_Items_Verification", pis);

    const foundFilename = Object.keys(capturedFiles).find((f) => f.includes("Selected_Items_Verification"));
    expect(foundFilename).toBeDefined();

    const wb = capturedFiles[foundFilename!];
    const sheet = wb.Sheets["Selected Items (Combined)"];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
    expect(rows.length).toBe(3);
    expect(rows[0]).toHaveProperty("Order #");
    expect(rows[0]).toHaveProperty("Barcode");
    expect(rows[0]).toHaveProperty("Customer Name");
    expect(rows[0]).toHaveProperty("Project Name");
    expect(rows[0]).toHaveProperty("Delivery Date");
    expect(rows[0]).toHaveProperty("OPT Date");
    expect(rows[0]["Origin"]).toBe("MADE IN UAE");
  });

  it("should export Delivery Note with all required sticker details", () => {
    exportPartialDispatchNoteToExcel(pis[0], items.slice(0, 5));

    const foundFilename = Object.keys(capturedFiles).find((f) => f.includes("Delivery_Note"));
    expect(foundFilename).toBeDefined();

    const wb = capturedFiles[foundFilename!];
    const sheet = wb.Sheets["Delivery_Note"];
    const tableData = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });

    const headerRow = tableData[7];
    expect(headerRow).toContain("Order #");
    expect(headerRow).toContain("OB #");
    expect(headerRow).toContain("SFO #");
    expect(headerRow).toContain("Batch #");
    expect(headerRow).toContain("POS #");
    expect(headerRow).toContain("Barcode");
    expect(headerRow).toContain("Glass Code");
    expect(headerRow).toContain("Glass Description");
    expect(headerRow).toContain("Glass Makeup / Buildup");
    expect(headerRow).toContain("Width (mm)");
    expect(headerRow).toContain("Height (mm)");
    expect(headerRow).toContain("Order Qty");
    expect(headerRow).toContain("Dispatched QTY");
    expect(headerRow).toContain("Total SQM");
    expect(headerRow).toContain("Rack No");
    expect(headerRow).toContain("Delivery Date");
    expect(headerRow).toContain("Origin");
  });

  it("should export Batch Progress Matrix with all sticker and workstation columns", () => {
    exportBatchProgressMatrixToExcel(pis[0], items.slice(0, 5));

    const foundFilename = Object.keys(capturedFiles).find((f) => f.includes("Batch_Matrix"));
    expect(foundFilename).toBeDefined();

    const wb = capturedFiles[foundFilename!];
    const sheet = wb.Sheets["All Batch Items"];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
    expect(rows.length).toBe(5);

    const firstRow = rows[0];
    expect(firstRow).toHaveProperty("Order #");
    expect(firstRow).toHaveProperty("OB #");
    expect(firstRow).toHaveProperty("SFO #");
    expect(firstRow).toHaveProperty("Batch Number");
    expect(firstRow).toHaveProperty("POS #");
    expect(firstRow).toHaveProperty("Barcode");
    expect(firstRow).toHaveProperty("Customer");
    expect(firstRow).toHaveProperty("Project");
    expect(firstRow).toHaveProperty("Glass Code");
    expect(firstRow).toHaveProperty("Glass Description");
    expect(firstRow).toHaveProperty("Glass Makeup / Buildup");
    expect(firstRow).toHaveProperty("Order QTY (Line Qty)");
    expect(firstRow).toHaveProperty("Order SQM");
    expect(firstRow).toHaveProperty("Sheet / Rack No");
    expect(firstRow).toHaveProperty("Process Route");
    expect(firstRow).toHaveProperty("Delivery Date");
    expect(firstRow).toHaveProperty("OPT Date");
    expect(firstRow).toHaveProperty("Origin");
    expect(firstRow["Origin"]).toBe("MADE IN UAE");
  });

  it("should accurately resolve 3-layer glass buildup: Outer Glass, Spacer, and Inner Glass", () => {
    const colourItem = {
      id: "test-col-1",
      piId: "batch-test",
      serialNumber: "S077",
      barcode: "1012627016640056",
      glassType: "8MM EMICOOL DSR III ON CLEAR",
      glassCategory: "DGU",
      colorOrClear: "Colour",
      width: 1722,
      height: 3558,
      qty: 1,
      sqm: 6.13,
      batchNo: "5826",
      customerName: "ASHBILIA ALUMINIUM & GLASS L.L.C",
      projectName: "DISTRICT_O",
      makeup: "8MM EMICOOL DSR III ON CLEAR + 16MM BLACK SPACER + 8MM CLEAR",
    };
    const clearItem = {
      id: "test-clr-1",
      piId: "batch-test",
      serialNumber: "S257",
      barcode: "1012627016640057",
      glassType: "8MM CLEAR",
      glassCategory: "DGU",
      colorOrClear: "Clear",
      width: 1722,
      height: 3558,
      qty: 1,
      sqm: 6.13,
      batchNo: "5846",
      customerName: "ASHBILIA ALUMINIUM & GLASS L.L.C",
      projectName: "DISTRICT_O",
      makeup: "8MM EMICOOL DSR III ON CLEAR + 16MM BLACK SPACER + 8MM CLEAR",
    };

    exportStageWipToExcel("DGU", [colourItem as any, clearItem as any], "Emicool_DGU_WIP", pis);

    const foundFilename = Object.keys(capturedFiles).find((f) => f.includes("Emicool_DGU_WIP"));
    expect(foundFilename).toBeDefined();

    const wb = capturedFiles[foundFilename!];
    const sheet = wb.Sheets["All Items (Combined)"];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

    expect(rows[0]["Outer Glass (OP)"]).toBe("8MM EMICOOL DSR III ON CLEAR");
    expect(rows[0]["Spacer / Cavity"]).toBe("16MM BLACK SPACER");
    expect(rows[0]["Inner Glass (IP)"]).toBe("8MM CLEAR");
    expect(rows[0]["Glass Makeup / Buildup"]).toBe("8MM EMICOOL DSR III ON CLEAR + 16MM BLACK SPACER + 8MM CLEAR");
  });
});
