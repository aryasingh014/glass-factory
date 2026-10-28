import { RequestHandler } from "express";
import {
  findUserByUsernameOrEmail,
  validatePassword,
  getUserProfile,
  findUserById,
  createSession,
  updateSessionHeartbeat,
  getActiveSessionsList,
  revokeSession,
  getAllUserRecords,
  createUser,
  updateUser,
  deleteUser,
  updateUserLastLogin,
  ROLE_PERMISSIONS,
  getUserEffectivePermissions,
  updateUserPermission,
  resetUserPermissions,
  createPasswordResetOtp,
  verifyAndResetPassword,
} from "../lib/users";
import { generateUserToken, verifyToken } from "../lib/auth";
import {
  sendOtpEmail,
  sendNewUserWelcomeEmail,
  sendPasswordResetSuccessEmail,
  sendTestEmail,
  verifySmtpConnection,
} from "../lib/email";
import { logger } from "../lib/logger";
import { sanitizeString, broadcastUpdate } from "./production";
import { createAndBroadcastNotification } from "./pi";

/**
 * Real login handler validating username/email and password
 */
export const handleLogin: RequestHandler = (req, res) => {
  const { username, identifier, password, role } = req.body || {};
  const userIdentifier = sanitizeString(identifier || username || "", 100);
  const rawPassword = typeof password === "string" ? password : "";

  const ip = (req.headers["x-forwarded-for"] as string) || req.ip || "127.0.0.1";
  const userAgent = req.headers["user-agent"] || "Browser Client";

  if (!userIdentifier || !rawPassword) {
    res.status(400).json({ error: "Username or email and password are required." });
    return;
  }

  const user = findUserByUsernameOrEmail(userIdentifier);
  if (!user) {
    res.status(401).json({ error: "Invalid username or password. Please check your credentials." });
    return;
  }

  if (user.isActive === false) {
    res.status(403).json({ error: "Account is disabled. Please contact your system administrator." });
    return;
  }

  const isValid = validatePassword(user, rawPassword);
  if (!isValid) {
    res.status(401).json({ error: "Invalid username or password. Please check your credentials." });
    return;
  }

  const profile = getUserProfile(user);
  const session = createSession(profile, ip, userAgent);
  updateUserLastLogin(user.id);
  const token = generateUserToken(profile, session.sessionId);

  res.json({
    token,
    sessionId: session.sessionId,
    user: profile,
    role: profile.role,
    permissions: getUserEffectivePermissions(user),
    username: profile.username,
    name: profile.name,
    message: `Welcome back, ${profile.name}!`,
  });
};

/**
 * Get currently authenticated user profile & permissions
 */
export const handleGetCurrentUser: RequestHandler = (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized: Missing authentication token." });
    return;
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Unauthorized: Invalid or expired token." });
    return;
  }

  if (payload.sessionId) {
    updateSessionHeartbeat(payload.sessionId);
  }

  const user = findUserById(payload.userId) || findUserByUsernameOrEmail(payload.username);
  if (!user) {
    res.status(401).json({ error: "Unauthorized: User account has been removed or no longer exists." });
    return;
  }

  if (user.isActive === false) {
    res.status(403).json({ error: "Account is disabled. Please contact your system administrator." });
    return;
  }

  const profile = getUserProfile(user);
  res.json({
    user: profile,
    permissions: getUserEffectivePermissions(user),
  });
};

/**
 * Session Heartbeat - Keeps active user online in real time
 */
export const handleHeartbeat: RequestHandler = (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing token" });
    return;
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  const user = findUserById(payload.userId) || findUserByUsernameOrEmail(payload.username);
  if (!user || user.isActive === false) {
    if (payload.sessionId) revokeSession(payload.sessionId);
    res.status(401).json({ error: "Unauthorized: User account has been removed or deactivated." });
    return;
  }

  if (payload.sessionId) {
    updateSessionHeartbeat(payload.sessionId);
  }

  res.json({ success: true, timestamp: new Date().toISOString() });
};

/**
 * Logout handler - revokes session
 */
export const handleLogout: RequestHandler = (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    if (payload?.sessionId) {
      revokeSession(payload.sessionId);
    }
  }
  res.json({ message: "Logged out successfully" });
};

/**
 * Get all active sessions (Real-time monitoring)
 */
export const handleGetSessions: RequestHandler = (_req, res) => {
  const sessions = getActiveSessionsList();
  res.json({ sessions });
};

/**
 * Revoke specific session (Admin force disconnect)
 */
export const handleRevokeSession: RequestHandler = (req, res) => {
  const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
  if (!sessionId) {
    res.status(400).json({ error: "Session ID is required." });
    return;
  }
  const deleted = revokeSession(sessionId);
  res.json({ success: deleted, message: deleted ? "Session revoked" : "Session not found" });
};

/**
 * List all registered users
 */
export const handleGetUsers: RequestHandler = (_req, res) => {
  const users = getAllUserRecords();
  res.json({ users });
};

/**
 * Create a new user (Admin only)
 */
