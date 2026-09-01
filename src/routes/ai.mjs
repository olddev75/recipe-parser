/**
 * @file src/routes/ai.mjs
 * @description Gemini AI Ingestion & Translation Router for Recipe Deck V2.0.
 * Endpoints for text extraction (`/api/parse`), multimodal image OCR (`/api/parse-image`),
 * web scraping (`/api/scrape`), and full recipe i18n translation (`/api/translate`).
 */

import express from "express";
import { generateRecipeContent } from "../services/gemini.mjs";
import { selfCheckAndVerifyRecipe } from "../services/checker.mjs";
import { parseRecipeTextHeuristic, scrapeRecipeFromUrl } from "../services/scraper.mjs";

const router = express.Router();

// Offline fallback dictionary for basic ingredient & UI translation terms
const OFFLINE_TRANSLATION_MAPS = {
  es: { "salt": "sal", "pepper": "pimienta", "water": "agua", "oil": "aceite", "garlic": "ajo", "onion": "cebolla", "sugar": "azúcar", "flour": "harina", "butter": "mantequilla", "milk": "leche", "egg": "huevo", "chicken": "pollo", "beef": "carne de res", "pork": "cerdo", "rice": "arroz", "sauce": "salsa" },
  fr: { "salt": "sel", "pepper": "poivre", "water": "eau", "oil": "huile", "garlic": "ail", "onion": "oignon", "sugar": "sucre", "flour": "farine", "butter": "beurre", "milk": "lait", "egg": "œuf", "chicken": "poulet", "beef": "bœuf", "pork": "porc", "rice": "riz", "sauce": "sauce" },
  de: { "salt": "Salz", "pepper": "Pfeffer", "water": "Wasser", "oil": "Öl", "garlic": "Knoblauch", "onion": "Zwiebel", "sugar": "Zucker", "flour": "Mehl", "butter": "Butter", "milk": "Milch", "egg": "Ei", "chicken": "Hähnchen", "beef": "Rindfleisch", "pork": "Schweinefleisch", "rice": "Reis", "sauce": "Soße" },
  it: { "salt": "sale", "pepper": "pepe", "water": "acqua", "oil": "olio", "garlic": "aglio", "onion": "cipolla", "sugar": "zucchero", "flour": "farina", "butter": "burro", "milk": "latte", "egg": "uovo", "chicken": "pollo", "beef": "manzo", "pork": "maiale", "rice": "riso", "sauce": "salsa" }
};

function translateRecipeOffline(recipe, lang) {
  const map = OFFLINE_TRANSLATION_MAPS[lang] || {};
  const copy = JSON.parse(JSON.stringify(recipe));

  const translateWord = (txt) => {
    if (!txt || typeof txt !== "string") return txt;
    let result = txt;
    Object.keys(map).forEach(key => {
      const regex = new RegExp(`\\b${key}\\b`, "gi");
      result = result.replace(regex, map[key]);
    });
    return result;
  };

  copy.title = translateWord(copy.title) + ` (${lang.toUpperCase()})`;
  if (Array.isArray(copy.ingredients)) {
    copy.ingredients = copy.ingredients.map(ing => ({ ...ing, name: translateWord(ing.name) }));
  }
  if (Array.isArray(copy.instructions)) {
    copy.instructions = copy.instructions.map(step => translateWord(step));
  }
  return copy;
}

// POST /api/parse — Extract structured recipe from raw text
router.post("/parse", async (req, res, next) => {
  try {
    const { rawText } = req.body || {};
    if (!rawText || !rawText.trim()) {
      return res.status(400).json({ error: "No text provided to parse" });
    }

    try {
      const prompt = `Extract this recipe into structured JSON with standard measurements (metric preferred), estimated cook/prep times, regional/ingredient substitutions, and clean normalized categorization tags (covering protein, diet/nutrition, and cuisine/meal style):\n\n${rawText}`;
      const response = await generateRecipeContent(prompt);
      let parsed = JSON.parse(response.text);
      parsed = selfCheckAndVerifyRecipe(parsed, rawText);
      res.json(parsed);
    } catch (err) {
      console.warn("[Parse Route] Gemini AI fetch failed, using heuristic offline parser:", err.message);
      const fallback = parseRecipeTextHeuristic(rawText);
      if (fallback) {
        const verifiedFallback = selfCheckAndVerifyRecipe(fallback, rawText);
        return res.json(verifiedFallback);
      }
      res.status(500).json({ error: "Failed to parse recipe text. Please check connection." });
    }
  } catch (err) {
    next(err);
  }
});

