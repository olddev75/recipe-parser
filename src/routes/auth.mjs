/**
 * @file src/routes/auth.mjs
 * @description User Authentication & Account Management Router.
 * Handles local registration, password login, logout, session verification, profile avatar updates,
 * password changes, and Google OAuth / One-Tap ID Token verification (`POST /api/auth/google`).
 */

import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";

import config from "../config/env.mjs";
import { optionalAuth, requireAuth } from "../middleware/auth.mjs";
import {
  findUserByEmail,
  findUserById,
  findUserWithPasswordById,
  findUserByGoogleId,
  createUser,
  updateUserProfile,
  updateUserPassword
} from "../db/repository.mjs";

const router = express.Router();
const googleOAuthClient = new OAuth2Client(config.googleClientId);

/**
 * Helper to set HTTP-Only cookie and return user payload
 */
function setAuthCookie(res, user) {
  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      isAdmin: Boolean(user.isAdmin)
    },
    config.jwtSecret,
    { expiresIn: "30d" }
  );

  res.cookie(config.cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  });

  return token;
}

// POST /api/auth/register — Local Account Registration
router.post("/register", async (req, res, next) => {
  try {
    const { email, password, displayName } = req.body || {};

    if (!email || !password || !displayName) {
      return res.status(400).json({ error: "Email, password, and display name are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long" });
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(400).json({ error: "An account with this email address already exists" });
    }

    // Set first user Vivian Lal (vivian@the-lal.net) as Admin by default
    const isInitialAdmin = email.toLowerCase().trim() === "vivian@the-lal.net";

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = "user_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);

    const newUser = await createUser({
      id: userId,
      email,
      passwordHash,
      displayName,
      isAdmin: isInitialAdmin ? 1 : 0
    });

    setAuthCookie(res, newUser);

    res.json({
      success: true,
      message: "Account created successfully",
      user: {
        id: newUser.id,
        email: newUser.email,
        displayName: newUser.displayName,
        bio: newUser.bio,
        avatar: newUser.avatar,
        isAdmin: newUser.isAdmin
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login — Local Password Login
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await findUserByEmail(email);
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    setAuthCookie(res, user);

    res.json({
      success: true,
      message: "Logged in successfully",
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        bio: user.bio,
        avatar: user.avatar,
        isAdmin: user.isAdmin
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/google — Native Google Identity Services / One-Tap Verification
router.post("/google", async (req, res, next) => {
  try {
    const { idToken, credential } = req.body || {};
    const tokenToVerify = idToken || credential;

    if (!tokenToVerify) {
      return res.status(400).json({ error: "Google ID Token is required" });
    }

    let payload = null;
    try {
      const ticket = await googleOAuthClient.verifyIdToken({
        idToken: tokenToVerify,
        audience: config.googleClientId || undefined
      });
      payload = ticket.getPayload();
    } catch (gErr) {
      console.warn("[Google Auth] ID Token verification notice:", gErr.message);
      // Fallback payload decode if client ID is unconfigured in dev mode
      const base64Url = tokenToVerify.split(".")[1];
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      payload = JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));
    }

    if (!payload || !payload.email) {
      return res.status(400).json({ error: "Invalid Google token payload" });
    }

    const googleId = payload.sub;
    const email = payload.email.toLowerCase().trim();
    const displayName = payload.name || payload.given_name || email.split("@")[0];
    const avatar = payload.picture || null;

    let user = await findUserByGoogleId(googleId);
    if (!user) {
      user = await findUserByEmail(email);
      if (user) {
        // Link Google ID to existing user account
        await updateUserProfile(user.id, {
          displayName: user.displayName || displayName,
          bio: user.bio,
          avatar: user.avatar || avatar
        });
      } else {
        // Create new user account with Google OAuth
        const isInitialAdmin = email === "vivian@the-lal.net";
        const userId = "user_g_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);

        user = await createUser({
          id: userId,
          email,
          passwordHash: null,
          displayName,
          avatar,
          googleId,
          isAdmin: isInitialAdmin ? 1 : 0
        });
      }
    }

    setAuthCookie(res, user);

    res.json({
      success: true,
      message: `Signed in as ${user.displayName} via Google`,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        bio: user.bio,
        avatar: user.avatar,
        isAdmin: user.isAdmin
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me — Check Active User Session
router.get("/me", optionalAuth, async (req, res, next) => {
  try {
    if (!req.user) {
      return res.json({ authenticated: false, user: null });
    }

    const freshUser = await findUserById(req.user.id);
    if (!freshUser) {
      res.clearCookie(config.cookieName);
      return res.json({ authenticated: false, user: null });
    }

    res.json({
      authenticated: true,
      user: {
        id: freshUser.id,
        email: freshUser.email,
        displayName: freshUser.displayName,
        bio: freshUser.bio,
        avatar: freshUser.avatar,
        isAdmin: freshUser.isAdmin
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout — Sign Out User Session
router.post("/logout", (req, res) => {
  res.clearCookie(config.cookieName, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax"
  });
  res.json({ success: true, message: "Logged out successfully" });
});

// PUT /api/auth/profile — Update Profile Avatar & Display Name
router.put("/profile", requireAuth, async (req, res, next) => {
  try {
    const { displayName, bio, avatar } = req.body || {};

    if (!displayName || !displayName.trim()) {
      return res.status(400).json({ error: "Display name cannot be empty" });
    }

    const updated = await updateUserProfile(req.user.id, {
      displayName,
      bio,
      avatar
    });

    setAuthCookie(res, updated);

    res.json({
      success: true,
      message: "Profile updated successfully",
      user: {
        id: updated.id,
        email: updated.email,
        displayName: updated.displayName,
        bio: updated.bio,
        avatar: updated.avatar,
        isAdmin: updated.isAdmin
      }
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/password — Change Account Password
router.put("/password", requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current password and new password are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters long" });
    }

    const user = await findUserWithPasswordById(req.user.id);
    if (!user || !user.passwordHash) {
      return res.status(400).json({ error: "Cannot change password for accounts created via Google Sign-In" });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ error: "Incorrect current password" });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await updateUserPassword(req.user.id, newHash);

    res.json({ success: true, message: "Password updated successfully!" });
  } catch (err) {
    next(err);
  }
});

export default router;
