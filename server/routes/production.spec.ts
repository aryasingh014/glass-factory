import { describe, it, expect } from "vitest";
import { sanitizeString } from "./production";
import { formatSejalBarcode, generateBarcodeSVG, generateQRCodeSVG } from "../../client/lib/barcode";

describe("Production Route Utilities & Sanitization", () => {
  it("should strip HTML and script tags from input strings", () => {
    const malicious = "<script>alert('xss')</script>Edge defect";
    const clean = sanitizeString(malicious, 500);
    expect(clean).toBe("alert('xss')Edge defect");
    expect(clean).not.toContain("<script>");
  });

  it("should enforce maximum string length limits", () => {
    const longString = "A".repeat(1000);
    const clean = sanitizeString(longString, 100);
    expect(clean).toHaveLength(100);
  });

  it("should format Sejal 17-digit barcodes correctly", () => {
    const barcode = formatSejalBarcode("1349", 2);
    expect(barcode).toBe("10126270013490002");
    expect(barcode).toHaveLength(17);
    expect(barcode).toMatch(/^\d{17}$/);
  });

  it("should escape special characters in SVG barcode generation", () => {
    const svg = generateBarcodeSVG("10126270<script>", 50, 2);
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });

  it("should generate valid QR SVG content", () => {
    const qrSvg = generateQRCodeSVG("PI:PI-001|JOB:P-1526", 100);
    expect(qrSvg).toContain("<svg");
    expect(qrSvg).toContain("viewBox=\"0 0 100 100\"");
  });
});

describe("PDF Batch Duplicate Prevention Logic", () => {
  it("should detect and reject uploading the same PDF file or batch twice", async () => {
    const { handleStickerUpload, handleCheckStickerDuplicates } = await import("./production");
    const { piDatabase } = await import("./pi");

    const testFileName = "Glass1_Test.pdf";
    const testBatchId = "201765-B5442-TEST";

    piDatabase.push({
      id: "batch-test-pdf",
      piNumber: testBatchId,
      fileName: testFileName,
      customerName: "BRIGHT PLUS FITOUT",
      jobOrderNumber: "201765",
      projectName: "VAL_BY_KAS",
      issueDate: "2026-08-31",
      sfoNo: "201765",
      totalQty: 407,
      totalSqm: 500,
      glassDescription: "6MM CLEAR TEMPERED",
      status: "In Production",
      itemsCount: 407,
      completedItemsCount: 0,
      createdAt: new Date().toISOString(),
    });

    // 1. Test check duplicates endpoint handler detects PDF duplicate
    let checkStatus = 200;
    let checkBody: any = null;
    const reqCheck: any = { body: { fileName: testFileName, batchTitle: testBatchId } };
    const resCheck: any = {
      status: (code: number) => { checkStatus = code; return resCheck; },
      json: (data: any) => { checkBody = data; return resCheck; },
    };
    handleCheckStickerDuplicates(reqCheck, resCheck, () => {});
    expect(checkBody.isPdfDuplicate).toBe(true);
    expect(checkBody.existingBatch?.piNumber).toBe(testBatchId);

    // 2. Test upload duplicate PDF rejection (409 Conflict)
    let uploadStatus = 200;
    let uploadBody: any = null;
    const reqUpload: any = {
      body: {
        fileName: testFileName,
        sfoNo: "201765",
        batchNo: "5442-TEST",
        batchTitle: testBatchId,
        items: [
          { barcode: "10126270001", posNo: "1", width: 1000, height: 1000, qty: 1 },
          { barcode: "10126270002", posNo: "2", width: 1200, height: 1000, qty: 1 },
        ],
      },
    };
    const resUpload: any = {
      status: (code: number) => { uploadStatus = code; return resUpload; },
      json: (data: any) => { uploadBody = data; return resUpload; },
    };
    handleStickerUpload(reqUpload, resUpload, () => {});
    expect(uploadStatus).toBe(409);
    expect(uploadBody.error).toBe("PDF Batch Already Uploaded");
    expect(uploadBody.message).toContain("1 PDF cannot be uploaded 2 times");
  });

  it("should allow uploading a new unique PDF without blocking", async () => {
    const { handleCheckStickerDuplicates } = await import("./production");

    let checkStatus = 200;
    let checkBody: any = null;
    const reqCheck: any = { body: { fileName: "BrandNewFile_999.pdf", batchTitle: "SFO-999-B1" } };
    const resCheck: any = {
      status: (code: number) => { checkStatus = code; return resCheck; },
      json: (data: any) => { checkBody = data; return resCheck; },
    };
    handleCheckStickerDuplicates(reqCheck, resCheck, () => {});
    expect(checkBody.isPdfDuplicate).toBe(false);
    expect(checkBody.existingBatch).toBeNull();
  });
});

