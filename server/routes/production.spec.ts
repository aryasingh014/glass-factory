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

  it("should reject strictly single piece before pairing (at Cutting stage)", async () => {
    const { handleRejectItem } = await import("./production");
    const { glassItemsDatabase } = await import("./pi");

    const cuttingPane1: any = {
      id: "test-cut-rej-1",
      serialNumber: "CUT-REJ-01",
      barcode: "CUT-REJ-01-BC",
      orderNo: "00900",
      piNumber: "PI-00900",
      posNo: "2",
      width: 1000,
      height: 1800,
      glassType: "6MM CLEAR",
      glassCategory: "DLGU",
      colorOrClear: "Clear",
      currentStage: "Cutting",
      status: "In Production",
      completedStages: [],
      processRoute: ["Cutting", "Pairing", "Lamination", "Pairing", "DGU", "Finished"],
    };

    const cuttingPane2: any = {
      id: "test-cut-rej-2",
      serialNumber: "CUT-REJ-02",
      barcode: "CUT-REJ-02-BC",
      orderNo: "00900",
      piNumber: "PI-00900",
      posNo: "2",
      width: 1000,
      height: 1800,
      glassType: "13.52MM CLEAR LAMINATED",
      glassCategory: "DLGU",
      colorOrClear: "Clear",
      currentStage: "Cutting",
      status: "In Production",
      completedStages: [],
      processRoute: ["Cutting", "Pairing", "Lamination", "Pairing", "DGU", "Finished"],
    };

    glassItemsDatabase.push(cuttingPane1, cuttingPane2);

    const req: any = {
      body: {
        serialNumber: "CUT-REJ-01",
        reason: "Edge crack during cutting",
        operator: "Cutter Operator",
      },
    };

    let responseData: any = null;
    const res: any = {
      status: (code: number) => ({
        json: (d: any) => {
          responseData = { code, ...d };
        },
      }),
      json: (d: any) => {
        responseData = d;
      },
    };

    handleRejectItem(req, res, () => {});

    // Auto-rework routes item to Cutting with Reworking status
    expect(cuttingPane1.status).toBe("Reworking");
    expect(cuttingPane1.currentStage).toBe("Cutting");
    expect(cuttingPane2.status).toBe("In Production"); // Must NOT be rejected
    expect(responseData?.items?.length).toBe(1);
    expect(responseData?.items?.[0]?.serialNumber).toBe("CUT-REJ-01");
  });

  it("should reject strictly ONE pair (2 panes) in Lamination when multiple pairs of same batch/pos exist", async () => {
    const { handleRejectItem } = await import("./production");
    const { glassItemsDatabase } = await import("./pi");

    // Pair 1: S01 + S02 (lamPairId: lam-S01-S02)
    const p1A: any = { id: "s-01", serialNumber: "S01", piNumber: "1023", posNo: "3", width: 951, height: 1601, currentStage: "Lamination", status: "In Production", lamPairId: "lam-S01-S02", glassCategory: "DLGU" };
    const p1B: any = { id: "s-02", serialNumber: "S02", piNumber: "1023", posNo: "3", width: 951, height: 1601, currentStage: "Lamination", status: "In Production", lamPairId: "lam-S01-S02", glassCategory: "DLGU" };

    // Pair 2: S03 + S04 (lamPairId: lam-S03-S04)
    const p2A: any = { id: "s-03", serialNumber: "S03", piNumber: "1023", posNo: "3", width: 951, height: 1601, currentStage: "Lamination", status: "In Production", lamPairId: "lam-S03-S04", glassCategory: "DLGU" };
    const p2B: any = { id: "s-04", serialNumber: "S04", piNumber: "1023", posNo: "3", width: 951, height: 1601, currentStage: "Lamination", status: "In Production", lamPairId: "lam-S03-S04", glassCategory: "DLGU" };

    // Pair 3: S05 + S06 (lamPairId: lam-S05-S06)
    const p3A: any = { id: "s-05", serialNumber: "S05", piNumber: "1023", posNo: "3", width: 951, height: 1601, currentStage: "Lamination", status: "In Production", lamPairId: "lam-S05-S06", glassCategory: "DLGU" };
    const p3B: any = { id: "s-06", serialNumber: "S06", piNumber: "1023", posNo: "3", width: 951, height: 1601, currentStage: "Lamination", status: "In Production", lamPairId: "lam-S05-S06", glassCategory: "DLGU" };

    glassItemsDatabase.push(p1A, p1B, p2A, p2B, p3A, p3B);

    const req: any = {
      body: {
        serialNumber: "S01",
        reason: "Delamination bubble",
        operator: "Lamination Operator",
      },
    };

    let responseData: any = null;
    const res: any = {
      status: (code: number) => ({
        json: (d: any) => {
          responseData = { code, ...d };
        },
      }),
      json: (d: any) => {
        responseData = d;
      },
    };

    handleRejectItem(req, res, () => {});

    // Pair 1 must be in Reworking (routed to Cutting for auto-remake)
    expect(p1A.status).toBe("Reworking");
    expect(p1B.status).toBe("Reworking");
    expect(p1A.currentStage).toBe("Cutting");
    expect(p1B.currentStage).toBe("Cutting");

    // Pair 2 and Pair 3 must REMAIN In Production (NOT rejected!)
    expect(p2A.status).toBe("In Production");
    expect(p2B.status).toBe("In Production");
    expect(p3A.status).toBe("In Production");
    expect(p3B.status).toBe("In Production");

    expect(responseData?.items?.length).toBe(2);
  });

  it("should rework strictly single piece before pairing (at Cutting stage) and route to targetStage", async () => {
    const { handleReworkItem } = await import("./production");
    const { glassItemsDatabase } = await import("./pi");

    const cuttingItem: any = {
      id: "test-cut-rw-1",
      serialNumber: "CUT-RW-01",
      barcode: "CUT-RW-01-BC",
      orderNo: "00901",
      piNumber: "PI-00901",
      posNo: "1",
      width: 1200,
      height: 2000,
      glassType: "8MM CLEAR",
      glassCategory: "DLGU",
      colorOrClear: "Clear",
      currentStage: "Cutting",
      status: "In Production",
      completedStages: [],
      processRoute: ["Cutting", "Pairing", "Lamination", "Pairing", "DGU", "Finished"],
    };

    glassItemsDatabase.push(cuttingItem);

    const req: any = {
      body: {
        serialNumber: "CUT-RW-01",
        targetStage: "Cutting",
        reason: "Dimensions mismatched after cut",
        operator: "Cutter Operator",
      },
    };

    let responseData: any = null;
    const res: any = {
      status: (code: number) => ({
        json: (d: any) => {
          responseData = { code, ...d };
        },
      }),
      json: (d: any) => {
        responseData = d;
      },
    };

    handleReworkItem(req, res, () => {});

    expect(cuttingItem.status).toBe("Reworking");
    expect(cuttingItem.currentStage).toBe("Cutting");
    expect(responseData?.items?.length).toBe(1);
    expect(responseData?.reworkEntries?.length).toBe(1);
    expect(responseData?.reworkEntries?.[0]?.reason).toBe("Dimensions mismatched after cut");
  });

  it("should rework paired assembly (both panes) in Lamination/DGU and route together", async () => {
    const { handleReworkItem } = await import("./production");
    const { glassItemsDatabase } = await import("./pi");

    const pairA: any = {
      id: "rw-pair-A",
      serialNumber: "RW-S01",
      piNumber: "1360",
      posNo: "5",
      width: 1000,
      height: 1500,
      currentStage: "Lamination",
      status: "In Production",
      lamPairId: "lam-RW-01",
      glassCategory: "DLGU",
      completedStages: ["Cutting"],
    };
    const pairB: any = {
      id: "rw-pair-B",
      serialNumber: "RW-S02",
      piNumber: "1360",
      posNo: "5",
      width: 1000,
      height: 1500,
      currentStage: "Lamination",
      status: "In Production",
      lamPairId: "lam-RW-01",
      glassCategory: "DLGU",
      completedStages: ["Cutting"],
    };

    glassItemsDatabase.push(pairA, pairB);

    const req: any = {
      body: {
        serialNumber: "RW-S01",
        targetStage: "Cutting",
        reason: "Autoclave bubble defect",
        operator: "Lam Operator",
      },
    };

    let responseData: any = null;
    const res: any = {
      status: (code: number) => ({
        json: (d: any) => {
          responseData = { code, ...d };
        },
      }),
      json: (d: any) => {
        responseData = d;
      },
    };

    handleReworkItem(req, res, () => {});

    expect(pairA.status).toBe("Reworking");
    expect(pairB.status).toBe("Reworking");
    expect(pairA.currentStage).toBe("Cutting");
    expect(pairB.currentStage).toBe("Cutting");
    expect(responseData?.items?.length).toBe(2);
    expect(responseData?.reworkEntries?.length).toBe(2);
  });

  it("should reject ONLY Ply 1 / IP when singlePaneOnly is true and leave good OP partner in pairing buffer", async () => {
    const { handleRejectItem } = await import("./production");
    const { glassItemsDatabase } = await import("./pi");

    const pairA: any = {
      id: "single-test-op",
      piId: "PI-SINGLE",
      piNumber: "PI-SINGLE",
      serialNumber: "SN-SINGLE-OP",
      barcode: "SN-SINGLE-OP",
      qrId: "QR-SN-SINGLE-OP",
      itemCode: "OP-LITE",
      glassType: "8MM GUARDIAN SUNGUARD SN GREY 50 T",
      glassCategory: "DLGU",
      width: 1000,
      height: 2000,
      qty: 1,
      sqm: 2.0,
      delLocation: "FACTORY",
      processRoute: ["Cutting", "Pairing", "Lamination", "Finished"],
      currentStage: "Lamination",
      completedStages: ["Cutting", "Pairing"],
      status: "In Production",
      colorOrClear: "Colour",
      updatedAt: new Date().toISOString(),
    };
    (pairA as any).lamPairId = "lam-single-pair-1";

    const pairB: any = {
      id: "single-test-ip",
      piId: "PI-SINGLE",
      piNumber: "PI-SINGLE",
      serialNumber: "SN-SINGLE-IP",
      barcode: "SN-SINGLE-IP",
      qrId: "QR-SN-SINGLE-IP",
      itemCode: "IP-LITE",
      glassType: "6MM CLEAR (Front Laminated Pane)",
      glassCategory: "DLGU",
      width: 1000,
      height: 2000,
      qty: 1,
      sqm: 2.0,
      delLocation: "FACTORY",
      processRoute: ["Cutting", "Pairing", "Lamination", "Finished"],
      currentStage: "Lamination",
      completedStages: ["Cutting", "Pairing"],
      status: "In Production",
      colorOrClear: "Clear",
      updatedAt: new Date().toISOString(),
    };
    (pairB as any).lamPairId = "lam-single-pair-1";

    glassItemsDatabase.push(pairA, pairB);

    // Request rejecting ONLY Ply 1 (Inner Lite IP)
    const req: any = {
      body: {
        serialNumber: "SN-SINGLE-IP",
        serialNumbers: ["SN-SINGLE-IP"],
        singlePaneOnly: true,
        defectivePane: "IP_PLY1",
        defectiveSerialNumber: "SN-SINGLE-IP",
        reason: "Scratch on Ply 1 front clear lite",
        operator: "Lami QC Operator",
      },
    };

    let responseData: any = null;
    const res: any = {
      status: (code: number) => ({
        json: (d: any) => {
          responseData = { code, ...d };
        },
      }),
      json: (d: any) => {
        responseData = d;
      },
    };

    handleRejectItem(req, res, () => {});

    // Defective Ply 1 (pairB) MUST be in Reworking / Cutting for remake
    expect(pairB.status).toBe("Reworking");
    expect(pairB.currentStage).toBe("Cutting");

    // Good Outer Pane (pairA) MUST NOT be rejected! It should be unlinked & back in Pairing buffer
    expect(pairA.status).toBe("Pending");
    expect(pairA.currentStage).toBe("Pairing");
    expect((pairA as any).lamPairId).toBeUndefined();

    expect(responseData?.items?.length).toBe(1);
    expect(responseData?.rejectEntries?.length).toBe(1);
  });

  it("should reject 1 clear pane of DLGU from Finished stage, un-link partner to LamPairing, and pair after re-cutting", async () => {
    const { handleRejectItem, handlePairDlgu } = await import("./production");
    const { glassItemsDatabase } = await import("./pi");

    // Finished DLGU assembly: 1 Colour OP + 2 Clear IP
    const opPane: any = {
      id: "dlgu-fin-op",
      serialNumber: "DLGU-OP-01",
      barcode: "DLGU-OP-01",
      piNumber: "PI-DLGU-FIN",
      posNo: "9",
      width: 1200,
      height: 2400,
      glassType: "8MM SUNGUARD SN GREY 50",
      glassCategory: "DLGU",
      colorOrClear: "Colour",
      currentStage: "Finished",
      status: "Completed",
      completedStages: ["Cutting", "Pairing", "DGU", "Finished"],
      processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
    };

    const ipPane1: any = {
      id: "dlgu-fin-ip1",
      serialNumber: "DLGU-IP1-01",
      barcode: "DLGU-IP1-01",
      piNumber: "PI-DLGU-FIN",
      posNo: "9",
      width: 1200,
      height: 2400,
      glassType: "6MM CLEAR",
      glassCategory: "DLGU",
      colorOrClear: "Clear",
      currentStage: "Finished",
      status: "Completed",
      completedStages: ["Cutting", "Pairing", "Lamination", "Pairing", "DGU", "Finished"],
      processRoute: ["Cutting", "Pairing", "Lamination", "Pairing", "DGU", "Finished"],
    };

    const ipPane2: any = {
      id: "dlgu-fin-ip2",
      serialNumber: "DLGU-IP2-01",
      barcode: "DLGU-IP2-01",
      piNumber: "PI-DLGU-FIN",
      posNo: "9",
      width: 1200,
      height: 2400,
      glassType: "6MM CLEAR",
      glassCategory: "DLGU",
      colorOrClear: "Clear",
      currentStage: "Finished",
      status: "Completed",
      completedStages: ["Cutting", "Pairing", "Lamination", "Pairing", "DGU", "Finished"],
      processRoute: ["Cutting", "Pairing", "Lamination", "Pairing", "DGU", "Finished"],
    };

    glassItemsDatabase.push(opPane, ipPane1, ipPane2);

    // Reject 1 Clear pane (ipPane1)
    const req: any = {
      body: {
        serialNumber: "DLGU-IP1-01",
        singlePaneOnly: true,
        defectivePane: "IP_PLY1",
        reason: "Transit crack on inner pane",
        operator: "Dispatch QC",
      },
    };

    let responseData: any = null;
    const res: any = {
      status: (code: number) => ({ json: (d: any) => { responseData = { code, ...d }; } }),
      json: (d: any) => { responseData = d; },
    };

    handleRejectItem(req, res, () => {});

    // ipPane1 is in Cutting / Reworking
    expect(ipPane1.status).toBe("Reworking");
    expect(ipPane1.currentStage).toBe("Cutting");

    // ipPane2 (surviving Clear pane) is in Pairing / LamPairing ready for remake
    expect(ipPane2.status).toBe("Pending");
    expect(ipPane2.currentStage).toBe("Pairing");
    expect(ipPane2.dlguPhase).toBe("LamPairing");
    expect(ipPane2.completedStages).not.toContain("Lamination");

    // opPane (surviving Colour pane) is in Pairing / DguPairing
    expect(opPane.status).toBe("Pending");
    expect(opPane.currentStage).toBe("Pairing");
    expect(opPane.dlguPhase).toBe("DguPairing");

    // Simulate cutting completion for ipPane1: moves to Pairing stage with completedStages = ["Cutting"]
    ipPane1.currentStage = "Pairing";
    ipPane1.status = "Pending";
    ipPane1.completedStages = ["Cutting"];
    ipPane1.dlguPhase = "LamPairing";

    // Trigger handlePairDlgu to verify they pair together into Lamination Line
    let pairResult: any = null;
    const pairRes: any = {
      json: (d: any) => { pairResult = d; },
    };
    handlePairDlgu({} as any, pairRes, () => {});

    // Both Clear panes must advance to Lamination together
    expect(ipPane1.currentStage).toBe("Lamination");
    expect(ipPane2.currentStage).toBe("Lamination");
    expect((ipPane1 as any).lamPairId).toBeDefined();
    expect((ipPane1 as any).lamPairId).toBe((ipPane2 as any).lamPairId);
  });

  it("should reject BOTH clear panes of DLGU while keeping Colour OP pane intact in Pairing buffer", async () => {
    const { handleRejectItem } = await import("./production");
    const { glassItemsDatabase } = await import("./pi");

    const opPane: any = {
      id: "dlgu-both-op",
      serialNumber: "DLGU-BOTH-OP-01",
      barcode: "DLGU-BOTH-OP-01",
      piNumber: "PI-DLGU-BOTH",
      posNo: "12",
      width: 1000,
      height: 2000,
      glassType: "8MM SUNGUARD SN GREY 50",
      glassCategory: "DLGU",
      colorOrClear: "Colour",
      currentStage: "DGU",
      status: "In Progress",
      completedStages: ["Cutting", "Pairing"],
      processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
      dguPairId: "pair-dlgu-both-12",
    };

    const ipPane1: any = {
      id: "dlgu-both-ip1",
      serialNumber: "DLGU-BOTH-IP1-01",
      barcode: "DLGU-BOTH-IP1-01",
      piNumber: "PI-DLGU-BOTH",
      posNo: "12",
      width: 1000,
      height: 2000,
      glassType: "6MM CLEAR",
      glassCategory: "DLGU",
      colorOrClear: "Clear",
      currentStage: "DGU",
      status: "In Progress",
      completedStages: ["Cutting", "Pairing", "Lamination", "Pairing"],
      processRoute: ["Cutting", "Pairing", "Lamination", "Pairing", "DGU", "Finished"],
      lamPairId: "lam-both-12",
      dguPairId: "pair-dlgu-both-12",
    };

    const ipPane2: any = {
      id: "dlgu-both-ip2",
      serialNumber: "DLGU-BOTH-IP2-01",
      barcode: "DLGU-BOTH-IP2-01",
      piNumber: "PI-DLGU-BOTH",
      posNo: "12",
      width: 1000,
      height: 2000,
      glassType: "6MM CLEAR",
      glassCategory: "DLGU",
      colorOrClear: "Clear",
      currentStage: "DGU",
      status: "In Progress",
      completedStages: ["Cutting", "Pairing", "Lamination", "Pairing"],
      processRoute: ["Cutting", "Pairing", "Lamination", "Pairing", "DGU", "Finished"],
      lamPairId: "lam-both-12",
      dguPairId: "pair-dlgu-both-12",
    };

    glassItemsDatabase.push(opPane, ipPane1, ipPane2);

    // Reject BOTH Clear panes (IP 1 + IP 2)
    const req: any = {
      body: {
        serialNumber: "DLGU-BOTH-IP1-01",
        serialNumbers: ["DLGU-BOTH-IP1-01", "DLGU-BOTH-IP2-01"],
        singlePaneOnly: false,
        defectivePane: "BOTH_CLEAR",
        reason: "Autoclave lamination bubbles across both clear plies",
        operator: "DGU Line QC",
      },
    };

    let responseData: any = null;
    const res: any = {
      status: (code: number) => ({ json: (d: any) => { responseData = { code, ...d }; } }),
      json: (d: any) => { responseData = d; },
    };

    handleRejectItem(req, res, () => {});

    // BOTH clear panes must be sent to Cutting for remake (status: Reworking by default autoRework)
    expect(ipPane1.status).toBe("Reworking");
    expect(ipPane1.currentStage).toBe("Cutting");
    expect(ipPane2.status).toBe("Reworking");
    expect(ipPane2.currentStage).toBe("Cutting");

    // Colour OP pane MUST NOT be rejected! It should be un-linked and in Pairing buffer waiting for new clear pair
    expect(opPane.status).toBe("Pending");
    expect(opPane.currentStage).toBe("Pairing");
    expect(opPane.dlguPhase).toBe("DguPairing");
    expect((opPane as any).dguPairId).toBeUndefined();
  });

  it("should un-link Colour partner from a different batch/PI when Clear DLGU pane is rejected at Dispatch stage", async () => {
    const { handleRejectItem } = await import("./production");
    const { glassItemsDatabase, piDatabase } = await import("./pi");

    const batch1022Pi: any = {
      id: "test-pi-1022-cross",
      piNumber: "PI-1022-CROSS",
      customerName: "AL MAJAZ GLASS",
      projectName: "HOTEL PROJECT",
      totalItemsCount: 1,
      completedItemsCount: 1,
      status: "Completed",
    };

    const batch1023Pi: any = {
      id: "test-pi-1023-cross",
      piNumber: "PI-1023-CROSS",
      customerName: "AL MAJAZ GLASS",
      projectName: "HOTEL PROJECT",
      totalItemsCount: 2,
      completedItemsCount: 2,
      status: "Completed",
    };

    piDatabase.push(batch1022Pi, batch1023Pi);

    // Colour pane in Batch 1022
    const colourPane: any = {
      id: "item-col-cross-103",
      serialNumber: "CROSS-S103",
      barcode: "BC-CROSS-S103",
      orderNo: "00821-CROSS",
      obNo: "01361-CROSS",
      piNumber: "PI-1022-CROSS",
      piId: "test-pi-1022-cross",
      posNo: "3",
      width: 951,
      height: 1601,
      glassType: "8MM GUARDIAN SUNGUARD SN GREY 50 T",
      glassCategory: "DLGU",
      colorOrClear: "Colour",
      currentStage: "Finished",
      status: "Completed",
      completedStages: ["Cutting", "Pairing", "DGU", "Finished"],
      processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
    };

    // Two Clear panes in Batch 1023
    const clearPane1: any = {
      id: "item-clr-cross-001",
      serialNumber: "CROSS-S001",
      barcode: "BC-CROSS-S001",
      orderNo: "00821-CROSS",
      obNo: "01361-CROSS",
      piNumber: "PI-1023-CROSS",
      piId: "test-pi-1023-cross",
      posNo: "3",
      width: 951,
      height: 1601,
      glassType: "6MM CLEAR TEMPERED",
      glassCategory: "DLGU",
      colorOrClear: "Clear",
      currentStage: "Finished",
      status: "Completed",
      completedStages: ["Cutting", "Pairing", "Lamination", "Pairing", "DGU", "Finished"],
      processRoute: ["Cutting", "Pairing", "Lamination", "Pairing", "DGU", "Finished"],
    };

    const clearPane2: any = {
      id: "item-clr-cross-002",
      serialNumber: "CROSS-S002",
      barcode: "BC-CROSS-S002",
      orderNo: "00821-CROSS",
      obNo: "01361-CROSS",
      piNumber: "PI-1023-CROSS",
      piId: "test-pi-1023-cross",
      posNo: "3",
      width: 951,
      height: 1601,
      glassType: "6MM CLEAR TEMPERED",
      glassCategory: "DLGU",
      colorOrClear: "Clear",
      currentStage: "Finished",
      status: "Completed",
      completedStages: ["Cutting", "Pairing", "Lamination", "Pairing", "DGU", "Finished"],
      processRoute: ["Cutting", "Pairing", "Lamination", "Pairing", "DGU", "Finished"],
    };

    glassItemsDatabase.push(colourPane, clearPane1, clearPane2);

    // Reject 1 Clear pane (CROSS-S001) from Dispatch stage
    const req: any = {
      body: {
        serialNumber: "CROSS-S001",
        singlePaneOnly: true,
        defectivePane: "IP_PLY1",
        reason: "Edge chip found at dispatch",
        operator: "Dispatch Inspector",
      },
    };

    let responseData: any = null;
    const res: any = {
      status: (code: number) => ({ json: (d: any) => { responseData = { code, ...d }; } }),
      json: (d: any) => { responseData = d; },
    };

    handleRejectItem(req, res, () => {});

    // CROSS-S001 is routed to Cutting for remake
    expect(clearPane1.currentStage).toBe("Cutting");
    expect(clearPane1.status).toBe("Reworking");

    // Surviving Clear pane CROSS-S002 (Batch 1023) is pulled back to Glass Pairing & Buffer (Phase 1 LamPairing)
    expect(clearPane2.currentStage).toBe("Pairing");
    expect(clearPane2.status).toBe("Pending");
    expect(clearPane2.dlguPhase).toBe("LamPairing");
    expect(clearPane2.completedStages).not.toContain("Lamination");

    // Surviving Colour pane CROSS-S103 (Batch 1022!) is pulled back to Glass Pairing & Buffer (Phase 2 DguPairing)
    expect(colourPane.currentStage).toBe("Pairing");
    expect(colourPane.status).toBe("Pending");
    expect(colourPane.dlguPhase).toBe("DguPairing");
    expect(colourPane.completedStages).not.toContain("DGU");
    expect(colourPane.completedStages).not.toContain("Finished");

    // Parent PI 1022 (Colour batch) status must return to "In Production" and completedItemsCount decremented to 0
    expect(batch1022Pi.completedItemsCount).toBe(0);
    expect(batch1022Pi.status).toBe("In Production");

    // Parent PI 1023 (Clear batch) status must return to "In Production" and completedItemsCount decremented to 0
    expect(batch1023Pi.completedItemsCount).toBe(0);
    expect(batch1023Pi.status).toBe("In Production");
  });

  it("should reject BOTH clear panes of a DLGU unit, route both to Cutting (LamPairing), keep Colour in Pairing (DguPairing), and NOT touch unrelated clear units", async () => {
    const { handleRejectItem } = await import("./production");
    const { glassItemsDatabase } = await import("./pi");

    // Unit 1: 1 Colour + 2 Clears (DLGU assembly at DGU stage)
    const unit1Colour: any = {
      id: "u1-col-15",
      serialNumber: "U1-COL",
      barcode: "U1-COL-BC",
      piNumber: "PI-1022",
      posNo: "15",
      width: 740,
      height: 2321,
      glassType: "8MM GUARDIAN SUNGUARD SN GREY 50 T",
      glassCategory: "DLGU",
      colorOrClear: "Colour",
      currentStage: "DGU",
      status: "In Progress",
      completedStages: ["Cutting", "Pairing"],
      processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
      dguPairId: "dgu-pair-u1",
    };

    const unit1Clear1: any = {
      id: "u1-clr1-15",
      serialNumber: "U1-CLR1",
      barcode: "U1-CLR1-BC",
      piNumber: "PI-1023",
      posNo: "15",
      width: 740,
      height: 2321,
      glassType: "6MM CLEAR",
      glassCategory: "DLGU",
      colorOrClear: "Clear",
      currentStage: "DGU",
      status: "In Progress",
      completedStages: ["Cutting", "Pairing", "Lamination", "Pairing"],
      processRoute: ["Cutting", "Pairing", "Lamination", "Pairing", "DGU", "Finished"],
      lamPairId: "lam-pair-u1",
      dguPairId: "dgu-pair-u1",
      dlguPhase: "DguPairing",
    };

    const unit1Clear2: any = {
      id: "u1-clr2-15",
      serialNumber: "U1-CLR2",
      barcode: "U1-CLR2-BC",
      piNumber: "PI-1023",
      posNo: "15",
      width: 740,
      height: 2321,
      glassType: "6MM CLEAR",
      glassCategory: "DLGU",
      colorOrClear: "Clear",
      currentStage: "DGU",
      status: "In Progress",
      completedStages: ["Cutting", "Pairing", "Lamination", "Pairing"],
      processRoute: ["Cutting", "Pairing", "Lamination", "Pairing", "DGU", "Finished"],
      lamPairId: "lam-pair-u1",
      dguPairId: "dgu-pair-u1",
      dlguPhase: "DguPairing",
    };

    // Unit 2: An innocent second unit of Pos 15 currently in Lamination
    const unit2Clear1: any = {
      id: "u2-clr1-15",
      serialNumber: "U2-CLR1",
      barcode: "U2-CLR1-BC",
      piNumber: "PI-1023",
      posNo: "15",
      width: 740,
      height: 2321,
      glassType: "13.52MM CLEAR LAMINATED",
      glassCategory: "DLGU",
      colorOrClear: "Clear",
      currentStage: "Lamination",
      status: "In Progress",
      completedStages: ["Cutting", "Pairing"],
      processRoute: ["Cutting", "Pairing", "Lamination", "Pairing", "DGU", "Finished"],
      lamPairId: "lam-pair-u2",
      dlguPhase: "LamPairing",
    };

    glassItemsDatabase.push(unit1Colour, unit1Clear1, unit1Clear2, unit2Clear1);

    // Reject BOTH clear panes of Unit 1
    const req: any = {
      body: {
        serialNumber: "U1-CLR1",
        singlePaneOnly: false,
        defectivePane: "BOTH_CLEAR",
        reason: "Defective clear laminate plies",
        operator: "DGU Quality Inspector",
      },
    };

    let responseData: any = null;
    const res: any = {
      status: (code: number) => ({ json: (d: any) => { responseData = { code, ...d }; } }),
      json: (d: any) => { responseData = d; },
    };

    handleRejectItem(req, res, () => {});

    // 1. BOTH clear panes of Unit 1 must go to Cutting as Reworking, and dlguPhase reset to LamPairing
    expect(unit1Clear1.currentStage).toBe("Cutting");
    expect(unit1Clear1.status).toBe("Reworking");
    expect(unit1Clear1.dlguPhase).toBe("LamPairing");
    expect(unit1Clear1.completedStages).toHaveLength(0);

    expect(unit1Clear2.currentStage).toBe("Cutting");
    expect(unit1Clear2.status).toBe("Reworking");
    expect(unit1Clear2.dlguPhase).toBe("LamPairing");
    expect(unit1Clear2.completedStages).toHaveLength(0);

    // 2. Unit 1 Colour pane must wait in Pairing stage at DguPairing
    expect(unit1Colour.currentStage).toBe("Pairing");
    expect(unit1Colour.status).toBe("Pending");
    expect(unit1Colour.dlguPhase).toBe("DguPairing");
    expect(unit1Colour.completedStages).toEqual(["Cutting"]);

    // 3. CRITICAL: Unit 2 Clear pane must NOT be affected or moved to Pairing buffer!
    expect(unit2Clear1.currentStage).toBe("Lamination");
    expect(unit2Clear1.status).toBe("In Progress");
  });

  it("should advance ONLY the selected DGU unit to Finished/Dispatch and never sweep other units of the same position", async () => {
    const { handleAdvanceStage } = await import("./production");
    const { glassItemsDatabase } = await import("./pi");

    // Unit 1 in DGU stage
    const unit1Colour: any = {
      id: "dgu-adv-u1-col",
      serialNumber: "ADV-U1-COL",
      barcode: "ADV-U1-COL-BC",
      piNumber: "PI-DGU-ADV",
      posNo: "20",
      width: 800,
      height: 1500,
      glassType: "6MM GREY TINT",
      glassCategory: "DGU",
      colorOrClear: "Colour",
      currentStage: "DGU",
      status: "In Progress",
      completedStages: ["Cutting", "Pairing"],
      processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
      dguPairId: "dgu-pair-adv-1",
    };

    const unit1Clear: any = {
      id: "dgu-adv-u1-clr",
      serialNumber: "ADV-U1-CLR",
      barcode: "ADV-U1-CLR-BC",
      piNumber: "PI-DGU-ADV",
      posNo: "20",
      width: 800,
      height: 1500,
      glassType: "6MM CLEAR",
      glassCategory: "DGU",
      colorOrClear: "Clear",
      currentStage: "DGU",
      status: "In Progress",
      completedStages: ["Cutting", "Pairing"],
      processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
      dguPairId: "dgu-pair-adv-1",
    };

    // Unit 2 in DGU stage (same position #20, same dimensions, same PI!)
    const unit2Colour: any = {
      id: "dgu-adv-u2-col",
      serialNumber: "ADV-U2-COL",
      barcode: "ADV-U2-COL-BC",
      piNumber: "PI-DGU-ADV",
      posNo: "20",
      width: 800,
      height: 1500,
      glassType: "6MM GREY TINT",
      glassCategory: "DGU",
      colorOrClear: "Colour",
      currentStage: "DGU",
      status: "In Progress",
      completedStages: ["Cutting", "Pairing"],
      processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
      dguPairId: "dgu-pair-adv-2",
    };

    const unit2Clear: any = {
      id: "dgu-adv-u2-clr",
      serialNumber: "ADV-U2-CLR",
      barcode: "ADV-U2-CLR-BC",
      piNumber: "PI-DGU-ADV",
      posNo: "20",
      width: 800,
      height: 1500,
      glassType: "6MM CLEAR",
      glassCategory: "DGU",
      colorOrClear: "Clear",
      currentStage: "DGU",
      status: "In Progress",
      completedStages: ["Cutting", "Pairing"],
      processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
      dguPairId: "dgu-pair-adv-2",
    };

    glassItemsDatabase.push(unit1Colour, unit1Clear, unit2Colour, unit2Clear);

    // Operator advances ONLY Unit 1
    const req: any = {
      body: {
        serialNumbers: ["ADV-U1-COL", "ADV-U1-CLR"],
        operator: "DGU Station Operator",
        remarks: "DGU Unit 1 completed assembly",
      },
    };

    let responseData: any = null;
    const res: any = {
      status: (code: number) => ({ json: (d: any) => { responseData = { code, ...d }; } }),
      json: (d: any) => { responseData = d; },
    };

    handleAdvanceStage(req, res, () => {});

    // Unit 1 panes MUST be completed and advanced to Finished
    expect(unit1Colour.currentStage).toBe("Finished");
    expect(unit1Colour.status).toBe("Completed");
    expect(unit1Clear.currentStage).toBe("Finished");
    expect(unit1Clear.status).toBe("Completed");

    // Unit 2 panes MUST strictly remain in DGU stage!
    expect(unit2Colour.currentStage).toBe("DGU");
    expect(unit2Colour.status).toBe("In Progress");
    expect(unit2Clear.currentStage).toBe("DGU");
    expect(unit2Clear.status).toBe("In Progress");
  });
});

