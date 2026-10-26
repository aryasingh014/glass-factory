import { describe, it, expect } from "vitest";
import {
  evaluateScanStatus,
  findBestMatchingItem,
  generateBarcodeSVG,
  generateITFBarcodeSVG,
  cleanScannedBarcode,
  isItemMatchingCode,
} from "./barcode";

describe("Barcode Multi-Sticker & Stage Scan Duplicate Prevention", () => {
  // Scenario matching Glass1.pdf POS 17:
  // 2 stickers printed for POS #17, both having barcode "1012627017660033"
  const glass1Stickers = [
    {
      id: "item-g1-p1",
      serialNumber: "S001",
      barcode: "1012627017660033",
      posNo: "17",
      orderNo: "201765",
      batchNo: "5442",
      currentStage: "Cutting",
      processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
      completedStages: [],
      status: "In Production",
      qty: 1,
    },
    {
      id: "item-g1-p2",
      serialNumber: "S002",
      barcode: "1012627017660033",
      posNo: "17",
      orderNo: "201765",
      batchNo: "5442",
      currentStage: "Cutting",
      processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
      completedStages: [],
      status: "In Production",
      qty: 1,
    },
  ];

  it("should allow first sticker to be scanned and advanced at Cutting stage", () => {
    const res = evaluateScanStatus(glass1Stickers, "1012627017660033", "Cutting");
    expect(res.status).toBe("can_advance");
    expect(res.item.serialNumber).toBe("S001");
    expect(res.totalMatching).toBe(2);
    expect(res.remainingInStage).toBe(2);
  });

  it("should allow second sticker with the SAME barcode to be scanned at Cutting stage", () => {
    // Simulate piece 1 already moved to Pairing
    const itemsState = [
      {
        ...glass1Stickers[0],
        currentStage: "Pairing",
        completedStages: ["Cutting"],
      },
      glass1Stickers[1], // still in Cutting
    ];

    const res = evaluateScanStatus(itemsState, "1012627017660033", "Cutting");
    expect(res.status).toBe("can_advance");
    expect(res.item.serialNumber).toBe("S002");
    expect(res.totalMatching).toBe(2);
    expect(res.remainingInStage).toBe(1);
  });

  it("should block third scan at Cutting stage and warn that sticker is already scanned", () => {
    // Both piece 1 and piece 2 have completed Cutting
    const itemsState = [
      {
        ...glass1Stickers[0],
        currentStage: "Pairing",
        completedStages: ["Cutting"],
      },
      {
        ...glass1Stickers[1],
        currentStage: "Pairing",
        completedStages: ["Cutting"],
      },
    ];

    const res = evaluateScanStatus(itemsState, "1012627017660033", "Cutting");
    expect(res.status).toBe("already_scanned");
    expect(res.message).toContain("already scanned");
    expect(res.message).toContain("All 2 stickers for POS #17 have already completed Cutting");
    expect(res.remainingInStage).toBe(0);

    // findBestMatchingItem must also return null to prevent advancing downstream items
    const match = findBestMatchingItem(itemsState, "1012627017660033", "Cutting");
    expect(match).toBeNull();
  });

  it("should prevent scanning downstream at Lamination if piece is still at Cutting", () => {
    const itemsState = [glass1Stickers[0]];
    const res = evaluateScanStatus(itemsState, "1012627017660033", "Lamination");
    expect(res.status).toBe("wrong_stage");
    expect(res.message).toContain("cannot be scanned at Lamination yet");
  });

  it("should prevent double-scanning for a single-sticker position", () => {
    const singleSticker = [
      {
        id: "item-single-1",
        serialNumber: "S010",
        barcode: "1012627017660049",
        posNo: "18",
        currentStage: "Cutting",
        processRoute: ["Cutting", "Pairing", "Finished"],
        completedStages: [],
        status: "In Production",
      },
    ];

    // 1st scan: can advance
    const res1 = evaluateScanStatus(singleSticker, "1012627017660049", "Cutting");
    expect(res1.status).toBe("can_advance");
    expect(res1.item.serialNumber).toBe("S010");

    // After advancing
    singleSticker[0].currentStage = "Pairing";
    singleSticker[0].completedStages = ["Cutting"];

    // 2nd scan at Cutting: already scanned
    const res2 = evaluateScanStatus(singleSticker, "1012627017660049", "Cutting");
    expect(res2.status).toBe("already_scanned");
    expect(res2.message).toContain("already completed Cutting");
  });

  it("should correctly isolate identical barcodes across Cutting vs DGU tabs for Admin", () => {
    // 4 pieces with identical sticker barcode:
    // 2 pieces are in Cutting (not yet cut)
    // 2 pieces have reached DGU
    const barcode = "1012627013440016";
    const shopFloorItems = [
      {
        id: "piece-cut-1",
        serialNumber: "SN-CUT-1",
        barcode,
        posNo: "16",
        currentStage: "Cutting",
        processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
        completedStages: [],
        status: "In Production",
      },
      {
        id: "piece-cut-2",
        serialNumber: "SN-CUT-2",
        barcode,
        posNo: "16",
        currentStage: "Cutting",
        processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
        completedStages: [],
        status: "In Production",
      },
      {
        id: "piece-dgu-1",
        serialNumber: "SN-DGU-1",
        barcode,
        posNo: "16",
        currentStage: "DGU",
        processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
        completedStages: ["Cutting", "Pairing"],
        status: "In Production",
      },
      {
        id: "piece-dgu-2",
        serialNumber: "SN-DGU-2",
        barcode,
        posNo: "16",
        currentStage: "DGU",
        processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
        completedStages: ["Cutting", "Pairing"],
        status: "In Production",
      },
    ];

    // When Admin is on Cutting tab (stage = "Cutting")
    const cutScan1 = evaluateScanStatus(shopFloorItems, barcode, "Cutting");
    expect(cutScan1.status).toBe("can_advance");
    expect(cutScan1.item.id).toBe("piece-cut-1");
    expect(cutScan1.remainingInStage).toBe(2);

    // When Admin is on DGU tab (stage = "DGU")
    const dguScan1 = evaluateScanStatus(shopFloorItems, barcode, "DGU");
    expect(dguScan1.status).toBe("can_advance");
    expect(dguScan1.item.id).toBe("piece-dgu-1");
    expect(dguScan1.remainingInStage).toBe(2);

    // After 1st DGU piece is completed, 2nd DGU piece is scanned
    shopFloorItems[2].currentStage = "Finished";
    shopFloorItems[2].completedStages.push("DGU");

    const dguScan2 = evaluateScanStatus(shopFloorItems, barcode, "DGU");
    expect(dguScan2.status).toBe("can_advance");
    expect(dguScan2.item.id).toBe("piece-dgu-2");
    expect(dguScan2.remainingInStage).toBe(1);

    // When 2nd DGU piece is also finished:
    shopFloorItems[3].currentStage = "Finished";
    shopFloorItems[3].completedStages.push("DGU");

    const dguScan3 = evaluateScanStatus(shopFloorItems, barcode, "DGU");
    expect(dguScan3.status).toBe("already_scanned");
    expect(dguScan3.message).toContain("already completed DGU");
  });
});

