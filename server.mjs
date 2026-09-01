import express from "express";
import cors from "cors";
import { GoogleGenAI, Type } from "@google/genai";
import "dotenv/config";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "recipes.db");

const app = express();
const port = 3000;

app.use(cors());
// Increased limit to handle high-res screenshot uploads and image attachments
app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Initialize SQLite database
let db;
async function initDb() {
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      servings INTEGER DEFAULT 4,
      prepTimeMinutes INTEGER DEFAULT 0,
      cookTimeMinutes INTEGER DEFAULT 0,
      ingredients TEXT,
      instructions TEXT,
      tags TEXT,
      rating INTEGER DEFAULT 0,
      difficulty TEXT DEFAULT 'Easy',
      imageAttachment TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration: add columns if existing table doesn't have them
  try {
    await db.exec("ALTER TABLE recipes ADD COLUMN tags TEXT;");
  } catch (e) {}
  try {
    await db.exec("ALTER TABLE recipes ADD COLUMN rating INTEGER DEFAULT 0;");
  } catch (e) {}
  try {
    await db.exec("ALTER TABLE recipes ADD COLUMN difficulty TEXT DEFAULT 'Easy';");
  } catch (e) {}

  // Seed default starter recipes if database is fresh/empty
  const countRow = await db.get("SELECT COUNT(*) as count FROM recipes");
  if (countRow && countRow.count === 0) {
    const starterRecipes = [
      {
        title: "Pad Thai Gai (Thai Stir-Fried Noodles)",
        servings: 2,
        prepTimeMinutes: 15,
        cookTimeMinutes: 15,
        tags: ["Chicken", "High-Protein", "Thai", "30-Minute"],
        rating: 5,
        difficulty: "Medium",
        ingredients: [
          { name: "chicken breast (thinly sliced)", quantity: 250, unit: "g" },
          { name: "flat rice noodles", quantity: 200, unit: "g" },
          { name: "eggs", quantity: 2, unit: "whole" },
          { name: "bean sprouts", quantity: 100, unit: "g" },
          { name: "crushed roasted peanuts", quantity: 30, unit: "g" },
          { name: "tamarind paste", quantity: 2, unit: "tbsp" },
          { name: "fish sauce", quantity: 2, unit: "tbsp" },
          { name: "palm sugar or brown sugar", quantity: 1.5, unit: "tbsp" },
          { name: "garlic cloves (minced)", quantity: 3, unit: "cloves" },
          { name: "vegetable oil", quantity: 2, unit: "tbsp" },
          { name: "lime wedges", quantity: 1, unit: "whole" }
        ],
        instructions: [
          "Soak rice noodles in warm water for 15-20 minutes until pliable but firm, then drain thoroughly.",
          "Whisk tamarind paste, fish sauce, and sugar in a small bowl to make the Pad Thai sauce.",
          "Heat 1 tbsp vegetable oil in a wok over high heat. Add minced garlic and sliced chicken; stir-fry for 3-4 minutes until cooked through.",
          "Push chicken to the side, add remaining oil, crack in the eggs and scramble quickly for 1 minute.",
          "Add drained noodles and sauce. Toss vigorously on high heat for 2 minutes until noodles absorb sauce and turn glossy.",
          "Toss in fresh bean sprouts and green onions for 30 seconds. Remove from heat and serve hot garnished with crushed peanuts and lime wedges."
        ]
      },
      {
        title: "Creamy Tuscan Garlic Chicken",
        servings: 4,
        prepTimeMinutes: 10,
        cookTimeMinutes: 20,
        tags: ["Chicken", "Keto", "Italian", "30-Minute", "Low-Carb"],
        rating: 5,
        difficulty: "Easy",
        ingredients: [
          { name: "boneless chicken breasts", quantity: 600, unit: "g" },
          { name: "heavy whipping cream", quantity: 240, unit: "ml" },
          { name: "chicken broth", quantity: 120, unit: "ml" },
          { name: "fresh baby spinach", quantity: 150, unit: "g" },
          { name: "sun-dried tomatoes (drained and sliced)", quantity: 75, unit: "g" },
          { name: "garlic cloves (minced)", quantity: 4, unit: "cloves" },
          { name: "grated parmesan cheese", quantity: 60, unit: "g" },
          { name: "olive oil", quantity: 2, unit: "tbsp" },
          { name: "Italian seasoning", quantity: 1, unit: "tsp" },
          { name: "salt and black pepper", quantity: 1, unit: "pinch" }
        ],
        instructions: [
          "Season chicken breasts generously with Italian seasoning, salt, and freshly cracked black pepper.",
          "Heat olive oil in a large skillet over medium-high heat. Sear chicken for 6-8 minutes per side until golden brown and cooked through (internal temp 165°F / 74°C). Transfer to a plate.",
          "In the same skillet, reduce heat to medium and add minced garlic; sauté for 1 minute until fragrant.",
          "Pour in chicken broth, heavy cream, and sliced sun-dried tomatoes. Bring to a gentle simmer for 3-4 minutes until slightly thickened.",
          "Stir in grated parmesan cheese until melted and smooth, then add fresh baby spinach and simmer for 2 minutes until wilted.",
          "Return cooked chicken breasts back into the pan and spoon rich Tuscan cream sauce over the top. Serve immediately."
        ]
      }
    ];

    for (const r of starterRecipes) {
      await db.run(
        `INSERT INTO recipes (title, servings, prepTimeMinutes, cookTimeMinutes, ingredients, instructions, tags, rating, difficulty, imageAttachment)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          r.title,
          r.servings,
          r.prepTimeMinutes,
          r.cookTimeMinutes,
          JSON.stringify(r.ingredients),
          JSON.stringify(r.instructions),
          JSON.stringify(r.tags),
          r.rating || 0,
          r.difficulty || "Easy",
          null
        ]
      );
    }
    console.log("🌱 Seeded initial starter recipes into SQLite database");
  }

  console.log("📦 SQLite database initialized (recipes.db)");
}
await initDb();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const recipeSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    servings: { type: Type.NUMBER },
    prepTimeMinutes: { type: Type.NUMBER },
    cookTimeMinutes: { type: Type.NUMBER },
    rating: {
      type: Type.NUMBER,
      description: "Recipe rating score from 1 to 5 stars if specified or implied, otherwise 0."
    },
    difficulty: {
      type: Type.STRING,
      enum: ["Easy", "Medium", "Hard"],
      description: "Recipe difficulty level: Easy, Medium, or Hard."
    },
    tags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Clean, standardized categorization tags covering: 1) Primary Protein (e.g. Chicken, Salmon, Beef, Tofu, Pork, Vegetarian), 2) Diet / Nutrition (e.g. Keto, High-Protein, Gluten-Free, Low-Carb, Dairy-Free, Vegan), and 3) Cuisine & Meal Style (e.g. Thai, Mexican, Italian, 30-Minute, Quick, Meal-Prep, Dinner, Dessert)."
    },
    ingredients: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          quantity: { type: Type.NUMBER },
          unit: { type: Type.STRING },
          substitutions: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        },
        required: ["name", "quantity", "unit"]
      }
    },
    instructions: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    }
  },
  required: ["title", "ingredients", "instructions"]
};

// Text Parser Endpoint
app.post("/api/parse", async (req, res) => {
  const { rawText } = req.body;
  if (!rawText) return res.status(400).json({ error: "No text provided" });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: `Extract this recipe into structured JSON with standard measurements (metric preferred), estimated cook/prep times, regional/ingredient substitutions, and clean normalized categorization tags (covering protein, diet/nutrition, and cuisine/meal style):\n\n${rawText}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: recipeSchema,
      }
    });

    const parsed = JSON.parse(response.text);
    if (!parsed.tags) parsed.tags = [];
    res.json(parsed);
  } catch (err) {
    console.error("API error:", err);
    res.status(500).json({ error: "Failed to parse recipe text" });
  }
});