describe("Quantity (QTY) Decrement & Per-Piece Scanning Logic", () => {
  it("should decrement item quantity by 1 per scan and advance 1 piece to next stage", async () => {
    const { handleAdvanceStage } = await import("./production");
    const { piDatabase, glassItemsDatabase } = await import("./pi");

    const testItemSerial = `TEST-QTY-S${Date.now()}`;
    const testBarcode = `101262709999${Date.now().toString().slice(-4)}`;

    glassItemsDatabase.push({
      id: `item-test-qty-${Date.now()}`,
      piId: "pi-qty-test",
      piNumber: "B9999",
      serialNumber: testItemSerial,
      barcode: testBarcode,
      qrId: `QR-${testBarcode}`,
      orderNo: "ORD-999",
      obNo: "3705",
      sfoNo: "201765",
      batchNo: "9999",
      posNo: "17",
      srNo: 17,
      itemCode: "GL-17",
      glassCode: "GL 15 RF 003",
      glassType: "6MM CLEAR TEMPERED",
      width: 1075,
      height: 3440,
      thickness: "6MM",
      qty: 5,
      lineQty: 5,
      rackNo: "1",
      sqm: 18.49,
      delLocation: "FACTORY",
      taper: "",
      holesCutout: "",
      shape: "",
      layer: "",
      sectionName: "",
      remarks: "",
      processRoute: ["Cutting", "Finished"],
      currentStage: "Cutting",
      status: "In Production",
      completedStages: [],
      updatedAt: new Date().toISOString(),
    });

    // 1. Scan 1 piece: QTY should reduce from 5 to 4 in Cutting
    let resBody1: any = null;
    const req1: any = {
      body: {
        serialNumbers: [testItemSerial],
        advanceQty: 1,
        advanceAll: false,
        operator: "Scanner1",
      },
    };
    const res1: any = {
      status: () => res1,
      json: (data: any) => { resBody1 = data; return res1; },
    };

    handleAdvanceStage(req1, res1, () => {});

    const cuttingItem = glassItemsDatabase.find((g) => g.serialNumber === testItemSerial && g.currentStage === "Cutting");
    expect(cuttingItem).toBeDefined();
    expect(cuttingItem?.qty).toBe(4);
    expect(cuttingItem?.sqm).toBeCloseTo((1075 * 3440 * 4) / 1000000, 2);

    // 2. Scan 2nd time: QTY should reduce from 4 to 3 in Cutting
    const req2: any = {
      body: {
        serialNumbers: [testItemSerial],
        advanceQty: 1,
        advanceAll: false,
        operator: "Scanner1",
      },
    };
    handleAdvanceStage(req2, res1, () => {});

    const cuttingItemAfter2 = glassItemsDatabase.find((g) => g.serialNumber === testItemSerial && g.currentStage === "Cutting");
    expect(cuttingItemAfter2?.qty).toBe(3);

    // Clean up test items
    const testPiIdx = piDatabase.findIndex((p) => p.id === "pi-qty-test");
    if (testPiIdx !== -1) piDatabase.splice(testPiIdx, 1);
    const testItemIdx = glassItemsDatabase.findIndex((g) => g.serialNumber === testItemSerial);
    if (testItemIdx !== -1) glassItemsDatabase.splice(testItemIdx, 1);
  });
});

