import { describe, it, expect } from "vitest";
import { cn, formatBatchNumber, isLaminatedGlass, isDguGlass, isDguStickerPairMatch, getItemFinish, getGlassPaneRole } from "./utils";

describe("cn function", () => {
  it("should merge classes correctly", () => {
    expect(cn("text-red-500", "bg-blue-500")).toBe("text-red-500 bg-blue-500");
  });

  it("should handle conditional classes", () => {
    const isActive = true;
    expect(cn("base-class", isActive && "active-class")).toBe(
      "base-class active-class",
    );
  });

  it("should handle false and null conditions", () => {
    const isActive = false;
    expect(cn("base-class", isActive && "active-class", null)).toBe(
      "base-class",
    );
  });

  it("should merge tailwind classes properly", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });

  it("should work with object notation", () => {
    expect(cn("base", { conditional: true, "not-included": false })).toBe(
      "base conditional",
    );
  });
});

describe("formatBatchNumber", () => {
  it("should strip B prefix and legacy SFO prefix", () => {
    expect(formatBatchNumber("B5441")).toBe("5441");
    expect(formatBatchNumber("B5442")).toBe("5442");
    expect(formatBatchNumber("5442")).toBe("5442");
    expect(formatBatchNumber("")).toBe("-");
  });

  it("should correctly extract numeric batch number from multi-customer sub-batches", () => {
    expect(formatBatchNumber("5846-ASHBILIA")).toBe("5846");
    expect(formatBatchNumber("5846-MERAKI-DISTRICT_O")).toBe("5846");
    expect(formatBatchNumber("5846-MERAKI-HAVEN_BY_A")).toBe("5846");
    expect(formatBatchNumber("5826-MERAKI")).toBe("5826");
    expect(formatBatchNumber("5826-ASHBILIA")).toBe("5826");
  });
});

describe("isLaminatedGlass & isDguGlass", () => {
  it("should correctly identify laminated glass", () => {
    expect(isLaminatedGlass({ processRoute: ["Cutting", "Lamination", "Finished"] })).toBe(true);
    expect(isLaminatedGlass({ glassType: "10MM CLEAR + 1.52 PVB + 10MM CLEAR LAMINATED" })).toBe(true);
    expect(isLaminatedGlass({ glassType: "6MM SGP TOUGHENED" })).toBe(true);
    expect(isLaminatedGlass({ glassType: "6MM CLEAR FLOAT" })).toBe(false);
  });

  it("should correctly identify DGU glass", () => {
    expect(isDguGlass({ processRoute: ["Cutting", "Pairing", "DGU", "Finished"] })).toBe(true);
    expect(isDguGlass({ glassType: "28MM DGU (6MM STOPRAY + 16A + 6MM CLEAR)" })).toBe(true);
    expect(isDguGlass({ glassType: "6MM CLEAR FLOAT" })).toBe(false);
  });
});

