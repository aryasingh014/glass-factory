import crypto from "crypto";
import fs from "fs";
import path from "path";
import { UserRole, UserRecord, UserSession, RolePermissions, ProductionStage } from "@shared/api";
import { logger } from "./logger";
import { loadUsersFromMongo, saveUsersToMongo } from "./mongodb";

export interface User {
  id: string;
  username: string;
  email: string;
  name: string;
  role: UserRole;
  assignedStages?: ProductionStage[];
  customPermissions?: Partial<RolePermissions>;
  passwordHash: string;
  salt: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  name: string;
  role: UserRole;
  assignedStages?: ProductionStage[];
  customPermissions?: Partial<RolePermissions>;
}

const DATA_DIR = path.resolve(process.cwd(), "server/data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

/**
 * Hash password with salt using PBKDF2
 */
export function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")): { hash: string; salt: string } {
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
  return { hash, salt };
}

/**
 * Validate password against user's stored salt and hash
 */
export function validatePassword(user: User, passwordAttempt: string): boolean {
  if (!user || !user.passwordHash || !user.salt || !passwordAttempt) return false;
  try {
    const hashAttempt = crypto.pbkdf2Sync(passwordAttempt, user.salt, 1000, 64, "sha512").toString("hex");
    return crypto.timingSafeEqual(Buffer.from(user.passwordHash), Buffer.from(hashAttempt));
  } catch {
    return false;
  }
}

// Initial pre-seeded credentials for Admin, Supervisor, and Workstation Operators
const adminCreds = hashPassword("Admin@123");
const supervisorCreds = hashPassword("Supervisor@123");
const cuttingCreds = hashPassword("Cutting@123");
const polishingCreds = hashPassword("Polish@123");
const dguCreds = hashPassword("Dgu@123");
const laminationCreds = hashPassword("Lami@123");
const dispatchCreds = hashPassword("Dispatch@123");

const DEFAULT_USERS: User[] = [
  {
    id: "usr-admin-01",
    username: "admin",
    email: "gauravraj77820@gmail.com",
    name: "Gaurav Kumar (Administrator)",
    role: "Admin",
    assignedStages: ["Cutting", "Polishing", "Pairing", "DGU", "Lamination", "Finished", "Dispatched"],
    passwordHash: adminCreds.hash,
    salt: adminCreds.salt,
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "usr-supervisor-01",
    username: "supervisor",
    email: "supervisor@sejalglass.com",
    name: "Rajesh Sharma (Plant Supervisor)",
    role: "Supervisor",
    assignedStages: ["Cutting", "Polishing", "Pairing", "DGU", "Lamination", "Finished", "Dispatched"],
    passwordHash: supervisorCreds.hash,
    salt: supervisorCreds.salt,
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "usr-op-cutting-01",
    username: "op_cutting",
    email: "cutting@sejalglass.com",
    name: "Deepa K (Cutting & Pairing Operator)",
    role: "Operator",
    assignedStages: ["Cutting", "Pairing"],
    passwordHash: cuttingCreds.hash,
    salt: cuttingCreds.salt,
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "usr-op-polishing-01",
    username: "op_polishing",
    email: "polishing@sejalglass.com",
    name: "Manoj Verma (Edge Polishing Operator)",
    role: "Operator",
    assignedStages: ["Polishing"],
    passwordHash: polishingCreds.hash,
    salt: polishingCreds.salt,
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "usr-op-dgu-01",
    username: "op_dgu",
    email: "dgu@sejalglass.com",
    name: "Suresh Patel (DGU Assembly Operator)",
    role: "Operator",
    assignedStages: ["DGU"],
    passwordHash: dguCreds.hash,
    salt: dguCreds.salt,
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "usr-op-lamination-01",
    username: "op_lamination",
    email: "lamination@sejalglass.com",
    name: "Kiran Rathore (Lamination Autoclave Operator)",
    role: "Operator",
    assignedStages: ["Lamination"],
    passwordHash: laminationCreds.hash,
    salt: laminationCreds.salt,
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "usr-op-dispatch-01",
    username: "op_dispatch",
    email: "dispatch@sejalglass.com",
    name: "Amit Kumar (Warehouse & Dispatch Operator)",
    role: "Operator",
    assignedStages: ["Finished", "Dispatched"],
    passwordHash: dispatchCreds.hash,
    salt: dispatchCreds.salt,
    isActive: true,
    createdAt: new Date().toISOString(),
  },
];

export const usersDatabase: User[] = [...DEFAULT_USERS];