// Multimodal Image / Screenshot Parser Endpoint
app.post("/api/parse-image", async (req, res) => {
  const { imageBase64, mimeType } = req.body;
  if (!imageBase64) return res.status(400).json({ error: "No image provided" });

  try {
    const promptText = "Extract and OCR the complete recipe from this screenshot or photo into structured JSON with standard measurements (metric preferred), estimated cook/prep times, common ingredient/brand substitutions, and clean normalized categorization tags (protein, diet/nutrition, cuisine/style).";
    
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: [
        {
          inlineData: {
            data: imageBase64,
            mimeType: mimeType || "image/jpeg"
          }
        },
        promptText
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: recipeSchema,
      }
    });

    const parsed = JSON.parse(response.text);
    if (!parsed.tags) parsed.tags = [];
    // Attach the original uploaded screenshot data URI
    parsed.imageAttachment = `data:${mimeType || "image/jpeg"};base64,${imageBase64}`;
    res.json(parsed);
  } catch (err) {
    console.error("Image OCR error:", err);
    res.status(500).json({ error: "Failed to parse recipe from image" });
  }
});

// Helper to parse ISO 8601 duration (e.g. PT15M, PT1H30M, P0Y0M0DT0H20M0S) to minutes
function parseIsoDuration(durationStr) {
  if (!durationStr || typeof durationStr !== "string") return 0;
  const match = durationStr.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!match) return 0;
  const days = parseInt(match[1] || 0, 10);
  const hours = parseInt(match[2] || 0, 10);
  const minutes = parseInt(match[3] || 0, 10);
  return days * 1440 + hours * 60 + minutes;
}