describe("Generic Sticker & A1.pdf Barcode Scanning Support", () => {
  // Real sticker item from document/A1.pdf Page 1
  const a1Item = {
    id: "item-a1-p1",
    serialNumber: "S001",
    barcode: "1012627007010008", // 16 digits as printed on A1.pdf Page 1
    qrId: "QR-1012627007010008",
    posNo: "3",
    sfoNo: "20070",
    orderNo: "00821",
    obNo: "01361",
    batchNo: "1023",
    itemCode: "1233 V17 W03A GL SK",
    glassCode: "1233 V17 W03A GL SK",
    currentStage: "Cutting",
    processRoute: ["Cutting", "Pairing", "Lamination", "Pairing", "DGU", "Finished"],
    completedStages: [],
    status: "Pending",
    qty: 1,
  };

  it("should match A1.pdf sticker via direct 16-digit barcode 1012627007010008", () => {
    const res = evaluateScanStatus([a1Item], "1012627007010008", "Cutting");
    expect(res.status).toBe("can_advance");
    expect(res.item.serialNumber).toBe("S001");
  });

  it("should match A1.pdf sticker via pure numeric POS number '3' or 'POS 3'", () => {
    // Pure POS number
    const resPure = evaluateScanStatus([a1Item], "3", "Cutting");
    expect(resPure.status).toBe("can_advance");
    expect(resPure.item.serialNumber).toBe("S001");

    // Formatted POS
    const resPrefix = evaluateScanStatus([a1Item], "POS 3", "Cutting");
    expect(resPrefix.status).toBe("can_advance");
    expect(resPrefix.item.serialNumber).toBe("S001");

    const resHash = evaluateScanStatus([a1Item], "POS #3", "Cutting");
    expect(resHash.status).toBe("can_advance");
  });

  it("should match A1.pdf sticker via serial number S001 or clean serial", () => {
    const res = evaluateScanStatus([a1Item], "S001", "Cutting");
    expect(res.status).toBe("can_advance");
    expect(res.item.serialNumber).toBe("S001");

    const resLower = evaluateScanStatus([a1Item], "s001", "Cutting");
    expect(resLower.status).toBe("can_advance");
  });

  it("should match A1.pdf sticker via Glass Code / Item Code", () => {
    const res = evaluateScanStatus([a1Item], "1233 V17 W03A GL SK", "Cutting");
    expect(res.status).toBe("can_advance");
    expect(res.item.serialNumber).toBe("S001");
  });

  it("should match A1.pdf sticker via SFO '20070', Order '00821', OB '01361', or Batch '1023'", () => {
    expect(evaluateScanStatus([a1Item], "20070", "Cutting").status).toBe("can_advance");
    expect(evaluateScanStatus([a1Item], "00821", "Cutting").status).toBe("can_advance");
    expect(evaluateScanStatus([a1Item], "01361", "Cutting").status).toBe("can_advance");
    expect(evaluateScanStatus([a1Item], "1023", "Cutting").status).toBe("can_advance");
  });

  it("should work with arbitrary non-Sejal stickers with custom barcodes", () => {
    const customItem = {
      id: "item-custom-99",
      serialNumber: "SN-999",
      barcode: "CUSTOM-BC-2026-X1",
      qrId: "QR-CUSTOM-BC-2026-X1",
      posNo: "42",
      sfoNo: "9988",
      orderNo: "ORD-99",
      currentStage: "Cutting",
      processRoute: ["Cutting", "Pairing", "Finished"],
      completedStages: [],
      status: "Pending",
      qty: 1,
    };

    // Scanned with hardware scanner gun (with AIM prefix ]C1)
    const resGun = evaluateScanStatus([customItem], "]C1CUSTOM-BC-2026-X1", "Cutting");
    expect(resGun.status).toBe("can_advance");
    expect(resGun.item.serialNumber).toBe("SN-999");

    // Scanned via POS
    const resPos = evaluateScanStatus([customItem], "POS 42", "Cutting");
    expect(resPos.status).toBe("can_advance");

    // Scanned via pure POS number
    const resPurePos = evaluateScanStatus([customItem], "42", "Cutting");
    expect(resPurePos.status).toBe("can_advance");
  });

  describe("Sticker 1012627007010057 (User Screenshot Sticker Label)", () => {
    // Exact item from user screenshot: Order 00821, OB 01361, SFO 700, Batch 1022, POS 19, Barcode 1012627007010057
    const stickerItem = {
      id: "item-1791912537399-0",
      serialNumber: "S097",
      barcode: "1012627007010057",
      qrId: "QR-1012627007010057",
      orderNo: "00821",
      obNo: "01361",
      sfoNo: "700",
      batchNo: "1022",
      posNo: "19",
      customerName: "NEXT LEVEL INNOVATIVE GLASS & ME",
      projectName: "22_VILLAS",
      glassCode: "1233 V18 GD 02B 01 G",
      glassType: "8MM GUARDIAN SUNGUARD SN GREY 50 T",
      width: 740,
      height: 2322,
      qty: 1,
      lineQty: 2,
      category: "Coloured Glass (Coloured Glass)",
      glassCategory: "DLGU",
      currentStage: "Cutting",
      processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
      completedStages: [],
      status: "Pending",
    };

    it("generates a valid, scannable Code 128 SVG for 1012627007010057 with crispEdges and quiet zones", () => {
      const svg = generateBarcodeSVG("1012627007010057", 46, 1.8);
      expect(svg).toContain("<svg");
      expect(svg).toContain('shape-rendering="crispEdges"');
      expect(svg).toContain("1012627007010057");
      // Must contain black rects for the bars
      expect(svg).toContain('<rect x="');
      expect(svg).toContain('fill="#000000"');
      // Must contain white background
      expect(svg).toContain('fill="#ffffff"');
    });

    it("evaluates scan for 1012627007010057 successfully at Cutting stage", () => {
      const res = evaluateScanStatus([stickerItem], "1012627007010057", "Cutting");
      expect(res.status).toBe("can_advance");
      expect(res.item.serialNumber).toBe("S097");
      expect(res.item.posNo).toBe("19");
    });

    it("evaluates scan with AIM prefix ]C11012627007010057 from hardware scanner gun", () => {
      const res = evaluateScanStatus([stickerItem], "]C11012627007010057", "Cutting");
      expect(res.status).toBe("can_advance");
      expect(res.item.serialNumber).toBe("S097");
    });

    it("evaluates scan with QR prefix QR-1012627007010057", () => {
      const res = evaluateScanStatus([stickerItem], "QR-1012627007010057", "Cutting");
      expect(res.status).toBe("can_advance");
      expect(res.item.serialNumber).toBe("S097");
    });

    it("evaluates scan via POS #19 or pure numeric '19'", () => {
      expect(evaluateScanStatus([stickerItem], "19", "Cutting").status).toBe("can_advance");
      expect(evaluateScanStatus([stickerItem], "POS 19", "Cutting").status).toBe("can_advance");
      expect(evaluateScanStatus([stickerItem], "POS #19", "Cutting").status).toBe("can_advance");
    });

    it("evaluates scan via Glass Code '1233 V18 GD 02B 01 G'", () => {
      const res = evaluateScanStatus([stickerItem], "1233 V18 GD 02B 01 G", "Cutting");
      expect(res.status).toBe("can_advance");
      expect(res.item.serialNumber).toBe("S097");
    });

    it("evaluates scan via Order '00821', OB '01361', SFO '700', Batch '1022'", () => {
      expect(evaluateScanStatus([stickerItem], "00821", "Cutting").status).toBe("can_advance");
      expect(evaluateScanStatus([stickerItem], "01361", "Cutting").status).toBe("can_advance");
      expect(evaluateScanStatus([stickerItem], "700", "Cutting").status).toBe("can_advance");
      expect(evaluateScanStatus([stickerItem], "1022", "Cutting").status).toBe("can_advance");
    });

    it("strips control characters in cleanScannedBarcode", () => {
      const withSTX_ETX = "\x021012627007010057\x03\r\n";
      expect(cleanScannedBarcode(withSTX_ETX)).toBe("1012627007010057");
    });

    it("generates a valid 44-bar Interleaved 2 of 5 (ITF) SVG for 1012627016100032 matching factory DLGU hardcopy", () => {
      const itfSvg = generateITFBarcodeSVG("1012627016100032", 46, 1.6);
      expect(itfSvg).toContain("<svg");
      expect(itfSvg).toContain('shape-rendering="crispEdges"');
      expect(itfSvg).toContain("1012627016100032");
      // Must contain exactly 44 black rects: 2 start + 40 (8 pairs * 5) + 2 stop = 44 bars
      const blackBars = (itfSvg.match(/<rect[^>]+fill="#000000"/g) || []).length;
      expect(blackBars).toBe(44);
    });

    it("evaluates scan for DLGU item with ITF AIM prefix ]I01012627016100032", () => {
      const dlguItem = {
        id: "item-dlgu-1",
        serialNumber: "S149",
        barcode: "1012627016100032",
        posNo: "11",
        orderNo: "01969",
        batchNo: "1622",
        sfoNo: "40160",
        obNo: "03568",
        width: 1288,
        height: 2980,
        qty: 1,
        glassCategory: "DLGU",
        currentStage: "Cutting",
        processRoute: ["Cutting", "Pairing", "Lamination", "Pairing", "DGU", "Finished"],
      };
      const res = evaluateScanStatus([dlguItem], "]I01012627016100032", "Cutting");
      expect(res.status).toBe("can_advance");
      expect(res.item.serialNumber).toBe("S149");
      expect(res.item.posNo).toBe("11");
    });

    it("evaluates scan status for item with quantity of 5 (piece 1 of 5, 5 total, 5 in stage)", () => {
      const itemWithQty5 = {
        id: "item-qty5-1",
        serialNumber: "S246",
        barcode: "1812627016610063",
        posNo: "32",
        orderNo: "5846",
        batchNo: "5846",
        sfoNo: "15227",
        width: 1788,
        height: 2890,
        qty: 5,
        currentStage: "Cutting",
        processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
        completedStages: [],
        status: "In Production",
      };
      const res = evaluateScanStatus([itemWithQty5], "1812627016610063", "Cutting");
      expect(res.status).toBe("can_advance");
      expect(res.item.serialNumber).toBe("S246");
      expect(res.totalMatching).toBe(5);
      expect(res.remainingInStage).toBe(5);
    });
  });
});