describe("Dispatch Stage & Dispatched History Storage", () => {
  it("should successfully dispatch finished units and mark them with isDispatched=true and lifelong metadata", async () => {
    const { handleDispatchItems } = await import("./production");
    const { glassItemsDatabase } = await import("./pi");

    const finishedPane1: any = {
      id: "DISP-PANE-1",
      serialNumber: "SN-DISP-001",
      barcode: "10126270013490001",
      piNumber: "PI/TEST/DISP-1",
      piId: "PI-DISP-1",
      currentStage: "Finished",
      status: "Completed",
      completedStages: ["Cutting", "Pairing", "DGU", "Finished"],
      glassCategory: "DGU",
      dguPairId: "PAIR-DISP-100",
      qty: 1,
      sqm: 1.5,
      isDispatched: false,
    };

    const finishedPane2: any = {
      id: "DISP-PANE-2",
      serialNumber: "SN-DISP-002",
      barcode: "10126270013490002",
      piNumber: "PI/TEST/DISP-1",
      piId: "PI-DISP-1",
      currentStage: "Finished",
      status: "Completed",
      completedStages: ["Cutting", "Pairing", "DGU", "Finished"],
      glassCategory: "DGU",
      dguPairId: "PAIR-DISP-100",
      qty: 1,
      sqm: 1.5,
      isDispatched: false,
    };

    glassItemsDatabase.push(finishedPane1, finishedPane2);

    const req: any = {
      body: {
        serialNumbers: ["SN-DISP-001"], // Dispatching pane 1 will auto-include partner pane 2
        dispatchNoteNo: "DN-TEST-9999",
        vehicleNo: "DXB-7788",
        driverName: "Ahmed",
        remarks: "Delivered to construction site",
        operator: "Dispatch Lead",
      },
    };

    let responseData: any = null;
    const res: any = {
      status: (code: number) => ({ json: (d: any) => { responseData = { code, ...d }; } }),
      json: (d: any) => { responseData = d; },
    };

    handleDispatchItems(req, res, () => {});

    expect(responseData).toBeDefined();
    expect(responseData.dispatchNoteNo).toBe("DN-TEST-9999");
    expect(finishedPane1.isDispatched).toBe(true);
    expect(finishedPane1.currentStage).toBe("Dispatched");
    expect(finishedPane1.dispatchNoteNo).toBe("DN-TEST-9999");
    expect(finishedPane1.vehicleNo).toBe("DXB-7788");
    expect(finishedPane1.dispatchedAt).toBeDefined();

    // Partner pane must also be dispatched together
    expect(finishedPane2.isDispatched).toBe(true);
    expect(finishedPane2.currentStage).toBe("Dispatched");
    expect(finishedPane2.dispatchNoteNo).toBe("DN-TEST-9999");

    // Dashboard stats must NOT show dispatched items in cutting, pairing, dgu, lamination, or finished
    const { handleGetDashboardStats } = await import("./production");
    let statsData: any = null;
    const statsRes: any = { json: (d: any) => { statsData = d; } };
    handleGetDashboardStats({} as any, statsRes, () => {});
    const dispItemsInStats = statsData.items.filter((i: any) => i.id === "DISP-PANE-1" || i.id === "DISP-PANE-2");
    expect(dispItemsInStats.every((i: any) => i.isDispatched && i.currentStage === "Dispatched")).toBe(true);
    expect(statsData.dispatchedItems).toBeGreaterThanOrEqual(1);

    // Clean up to prevent affecting subsequent tests
    const idx1 = glassItemsDatabase.indexOf(finishedPane1);
    if (idx1 !== -1) glassItemsDatabase.splice(idx1, 1);
    const idx2 = glassItemsDatabase.indexOf(finishedPane2);
    if (idx2 !== -1) glassItemsDatabase.splice(idx2, 1);
  });

  it("should correctly split multi-customer and multi-project sticker batches into dedicated customer sub-batches", async () => {
    const { handleStickerUpload } = await import("./production");
    const { piDatabase, glassItemsDatabase } = await import("./pi");

    const mockReq: any = {
      body: {
        batchTitle: "TEST-MIX-101",
        batchNo: "101",
        fileName: "Test_Mix_Unique_101.pdf",
        colorOrClear: "Clear",
        glassCategory: "DGU",
        items: [
          // Ashbilia item - DISTRICT_O
          {
            stickerNo: 1,
            orderNo: "1997",
            obNo: "3360",
            sfoNo: "201666",
            batchNo: "101",
            posNo: "49",
            qty: 1,
            width: 1790,
            height: 3764,
            glassCode: "AL 10 L 2098 GL 01 0",
            glassType: "8MM CLEAR",
            customerName: "ASHBILIA ALUMINIUM & GLASS L.L.C",
            projectName: "DISTRICT_O",
          },
          // Meraki item 1 - DISTRICT_O
          {
            stickerNo: 2,
            orderNo: "2311",
            obNo: "4250",
            sfoNo: "15211",
            batchNo: "101",
            posNo: "3",
            qty: 2,
            width: 738,
            height: 1144,
            glassCode: "5C AL11 GL01 SK 02 S",
            glassType: "8MM CLEAR WITH SANDBLASTING",
            customerName: "MERAKI FACADE AND GLAZING SYSTEMS L.L.C",
            projectName: "DISTRICT_O",
          },
          // Meraki item 2 - HAVEN_BY_A
          {
            stickerNo: 3,
            orderNo: "1722",
            obNo: "3123",
            sfoNo: "15194",
            batchNo: "101",
            posNo: "3",
            qty: 1,
            width: 947,
            height: 2668,
            glassCode: "WD6 3 GL SH1 SEJALFA",
            glassType: "8MM CLEAR",
            customerName: "MERAKI FACADE AND GLAZING SYSTEMS L.L.C",
            projectName: "HAVEN_BY_A",
          },
        ],
      },
    };

    let responseData: any = null;
    const mockRes: any = {
      status: () => mockRes,
      json: (data: any) => {
        responseData = data;
      },
    };

    await handleStickerUpload(mockReq, mockRes, () => {});

    expect(responseData).toBeDefined();
    expect(responseData.subBatches).toBeDefined();
    expect(responseData.subBatches.length).toBe(3);

    // Verify sub-batch PI numbers and customers
    const ashbiliaBatch = responseData.subBatches.find((b: any) => b.customerName === "ASHBILIA ALUMINIUM & GLASS L.L.C");
    expect(ashbiliaBatch).toBeDefined();
    expect(ashbiliaBatch.piNumber).toBe("TEST-MIX-101-ASHBILIA");
    expect(ashbiliaBatch.projectName).toBe("DISTRICT_O");
    expect(ashbiliaBatch.itemsCount).toBe(1);

    const merakiDistrictBatch = responseData.subBatches.find(
      (b: any) => b.customerName === "MERAKI FACADE AND GLAZING SYSTEMS L.L.C" && b.projectName === "DISTRICT_O"
    );
    expect(merakiDistrictBatch).toBeDefined();
    expect(merakiDistrictBatch.piNumber).toBe("TEST-MIX-101-MERAKI-DISTRICT_O");
    expect(merakiDistrictBatch.itemsCount).toBe(1);

    const merakiHavenBatch = responseData.subBatches.find(
      (b: any) => b.customerName === "MERAKI FACADE AND GLAZING SYSTEMS L.L.C" && b.projectName === "HAVEN_BY_A"
    );
    expect(merakiHavenBatch).toBeDefined();
    expect(merakiHavenBatch.piNumber).toBe("TEST-MIX-101-MERAKI-HAVEN_BY_A");
    expect(merakiHavenBatch.itemsCount).toBe(1);

    // Verify individual GlassItems have customerName and projectName populated
    const importedItems = responseData.items;
    expect(importedItems.length).toBe(3);
    const ashItem = importedItems.find((i: any) => i.customerName === "ASHBILIA ALUMINIUM & GLASS L.L.C");
    expect(ashItem).toBeDefined();
    expect(ashItem.projectName).toBe("DISTRICT_O");
    expect(ashItem.piNumber).toBe("TEST-MIX-101-ASHBILIA");
    expect(ashItem.batchNo).toBe("101");

    // Clean up created test items and sub-batches
    responseData.subBatches.forEach((sb: any) => {
      const pIdx = piDatabase.findIndex((p) => p.id === sb.id);
      if (pIdx !== -1) piDatabase.splice(pIdx, 1);
    });
    importedItems.forEach((it: any) => {
      const iIdx = glassItemsDatabase.findIndex((g) => g.id === it.id);
      if (iIdx !== -1) glassItemsDatabase.splice(iIdx, 1);
    });
  });

  it("should keep single batch structure for single-customer PDF uploads without adding suffixes", async () => {
    const { handleStickerUpload } = await import("./production");
    const { piDatabase, glassItemsDatabase } = await import("./pi");

    const mockReq: any = {
      body: {
        batchTitle: "9911",
        batchNo: "9911",
        fileName: "Single_Customer_Test.pdf",
        customerName: "AL MAJAZ GLASS",
        projectName: "HOTEL PROJECT",
        colorOrClear: "Clear",
        glassCategory: "DGU",
        items: [
          {
            stickerNo: 1,
            orderNo: "001",
            obNo: "002",
            posNo: "1",
            qty: 1,
            width: 1000,
            height: 1500,
            glassCode: "GL-01",
            glassType: "6MM CLEAR TEMPERED",
            customerName: "AL MAJAZ GLASS",
            projectName: "HOTEL PROJECT",
          },
        ],
      },
    };

    let responseData: any = null;
    const mockRes: any = {
      status: () => mockRes,
      json: (data: any) => {
        responseData = data;
      },
    };

    await handleStickerUpload(mockReq, mockRes, () => {});

    expect(responseData).toBeDefined();
    expect(responseData.batch).toBeDefined();
    expect(responseData.batch.piNumber).toBe("9911"); // No suffix added
    expect(responseData.batch.customerName).toBe("AL MAJAZ GLASS");

    // Clean up
    const pIdx = piDatabase.findIndex((p) => p.id === responseData.batch.id);
    if (pIdx !== -1) piDatabase.splice(pIdx, 1);
    const iIdx = glassItemsDatabase.findIndex((g) => g.piId === responseData.batch.id);
    if (iIdx !== -1) glassItemsDatabase.splice(iIdx, 1);
  });

  it("should match DGU pairs within the same customer and project and reject cross-customer pairing", async () => {
    const { isStickerPairMatch } = await import("./production");

    // Ashbilia Emicool Colour pane (from Mix2)
    const ashbiliaColourPane: any = {
      orderNo: "1997",
      obNo: "3360",
      posNo: "49",
      width: 1790,
      height: 3764,
      glassCode: "AL 10 L 2098 GL 01 0",
      glassType: "8MM EMICOOL DSR III ON CLEAR",
      glassCategory: "DGU",
      category: "Coloured Glass",
      colorOrClear: "Colour",
      customerName: "ASHBILIA ALUMINIUM & GLASS L.L.C",
      projectName: "DISTRICT_O",
    };

    // Ashbilia Clear pane (from Mix1)
    const ashbiliaClearPane: any = {
      orderNo: "1997",
      obNo: "3360",
      posNo: "49",
      width: 1790,
      height: 3764,
      glassCode: "AL 10 L 2098 GL 01 0",
      glassType: "8MM CLEAR",
      glassCategory: "DGU",
      category: "Clear Glass",
      colorOrClear: "Clear",
      customerName: "ASHBILIA ALUMINIUM & GLASS L.L.C",
      projectName: "DISTRICT_O",
    };

    // Meraki Clear pane with identical dimensions and order to test cross-customer isolation
    const merakiClearPane: any = {
      orderNo: "1997",
      obNo: "3360",
      posNo: "49",
      width: 1790,
      height: 3764,
      glassCode: "AL 10 L 2098 GL 01 0",
      glassType: "8MM CLEAR",
      glassCategory: "DGU",
      category: "Clear Glass",
      colorOrClear: "Clear",
      customerName: "MERAKI FACADE AND GLAZING SYSTEMS L.L.C",
      projectName: "DISTRICT_O",
    };

    // Meraki pane with different project
    const merakiDifferentProjectPane: any = {
      orderNo: "1997",
      obNo: "3360",
      posNo: "49",
      width: 1790,
      height: 3764,
      glassCode: "AL 10 L 2098 GL 01 0",
      glassType: "8MM CLEAR",
      glassCategory: "DGU",
      category: "Clear Glass",
      colorOrClear: "Clear",
      customerName: "ASHBILIA ALUMINIUM & GLASS L.L.C",
      projectName: "HAVEN_BY_A",
    };

    // Same customer & project => PASS
    expect(isStickerPairMatch(ashbiliaColourPane, ashbiliaClearPane)).toBe(true);

    // Cross customer => FAIL
    expect(isStickerPairMatch(ashbiliaColourPane, merakiClearPane)).toBe(false);

    // Cross project => FAIL
    expect(isStickerPairMatch(ashbiliaColourPane, merakiDifferentProjectPane)).toBe(false);
  });
});