export const handleCreateUser: RequestHandler = async (req, res) => {
  const { username, email, name, role, password, assignedStages, sendEmail } = req.body || {};
  if (!username || !email || !name || !role || !password) {
    res.status(400).json({ error: "Username, email, name, role, and password are required." });
    return;
  }

  try {
    const newUser = createUser({
      username: sanitizeString(username, 50),
      email: sanitizeString(email, 100),
      name: sanitizeString(name, 100),
      role: role as any,
      assignedStages: Array.isArray(assignedStages) ? assignedStages : undefined,
      password: String(password),
    });

    // Send welcome email with login credentials via SMTP asynchronously
    let emailStatus: { sent: boolean; message?: string } = { sent: false };
    if (sendEmail !== false) {
      try {
        const hostHeader = req.get("host") || "localhost:8080";
        const protocol = req.protocol || "http";
        const appUrl = `${protocol}://${hostHeader}`;
        
        const emailResult = await sendNewUserWelcomeEmail({
          to: newUser.email,
          name: newUser.name,
          username: newUser.username,
          role: newUser.role,
          password: String(password),
          loginUrl: appUrl,
        });

        if (emailResult.success) {
          emailStatus = { sent: true, message: `Welcome email with credentials dispatched to ${newUser.email}` };
        } else {
          emailStatus = { sent: false, message: `User created, but email dispatch failed: ${emailResult.error}` };
        }
      } catch (mailErr: any) {
        logger.warn("Non-fatal email dispatch error during user creation", { error: mailErr?.message });
        emailStatus = { sent: false, message: mailErr?.message };
      }
    }

    res.status(201).json({
      user: newUser,
      message: `User '${newUser.name}' created successfully.`,
      emailStatus,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to create user." });
  }
};

/**
 * Initiate Forgot Password Request (Sends 6-digit OTP via SMTP)
 */
export const handleForgotPassword: RequestHandler = async (req, res) => {
  const { identifier } = req.body || {};
  const cleanId = sanitizeString(identifier || "", 100);

  if (!cleanId) {
    res.status(400).json({ error: "Please enter your username or registered email address." });
    return;
  }

  try {
    const { user, otp, expiresAt } = createPasswordResetOtp(cleanId);

    // Mask user email for privacy (e.g. g***20@gmail.com)
    const emailParts = user.email.split("@");
    const maskedUser =
      emailParts[0].length <= 3
        ? `${emailParts[0][0]}***`
        : `${emailParts[0][0]}***${emailParts[0].slice(-2)}`;
    const maskedEmail = `${maskedUser}@${emailParts[1]}`;

    // Dispatch OTP via SMTP email
    const emailRes = await sendOtpEmail({
      to: user.email,
      name: user.name,
      otp,
      role: user.role,
      expiryMinutes: 15,
    });

    if (!emailRes.success) {
      res.status(500).json({
        error: `Failed to deliver OTP to ${maskedEmail} via Gmail SMTP (${emailRes.error || "Bad Credentials"}). Please verify your Gmail App Password.`,
        emailDelivered: false,
        emailError: emailRes.error,
      });
      return;
    }

    res.json({
      success: true,
      message: `A 6-digit password reset OTP has been sent to ${maskedEmail}.`,
      maskedEmail,
      expiresAt: new Date(expiresAt).toISOString(),
      emailDelivered: true,
    });
  } catch (err: any) {
    logger.error("Forgot password request failed", { identifier: cleanId, error: err?.message });
    res.status(400).json({ error: err?.message || "Failed to process password reset request." });
  }
};

/**
 * Verify OTP and Set New Password
 */
export const handleVerifyResetOtp: RequestHandler = async (req, res) => {
  const { identifier, otp, newPassword } = req.body || {};
  const cleanId = sanitizeString(identifier || "", 100);
  const cleanOtp = sanitizeString(otp || "", 10);
  const rawPass = typeof newPassword === "string" ? newPassword : "";

  if (!cleanId || !cleanOtp || !rawPass) {
    res.status(400).json({ error: "Username/Email, OTP code, and new password are required." });
    return;
  }

  try {
    const result = verifyAndResetPassword(cleanId, cleanOtp, rawPass);

    // Send confirmation alert email in background
    sendPasswordResetSuccessEmail({
      to: result.user.email,
      name: result.user.name,
    }).catch((mailErr) => {
      logger.warn("Password reset confirmation email warning", { error: mailErr?.message });
    });

    res.json({
      success: true,
      message: "Your password has been reset successfully! You can now log in with your new password.",
    });
  } catch (err: any) {
    logger.warn("Verify OTP failed", { identifier: cleanId, error: err?.message });
    res.status(400).json({ error: err?.message || "Invalid or expired OTP code." });
  }
};

/**
 * Test SMTP Email Dispatch (Admin only)
 */
export const handleTestSmtp: RequestHandler = async (req, res) => {
  const { toEmail } = req.body || {};
  const targetEmail = sanitizeString(toEmail || "", 100) || "gauravraj778020@gmail.com";

  try {
    const result = await sendTestEmail(targetEmail);
    if (result.success) {
      res.json({
        success: true,
        message: `SMTP test email dispatched successfully to ${targetEmail}.`,
        messageId: result.messageId,
      });
    } else {
      res.status(500).json({
        success: false,
        error: `SMTP test failed: ${result.error}`,
      });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || "SMTP test execution error" });
  }
};

/**
 * Check SMTP Server Connectivity (Admin diagnostic)
 */
export const handleGetSmtpStatus: RequestHandler = async (_req, res) => {
  const result = await verifySmtpConnection();
  res.json({
    ...result,
    smtpUser: process.env.SMTP_USER || "novaaias014@gmail.com",
    smtpHost: process.env.SMTP_HOST || "smtp.gmail.com",
    smtpPort: process.env.SMTP_PORT || "465",
  });
};


/**
 * Update an existing user (Admin only)
 */
export const handleUpdateUser: RequestHandler = (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { username, email, name, role, password, assignedStages, isActive } = req.body || {};

  if (!id) {
    res.status(400).json({ error: "User ID is required." });
    return;
  }

  try {
    const updated = updateUser(id, {
      username: username ? sanitizeString(username, 50) : undefined,
      email: email ? sanitizeString(email, 100) : undefined,
      name: name ? sanitizeString(name, 100) : undefined,
      role: role as any,
      assignedStages: Array.isArray(assignedStages) ? assignedStages : undefined,
      password: password ? String(password) : undefined,
      isActive: typeof isActive === "boolean" ? isActive : undefined,
    });
    res.json({ user: updated, message: `User '${updated.name}' updated successfully.` });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to update user." });
  }
};

/**
 * Delete an existing user (Admin only)
 */
export const handleDeleteUser: RequestHandler = (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!id) {
    res.status(400).json({ error: "User ID is required." });
    return;
  }

  try {
    const deletedUser = deleteUser(id);
    if (!deletedUser) {
      res.status(404).json({ error: "User not found." });
      return;
    }

    broadcastUpdate("session_revoked", { userId: id, username: deletedUser.username });
    broadcastUpdate("user_deleted", { userId: id, username: deletedUser.username });
    createAndBroadcastNotification({
      title: "User Account Deleted",
      message: `User '${deletedUser.name}' (@${deletedUser.username}) has been permanently deleted by administrator.`,
      type: "warning",
      category: "SYSTEM",
    });

    res.json({ success: true, message: `User '${deletedUser.name}' deleted successfully.` });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to delete user." });
  }
};