// Load users from disk
export function loadUsersFromDisk(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(USERS_FILE)) {
      const content = fs.readFileSync(USERS_FILE, "utf-8");
      if (content.trim()) {
        const loaded: User[] = JSON.parse(content);
        if (Array.isArray(loaded) && loaded.length > 0) {
          const cleaned = [...loaded];

          // Ensure default Admin, Supervisor, and Stage Operator users exist and have assigned stages
          for (const def of DEFAULT_USERS) {
            const exists = cleaned.find(
              (u) => u.username.toLowerCase() === def.username.toLowerCase() || u.id === def.id
            );
            if (!exists) {
              cleaned.push(def);
            } else if (def.assignedStages && (!exists.assignedStages || exists.assignedStages.length === 0)) {
              exists.assignedStages = def.assignedStages;
            }
          }
          usersDatabase.splice(0, usersDatabase.length, ...cleaned);
          saveUsersToDisk();
          logger.info(`Loaded ${usersDatabase.length} users from disk.`);
          return;
        }
      }
    }
    // If not found or empty, save defaults
    saveUsersToDisk();
  } catch (err) {
    logger.error("Error loading users from disk", { err });
  }
}

export function saveUsersToDisk(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tempFile = `${USERS_FILE}.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
    const serialized = JSON.stringify(usersDatabase, null, 2);
    try {
      fs.writeFileSync(tempFile, serialized, "utf-8");
      fs.renameSync(tempFile, USERS_FILE);
    } catch {
      // Fallback for Windows file locks
      fs.writeFileSync(USERS_FILE, serialized, "utf-8");
      try {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      } catch {}
    }

    // Also persist to MongoDB Atlas in background
    saveUsersToMongo(usersDatabase).catch((err) => {
      logger.error("[MongoDB] Failed to async save users to MongoDB Atlas", { error: err?.message || String(err) });
    });
  } catch (err) {
    logger.error("Error saving users to disk", { err });
  }
}

/**
 * Synchronize users with MongoDB Atlas
 */
export async function syncUsersWithMongo(): Promise<void> {
  try {
    const mongoUsers = await loadUsersFromMongo();
    if (mongoUsers && Array.isArray(mongoUsers) && mongoUsers.length > 0) {
      usersDatabase.splice(0, usersDatabase.length, ...mongoUsers);
      saveUsersToDisk();
      logger.info(`[MongoDB] Successfully loaded ${usersDatabase.length} users from MongoDB Atlas.`);
    } else if (usersDatabase.length > 0) {
      const saved = await saveUsersToMongo(usersDatabase);
      if (saved) {
        logger.info(`[MongoDB] Seeded MongoDB Atlas with ${usersDatabase.length} users.`);
      }
    }
  } catch (err: any) {
    logger.error("[MongoDB] Error syncing users with MongoDB", { error: err?.message || String(err) });
  }
}

// Initialize users on load
loadUsersFromDisk();

// ─── Real-Time Session Store ──────────────────────────────────────────────────
export const activeSessions = new Map<string, UserSession>();

/**
 * Register a new active session
 */
export function createSession(user: UserProfile, ip: string, userAgent?: string): UserSession {
  const sessionId = `ses-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const now = new Date().toISOString();
  const session: UserSession = {
    sessionId,
    userId: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    assignedStages: user.assignedStages,
    ip: ip || "127.0.0.1",
    userAgent: userAgent || "Browser Client",
    loginTime: now,
    lastHeartbeat: now,
    status: "Active",
  };
  activeSessions.set(sessionId, session);
  return session;
}

/**
 * Update session heartbeat
 */
export function updateSessionHeartbeat(sessionId: string): boolean {
  const session = activeSessions.get(sessionId);
  if (!session) return false;
  session.lastHeartbeat = new Date().toISOString();
  session.status = "Active";
  return true;
}

/**
 * Get all active sessions with dynamic status calculation
 */
export function getActiveSessionsList(): UserSession[] {
  const now = Date.now();
  const list: UserSession[] = [];
  for (const session of activeSessions.values()) {
    const diffMs = now - new Date(session.lastHeartbeat).getTime();
    // If heartbeat older than 24 hours, prune it
    if (diffMs > 24 * 60 * 60 * 1000) {
      activeSessions.delete(session.sessionId);
      continue;
    }
    const status = diffMs > 3 * 60 * 1000 ? "Idle" : "Active";
    list.push({
      ...session,
      status,
    });
  }
  return list.sort((a, b) => new Date(b.lastHeartbeat).getTime() - new Date(a.lastHeartbeat).getTime());
}

/**
 * Revoke/Delete session
 */
