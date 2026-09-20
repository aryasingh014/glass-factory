import crypto from "crypto";
import { UserRole } from "@shared/api";

export interface User {
  id: string;
  username: string;
  email: string;
  name: string;
  role: UserRole;
  passwordHash: string;
  salt: string;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  name: string;
  role: UserRole;
}

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
  const hashAttempt = crypto.pbkdf2Sync(passwordAttempt, user.salt, 1000, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(user.passwordHash), Buffer.from(hashAttempt));
}

// Pre-seeded users for the 3 roles
const adminCreds = hashPassword("Admin@123");
const supervisorCreds = hashPassword("Supervisor@123");
const operatorCreds = hashPassword("Operator@123");

export const usersDatabase: User[] = [
  {
    id: "usr-admin-01",
    username: "admin",
    email: "admin@sejalglass.com",
    name: "System Administrator",
    role: "Admin",
    passwordHash: adminCreds.hash,
    salt: adminCreds.salt,
    createdAt: new Date().toISOString(),
  },
  {
    id: "usr-supervisor-01",
    username: "supervisor",
    email: "supervisor@sejalglass.com",
    name: "Production Supervisor",
    role: "Supervisor",
    passwordHash: supervisorCreds.hash,
    salt: supervisorCreds.salt,
    createdAt: new Date().toISOString(),
  },
  {
    id: "usr-operator-01",
    username: "operator",
    email: "operator@sejalglass.com",
    name: "Shop Floor Operator",
    role: "Operator",
    passwordHash: operatorCreds.hash,
    salt: operatorCreds.salt,
    createdAt: new Date().toISOString(),
  },
];

/**
 * Find user by username or email (case-insensitive)
 */
export function findUserByUsernameOrEmail(identifier: string): User | undefined {
  if (!identifier) return undefined;
  const clean = identifier.trim().toLowerCase();
  return usersDatabase.find(
    (u) => u.username.toLowerCase() === clean || u.email.toLowerCase() === clean
  );
}

/**
 * Find user by ID
 */
export function findUserById(id: string): User | undefined {
  return usersDatabase.find((u) => u.id === id);
}

/**
 * Strip sensitive info from User object
 */
export function getUserProfile(user: User): UserProfile {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}
