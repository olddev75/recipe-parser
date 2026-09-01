# 📖 Project: Recipe Deck (Universal Ingestion & Kitchen Engine)

## 1. System Overview & Core Philosophy
A responsive, distraction-free web application that normalises chaotic recipe sources (social media posts, unstructured text dumps, camera snapshots) into structured data with persistent storage, dynamic portion scaling, live metric/imperial unit conversions, and print-ready formatting.

---

## 2. Technical Stack & Current State

* **Runtime:** Node.js (ES Modules / `.mjs`)
* **Backend Framework:** Express.js (serving static files and REST API)
* **AI/LLM Engine:** `@google/genai` (Google Gen AI SDK targeting `gemini-3.6-flash` with strict JSON Schema generation)
* **Database / Storage:** LibSQL / Turso Cloud (`@libsql/client`) with serverless cloud persistence and local fallback (`file:recipes.db`)
* **Frontend:** Vanilla HTML5/JavaScript + Tailwind CSS CDN
* **Device Targeting:** Responsive Desktop, Tablet, and Mobile views + `@media print` CSS engine

---

## 3. Features Implemented (Completed ✅)

- [x] **LLM Structured Parser & Intelligent Categorized Tagging:**
  - Extracts title, servings, prep time, cook time, ingredients (with numeric quantities and units), step-by-step instructions, ingredient substitutions, and clean normalized tags (Protein, Diet/Nutrition, Cuisine/Style).
- [x] **Intelligent Recipe Self-Check Engine:**
  - Auto-calibrates cooking & prep times, cleans HTML entities and bullets, verifies fractional measurements, and standardizes tags.
- [x] **Background Web URL Scraping & Keep Confirmation:**
  - Asynchronous scraping with auto-save and prominent highlighted Keep/Discard review banner.
- [x] **Recipe Sharing & Socials:**
  - Full modal with URL parameters payload generation, direct links for WhatsApp, Facebook, X (Twitter), Pinterest, Email, and formatted text clipboard copying.
- [x] **Multimodal Ingestion (OCR / Screenshot) & Flexible Photo Attachments:**
  - Base64 image payload support with drag-and-drop uploader, automatic client-side canvas compression, in-app photo replace/remove controls, and thumbnail previews.
- [x] **Turso Cloud Persistence (`@libsql/client`):**
  - High-performance cloud database with serverless SQLite compatibility and automatic offline local SQLite fallback.
- [x] **Bidirectional Measurement Unit Conversion & Scaling:**
  - Instant switching between Metric (`g`, `kg`, `ml`, `l`) and Imperial (`oz`, `lb`, `fl oz`, `cup`, `pt`, `qt`, `gal`) with dynamic portion scaling.
- [x] **Interactive Live Search & Dynamic Tag Filter Pills:**
  - Real-time library filtering by title, ingredients, and auto-generated tag filter pills with recipe count badges.
- [x] **Print Formatter:**
  - Dedicated print stylesheet hiding UI chrome, formatting cleanly into a 2-column layout.
- [x] **10-Language Internationalization (i18n):**
  - Full UI localization in English, Spanish, French, German, Italian, Thai, Japanese, Vietnamese, Chinese, and Portuguese.

---

## 4. Product Backlog & Roadmap

### Phase 1: Kitchen Usability & Cook Mode (Completed ✅)
- [x] **Interactive Cook Mode View:** Full-screen step-by-step display with large tap targets.
- [x] **Screen Wake Lock API:** Prevent tablet/phone display from sleeping while cooking (`navigator.wakeLock`).
- [x] **Interactive Checklist:** Strikethrough ingredients and steps with a tap to track prep progress.
- [x] **Kitchen Timers:** In-line timer buttons generated next to instructions containing durations (e.g., *"simmer 15 mins"* -> clickable 15m timer).

### Phase 2: Input Expansion & Direct URL Scraping (Completed ✅)
- [x] **Web URL Scraper:** Extract `schema.org/Recipe` JSON-LD from direct food blog links with Gemini fallback.
- [x] **Clipboard Auto-Paste:** Quick paste button for fast mobile onboarding.

### Phase 3: Data Management, Portability & Cloud Sync (Completed ✅)
- [x] **Export / Backup Engine:** One-click JSON database backup (`GET /api/export/json`) and Obsidian/Notion compatible Markdown ZIP export (`GET /api/export/markdown`).
- [x] **Bulk Recipe Import & Sync:** Import complete JSON backups (`POST /api/recipes/bulk-import`) with duplicate detection.
- [x] **Recipe Editing / Correction:** In-app manual edit modal to tweak quantities, ingredients, steps, tags, and times (`PUT /api/recipes/:id`).
- [x] **Category & Favourite Filtering:** Star/favourite recipes (`PATCH /api/recipes/:id/favourite`), quick sidebar star toggles, and dedicated 'Favourites Only' filter deck.
- [x] **Turso Cloud Database:** Unified `@libsql/client` integration with remote synchronization (`scripts/migrate-to-turso.mjs`).

### Phase 4: Full PWA & Local Network Deployment
- [x] **Progressive Web App (PWA):** Web manifest and service worker caching for offline access (`public/manifest.json`, `public/sw.js`, and install/offline UI).
- [ ] **Systemd Service:** Configure auto-start on Linux Mint / Home Server boot.
