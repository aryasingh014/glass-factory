import dotenv from "dotenv";
dotenv.config();
import dns from "dns";
import type { MongoClient, Db } from "mongodb";
import { logger } from "./logger";

// Setting public DNS servers ensures reliable SRV resolution on Windows/ISP environments
try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch {
  // Ignore in environments where setting DNS servers is not permitted
}

let client: MongoClient | null = null;
let dbInstance: Db | null = null;
let isConnected = false;
let connectPromise: Promise<Db | null> | null = null;

const MONGODB_URI = process.env.MONGODB_URI || "";

/**
 * Determine the target database name based on the runtime environment.
 * Ensures local development and automated testing NEVER touch the live production database.
 */
export function getTargetDbName(): string {
  const isProd = process.env.NODE_ENV === "production";
  const configured = (process.env.MONGODB_DB_NAME || "").trim();

  if (isProd) {
    // In production (Render, Netlify, Cloud), enforce 'glass_production_erp'
    if (!configured || configured === "glass_production_dev") {
      return "glass_production_erp";
    }
    return configured;
  }

  // In development / local / test environments:
  // If configured to a dedicated test/dev DB, use it
  if (configured && configured !== "glass_production_erp") {
    return configured;
  }
  // Safeguard: even if .env has glass_production_erp, do not touch production locally
  // unless explicitly forced via ALLOW_LOCAL_PROD_DB="true"
  if (process.env.ALLOW_LOCAL_PROD_DB === "true") {
    return "glass_production_erp";
  }
  return "glass_production_dev";
}

/**
 * Get or initialize MongoDB database instance.
 */
export async function getMongoDb(): Promise<Db | null> {
  // Do not connect during static asset build or tests
  if (
    process.env.npm_lifecycle_event === "build" ||
    process.env.npm_lifecycle_event === "build:client" ||
    process.env.npm_lifecycle_event === "build:server" ||
    process.argv.includes("build") ||
    process.env.VITEST ||
    process.env.NODE_ENV === "test"
  ) {
    return null;
  }

  const uri = process.env.MONGODB_URI || MONGODB_URI;
  if (!uri || !uri.trim()) return null;
  if (dbInstance && isConnected) return dbInstance;
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        try {
          dns.setServers(["8.8.8.8", "1.1.1.1"]);
        } catch {}

        const { MongoClient } = await import("mongodb");
        client = new MongoClient(uri, {
          maxPoolSize: 10,
          serverSelectionTimeoutMS: 5000,
          connectTimeoutMS: 10000,
        });

        await client.connect();
        const targetDbName = getTargetDbName();
        dbInstance = client.db(targetDbName);
        isConnected = true;
        logger.info(`[MongoDB] Connected successfully to database: ${targetDbName} (env: ${process.env.NODE_ENV || "development"})`);
        return dbInstance;
      } catch (err: any) {
        if (attempt === 1) {
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }
        logger.error("[MongoDB] Connection error", { error: err?.message || String(err) });
        isConnected = false;
        return null;
      }
    }
    return null;
  })();

  return connectPromise;
}

export function isMongoActive(): boolean {
  return Boolean(process.env.MONGODB_URI && isConnected);
}

/**
 * Load production state from MongoDB Atlas
 */
export async function loadProductionFromMongo(): Promise<any | null> {
  try {
    const db = await getMongoDb();
    if (!db) return null;
    const col = db.collection("app_state");
    const doc = await col.findOne({ _id: "production_db" as any });
    if (!doc) return null;
    return doc;
  } catch (err: any) {
    logger.error("[MongoDB] Failed to load production state", { error: err?.message || String(err) });
    return null;
  }
}

/**
 * Save production state to MongoDB Atlas (debounced or immediate)
 */
export async function saveProductionToMongo(data: any): Promise<boolean> {
  try {
    const db = await getMongoDb();
    if (!db) return false;
    const col = db.collection("app_state");

    // Safeguard: Never overwrite remote production data with an empty state
    const incomingPiCount = Array.isArray(data.piDatabase) ? data.piDatabase.length : 0;
    const incomingGlassCount = Array.isArray(data.glassItemsDatabase) ? data.glassItemsDatabase.length : 0;
    if (incomingPiCount === 0 && incomingGlassCount === 0) {
      const existing = await col.findOne({ _id: "production_db" as any });
      if (existing && Array.isArray(existing.piDatabase) && existing.piDatabase.length > 0) {
        logger.warn("[MongoDB] Refusing to overwrite populated cloud database with empty in-memory state!");
        return false;
      }
    }

    await col.updateOne(
      { _id: "production_db" as any },
      {
        $set: {
          piDatabase: data.piDatabase || [],
          glassItemsDatabase: data.glassItemsDatabase || [],
          productionHistoryDatabase: data.productionHistoryDatabase || [],
          rejectDatabase: data.rejectDatabase || [],
          reworkDatabase: data.reworkDatabase || [],
          notificationsDatabase: data.notificationsDatabase || [],
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );
    return true;
  } catch (err: any) {
    logger.error("[MongoDB] Failed to save production state", { error: err?.message || String(err) });
    return false;
  }
}

/**
 * Load users from MongoDB Atlas
 */
export async function loadUsersFromMongo(): Promise<any[] | null> {
  try {
    const db = await getMongoDb();
    if (!db) return null;
    const col = db.collection("app_state");
    const doc = await col.findOne({ _id: "users_db" as any });
    if (!doc || !Array.isArray(doc.users) || doc.users.length === 0) return null;
    return doc.users;
  } catch (err: any) {
    logger.error("[MongoDB] Failed to load users", { error: err?.message || String(err) });
    return null;
  }
}

/**
 * Save users to MongoDB Atlas
 */
export async function saveUsersToMongo(users: any[]): Promise<boolean> {
  try {
    const db = await getMongoDb();
    if (!db) return false;
    const col = db.collection("app_state");

    // Safeguard: Never overwrite remote users with an empty list
    if (!Array.isArray(users) || users.length === 0) {
      logger.warn("[MongoDB] Refusing to overwrite cloud users with empty array!");
      return false;
    }

    await col.updateOne(
      { _id: "users_db" as any },
      {
        $set: {
          users,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );
    return true;
  } catch (err: any) {
    logger.error("[MongoDB] Failed to save users", { error: err?.message || String(err) });
    return false;
  }
}
