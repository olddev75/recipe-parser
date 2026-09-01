/**
 * @file public/js/store.js
 * @description Centralized Reactive State Store for Recipe Deck V2.0.
 * Manages global application state (currentUser, activeRecipe, originalRecipe,
 * unitSystem, currentServings, checklist, timers, siteLanguage, tagFilters).
 */

export const store = {
  currentUser: null,           // { id, email, displayName, bio, avatar, isAdmin }
  activeRecipe: null,          // Current displayed recipe object
  originalRecipe: null,        // Original untranslated/unscaled baseline recipe
  currentServingsCount: 4,     // Active portion count
  baseServingsCount: 4,        // Original recipe portion baseline
  currentUnitSystem: 'metric', // 'metric' | 'imperial'
  siteLanguage: 'en',          // 'en', 'es', 'fr', 'de', 'it', 'th', 'ja', 'vi', 'zh', 'pt'
  activeTagFilter: 'All',      // Selected sidebar tag filter pill
  favouritesOnlyFilter: false, // Filter for starred recipes
  searchQuery: '',             // Active live search query
  
  // Checklist State
  checkedIngredients: new Set(),
  checkedInstructions: new Set(),

  // Cook Mode & Timers State
  isCookModeActive: false,
  cookStepIndex: 0,
  activeTimers: {},            // id -> { interval, remainingSeconds, totalSeconds, isRunning, label }

  // Listeners
  listeners: [],

  subscribe(fn) {
    this.listeners.push(fn);
  },

  notify() {
    this.listeners.forEach(fn => fn(this));
  },

  setCurrentUser(user) {
    this.currentUser = user;
    this.notify();
  },

  setActiveRecipe(recipe) {
    if (recipe) {
      this.activeRecipe = JSON.parse(JSON.stringify(recipe));
      this.originalRecipe = JSON.parse(JSON.stringify(recipe));
      this.baseServingsCount = recipe.servings || 4;
      this.currentServingsCount = this.baseServingsCount;
      this.checkedIngredients.clear();
      this.checkedInstructions.clear();
    } else {
      this.activeRecipe = null;
      this.originalRecipe = null;
    }
    this.notify();
  },

  setUnitSystem(unit) {
    this.currentUnitSystem = unit;
    this.notify();
  },

  setSiteLanguage(lang) {
    this.siteLanguage = lang;
    localStorage.setItem("recipe_deck_site_lang", lang);
    this.notify();
  }
};

export default store;