export function revokeSession(sessionId: string): boolean {
  return activeSessions.delete(sessionId);
}

// ─── User Query & Mutation Functions ──────────────────────────────────────────

export function findUserByUsernameOrEmail(identifier: string): User | undefined {
  if (!identifier) return undefined;
  const clean = identifier.trim().toLowerCase();
  return usersDatabase.find(
    (u) => u.username.toLowerCase() === clean || u.email.toLowerCase() === clean
  );
}

export function findUserById(id: string): User | undefined {
  return usersDatabase.find((u) => u.id === id);
}

export function getUserProfile(user: User): UserProfile {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    name: user.name,
    role: user.role,
    assignedStages: user.assignedStages,
    customPermissions: user.customPermissions,
  };
}

export function getAllUserRecords(): UserRecord[] {
  return usersDatabase.map((u) => ({
    id: u.id,
    username: u.username,
    email: u.email,
    name: u.name,
    role: u.role,
    assignedStages: u.assignedStages,
    customPermissions: u.customPermissions,
    isActive: u.isActive !== false,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
  }));
}

export function getUserEffectivePermissions(user: User): RolePermissions {
  const base = ROLE_PERMISSIONS[user.role] || ROLE_PERMISSIONS.Operator;
  if (!user.customPermissions) return base;

  return {
    ...base,
    ...user.customPermissions,
    allowedModules: Array.isArray(user.customPermissions.allowedModules)
      ? user.customPermissions.allowedModules
      : base.allowedModules,
    role: user.role,
  };
}

export function createUser(data: {
  username: string;
  email: string;
  name: string;
  role: UserRole;
  assignedStages?: ProductionStage[];
  password: string;
}): UserRecord {
  const existing = findUserByUsernameOrEmail(data.username) || findUserByUsernameOrEmail(data.email);
  if (existing) {
    throw new Error(`A user with username '${data.username}' or email '${data.email}' already exists.`);
  }

  const { hash, salt } = hashPassword(data.password || "Password@123");
  const newUser: User = {
    id: `usr-${data.role.toLowerCase()}-${Date.now().toString(36)}`,
    username: data.username.trim().toLowerCase(),
    email: data.email.trim().toLowerCase(),
    name: data.name.trim(),
    role: data.role,
    assignedStages: data.assignedStages,
    passwordHash: hash,
    salt,
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  usersDatabase.push(newUser);
  saveUsersToDisk();

  return {
    id: newUser.id,
    username: newUser.username,
    email: newUser.email,
    name: newUser.name,
    role: newUser.role,
    assignedStages: newUser.assignedStages,
    isActive: newUser.isActive,
    createdAt: newUser.createdAt,
  };
}

export function updateUser(
  id: string,
  updates: Partial<{
    username: string;
    email: string;
    name: string;
    role: UserRole;
    assignedStages?: ProductionStage[];
    customPermissions?: Partial<RolePermissions> | null;
    password?: string;
    isActive?: boolean;
  }>
): UserRecord {
  const user = findUserById(id);
  if (!user) {
    throw new Error("User not found");
  }

  if (updates.username && updates.username.toLowerCase() !== user.username.toLowerCase()) {
    const existing = findUserByUsernameOrEmail(updates.username);
    if (existing && existing.id !== id) {
      throw new Error(`Username '${updates.username}' is already in use.`);
    }
    user.username = updates.username.trim().toLowerCase();
  }

  if (updates.email && updates.email.toLowerCase() !== user.email.toLowerCase()) {
    const existing = findUserByUsernameOrEmail(updates.email);
    if (existing && existing.id !== id) {
      throw new Error(`Email '${updates.email}' is already in use.`);
    }
    user.email = updates.email.trim().toLowerCase();
  }

  if (updates.name) user.name = updates.name.trim();
  if (updates.role) user.role = updates.role;
  if (updates.assignedStages) user.assignedStages = updates.assignedStages;
  if (typeof updates.isActive === "boolean") user.isActive = updates.isActive;
  if (updates.customPermissions !== undefined) {
    if (updates.customPermissions === null) {
      delete user.customPermissions;
    } else {
      user.customPermissions = updates.customPermissions;
    }
  }

  if (updates.password && updates.password.trim().length > 0) {
    const { hash, salt } = hashPassword(updates.password.trim());
    user.passwordHash = hash;
    user.salt = salt;
  }

  saveUsersToDisk();

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    name: user.name,
    role: user.role,
    assignedStages: user.assignedStages,
    customPermissions: user.customPermissions,
    isActive: user.isActive,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

export function updateUserPermission(userId: string, key: string, value: boolean): { user: UserRecord; permissions: RolePermissions } {
  const user = findUserById(userId);
  if (!user) throw new Error("User not found.");

  const base = ROLE_PERMISSIONS[user.role] || ROLE_PERMISSIONS.Operator;
  if (!user.customPermissions) {
    user.customPermissions = {
      ...base,
      allowedModules: [...(base.allowedModules || [])],
    };
  }

  if (key.startsWith("module:")) {
    const moduleName = key.replace("module:", "");
    const current = user.customPermissions.allowedModules ? [...user.customPermissions.allowedModules] : [...(base.allowedModules || [])];
    if (value && !current.includes(moduleName)) {
      current.push(moduleName);
    } else if (!value) {
      const idx = current.indexOf(moduleName);
      if (idx > -1) current.splice(idx, 1);
    }
    user.customPermissions.allowedModules = current;

    // Sync assignedStages if a workstation module is toggled
    const stageMap: Record<string, ProductionStage> = {
      cutting: "Cutting",
      polishing: "Polishing",
      pairing: "Pairing",
      dgu: "DGU",
      lamination: "Lamination",
      finished: "Finished",
    };
    if (stageMap[moduleName]) {
      const stg = stageMap[moduleName];
      const stages = new Set(user.assignedStages || []);
      if (value) stages.add(stg);
      else stages.delete(stg);
      user.assignedStages = Array.from(stages);
    }
  } else {
    (user.customPermissions as any)[key] = value;
    if (key === "canDispatch") {
      const stages = new Set(user.assignedStages || []);
      if (value) {
        stages.add("Finished");
        stages.add("Dispatched");
      } else {
        stages.delete("Finished");
        stages.delete("Dispatched");
      }
      user.assignedStages = Array.from(stages);
    }
  }

  saveUsersToDisk();

  const effective = getUserEffectivePermissions(user);
  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role,
      assignedStages: user.assignedStages,
      customPermissions: user.customPermissions,
      isActive: user.isActive !== false,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    },
    permissions: effective,
  };
}

