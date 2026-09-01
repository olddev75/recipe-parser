/**
 * @file public/js/app.js
 * @description Main Bootstrap & Event Coordinator for Recipe Deck V2.0.
 * Imports state store and ES modules, attaches global event handlers,
 * and executes initial startup initialization.
 */

import store from "./store.js";
import { apiRequest, showNotification } from "./api.js";
import { applySiteLanguage, t } from "./i18n.js";
import { checkActiveUserSession, openAuthModal } from "./auth.js";
import { updateSavedUI, renderRecipe, saveCurrentRecipe, deleteActiveRecipe } from "./deck.js";
import { initPwaServiceWorker } from "./pwa.js";

/**
 * Startup Initialization Sequence
 */
async function initApp() {
  console.log("🚀 Initializing Recipe Deck V2.0...");

  // 1. Initialize PWA Service Worker & Online Status
  initPwaServiceWorker();

  // 2. Load Preferred Site Language
  const savedLang = localStorage.getItem("recipe_deck_site_lang") || "en";
  applySiteLanguage(savedLang);

  // 3. Verify Active User Session
  await checkActiveUserSession();

  // 4. Load Saved Recipes Deck
  await updateSavedUI();

  // 5. Attach Input Handlers
  attachGlobalEventHandlers();
}

/**
 * Global Event Handlers Setup
 */
function attachGlobalEventHandlers() {
  // Search input live filtering
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      import("./deck.js").then(m => m.filterSavedRecipes());
    });
  }

  // Site Language Selector
  const langSelect = document.getElementById("siteLanguageSelect");
  if (langSelect) {
    langSelect.addEventListener("change", (e) => {
      applySiteLanguage(e.target.value);
    });
  }

  // Auth Form Submit
  const authForm = document.getElementById("authForm");
  if (authForm) {
    authForm.addEventListener("submit", (e) => {
      import("./auth.js").then(m => m.handleAuthFormSubmit(e));
    });
  }

  // Profile Form Submit
  const profileForm = document.getElementById("profileForm");
  if (profileForm) {
    profileForm.addEventListener("submit", (e) => {
      import("./auth.js").then(m => m.handleSaveProfileSubmit(e));
    });
  }

  // Change Password Form Submit
  const passForm = document.getElementById("changePasswordForm");
  if (passForm) {
    passForm.addEventListener("submit", (e) => {
      import("./auth.js").then(m => m.handleChangePasswordSubmit(e));
    });
  }
}

// Ingestion Actions
export async function handleParseText() {
  const rawText = document.getElementById("rawTextInput")?.value?.trim();
  if (!rawText) return showNotification("error", "Please paste or type recipe text first.");

  const btn = document.getElementById("parseTextBtn");
  if (btn) { btn.innerHTML = `<span>⏳ Extracting...</span>`; btn.disabled = true; }

  try {
    const recipe = await apiRequest("/api/parse", {
      method: "POST",
      body: { rawText }
    });

    store.setActiveRecipe(recipe);
    renderRecipe();
    await saveCurrentRecipe();
    showNotification("success", `Parsed & saved "${recipe.title}"!`);
  } catch (err) {
    showNotification("error", err.message);
  } finally {
    if (btn) { btn.innerHTML = `<span>${t("importText")}</span>`; btn.disabled = false; }
  }
}

export async function handleScrapeUrl() {
  const url = document.getElementById("urlInput")?.value?.trim();
  if (!url) return showNotification("error", "Please enter a valid website link.");

  const btn = document.getElementById("scrapeUrlBtn");
  if (btn) { btn.innerHTML = `<span>⏳ Scraping...</span>`; btn.disabled = true; }

  try {
    const recipe = await apiRequest("/api/scrape", {
      method: "POST",
      body: { url }
    });

    store.setActiveRecipe(recipe);
    renderRecipe();
    await saveCurrentRecipe();
    showNotification("success", `Scraped & saved "${recipe.title}"!`);
  } catch (err) {
    showNotification("error", err.message);
  } finally {
    if (btn) { btn.innerHTML = `<span>${t("importWebUrl")}</span>`; btn.disabled = false; }
  }
}

window.handleParseText = handleParseText;
window.handleScrapeUrl = handleScrapeUrl;

document.addEventListener("DOMContentLoaded", initApp);

export default { initApp };
