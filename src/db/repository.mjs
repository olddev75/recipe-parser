/**
 * @file src/db/repository.mjs
 * @description Data Access Layer (DAL) Repository Module for Recipe Deck V2.0.
 * Encapsulates database queries for User Accounts, Recipe CRUD operations,
 * Public/Private scoping, Recipe Comments, and JSON serialization.
 *
 * Inputs: Validated JavaScript objects / primitives
 * Outputs: Clean JavaScript objects with automatically parsed JSON fields
 */

import { dbGet, dbAll, dbRun } from "./client.mjs";

// Helper to format recipe record with parsed JSON arrays
function formatRecipeRecord(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    isPublic: Number(row.isPublic),
    isFavourite: Number(row.isFavourite),
    servings: Number(row.servings || 4),
    prepTimeMinutes: Number(row.prepTimeMinutes || 0),
    cookTimeMinutes: Number(row.cookTimeMinutes || 0),
    rating: Number(row.rating || 0),
    ingredients: row.ingredients ? (typeof row.ingredients === "string" ? JSON.parse(row.ingredients) : row.ingredients) : [],
    instructions: row.instructions ? (typeof row.instructions === "string" ? JSON.parse(row.instructions) : row.instructions) : [],
    tags: row.tags ? (typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags) : []
  };
}

// ─── USER REPOSITORY ─────────────────────────────────────────────────────────

export async function findUserById(id) {
  const row = await dbGet("SELECT id, email, displayName, bio, avatar, googleId, isAdmin, createdAt FROM users WHERE id = ?", [id]);
  if (!row) return null;
  return { ...row, isAdmin: Boolean(row.isAdmin) };
}

export async function findUserWithPasswordById(id) {
  const row = await dbGet("SELECT * FROM users WHERE id = ?", [id]);
  if (!row) return null;
  return { ...row, isAdmin: Boolean(row.isAdmin) };
}

export async function findUserByEmail(email) {
  const row = await dbGet("SELECT * FROM users WHERE LOWER(email) = LOWER(?)", [email]);
  if (!row) return null;
  return { ...row, isAdmin: Boolean(row.isAdmin) };
}

export async function findUserByGoogleId(googleId) {
  const row = await dbGet("SELECT * FROM users WHERE googleId = ?", [googleId]);
  if (!row) return null;
  return { ...row, isAdmin: Boolean(row.isAdmin) };
}

export async function createUser({ id, email, passwordHash, displayName, bio = null, avatar = null, googleId = null, isAdmin = 0 }) {
  await dbRun(
    `INSERT INTO users (id, email, passwordHash, displayName, bio, avatar, googleId, isAdmin, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [id, email.toLowerCase().trim(), passwordHash, displayName.trim(), bio, avatar, googleId, isAdmin ? 1 : 0]
  );
  return findUserById(id);
}

export async function updateUserProfile(id, { displayName, bio, avatar }) {
  await dbRun(
    "UPDATE users SET displayName = ?, bio = ?, avatar = ? WHERE id = ?",
    [displayName.trim(), bio || null, avatar || null, id]
  );
  return findUserById(id);
}

export async function updateUserPassword(id, newPasswordHash) {
  await dbRun("UPDATE users SET passwordHash = ? WHERE id = ?", [newPasswordHash, id]);
  return true;
}

export async function setUserAdminRole(id, isAdmin) {
  await dbRun("UPDATE users SET isAdmin = ? WHERE id = ?", [isAdmin ? 1 : 0, id]);
  return findUserById(id);
}

export async function getAllUsers() {
  const rows = await dbAll("SELECT id, email, displayName, bio, avatar, isAdmin, createdAt FROM users ORDER BY createdAt ASC");
  return rows.map(r => ({ ...r, isAdmin: Boolean(r.isAdmin) }));
}

// ─── RECIPE REPOSITORY ───────────────────────────────────────────────────────

export async function getAllRecipesForUser(userId = null) {
  let rows;
  if (userId) {
    rows = await dbAll(
      "SELECT * FROM recipes WHERE isPublic = 1 OR userId = ? ORDER BY isFavourite DESC, updatedAt DESC, id DESC",
      [userId]
    );
  } else {
    rows = await dbAll(
      "SELECT * FROM recipes WHERE isPublic = 1 ORDER BY isFavourite DESC, updatedAt DESC, id DESC"
    );
  }
  return rows.map(formatRecipeRecord);
}

export async function getRecipeById(id) {
  const row = await dbGet("SELECT * FROM recipes WHERE id = ?", [id]);
  return formatRecipeRecord(row);
}

export async function createRecipe(data, userId = null) {
  const isPublicVal = data.isPublic !== undefined ? (data.isPublic ? 1 : 0) : 1;
  const result = await dbRun(
    `INSERT INTO recipes (userId, isPublic, title, servings, prepTimeMinutes, cookTimeMinutes, ingredients, instructions, tags, rating, difficulty, isFavourite, imageAttachment, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      userId,
      isPublicVal,
      data.title.trim(),
      data.servings || 4,
      data.prepTimeMinutes || 0,
      data.cookTimeMinutes || 0,
      JSON.stringify(data.ingredients || []),
      JSON.stringify(data.instructions || []),
      JSON.stringify(data.tags || []),
      typeof data.rating === "number" ? data.rating : 0,
      data.difficulty || "Easy",
      data.isFavourite ? 1 : 0,
      data.imageAttachment || null
    ]
  );
  return getRecipeById(result.lastID);
}