describe("Glass Finish (Clear vs Coloured) Upload Distinction", () => {
  it("should preserve Clear finish when uploading Clear glass batch (even with DGU makeup text)", async () => {
    const { handleStickerUpload } = await import("./production");
    const { piDatabase, glassItemsDatabase } = await import("./pi");

    const testClearBatchNo = `TEST-CLEAR-${Date.now()}`;
    let resData: any = null;
    let resStatus = 200;

    const req: any = {
      body: {
        customerName: "BRIGHT PLUS FITOUT",
        projectName: "VAL_BY_KAS",
        sfoNo: "201765",
        batchNo: testClearBatchNo,
        batchTitle: testClearBatchNo,
        fileName: "Glass1_Clear_Test.pdf",
        colorOrClear: "Clear",
        glassColor: "Clear Glass",
        glassCategory: "DGU",
        items: [
          {
            posNo: "1",
            width: 1075,
            height: 3440,
            qty: 1,
            glassCode: "GL 15 RF 003 SITE",
            glassType: "6MM CLEAR",
            colorOrClear: "Clear",
            glassColor: "Clear Float",
            barcode: `101262709991${Date.now().toString().slice(-4)}`,
          },
        ],
      },
    };

    const res: any = {
      status: (code: number) => { resStatus = code; return res; },
      json: (data: any) => { resData = data; return res; },
    };

    handleStickerUpload(req, res, () => {});
    expect(resStatus).toBe(200);
    expect(resData.batch.colorOrClear).toBe("Clear");
    expect(resData.batch.glassColor).toBe("Clear Glass");

    const createdItem = glassItemsDatabase.find((g) => g.batchNo === testClearBatchNo);
    expect(createdItem?.colorOrClear).toBe("Clear");
    expect(createdItem?.glassColor).toBe("Clear Glass");

    // Clean up
    const piIdx = piDatabase.findIndex((p) => p.piNumber === testClearBatchNo);
    if (piIdx !== -1) piDatabase.splice(piIdx, 1);
    const itemIdx = glassItemsDatabase.findIndex((g) => g.batchNo === testClearBatchNo);
    if (itemIdx !== -1) glassItemsDatabase.splice(itemIdx, 1);
  });

  it("should preserve Colour finish when uploading Coloured glass batch", async () => {
    const { handleStickerUpload } = await import("./production");
    const { piDatabase, glassItemsDatabase } = await import("./pi");

    const testColourBatchNo = `TEST-COLOUR-${Date.now()}`;
    let resData: any = null;
    let resStatus = 200;

    const req: any = {
      body: {
        customerName: "BRIGHT PLUS FITOUT",
        projectName: "VAL_BY_KAS",
        sfoNo: "201765",
        batchNo: testColourBatchNo,
        batchTitle: testColourBatchNo,
        fileName: "Glass3_Colour_Test.pdf",
        colorOrClear: "Colour",
        glassColor: "Coloured Glass",
        glassCategory: "DGU",
        items: [
          {
            posNo: "1",
            width: 1075,
            height: 3440,
            qty: 1,
            glassCode: "GL 15 RF 001 SITE",
            glassType: "6MM SYP YKN 0143N",
            colorOrClear: "Colour",
            glassColor: "Coloured Glass",
            barcode: `101262709992${Date.now().toString().slice(-4)}`,
          },
        ],
      },
    };

    const res: any = {
      status: (code: number) => { resStatus = code; return res; },
      json: (data: any) => { resData = data; return res; },
    };

    handleStickerUpload(req, res, () => {});
    expect(resStatus).toBe(200);
    expect(resData.batch.colorOrClear).toBe("Colour");
    expect(resData.batch.glassColor).toBe("Coloured Glass");

    const createdItem = glassItemsDatabase.find((g) => g.batchNo === testColourBatchNo);
    expect(createdItem?.colorOrClear).toBe("Colour");
    expect(createdItem?.glassColor).toBe("Coloured Glass");

    // Clean up
    const piIdx = piDatabase.findIndex((p) => p.piNumber === testColourBatchNo);
    if (piIdx !== -1) piDatabase.splice(piIdx, 1);
    const itemIdx = glassItemsDatabase.findIndex((g) => g.batchNo === testColourBatchNo);
    if (itemIdx !== -1) glassItemsDatabase.splice(itemIdx, 1);
  });
});

