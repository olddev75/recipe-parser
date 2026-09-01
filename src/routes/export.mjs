/**
 * @file src/routes/export.mjs
 * @description Recipe Export & Data Portability Router for Recipe Deck V2.0.
 * Endpoints for downloading full JSON database backups (`/api/export/json`)
 * and Obsidian/Notion compatible Markdown ZIP archives (`/api/export/markdown`).
 */

import express from "express";
import archiver from "archiver";
import { optionalAuth } from "../middleware/auth.mjs";
import { getAllRecipesForUser } from "../db/repository.mjs";

const router = express.Router();

// GET /api/export/json — Full JSON Database Backup Download
router.get("/json", optionalAuth, async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    const recipes = await getAllRecipesForUser(userId);

    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `recipe-deck-backup-${timestamp}.json`;

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.json({
      appName: "Recipe Deck",
      version: "2.0.0",
      exportedAt: new Date().toISOString(),
      recipeCount: recipes.length,
      recipes
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/export/markdown — Export Obsidian / Notion Compatible Markdown ZIP
router.get("/markdown", optionalAuth, async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    const recipes = await getAllRecipesForUser(userId);

    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `recipe-deck-markdown-${timestamp}.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);

    recipes.forEach(recipe => {
      const cleanTitle = (recipe.title || "Untitled Recipe")
        .replace(/[\/\\?%*:|"<>]/g, "-")
        .trim();

      const tagsYaml = (recipe.tags || []).map(t => `  - "${t}"`).join("\n");
      const ingredientsMd = (recipe.ingredients || [])
        .map(i => `- **${i.quantity || ""} ${i.unit || ""}** ${i.name || ""}`.trim())
        .join("\n");
      const instructionsMd = (recipe.instructions || [])
        .map((step, idx) => `${idx + 1}. ${step}`)
        .join("\n\n");

      const mdContent = `---
title: "${recipe.title}"
servings: ${recipe.servings || 4}
prepTimeMinutes: ${recipe.prepTimeMinutes || 0}
cookTimeMinutes: ${recipe.cookTimeMinutes || 0}
rating: ${recipe.rating || 0}
difficulty: "${recipe.difficulty || "Easy"}"
tags:
${tagsYaml}
created: "${recipe.createdAt || new Date().toISOString()}"
---

# ${recipe.title}

> **Prep Time:** ${recipe.prepTimeMinutes || 0} mins | **Cook Time:** ${recipe.cookTimeMinutes || 0} mins | **Servings:** ${recipe.servings || 4} | **Difficulty:** ${recipe.difficulty || "Easy"}

## 🛒 Ingredients
${ingredientsMd}

## 🍳 Instructions
${instructionsMd}
`;

      archive.append(mdContent, { name: `${cleanTitle}.md` });
    });

    archive.finalize();
  } catch (err) {
    next(err);
  }
});

export default router;