describe("Barcode Scanner Sticker Matching & Stage Advancement Workflow", () => {
  it("should match items across various sticker barcode formats and prioritize active stage", async () => {
    const { findBestMatchingItem, isItemMatchingCode, cleanScannedBarcode } = await import("../../client/lib/barcode");

    const item1: any = {
      id: "item-cut-01",
      serialNumber: "S423",
      barcode: "1012627015230001",
      sfoNo: "9000",
      posNo: "1",
      currentStage: "Pairing",
      status: "In Production",
      processRoute: ["Cutting", "Pairing", "Lamination", "Finished"],
    };

    const item2: any = {
      id: "item-cut-02",
      serialNumber: "S424",
      barcode: "1012627015230001",
      sfoNo: "9000",
      posNo: "1",
      currentStage: "Cutting",
      status: "In Production",
      processRoute: ["Cutting", "Pairing", "Lamination", "Finished"],
    };

    const items = [item1, item2];

    // Clean barcode stripping AIM identifiers and QR prefixes
    expect(cleanScannedBarcode("]C11012627015230001")).toBe("1012627015230001");
    expect(cleanScannedBarcode("QR-1012627015230001")).toBe("1012627015230001");
    expect(cleanScannedBarcode("#S423")).toBe("S423");

    // Both items match the barcode
    expect(isItemMatchingCode(item1, "1012627015230001")).toBe(true);
    expect(isItemMatchingCode(item2, "1012627015230001")).toBe(true);

    // When operator is at Cutting workstation, it MUST prioritize item2 (currently in Cutting)
    const cuttingMatch = findBestMatchingItem(items, "1012627015230001", "Cutting");
    expect(cuttingMatch).toBeDefined();
    expect(cuttingMatch.id).toBe("item-cut-02");
    expect(cuttingMatch.currentStage).toBe("Cutting");

    // When operator is at Pairing buffer, it MUST prioritize item1 (currently in Pairing)
    const pairingMatch = findBestMatchingItem(items, "1012627015230001", "Pairing");
    expect(pairingMatch).toBeDefined();
    expect(pairingMatch.id).toBe("item-cut-01");
    expect(pairingMatch.currentStage).toBe("Pairing");

    // If no preferred stage provided, prioritize the earliest incomplete stage in route (Cutting before Pairing)
    const earliestMatch = findBestMatchingItem(items, "1012627015230001");
    expect(earliestMatch.id).toBe("item-cut-02");
  });

  it("should advance scanned item to next respective stage via handleAdvanceStage", async () => {
    const { handleAdvanceStage } = await import("./production");
    const { glassItemsDatabase } = await import("./pi");

    const testId = `test-scan-${Date.now()}`;
    const testItem: any = {
      id: testId,
      serialNumber: "S999",
      barcode: "1012627099990001",
      posNo: "1",
      currentStage: "Cutting",
      status: "In Production",
      completedStages: [],
      processRoute: ["Cutting", "Pairing", "Lamination", "Finished"],
      qty: 1,
    };
    glassItemsDatabase.push(testItem);

    let jsonResponse: any = null;
    const req: any = {
      body: {
        serialNumbers: ["S999"],
        itemIds: [testId],
        currentStage: "Cutting",
        advanceQty: 1,
        advanceAll: false,
        operator: "test-operator",
      },
    };
    const res: any = {
      status: () => res,
      json: (data: any) => {
        jsonResponse = data;
        return res;
      },
    };

    handleAdvanceStage(req, res, () => {});
    expect(jsonResponse).toBeDefined();
    expect(jsonResponse.items).toBeDefined();
    expect(jsonResponse.items.length).toBeGreaterThan(0);

    const advanced = glassItemsDatabase.find((g) => g.id === testId);
    expect(advanced).toBeDefined();
    expect(advanced?.currentStage).toBe("Pairing");
    expect(advanced?.completedStages).toContain("Cutting");
  });

  it("should allow multi-sticker position (Glass1.pdf POS 17) to be scanned twice at Cutting and reject 3rd scan", async () => {
    const { glassItemsDatabase } = await import("./pi");
    const { handleAdvanceStage, handleScanLookup } = await import("./production");

    const barcode17 = "1012627099990033";
    const piece1Id = "test-piece17-1";
    const piece2Id = "test-piece17-2";

    // Setup 2 stickers sharing the same barcode in Cutting
    const piece1: any = {
      id: piece1Id,
      serialNumber: "S717",
      barcode: barcode17,
      posNo: "17",
      orderNo: "901765",
      batchNo: "9442",
      currentStage: "Cutting",
      processRoute: ["Cutting", "Pairing", "Finished"],
      completedStages: [],
      status: "In Production",
      qty: 1,
    };
    const piece2: any = {
      id: piece2Id,
      serialNumber: "S718",
      barcode: barcode17,
      posNo: "17",
      orderNo: "901765",
      batchNo: "9442",
      currentStage: "Cutting",
      processRoute: ["Cutting", "Pairing", "Finished"],
      completedStages: [],
      status: "In Production",
      qty: 1,
    };
    glassItemsDatabase.push(piece1, piece2);

    // Scan 1: Piece 1 advances to Pairing
    let res1Data: any = null;
    const req1: any = {
      body: {
        serialNumbers: [barcode17],
        currentStage: "Cutting",
        stage: "Cutting",
        advanceQty: 1,
      },
    };
    const res1: any = {
      status: () => res1,
      json: (d: any) => { res1Data = d; return res1; },
    };
    handleAdvanceStage(req1, res1, () => {});
    expect(res1Data.items).toHaveLength(1);
    expect(res1Data.items[0].id).toBe(piece1Id);
    expect(piece1.currentStage).toBe("Pairing");
    expect(piece2.currentStage).toBe("Cutting");

    // Scan 2: Piece 2 advances to Pairing
    let res2Data: any = null;
    const req2: any = {
      body: {
        serialNumbers: [barcode17],
        currentStage: "Cutting",
        stage: "Cutting",
        advanceQty: 1,
      },
    };
    const res2: any = {
      status: () => res2,
      json: (d: any) => { res2Data = d; return res2; },
    };
    handleAdvanceStage(req2, res2, () => {});
    expect(res2Data.items).toHaveLength(1);
    expect(res2Data.items[0].id).toBe(piece2Id);
    expect(piece2.currentStage).toBe("Pairing");

    // Scan 3: Both pieces have completed Cutting! Must reject with 400 and Already scanned message
    let res3Status = 200;
    let res3Data: any = null;
    const req3: any = {
      body: {
        serialNumbers: [barcode17],
        currentStage: "Cutting",
        stage: "Cutting",
        advanceQty: 1,
      },
    };
    const res3: any = {
      status: (code: number) => { res3Status = code; return res3; },
      json: (d: any) => { res3Data = d; return res3; },
    };
    handleAdvanceStage(req3, res3, () => {});
    expect(res3Status).toBe(400);
    expect(res3Data.error).toBe("Already scanned in this stage");
    expect(res3Data.message).toContain("already completed stage");

    // Check handleScanLookup also reports already_scanned
    let lookupData: any = null;
    const reqLookup: any = {
      body: { code: barcode17, stage: "Cutting" },
    };
    const resLookup: any = {
      status: () => resLookup,
      json: (d: any) => { lookupData = d; return resLookup; },
    };
    handleScanLookup(reqLookup, resLookup, () => {});
    expect(lookupData.status).toBe("already_scanned");
    expect(lookupData.message).toContain("already scanned");

    // Clean up
    const idx1 = glassItemsDatabase.findIndex((g) => g.id === piece1Id);
    if (idx1 !== -1) glassItemsDatabase.splice(idx1, 1);
    const idx2 = glassItemsDatabase.findIndex((g) => g.id === piece2Id);
    if (idx2 !== -1) glassItemsDatabase.splice(idx2, 1);
  });

  it("should advance only ONE piece when both itemIds and serialNumbers are provided for multi-sticker positions", async () => {
    const { glassItemsDatabase } = await import("./pi");
    const { handleAdvanceStage } = await import("./production");

    const barcodeMulti = "1012627088880011";
    const pieceAId = "test-piece-multi-a";
    const pieceBId = "test-piece-multi-b";
    const pieceCId = "test-piece-multi-c";

    const pieceA: any = {
      id: pieceAId,
      serialNumber: "S801",
      barcode: barcodeMulti,
      posNo: "11",
      currentStage: "Cutting",
      processRoute: ["Cutting", "Pairing", "Finished"],
      completedStages: [],
      status: "In Production",
      qty: 1,
    };
    const pieceB: any = {
      id: pieceBId,
      serialNumber: "S802",
      barcode: barcodeMulti,
      posNo: "11",
      currentStage: "Cutting",
      processRoute: ["Cutting", "Pairing", "Finished"],
      completedStages: [],
      status: "In Production",
      qty: 1,
    };
    const pieceC: any = {
      id: pieceCId,
      serialNumber: "S803",
      barcode: barcodeMulti,
      posNo: "11",
      currentStage: "Cutting",
      processRoute: ["Cutting", "Pairing", "Finished"],
      completedStages: [],
      status: "In Production",
      qty: 1,
    };
    glassItemsDatabase.push(pieceA, pieceB, pieceC);

    // Frontend scan sends BOTH itemIds: [pieceA.id] AND serialNumbers: [pieceA.serialNumber]
    let resData: any = null;
    const req: any = {
      body: {
        itemIds: [pieceAId],
        serialNumbers: [pieceA.serialNumber],
        currentStage: "Cutting",
        stage: "Cutting",
        advanceQty: 1,
        advanceAll: false,
      },
    };
    const res: any = {
      status: () => res,
      json: (d: any) => { resData = d; return res; },
    };

    handleAdvanceStage(req, res, () => {});

    // Must advance ONLY pieceA, NOT pieceB or pieceC!
    expect(resData.items).toHaveLength(1);
    expect(resData.items[0].id).toBe(pieceAId);
    expect(pieceA.currentStage).toBe("Pairing");
    expect(pieceB.currentStage).toBe("Cutting");
    expect(pieceC.currentStage).toBe("Cutting");

    // Clean up
    [pieceAId, pieceBId, pieceCId].forEach((id) => {
      const idx = glassItemsDatabase.findIndex((g) => g.id === id);
      if (idx !== -1) glassItemsDatabase.splice(idx, 1);
    });
  });

  it("should reject advancing an upstream item if scanned from a downstream workstation stage", async () => {
    const { glassItemsDatabase } = await import("./pi");
    const { handleAdvanceStage } = await import("./production");

    const testSn = "SN-UPSTREAM-TEST-01";
    const testId = "item-upstream-test-01";
    glassItemsDatabase.push({
      id: testId,
      serialNumber: testSn,
      barcode: "1012627099990001",
      currentStage: "Cutting",
      processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
      completedStages: [],
      status: "In Production",
      qty: 1,
      width: 1000,
      height: 1000,
      sqm: 1.0,
      piNumber: "PI-TEST-UPSTREAM",
      posNo: "1",
    } as any);

    let resStatus = 200;
    let resData: any = null;
    const req: any = {
      body: {
        serialNumbers: [testSn],
        stage: "DGU",
        currentStage: "DGU",
      },
    };
    const res: any = {
      status: (code: number) => { resStatus = code; return res; },
      json: (d: any) => { resData = d; return res; },
    };

    handleAdvanceStage(req, res, () => {});
    expect(resStatus).toBe(400);
    expect(resData.error).toBe("Wrong workstation stage");
    expect(resData.skippedItems[0].reason).toContain("cannot be scanned at \"DGU\"");

    // Clean up
    const idx = glassItemsDatabase.findIndex((g) => g.id === testId);
    if (idx !== -1) glassItemsDatabase.splice(idx, 1);
  });

  it("should REJECT advancing a single DGU glass pane from Pairing if its Colour partner is not in buffer", async () => {
    const { handleAdvanceStage } = await import("./production");
    const { glassItemsDatabase } = await import("./pi");

    const clearId = `item-pair-guard-clear-${Date.now()}`;
    const clearSn = `SN-CLR-GUARD-${Date.now()}`;

    // Add only Clear pane into Pairing (Colour pane has NOT been cut yet)
    glassItemsDatabase.push({
      id: clearId,
      serialNumber: clearSn,
      barcode: `1012627099990001`,
      glassCategory: "DGU",
      colorOrClear: "Clear",
      currentStage: "Pairing",
      processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
      completedStages: ["Cutting"],
      status: "In Production",
      qty: 1,
      width: 1200,
      height: 800,
      sqm: 0.96,
      piNumber: "PI-TEST-PAIR-GUARD",
      posNo: "42",
    } as any);

    let resStatus = 200;
    let resData: any = null;
    const req: any = {
      body: {
        serialNumbers: [clearSn],
        stage: "Pairing",
        currentStage: "Pairing",
      },
    };
    const res: any = {
      status: (code: number) => { resStatus = code; return res; },
      json: (d: any) => { resData = d; return res; },
    };

    handleAdvanceStage(req, res, () => {});
    expect(resStatus).toBe(400);
    expect(resData.error).toBe("Pairing Required");
    expect(resData.skippedItems[0].reason).toContain("cannot advance to DGU without pairing");

    // Clean up
    const idx = glassItemsDatabase.findIndex((g) => g.id === clearId);
    if (idx !== -1) glassItemsDatabase.splice(idx, 1);
  });

  it("should successfully pair and advance BOTH panes when partner pane arrives in Pairing buffer", async () => {
    const { handleAdvanceStage } = await import("./production");
    const { glassItemsDatabase } = await import("./pi");

    const ts = Date.now();
    const clearId = `item-pair-clear-${ts}`;
    const clearSn = `SN-CLR-PAIR-${ts}`;
    const colId = `item-pair-col-${ts}`;
    const colSn = `SN-COL-PAIR-${ts}`;

    // Add Clear pane in Pairing
    glassItemsDatabase.push({
      id: clearId,
      serialNumber: clearSn,
      barcode: `1012627088880001`,
      glassCategory: "DGU",
      colorOrClear: "Clear",
      currentStage: "Pairing",
      processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
      completedStages: ["Cutting"],
      status: "In Production",
      qty: 1,
      width: 1200,
      height: 800,
      sqm: 0.96,
      piNumber: "PI-TEST-PAIR-SUCCESS",
      orderNo: "ORD-999",
      posNo: "55",
    } as any);

    // Add Colour pane also in Pairing
    glassItemsDatabase.push({
      id: colId,
      serialNumber: colSn,
      barcode: `1012627088880002`,
      glassCategory: "DGU",
      colorOrClear: "Colour",
      category: "Coloured Glass",
      currentStage: "Pairing",
      processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
      completedStages: ["Cutting"],
      status: "In Production",
      qty: 1,
      width: 1200,
      height: 800,
      sqm: 0.96,
      piNumber: "PI-TEST-PAIR-SUCCESS",
      orderNo: "ORD-999",
      posNo: "55",
    } as any);

    let resStatus = 200;
    let resData: any = null;
    const req: any = {
      body: {
        serialNumbers: [clearSn],
        stage: "Pairing",
        currentStage: "Pairing",
      },
    };
    const res: any = {
      status: (code: number) => { resStatus = code; return res; },
      json: (d: any) => { resData = d; return res; },
    };

    handleAdvanceStage(req, res, () => {});
    expect(resStatus).toBe(200);
    expect(resData.items.length).toBe(2);

    const clrItem = glassItemsDatabase.find((g) => g.id === clearId);
    const colItem = glassItemsDatabase.find((g) => g.id === colId);
    expect(clrItem?.currentStage).toBe("DGU");
    expect(colItem?.currentStage).toBe("DGU");
    expect((clrItem as any)?.dguPairId).toBeDefined();
    expect((colItem as any)?.dguPairId).toBe((clrItem as any)?.dguPairId);

    // Clean up
    glassItemsDatabase.splice(glassItemsDatabase.findIndex((g) => g.id === clearId), 1);
    glassItemsDatabase.splice(glassItemsDatabase.findIndex((g) => g.id === colId), 1);
  });

  it("should find and return item for A1.pdf barcode, POS, SFO, and glass code in handleScanLookup", async () => {
    const { handleScanLookup } = await import("./production");
    const { glassItemsDatabase } = await import("./pi");

    const a1Item = {
      id: "test-a1-spec-1",
      serialNumber: "SN-A1-001",
      barcode: "1012627007010008",
      posNo: "3",
      sfoNo: "20070",
      orderNo: "00821",
      obNo: "01361",
      batchNo: "1023",
      itemCode: "1233 V17 W03A GL SK",
      glassCode: "1233 V17 W03A GL SK",
      currentStage: "Cutting",
      processRoute: ["Cutting", "Pairing", "Finished"],
      completedStages: [],
      status: "In Production",
      qty: 1,
    } as any;

    glassItemsDatabase.unshift(a1Item);

    const checkCode = (code: string) => {
      let status = 200;
      let body: any = null;
      const req: any = { body: { code, stage: "Cutting" } };
      const res: any = {
        status: (c: number) => { status = c; return res; },
        json: (b: any) => { body = b; return res; },
      };
      handleScanLookup(req, res, () => {});
      return { status, body };
    };

    // 1. Direct 16-digit barcode from A1.pdf
    expect(checkCode("1012627007010008").body.item?.barcode).toBe("1012627007010008");

    // 2. Pure POS number '3' and 'POS 3'
    expect(checkCode("3").body.item?.posNo).toBe("3");
    expect(checkCode("POS 3").body.item?.posNo).toBe("3");

    // 3. SFO number '20070'
    expect(checkCode("20070").body.item?.sfoNo).toBe("20070");

    // 4. Glass Code '1233 V17 W03A GL SK'
    expect(checkCode("1233 V17 W03A GL SK").body.item?.itemCode).toContain("1233 V17 W03A GL SK");

    // Clean up
    const idx = glassItemsDatabase.findIndex((g) => g.id === "test-a1-spec-1");
    if (idx !== -1) glassItemsDatabase.splice(idx, 1);
  });

  it("should support scanning arbitrary generic non-Sejal stickers in handleScanLookup", async () => {
    const { handleScanLookup } = await import("./production");
    const { glassItemsDatabase } = await import("./pi");

    const genericItem = {
      id: "test-generic-spec-99",
      serialNumber: "SN-GEN-99",
      barcode: "GENERIC-BARCODE-9999",
      posNo: "88",
      sfoNo: "7766",
      currentStage: "Cutting",
      processRoute: ["Cutting", "Finished"],
      completedStages: [],
      status: "In Production",
      qty: 1,
    } as any;

    glassItemsDatabase.push(genericItem);

    let body: any = null;
    const req: any = { body: { code: "]C1GENERIC-BARCODE-9999", stage: "Cutting" } };
    const res: any = {
      status: () => res,
      json: (b: any) => { body = b; return res; },
    };
    handleScanLookup(req, res, () => {});
    expect(body.item?.serialNumber).toBe("SN-GEN-99");

    // Clean up
    const idx = glassItemsDatabase.findIndex((g) => g.id === "test-generic-spec-99");
    if (idx !== -1) glassItemsDatabase.splice(idx, 1);
  });

  it("should conditionally route stickers with POLISH to Polishing, and standard stickers to default flow", async () => {
    const { handleStickerUpload } = await import("./production");
    const { glassItemsDatabase } = await import("./pi");

    // 1. Upload a batch with CUT/POLISH route (like polish1.pdf)
    let bodyPolish: any = null;
    const reqPolish: any = {
      body: {
        batchNo: "TEST-POLISH-01",
        sfoNo: "9001",
        items: [
          {
            stickerNo: 1,
            glassType: "10MM CLEAR",
            makeup: "10MM CLEAR\n1.52MM CLEAR PVB\n10MM CLEAR",
            stickerRoute: "CUT/POLISH ALL SIDES/HOLE/TMP/HST",
            hasPolish: true,
            glassCategory: "Lamination",
            width: 1923,
            height: 2368,
            qty: 1,
            barcode: "1012627090010001",
          },
        ],
      },
    };
    const resPolish: any = {
      status: () => resPolish,
      json: (b: any) => { bodyPolish = b; return resPolish; },
    };
    handleStickerUpload(reqPolish, resPolish, () => {});
    const polishItem = bodyPolish.items?.[0];
    expect(polishItem.processRoute).toEqual(["Cutting", "Polishing", "Pairing", "Lamination", "Finished"]);

    // 2. Upload a standard batch with CUT/EDGE (like Glass1.pdf) - should NOT include Polishing
    let bodyStandard: any = null;
    const reqStandard: any = {
      body: {
        batchNo: "TEST-STANDARD-01",
        sfoNo: "9002",
        items: [
          {
            stickerNo: 1,
            glassType: "6MM CLEAR",
            makeup: "6MM CLEAR\n12MM AIR\n6MM CLEAR",
            stickerRoute: "CUT/EDGE/TMP/U-INSERT",
            hasPolish: false,
            glassCategory: "DGU",
            width: 1000,
            height: 1000,
            qty: 1,
            barcode: "1012627090020001",
          },
        ],
      },
    };
    const resStandard: any = {
      status: () => resStandard,
      json: (b: any) => { bodyStandard = b; return resStandard; },
    };
    handleStickerUpload(reqStandard, resStandard, () => {});
    const standardItem = bodyStandard.items?.[0];
    expect(standardItem.processRoute).toEqual(["Cutting", "Pairing", "DGU", "Finished"]);
    expect(standardItem.processRoute).not.toContain("Polishing");

    // Clean up
    const removeIds = [polishItem?.id, standardItem?.id].filter(Boolean);
    removeIds.forEach((id) => {
      const idx = glassItemsDatabase.findIndex((g) => g.id === id);
      if (idx !== -1) glassItemsDatabase.splice(idx, 1);
    });
  });
});