// Helper to extract JSON-LD recipe objects from HTML
function extractJsonLdRecipe(html) {
  const jsonLdRegex = /<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const rawJson = match[1].trim();
      if (!rawJson) continue;
      const data = JSON.parse(rawJson);

      const findRecipe = (obj) => {
        if (!obj || typeof obj !== "object") return null;
        if (Array.isArray(obj)) {
          for (const item of obj) {
            const found = findRecipe(item);
            if (found) return found;
          }
          return null;
        }
        if (obj["@graph"] && Array.isArray(obj["@graph"])) {
          for (const item of obj["@graph"]) {
            const found = findRecipe(item);
            if (found) return found;
          }
        }
        const type = obj["@type"];
        if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))) {
          return obj;
        }
        return null;
      };

      const recipeObj = findRecipe(data);
      if (recipeObj) return recipeObj;
    } catch (e) {
      // Continue searching next script tag
    }
  }
  return null;
}

// Helper to directly parse JSON-LD into standard recipe schema
function parseDirectJsonLd(jsonLd) {
  const title = jsonLd.name || jsonLd.headline || "Imported Web Recipe";
  
  let servings = 4;
  if (jsonLd.recipeYield) {
    if (typeof jsonLd.recipeYield === "number") {
      servings = jsonLd.recipeYield;
    } else if (typeof jsonLd.recipeYield === "string") {
      const numMatch = jsonLd.recipeYield.match(/\d+/);
      if (numMatch) servings = parseInt(numMatch[0], 10);
    } else if (Array.isArray(jsonLd.recipeYield) && jsonLd.recipeYield.length > 0) {
      const numMatch = String(jsonLd.recipeYield[0]).match(/\d+/);
      if (numMatch) servings = parseInt(numMatch[0], 10);
    }
  }

  const prepTimeMinutes = parseIsoDuration(jsonLd.prepTime);
  const cookTimeMinutes = parseIsoDuration(jsonLd.cookTime);

  // Parse ingredients
  const rawIngs = jsonLd.recipeIngredient || jsonLd.ingredients || [];
  const ingredients = [];
  if (Array.isArray(rawIngs)) {
    for (const item of rawIngs) {
      if (typeof item === "string") {
        const ingMatch = item.match(/^([\d\s\/\.\,\-]+)?\s*([a-zA-Z]+)?\s+(.*)$/);
        if (ingMatch && ingMatch[1]) {
          let qStr = ingMatch[1].trim();
          let qty = parseFloat(qStr) || 1;
          let unit = (ingMatch[2] || "").trim();
          let name = (ingMatch[3] || item).trim();
          ingredients.push({ name, quantity: qty, unit: unit || "item", substitutions: [] });
        } else {
          ingredients.push({ name: item, quantity: 1, unit: "item", substitutions: [] });
        }
      } else if (typeof item === "object" && item.name) {
        ingredients.push({
          name: item.name,
          quantity: typeof item.quantity === "number" ? item.quantity : 1,
          unit: item.unit || "item",
          substitutions: []
        });
      }
    }
  }

  // Parse instructions
  const instructions = [];
  const rawInst = jsonLd.recipeInstructions;
  if (typeof rawInst === "string") {
    instructions.push(rawInst);
  } else if (Array.isArray(rawInst)) {
    for (const step of rawInst) {
      if (typeof step === "string") {
        instructions.push(step.trim());
      } else if (typeof step === "object") {
        if (step["@type"] === "HowToSection" && Array.isArray(step.itemListElement)) {
          for (const sub of step.itemListElement) {
            if (typeof sub === "string") instructions.push(sub.trim());
            else if (sub && sub.text) instructions.push(sub.text.trim());
          }
        } else if (step.text) {
          instructions.push(step.text.trim());
        } else if (step.name) {
          instructions.push(step.name.trim());
        }
      }
    }
  }

  // Parse tags
  const tags = [];
  if (jsonLd.recipeCuisine) {
    if (Array.isArray(jsonLd.recipeCuisine)) tags.push(...jsonLd.recipeCuisine);
    else tags.push(jsonLd.recipeCuisine);
  }
  if (jsonLd.recipeCategory) {
    if (Array.isArray(jsonLd.recipeCategory)) tags.push(...jsonLd.recipeCategory);
    else tags.push(jsonLd.recipeCategory);
  }
  if (jsonLd.keywords) {
    if (typeof jsonLd.keywords === "string") {
      tags.push(...jsonLd.keywords.split(",").map(k => k.trim()));
    } else if (Array.isArray(jsonLd.keywords)) {
      tags.push(...jsonLd.keywords);
    }
  }

  let imageUrl = null;
  if (jsonLd.image) {
    if (typeof jsonLd.image === "string") imageUrl = jsonLd.image;
    else if (Array.isArray(jsonLd.image) && jsonLd.image.length > 0) {
      imageUrl = typeof jsonLd.image[0] === "string" ? jsonLd.image[0] : jsonLd.image[0]?.url;
    } else if (typeof jsonLd.image === "object" && jsonLd.image.url) {
      imageUrl = jsonLd.image.url;
    }
  }

  return {
    title,
    servings,
    prepTimeMinutes,
    cookTimeMinutes,
    rating: 0,
    difficulty: "Easy",
    ingredients: ingredients.length > 0 ? ingredients : [{ name: "Ingredients listed in instructions", quantity: 1, unit: "recipe" }],
    instructions: instructions.length > 0 ? instructions : ["Follow directions from original recipe."],
    tags: Array.from(new Set(tags.filter(Boolean))),
    imageAttachment: imageUrl
  };
}