describe("isDguStickerPairMatch Category Isolation", () => {
  it("should match two DGU panes with identical specifications", () => {
    const dguColour = {
      orderNo: "2045",
      posNo: "1",
      width: 1000,
      height: 2000,
      colorOrClear: "Colour",
      glassCategory: "DGU",
      processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
    };
    const dguClear = {
      orderNo: "2045",
      posNo: "1",
      width: 1000,
      height: 2000,
      colorOrClear: "Clear",
      glassCategory: "DGU",
      processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
    };
    expect(isDguStickerPairMatch(dguColour, dguClear)).toBe(true);
  });

  it("should NEVER match a DGU Colour pane with a Lamination Clear pane even with same dimensions and posNo", () => {
    const dguColour = {
      orderNo: "2045",
      posNo: "1",
      width: 1000,
      height: 2000,
      glassCategory: "DGU",
      processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
    };
    const lamClear = {
      orderNo: "2045",
      posNo: "1",
      width: 1000,
      height: 2000,
      glassCategory: "Lamination",
      processRoute: ["Cutting", "Pairing", "Lamination", "Finished"],
    };
    expect(isDguStickerPairMatch(dguColour, lamClear)).toBe(false);
    expect(isDguStickerPairMatch(lamClear, dguColour)).toBe(false);
  });

  it("should correctly identify DLGU glass and isolate from pure DGU/Lamination", () => {
    const dlguItem = {
      glassType: "37.52MM DLGU (8MM SN GREY + 16A + 13.52MM CLEAR LAMINATED)",
      glassCategory: "DLGU",
      processRoute: ["Cutting", "Pairing", "Lamination", "Pairing", "DGU", "Finished"],
    };
    expect(isLaminatedGlass(dlguItem)).toBe(false);
    expect(isDguGlass(dlguItem)).toBe(false);
  });

  it("should match DLGU Phase 1 (Lamination pairing) panes: 6mm Clear + 13.52mm Clear Laminated", () => {
    const pane1 = {
      orderNo: "00821",
      posNo: "1",
      width: 1500,
      height: 2500,
      glassCode: "13.52MM CLEAR LAMINATED",
      glassCategory: "DLGU" as const,
      dlguPhase: "LamPairing" as const,
      colorOrClear: "Clear" as const,
      completedStages: ["Cutting"],
    };
    const pane2 = {
      orderNo: "00821",
      posNo: "1",
      width: 1500,
      height: 2500,
      glassCode: "6MM CLEAR",
      glassCategory: "DLGU" as const,
      dlguPhase: "LamPairing" as const,
      colorOrClear: "Clear" as const,
      completedStages: ["Cutting"],
    };
    expect(isDguStickerPairMatch(pane1, pane2)).toBe(true);
  });

  it("should match DLGU Phase 2 (DGU pairing): post-Lamination unit + 8mm SN Grey", () => {
    const laminatedUnit = {
      orderNo: "00821",
      posNo: "1",
      width: 1500,
      height: 2500,
      glassCode: "13.52MM CLEAR LAMINATED",
      glassCategory: "DLGU" as const,
      dlguPhase: "DguPairing" as const,
      colorOrClear: "Clear" as const,
      completedStages: ["Cutting", "Pairing", "Lamination"],
    };
    const outerGrey = {
      orderNo: "00821",
      posNo: "1",
      width: 1500,
      height: 2500,
      glassCode: "8MM GUARDIAN SUNGUARD SN GREY 50 T",
      glassCategory: "DLGU" as const,
      dlguPhase: "DguPairing" as const,
      colorOrClear: "Colour" as const,
      completedStages: ["Cutting"],
    };
    expect(isDguStickerPairMatch(laminatedUnit, outerGrey)).toBe(true);
  });

  it("should correctly identify 6MM CARDINAL ADVANCED LOW-E C340 (Z1.pdf) as Colour finish and OP (Outer Pane)", () => {
    const z1Item = {
      glassType: "6MM CARDINAL ADVANCED LOW-E C340",
      glassCategory: "DGU" as const,
      colorOrClear: "Colour" as const,
    };
    expect(getItemFinish(z1Item)).toBe("Colour");
    const role = getGlassPaneRole(z1Item);
    expect(role.code).toBe("OP");
    expect(role.name).toBe("Outer Pane");
  });

  it("should correctly identify 6MM CLEAR (Z2.pdf) as Clear finish and IP (Inner Pane)", () => {
    const z2Item = {
      glassType: "6MM CLEAR",
      glassCategory: "DGU" as const,
      colorOrClear: "Clear" as const,
    };
    expect(getItemFinish(z2Item)).toBe("Clear");
    const role = getGlassPaneRole(z2Item);
    expect(role.code).toBe("IP");
    expect(role.name).toBe("Inner Pane");
  });

  it("should match Z1.pdf (Colour Low-E) with Z2.pdf (Clear) in DGU Pairing Buffer", () => {
    const z1Pane = {
      orderNo: "03145",
      obNo: "05863",
      posNo: "4",
      width: 1690,
      height: 1703,
      glassCode: "CW 13 C2 S 121",
      glassType: "6MM CARDINAL ADVANCED LOW-E C340",
      colorOrClear: "Colour" as const,
      glassCategory: "DGU" as const,
      processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
    };
    const z2Pane = {
      orderNo: "03145",
      obNo: "05863",
      posNo: "4",
      width: 1690,
      height: 1703,
      glassCode: "CW 13 C2 S 121",
      glassType: "6MM CLEAR",
      colorOrClear: "Clear" as const,
      glassCategory: "DGU" as const,
      processRoute: ["Cutting", "Pairing", "DGU", "Finished"],
    };
    expect(isDguStickerPairMatch(z1Pane, z2Pane)).toBe(true);
  });
});


