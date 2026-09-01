/**
 * @file src/services/scraper.mjs
 * @description Web Scraper & Recipe Extractor Engine.
 * Extracts `schema.org/Recipe` JSON-LD from food blog URLs, parses ISO 8601 durations,
 * cleans raw HTML content, and provides both offline heuristic text parsing and Gemini fallback scraping.
 *
 * Inputs: Web Page URL or raw HTML text
 * Outputs: Clean structured recipe JSON
 */

import { generateRecipeContent } from "./gemini.mjs";
import { selfCheckAndVerifyRecipe } from "./checker.mjs";

/**
 * Parses ISO 8601 duration string (e.g. PT15M, PT1H30M) into total minutes.
 * @param {string} durationStr 
 * @returns {number} minutes
 */
export function parseIsoDuration(durationStr) {
  if (!durationStr || typeof durationStr !== "string") return 0;
  const match = durationStr.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!match) return 0;
  const days = parseInt(match[1] || 0, 10);
  const hours = parseInt(match[2] || 0, 10);
  const minutes = parseInt(match[3] || 0, 10);
  return days * 1440 + hours * 60 + minutes;
}

/**
 * Strips HTML tags, script/style blocks, and extra whitespace.
 * @param {string} html 
 * @returns {string} Clean plain text
 */
export function cleanHtmlToText(html) {
  if (!html) return "";
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n\s*\n/g, "\n")
    .trim();
}

/**
 * Extracts schema.org/Recipe JSON-LD objects from raw HTML.
 * @param {string} html 
 * @returns {Object|null}
 */
export function extractJsonLdRecipe(html) {
  const jsonLdRegex = /<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1].trim());
      const findRecipe = (obj) => {
        if (!obj || typeof obj !== "object") return null;
        if (obj["@type"] === "Recipe" || (Array.isArray(obj["@type"]) && obj["@type"].includes("Recipe"))) {
          return obj;
        }
        if (obj["@graph"] && Array.isArray(obj["@graph"])) {
          for (const item of obj["@graph"]) {
            const found = findRecipe(item);
            if (found) return found;
          }
        }
        return null;
      };

      const recipeObj = findRecipe(data);
      if (recipeObj) {
        let title = recipeObj.name || "Scraped Recipe";
        let servings = 4;
        if (recipeObj.recipeYield) {
          const y = Array.isArray(recipeObj.recipeYield) ? recipeObj.recipeYield[0] : recipeObj.recipeYield;
          const parsedY = parseInt(String(y).replace(/\D/g, ""), 10);
          if (parsedY > 0) servings = parsedY;
        }

        let prepTimeMinutes = parseIsoDuration(recipeObj.prepTime);
        let cookTimeMinutes = parseIsoDuration(recipeObj.cookTime);

        let ingredients = [];
        if (Array.isArray(recipeObj.recipeIngredient)) {
          ingredients = recipeObj.recipeIngredient;
        }

        let instructions = [];
        if (Array.isArray(recipeObj.recipeInstructions)) {
          instructions = recipeObj.recipeInstructions.map(step => {
            if (typeof step === "string") return step;
            if (typeof step === "object" && step.text) return step.text;
            return "";
          }).filter(Boolean);
        }

        let imageAttachment = null;
        if (recipeObj.image) {
          if (typeof recipeObj.image === "string") imageAttachment = recipeObj.image;
          else if (Array.isArray(recipeObj.image) && typeof recipeObj.image[0] === "string") imageAttachment = recipeObj.image[0];
          else if (recipeObj.image.url) imageAttachment = recipeObj.image.url;
        }

        let rating = 0;
        if (recipeObj.aggregateRating && recipeObj.aggregateRating.ratingValue) {
          rating = Math.round(parseFloat(recipeObj.aggregateRating.ratingValue));
        }

        return {
          title,
          servings,
          prepTimeMinutes,
          cookTimeMinutes,
          rating,
          difficulty: "Easy",
          tags: Array.isArray(recipeObj.keywords) ? recipeObj.keywords : [],
          ingredients,
          instructions,
          imageAttachment
        };
      }
    } catch (e) {
      // Continue parsing next JSON-LD script block
    }
  }

  return null;
}

/**
 * Heuristic offline text parser for fallback when Gemini API is offline.
 * @param {string} rawText 
 * @returns {Object}
 */
export function parseRecipeTextHeuristic(rawText) {
  const lines = rawText.split("\n").map(l => l.trim()).filter(Boolean);
  let title = lines[0] || "Imported Recipe";

  let ingredients = [];
  let instructions = [];
  let currentSection = "ingredients";

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    if (lower.includes("instruction") || lower.includes("method") || lower.includes("direction") || lower.includes("step")) {
      currentSection = "instructions";
      continue;
    }
    if (lower.includes("ingredient")) {
      currentSection = "ingredients";
      continue;
    }

    if (currentSection === "ingredients") {
      ingredients.push(line);
    } else {
      instructions.push(line.replace(/^\d+[\.\)]\s*/, ""));
    }
  }

  if (instructions.length === 0 && ingredients.length > 3) {
    instructions = ingredients.slice(Math.ceil(ingredients.length / 2));
    ingredients = ingredients.slice(0, Math.ceil(ingredients.length / 2));
  }

  return {
    title,
    servings: 4,
    prepTimeMinutes: 10,
    cookTimeMinutes: 15,
    rating: 0,
    difficulty: "Easy",
    tags: ["Imported"],
    ingredients,
    instructions
  };
}

/**
 * Scrapes a recipe from a URL using JSON-LD extraction or Gemini HTML fallback.
 * @param {string} targetUrl 
 * @returns {Promise<Object>}
 */
export async function scrapeRecipeFromUrl(targetUrl) {
  const response = await fetch(targetUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch website URL (HTTP ${response.status})`);
  }

  const html = await response.text();

  // Try JSON-LD parsing first
  const jsonLdRecipe = extractJsonLdRecipe(html);
  if (jsonLdRecipe && jsonLdRecipe.ingredients.length > 0 && jsonLdRecipe.instructions.length > 0) {
    console.log(`[Scraper] Fast JSON-LD match for "${jsonLdRecipe.title}"`);
    return selfCheckAndVerifyRecipe(jsonLdRecipe);
  }

  // Fallback to Gemini HTML extraction
  const cleanText = cleanHtmlToText(html).slice(0, 15000);
  const promptText = `Scrape and extract the recipe from this web page HTML into structured JSON:\n\n${cleanText}`;

  const aiResponse = await generateRecipeContent(promptText);
  let parsed = JSON.parse(aiResponse.text);
  return selfCheckAndVerifyRecipe(parsed);
}

export default {
  parseIsoDuration,
  cleanHtmlToText,
  extractJsonLdRecipe,
  parseRecipeTextHeuristic,
  scrapeRecipeFromUrl
};