describe("DGU and Lamination Strict Category Separation", () => {
  it("isStickerPairMatch should reject pairing a DGU Colour pane with a Lamination Clear pane", async () => {
    const { isStickerPairMatch } = await import("./production");

    const dguColour = {
      orderNo: "2045",
      posNo: "1",
      width: 1000,
      height: 2000,
      colorOrClear: "Colour",
      glassCategory: "DGU",
      processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
    };

    const lamClear = {
      orderNo: "2045",
      posNo: "1",
      width: 1000,
      height: 2000,
      colorOrClear: "Clear",
      glassCategory: "Lamination",
      processRoute: ["Cutting", "Pairing", "Lamination", "Finished"],
    };

    expect(isStickerPairMatch(dguColour, lamClear)).toBe(false);
  });

  it("isLaminationStickerPairMatch should reject pairing a Lamination pane with a DGU pane", async () => {
    const { isLaminationStickerPairMatch } = await import("./production");

    const lamPaneA = {
      serialNumber: "S_LAM_1",
      orderNo: "5301",
      posNo: "2",
      width: 1200,
      height: 2400,
      glassCategory: "Lamination",
      processRoute: ["Cutting", "Pairing", "Lamination", "Finished"],
    };

    const dguPaneB = {
      serialNumber: "S_DGU_2",
      orderNo: "5301",
      posNo: "2",
      width: 1200,
      height: 2400,
      glassCategory: "DGU",
      processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
    };

    expect(isLaminationStickerPairMatch(lamPaneA, dguPaneB)).toBe(false);
  });

  it("isStickerPairMatch should correctly pair two matching DGU panes (Colour + Clear)", async () => {
    const { isStickerPairMatch } = await import("./production");

    const dguColour = {
      orderNo: "2045",
      posNo: "5",
      width: 1100,
      height: 2200,
      colorOrClear: "Colour",
      glassCategory: "DGU",
      processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
    };

    const dguClear = {
      orderNo: "2045",
      posNo: "5",
      width: 1100,
      height: 2200,
      colorOrClear: "Clear",
      glassCategory: "DGU",
      processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
    };

    expect(isStickerPairMatch(dguColour, dguClear)).toBe(true);
  });

  it("isLaminationStickerPairMatch should correctly pair two complementary Lamination panes (e.g. 10MM + 12MM)", async () => {
    const { isLaminationStickerPairMatch } = await import("./production");

    const lamPane1 = {
      serialNumber: "S_L1",
      orderNo: "1870",
      posNo: "10",
      width: 900,
      height: 1800,
      glassType: "10MM CLEAR",
      thickness: "10MM",
      piNumber: "5301",
      glassCategory: "Lamination",
      processRoute: ["Cutting", "Pairing", "Lamination", "Finished"],
    };

    const lamPane2 = {
      serialNumber: "S_L2",
      orderNo: "1870",
      posNo: "10",
      width: 900,
      height: 1800,
      glassType: "12MM CLEAR",
      thickness: "12MM",
      piNumber: "1620",
      glassCategory: "Lamination",
      processRoute: ["Cutting", "Pairing", "Lamination", "Finished"],
    };

    expect(isLaminationStickerPairMatch(lamPane1, lamPane2)).toBe(true);
  });

  it("isLaminationStickerPairMatch should REJECT pairing two identical panes of the same lite (e.g. 12MM + 12MM from Batch 1620)", async () => {
    const { isLaminationStickerPairMatch } = await import("./production");

    const paneA = {
      serialNumber: "S1237",
      orderNo: "1870",
      posNo: "1",
      width: 892,
      height: 1220,
      glassType: "12MM CLEAR",
      thickness: "12MM",
      piNumber: "1620",
      piId: "batch-1620",
      barcode: "1012627015220001",
      glassCategory: "Lamination",
      processRoute: ["Cutting", "Pairing", "Lamination", "Finished"],
    };

    const paneB = {
      serialNumber: "S1238",
      orderNo: "1870",
      posNo: "1",
      width: 892,
      height: 1220,
      glassType: "12MM CLEAR",
      thickness: "12MM",
      piNumber: "1620",
      piId: "batch-1620",
      barcode: "1012627015220001",
      glassCategory: "Lamination",
      processRoute: ["Cutting", "Pairing", "Lamination", "Finished"],
    };

    // Two pieces of the same 12MM lite must NEVER pair with each other!
    expect(isLaminationStickerPairMatch(paneA, paneB)).toBe(false);
  });
});

