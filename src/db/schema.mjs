/**
 * @file src/db/schema.mjs
 * @description Unified Database Schema Initialization & Migration Module.
 * Defines DDL structures for `users`, `recipes`, and `recipe_comments` tables,
 * creates performance indexes, performs auto-migrations, and seeds starter recipes on fresh initialization.
 *
 * Exports: initDb()
 */

import { dbGet, dbRun, dbExecute } from "./client.mjs";

/**
 * Initializes database schema, creates indexes, applies PRAGMA column migrations,
 * and seeds default starter recipes if database is fresh.
 */
export async function initDb() {
  // 1. Create Users Table
  await dbExecute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      passwordHash TEXT,
      displayName TEXT NOT NULL,
      bio TEXT,
      avatar TEXT,
      googleId TEXT,
      isAdmin INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Create Recipes Table
  await dbExecute(`
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

  // 3. Create Recipe Comments Table
  await dbExecute(`
    CREATE TABLE IF NOT EXISTS recipe_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipeId INTEGER NOT NULL,
      userId TEXT NOT NULL,
      userDisplayName TEXT NOT NULL,
      comment TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 4. Create Performance Indexes
  await dbExecute(`CREATE INDEX IF NOT EXISTS idx_recipes_userId ON recipes(userId);`);
  await dbExecute(`CREATE INDEX IF NOT EXISTS idx_recipes_isPublic ON recipes(isPublic);`);
  await dbExecute(`CREATE INDEX IF NOT EXISTS idx_comments_recipeId ON recipe_comments(recipeId);`);

  // 5. Schema PRAGMA Migrations
  try {
    const recipeCols = (await dbExecute("PRAGMA table_info(recipes)")).rows.map(r => r.name);
    if (!recipeCols.includes("tags")) await dbExecute("ALTER TABLE recipes ADD COLUMN tags TEXT;");
    if (!recipeCols.includes("rating")) await dbExecute("ALTER TABLE recipes ADD COLUMN rating INTEGER DEFAULT 0;");
    if (!recipeCols.includes("difficulty")) await dbExecute("ALTER TABLE recipes ADD COLUMN difficulty TEXT DEFAULT 'Easy';");
    if (!recipeCols.includes("isFavourite")) await dbExecute("ALTER TABLE recipes ADD COLUMN isFavourite INTEGER DEFAULT 0;");
    if (!recipeCols.includes("userId")) await dbExecute("ALTER TABLE recipes ADD COLUMN userId TEXT;");
    if (!recipeCols.includes("isPublic")) await dbExecute("ALTER TABLE recipes ADD COLUMN isPublic INTEGER DEFAULT 1;");

    const userCols = (await dbExecute("PRAGMA table_info(users)")).rows.map(r => r.name);
    if (!userCols.includes("bio")) await dbExecute("ALTER TABLE users ADD COLUMN bio TEXT;");
    if (!userCols.includes("avatar")) await dbExecute("ALTER TABLE users ADD COLUMN avatar TEXT;");
    if (!userCols.includes("googleId")) await dbExecute("ALTER TABLE users ADD COLUMN googleId TEXT;");
    if (!userCols.includes("isAdmin")) await dbExecute("ALTER TABLE users ADD COLUMN isAdmin INTEGER DEFAULT 0;");
  } catch (err) {
    console.warn("[Schema] Migration check notice:", err.message);
  }

  // 6. Seed Default Starter Recipes if Database is Empty
  const countRow = await dbGet("SELECT COUNT(*) as count FROM recipes");
  if (countRow && Number(countRow.count) === 0) {
    console.log("🌱 Seeding default starter recipes into database...");
    await seedStarterRecipes();
  } else {
    console.log("📦 Database initialized cleanly");
  }
}

/**
 * Helper to seed initial starter recipes into empty database
 */
async function seedStarterRecipes() {
  const starterRecipes = [
    {
      title: "Classic Garlic Butter Chicken Breasts",
      servings: 4,
      prepTimeMinutes: 10,
      cookTimeMinutes: 15,
      rating: 5,
      difficulty: "Easy",
      isFavourite: 1,
      tags: ["Chicken", "High-Protein", "Keto", "Quick", "Dinner"],
      ingredients: [
        { name: "boneless chicken breasts", quantity: 600, unit: "g", substitutions: ["chicken thighs"] },
        { name: "unsalted butter", quantity: 3, unit: "tbsp", substitutions: ["olive oil"] },
        { name: "garlic cloves, minced", quantity: 4, unit: "cloves", substitutions: [] },
        { name: "olive oil", quantity: 1, unit: "tbsp", substitutions: [] },
        { name: "salt", quantity: 1, unit: "tsp", substitutions: [] },
        { name: "black pepper", quantity: 0.5, unit: "tsp", substitutions: [] },
        { name: "fresh parsley, chopped", quantity: 2, unit: "tbsp", substitutions: [] }
      ],
      instructions: [
        "Pat chicken breasts dry with paper towels. Season both sides with salt and black pepper.",
        "Heat olive oil and 1 tbsp butter in a large skillet over medium-high heat.",
        "Add chicken breasts and sear for 5-6 minutes per side until golden brown and internal temperature reaches 165°F (74°C).",
        "Reduce heat to medium-low. Add remaining 2 tbsp butter and minced garlic to the skillet.",
        "Spoon melted garlic butter over chicken breasts continuously for 1-2 minutes until fragrant.",
        "Remove from heat, garnish with chopped parsley, and rest 5 minutes before serving."
      ]
    },
    {
      title: "Creamy Tomato Basil Pasta",
      servings: 4,
      prepTimeMinutes: 10,
      cookTimeMinutes: 20,
      rating: 4,
      difficulty: "Easy",
      isFavourite: 0,
      tags: ["Italian", "Vegetarian", "30-Minute", "Dinner"],
      ingredients: [
        { name: "penne or rigatoni pasta", quantity: 400, unit: "g", substitutions: ["gluten-free pasta"] },
        { name: "crushed canned tomatoes", quantity: 400, unit: "g", substitutions: [] },
        { name: "heavy cream", quantity: 0.5, unit: "cup", substitutions: ["coconut cream"] },
        { name: "extra virgin olive oil", quantity: 2, unit: "tbsp", substitutions: [] },
        { name: "garlic cloves, minced", quantity: 3, unit: "cloves", substitutions: [] },
        { name: "grated Parmesan cheese", quantity: 0.5, unit: "cup", substitutions: [] },
        { name: "fresh basil leaves, torn", quantity: 0.25, unit: "cup", substitutions: [] },
        { name: "salt & red pepper flakes", quantity: 1, unit: "tsp", substitutions: [] }
      ],
      instructions: [
        "Bring a large pot of salted water to a boil. Cook pasta until al dente according to package instructions.",
        "Heat olive oil in a skillet over medium heat. Sauté garlic and red pepper flakes for 1 minute until fragrant.",
        "Pour in crushed tomatoes, season with salt, and simmer uncovered for 10 minutes until sauce thickens.",
        "Stir in heavy cream and Parmesan cheese until creamy and heated through.",
        "Drain pasta, reserving 1/2 cup pasta water. Toss pasta with creamy tomato sauce, adding reserved water as needed.",
        "Fold in fresh basil leaves and serve hot with extra Parmesan."
      ]
    }
  ];

  for (const r of starterRecipes) {
    await dbRun(
      `INSERT INTO recipes (userId, isPublic, title, servings, prepTimeMinutes, cookTimeMinutes, ingredients, instructions, tags, rating, difficulty, isFavourite, createdAt, updatedAt)
       VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        null,
        r.title,
        r.servings,
        r.prepTimeMinutes,
        r.cookTimeMinutes,
        JSON.stringify(r.ingredients),
        JSON.stringify(r.instructions),
        JSON.stringify(r.tags),
        r.rating,
        r.difficulty,
        r.isFavourite
      ]
    );
  }
}

export default { initDb };
