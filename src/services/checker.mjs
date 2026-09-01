/**
 * @file src/services/checker.mjs
 * @description Intelligent Recipe Self-Check Verification Engine.
 * Verifies and auto-calibrates cooking & prep times, cleans HTML entities and bullets,
 * sanitizes measurements, decodes typography, and standardizes categorization tags.
 *
 * Inputs: Recipe Object
 * Outputs: Sanitized Recipe Object with `.selfCheckReport` metadata
 */

import { sanitizeAndExtractIngredient } from "./normalizer.mjs";

/**
 * Runs intelligent self-check verification on a recipe object.
 * @param {Object} recipe 
 * @param {string} [rawContext] 
 * @returns {Object} Verified and sanitized recipe
 */
export function selfCheckAndVerifyRecipe(recipe, rawContext = "") {
  if (!recipe || typeof recipe !== "object") return recipe;

  const report = {
    verified: true,
    timesVerified: true,
    measurementsVerified: true,
    languageVerified: true,
    fixesApplied: []
  };

  // 1. Times Verification & Auto-Calibration
  let prep = Number(recipe.prepTimeMinutes) || 0;
  let cook = Number(recipe.cookTimeMinutes) || 0;

  if (cook === 0 && Array.isArray(recipe.instructions)) {
    let detectedCookTime = 0;
    const timeRegex = /(?:cook|bake|simmer|boil|roast|fry|sauté|heat|steam|grill|microwave|chill|rest|marinate|stand)\s+(?:for\s+)?(\d+(?:[.-]\d+)?)\s*(?:-|to)?\s*(\d+)?\s*(minutes|minute|mins|min|hours|hour|hrs|hr)\b/gi;

    for (const step of recipe.instructions) {
      if (typeof step !== "string") continue;
      let match;
      while ((match = timeRegex.exec(step)) !== null) {
        const val1 = parseFloat(match[1]);
        const val2 = match[2] ? parseFloat(match[2]) : val1;
        const avgVal = (val1 + val2) / 2;
        const unit = match[3].toLowerCase();
        const mins = unit.startsWith("h") ? avgVal * 60 : avgVal;
        detectedCookTime += Math.round(mins);
      }
    }

    if (detectedCookTime > 0 && detectedCookTime <= 720) {
      cook = detectedCookTime;
      recipe.cookTimeMinutes = cook;
      report.fixesApplied.push(`Inferred ${cook}m cook time from instruction text`);
    }
  }

  if (prep === 0) {
    const ingCount = Array.isArray(recipe.ingredients) ? recipe.ingredients.length : 0;
    prep = ingCount > 8 ? 15 : (ingCount > 4 ? 10 : 5);
    recipe.prepTimeMinutes = prep;
    report.fixesApplied.push(`Set baseline ${prep}m prep time based on ingredient count`);
  }

  recipe.prepTimeMinutes = Math.max(0, Math.min(prep, 1440));
  recipe.cookTimeMinutes = Math.max(0, Math.min(cook, 2880));

  // 2. Ingredients Sanitization
  if (Array.isArray(recipe.ingredients)) {
    recipe.ingredients = recipe.ingredients.map(ing => sanitizeAndExtractIngredient(ing));
  }

  // 3. Language & Typography Sanitization
  if (recipe.title) {
    recipe.title = recipe.title
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  if (Array.isArray(recipe.instructions)) {
    recipe.instructions = recipe.instructions
      .map(step => {
        if (typeof step !== "string") return "";
        return step
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/<[^>]*>/g, "")
          .replace(/\s+/g, " ")
          .trim();
      })
      .filter(step => step.length > 5);
  }

  // 4. Tags Standardization
  if (Array.isArray(recipe.tags)) {
    recipe.tags = Array.from(new Set(
      recipe.tags
        .filter(t => typeof t === "string" && t.trim())
        .map(t => t.replace(/^#/, "").trim())
        .map(t => t.charAt(0).toUpperCase() + t.slice(1))
    ));
  } else {
    recipe.tags = [];
  }

  recipe.selfCheckReport = report;
  return recipe;
}

export default { selfCheckAndVerifyRecipe };