// Helper to clean HTML text for fallback Gemini extraction
function cleanHtmlText(html) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ")
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ")
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ")
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40000); // Send first 40k chars of clean text
}

// Web URL Scraper & Recipe Extractor Endpoint
app.post("/api/scrape", async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Please provide a valid web URL" });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url.trim());
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("Invalid URL protocol");
    }
  } catch (err) {
    return res.status(400).json({ error: "Invalid URL format. Please include http:// or https://" });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(parsedUrl.href, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch page: HTTP ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const jsonLdRecipe = extractJsonLdRecipe(html);

    let parsedRecipe = null;
    let imageUrl = null;

    if (jsonLdRecipe) {
      console.log(`[Scraper] Found schema.org/Recipe JSON-LD for ${parsedUrl.hostname}`);
      
      // Extract image URL if available
      if (jsonLdRecipe.image) {
        if (typeof jsonLdRecipe.image === "string") {
          imageUrl = jsonLdRecipe.image;
        } else if (Array.isArray(jsonLdRecipe.image) && jsonLdRecipe.image.length > 0) {
          imageUrl = typeof jsonLdRecipe.image[0] === "string" ? jsonLdRecipe.image[0] : jsonLdRecipe.image[0]?.url;
        } else if (typeof jsonLdRecipe.image === "object" && jsonLdRecipe.image.url) {
          imageUrl = jsonLdRecipe.image.url;
        }
      }

      // Try Gemini normalization first for superior categorized tags and units; fall back to direct JSON-LD parser
      try {
        const geminiPrompt = `Convert and normalize this schema.org/Recipe JSON-LD data into structured recipe JSON with standard measurements (metric preferred), clean categorized tags (protein, diet/nutrition, cuisine/style), and ingredient substitutions:\n\n${JSON.stringify(jsonLdRecipe, null, 2)}`;

        const aiResponse = await ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: geminiPrompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: recipeSchema,
          }
        });

        parsedRecipe = JSON.parse(aiResponse.text);
      } catch (geminiErr) {
        console.warn("[Scraper] Gemini JSON-LD normalization fallback to direct parser:", geminiErr.message);
        parsedRecipe = parseDirectJsonLd(jsonLdRecipe);
      }
    } else {
      console.log(`[Scraper] No JSON-LD found. Falling back to Gemini HTML text parsing for ${parsedUrl.hostname}`);
      const cleanText = cleanHtmlText(html);
      
      if (!cleanText || cleanText.length < 50) {
        throw new Error("Could not extract readable recipe text from the webpage.");
      }

      const geminiPrompt = `Extract the complete recipe from this webpage text into structured JSON with standard measurements (metric preferred), estimated cook/prep times, ingredient substitutions, and clean normalized categorization tags (covering protein, diet/nutrition, and cuisine/meal style):\n\n${cleanText}`;

      const aiResponse = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: geminiPrompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: recipeSchema,
        }
      });

      parsedRecipe = JSON.parse(aiResponse.text);
    }

    if (!parsedRecipe.tags) parsedRecipe.tags = [];
    if (imageUrl && !parsedRecipe.imageAttachment) {
      parsedRecipe.imageAttachment = imageUrl;
    }

    res.json(parsedRecipe);
  } catch (err) {
    console.error("[Scraper Error]:", err);
    const msg = err.name === "AbortError" 
      ? "Website request timed out after 15 seconds."
      : (err.message || "Failed to scrape recipe from URL.");
    res.status(500).json({ error: msg });
  }
});



