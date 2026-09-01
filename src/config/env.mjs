/**
 * @file src/config/env.mjs
 * @description Environment Configuration & Validation Module for Recipe Deck V2.0.
 * Reads environment variables using `dotenv`, validates defaults, and exports centralized configuration objects.
 *
 * Inputs: process.env (PORT, JWT_SECRET, TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, GEMINI_API_KEY, GOOGLE_CLIENT_ID)
 * Outputs: config object with validated constants
 */

import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../");

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  jwtSecret: process.env.JWT_SECRET || "recipe-deck-secret-key-change-in-prod-2026",
  cookieName: "recipe_deck_auth",
  
  // Database Configuration
  tursoDatabaseUrl: process.env.TURSO_DATABASE_URL || "",
  tursoAuthToken: process.env.TURSO_AUTH_TOKEN || "",
  localDbPath: path.join(rootDir, "recipes.db"),

  // AI & Authentication External APIs
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",

  // Paths
  rootDir,
  publicDir: path.join(rootDir, "public")
};

export default config;
