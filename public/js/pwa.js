/**
 * @file public/js/pwa.js
 * @description Progressive Web App (PWA) Offline & Service Worker Module.
 * Registers `sw.js`, monitors network online/offline status badges,
 * and handles deferred PWA installation prompts (`beforeinstallprompt`).
 */

import { showNotification } from "./api.js";

let deferredInstallPrompt = null;

export function initPwaServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js")
        .then(reg => {
          console.log("⚡ Service Worker registered with scope:", reg.scope);
        })
        .catch(err => {
          console.warn("Service Worker registration failed:", err);
        });
    });
  }

  // Network Status Listeners
  window.addEventListener("online", updateOnlineStatusUI);
  window.addEventListener("offline", updateOnlineStatusUI);
  updateOnlineStatusUI();

  // PWA Install Prompt
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const installBtn = document.getElementById("pwaInstallBtn");
    if (installBtn) installBtn.classList.remove("hidden");
  });
}

export function updateOnlineStatusUI() {
  const badge = document.getElementById("onlineStatusBadge");
  if (!badge) return;

  if (navigator.onLine) {
    badge.className = "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400";
    badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Online`;
  } else {
    badge.className = "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 border border-amber-500/30 text-amber-400";
    badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Offline Mode`;
    showNotification("warning", "Working offline. Saved recipes are available via Service Worker cache.");
  }
}

export async function promptPwaInstall() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  if (outcome === "accepted") {
    showNotification("success", "Recipe Deck installed to home screen!");
  }
  deferredInstallPrompt = null;
  const installBtn = document.getElementById("pwaInstallBtn");
  if (installBtn) installBtn.classList.add("hidden");
}

window.promptPwaInstall = promptPwaInstall;

export default { initPwaServiceWorker, updateOnlineStatusUI, promptPwaInstall };