describe("Batch Upload History & Worker Daily Progress Calculation", () => {
  it("should accurately distinguish batch upload audit records from individual glass item history", async () => {
    const { isBatchUploadHistory } = await import("../../shared/api");

    const batchUploadRecord1 = {
      serialNumber: "BATCH-1360",
      action: "Batch Uploaded (Sticker PDF)",
      stage: "Cutting",
      status: "Completed",
    };
    const batchUploadRecord2 = {
      serialNumber: "BATCH-6243",
      action: "Batch Uploaded (Excel)",
      stage: "Cutting",
      status: "Completed",
    };
    const cutGlassItemRecord = {
      serialNumber: "S579",
      action: "Advanced to Polishing",
      stage: "Cutting",
      status: "Completed",
    };

    expect(isBatchUploadHistory(batchUploadRecord1)).toBe(true);
    expect(isBatchUploadHistory(batchUploadRecord2)).toBe(true);
    expect(isBatchUploadHistory(cutGlassItemRecord)).toBe(false);
    expect(isBatchUploadHistory(null)).toBe(false);
  });

  it("should NOT count batch upload history as cut glass items in handleGetDashboardStats", async () => {
    const { handleGetDashboardStats } = await import("./production");
    const { productionHistoryDatabase } = await import("./pi");

    // Measure baseline stats before adding batch upload record
    let statsBefore: any = null;
    const reqBefore: any = {};
    const resBefore: any = {
      json: (data: any) => { statsBefore = data; return resBefore; },
    };
    handleGetDashboardStats(reqBefore, resBefore, () => {});
    const initialCutting = statsBefore.userThroughputByStage?.["Cutting"]?.["Operator"]?.stickers || 0;

    // Add a batch upload history record
    const testBatchRecord = {
      id: "hist-test-batch-upload",
      serialNumber: "BATCH-TEST-999",
      piNumber: "TEST-999",
      action: "Batch Uploaded (Sticker PDF)",
      stage: "Cutting",
      status: "Completed",
      operator: "Operator",
      user: "Operator",
      timestamp: new Date().toISOString(),
    };
    productionHistoryDatabase.unshift(testBatchRecord);

    let statsAfter: any = null;
    const reqAfter: any = {};
    const resAfter: any = {
      json: (data: any) => { statsAfter = data; return resAfter; },
    };
    handleGetDashboardStats(reqAfter, resAfter, () => {});

    // Clean up test record
    const idx = productionHistoryDatabase.findIndex((h) => h.id === "hist-test-batch-upload");
    if (idx !== -1) productionHistoryDatabase.splice(idx, 1);

    // Operator in cutting should NOT have stickers count incremented by the batch upload record
    const afterCutting = statsAfter.userThroughputByStage?.["Cutting"]?.["Operator"]?.stickers || 0;
    expect(afterCutting).toBe(initialCutting);
  });
});
