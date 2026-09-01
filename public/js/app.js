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

let selectedImageBase64 = null;
let selectedImageMime = "image/jpeg";

export function switchTab(tab) {
  const textBtn = document.getElementById("tabTextBtn");
  const urlBtn = document.getElementById("tabUrlBtn");
  const imageBtn = document.getElementById("tabImageBtn");

  const textPanel = document.getElementById("tabTextPanel");
  const urlPanel = document.getElementById("tabUrlPanel");
  const imagePanel = document.getElementById("tabImagePanel");

  if (!textBtn || !urlBtn || !imageBtn) return;

  const activeClass = "flex-1 py-1.5 rounded-lg bg-amber-500 text-slate-950 shadow transition cursor-pointer text-center font-bold";
  const inactiveClass = "flex-1 py-1.5 rounded-lg text-slate-400 hover:text-white transition cursor-pointer text-center font-bold";

  if (tab === "url") {
    textBtn.className = inactiveClass; urlBtn.className = activeClass; imageBtn.className = inactiveClass;
    textPanel.classList.add("hidden"); urlPanel.classList.remove("hidden"); urlPanel.classList.add("flex"); imagePanel.classList.add("hidden");
  } else if (tab === "image") {
    textBtn.className = inactiveClass; urlBtn.className = inactiveClass; imageBtn.className = activeClass;
    textPanel.classList.add("hidden"); urlPanel.classList.add("hidden"); imagePanel.classList.remove("hidden"); imagePanel.classList.add("flex");
  } else {
    textBtn.className = activeClass; urlBtn.className = inactiveClass; imageBtn.className = inactiveClass;
    textPanel.classList.remove("hidden"); textPanel.classList.add("flex"); urlPanel.classList.add("hidden"); imagePanel.classList.add("hidden");
  }
}

export async function pasteFromClipboard(targetId) {
  try {
    const text = await navigator.clipboard.readText();
    const input = document.getElementById(targetId);
    if (input && text) {
      input.value = text;
      showNotification("success", "📋 Pasted from clipboard!");
    }
  } catch (err) {
    showNotification("error", "Clipboard access denied or unavailable.");
  }
}

export function handleImageSelected(e) {
  const file = e.target.files[0];
  if (!file) return;

  selectedImageMime = file.type || "image/jpeg";
  const reader = new FileReader();
  reader.onload = (event) => {
    selectedImageBase64 = event.target.result.split(",")[1];
    const promptText = document.getElementById("imageDropPromptText");
    if (promptText) promptText.innerText = `Selected photo: ${file.name}`;
    showNotification("info", `📷 Photo selected: ${file.name}`);
  };
  reader.readAsDataURL(file);
}

export async function handleParseImage() {
  if (!selectedImageBase64) {
    return showNotification("error", "Please select a photo or screenshot first.");
  }

  const btn = document.getElementById("parseImageBtn");
  if (btn) { btn.innerHTML = `<span>⏳ Extracting from photo...</span>`; btn.disabled = true; }

  try {
    const recipe = await apiRequest("/api/parse-image", {
      method: "POST",
      body: { imageBase64: selectedImageBase64, mimeType: selectedImageMime }
    });

    store.setActiveRecipe(recipe);
    renderRecipe();
    await saveCurrentRecipe();
    showNotification("success", `Extracted & saved "${recipe.title}"!`);
  } catch (err) {
    showNotification("error", err.message);
  } finally {
    if (btn) { btn.innerHTML = `<span>Extract Recipe from Photo</span>`; btn.disabled = false; }
  }
}

export function openShareModal() {
  const modal = document.getElementById("shareModal");
  if (modal) modal.classList.remove("hidden");
}

export function copyShareableLink() {
  const url = window.location.href;
  navigator.clipboard.writeText(url).then(() => {
    showNotification("success", "✅ Direct recipe link copied to clipboard!");
  });
}

export function copyFormattedText() {
  const recipe = store.activeRecipe;
  if (!recipe) return;

  const ingText = (recipe.ingredients || []).map(i => `- ${i.quantity || ''} ${i.unit || ''} ${i.name}`).join("\n");
  const instText = (recipe.instructions || []).map((s, idx) => `${idx + 1}. ${s}`).join("\n");
  const fullText = `📖 ${recipe.title}\n\n🛒 INGREDIENTS:\n${ingText}\n\n🍳 INSTRUCTIONS:\n${instText}`;

  navigator.clipboard.writeText(fullText).then(() => {
    showNotification("success", "📋 Formatted recipe text copied to clipboard!");
  });
}

export async function handleRecipePhotoSelected(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    const base64 = event.target.result;
    if (store.activeRecipe) {
      store.activeRecipe.imageAttachment = base64;
      renderRecipe();
      if (store.activeRecipe.id) {
        await apiRequest(`/api/recipes/${store.activeRecipe.id}/image`, {
          method: "PATCH",
          body: { imageAttachment: base64 }
        });
      }
      showNotification("success", "📸 Photo attached to recipe!");
    }
  };
  reader.readAsDataURL(file);
}

export async function removeRecipePhoto() {
  if (store.activeRecipe) {
    store.activeRecipe.imageAttachment = null;
    renderRecipe();
    if (store.activeRecipe.id) {
      await apiRequest(`/api/recipes/${store.activeRecipe.id}/image`, {
        method: "PATCH",
        body: { imageAttachment: null }
      });
    }
    showNotification("info", "📸 Photo removed from recipe.");
  }
}

export function toggleFavouritesFilter() {
  store.favouritesOnlyFilter = !store.favouritesOnlyFilter;
  const btn = document.getElementById("favouritesFilterBtn");
  if (btn) {
    btn.className = store.favouritesOnlyFilter
      ? "px-2.5 py-1 bg-amber-500 text-slate-950 font-bold border border-amber-400 rounded-lg text-xs transition cursor-pointer shadow"
      : "px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-400 rounded-lg text-xs font-bold transition cursor-pointer";
  }
  import("./deck.js").then(m => m.filterSavedRecipes());
}

window.switchTab = switchTab;
window.pasteFromClipboard = pasteFromClipboard;
window.handleImageSelected = handleImageSelected;
window.handleParseImage = handleParseImage;
window.handleParseText = handleParseText;
window.handleScrapeUrl = handleScrapeUrl;
window.openShareModal = openShareModal;
window.copyShareableLink = copyShareableLink;
window.copyFormattedText = copyFormattedText;
window.handleRecipePhotoSelected = handleRecipePhotoSelected;
window.removeRecipePhoto = removeRecipePhoto;
window.toggleFavouritesFilter = toggleFavouritesFilter;

document.addEventListener("DOMContentLoaded", initApp);

export default { initApp };