export function resetUserPermissions(userId: string): { user: UserRecord; permissions: RolePermissions } {
  const user = findUserById(userId);
  if (!user) throw new Error("User not found.");

  delete user.customPermissions;
  saveUsersToDisk();

  const effective = getUserEffectivePermissions(user);
  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role,
      assignedStages: user.assignedStages,
      customPermissions: undefined,
      isActive: user.isActive !== false,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    },
    permissions: effective,
  };
}

export function deleteUser(id: string): boolean {
  const index = usersDatabase.findIndex((u) => u.id === id);
  if (index === -1) return false;

  const userToDelete = usersDatabase[index];
  if (userToDelete.role === "Admin") {
    const adminCount = usersDatabase.filter((u) => u.role === "Admin").length;
    if (adminCount <= 1) {
      throw new Error("Cannot delete the only remaining Administrator account.");
    }
  }

  usersDatabase.splice(index, 1);
  saveUsersToDisk();
  return true;
}

export function updateUserLastLogin(id: string): void {
  const user = findUserById(id);
  if (user) {
    user.lastLoginAt = new Date().toISOString();
    saveUsersToDisk();
  }
}

// ─── Role Permissions Matrix ──────────────────────────────────────────────────
export const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  Admin: {
    role: "Admin",
    description: "Full system access including user administration, master database cleanup, sticker uploads, and configuration.",
    allowedModules: [
      "overview",
      "production-overview",
      "dispatched-history",
      "pis",
      "cutting",
      "polishing",
      "pairing",
      "dgu",
      "lamination",
      "finished",
      "reports",
      "analytics",
      "settings",
    ],
    canUploadPI: true,
    canDeletePI: true,
    canDispatch: true,
    canRejectRework: true,
    canViewReports: true,
    canViewAnalytics: true,
    canManageUsers: true,
    canManageSettings: true,
    canClearData: true,
    canCameraScan: true,
    canPrintStickers: true,
    canScanLookup: true,
    canUndoStageAdvance: true,
    canCreateManualPI: true,
    canViewPIDocuments: true,
    canExportReports: true,
  },
  Supervisor: {
    role: "Supervisor",
    description: "Plant management access for PI tracking, workstation routing, batch exports, quality rejects/reworks, and analytics.",
    allowedModules: [
      "overview",
      "production-overview",
      "dispatched-history",
      "pis",
      "cutting",
      "polishing",
      "pairing",
      "dgu",
      "lamination",
      "finished",
      "reports",
      "analytics",
    ],
    canUploadPI: true,
    canDeletePI: true,
    canDispatch: true,
    canRejectRework: true,
    canViewReports: true,
    canViewAnalytics: true,
    canManageUsers: false,
    canManageSettings: false,
    canClearData: false,
    canCameraScan: true,
    canPrintStickers: true,
    canScanLookup: true,
    canUndoStageAdvance: true,
    canCreateManualPI: true,
    canViewPIDocuments: true,
    canExportReports: true,
  },
  Operator: {
    role: "Operator",
    description: "Workstation scan-and-advance access for factory floor lines (Cutting, Polishing, Pairing, DGU, Lamination, Finished Warehouse).",
    allowedModules: [
      "cutting",
      "polishing",
      "pairing",
      "dgu",
      "lamination",
      "finished",
    ],
    canUploadPI: false,
    canDeletePI: false,
    canDispatch: true,
    canRejectRework: true,
    canViewReports: false,
    canViewAnalytics: false,
    canManageUsers: false,
    canManageSettings: false,
    canClearData: false,
    canCameraScan: true,
    canPrintStickers: true,
    canScanLookup: true,
    canUndoStageAdvance: false,
    canCreateManualPI: false,
    canViewPIDocuments: false,
    canExportReports: false,
  },
};

