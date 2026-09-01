/**
 * @file src/routes/admin.mjs
 * @description Administrator User Privilege Router for Recipe Deck V2.0.
 * Endpoints for listing all user accounts (`GET /api/admin/users`)
 * and toggling admin privileges (`PUT /api/admin/users/:id/role`). Protected by requireAdmin middleware.
 */

import express from "express";
import { requireAdmin } from "../middleware/auth.mjs";
import { getAllUsers, findUserById, setUserAdminRole } from "../db/repository.mjs";

const router = express.Router();

// GET /api/admin/users — List all registered users (Admin Only)
router.get("/users", requireAdmin, async (req, res, next) => {
  try {
    const users = await getAllUsers();
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/users/:id/role — Toggle or grant/revoke admin rights (Admin Only)
router.put("/users/:id/role", requireAdmin, async (req, res, next) => {
  try {
    const targetUserId = req.params.id;
    const { isAdmin } = req.body || {};

    const targetUser = await findUserById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: "User account not found" });
    }

    const updated = await setUserAdminRole(targetUserId, Boolean(isAdmin));
    res.json({
      success: true,
      message: `Updated ${updated.displayName} admin privileges`,
      user: updated
    });
  } catch (err) {
    next(err);
  }
});

export default router;
