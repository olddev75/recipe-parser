# 📖 Project: Recipe Deck (Universal Ingestion & Kitchen Engine)

## 1. System Overview & Core Philosophy
A responsive, distraction-free web application that normalises chaotic recipe sources (social media posts, unstructured text dumps, camera snapshots) into structured data with persistent storage, dynamic portion scaling, live metric/imperial unit conversions, and print-ready formatting.

---

## 2. Technical Stack & Current State

* **Runtime:** Node.js (ES Modules / `.mjs`)
* **Backend Framework:** Express.js (serving static files and REST API)
* **AI/LLM Engine:** `@google/genai` (Google Gen AI SDK targeting `gemini-3.6-flash` with strict JSON Schema generation)
* **Database / Storage:** SQLite (`sqlite3` + `sqlite`) with persistent file storage (`recipes.db`)
* **Frontend:** Vanilla HTML5/JavaScript + Tailwind CSS CDN
* **Device Targeting:** Responsive Desktop, Tablet, and Mobile views + `@media print` CSS engine

---

## 3. Features Implemented (Completed ✅)

- [x] **LLM Structured Parser & Intelligent Categorized Tagging:**
  - Extracts title, servings, prep time, cook time, ingredients (with numeric quantities and units), step-by-step instructions, ingredient substitutions, and clean normalized tags (Protein, Diet/Nutrition, Cuisine/Style).
- [x] **Intelligent Recipe Translation:**
  - Native culinary translations via Gemini 3.6-flash (`POST /api/translate`) with local language persistence in `localStorage`, instant Original/Translated toggling, and in-memory translation caching.
- [x] **"Add Next" & Reset Workflow:**
  - Fast single-click actions ("➕ Add Next Recipe", "✕ Close") that clear active views, reset inputs and previews, and immediately refocus the ingestion form.
- [x] **Multimodal Ingestion (OCR / Screenshot) & Flexible Photo Attachments:**
  - Base64 image payload support (up to 50MB) with drag-and-drop file uploader, automatic client-side canvas compression (max 1200px), in-app photo replace/remove controls, and thumbnail previews.
- [x] **Permanent SQLite Persistence:**
  - Relational schema storing metadata, JSON stringified lists, timestamps, tags, and attached photos with REST endpoints (`GET`, `POST`, `PUT`, `DELETE`, and `PATCH /api/recipes/:id/image`).
- [x] **Live Unit Conversion:**
  - Instant client-side switching between Metric (`g`, `ml`) and Imperial (`oz`, `fl oz`).
- [x] **Dynamic Servings Scaler:**
  - Real-time multiplier adjusting ingredient weights and volumes dynamically.
- [x] **Interactive Live Search & Dynamic Tag Filter Pills:**
  - Real-time library filtering by title, ingredients, and auto-generated tag filter pills with recipe count badges.
- [x] **Print Formatter:**
  - Dedicated print stylesheet hiding UI chrome, formatting cleanly into a 2-column layout.

---

## 4. Product Backlog & Roadmap

### Phase 1: Kitchen Usability & Cook Mode (Completed ✅)
- [x] **Interactive Cook Mode View:** Full-screen step-by-step display with large tap targets.
- [x] **Screen Wake Lock API:** Prevent tablet/phone display from sleeping while cooking (`navigator.wakeLock`).
- [x] **Interactive Checklist:** Strikethrough ingredients and steps with a tap to track prep progress.
- [x] **Kitchen Timers:** In-line timer buttons generated next to instructions containing durations (e.g., *"simmer 15 mins"* -> clickable 15m timer).

### Phase 2: Input Expansion & Direct URL Scraping (Completed ✅)
- [x] **Web URL Scraper:** Extract `schema.org/Recipe` JSON-LD from direct food blog links (BBC Good Food, RecipeTin Eats, Allrecipes) with Gemini fallback.
- [x] **Clipboard Auto-Paste:** Quick paste button for fast mobile onboarding.

### Phase 3: Data Management & Portability
- [x] **Export / Backup Engine:** One-click JSON database backup (`GET /api/export/json`) and Obsidian/Notion compatible Markdown ZIP export (`GET /api/export/markdown`).
- [x] **Recipe Editing / Correction:** In-app manual edit modal to tweak misidentified quantities, ingredients, steps, tags, and times (`PUT /api/recipes/:id`).
- [x] **Category & Favourite Filtering:** Star/favourite recipes (`PATCH /api/recipes/:id/favourite`), quick sidebar star toggles, and dedicated 'Favourites Only' filter deck.

### Phase 4: Full PWA & Local Network Deployment
- [ ] **Progressive Web App (PWA):** Web manifest and service worker caching for offline access.
- [ ] **Systemd Service:** Configure auto-start on Linux Mint / Home Server boot.
