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
      imageAttachment TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration: add tags column if existing table doesn't have it
  try {
    await db.exec("ALTER TABLE recipes ADD COLUMN tags TEXT;");
  } catch (e) {
    // Column already exists or table created with it
  }

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
        `INSERT INTO recipes (title, servings, prepTimeMinutes, cookTimeMinutes, ingredients, instructions, tags, imageAttachment)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          r.title,
          r.servings,
          r.prepTimeMinutes,
          r.cookTimeMinutes,
          JSON.stringify(r.ingredients),
          JSON.stringify(r.instructions),
          JSON.stringify(r.tags),
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

// Recipe Translation Endpoint
app.post("/api/translate", async (req, res) => {
  const { recipe, targetLanguage } = req.body;
  if (!recipe || !targetLanguage) {
    return res.status(400).json({ error: "Recipe and targetLanguage are required" });
  }

  try {
    const prompt = `You are an expert culinary chef and multilingual translator.
Translate the following recipe accurately into ${targetLanguage}.

Translation Guidelines:
1. Accurately translate the recipe title, ingredient names, measurement units (using appropriate standard culinary terms for ${targetLanguage}), ingredient substitutions, instructions, and tags.
2. Ensure natural, idiomatic culinary grammar and kitchen phrasing native to ${targetLanguage} rather than robotic or word-for-word translation.
3. Keep all numeric quantities, proportions, and cook/prep times strictly accurate.
4. Output standard structured JSON conforming to the recipe schema.

Recipe to translate:
${JSON.stringify({
  title: recipe.title,
  servings: recipe.servings,
  prepTimeMinutes: recipe.prepTimeMinutes,
  cookTimeMinutes: recipe.cookTimeMinutes,
  tags: recipe.tags || [],
  ingredients: recipe.ingredients,
  instructions: recipe.instructions
}, null, 2)}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: recipeSchema,
      }
    });

    const translated = JSON.parse(response.text);
    // Preserve attachment and ID from original recipe
    if (recipe.imageAttachment) translated.imageAttachment = recipe.imageAttachment;
    if (recipe.id) translated.id = recipe.id;
    if (!translated.tags) translated.tags = [];

    res.json(translated);
  } catch (err) {
    console.error("Translation API error:", err);
    res.status(500).json({ error: "Failed to translate recipe: " + err.message });
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
  const { title, servings, prepTimeMinutes, cookTimeMinutes, ingredients, instructions, tags, imageAttachment } = req.body;
  if (!title) return res.status(400).json({ error: "Title is required" });

  try {
    const result = await db.run(
      `INSERT INTO recipes (title, servings, prepTimeMinutes, cookTimeMinutes, ingredients, instructions, tags, imageAttachment, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        title,
        servings || 4,
        prepTimeMinutes || 0,
        cookTimeMinutes || 0,
        JSON.stringify(ingredients || []),
        JSON.stringify(instructions || []),
        JSON.stringify(tags || []),
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
  const { title, servings, prepTimeMinutes, cookTimeMinutes, ingredients, instructions, tags, imageAttachment } = req.body;
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

