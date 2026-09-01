/**
 * @file public/js/deck.js
 * @description Recipe Card Rendering, Unit Conversion, Scaling & Sidebar Library Deck Module.
 * Controls recipe display, portion scaling (+/-), Metric <-> Imperial conversion,
 * dynamic tag filter pills, live search filtering, share modal, and edit modal.
 */

import store from "./store.js";
import { apiRequest, showNotification } from "./api.js";
import { t } from "./i18n.js";
import { convertMeasurementUnit } from "../../src/services/normalizer.mjs";

export let cachedSavedRecipes = [];

/**
 * Loads recipes list from backend and populates sidebar deck
 */
export async function updateSavedUI() {
  try {
    const recipes = await apiRequest("/api/recipes");
    cachedSavedRecipes = recipes || [];
    renderTagFilterPills();
    filterSavedRecipes();
  } catch (err) {
    console.warn("Could not load recipes library:", err.message);
  }
}

/**
 * Renders Tag Filter Pills in sidebar
 */
export function renderTagFilterPills() {
  const container = document.getElementById("tagFilterContainer");
  if (!container) return;

  const tagCounts = {};
  cachedSavedRecipes.forEach(r => {
    (r.tags || []).forEach(t => {
      const clean = t.startsWith("#") ? t.slice(1) : t;
      tagCounts[clean] = (tagCounts[clean] || 0) + 1;
    });
  });

  const sortedTags = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]);

  let html = `
    <button onclick="window.setTagFilter('All')" class="px-2.5 py-1 rounded-full text-xs font-semibold border transition cursor-pointer ${store.activeTagFilter === 'All' ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow' : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-600'}">
      All (${cachedSavedRecipes.length})
    </button>
  `;

  sortedTags.forEach(tag => {
    const count = tagCounts[tag];
    const isActive = store.activeTagFilter === tag;
    html += `
      <button onclick="window.setTagFilter('${tag}')" class="px-2.5 py-1 rounded-full text-xs font-semibold border transition cursor-pointer ${isActive ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow' : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-600'}">
        #${tag} (${count})
      </button>
    `;
  });

  container.innerHTML = html;
}

export function setTagFilter(tag) {
  store.activeTagFilter = tag;
  renderTagFilterPills();
  filterSavedRecipes();
}