/* ==========================================================================
   SQLite RECIPE STORAGE & IMAGE ATTACHMENT API
   ========================================================================== */

// Get all saved recipes
app.get("/api/recipes", async (req, res) => {
  try {
    const rows = await db.all("SELECT * FROM recipes ORDER BY updatedAt DESC, id DESC");
    const recipes = rows.map(r => ({
      ...r,
      ingredients: r.ingredients ? JSON.parse(r.ingredients) : [],
      instructions: r.instructions ? JSON.parse(r.instructions) : [],
      tags: r.tags ? JSON.parse(r.tags) : []
    }));
    res.json(recipes);
  } catch (err) {
    console.error("Fetch recipes error:", err);
    res.status(500).json({ error: "Failed to fetch recipes" });
  }
});

// Get a single recipe by ID
app.get("/api/recipes/:id", async (req, res) => {
  try {
    const recipe = await db.get("SELECT * FROM recipes WHERE id = ?", req.params.id);
    if (!recipe) return res.status(404).json({ error: "Recipe not found" });

    res.json({
      ...recipe,
      ingredients: recipe.ingredients ? JSON.parse(recipe.ingredients) : [],
      instructions: recipe.instructions ? JSON.parse(recipe.instructions) : [],
      tags: recipe.tags ? JSON.parse(recipe.tags) : []
    });
  } catch (err) {
    console.error("Get recipe error:", err);
    res.status(500).json({ error: "Failed to retrieve recipe" });
  }
});

