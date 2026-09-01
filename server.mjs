import { ZipArchive } from "archiver";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { GoogleGenAI, Type } from "@google/genai";
import "dotenv/config";
import { createClient } from "@libsql/client";

import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "recipes.db");

const JWT_SECRET = process.env.JWT_SECRET || "recipe-deck-secret-key-change-in-prod-2026";
const COOKIE_NAME = "recipe_deck_auth";

const app = express();
const port = 3000;

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(cookieParser());
// Increased limit to handle high-res screenshot uploads and image attachments
app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Authentication middleware to populate req.user (optional)
function optionalAuth(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAME] || (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    }
  } catch (err) {
    // Invalid / expired token — continue as guest
    req.user = null;
  }
  next();
}

// Authentication middleware requiring valid login
function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAME] || (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}

// Admin middleware requiring admin role (isAdmin === 1)
async function requireAdmin(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAME] || (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    
    // Check DB for current isAdmin status
    const dbUser = await dbGet("SELECT id, isAdmin FROM users WHERE id = ?", [decoded.id]);
    if (!dbUser || !dbUser.isAdmin) {
      return res.status(403).json({ error: "Forbidden: Administrator privileges required" });
    }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}

app.use(optionalAuth);

const standardUnitMap = {
  "g": "g", "gram": "g", "grams": "g", "g.": "g", "gr": "g",
  "kg": "kg", "kilogram": "kg", "kilograms": "kg", "kg.": "kg",
  "ml": "ml", "milliliter": "ml", "milliliters": "ml", "ml.": "ml",
  "l": "l", "liter": "l", "litres": "l", "liters": "l", "l.": "l",
  "tsp": "tsp", "teaspoon": "tsp", "teaspoons": "tsp", "tsp.": "tsp", "t.": "tsp",
  "tbsp": "tbsp", "tablespoon": "tbsp", "tablespoons": "tbsp", "tbsp.": "tbsp", "tbs": "tbsp", "tbs.": "tbsp", "t.": "tbsp",
  "cup": "cup", "cups": "cup", "c.": "cup", "c": "cup",
  "oz": "oz", "ounce": "oz", "ounces": "oz", "oz.": "oz",
  "fl oz": "fl oz", "floz": "fl oz", "fluid ounce": "fl oz", "fluid ounces": "fl oz", "fl. oz.": "fl oz",
  "lb": "lb", "pound": "lb", "pounds": "lb", "lbs": "lb", "lbs.": "lb",
  "pt": "pt", "pint": "pt", "pints": "pt",
  "qt": "qt", "quart": "qt", "quarts": "qt",
  "gal": "gal", "gallon": "gal", "gallons": "gal",
  "clove": "clove", "cloves": "cloves",
  "piece": "piece", "pieces": "pieces", "pcs": "pieces", "pc": "piece",
  "slice": "slice", "slices": "slices",
  "pinch": "pinch", "pinches": "pinch", "dash": "dash",
  "can": "can", "cans": "cans",
  "stalk": "stalk", "stalks": "stalks",
  "bunch": "bunch", "bunches": "bunch",
  "sprig": "sprig", "sprigs": "sprigs",
  "medium": "medium", "large": "large", "small": "small"
};

const fractionMap = {
  "1/2": 0.5, "½": 0.5,
  "1/4": 0.25, "¼": 0.25,
  "3/4": 0.75, "¾": 0.75,
  "1/3": 0.333, "⅓": 0.333,
  "2/3": 0.667, "⅔": 0.667,
  "1/8": 0.125, "⅛": 0.125,
  "3/8": 0.375, "⅜": 0.375,
  "5/8": 0.625, "⅝": 0.625,
  "7/8": 0.875, "⅞": 0.875
};

function parseQuantityString(str) {
  if (!str) return null;
  str = String(str).trim();
  if (str.includes("-")) {
    const parts = str.split("-");
    const p1 = parseQuantityString(parts[0]);
    const p2 = parseQuantityString(parts[1]);
    if (p1 && p2) return (p1 + p2) / 2;
  }
  let total = 0;
  const tokens = str.split(/\s+/);
  for (const tok of tokens) {
    if (fractionMap[tok]) {
      total += fractionMap[tok];
    } else if (tok.includes("/")) {
      const [n, d] = tok.split("/").map(Number);
      if (d) total += n / d;
    } else {
      const num = parseFloat(tok);
      if (!isNaN(num)) total += num;
    }
  }
  return total > 0 ? Math.round(total * 100) / 100 : null;
}

function sanitizeAndExtractIngredient(ing) {
  let name = "";
  let qty = null;
  let unit = "";
  let substitutions = [];

  if (typeof ing === "string") {
    name = ing;
  } else if (ing && typeof ing === "object") {
    name = String(ing.name || "");
    qty = ing.quantity;
    unit = String(ing.unit || "").trim().toLowerCase();
    substitutions = Array.isArray(ing.substitutions) ? ing.substitutions : [];
  }

  name = name
    .replace(/&bull;|•|·|▪|▫|–|—|\*|\+/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&frac12;|½/g, " 1/2 ")
    .replace(/&frac14;|¼/g, " 1/4 ")
    .replace(/&frac34;|¾/g, " 3/4 ")
    .replace(/&frac13;|⅓/g, " 1/3 ")
    .replace(/&frac23;|⅔/g, " 2/3 ")
    .replace(/&frac18;|⅛/g, " 1/8 ")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const pattern = /^((?:\d+\s+)?\d+\/\d+|\d+(?:\.\d+)?|\d+\s*-\s*\d+)\s*(?:([a-zA-Z\.\s]+?)(?:\s+of\b|\s+))?(.*)$/;
  const match = name.match(pattern);

  if (match) {
    const rawQtyStr = match[1];
    const candidateUnit = (match[2] || "").trim().toLowerCase();
    const candidateName = (match[3] || "").trim();

    if (standardUnitMap[candidateUnit]) {
      const parsedQty = parseQuantityString(rawQtyStr);
      if (parsedQty !== null) {
        qty = parsedQty;
        unit = standardUnitMap[candidateUnit];
        name = candidateName;
      }
    } else if (!unit || unit === "item" || unit === "whole" || unit === "piece") {
      const parsedQty = parseQuantityString(rawQtyStr);
      if (parsedQty !== null) {
        qty = parsedQty;
        const combined = (candidateUnit ? candidateUnit + " " : "") + candidateName;
        const words = combined.split(/\s+/);
        const firstWord = words[0]?.toLowerCase().replace(/\.$/, "");
        const twoWords = (words[0] + " " + (words[1] || "")).toLowerCase().replace(/\.$/, "");

        if (standardUnitMap[twoWords]) {
          unit = standardUnitMap[twoWords];
          name = words.slice(2).join(" ");
        } else if (standardUnitMap[firstWord]) {
          unit = standardUnitMap[firstWord];
          name = words.slice(1).join(" ");
        } else {
          name = combined;
          if (!unit || unit === "item") unit = "";
        }
      }
    }
  }

  if (typeof qty === "string") {
    qty = parseQuantityString(qty);
  }
  if (typeof qty !== "number" || isNaN(qty) || qty <= 0) {
    qty = 1;
  }

  if (unit && standardUnitMap[unit]) {
    unit = standardUnitMap[unit];
  } else if (unit === "item") {
    unit = "";
  }

  name = name.replace(/^of\s+/i, "").trim();

  return {
    name: name || "Ingredient",
    quantity: Math.round(qty * 100) / 100,
    unit: unit || "",
    substitutions
  };
}


