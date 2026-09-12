import crypto from "crypto";
import { UserRole } from "@shared/api";
import { env } from "./env";

const JWT_SECRET = env.JWT_SECRET;

export interface AuthPayload {
  userId: string;
  username: string;
  role: UserRole;
  exp: number;
}

export function generateToken(role: UserRole, username = "User"): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload: AuthPayload = {
    userId: `user-${role.toLowerCase()}`,
    username: `${role} User`,
    role,
    exp: Math.floor(Date.now() / 1000) + 86400 * 7, // 7 days expiration
  };
  const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${header}.${payloadEncoded}`)
    .digest("base64url");
  return `${header}.${payloadEncoded}.${signature}`;
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, payloadEncoded, signature] = parts;
    const expectedSig = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${header}.${payloadEncoded}`)
      .digest("base64url");
    if (signature !== expectedSig) return null;

    const payload: AuthPayload = JSON.parse(Buffer.from(payloadEncoded, "base64url").toString("utf-8"));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