// Create a new recipe in SQLite
app.post("/api/recipes", async (req, res) => {
  const { title, servings, prepTimeMinutes, cookTimeMinutes, ingredients, instructions, tags, rating, difficulty, imageAttachment } = req.body;
  if (!title) return res.status(400).json({ error: "Title is required" });

  try {
    const result = await db.run(
      `INSERT INTO recipes (title, servings, prepTimeMinutes, cookTimeMinutes, ingredients, instructions, tags, rating, difficulty, imageAttachment, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        title,
        servings || 4,
        prepTimeMinutes || 0,
        cookTimeMinutes || 0,
        JSON.stringify(ingredients || []),
        JSON.stringify(instructions || []),
        JSON.stringify(tags || []),
        typeof rating === "number" ? rating : 0,
        difficulty || "Easy",
        imageAttachment || null
      ]
    );

    const saved = await db.get("SELECT * FROM recipes WHERE id = ?", result.lastID);
    res.status(201).json({
      ...saved,
      ingredients: saved.ingredients ? JSON.parse(saved.ingredients) : [],
      instructions: saved.instructions ? JSON.parse(saved.instructions) : [],
      tags: saved.tags ? JSON.parse(saved.tags) : []
    });
  } catch (err) {
    console.error("Save recipe error:", err);
    res.status(500).json({ error: "Failed to save recipe" });
  }
});

// Update full recipe by ID
app.put("/api/recipes/:id", async (req, res) => {
  const { title, servings, prepTimeMinutes, cookTimeMinutes, ingredients, instructions, tags, rating, difficulty, imageAttachment } = req.body;
  try {
    const existing = await db.get("SELECT * FROM recipes WHERE id = ?", req.params.id);
    if (!existing) return res.status(404).json({ error: "Recipe not found" });

    await db.run(
      `UPDATE recipes SET
         title = COALESCE(?, title),
         servings = COALESCE(?, servings),
         prepTimeMinutes = COALESCE(?, prepTimeMinutes),
         cookTimeMinutes = COALESCE(?, cookTimeMinutes),
         ingredients = COALESCE(?, ingredients),
         instructions = COALESCE(?, instructions),
         tags = COALESCE(?, tags),
         rating = COALESCE(?, rating),
         difficulty = COALESCE(?, difficulty),
         imageAttachment = ?,
         updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        title !== undefined ? title : existing.title,
        servings !== undefined ? servings : existing.servings,
        prepTimeMinutes !== undefined ? prepTimeMinutes : existing.prepTimeMinutes,
        cookTimeMinutes !== undefined ? cookTimeMinutes : existing.cookTimeMinutes,
        ingredients ? JSON.stringify(ingredients) : existing.ingredients,
        instructions ? JSON.stringify(instructions) : existing.instructions,
        tags !== undefined ? JSON.stringify(tags) : existing.tags,
        rating !== undefined ? rating : existing.rating,
        difficulty !== undefined ? difficulty : existing.difficulty,
        imageAttachment !== undefined ? imageAttachment : existing.imageAttachment,
        req.params.id
      ]
    );

    const updated = await db.get("SELECT * FROM recipes WHERE id = ?", req.params.id);
    res.json({
      ...updated,
      ingredients: updated.ingredients ? JSON.parse(updated.ingredients) : [],
      instructions: updated.instructions ? JSON.parse(updated.instructions) : [],
      tags: updated.tags ? JSON.parse(updated.tags) : []
    });
  } catch (err) {
    console.error("Update recipe error:", err);
    res.status(500).json({ error: "Failed to update recipe" });
  }
});