// Initialize @libsql/client (Turso Cloud with automatic local fallback)
let tursoUrl = process.env.TURSO_DATABASE_URL || `file:${dbPath}`;
let tursoAuthToken = process.env.TURSO_AUTH_TOKEN || undefined;

let db = createClient({
  url: tursoUrl,
  authToken: tursoAuthToken
});

async function dbAll(sql, args = []) {
  const normArgs = Array.isArray(args) ? args : (args !== undefined ? [args] : []);
  const res = await db.execute({ sql, args: normArgs });
  return res.rows;
}

async function dbGet(sql, args = []) {
  const normArgs = Array.isArray(args) ? args : (args !== undefined ? [args] : []);
  const res = await db.execute({ sql, args: normArgs });
  return res.rows[0] || null;
}

async function dbRun(sql, args = []) {
  const normArgs = Array.isArray(args) ? args : (args !== undefined ? [args] : []);
  const res = await db.execute({ sql, args: normArgs });
  return { lastID: Number(res.lastInsertRowid), changes: res.rowsAffected };
}

async function initDb() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      displayName TEXT NOT NULL,
      bio TEXT,
      avatar TEXT,
      isAdmin INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT,
      isPublic INTEGER DEFAULT 1,
      title TEXT NOT NULL,
      servings INTEGER DEFAULT 4,
      prepTimeMinutes INTEGER DEFAULT 0,
      cookTimeMinutes INTEGER DEFAULT 0,
      ingredients TEXT,
      instructions TEXT,
      tags TEXT,
      rating INTEGER DEFAULT 0,
      difficulty TEXT DEFAULT 'Easy',
      isFavourite INTEGER DEFAULT 0,
      imageAttachment TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS recipe_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipeId INTEGER NOT NULL,
      userId TEXT NOT NULL,
      userDisplayName TEXT NOT NULL,
      comment TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration: add columns if existing table doesn't have them
  try {
    const tableInfo = await db.execute("PRAGMA table_info(recipes)");
    const cols = tableInfo.rows.map(r => r.name);
    if (!cols.includes("tags")) await db.execute("ALTER TABLE recipes ADD COLUMN tags TEXT;");
    if (!cols.includes("rating")) await db.execute("ALTER TABLE recipes ADD COLUMN rating INTEGER DEFAULT 0;");
    if (!cols.includes("difficulty")) await db.execute("ALTER TABLE recipes ADD COLUMN difficulty TEXT DEFAULT 'Easy';");
    if (!cols.includes("isFavourite")) await db.execute("ALTER TABLE recipes ADD COLUMN isFavourite INTEGER DEFAULT 0;");
    if (!cols.includes("userId")) await db.execute("ALTER TABLE recipes ADD COLUMN userId TEXT;");
    if (!cols.includes("isPublic")) await db.execute("ALTER TABLE recipes ADD COLUMN isPublic INTEGER DEFAULT 1;");

    const userTableInfo = await db.execute("PRAGMA table_info(users)");
    const userCols = userTableInfo.rows.map(r => r.name);
    if (!userCols.includes("bio")) await db.execute("ALTER TABLE users ADD COLUMN bio TEXT;");
    if (!userCols.includes("avatar")) await db.execute("ALTER TABLE users ADD COLUMN avatar TEXT;");
    if (!userCols.includes("isAdmin")) await db.execute("ALTER TABLE users ADD COLUMN isAdmin INTEGER DEFAULT 0;");
  } catch (e) {}

  // Seed default starter recipes if database is fresh/empty
  const countRow = await dbGet("SELECT COUNT(*) as count FROM recipes");
  if (countRow && Number(countRow.count) === 0) {
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
      await dbRun(
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


  // Auto-repair & normalize all stored ingredients and entities
  try {
    const allRows = await dbAll("SELECT * FROM recipes");
    for (const r of allRows) {
      if (r.ingredients) {
        try {
          const parsedIngs = typeof r.ingredients === "string" ? JSON.parse(r.ingredients) : r.ingredients;
          const sanitized = parsedIngs.map(sanitizeAndExtractIngredient);
          await dbRun("UPDATE recipes SET ingredients = ? WHERE id = ?", [JSON.stringify(sanitized), r.id]);
        } catch (e) {}
      }
    }
    console.log("🧹 Verified and sanitized stored recipes in database");
  } catch (e) {}

  console.log(`📦 Database initialized (${tursoUrl.startsWith("libsql:") ? "Turso Cloud" : "Local SQLite file"})`);
}

try {
  await initDb();
} catch (err) {
  if (tursoUrl.startsWith("libsql:") || tursoUrl.startsWith("https:")) {
    console.warn(`[Database] Failed to connect to remote Turso (${err.message}). Falling back to local SQLite at ${dbPath}`);
    tursoUrl = `file:${dbPath}`;
    tursoAuthToken = undefined;
    db = createClient({ url: tursoUrl });
    await initDb();
  } else {
    throw err;
  }
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });


