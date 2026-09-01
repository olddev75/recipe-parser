/**
 * @file src/middleware/auth.mjs
 * @description Authentication & Access Authorization Middleware Module.
 * Parses JWT tokens from HTTP-Only cookies (`recipe_deck_auth`) or Authorization headers,
 * verifying user identity and providing optionalAuth, requireAuth, and requireAdmin guards.
 *
 * Exports: optionalAuth, requireAuth, requireAdmin
 */

import jwt from "jsonwebtoken";
import config from "../config/env.mjs";

/**
 * Extracts JWT token string from HTTP cookies or Authorization header.
 * @param {import("express").Request} req 
 * @returns {string|null}
 */
function extractToken(req) {
  if (req.cookies && req.cookies[config.cookieName]) {
    return req.cookies[config.cookieName];
  }
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
    return req.headers.authorization.slice(7).trim();
  }
  return null;
}

/**
 * Middleware: Attaches user object to `req.user` if valid JWT token present, otherwise null.
 */
export function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded;
  } catch (err) {
    req.user = null;
  }
  next();
}

/**
 * Middleware: Requires authenticated user session. Rejects with 401 Unauthorized if missing/invalid.
 */
export function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: "Authentication required. Please sign in." });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Session expired or invalid token. Please sign in again." });
  }
}

/**
 * Middleware: Requires authenticated user session with admin privileges (`isAdmin === true`).
 */
export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user && req.user.isAdmin) {
      return next();
    }
    return res.status(403).json({ error: "Forbidden: Administrator privileges required." });
  });
}

export default { optionalAuth, requireAuth, requireAdmin };