// ─── Password Reset OTP Store ────────────────────────────────────────────────
interface PasswordResetEntry {
  identifier: string;
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  otp: string;
  expiresAt: number;
  attempts: number;
}

const passwordResetStore = new Map<string, PasswordResetEntry>();

/**
 * Generate a 6-digit numeric OTP code for Password Reset
 */
export function createPasswordResetOtp(identifier: string): { user: User; otp: string; expiresAt: number } {
  const user = findUserByUsernameOrEmail(identifier);
  if (!user) {
    throw new Error("No account found matching this username or email address.");
  }

  if (user.isActive === false) {
    throw new Error("This account is currently disabled. Please contact your system administrator.");
  }

  // Generate 6 digit secure random numeric OTP
  const randomNum = crypto.randomInt(100000, 999999);
  const otp = String(randomNum);
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 mins

  const entry: PasswordResetEntry = {
    identifier: identifier.trim().toLowerCase(),
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    otp,
    expiresAt,
    attempts: 0,
  };

  // Store by lowercased email and username
  passwordResetStore.set(user.email.toLowerCase(), entry);
  passwordResetStore.set(user.username.toLowerCase(), entry);

  logger.info(`Generated password reset OTP for ${user.username} (${user.email})`, {
    userId: user.id,
    expiresAt: new Date(expiresAt).toISOString(),
  });

  return { user, otp, expiresAt };
}

/**
 * Verify OTP and update password
 */
export function verifyAndResetPassword(
  identifier: string,
  otp: string,
  newPassword: string
): { success: boolean; user: User; message: string } {
  if (!identifier || !otp || !newPassword) {
    throw new Error("Identifier, OTP code, and new password are required.");
  }

  if (newPassword.length < 6) {
    throw new Error("Password must be at least 6 characters long.");
  }

  const cleanKey = identifier.trim().toLowerCase();
  const entry = passwordResetStore.get(cleanKey);

  if (!entry) {
    throw new Error("No active password reset request found. Please request a new OTP code.");
  }

  if (Date.now() > entry.expiresAt) {
    passwordResetStore.delete(entry.email.toLowerCase());
    passwordResetStore.delete(entry.identifier);
    throw new Error("OTP code has expired. Please request a new OTP code.");
  }

  if (entry.attempts >= 5) {
    passwordResetStore.delete(entry.email.toLowerCase());
    passwordResetStore.delete(entry.identifier);
    throw new Error("Too many invalid attempts. Please request a new OTP code for security.");
  }

  if (entry.otp !== otp.trim()) {
    entry.attempts += 1;
    throw new Error(`Invalid OTP code. Please verify the 6-digit code sent to your email. (${5 - entry.attempts} attempts remaining)`);
  }

  // OTP verified! Update user password
  const user = findUserById(entry.userId);
  if (!user) {
    throw new Error("User record not found.");
  }

  const { hash, salt } = hashPassword(newPassword.trim());
  user.passwordHash = hash;
  user.salt = salt;
  saveUsersToDisk();

  // Clean up used OTP
  passwordResetStore.delete(entry.email.toLowerCase());
  passwordResetStore.delete(entry.identifier);

  logger.info(`Password successfully reset for user ${user.username} (${user.email})`);

  return {
    success: true,
    user,
    message: "Password has been reset successfully. You can now login with your new credentials.",
  };
}

