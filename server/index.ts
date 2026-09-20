import "dotenv/config";
import "./lib/env";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { UserRole } from "@shared/api";
import { generateToken, verifyToken } from "./lib/auth";
import { logger } from "./lib/logger";
import { handleGetPIs, handleGetPIDetails, handleDeletePI, handleReleasePI, loadDatabaseFromDisk } from "./routes/pi";
import {
  handleScanLookup,
  handleAdvanceStage,
  handlePairLamination,
  handlePairDgu,
  handlePairDlgu,
  handleAdvanceDlguLamination,
  handleRejectItem,
  handleReworkItem,
  handleExcelUpload,
  handleStickerUpload,
  handleCheckStickerDuplicates,
  handleGetDashboardStats,
  handleGetReports,
  handleGetNotifications,
  handleMarkAllNotificationsRead,
  handleMarkNotificationRead,
  handleDeleteNotification,
  handleClearAllNotifications,
  handleClearDatabase,
  handleEventsStream,
  handleCleanupDatabase,
  handleDeleteItems,
} from "./routes/production";

import { handleGetPerformanceAnalytics } from "./routes/analytics";
import { handleLogin, handleGetCurrentUser, handleLogout } from "./routes/auth";

export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    let role: UserRole | null = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const verified = verifyToken(token);
      if (verified) {
        role = verified.role;
        (req as any).user = verified;
      }
    }

    if (!role) {
      const userRoleHeader = req.headers["x-user-role"] as string;
      if (userRoleHeader === "Admin" || userRoleHeader === "Supervisor" || userRoleHeader === "Operator") {
        role = userRoleHeader;
      }
    }

    if (!role) {
      res.status(401).json({ error: "Unauthorized: Authentication token is required." });
      return;
    }

    if (!allowedRoles.includes(role)) {
      res.status(403).json({ error: `Forbidden: Action requires ${allowedRoles.join(" or ")} role.` });
      return;
    }
    next();
  };
}

interface RateLimitStore {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitStore>();

// Cleanup stale entries every 30 minutes to prevent memory leaks in long-running production
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap) {
    if (now > record.resetTime) rateLimitMap.delete(key);
  }
}, 30 * 60 * 1000);

function rateLimiter(options: { windowMs?: number; max?: number } = {}) {
  const windowMs = options.windowMs || 15 * 60 * 1000; // 15 mins
  // Production default: 5000 per 15 min window (~333/min)
  // Configurable via RATE_LIMIT_MAX env var for factory floor scaling
  const max = options.max || 5000;

  return (req: Request, res: Response, next: NextFunction) => {
    // Exempt SSE event stream connections from rate limiting
    if (req.path.endsWith("/production/events")) {
      return next();
    }

    const ip = (req.headers["x-forwarded-for"] as string) || req.ip || "127.0.0.1";
    const now = Date.now();
    let record = rateLimitMap.get(ip);

    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      rateLimitMap.set(ip, record);
    } else {
      record.count += 1;
    }

    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, max - record.count));
    res.setHeader("X-RateLimit-Reset", Math.ceil(record.resetTime / 1000));

    if (record.count > max) {
      res.status(429).json({
        error: "Too Many Requests",
        message: "Rate limit exceeded. Please try again later.",
      });
      return;
    }

    next();
  };
}

export function createServer() {
  loadDatabaseFromDisk(true);
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: true, limit: "25mb" }));
  const rateMax = parseInt(process.env.RATE_LIMIT_MAX || "", 10) || 5000;
  app.use(rateLimiter({ windowMs: 15 * 60 * 1000, max: rateMax }));

  // Security Headers Middleware (CSP, XSS, Clickjacking, MIME Sniffing)
  app.use((_req, res, next) => {
    // Content Security Policy — mitigates XSS including dangerouslySetInnerHTML usage
    res.setHeader("Content-Security-Policy", [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });

  // HTTP Request Logger Middleware
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      const durationMs = Date.now() - start;
      logger.info("HTTP Request", {
        method: req.method,
        url: req.originalUrl || req.url,
        status: res.statusCode,
        durationMs,
        ip: req.ip || req.headers["x-forwarded-for"],
      });
    });
    next();
  });

  // API Router (v1)
  const apiV1 = express.Router();

  // Health check endpoint
  apiV1.get("/ping", (_req, res) => {
    res.json({ message: "ping pong", version: "v1" });
  });

  // Auth endpoints
  apiV1.post("/auth/login", handleLogin);
  apiV1.get("/auth/me", handleGetCurrentUser);
  apiV1.post("/auth/logout", handleLogout);

  // PI endpoints
  apiV1.get("/pi", handleGetPIs);
  apiV1.get("/pi/:id", handleGetPIDetails);
  apiV1.delete("/pi/:id", requireRole(["Admin", "Supervisor"]), handleDeletePI);
  apiV1.post("/pi/:id/release", requireRole(["Admin", "Supervisor"]), handleReleasePI);

  // Production endpoints
  apiV1.post("/production/scan", handleScanLookup);
  apiV1.post("/production/stage-complete", handleAdvanceStage);
  apiV1.post("/production/pair-lamination", handlePairLamination);
  apiV1.post("/production/pair-dgu", handlePairDgu);
  apiV1.post("/production/pair-dlgu", handlePairDlgu);
  apiV1.post("/production/advance-dlgu-lamination", handleAdvanceDlguLamination);
  apiV1.post("/production/reject", handleRejectItem);
  apiV1.post("/production/rework", handleReworkItem);
  apiV1.post("/excel/upload", requireRole(["Admin", "Supervisor"]), handleExcelUpload);
  apiV1.post("/sticker/upload", requireRole(["Admin", "Supervisor"]), handleStickerUpload);
  apiV1.post("/sticker/check-duplicates", handleCheckStickerDuplicates);
  apiV1.get("/production/dashboard", handleGetDashboardStats);
  apiV1.get("/reports", handleGetReports);
  apiV1.get("/notifications", handleGetNotifications);
  apiV1.patch("/notifications/read-all", handleMarkAllNotificationsRead);
  apiV1.patch("/notifications/:id/read", handleMarkNotificationRead);
  apiV1.delete("/notifications/:id", handleDeleteNotification);
  apiV1.delete("/notifications", handleClearAllNotifications);
  apiV1.get("/analytics/performance", handleGetPerformanceAnalytics);
  apiV1.get("/production/events", handleEventsStream);
  apiV1.post("/production/clear-db", requireRole(["Admin"]), handleClearDatabase);
  apiV1.post("/production/cleanup", requireRole(["Admin"]), handleCleanupDatabase);
  apiV1.post("/production/delete-items", handleDeleteItems);
  apiV1.delete("/production/items", handleDeleteItems);

  // Mount API Router v1 on both /api/v1 (versioned) and /api (backward compatible)
  app.use("/api/v1", apiV1);
  app.use("/api", apiV1);

  // Global Error Handling Middleware
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    logger.error("Unhandled Server Exception", { error: err?.message || String(err), stack: err?.stack });
    const statusCode = typeof err.status === "number" ? err.status : typeof err.statusCode === "number" ? err.statusCode : 500;
    const message = err.message || "Internal Server Error";
    res.status(statusCode).json({ error: message });
  });

  return app;
}