// POST /api/parse-image — OCR screenshot or photo
router.post("/parse-image", async (req, res, next) => {
  try {
    const { imageBase64, mimeType } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ error: "No image payload provided" });
    }

    const promptText = "Extract and OCR the complete recipe from this screenshot or photo into structured JSON with standard measurements (metric preferred), estimated cook/prep times, common ingredient/brand substitutions, and clean normalized categorization tags (protein, diet/nutrition, cuisine/style).";

    const response = await generateRecipeContent([
      {
        inlineData: {
          data: imageBase64,
          mimeType: mimeType || "image/jpeg"
        }
      },
      promptText
    ]);

    let parsed = JSON.parse(response.text);
    parsed.imageAttachment = `data:${mimeType || "image/jpeg"};base64,${imageBase64}`;
    parsed = selfCheckAndVerifyRecipe(parsed);
    res.json(parsed);
  } catch (err) {
    console.error("Image OCR error:", err);
    res.status(500).json({ error: "Failed to parse recipe from image: " + err.message });
  }
});

// POST /api/scrape — Web URL Scraper Endpoint
router.post("/scrape", async (req, res, next) => {
  try {
    const { url } = req.body || {};
    if (!url || !url.trim()) {
      return res.status(400).json({ error: "No website URL provided" });
    }

    const scraped = await scrapeRecipeFromUrl(url.trim());
    res.json(scraped);
  } catch (err) {
    console.error("Scraper API error:", err);
    res.status(500).json({ error: "Failed to scrape recipe from website: " + err.message });
  }
});

// POST /api/translate — Full Recipe Translation Endpoint
router.post("/translate", async (req, res, next) => {
  try {
    const { recipe, targetLanguage } = req.body || {};
    if (!recipe || typeof recipe !== "object") {
      return res.status(400).json({ error: "Recipe object is required for translation" });
    }
    if (!targetLanguage) {
      return res.status(400).json({ error: "Target language code is required" });
    }

    const langMap = {
      es: "Spanish", fr: "French", de: "German", it: "Italian", th: "Thai",
      ja: "Japanese", vi: "Vietnamese", zh: "Mandarin Chinese", pt: "Portuguese", en: "English"
    };

    const targetLangName = langMap[targetLanguage] || targetLanguage;

    try {
      const prompt = `Translate the following culinary recipe completely into ${targetLangName} (${targetLanguage}). Preserve all numbers, quantities, units, structure, and original ingredient measurements accurately:\n\n${JSON.stringify(recipe, null, 2)}`;
      const response = await generateRecipeContent(prompt);
      let translated = JSON.parse(response.text);
      translated = selfCheckAndVerifyRecipe(translated);

      if (recipe.id) translated.id = recipe.id;
      if (recipe.imageAttachment) translated.imageAttachment = recipe.imageAttachment;

      res.json({ success: true, recipe: translated, targetLanguage });
    } catch (err) {
      console.warn(`[Translate Route] Gemini AI fetch failed (${err.message}). Using offline fallback...`);
      const fallbackTranslated = translateRecipeOffline(recipe, targetLanguage);
      if (recipe.id) fallbackTranslated.id = recipe.id;
      if (recipe.imageAttachment) fallbackTranslated.imageAttachment = recipe.imageAttachment;
      res.json({ success: true, recipe: fallbackTranslated, targetLanguage, isOfflineFallback: true });
    }
  } catch (err) {
    next(err);
  }
});

export default router;