export async function updateRecipe(id, data) {
  const existing = await getRecipeById(id);
  if (!existing) return null;

  const isPublicVal = data.isPublic !== undefined ? (data.isPublic ? 1 : 0) : existing.isPublic;

  await dbRun(
    `UPDATE recipes SET 
      isPublic = ?,
      title = ?,
      servings = ?,
      prepTimeMinutes = ?,
      cookTimeMinutes = ?,
      ingredients = ?,
      instructions = ?,
      tags = ?,
      rating = ?,
      difficulty = ?,
      isFavourite = ?,
      imageAttachment = ?,
      updatedAt = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      isPublicVal,
      data.title.trim(),
      data.servings || existing.servings,
      data.prepTimeMinutes !== undefined ? data.prepTimeMinutes : existing.prepTimeMinutes,
      data.cookTimeMinutes !== undefined ? data.cookTimeMinutes : existing.cookTimeMinutes,
      JSON.stringify(data.ingredients || existing.ingredients),
      JSON.stringify(data.instructions || existing.instructions),
      JSON.stringify(data.tags || existing.tags),
      typeof data.rating === "number" ? data.rating : existing.rating,
      data.difficulty || existing.difficulty,
      data.isFavourite !== undefined ? (data.isFavourite ? 1 : 0) : existing.isFavourite,
      data.imageAttachment !== undefined ? data.imageAttachment : existing.imageAttachment,
      id
    ]
  );
  return getRecipeById(id);
}

export async function deleteRecipe(id) {
  await dbRun("DELETE FROM recipes WHERE id = ?", [id]);
  await dbRun("DELETE FROM recipe_comments WHERE recipeId = ?", [id]);
  return true;
}

export async function toggleRecipeFavourite(id, isFavourite) {
  await dbRun("UPDATE recipes SET isFavourite = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?", [isFavourite ? 1 : 0, id]);
  return getRecipeById(id);
}

export async function updateRecipeImage(id, imageAttachment) {
  await dbRun("UPDATE recipes SET imageAttachment = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?", [imageAttachment || null, id]);
  return getRecipeById(id);
}

export async function bulkImportRecipes(recipesArray, userId = null) {
  let importedCount = 0;
  let skippedCount = 0;
  const importedIds = [];

  for (const rawRecipe of recipesArray) {
    if (!rawRecipe || typeof rawRecipe !== "object") continue;
    const title = (rawRecipe.title || "").trim();
    if (!title) continue;

    // Duplicate detection by title
    const existing = await dbGet("SELECT id FROM recipes WHERE LOWER(TRIM(title)) = LOWER(TRIM(?))", [title]);
    if (existing) {
      skippedCount++;
    } else {
      const created = await createRecipe(rawRecipe, userId);
      importedCount++;
      importedIds.push(created.id);
    }
  }

  return { importedCount, skippedCount, totalCount: recipesArray.length, importedIds };
}

// ─── COMMENTS REPOSITORY ─────────────────────────────────────────────────────

export async function getCommentsByRecipeId(recipeId) {
  const rows = await dbAll(
    "SELECT * FROM recipe_comments WHERE recipeId = ? ORDER BY createdAt ASC, id ASC",
    [recipeId]
  );
  return rows.map(r => ({ ...r, id: Number(r.id), recipeId: Number(r.recipeId) }));
}

export async function createComment(recipeId, userId, userDisplayName, commentText) {
  const result = await dbRun(
    "INSERT INTO recipe_comments (recipeId, userId, userDisplayName, comment, createdAt) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)",
    [recipeId, userId, userDisplayName, commentText.trim()]
  );
  const inserted = await dbGet("SELECT * FROM recipe_comments WHERE id = ?", [result.lastID]);
  return { ...inserted, id: Number(inserted.id), recipeId: Number(inserted.recipeId) };
}

export async function deleteComment(commentId) {
  const existing = await dbGet("SELECT * FROM recipe_comments WHERE id = ?", [commentId]);
  if (!existing) return false;
  await dbRun("DELETE FROM recipe_comments WHERE id = ?", [commentId]);
  return true;
}

export default {
  findUserById,
  findUserWithPasswordById,
  findUserByEmail,
  findUserByGoogleId,
  createUser,
  updateUserProfile,
  updateUserPassword,
  setUserAdminRole,
  getAllUsers,
  getAllRecipesForUser,
  getRecipeById,
  createRecipe,
  updateRecipe,
  deleteRecipe,
  toggleRecipeFavourite,
  updateRecipeImage,
  bulkImportRecipes,
  getCommentsByRecipeId,
  createComment,
  deleteComment
};
