import { describe, it, expect } from "vitest";
import { handleGetPerformanceAnalytics } from "./analytics";

describe("Performance Analytics Endpoint Handler", () => {
  it("should be defined as an Express request handler", () => {
    expect(handleGetPerformanceAnalytics).toBeDefined();
    expect(typeof handleGetPerformanceAnalytics).toBe("function");
  });

  it("should respond with analytics structure when called with mock req/res", () => {
    let responseData: any = null;
    let statusCode: number = 200;

    const mockReq: any = {
      query: { range: "all" },
    };

    const mockRes: any = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: any) {
        responseData = data;
        return this;
      },
    };

    handleGetPerformanceAnalytics(mockReq, mockRes, () => {});

    expect(statusCode).toBe(200);
    expect(responseData).not.toBeNull();
    expect(responseData).toHaveProperty("summary");
    expect(responseData).toHaveProperty("stages");
    expect(responseData).toHaveProperty("defects");
    expect(responseData).toHaveProperty("operators");
    expect(responseData).toHaveProperty("dailyTrends");
    expect(responseData).toHaveProperty("piFulfillment");

    expect(typeof responseData.summary.oee).toBe("number");
    expect(Array.isArray(responseData.stages)).toBe(true);
    expect(responseData.stages.length).toBeGreaterThan(0);
  });
});