export function filterSavedRecipes() {
  const container = document.getElementById("savedList");
  if (!container) return;

  const query = (document.getElementById("searchInput")?.value || "").toLowerCase().trim();
  store.searchQuery = query;

  const filtered = cachedSavedRecipes.filter(r => {
    if (store.favouritesOnlyFilter && !r.isFavourite) return false;
    if (store.activeTagFilter !== "All") {
      const tags = (r.tags || []).map(t => (t.startsWith("#") ? t.slice(1) : t).toLowerCase());
      if (!tags.includes(store.activeTagFilter.toLowerCase())) return false;
    }
    if (query) {
      const matchTitle = (r.title || "").toLowerCase().includes(query);
      const matchTag = (r.tags || []).some(t => t.toLowerCase().includes(query));
      const matchIng = (r.ingredients || []).some(i => (i.name || "").toLowerCase().includes(query));
      if (!matchTitle && !matchTag && !matchIng) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="text-xs text-slate-500 text-center py-6">No recipes found</div>`;
    return;
  }

  container.innerHTML = filtered.map(r => `
    <div onclick="window.loadSavedRecipeById(${r.id})" class="p-3 bg-slate-800/80 hover:bg-slate-700/80 border ${store.activeRecipe && store.activeRecipe.id === r.id ? 'border-amber-400 ring-1 ring-amber-400' : 'border-slate-700/80'} rounded-xl cursor-pointer transition shadow-sm flex items-center justify-between group">
      <div class="truncate pr-2">
        <div class="font-bold text-xs text-slate-200 group-hover:text-amber-400 transition truncate">${r.title}</div>
        <div class="text-[10px] text-slate-400 mt-0.5">${r.prepTimeMinutes + r.cookTimeMinutes}m • ${r.ingredients?.length || 0} items ${!r.isPublic ? '• 🔒 Private' : ''}</div>
      </div>
      <button onclick="event.stopPropagation(); window.toggleFavourite(${r.id})" class="text-amber-400 text-base hover:scale-110 transition p-1">
        ${r.isFavourite ? '★' : '☆'}
      </button>
    </div>
  `).join("");
}

/**
 * Loads selected recipe from library into main card view
 * @param {number} id 
 */
export async function loadSavedRecipeById(id) {
  try {
    const recipe = await apiRequest(`/api/recipes/${id}`);
    store.setActiveRecipe(recipe);
    renderRecipe();
    filterSavedRecipes();
  } catch (err) {
    showNotification("error", err.message);
  }
}

/**
 * Main Recipe Card Renderer
 */
export function renderRecipe() {
  const recipe = store.activeRecipe;
  if (!recipe) return;

  document.getElementById("emptyState")?.classList.add("hidden");
  document.getElementById("recipeCard")?.classList.remove("hidden");

  document.getElementById("recipeTitle").innerText = recipe.title;
  document.getElementById("prepMeta").innerText = `${t("prep")}: ${recipe.prepTimeMinutes || 0}m`;
  document.getElementById("cookMeta").innerText = `${t("cook")}: ${recipe.cookTimeMinutes || 0}m`;
  document.getElementById("yieldMeta").innerText = `${t("yield")}: ${store.currentServingsCount} ${t("servings")}`;
  document.getElementById("currentServings").innerText = store.currentServingsCount;

  // Star Rating & Difficulty
  const ratingEl = document.getElementById("ratingDisplay");
  if (ratingEl) ratingEl.innerText = "★".repeat(recipe.rating || 0) + "☆".repeat(5 - (recipe.rating || 0));

  const diffEl = document.getElementById("difficultyDisplay");
  if (diffEl) diffEl.innerText = recipe.difficulty || "Easy";

  // Favourite Button
  const favIcon = document.getElementById("favouriteIcon");
  const favBtn = document.getElementById("favouriteBtn");
  if (favIcon && favBtn) {
    favIcon.innerText = recipe.isFavourite ? "★" : "☆";
    favBtn.className = recipe.isFavourite
      ? "px-2.5 py-1.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow"
      : "px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-amber-300 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow";
  }

  // Render Tags
  const tagsContainer = document.getElementById("recipeTagsContainer");
  if (tagsContainer) {
    tagsContainer.innerHTML = (recipe.tags || []).map(tag => `
      <span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-center gap-1">
        #${tag.startsWith('#') ? tag.slice(1) : tag}
      </span>
    `).join("");
  }

  // Render Ingredients
  renderIngredientsList();

  // Render Instructions
  renderInstructionsList();

  // Recipe Image Attachment
  const photoContainer = document.getElementById("recipePhotoContainer");
  const photoImg = document.getElementById("recipePhotoImg");
  const dropZone = document.getElementById("recipePhotoDropZone");

  if (recipe.imageAttachment) {
    if (photoImg) photoImg.src = recipe.imageAttachment;
    if (photoContainer) photoContainer.classList.remove("hidden");
    if (dropZone) dropZone.classList.add("hidden");
  } else {
    if (photoContainer) photoContainer.classList.add("hidden");
    if (dropZone) dropZone.classList.remove("hidden");
  }
}

/**
 * Renders ingredient items list with portion scaling & metric/imperial conversion
 */
export function renderIngredientsList() {
  const container = document.getElementById("ingredientsList");
  if (!container || !store.activeRecipe) return;

  const ratio = store.currentServingsCount / (store.baseServingsCount || 4);
  const items = store.activeRecipe.ingredients || [];

  container.innerHTML = items.map((ing, idx) => {
    let scaledQty = (ing.quantity || 1) * ratio;
    const converted = convertMeasurementUnit({ ...ing, quantity: scaledQty }, store.currentUnitSystem);
    const isChecked = store.checkedIngredients.has(idx);

    return `
      <li onclick="window.toggleIngredientCheck(${idx})" class="p-2.5 rounded-lg border transition cursor-pointer flex items-start gap-2.5 text-xs ${isChecked ? 'bg-slate-900/50 border-slate-800 checked-item' : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800'}">
        <input type="checkbox" ${isChecked ? 'checked' : ''} onclick="event.stopPropagation(); window.toggleIngredientCheck(${idx})" class="mt-0.5 rounded border-slate-600 text-amber-500 focus:ring-amber-500 cursor-pointer">
        <div class="flex-1">
          <span class="font-bold text-amber-400">${converted.quantity} ${converted.unit}</span>
          <span class="text-slate-200 ml-1">${converted.name || ing.name}</span>
          ${ing.substitutions?.length ? `<span class="block text-[10px] text-slate-400 mt-0.5">Substitutes: ${ing.substitutions.join(", ")}</span>` : ''}
        </div>
      </li>
    `;
  }).join("");
}

/**
 * Renders instructions list with checklist & kitchen timers
 */
export function renderInstructionsList() {
  const container = document.getElementById("instructionsList");
  if (!container || !store.activeRecipe) return;

  const steps = store.activeRecipe.instructions || [];
  const timerRegex = /\b(\d+(?:\.\d+)?)\s*(minutes|minute|mins|min|hours|hour|hrs|hr)\b/gi;

  container.innerHTML = steps.map((step, idx) => {
    const isChecked = store.checkedInstructions.has(idx);
    
    // Auto-detect clickable inline timers
    let stepHtml = step;
    let match;
    while ((match = timerRegex.exec(step)) !== null) {
      const durationStr = match[0];
      const val = parseFloat(match[1]);
      const unit = match[2].toLowerCase();
      const seconds = Math.round(unit.startsWith("h") ? val * 3600 : val * 60);

      const timerBtn = `<button onclick="event.stopPropagation(); window.startKitchenTimer(${seconds}, '${durationStr}')" class="inline-flex items-center gap-1 px-2 py-0.5 mx-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 rounded font-bold text-[11px] transition cursor-pointer">⏱️ ${durationStr}</button>`;
      stepHtml = stepHtml.replace(durationStr, timerBtn);
    }

    return `
      <li onclick="window.toggleInstructionCheck(${idx})" class="p-3 rounded-xl border transition cursor-pointer flex items-start gap-3 text-xs ${isChecked ? 'bg-slate-900/50 border-slate-800 checked-item' : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800'}">
        <span class="font-bold text-slate-400 min-w-[20px] text-right">${idx + 1}.</span>
        <div class="flex-1 text-slate-200 leading-relaxed">${stepHtml}</div>
      </li>
    `;
  }).join("");
}

export function scaleServings(delta) {
  store.currentServingsCount = Math.max(1, store.currentServingsCount + delta);
  renderRecipe();
}

export function setUnitSystem(unit) {
  store.setUnitSystem(unit);
  renderRecipe();

  const btnMetric = document.getElementById("btnMetric");
  const btnImperial = document.getElementById("btnImperial");
  if (btnMetric && btnImperial) {
    if (unit === "metric") {
      btnMetric.className = "px-3 py-1.5 rounded-md bg-amber-500 text-slate-950 font-bold cursor-pointer";
      btnImperial.className = "px-3 py-1.5 rounded-md text-slate-400 hover:text-white cursor-pointer";
    } else {
      btnImperial.className = "px-3 py-1.5 rounded-md bg-amber-500 text-slate-950 font-bold cursor-pointer";
      btnMetric.className = "px-3 py-1.5 rounded-md text-slate-400 hover:text-white cursor-pointer";
    }
  }
}

export function toggleIngredientCheck(idx) {
  if (store.checkedIngredients.has(idx)) store.checkedIngredients.delete(idx);
  else store.checkedIngredients.add(idx);
  renderIngredientsList();
}

export function toggleInstructionCheck(idx) {
  if (store.checkedInstructions.has(idx)) store.checkedInstructions.delete(idx);
  else store.checkedInstructions.add(idx);
  renderInstructionsList();
}

export function resetChecks() {
  store.checkedIngredients.clear();
  store.checkedInstructions.clear();
  renderRecipe();
}

export async function toggleFavourite(id) {
  const target = cachedSavedRecipes.find(r => r.id === id);
  if (!target) return;

  const newFavStatus = !target.isFavourite;
  try {
    const res = await apiRequest(`/api/recipes/${id}/favourite`, {
      method: "PATCH",
      body: { isFavourite: newFavStatus }
    });

    target.isFavourite = res.recipe.isFavourite;
    if (store.activeRecipe && store.activeRecipe.id === id) {
      store.activeRecipe.isFavourite = res.recipe.isFavourite;
      renderRecipe();
    }
    filterSavedRecipes();
  } catch (err) {
    showNotification("error", err.message);
  }
}

export async function saveCurrentRecipe() {
  const recipe = store.activeRecipe;
  if (!recipe) return;

  if (!store.currentUser) {
    showNotification("warning", "Please sign in to save recipes to your collection.");
    return window.openAuthModal("login");
  }

  try {
    let res;
    if (recipe.id) {
      res = await apiRequest(`/api/recipes/${recipe.id}`, {
        method: "PUT",
        body: recipe
      });
    } else {
      res = await apiRequest("/api/recipes", {
        method: "POST",
        body: recipe
      });
    }

    store.setActiveRecipe(res.recipe);
    await updateSavedUI();
    showNotification("success", "🎉 Recipe saved to your collection!");
  } catch (err) {
    showNotification("error", err.message);
  }
}

export async function deleteActiveRecipe() {
  const recipe = store.activeRecipe;
  if (!recipe || !recipe.id) {
    store.setActiveRecipe(null);
    document.getElementById("recipeCard")?.classList.add("hidden");
    document.getElementById("emptyState")?.classList.remove("hidden");
    return;
  }

  try {
    await apiRequest(`/api/recipes/${recipe.id}`, { method: "DELETE" });
    store.setActiveRecipe(null);
    document.getElementById("recipeCard")?.classList.add("hidden");
    document.getElementById("emptyState")?.classList.remove("hidden");
    await updateSavedUI();
    showNotification("info", "Recipe deleted from your library.");
  } catch (err) {
    showNotification("error", err.message);
  }
}

window.setTagFilter = setTagFilter;
window.loadSavedRecipeById = loadSavedRecipeById;
window.scaleServings = scaleServings;
window.setUnitSystem = setUnitSystem;
window.toggleIngredientCheck = toggleIngredientCheck;
window.toggleInstructionCheck = toggleInstructionCheck;
window.resetChecks = resetChecks;
window.toggleFavourite = toggleFavourite;
window.saveCurrentRecipe = saveCurrentRecipe;
window.deleteActiveRecipe = deleteActiveRecipe;

export default {
  updateSavedUI,
  renderTagFilterPills,
  setTagFilter,
  filterSavedRecipes,
  loadSavedRecipeById,
  renderRecipe,
  scaleServings,
  setUnitSystem,
  saveCurrentRecipe,
  deleteActiveRecipe
};
