import { describe, it, expect, vi, beforeEach } from "vitest";

const { capturedFiles } = vi.hoisted(() => ({
  capturedFiles: {} as Record<string, any>,
}));

vi.mock("xlsx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("xlsx")>();
  return {
    ...actual,
    writeFile: (wb: any, filename: string) => {
      capturedFiles[filename] = wb;
    },
  };
});

import * as XLSX from "xlsx";
import * as fs from "fs";
import {
  exportStageWipToExcel,
  exportStageHistoryToExcel,
  exportSelectedItemsToExcel,
  exportPartialDispatchNoteToExcel,
  exportBatchProgressMatrixToExcel,
  STANDARD_EXCEL_COLUMNS,
} from "./excelExport";
import { isBatchUploadHistory } from "@shared/api";
import { ProductionStage } from "@shared/api";

describe("Stage Export Functionality & Exact 31 Required Columns Verification", () => {
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
  const rawHistory = Array.isArray(db.productionHistoryDatabase) ? db.productionHistoryDatabase : [];
  const nonBatchHistory = rawHistory.filter((h: any) => !isBatchUploadHistory(h));
  const history = nonBatchHistory.length > 0 ? nonBatchHistory : [{
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

  beforeEach(() => {
    for (const key of Object.keys(capturedFiles)) {
      delete capturedFiles[key];
    }
  });

  const stages: ProductionStage[] = ["Cutting", "Polishing", "Pairing", "DGU", "Lamination", "Finished"];

  it("should have exactly the 31 required columns specified by user", () => {
    expect(STANDARD_EXCEL_COLUMNS).toEqual([
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
    ]);
    expect(STANDARD_EXCEL_COLUMNS.length).toBe(31);
  });

  it("should export Stage WIP for all stages with only the exact 31 details in order", () => {
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
      const keys = Object.keys(firstRow);

      expect(keys.length).toBe(31);
      expect(keys).toEqual([...STANDARD_EXCEL_COLUMNS]);
      expect(firstRow["Origin"]).toBe("MADE IN UAE");
    });
  });

  it("should export Stage History Logs with only the exact 31 details in order", () => {
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
      const keys = Object.keys(firstRow);

      expect(keys.length).toBe(31);
      expect(keys).toEqual([...STANDARD_EXCEL_COLUMNS]);
      expect(firstRow["Origin"]).toBe("MADE IN UAE");
    });
  });

  it("should export Selected Items with only the exact 31 details in order", () => {
    exportSelectedItemsToExcel("Cutting", items.slice(0, 3), "Selected_Items_Verification", pis);

    const foundFilename = Object.keys(capturedFiles).find((f) => f.includes("Selected_Items_Verification"));
    expect(foundFilename).toBeDefined();

    const wb = capturedFiles[foundFilename!];
    const sheet = wb.Sheets["Selected Items (Combined)"];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
    expect(rows.length).toBe(3);

    const firstRow = rows[0];
    const keys = Object.keys(firstRow);

    expect(keys.length).toBe(31);
    expect(keys).toEqual([...STANDARD_EXCEL_COLUMNS]);
    expect(firstRow["Origin"]).toBe("MADE IN UAE");
  });

  it("should export Delivery Note with only the exact 31 details in order", () => {
    exportPartialDispatchNoteToExcel(pis[0], items.slice(0, 5));

    const foundFilename = Object.keys(capturedFiles).find((f) => f.includes("Delivery_Note"));
    expect(foundFilename).toBeDefined();

    const wb = capturedFiles[foundFilename!];
    const sheet = wb.Sheets["Delivery_Note"];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
    expect(rows.length).toBe(5);

    const firstRow = rows[0];
    const keys = Object.keys(firstRow);

    expect(keys.length).toBe(31);
    expect(keys).toEqual([...STANDARD_EXCEL_COLUMNS]);
    expect(firstRow["Origin"]).toBe("MADE IN UAE");
  });

  it("should export Batch Progress Matrix with only the exact 31 details in order", () => {
    exportBatchProgressMatrixToExcel(pis[0], items.slice(0, 5));

    const foundFilename = Object.keys(capturedFiles).find((f) => f.includes("Batch_Matrix"));
    expect(foundFilename).toBeDefined();

    const wb = capturedFiles[foundFilename!];
    const sheet = wb.Sheets["All Batch Items"];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
    expect(rows.length).toBe(5);

    const firstRow = rows[0];
    const keys = Object.keys(firstRow);

    expect(keys.length).toBe(31);
    expect(keys).toEqual([...STANDARD_EXCEL_COLUMNS]);
    expect(firstRow["Origin"]).toBe("MADE IN UAE");
  });

  it("should accurately resolve 3-layer glass buildup: Outer Glass (OP), Spacer / PVB, and Inner Glass (IG)", () => {
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
    expect(rows[0]["Spacer / PVB"]).toBe("16MM BLACK SPACER");
    expect(rows[0]["Inner Glass (IG)"]).toBe("8MM CLEAR");
    expect(rows[0]["Glass Makeup / Buildup"]).toBe("8MM EMICOOL DSR III ON CLEAR + 16MM BLACK SPACER + 8MM CLEAR");
  });
});
