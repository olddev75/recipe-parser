/**
 * @file public/js/api.js
 * @description Centralized Fetch API Client Module for Recipe Deck V2.0.
 * Encapsulates HTTP requests to `/api/*` endpoints, automatically handles JSON serialization,
 * include credentials for HTTP-Only cookie auth, and displays toast notifications.
 */

/**
 * Toast Notification Helper
 * @param {'success'|'error'|'info'|'warning'} type 
 * @param {string} message 
 */
export function showNotification(type, message) {
  const container = document.getElementById("bgToastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  const bgColors = {
    success: "bg-emerald-600/90 border-emerald-500 text-white",
    error: "bg-rose-600/90 border-rose-500 text-white",
    warning: "bg-amber-600/90 border-amber-500 text-white",
    info: "bg-slate-800/90 border-slate-700 text-slate-200"
  };

  toast.className = `p-3 rounded-xl border text-xs font-semibold shadow-lg backdrop-blur flex items-center justify-between gap-2 pointer-events-auto transition-all duration-300 transform translate-y-2 opacity-0 ${bgColors[type] || bgColors.info}`;
  toast.innerHTML = `
    <span>${message}</span>
    <button onclick="this.parentElement.remove()" class="opacity-70 hover:opacity-100 p-0.5">✕</button>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.remove("translate-y-2", "opacity-0");
  }, 10);

  setTimeout(() => {
    toast.classList.add("opacity-0", "translate-y-2");
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

/**
 * Universal JSON Fetch Wrapper
 * @param {string} url 
 * @param {Object} [options] 
 * @returns {Promise<any>}
 */
export async function apiRequest(url, options = {}) {
  const config = {
    headers: { "Content-Type": "application/json", ...options.headers },
    credentials: "same-origin",
    ...options
  };

  if (config.body && typeof config.body === "object" && !(config.body instanceof FormData)) {
    config.body = JSON.stringify(config.body);
  }

  try {
    const res = await fetch(url, config);
    
    if (res.status === 503) {
      const data = await res.json().catch(() => ({}));
      if (data.__offline) {
        showNotification("warning", data.error || "You are offline. Connection required for this action.");
        throw new Error(data.error || "Offline");
      }
    }

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `Server request failed (HTTP ${res.status})`);
    }

    return data;
  } catch (err) {
    if (err.name === "TypeError" && err.message?.includes("fetch")) {
      showNotification("error", "Network connection unavailable. Please check your connection.");
    }
    throw err;
  }
}

export default { showNotification, apiRequest };
