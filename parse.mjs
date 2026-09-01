import { GoogleGenAI, Type } from "@google/genai";
import "dotenv/config";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const recipeSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    servings: { type: Type.NUMBER },
    prepTimeMinutes: { type: Type.NUMBER },
    cookTimeMinutes: { type: Type.NUMBER },
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

async function parseRecipe(rawText) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: `Extract this recipe into clean structured JSON with standard measurements and common ingredient/brand substitutions:\n\n${rawText}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: recipeSchema,
      }
    });

    console.log("\n--- Parsed Recipe Output ---");
    console.log(JSON.stringify(JSON.parse(response.text), null, 2));
  } catch (err) {
    console.error("Error parsing recipe:", err);
  }
}

const samplePastedText = `
Quick Chook Curry! 🍲
Grab 500g chicken breast, diced. 1 can (400ml) coconut cream, 2 tbsp green curry paste, 1 tbsp fish sauce, and some Thai basil leaves.
Fry paste in a splash of coconut cream for 2 mins, add chicken until sealed, pour the rest of the cream and fish sauce, simmer 15 mins. Toss in basil at the end. Serves 4.
`;

parseRecipe(samplePastedText);
