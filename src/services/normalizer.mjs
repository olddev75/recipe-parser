/**
 * @file src/services/normalizer.mjs
 * @description Ingredient Extraction, Fraction Parser & Unit Normalization Module.
 * Standardizes units, parses unicode and fractional string quantities (e.g., "½", "1 1/2"),
 * and performs bidirectional Metric <-> Imperial measurement conversions.
 *
 * Inputs: Raw ingredient strings or partial ingredient objects
 * Outputs: Clean ingredient objects { name, quantity, unit, substitutions }
 */

export const STANDARD_UNIT_MAP = {
  g: "g", gram: "g", grams: "g",
  kg: "kg", kilogram: "kg", kilograms: "kg",
  ml: "ml", milliliter: "ml", milliliters: "ml", millilitre: "ml", millilitres: "ml",
  l: "l", liter: "l", liters: "l", litre: "l", litres: "l",
  oz: "oz", ounce: "oz", ounces: "oz",
  "fl oz": "fl oz", floz: "fl oz", "fluid ounce": "fl oz", "fluid ounces": "fl oz",
  cup: "cup", cups: "cup",
  tbsp: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp",
  tsp: "tsp", teaspoon: "tsp", teaspoons: "tsp",
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
  pinch: "pinch", pinches: "pinch",
  clove: "clove", cloves: "clove",
  can: "can", cans: "can",
  slice: "slice", slices: "slice",
  piece: "piece", pieces: "piece"
};

/**
 * Converts fraction characters or fraction strings to floating point numbers.
 * @param {string} val 
 * @returns {number}
 */
export function parseFraction(val) {
  if (typeof val === "number") return val;
  if (!val || typeof val !== "string") return 1;

  let str = val.trim();
  
  // Replace unicode fractions
  const unicodeFractions = {
    "½": 0.5, "⅓": 0.333, "⅔": 0.667, "¼": 0.25, "¾": 0.75,
    "⅕": 0.2, "⅖": 0.4, "⅗": 0.6, "⅘": 0.8, "⅙": 0.167,
    "⅚": 0.833, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875
  };

  Object.keys(unicodeFractions).forEach(char => {
    if (str.includes(char)) {
      const parts = str.split(char);
      const leading = parts[0] ? parseFloat(parts[0]) : 0;
      str = (leading + unicodeFractions[char]).toString();
    }
  });

  if (str.includes("/")) {
    const spaceParts = str.split(/\s+/);
    if (spaceParts.length === 2) {
      const whole = parseFloat(spaceParts[0]) || 0;
      const fractionParts = spaceParts[1].split("/");
      if (fractionParts.length === 2) {
        return whole + (parseFloat(fractionParts[0]) / parseFloat(fractionParts[1]));
      }
    } else {
      const parts = str.split("/");
      if (parts.length === 2) {
        return parseFloat(parts[0]) / parseFloat(parts[1]);
      }
    }
  }

  const parsed = parseFloat(str);
  return isNaN(parsed) ? 1 : parsed;
}

/**
 * Sanitizes and extracts quantity, unit, name, and substitutions from an ingredient input.
 * @param {string|Object} rawIng 
 * @returns {{name: string, quantity: number, unit: string, substitutions: Array<string>}}
 */
export function sanitizeAndExtractIngredient(rawIng) {
  if (!rawIng) return { name: "Ingredient", quantity: 1, unit: "", substitutions: [] };

  if (typeof rawIng === "object" && rawIng !== null) {
    let q = rawIng.quantity !== undefined ? parseFraction(rawIng.quantity) : 1;
    let u = (rawIng.unit || "").toString().toLowerCase().trim();
    u = STANDARD_UNIT_MAP[u] || u;
    let n = (rawIng.name || "").toString().trim();
    let subs = Array.isArray(rawIng.substitutions) ? rawIng.substitutions : [];

    return { name: n || "Ingredient", quantity: Math.round(q * 100) / 100, unit: u, substitutions: subs };
  }

  if (typeof rawIng === "string") {
    let text = rawIng.replace(/^[-•*]\s*/, "").trim();
    
    // Pattern matching quantity, unit, and name
    const match = text.match(/^([\d\/\.\s½⅓⅔¼¾]+)\s*([a-zA-Z]+)?\s+(.*)$/);
    if (match) {
      let rawQty = match[1].trim();
      let unit = (match[2] || "").toLowerCase().trim();
      let name = (match[3] || "").trim();

      const mappedUnit = STANDARD_UNIT_MAP[unit];
      if (!mappedUnit) {
        name = `${unit} ${name}`.trim();
        unit = "";
      } else {
        unit = mappedUnit;
      }

      return {
        name,
        quantity: Math.round(parseFraction(rawQty) * 100) / 100,
        unit,
        substitutions: []
      };
    }

    return { name: text, quantity: 1, unit: "", substitutions: [] };
  }

  return { name: "Ingredient", quantity: 1, unit: "", substitutions: [] };
}

/**
 * Bidirectional Metric <-> Imperial Unit Converter helper
 * @param {{quantity: number, unit: string, name: string}} item 
 * @param {string} targetSystem "metric" | "imperial"
 * @returns {{quantity: number, unit: string}}
 */
export function convertMeasurementUnit(item, targetSystem) {
  let qty = item.quantity;
  let unit = (item.unit || "").toLowerCase();

  if (targetSystem === "metric") {
    if (unit === "lb" || unit === "lbs" || unit === "pound" || unit === "pounds") {
      const grams = qty * 453.592;
      if (grams >= 1000) { qty = Number((grams / 1000).toFixed(2)); unit = "kg"; }
      else { qty = Math.round(grams); unit = "g"; }
    } else if (unit === "oz" || unit === "ounce" || unit === "ounces") {
      qty = Math.round(qty * 28.3495); unit = "g";
    } else if (unit === "fl oz" || unit === "floz") {
      qty = Math.round(qty * 29.5735); unit = "ml";
    } else if (unit === "cup" || unit === "cups") {
      qty = Math.round(qty * 240); unit = "ml";
    } else if (unit === "pt" || unit === "pint" || unit === "pints") {
      qty = Math.round(qty * 473.176); unit = "ml";
    } else if (unit === "qt" || unit === "quart" || unit === "quarts") {
      qty = Number((qty * 0.946353).toFixed(2)); unit = "l";
    } else if (unit === "gal" || unit === "gallon" || unit === "gallons") {
      qty = Number((qty * 3.78541).toFixed(2)); unit = "l";
    }
  } else if (targetSystem === "imperial") {
    if (unit === "g" || unit === "gram" || unit === "grams") {
      const oz = qty * 0.035274;
      if (oz >= 16) { qty = Number((oz / 16).toFixed(2)); unit = "lb"; }
      else { qty = Number(oz.toFixed(1)); unit = "oz"; }
    } else if (unit === "kg" || unit === "kilogram" || unit === "kilograms") {
      qty = Number((qty * 2.20462).toFixed(2)); unit = "lb";
    } else if (unit === "ml" || unit === "milliliter" || unit === "milliliters") {
      if (qty >= 120) { qty = Number((qty / 240).toFixed(2)); unit = "cup"; }
      else { qty = Number((qty * 0.033814).toFixed(1)); unit = "fl oz"; }
    } else if (unit === "l" || unit === "liter" || unit === "liters") {
      qty = Number((qty * 4.22675).toFixed(2)); unit = "cup";
    }
  }

  return { quantity: Number(qty.toFixed(2)), unit };
}

export default {
  STANDARD_UNIT_MAP,
  parseFraction,
  sanitizeAndExtractIngredient,
  convertMeasurementUnit
};
