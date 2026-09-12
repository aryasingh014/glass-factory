import { describe, it, expect } from "vitest";
import { generateToken, verifyToken } from "./auth";

describe("JWT Auth Utilities", () => {
  it("should generate valid signed token for Admin role", () => {
    const token = generateToken("Admin");
    expect(token).toBeDefined();
    expect(token.split(".")).toHaveLength(3);
  });

  it("should verify token and extract user role payload", () => {
    const token = generateToken("Supervisor");
    const payload = verifyToken(token);

    expect(payload).not.toBeNull();
    expect(payload?.role).toBe("Supervisor");
    expect(payload?.userId).toBe("user-supervisor");
  });

  it("should reject tampered or invalid tokens", () => {
    const token = generateToken("Operator");
    const tampered = token.slice(0, -5) + "abcde";
    expect(verifyToken(tampered)).toBeNull();
    expect(verifyToken("invalid.token.string")).toBeNull();
  });
});