/**
 * Get system role permissions matrix
 */
export const handleGetPermissions: RequestHandler = (_req, res) => {
  res.json({ permissions: ROLE_PERMISSIONS });
};

/**
 * Update role permissions matrix dynamically or customize specific user permissions (Admin only)
 */
export const handleUpdatePermissions: RequestHandler = (req, res) => {
  const { userId, resetUser, role, key, value, permissions } = req.body || {};

  // Case 1: Granular user-specific permission overrides
  if (userId) {
    try {
      if (resetUser) {
        const result = resetUserPermissions(userId);
        res.json({
          success: true,
          message: `Reset permissions to ${result.user.role} role defaults for ${result.user.name}.`,
          user: result.user,
          userPermissions: result.permissions,
          rolePermissions: ROLE_PERMISSIONS,
          permissions: ROLE_PERMISSIONS,
        });
        return;
      }

      if (key && typeof value === "boolean") {
        const result = updateUserPermission(userId, key, value);
        res.json({
          success: true,
          message: `Updated permission '${key}' for ${result.user.name}.`,
          user: result.user,
          userPermissions: result.permissions,
          rolePermissions: ROLE_PERMISSIONS,
          permissions: ROLE_PERMISSIONS,
        });
        return;
      }

      res.status(400).json({ error: "Invalid user permission update request." });
      return;
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Failed to update user permissions." });
      return;
    }
  }

  // Case 2: Base role-level permissions matrix
  if (!role || (role !== "Supervisor" && role !== "Operator")) {
    res.status(400).json({ error: "Only Supervisor and Operator permissions can be customized. Admin permissions are locked." });
    return;
  }

  if (permissions && typeof permissions === "object") {
    ROLE_PERMISSIONS[role] = {
      ...ROLE_PERMISSIONS[role],
      ...permissions,
      role,
    };
  } else if (key && typeof value === "boolean") {
    if (key.startsWith("module:")) {
      const moduleName = key.replace("module:", "");
      const current = ROLE_PERMISSIONS[role].allowedModules || [];
      if (value && !current.includes(moduleName)) {
        ROLE_PERMISSIONS[role].allowedModules = [...current, moduleName];
      } else if (!value) {
        ROLE_PERMISSIONS[role].allowedModules = current.filter((m) => m !== moduleName);
      }
    } else {
      (ROLE_PERMISSIONS[role] as any)[key] = value;
    }
  }

  res.json({
    success: true,
    message: `Updated RBAC permissions for ${role}`,
    permissions: ROLE_PERMISSIONS,
    rolePermissions: ROLE_PERMISSIONS,
  });
};

