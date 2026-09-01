// =============================================================================
// Recipe Deck — Service Worker v1
// Strategy:
//   App Shell  → Cache-First (HTML, CSS, icons, manifest)
//   /api/recipes → Stale-While-Revalidate (instant offline + background refresh)
//   AI routes (/api/parse, /api/scrape, /api/parse-image) → Network-Only
//     + offline fallback JSON error to toast in UI
// =============================================================================

const CACHE_NAME = "recipe-deck-v1";
const RECIPES_CACHE = "recipe-deck-api-v1";

const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "https://cdn.tailwindcss.com"
];

// ── Install: pre-cache App Shell ─────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Attempt each shell asset individually — Tailwind CDN may fail in some envs
      return Promise.allSettled(APP_SHELL.map((url) => cache.add(url)));
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches ────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME && k !== RECIPES_CACHE)
            .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: routing logic ──────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin + GET requests (let POST/PUT/DELETE pass through)
  if (request.method !== "GET") return;

  // ── 1. GET /api/recipes — Stale-While-Revalidate ──────────────────────────
  if (url.pathname === "/api/recipes") {
    event.respondWith(staleWhileRevalidate(request, RECIPES_CACHE));
    return;
  }

  // ── 2. AI / Scrape routes — Network-Only with offline fallback ────────────
  const aiRoutes = ["/api/parse", "/api/parse-image", "/api/scrape"];
  if (aiRoutes.some((r) => url.pathname.startsWith(r))) {
    // These are POST — will fall through via method check above.
    // Just in case GET hits: network-only.
    event.respondWith(fetch(request).catch(() => offlineAiResponse()));
    return;
  }

  // ── 3. App Shell (HTML, manifest, icons) — Cache-First ───────────────────
  if (
    url.pathname === "/" ||
    url.pathname.endsWith(".html") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.json"
  ) {
    event.respondWith(cacheFirst(request, CACHE_NAME));
    return;
  }

  // ── 4. Tailwind CDN — Cache-First (update only on new SW version) ─────────
  if (url.hostname === "cdn.tailwindcss.com") {
    event.respondWith(cacheFirst(request, CACHE_NAME));
    return;
  }

  // ── 5. All other API calls (export, favourites, etc.) — Network-First ─────
  event.respondWith(networkFirst(request, RECIPES_CACHE));
});

// ─── Strategy Helpers ────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response("Offline — content unavailable", { status: 503 });
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || new Response(
      JSON.stringify({ error: "You are offline and no cached data is available." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  // Kick off network fetch regardless
  const networkPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  // Return stale immediately if we have it, otherwise await network
  return cached || (await networkPromise) || new Response(
    JSON.stringify([]),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function offlineAiResponse() {
  return new Response(
    JSON.stringify({
      __offline: true,
      error: "You are offline. AI import and web scraping require an internet connection."
    }),
    { status: 503, headers: { "Content-Type": "application/json" } }
  );
}