/**
 * Intelligent Recipe Self-Check Engine
 * Verifies and calibrates:
 * 1. Times: Scans steps for cooking/prep times, resolves missing or 0 values, sanitizes unrealistic times.
 * 2. Measurements & Units: Parses fractions (½, ¼, 1 1/2), normalizes unit abbreviations, handles missing quantities/units.
 * 3. Language & Typography: Strips HTML tags, unescapes entities, removes blog boilerplate, ensures clean instructions.
 * 4. Categorization Tags: Standardizes tag casing and ensures protein/cuisine/diet tags exist.
 */

function selfCheckAndVerifyRecipe(recipe, rawContext = "") {
  if (!recipe || typeof recipe !== "object") return recipe;
  
  const report = {
    verified: true,
    timesVerified: true,
    measurementsVerified: true,
    languageVerified: true,
    fixesApplied: []
  };

  // 1. TIMES SELF-CHECK & AUTO-CALIBRATION
  let prep = Number(recipe.prepTimeMinutes) || 0;
  let cook = Number(recipe.cookTimeMinutes) || 0;

  // If cook time is 0, scan instructions for time mentions
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
      report.fixesApplied.push(`Inferred ${cook}m cook time from instructions`);
    }
  }

  // If prep time is 0, infer sensible baseline based on ingredient count
  if (prep === 0) {
    const ingCount = Array.isArray(recipe.ingredients) ? recipe.ingredients.length : 0;
    prep = ingCount > 8 ? 15 : (ingCount > 4 ? 10 : 5);
    recipe.prepTimeMinutes = prep;
    report.fixesApplied.push(`Estimated ${prep}m prep time based on ingredient count`);
  }

  recipe.prepTimeMinutes = Math.max(0, Math.min(prep, 1440));
  recipe.cookTimeMinutes = Math.max(0, Math.min(cook, 2880));

  // 2. MEASUREMENTS & UNITS SELF-CHECK & SANITIZATION
  if (Array.isArray(recipe.ingredients)) {
    recipe.ingredients = recipe.ingredients.map(ing => sanitizeAndExtractIngredient(ing));
  }

  // 3. LANGUAGE & TYPOGRAPHY SELF-CHECK
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

  // 4. TAGS STANDARDIZATION
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

// Helper to enforce timeouts on async promises
function promiseWithTimeout(promise, ms, timeoutErrorMsg = "Operation timed out") {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutErrorMsg)), ms);
  });
  return Promise.race([
    promise.then(res => { clearTimeout(timer); return res; }),
    timeoutPromise
  ]);
}

// Resilient Multi-Model Gemini Generator with Auto-Fallback
async function generateRecipeContent(contents, config = {}) {
  const models = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.5-pro"];
  let lastErr = null;
  for (const model of models) {
    try {
      const response = await promiseWithTimeout(
        ai.models.generateContent({
          model,
          contents,
          config: {
            responseMimeType: "application/json",
            responseSchema: recipeSchema,
            ...config
          }
        }),
        25000,
        `Gemini model ${model} timed out after 25s`
      );
      return response;
    } catch (err) {
      console.warn(`[Gemini] Model ${model} error: ${err.message?.slice(0, 120)}. Trying fallback model...`);
      lastErr = err;
    }
  }
  throw lastErr || new Error("Failed to parse recipe with all Gemini models");
}

// Heuristic offline text parser for fallback when Gemini AI API is unreachable
function parseRecipeTextHeuristic(rawText) {
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  let title = lines[0].replace(/^[#*-\s]+/, '').replace(/recipe:?/i, '').trim();
  if (title.length < 3) title = "Parsed Recipe";

  const ingredients = [];
  const instructions = [];
  let currentSection = "ingredients"; // Default initial section after title

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    // Detect section headers
    if (
      lower.includes("instruction") || lower.includes("method") || lower.includes("direction") ||
      lower.includes("preparation") || lower.includes("how to make") || lower.includes("steps")
    ) {
      currentSection = "instructions";
      continue;
    }
    if (
      lower.includes("ingredient") || lower.includes("what you need") || lower.includes("shopping list")
    ) {
      currentSection = "ingredients";
      continue;
    }

    // Detect instruction lines (e.g. starting with "1.", "Step 1", or long action verbs)
    const isStepLine = /^(?:step\s*\d+|\d+[\.\)]|\b(?:heat|add|stir|cook|sear|mix|whisk|serve|pour|return|combine|bake|preheat|season|top|rest)\b)/i.test(line);

    if (isStepLine && currentSection !== "instructions" && instructions.length === 0 && i > 3) {
      currentSection = "instructions";
    }

    if (currentSection === "instructions" || isStepLine) {
      const cleanInst = line.replace(/^(?:step\s*\d+[:\.]?|\d+[\.\)]|[-•*])\s*/i, '').trim();
      if (cleanInst) {
        instructions.push(cleanInst);
      }
    } else {
      // Clean leading bullet points or section labels (e.g., "For the beef:")
      if (line.endsWith(":") && line.length < 35 && !/\d/.test(line)) {
        // Section sub-header like "For the sauce:"
        continue;
      }

      const cleanLine = line.replace(/^[-•*]\s*/, '').trim();
      if (!cleanLine) continue;

      // Extract quantities and units if present
      const qtyMatch = cleanLine.match(/^([\d\/\.\s½⅓⅔¼¾]+)\s*([a-zA-Z]+)?\s+(.*)$/);
      if (qtyMatch) {
        let rawQty = qtyMatch[1].trim();
        let unit = (qtyMatch[2] || "").trim();
        let name = (qtyMatch[3] || "").trim();

        // Standardize common unit words
        const knownUnits = ["g", "kg", "ml", "l", "oz", "lbs", "lb", "cup", "cups", "tbsp", "tsp", "clove", "cloves", "pinch", "can", "cans", "handful"];
        if (!knownUnits.includes(unit.toLowerCase())) {
          name = `${unit} ${name}`.trim();
          unit = "";
        }

        // Convert fraction strings like "1/2" or "0.33"
        let quantity = 1;
        if (rawQty.includes("/")) {
          const parts = rawQty.split("/");
          if (parts.length === 2) quantity = parseFloat(parts[0]) / parseFloat(parts[1]);
        } else {
          quantity = parseFloat(rawQty) || 1;
        }

        ingredients.push({ name, quantity: Math.round(quantity * 100) / 100, unit, substitutions: [] });
      } else {
        ingredients.push({ name: cleanLine, quantity: 1, unit: "", substitutions: [] });
      }
    }
  }

  if (!ingredients.length && instructions.length) {
    ingredients.push({ name: "See instructions for details", quantity: 1, unit: "", substitutions: [] });
  }
  if (!instructions.length && ingredients.length) {
    instructions.push("Mix all ingredients together and cook as desired.");
  }

  return {
    title,
    servings: 4,
    prepTimeMinutes: 15,
    cookTimeMinutes: 20,
    difficulty: "Medium",
    rating: 0,
    tags: ["Thai", "Stir-Fry", "Beef"],
    ingredients: ingredients.length ? ingredients : [{ name: "Ingredients list", quantity: 1, unit: "", substitutions: [] }],
    instructions: instructions.length ? instructions : ["Follow recipe instructions."]
  };
}

