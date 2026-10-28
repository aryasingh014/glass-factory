import crypto from "crypto";
import { UserRole, ProductionStage } from "@shared/api";
import { env } from "./env";
import { UserProfile, isUserRevoked } from "./users";

const JWT_SECRET = env.JWT_SECRET;

export interface AuthPayload {
  userId: string;
  username: string;
  email?: string;
  name?: string;
  role: UserRole;
  assignedStages?: ProductionStage[];
  sessionId?: string;
  exp: number;
}

export function generateToken(role: UserRole, username = "User", sessionId?: string): string {
  return generateUserToken(
    {
      id: `user-${role.toLowerCase()}`,
      username: username || `${role} User`,
      email: `${role.toLowerCase()}@sejalglass.com`,
      name: `${role} User`,
      role,
    },
    sessionId
  );
}

export function generateUserToken(user: UserProfile, sessionId?: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload: AuthPayload = {
    userId: user.id,
    username: user.username,
    email: user.email,
    name: user.name,
    role: user.role,
    assignedStages: user.assignedStages,
    sessionId: sessionId || `ses-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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
    if (isUserRevoked(payload.userId, payload.username)) return null;
    return payload;
  } catch {
    return null;
  }
}