// Dedicated endpoint to update rating
app.patch("/api/recipes/:id/rating", async (req, res) => {
  const { rating } = req.body;
  try {
    const existing = await db.get("SELECT * FROM recipes WHERE id = ?", req.params.id);
    if (!existing) return res.status(404).json({ error: "Recipe not found" });

    await db.run(
      `UPDATE recipes SET rating = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [typeof rating === "number" ? rating : 0, req.params.id]
    );

    const updated = await db.get("SELECT * FROM recipes WHERE id = ?", req.params.id);
    res.json({
      ...updated,
      ingredients: updated.ingredients ? JSON.parse(updated.ingredients) : [],
      instructions: updated.instructions ? JSON.parse(updated.instructions) : [],
      tags: updated.tags ? JSON.parse(updated.tags) : []
    });
  } catch (err) {
    console.error("Update rating error:", err);
    res.status(500).json({ error: "Failed to update rating" });
  }
});

// Dedicated endpoint to update difficulty
app.patch("/api/recipes/:id/difficulty", async (req, res) => {
  const { difficulty } = req.body;
  try {
    const existing = await db.get("SELECT * FROM recipes WHERE id = ?", req.params.id);
    if (!existing) return res.status(404).json({ error: "Recipe not found" });

    await db.run(
      `UPDATE recipes SET difficulty = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [difficulty || "Easy", req.params.id]
    );

    const updated = await db.get("SELECT * FROM recipes WHERE id = ?", req.params.id);
    res.json({
      ...updated,
      ingredients: updated.ingredients ? JSON.parse(updated.ingredients) : [],
      instructions: updated.instructions ? JSON.parse(updated.instructions) : [],
      tags: updated.tags ? JSON.parse(updated.tags) : []
    });
  } catch (err) {
    console.error("Update difficulty error:", err);
    res.status(500).json({ error: "Failed to update difficulty" });
  }
});

// Dedicated endpoint to update/remove photo attachment for an existing recipe
app.patch("/api/recipes/:id/image", async (req, res) => {
  const { imageAttachment } = req.body;
  try {
    const existing = await db.get("SELECT * FROM recipes WHERE id = ?", req.params.id);
    if (!existing) return res.status(404).json({ error: "Recipe not found" });

    await db.run(
      `UPDATE recipes SET imageAttachment = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [imageAttachment || null, req.params.id]
    );

    const updated = await db.get("SELECT * FROM recipes WHERE id = ?", req.params.id);
    res.json({
      ...updated,
      ingredients: updated.ingredients ? JSON.parse(updated.ingredients) : [],
      instructions: updated.instructions ? JSON.parse(updated.instructions) : [],
      tags: updated.tags ? JSON.parse(updated.tags) : []
    });
  } catch (err) {
    console.error("Update recipe image error:", err);
    res.status(500).json({ error: "Failed to update recipe image" });
  }
});

// Delete a recipe
app.delete("/api/recipes/:id", async (req, res) => {
  try {
    const existing = await db.get("SELECT * FROM recipes WHERE id = ?", req.params.id);
    if (!existing) return res.status(404).json({ error: "Recipe not found" });

    await db.run("DELETE FROM recipes WHERE id = ?", req.params.id);
    res.json({ success: true, message: "Recipe deleted successfully" });
  } catch (err) {
    console.error("Delete recipe error:", err);
    res.status(500).json({ error: "Failed to delete recipe" });
  }
});

const server = app.listen(port, () => {
  console.log(`\n🚀 Recipe App running at http://localhost:${port}`);
});

// Keep process active
setInterval(() => {}, 1000 * 60 * 60);