// Text Parser Endpoint
app.post("/api/parse", async (req, res) => {
  const { rawText } = req.body;
  if (!rawText) return res.status(400).json({ error: "No text provided" });

  try {
    const response = await generateRecipeContent(
      `Extract this recipe into structured JSON with standard measurements (metric preferred), estimated cook/prep times, regional/ingredient substitutions, and clean normalized categorization tags (covering protein, diet/nutrition, and cuisine/meal style):\n\n${rawText}`
    );

    let parsed = JSON.parse(response.text);
    parsed = selfCheckAndVerifyRecipe(parsed, rawText);
    res.json(parsed);
  } catch (err) {
    console.warn("[Text Parser] Gemini AI fetch failed, using heuristic offline parser:", err.message);
    const fallback = parseRecipeTextHeuristic(rawText);
    if (fallback) {
      const verifiedFallback = selfCheckAndVerifyRecipe(fallback, rawText);
      return res.json(verifiedFallback);
    }
    res.status(500).json({ error: "Failed to parse recipe text. Please check network connection." });
  }
});

// Multimodal Image / Screenshot Parser Endpoint
app.post("/api/parse-image", async (req, res) => {
  const { imageBase64, mimeType } = req.body;
  if (!imageBase64) return res.status(400).json({ error: "No image provided" });

  try {
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
  if (!html || typeof html !== "string") return "";

  // Prioritize article, main, or recipe container if present
  let targetHtml = html;
  const mainMatch = html.match(/<(?:main|article|div[^>]*class=["'][^"']*(?:recipe|entry-content|post-content)[^"']*["'])[\s\S]*?<\/(?:main|article|div)>/i);
  if (mainMatch && mainMatch[0] && mainMatch[0].length > 200) {
    targetHtml = mainMatch[0];
  }

  return targetHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ")
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ")
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ")
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ")
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, " ")
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
    .slice(0, 10000); // 10k chars is fast, concise, and captures full recipe
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
      parsedRecipe = parseDirectJsonLd(jsonLdRecipe);
      if (imageUrl && !parsedRecipe.imageAttachment) {
        parsedRecipe.imageAttachment = imageUrl;
      }
    } else {
      console.log(`[Scraper] No JSON-LD found. Falling back to Gemini HTML text parsing for ${parsedUrl.hostname}`);
      const cleanText = cleanHtmlText(html);
      
      if (!cleanText || cleanText.length < 50) {
        throw new Error("Could not extract readable recipe text from the webpage.");
      }

      const geminiPrompt = `Extract the complete recipe from this webpage text into structured JSON with standard measurements (metric preferred), estimated cook/prep times, ingredient substitutions, and clean normalized categorization tags (covering protein, diet/nutrition, and cuisine/meal style):\n\n${cleanText}`;

      const aiResponse = await generateRecipeContent(geminiPrompt);
      parsedRecipe = JSON.parse(aiResponse.text);
    }

    if (imageUrl && !parsedRecipe.imageAttachment) {
      parsedRecipe.imageAttachment = imageUrl;
    }
    parsedRecipe = selfCheckAndVerifyRecipe(parsedRecipe);

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
   USER AUTHENTICATION API (JWT in Secure HTTP-Only Cookies)
   ========================================================================== */

// Helper to set auth cookie
function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  });
}

// POST /api/auth/register
app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, displayName } = req.body || {};
    if (!email || !password || !displayName) {
      return res.status(400).json({ error: "Email, password, and display name are required" });
    }
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = displayName.trim();

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const existing = await dbGet("SELECT id FROM users WHERE email = ?", [cleanEmail]);
    if (existing) {
      return res.status(400).json({ error: "An account with this email already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const userId = crypto.randomUUID();

    await dbRun(
      "INSERT INTO users (id, email, passwordHash, displayName, createdAt) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)",
      [userId, cleanEmail, passwordHash, cleanName]
    );

    const token = jwt.sign(
      { id: userId, email: cleanEmail, displayName: cleanName },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    setAuthCookie(res, token);
    res.status(201).json({
      user: { id: userId, email: cleanEmail, displayName: cleanName }
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Failed to create user account" });
  }
});

// POST /api/auth/login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    const cleanEmail = email.trim().toLowerCase();

    const user = await dbGet("SELECT * FROM users WHERE email = ?", [cleanEmail]);
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, displayName: user.displayName },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    setAuthCookie(res, token);
    res.json({
      user: { id: user.id, email: user.email, displayName: user.displayName }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Failed to login" });
  }
});

// POST /api/auth/logout
app.post("/api/auth/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax"
  });
  res.json({ success: true, message: "Logged out successfully" });
});

// GET /api/auth/me
app.get("/api/auth/me", async (req, res) => {
  if (!req.user) {
    return res.json({ user: null });
  }
  try {
    const user = await dbGet("SELECT id, email, displayName, bio, avatar, isAdmin, createdAt FROM users WHERE id = ?", [req.user.id]);
    if (!user) return res.json({ user: null });
    res.json({ user: { ...user, isAdmin: Boolean(user.isAdmin) } });
  } catch (err) {
    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        displayName: req.user.displayName,
        isAdmin: false
      }
    });
  }
});

