import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoAuthToken = process.env.TURSO_AUTH_TOKEN;

if (!tursoUrl) {
  console.error("❌ Error: TURSO_DATABASE_URL environment variable is required.");
  process.exit(1);
}

console.log("==================================================");
console.log("🚀 MIGRATING LOCAL RECIPES TO TURSO CLOUD");
console.log(`📡 Remote Turso: ${tursoUrl}`);
console.log("==================================================");

// 1. Connect to local recipes.db (via local file protocol)
const localDbPath = path.resolve("recipes.db");
if (!fs.existsSync(localDbPath)) {
  console.log(`⚠️ Local recipes.db not found at ${localDbPath}. Nothing to migrate.`);
  process.exit(0);
}

const localDb = createClient({
  url: `file:${localDbPath}`
});

// 2. Connect to remote Turso database
const remoteDb = createClient({
  url: tursoUrl,
  authToken: tursoAuthToken || undefined
});

// 3. Ensure schema exists on remote Turso
await remoteDb.execute(`
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
    isFavourite INTEGER DEFAULT 0,
    imageAttachment TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log("✅ Remote Turso schema verified.");

// 4. Fetch local recipes
const localResult = await localDb.execute("SELECT * FROM recipes ORDER BY id ASC");
const localRecipes = localResult.rows;
console.log(`📦 Found ${localRecipes.length} local recipes in ${localDbPath}.`);

let migratedCount = 0;
let skippedCount = 0;

for (const r of localRecipes) {
  const title = (r.title || "").trim();
  if (!title) continue;

  // Check if recipe with same title exists on remote
  const existing = await remoteDb.execute({
    sql: "SELECT id FROM recipes WHERE LOWER(TRIM(title)) = LOWER(TRIM(?))",
    args: [title]
  });

  if (existing.rows.length > 0) {
    skippedCount++;
    console.log(`⏭️  Skipping existing recipe: "${title}"`);
  } else {
    await remoteDb.execute({
      sql: `INSERT INTO recipes (title, servings, prepTimeMinutes, cookTimeMinutes, ingredients, instructions, tags, rating, difficulty, isFavourite, imageAttachment, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        title,
        r.servings || 4,
        r.prepTimeMinutes || 0,
        r.cookTimeMinutes || 0,
        r.ingredients || "[]",
        r.instructions || "[]",
        r.tags || "[]",
        r.rating || 0,
        r.difficulty || "Easy",
        r.isFavourite ? 1 : 0,
        r.imageAttachment || null,
        r.createdAt || new Date().toISOString(),
        r.updatedAt || new Date().toISOString()
      ]
    });
    migratedCount++;
    console.log(`✅ Migrated: "${title}"`);
  }
}

console.log("==================================================");
console.log(`🎉 Migration complete!`);
console.log(`   - Successfully Migrated: ${migratedCount}`);
console.log(`   - Skipped (Duplicates):  ${skippedCount}`);
console.log(`   - Total Local Recipes:   ${localRecipes.length}`);
console.log("==================================================");
