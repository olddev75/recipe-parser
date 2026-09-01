/**
 * @file src/routes/comments.mjs
 * @description Recipe Discussion Comments API Router for Recipe Deck V2.0.
 * Handles fetching, posting, and deleting comments/cooking notes on recipes.
 */

import express from "express";
import { optionalAuth, requireAuth } from "../middleware/auth.mjs";
import {
  getCommentsByRecipeId,
  createComment,
  deleteComment,
  getRecipeById
} from "../db/repository.mjs";

const router = express.Router({ mergeParams: true });

// GET /api/recipes/:id/comments — Fetch comments for a recipe
router.get("/:id/comments", optionalAuth, async (req, res, next) => {
  try {
    const recipeId = parseInt(req.params.id, 10);
    const comments = await getCommentsByRecipeId(recipeId);
    res.json({ comments });
  } catch (err) {
    next(err);
  }
});

// POST /api/recipes/:id/comments — Add a new comment
router.post("/:id/comments", requireAuth, async (req, res, next) => {
  try {
    const recipeId = parseInt(req.params.id, 10);
    const { comment } = req.body || {};

    if (!comment || !comment.trim()) {
      return res.status(400).json({ error: "Comment text cannot be empty" });
    }

    const recipe = await getRecipeById(recipeId);
    if (!recipe) {
      return res.status(404).json({ error: "Recipe not found" });
    }

    const newComment = await createComment(
      recipeId,
      req.user.id,
      req.user.displayName || "Home Chef",
      comment
    );

    res.status(201).json({
      success: true,
      message: "Comment added successfully",
      comment: newComment
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/comments/:commentId — Delete a comment (Author or Admin)
export const deleteCommentRouter = express.Router();
deleteCommentRouter.delete("/:commentId", requireAuth, async (req, res, next) => {
  try {
    const commentId = parseInt(req.params.commentId, 10);
    const deleted = await deleteComment(commentId);

    if (!deleted) {
      return res.status(404).json({ error: "Comment not found" });
    }

    res.json({ success: true, message: "Comment deleted successfully" });
  } catch (err) {
    next(err);
  }
});

export default router;
