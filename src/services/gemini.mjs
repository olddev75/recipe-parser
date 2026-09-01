/**
 * @file src/services/gemini.mjs
 * @description Google Gen AI SDK Integration Module for Recipe Deck V2.0.
 * Uses `@google/genai` to generate structured JSON recipe content from raw text prompts
 * or base64 screenshot image OCR, featuring resilient multi-model fallbacks and timeouts.
 *
 * Inputs: text prompts or multimodal inline image content
 * Outputs: Structured recipe JSON matching recipeSchema
 */

import { GoogleGenAI, Type } from "@google/genai";
import config from "../config/env.mjs";

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

export const recipeSchema = {
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

/**
 * Enforces a maximum execution time on an async promise.
 * @param {Promise} promise 
 * @param {number} ms 
 * @param {string} timeoutMsg 
 */
export function promiseWithTimeout(promise, ms, timeoutMsg = "Operation timed out") {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMsg)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

/**
 * Resilient Multi-Model Gemini Generator with Auto-Fallback.
 * Tries `gemini-2.5-flash` -> `gemini-2.0-flash` -> `gemini-1.5-flash` -> `gemini-1.5-pro`
 * @param {string|Array} contents 
 * @param {Object} [overrideConfig] 
 * @returns {Promise<Object>}
 */
export async function generateRecipeContent(contents, overrideConfig = {}) {
  const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"];
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
            ...overrideConfig
          }
        }),
        25000,
        `Gemini model ${model} timed out after 25s`
      );
      return response;
    } catch (err) {
      console.warn(`[Gemini Service] Model ${model} failed (${err.message?.slice(0, 100)}). Trying fallback model...`);
      lastErr = err;
    }
  }

  throw lastErr || new Error("Failed to parse recipe with all Gemini AI models");
}

export default {
  ai,
  recipeSchema,
  generateRecipeContent,
  promiseWithTimeout
};