describe("DLGU (Double Glazed Laminated Unit) Workflow Verification", () => {
  it("should correctly identify DLGU items and distinguish them from pure DGU and Lamination", async () => {
    const { isDlguItem } = await import("./production");

    const dlguItem = {
      glassType: "37.52MM DLGU (8MM SN GREY + 16A + 13.52MM CLEAR LAMINATED)",
      glassCategory: "DLGU",
      processRoute: ["Cutting", "Pairing", "Lamination", "Pairing", "DGU", "Finished"],
    };
    const pureDgu = {
      glassType: "28MM DGU (6MM STOPRAY + 16A + 6MM CLEAR)",
      glassCategory: "DGU",
      processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
    };
    const pureLam = {
      glassType: "13.52MM CLEAR LAMINATED",
      glassCategory: "Lamination",
      processRoute: ["Cutting", "Pairing", "Lamination", "Finished"],
    };

    expect(isDlguItem(dlguItem)).toBe(true);
    expect(isDlguItem(pureDgu)).toBe(false);
    expect(isDlguItem(pureLam)).toBe(false);
  });

  it("should match Phase 1 DLGU panes (6MM CLEAR + 13.52MM CLEAR LAMINATED) into Lamination", async () => {
    const { isDlguStickerPairMatch } = await import("./production");

    const innerPane1 = {
      orderNo: "00821",
      posNo: "1",
      width: 1500,
      height: 2500,
      glassType: "6MM CLEAR",
      glassCategory: "DLGU",
      dlguPhase: "LamPairing",
      colorOrClear: "Clear",
      completedStages: ["Cutting"],
      processRoute: ["Cutting", "Pairing", "Lamination", "Pairing", "DGU", "Finished"],
    };
    const innerPane2 = {
      orderNo: "00821",
      posNo: "1",
      width: 1500,
      height: 2500,
      glassType: "13.52MM CLEAR LAMINATED",
      glassCategory: "DLGU",
      dlguPhase: "LamPairing",
      colorOrClear: "Clear",
      completedStages: ["Cutting"],
      processRoute: ["Cutting", "Pairing", "Lamination", "Pairing", "DGU", "Finished"],
    };

    expect(isDlguStickerPairMatch(innerPane1, innerPane2)).toBe(true);
  });

  it("should match Phase 2 DLGU panes (Laminated set + 8MM SN GREY) into DGU", async () => {
    const { isDlguStickerPairMatch } = await import("./production");

    const laminatedUnit = {
      orderNo: "00821",
      posNo: "1",
      width: 1500,
      height: 2500,
      glassType: "13.52MM CLEAR LAMINATED",
      glassCategory: "DLGU",
      dlguPhase: "DguPairing",
      colorOrClear: "Clear",
      completedStages: ["Cutting", "Pairing", "Lamination"],
      processRoute: ["Cutting", "Pairing", "Lamination", "Pairing", "DGU", "Finished"],
    };
    const outerGreyPane = {
      orderNo: "00821",
      posNo: "1",
      width: 1500,
      height: 2500,
      glassType: "8MM GUARDIAN SUNGUARD SN GREY 50 T",
      glassCategory: "DLGU",
      dlguPhase: "DguPairing",
      colorOrClear: "Colour",
      completedStages: ["Cutting"],
      processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
    };

    expect(isDlguStickerPairMatch(laminatedUnit, outerGreyPane)).toBe(true);
  });
});
