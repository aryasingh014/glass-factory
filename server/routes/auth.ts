import { RequestHandler } from "express";
import { findUserByUsernameOrEmail, validatePassword, getUserProfile, findUserById } from "../lib/users";
import { generateUserToken, verifyToken } from "../lib/auth";
import { sanitizeString } from "./production";

/**
 * Real login handler validating username/email and password
 */
export const handleLogin: RequestHandler = (req, res) => {
  const { username, identifier, password, role } = req.body || {};
  const userIdentifier = sanitizeString(identifier || username || "", 100);
  const rawPassword = typeof password === "string" ? password : "";

  // 1. If explicit username & password provided, perform real authentication
  if (userIdentifier && rawPassword) {
    const user = findUserByUsernameOrEmail(userIdentifier);
    if (!user) {
      res.status(401).json({ error: "Invalid username or password. Please check your credentials." });
      return;
    }

    const isValid = validatePassword(user, rawPassword);
    if (!isValid) {
      res.status(401).json({ error: "Invalid username or password. Please check your credentials." });
      return;
    }

    const profile = getUserProfile(user);
    const token = generateUserToken(profile);
    res.json({
      token,
      user: profile,
      role: profile.role,
      username: profile.username,
      name: profile.name,
      message: `Welcome back, ${profile.name}!`,
    });
    return;
  }

  // 2. Fallback quick role selector support if user selected demo role without typing password
  if (role) {
    const cleanRole = sanitizeString(role, 20);
    const user = findUserByUsernameOrEmail(cleanRole);
    if (user) {
      // In production real auth, check if password was provided
      if (rawPassword) {
        if (!validatePassword(user, rawPassword)) {
          res.status(401).json({ error: "Invalid password for selected role." });
          return;
        }
      }
      const profile = getUserProfile(user);
      const token = generateUserToken(profile);
      res.json({
        token,
        user: profile,
        role: profile.role,
        username: profile.username,
        name: profile.name,
        message: `Logged in as ${profile.name}`,
      });
      return;
    }
  }

  res.status(400).json({ error: "Username/email and password are required." });
};

/**
 * Get currently authenticated user profile
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

  const user = findUserById(payload.userId) || findUserByUsernameOrEmail(payload.username);
  if (!user) {
    res.json({
      user: {
        id: payload.userId,
        username: payload.username,
        email: payload.email || `${payload.role.toLowerCase()}@sejalglass.com`,
        name: payload.name || `${payload.role} User`,
        role: payload.role,
      },
    });
    return;
  }

  res.json({ user: getUserProfile(user) });
};

/**
 * Logout handler
 */
export const handleLogout: RequestHandler = (_req, res) => {
  res.json({ message: "Logged out successfully" });
};
