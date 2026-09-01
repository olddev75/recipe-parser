/**
 * @file public/js/cook-mode.js
 * @description Interactive Cook Mode, Wake Lock & Web Audio Timer Module.
 * Provides a distraction-free fullscreen step runner with large touch targets,
 * prevents screen sleep via Screen Wake Lock API (`navigator.wakeLock`), parses step timers,
 * manages concurrent kitchen countdown timers, and synthesizes audio chimes using Web Audio API.
 */

import store from "./store.js";
import { showNotification } from "./api.js";
import { renderIngredientsList } from "./deck.js";

let wakeLockSentinel = null;
let audioCtx = null;

/**
 * Synthesizes a kitchen timer chime using Web Audio API (no external MP3 asset needed)
 */
export function playTimerChime() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
    osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.5);

    gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
  } catch (e) {
    console.warn("Web Audio chime notice:", e.message);
  }
}

/**
 * Requests Screen Wake Lock API to prevent device screen from dimming/sleeping
 */
export async function requestWakeLock() {
  if ("wakeLock" in navigator) {
    try {
      wakeLockSentinel = await navigator.wakeLock.request("screen");
      console.log("🔒 Screen Wake Lock active for Cook Mode");
    } catch (err) {
      console.warn("Screen Wake Lock request failed:", err.message);
    }
  }
}

export function releaseWakeLock() {
  if (wakeLockSentinel) {
    wakeLockSentinel.release().then(() => {
      wakeLockSentinel = null;
      console.log("🔓 Screen Wake Lock released");
    });
  }
}

/**
 * Launches Fullscreen Cook Mode Overlay
 */
export function enterCookMode() {
  if (!store.activeRecipe) return;
  store.isCookModeActive = true;
  store.cookStepIndex = 0;

  const overlay = document.getElementById("cookModeOverlay");
  if (overlay) overlay.classList.remove("hidden");

  requestWakeLock();
  renderCookModeStep();
}

export function exitCookMode() {
  store.isCookModeActive = false;

  const overlay = document.getElementById("cookModeOverlay");
  if (overlay) overlay.classList.add("hidden");

  releaseWakeLock();
}

export function cookModeNextStep() {
  const steps = store.activeRecipe?.instructions || [];
  if (store.cookStepIndex < steps.length - 1) {
    store.cookStepIndex++;
    renderCookModeStep();
  }
}

export function cookModePrevStep() {
  if (store.cookStepIndex > 0) {
    store.cookStepIndex--;
    renderCookModeStep();
  }
}

/**
 * Renders active step in Cook Mode overlay
 */
export function renderCookModeStep() {
  const recipe = store.activeRecipe;
  if (!recipe) return;

  const steps = recipe.instructions || [];
  const idx = store.cookStepIndex;
  const currentStep = steps[idx] || "Done!";

  document.getElementById("cookStepTitle").innerText = `Step ${idx + 1} of ${steps.length}`;
  document.getElementById("cookStepBody").innerText = currentStep;

  // Progress Bar
  const progressPercent = Math.round(((idx + 1) / steps.length) * 100);
  const progressBar = document.getElementById("cookProgressBar");
  if (progressBar) progressBar.style.width = `${progressPercent}%`;

  // Drawer Ingredients Sync
  renderCookDrawerIngredients();
}

export function toggleCookDrawer() {
  const drawer = document.getElementById("cookIngredientsDrawer");
  if (drawer) drawer.classList.toggle("translate-y-full");
}

export function renderCookDrawerIngredients() {
  const container = document.getElementById("cookDrawerIngredientsList");
  if (!container || !store.activeRecipe) return;

  const items = store.activeRecipe.ingredients || [];
  container.innerHTML = items.map(ing => `
    <li class="p-2 bg-slate-800/80 rounded border border-slate-700/60 text-xs flex justify-between text-slate-200">
      <span class="font-bold text-amber-400">${ing.quantity || ""} ${ing.unit || ""}</span>
      <span>${ing.name}</span>
    </li>
  `).join("");
}

// ─── KITCHEN COUNTDOWN TIMERS ────────────────────────────────────────────────

export function startKitchenTimer(seconds, label = "Kitchen Timer") {
  const timerId = "timer_" + Date.now();
  
  const timerObj = {
    id: timerId,
    remainingSeconds: seconds,
    totalSeconds: seconds,
    label,
    isRunning: true,
    interval: null
  };

  timerObj.interval = setInterval(() => {
    if (timerObj.remainingSeconds > 0) {
      timerObj.remainingSeconds--;
      renderTimersBar();
    } else {
      clearInterval(timerObj.interval);
      timerObj.isRunning = false;
      playTimerChime();
      showNotification("success", `🔔 Timer Finished: "${label}"!`);
      renderTimersBar();
    }
  }, 1000);

  store.activeTimers[timerId] = timerObj;
  renderTimersBar();
  showNotification("info", `⏱️ Started timer for ${label}`);
}

export function stopKitchenTimer(timerId) {
  const timer = store.activeTimers[timerId];
  if (timer) {
    if (timer.interval) clearInterval(timer.interval);
    delete store.activeTimers[timerId];
    renderTimersBar();
  }
}

export function renderTimersBar() {
  const container = document.getElementById("activeTimersContainer");
  if (!container) return;

  const timerKeys = Object.keys(store.activeTimers);
  if (timerKeys.length === 0) {
    container.classList.add("hidden");
    return;
  }

  container.classList.remove("hidden");
  container.innerHTML = timerKeys.map(id => {
    const t = store.activeTimers[id];
    const mins = Math.floor(t.remainingSeconds / 60);
    const secs = (t.remainingSeconds % 60).toString().padStart(2, "0");
    const isDone = t.remainingSeconds === 0;

    return `
      <div class="px-3 py-1.5 rounded-xl border flex items-center gap-2 text-xs font-bold shadow ${isDone ? 'bg-rose-600 text-white animate-bounce border-rose-500' : 'bg-slate-800 text-amber-400 border-amber-500/40'}">
        <span>⏱️ ${t.label}: ${mins}:${secs}</span>
        <button onclick="window.stopKitchenTimer('${id}')" class="hover:text-white p-0.5">✕</button>
      </div>
    `;
  }).join("");
}

window.enterCookMode = enterCookMode;
window.exitCookMode = exitCookMode;
window.cookModeNextStep = cookModeNextStep;
window.cookModePrevStep = cookModePrevStep;
window.toggleCookDrawer = toggleCookDrawer;
window.startKitchenTimer = startKitchenTimer;
window.stopKitchenTimer = stopKitchenTimer;

export default {
  playTimerChime,
  requestWakeLock,
  releaseWakeLock,
  enterCookMode,
  exitCookMode,
  cookModeNextStep,
  cookModePrevStep,
  toggleCookDrawer,
  startKitchenTimer,
  stopKitchenTimer,
  renderTimersBar
};