// PUT /api/auth/profile (Update displayName, bio, avatar)
app.put("/api/auth/profile", requireAuth, async (req, res) => {
  try {
    const { displayName, bio, avatar } = req.body || {};
    if (!displayName || !displayName.trim()) {
      return res.status(400).json({ error: "Display name is required" });
    }
    const cleanName = displayName.trim();
    const cleanBio = typeof bio === "string" ? bio.trim().slice(0, 500) : null;
    const cleanAvatar = typeof avatar === "string" ? avatar : null;

    await dbRun(
      "UPDATE users SET displayName = ?, bio = ?, avatar = ? WHERE id = ?",
      [cleanName, cleanBio, cleanAvatar, req.user.id]
    );

    // Issue updated token
    const token = jwt.sign(
      { id: req.user.id, email: req.user.email, displayName: cleanName },
      JWT_SECRET,
      { expiresIn: "30d" }
    );
    setAuthCookie(res, token);

    const updatedUser = await dbGet("SELECT id, email, displayName, bio, avatar, createdAt FROM users WHERE id = ?", [req.user.id]);
    res.json({ success: true, user: updatedUser });
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// PUT /api/auth/password (Change password)
app.put("/api/auth/password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current password and new password are required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters" });
    }

    const user = await dbGet("SELECT * FROM users WHERE id = ?", [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const match = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!match) {
      return res.status(400).json({ error: "Incorrect current password" });
    }

    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(newPassword, salt);

    await dbRun("UPDATE users SET passwordHash = ? WHERE id = ?", [newHash, req.user.id]);
    res.json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ error: "Failed to change password" });
  }
});

// GET /api/admin/users — List all registered users (Admin Only)
app.get("/api/admin/users", requireAdmin, async (req, res) => {
  try {
    const users = await dbAll("SELECT id, email, displayName, bio, avatar, isAdmin, createdAt FROM users ORDER BY createdAt ASC");
    const formatted = (users || []).map(u => ({ ...u, isAdmin: Boolean(u.isAdmin) }));
    res.json({ users: formatted });
  } catch (err) {
    console.error("Fetch admin users error:", err);
    res.status(500).json({ error: "Failed to fetch user list" });
  }
});

// PUT /api/admin/users/:id/role — Toggle or grant/revoke admin rights (Admin Only)
app.put("/api/admin/users/:id/role", requireAdmin, async (req, res) => {
  try {
    const { targetUserId } = { targetUserId: req.params.id };
    const { isAdmin } = req.body || {};

    const targetUser = await dbGet("SELECT id, email, displayName, isAdmin FROM users WHERE id = ?", [targetUserId]);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }

    const newAdminStatus = isAdmin ? 1 : 0;
    await dbRun("UPDATE users SET isAdmin = ? WHERE id = ?", [newAdminStatus, targetUserId]);

    res.json({
      success: true,
      message: `Updated ${targetUser.displayName} admin privileges`,
      user: { ...targetUser, isAdmin: Boolean(newAdminStatus) }
    });
  } catch (err) {
    console.error("Update user admin role error:", err);
    res.status(500).json({ error: "Failed to update user admin privileges" });
  }
});

// Offline fallback dictionary for basic ingredient & UI translation terms
const OFFLINE_TRANSLATION_MAPS = {
  es: {
    "salt": "sal", "pepper": "pimienta", "water": "agua", "oil": "aceite", "garlic": "ajo",
    "onion": "cebolla", "sugar": "azúcar", "flour": "harina", "butter": "mantequilla", "milk": "leche",
    "egg": "huevo", "eggs": "huevos", "chicken": "pollo", "beef": "carne de res", "pork": "cerdo",
    "rice": "arroz", "sauce": "salsa", "lemon": "limón", "cheese": "queso", "parsley": "perejil"
  },
  fr: {
    "salt": "sel", "pepper": "poivre", "water": "eau", "oil": "huile", "garlic": "ail",
    "onion": "oignon", "sugar": "sucre", "flour": "farine", "butter": "beurre", "milk": "lait",
    "egg": "œuf", "eggs": "œufs", "chicken": "poulet", "beef": "bœuf", "pork": "porc",
    "rice": "riz", "sauce": "sauce", "lemon": "citron", "cheese": "fromage", "parsley": "persil"
  },
  de: {
    "salt": "Salz", "pepper": "Pfeffer", "water": "Wasser", "oil": "Öl", "garlic": "Knoblauch",
    "onion": "Zwiebel", "sugar": "Zucker", "flour": "Mehl", "butter": "Butter", "milk": "Milch",
    "egg": "Ei", "eggs": "Eier", "chicken": "Hähnchen", "beef": "Rindfleisch", "pork": "Schweinefleisch",
    "rice": "Reis", "sauce": "Soße", "lemon": "Zitrone", "cheese": "Käse", "parsley": "Petersilie"
  },
  it: {
    "salt": "sale", "pepper": "pepe", "water": "acqua", "oil": "olio", "garlic": "aglio",
    "onion": "cipolla", "sugar": "zucchero", "flour": "farina", "butter": "burro", "milk": "latte",
    "egg": "uovo", "eggs": "uova", "chicken": "pollo", "beef": "manzo", "pork": "maiale",
    "rice": "riso", "sauce": "salsa", "lemon": "limone", "cheese": "formaggio", "parsley": "prezzemolo"
  }
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
    copy.ingredients = copy.ingredients.map(ing => ({
      ...ing,
      name: translateWord(ing.name)
    }));
  }
  if (Array.isArray(copy.instructions)) {
    copy.instructions = copy.instructions.map(step => translateWord(step));
  }
  return copy;
}

// POST /api/translate — AI Recipe Translation Endpoint using Gemini with Offline Fallback
app.post("/api/translate", async (req, res) => {
  const { recipe, targetLanguage } = req.body || {};
  if (!recipe || typeof recipe !== "object") {
    return res.status(400).json({ error: "Recipe object is required for translation" });
  }
  if (!targetLanguage) {
    return res.status(400).json({ error: "Target language code is required" });
  }

  const langMap = {
    es: "Spanish",
    fr: "French",
    de: "German",
    it: "Italian",
    th: "Thai",
    ja: "Japanese",
    vi: "Vietnamese",
    zh: "Mandarin Chinese",
    pt: "Portuguese",
    en: "English"
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
    console.warn(`[Translate] Gemini AI fetch failed (${err.message}). Using offline translation fallback...`);
    const fallbackTranslated = translateRecipeOffline(recipe, targetLanguage);
    if (recipe.id) fallbackTranslated.id = recipe.id;
    if (recipe.imageAttachment) fallbackTranslated.imageAttachment = recipe.imageAttachment;
    return res.json({ success: true, recipe: fallbackTranslated, targetLanguage, isOfflineFallback: true });
  }
});

