/**
 * @file src/routes/recipes.mjs
 * @description Recipe Management API Router for Recipe Deck V2.0.
 * Handles recipe listing, retrieval, creation, modification, deletion,
 * favourite toggles, photo attachments, public/private authorization scoping, and bulk imports.
 */

import express from "express";
import { optionalAuth, requireAuth } from "../middleware/auth.mjs";
import {
  getAllRecipesForUser,
  getRecipeById,
  createRecipe,
  updateRecipe,
  deleteRecipe,
  toggleRecipeFavourite,
  updateRecipeImage,
  bulkImportRecipes
} from "../db/repository.mjs";

const router = express.Router();

/**
 * Helper: Validates ownership or admin override for recipe mutation.
 * @param {Object} recipe 
 * @param {Object} user 
 * @returns {boolean}
 */
function checkRecipeOwnership(recipe, user) {
  if (!recipe) return false;
  if (!user) return false;
  if (user.isAdmin) return true;
  if (!recipe.userId) return true; // Legacy/unowned starter recipes editable by logged-in users
  return recipe.userId === user.id;
}

// GET /api/recipes — List public recipes and user's private recipes
router.get("/", optionalAuth, async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    const recipes = await getAllRecipesForUser(userId);
    res.json(recipes);
  } catch (err) {
    next(err);
  }
});

// POST /api/recipes — Create a new recipe
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { title, ingredients, instructions } = req.body || {};
    if (!title || !ingredients || !instructions) {
      return res.status(400).json({ error: "Title, ingredients, and instructions are required." });
    }

    const newRecipe = await createRecipe(req.body, req.user.id);
    res.status(201).json({
      success: true,
      message: "Recipe created successfully!",
      recipe: newRecipe
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/recipes/:id — Fetch recipe by ID
router.get("/:id", optionalAuth, async (req, res, next) => {
  try {
    const recipeId = parseInt(req.params.id, 10);
    const recipe = await getRecipeById(recipeId);

    if (!recipe) {
      return res.status(404).json({ error: "Recipe not found" });
    }

    if (!recipe.isPublic) {
      if (!req.user || (req.user.id !== recipe.userId && !req.user.isAdmin)) {
        return res.status(403).json({ error: "Access denied. This recipe is private." });
      }
    }

    res.json(recipe);
  } catch (err) {
    next(err);
  }
});

// PUT /api/recipes/:id — Update recipe details
router.put("/:id", requireAuth, async (req, res, next) => {
  try {
    const recipeId = parseInt(req.params.id, 10);
    const existing = await getRecipeById(recipeId);

    if (!existing) {
      return res.status(404).json({ error: "Recipe not found" });
    }

    if (!checkRecipeOwnership(existing, req.user)) {
      return res.status(403).json({ error: "Permission denied: You do not own this recipe." });
    }

    const updated = await updateRecipe(recipeId, req.body);
    res.json({
      success: true,
      message: "Recipe updated successfully!",
      recipe: updated
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/recipes/:id — Delete a recipe
router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const recipeId = parseInt(req.params.id, 10);
    const existing = await getRecipeById(recipeId);

    if (!existing) {
      return res.status(404).json({ error: "Recipe not found" });
    }

    if (!checkRecipeOwnership(existing, req.user)) {
      return res.status(403).json({ error: "Permission denied: You cannot delete another user's recipe." });
    }

    await deleteRecipe(recipeId);
    res.json({ success: true, message: "Recipe deleted successfully!" });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/recipes/:id/favourite — Toggle favourite status
router.patch("/:id/favourite", optionalAuth, async (req, res, next) => {
  try {
    const recipeId = parseInt(req.params.id, 10);
    const { isFavourite } = req.body || {};

    const existing = await getRecipeById(recipeId);
    if (!existing) {
      return res.status(404).json({ error: "Recipe not found" });
    }

    const updated = await toggleRecipeFavourite(recipeId, isFavourite);
    res.json({ success: true, recipe: updated });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/recipes/:id/image — Update photo attachment
router.patch("/:id/image", requireAuth, async (req, res, next) => {
  try {
    const recipeId = parseInt(req.params.id, 10);
    const { imageAttachment } = req.body || {};

    const existing = await getRecipeById(recipeId);
    if (!existing) {
      return res.status(404).json({ error: "Recipe not found" });
    }

    if (!checkRecipeOwnership(existing, req.user)) {
      return res.status(403).json({ error: "Permission denied: You cannot change this recipe's photo." });
    }

    const updated = await updateRecipeImage(recipeId, imageAttachment);
    res.json({ success: true, recipe: updated });
  } catch (err) {
    next(err);
  }
});

// POST /api/recipes/bulk-import — Bulk import JSON backup
router.post("/bulk-import", requireAuth, async (req, res, next) => {
  try {
    const { recipes } = req.body || {};
    if (!Array.isArray(recipes) || recipes.length === 0) {
      return res.status(400).json({ error: "Invalid backup format: Must contain a non-empty array of recipes" });
    }

    const result = await bulkImportRecipes(recipes, req.user.id);
    res.json({
      success: true,
      message: `Imported ${result.importedCount} recipes (${result.skippedCount} existing skipped)`,
      ...result
    });
  } catch (err) {
    next(err);
  }
});

export default router;