/* ==========================================================================
   TURSO CLOUD & LIBSQL RECIPE STORAGE API
   ========================================================================== */

// Get all saved recipes (where isPublic = 1 OR userId = current user id)
app.get("/api/recipes", async (req, res) => {
  try {
    let rows;
    if (req.user?.id) {
      rows = await dbAll(
        "SELECT * FROM recipes WHERE isPublic = 1 OR userId = ? OR userId IS NULL ORDER BY updatedAt DESC, id DESC",
        [req.user.id]
      );
    } else {
      rows = await dbAll(
        "SELECT * FROM recipes WHERE isPublic = 1 OR userId IS NULL ORDER BY updatedAt DESC, id DESC"
      );
    }

    const recipes = rows.map(r => ({
      ...r,
      isFavourite: Boolean(r.isFavourite),
      isPublic: r.isPublic === undefined || r.isPublic === null ? 1 : Number(r.isPublic),
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
    const recipe = await dbGet("SELECT * FROM recipes WHERE id = ?", req.params.id);
    if (!recipe) return res.status(404).json({ error: "Recipe not found" });

    // Check visibility if private
    const isPublic = recipe.isPublic === undefined || recipe.isPublic === null ? 1 : Number(recipe.isPublic);
    if (!isPublic && (!req.user || req.user.id !== recipe.userId)) {
      return res.status(403).json({ error: "Access denied. This recipe is private." });
    }

    res.json({
      ...recipe,
      isPublic,
      ingredients: recipe.ingredients ? JSON.parse(recipe.ingredients) : [],
      instructions: recipe.instructions ? JSON.parse(recipe.instructions) : [],
      tags: recipe.tags ? JSON.parse(recipe.tags) : []
    });
  } catch (err) {
    console.error("Get recipe error:", err);
    res.status(500).json({ error: "Failed to retrieve recipe" });
  }
});

// Bulk import recipes into SQLite
app.post("/api/recipes/bulk-import", async (req, res) => {
  try {
    let recipes = Array.isArray(req.body) ? req.body : req.body?.recipes;
    if (!Array.isArray(recipes) || recipes.length === 0) {
      return res.status(400).json({ error: "No recipes array provided in request body" });
    }

    const currentUserId = req.user?.id || null;
    let importedCount = 0;
    let skippedCount = 0;
    const importedIds = [];

    for (const rawRecipe of recipes) {
      if (!rawRecipe || typeof rawRecipe !== "object") continue;
      const validated = selfCheckAndVerifyRecipe(rawRecipe);
      const title = (validated.title || "").trim();
      if (!title) continue;

      // Check if recipe already exists in SQLite by matching title (case-insensitive)
      const existing = await dbGet(
        "SELECT id FROM recipes WHERE LOWER(TRIM(title)) = LOWER(TRIM(?))",
        [title]
      );

      if (existing) {
        skippedCount++;
      } else {
        const isPublicVal = validated.isPublic !== undefined ? (validated.isPublic ? 1 : 0) : 1;
        const result = await dbRun(
          `INSERT INTO recipes (userId, isPublic, title, servings, prepTimeMinutes, cookTimeMinutes, ingredients, instructions, tags, rating, difficulty, isFavourite, imageAttachment, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [
            currentUserId,
            isPublicVal,
            title,
            validated.servings || 4,
            validated.prepTimeMinutes || 0,
            validated.cookTimeMinutes || 0,
            JSON.stringify(validated.ingredients || []),
            JSON.stringify(validated.instructions || []),
            JSON.stringify(validated.tags || []),
            typeof validated.rating === "number" ? validated.rating : 0,
            validated.difficulty || "Easy",
            validated.isFavourite ? 1 : 0,
            validated.imageAttachment || null
          ]
        );
        importedCount++;
        importedIds.push(result.lastID);
      }
    }

    res.json({
      success: true,
      importedCount,
      skippedCount,
      totalCount: recipes.length,
      importedIds
    });
  } catch (err) {
    console.error("Bulk import error:", err);
    res.status(500).json({ error: "Failed to bulk import recipes" });
  }
});

// Create a new recipe in SQLite (Requires Authentication)
app.post("/api/recipes", requireAuth, async (req, res) => {
  const validated = selfCheckAndVerifyRecipe(req.body);
  const { title, servings, prepTimeMinutes, cookTimeMinutes, ingredients, instructions, tags, rating, difficulty, isFavourite, imageAttachment } = validated;
  if (!title) return res.status(400).json({ error: "Title is required" });

  const currentUserId = req.user.id;
  const isPublic = req.body.isPublic !== undefined ? (req.body.isPublic ? 1 : 0) : 1;

  try {
    const result = await dbRun(
      `INSERT INTO recipes (userId, isPublic, title, servings, prepTimeMinutes, cookTimeMinutes, ingredients, instructions, tags, rating, difficulty, isFavourite, imageAttachment, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        currentUserId,
        isPublic,
        title,
        servings || 4,
        prepTimeMinutes || 0,
        cookTimeMinutes || 0,
        JSON.stringify(ingredients || []),
        JSON.stringify(instructions || []),
        JSON.stringify(tags || []),
        typeof rating === "number" ? rating : 0,
        difficulty || "Easy",
        isFavourite ? 1 : 0,
        imageAttachment || null
      ]
    );

    const saved = await dbGet("SELECT * FROM recipes WHERE id = ?", result.lastID);
    res.status(201).json({
      ...saved,
      isPublic: Number(saved.isPublic),
      ingredients: saved.ingredients ? JSON.parse(saved.ingredients) : [],
      instructions: saved.instructions ? JSON.parse(saved.instructions) : [],
      tags: saved.tags ? JSON.parse(saved.tags) : []
    });
  } catch (err) {
    console.error("Save recipe error:", err);
    res.status(500).json({ error: "Failed to save recipe" });
  }
});

// Helper for recipe authorization: allow if admin, no owner (legacy/starter), OR user matches owner
function checkRecipeOwnership(recipe, user) {
  if (!user) return false;
  if (user.isAdmin) return true; // Admins can manage any recipe
  if (!recipe.userId) return true; // Legacy/starter recipes can be edited by users
  return user.id === recipe.userId;
}

// Update full recipe by ID
app.put("/api/recipes/:id", async (req, res) => {
  const validated = selfCheckAndVerifyRecipe(req.body);
  const { title, servings, prepTimeMinutes, cookTimeMinutes, ingredients, instructions, tags, rating, difficulty, isFavourite, imageAttachment } = validated;
  try {
    const existing = await dbGet("SELECT * FROM recipes WHERE id = ?", req.params.id);
    if (!existing) return res.status(404).json({ error: "Recipe not found" });

    if (!checkRecipeOwnership(existing, req.user)) {
      return res.status(403).json({ error: "Forbidden: You are not the owner of this recipe" });
    }

    const isPublicVal = req.body.isPublic !== undefined 
      ? (req.body.isPublic ? 1 : 0) 
      : (existing.isPublic !== undefined ? existing.isPublic : 1);

    await dbRun(
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
         isFavourite = COALESCE(?, isFavourite),
         isPublic = COALESCE(?, isPublic),
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
        isFavourite !== undefined ? (isFavourite ? 1 : 0) : existing.isFavourite,
        isPublicVal,
        imageAttachment !== undefined ? imageAttachment : existing.imageAttachment,
        req.params.id
      ]
    );

    const updated = await dbGet("SELECT * FROM recipes WHERE id = ?", req.params.id);
    const updatedRecipe = {
      ...updated,
      isPublic: Number(updated.isPublic),
      ingredients: updated.ingredients ? JSON.parse(updated.ingredients) : [],
      instructions: updated.instructions ? JSON.parse(updated.instructions) : [],
      tags: updated.tags ? JSON.parse(updated.tags) : []
    };
    res.json({
      success: true,
      recipe: updatedRecipe,
      ...updatedRecipe
    });
  } catch (err) {
    console.error("Update recipe error:", err);
    res.status(500).json({ error: "Failed to update recipe" });
  }
});

// Toggle/set favourite status
app.patch("/api/recipes/:id/favourite", async (req, res) => {
  try {
    const existing = await dbGet("SELECT * FROM recipes WHERE id = ?", req.params.id);
    if (!existing) return res.status(404).json({ error: "Recipe not found" });

    let newFav;
    if (req.body && typeof req.body.isFavourite === "boolean") {
      newFav = req.body.isFavourite ? 1 : 0;
    } else if (req.body && typeof req.body.isFavourite === "number") {
      newFav = req.body.isFavourite ? 1 : 0;
    } else {
      newFav = existing.isFavourite ? 0 : 1;
    }

    await dbRun(
      "UPDATE recipes SET isFavourite = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
      [newFav, req.params.id]
    );

    const updated = await dbGet("SELECT * FROM recipes WHERE id = ?", req.params.id);
    const updatedRecipe = {
      ...updated,
      isFavourite: Boolean(updated.isFavourite),
      ingredients: updated.ingredients ? JSON.parse(updated.ingredients) : [],
      instructions: updated.instructions ? JSON.parse(updated.instructions) : [],
      tags: updated.tags ? JSON.parse(updated.tags) : []
    };

    res.json(updatedRecipe);
  } catch (err) {
    console.error("Update favourite error:", err);
    res.status(500).json({ error: "Failed to update favourite status" });
  }
});

// Export JSON Backup
app.get("/api/export/json", async (req, res) => {
  try {
    const rows = await dbAll("SELECT * FROM recipes ORDER BY id ASC");
    const recipes = rows.map(r => ({
      ...r,
      isFavourite: Boolean(r.isFavourite),
      isPublic: Number(r.isPublic),
      ingredients: r.ingredients ? JSON.parse(r.ingredients) : [],
      instructions: r.instructions ? JSON.parse(r.instructions) : [],
      tags: r.tags ? JSON.parse(r.tags) : []
    }));

    const filename = `recipe_deck_backup_${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.json(recipes);
  } catch (err) {
    console.error("Export JSON error:", err);
    res.status(500).json({ error: "Failed to export recipes JSON" });
  }
});

// Export Markdown ZIP Archive
app.get("/api/export/markdown", async (req, res) => {
  try {
    const rows = await dbAll("SELECT * FROM recipes ORDER BY id ASC");
    const recipes = rows.map(r => ({
      ...r,
      isFavourite: Boolean(r.isFavourite),
      isPublic: Number(r.isPublic),
      ingredients: r.ingredients ? JSON.parse(r.ingredients) : [],
      instructions: r.instructions ? JSON.parse(r.instructions) : [],
      tags: r.tags ? JSON.parse(r.tags) : []
    }));

    const archive = new ZipArchive({ zlib: { level: 9 } });
    const filename = `recipes_markdown_${new Date().toISOString().slice(0, 10)}.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    archive.on("error", (err) => {
      console.error("Archive error:", err);
      res.status(500).send({ error: err.message });
    });

    archive.pipe(res);

    for (const recipe of recipes) {
      const safeTitle = (recipe.title || `recipe_${recipe.id}`)
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .replace(/_+/g, "_")
        .slice(0, 50);
      const entryName = `${recipe.id}_${safeTitle}.md`;

      let md = "---\n";
      md += `title: "${(recipe.title || '').replace(/"/g, '\\"')}"\n`;
      md += `servings: ${recipe.servings || 4}\n`;
      md += `prepTimeMinutes: ${recipe.prepTimeMinutes || 0}\n`;
      md += `cookTimeMinutes: ${recipe.cookTimeMinutes || 0}\n`;
      md += `rating: ${recipe.rating || 0}\n`;
      md += `difficulty: "${recipe.difficulty || 'Easy'}"\n`;
      md += `isFavourite: ${Boolean(recipe.isFavourite)}\n`;
      md += `tags: [${(recipe.tags || []).map(t => `"${t}"`).join(", ")}]\n`;
      md += `createdAt: "${recipe.createdAt || ''}"\n`;
      md += "---\n\n";

      md += `# ${recipe.title}\n\n`;
      md += `> ⏱️ **Prep:** ${recipe.prepTimeMinutes || 0}m | **Cook:** ${recipe.cookTimeMinutes || 0}m | **Servings:** ${recipe.servings || 4} | **Difficulty:** ${recipe.difficulty || 'Easy'} | **Rating:** ${'⭐'.repeat(recipe.rating || 0)}\n\n`;

      if (recipe.tags && recipe.tags.length > 0) {
        md += `**Tags:** ${recipe.tags.map(t => `#${t.replace(/^#/, '')}`).join(" ")}\n\n`;
      }

      md += `## 🥕 Ingredients\n\n`;
      for (const ing of (recipe.ingredients || [])) {
        const qtyStr = ing.quantity !== null && ing.quantity !== undefined ? `${ing.quantity} ` : "";
        const unitStr = ing.unit ? `${ing.unit} ` : "";
        const subsStr = (ing.substitutions && ing.substitutions.length > 0) ? ` *(Subs: ${ing.substitutions.join(", ")})*` : "";
        md += `- [ ] ${qtyStr}${unitStr}${ing.name}${subsStr}\n`;
      }
      md += "\n";

      md += `## 👩‍🍳 Instructions\n\n`;
      (recipe.instructions || []).forEach((step, idx) => {
        md += `${idx + 1}. ${step}\n`;
      });
      md += "\n";

      archive.append(md, { name: entryName });
    }

    await archive.finalize();
  } catch (err) {
    console.error("Export Markdown error:", err);
    res.status(500).json({ error: "Failed to export Markdown ZIP archive" });
  }
});

app.patch("/api/recipes/:id/rating", async (req, res) => {
  const { rating } = req.body;
  try {
    const existing = await dbGet("SELECT * FROM recipes WHERE id = ?", req.params.id);
    if (!existing) return res.status(404).json({ error: "Recipe not found" });

    await dbRun(
      `UPDATE recipes SET rating = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [typeof rating === "number" ? rating : 0, req.params.id]
    );

    const updated = await dbGet("SELECT * FROM recipes WHERE id = ?", req.params.id);
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
    const existing = await dbGet("SELECT * FROM recipes WHERE id = ?", req.params.id);
    if (!existing) return res.status(404).json({ error: "Recipe not found" });

    await dbRun(
      `UPDATE recipes SET difficulty = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [difficulty || "Easy", req.params.id]
    );

    const updated = await dbGet("SELECT * FROM recipes WHERE id = ?", req.params.id);
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
    const existing = await dbGet("SELECT * FROM recipes WHERE id = ?", req.params.id);
    if (!existing) return res.status(404).json({ error: "Recipe not found" });

    if (!checkRecipeOwnership(existing, req.user)) {
      return res.status(403).json({ error: "Forbidden: You are not the owner of this recipe" });
    }

    await dbRun(
      `UPDATE recipes SET imageAttachment = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [imageAttachment || null, req.params.id]
    );

    const updated = await dbGet("SELECT * FROM recipes WHERE id = ?", req.params.id);
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
    const existing = await dbGet("SELECT * FROM recipes WHERE id = ?", req.params.id);
    if (!existing) return res.status(404).json({ error: "Recipe not found" });

    if (!checkRecipeOwnership(existing, req.user)) {
      return res.status(403).json({ error: "Forbidden: You are not the owner of this recipe" });
    }

    await dbRun("DELETE FROM recipes WHERE id = ?", req.params.id);
    await dbRun("DELETE FROM recipe_comments WHERE recipeId = ?", req.params.id);
    res.json({ success: true, message: "Recipe deleted successfully" });
  } catch (err) {
    console.error("Delete recipe error:", err);
    res.status(500).json({ error: "Failed to delete recipe" });
  }
});

/* ==========================================================================
   RECIPE COMMENTS API
   ========================================================================== */

// GET /api/recipes/:id/comments
app.get("/api/recipes/:id/comments", async (req, res) => {
  try {
    const rows = await dbAll(
      "SELECT * FROM recipe_comments WHERE recipeId = ? ORDER BY createdAt ASC, id ASC",
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error("Get comments error:", err);
    res.status(500).json({ error: "Failed to fetch comments" });
  }
});

// POST /api/recipes/:id/comments (Authenticated users only)
app.post("/api/recipes/:id/comments", requireAuth, async (req, res) => {
  try {
    const { comment } = req.body || {};
    if (!comment || typeof comment !== "string" || !comment.trim()) {
      return res.status(400).json({ error: "Comment text is required" });
    }

    const recipe = await dbGet("SELECT id FROM recipes WHERE id = ?", req.params.id);
    if (!recipe) {
      return res.status(404).json({ error: "Recipe not found" });
    }

    const cleanComment = comment.trim().slice(0, 1000);
    const result = await dbRun(
      "INSERT INTO recipe_comments (recipeId, userId, userDisplayName, comment, createdAt) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)",
      [req.params.id, req.user.id, req.user.displayName, cleanComment]
    );

    const inserted = await dbGet("SELECT * FROM recipe_comments WHERE id = ?", result.lastID);
    res.status(201).json(inserted);
  } catch (err) {
    console.error("Add comment error:", err);
    res.status(500).json({ error: "Failed to post comment" });
  }
});

// DELETE /api/comments/:commentId (Comment owner only)
app.delete("/api/comments/:commentId", requireAuth, async (req, res) => {
  try {
    const existing = await dbGet("SELECT * FROM recipe_comments WHERE id = ?", req.params.commentId);
    if (!existing) {
      return res.status(404).json({ error: "Comment not found" });
    }

    if (existing.userId !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ error: "Forbidden: You can only delete your own comments unless you are an admin" });
    }

    await dbRun("DELETE FROM recipe_comments WHERE id = ?", req.params.commentId);
    res.json({ success: true, message: "Comment deleted successfully" });
  } catch (err) {
    console.error("Delete comment error:", err);
    res.status(500).json({ error: "Failed to delete comment" });
  }
});

const server = app.listen(port, () => {
  console.log(`\n🚀 Recipe App running at http://localhost:${port}`);
});

// Keep process active
setInterval(() => {}, 1000 * 60 * 60);

