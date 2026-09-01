/**
 * @file public/js/auth.js
 * @description User Session, Profile Settings, Admin Roles, and Google Sign-In Module.
 * Controls auth modal toggling, local login/register forms, profile avatar uploads,
 * password change requests, admin user management lists, and Google One-Tap SDK integration.
 */

import store from "./store.js";
import { apiRequest, showNotification } from "./api.js";
import { t } from "./i18n.js";

let selectedProfileAvatarBase64 = null;

/**
 * Initializes session on app startup
 */
export async function checkActiveUserSession() {
  try {
    const res = await apiRequest("/api/auth/me");
    if (res.authenticated && res.user) {
      store.setCurrentUser(res.user);
    } else {
      store.setCurrentUser(null);
    }
  } catch (err) {
    store.setCurrentUser(null);
  }
  updateAuthUI();
}

/**
 * Updates navbar user account buttons and avatar display
 */
export function updateAuthUI() {
  const user = store.currentUser;
  const authContainer = document.getElementById("authControlsContainer");
  if (!authContainer) return;

  if (user) {
    const avatarSrc = user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(user.displayName)}`;
    authContainer.innerHTML = `
      <button onclick="window.openProfileModal()" class="flex items-center gap-2 bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-200 transition cursor-pointer shadow-sm">
        <img src="${avatarSrc}" class="w-5 h-5 rounded-full object-cover border border-amber-400/50" alt="${user.displayName}">
        <span class="max-w-[100px] truncate">${user.displayName}</span>
        ${user.isAdmin ? '<span class="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded font-bold">Admin</span>' : ''}
      </button>
    `;
  } else {
    authContainer.innerHTML = `
      <button onclick="window.openAuthModal('login')" class="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs transition cursor-pointer shadow">
        ${t("signIn")}
      </button>
    `;
  }
}

/**
 * Opens Auth Modal in "login" or "register" mode
 * @param {'login'|'register'} mode 
 */
export function openAuthModal(mode = "login") {
  const modal = document.getElementById("authModal");
  if (!modal) return;

  const title = document.getElementById("authModalTitle");
  const submitBtn = document.getElementById("authSubmitBtn");
  const switchPrompt = document.getElementById("authSwitchPromptText");
  const switchBtn = document.getElementById("authSwitchBtnText");
  const nameContainer = document.getElementById("authNameInputContainer");

  if (mode === "register") {
    if (title) title.innerText = "Create Your Account";
    if (submitBtn) submitBtn.innerText = "Register Account";
    if (switchPrompt) switchPrompt.innerText = "Already have an account?";
    if (switchBtn) switchBtn.innerText = "Sign In";
    if (nameContainer) nameContainer.classList.remove("hidden");
    modal.dataset.mode = "register";
  } else {
    if (title) title.innerText = "Sign In to Recipe Deck";
    if (submitBtn) submitBtn.innerText = "Sign In";
    if (switchPrompt) switchPrompt.innerText = "Don't have an account?";
    if (switchBtn) switchBtn.innerText = "Register";
    if (nameContainer) nameContainer.classList.add("hidden");
    modal.dataset.mode = "login";
  }

  modal.classList.remove("hidden");
  initializeGoogleSignIn();
}

export function closeAuthModal() {
  const modal = document.getElementById("authModal");
  if (modal) modal.classList.add("hidden");
}

export function toggleAuthMode() {
  const modal = document.getElementById("authModal");
  const currentMode = modal?.dataset.mode || "login";
  openAuthModal(currentMode === "login" ? "register" : "login");
}

/**
 * Handles Local Email / Password Form Submission
 * @param {Event} e 
 */
export async function handleAuthFormSubmit(e) {
  e.preventDefault();
  const modal = document.getElementById("authModal");
  const mode = modal?.dataset.mode || "login";

  const email = document.getElementById("authEmailInput")?.value?.trim();
  const password = document.getElementById("authPasswordInput")?.value;
  const displayName = document.getElementById("authNameInput")?.value?.trim();

  if (!email || !password) {
    return showNotification("error", "Please provide both email and password.");
  }

  try {
    let endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
    let body = mode === "register" ? { email, password, displayName } : { email, password };

    const res = await apiRequest(endpoint, { method: "POST", body });
    store.setCurrentUser(res.user);
    updateAuthUI();
    closeAuthModal();
    showNotification("success", res.message || `Welcome, ${res.user.displayName}!`);
  } catch (err) {
    showNotification("error", err.message);
  }
}

/**
 * Initializes Google Identity Services (GIS) One-Tap / Sign-In Button
 */
export function initializeGoogleSignIn() {
  if (typeof google === "undefined" || !google.accounts || !google.accounts.id) return;

  try {
    google.accounts.id.initialize({
      client_id: "10984759483-mock-client-id.apps.googleusercontent.com",
      callback: handleGoogleIdTokenResponse,
      auto_select: false
    });

    const btnContainer = document.getElementById("googleSignInButtonContainer");
    if (btnContainer) {
      btnContainer.innerHTML = "";
      google.accounts.id.renderButton(btnContainer, {
        theme: "outline",
        size: "large",
        width: "100%",
        text: "continue_with"
      });
    }
  } catch (e) {
    console.warn("[Google Auth] GIS client notice:", e.message);
  }
}

/**
 * Handles Google ID Token Response callback
 * @param {Object} response 
 */
export async function handleGoogleIdTokenResponse(response) {
  if (!response || !response.credential) return;

  try {
    const res = await apiRequest("/api/auth/google", {
      method: "POST",
      body: { credential: response.credential }
    });

    store.setCurrentUser(res.user);
    updateAuthUI();
    closeAuthModal();
    showNotification("success", res.message || `Welcome ${res.user.displayName}!`);
  } catch (err) {
    showNotification("error", "Google Sign-In failed: " + err.message);
  }
}

// ─── PROFILE MODAL & USER SETTINGS ───────────────────────────────────────────

export function openProfileModal() {
  const modal = document.getElementById("profileModal");
  if (!modal) return;

  const user = store.currentUser;
  if (!user) return openAuthModal("login");

  document.getElementById("profileDisplayNameInput").value = user.displayName || "";
  document.getElementById("profileBioInput").value = user.bio || "";
  
  const avatarImg = document.getElementById("profileAvatarPreview");
  if (avatarImg) {
    avatarImg.src = user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(user.displayName)}`;
  }

  // Admin Panel Tab Visibility
  const adminTabBtn = document.getElementById("profileTabAdminBtn");
  if (adminTabBtn) {
    if (user.isAdmin) {
      adminTabBtn.classList.remove("hidden");
      fetchAdminUserList();
    } else {
      adminTabBtn.classList.add("hidden");
    }
  }

  modal.classList.remove("hidden");
}

export function closeProfileModal() {
  const modal = document.getElementById("profileModal");
  if (modal) modal.classList.add("hidden");
}

export async function handleProfileAvatarSelected(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    selectedProfileAvatarBase64 = event.target.result;
    const img = document.getElementById("profileAvatarPreview");
    if (img) img.src = selectedProfileAvatarBase64;
  };
  reader.readAsDataURL(file);
}

export async function handleSaveProfileSubmit(e) {
  e.preventDefault();
  const displayName = document.getElementById("profileDisplayNameInput")?.value?.trim();
  const bio = document.getElementById("profileBioInput")?.value?.trim();
  const avatar = selectedProfileAvatarBase64 || store.currentUser?.avatar;

  if (!displayName) return showNotification("error", "Display name cannot be empty.");

  try {
    const res = await apiRequest("/api/auth/profile", {
      method: "PUT",
      body: { displayName, bio, avatar }
    });

    store.setCurrentUser(res.user);
    updateAuthUI();
    closeProfileModal();
    showNotification("success", "Profile updated successfully!");
  } catch (err) {
    showNotification("error", err.message);
  }
}

export async function handleChangePasswordSubmit(e) {
  e.preventDefault();
  const currentPassword = document.getElementById("currentPasswordInput")?.value;
  const newPassword = document.getElementById("newPasswordInput")?.value;

  if (!currentPassword || !newPassword) {
    return showNotification("error", "Please provide both current and new password.");
  }

  try {
    const res = await apiRequest("/api/auth/password", {
      method: "PUT",
      body: { currentPassword, newPassword }
    });

    showNotification("success", res.message || "Password updated successfully!");
    document.getElementById("changePasswordForm")?.reset();
  } catch (err) {
    showNotification("error", err.message);
  }
}

export async function handleSignOut() {
  try {
    await apiRequest("/api/auth/logout", { method: "POST" });
    store.setCurrentUser(null);
    updateAuthUI();
    closeProfileModal();
    showNotification("info", "Signed out successfully.");
  } catch (err) {
    showNotification("error", err.message);
  }
}

// ─── ADMIN USER ROLES MANAGEMENT ─────────────────────────────────────────────

export async function fetchAdminUserList() {
  const container = document.getElementById("adminUserListContainer");
  if (!container) return;

  try {
    const res = await apiRequest("/api/admin/users");
    const users = res.users || [];

    container.innerHTML = users.map(u => `
      <div class="flex items-center justify-between p-3 bg-slate-800/80 rounded-xl border border-slate-700/70 text-xs">
        <div class="flex items-center gap-3">
          <img src="${u.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(u.displayName)}`}" class="w-8 h-8 rounded-full border border-slate-600 object-cover">
          <div>
            <div class="font-bold text-slate-200">${u.displayName} ${u.isAdmin ? '👑' : ''}</div>
            <div class="text-[11px] text-slate-400">${u.email}</div>
          </div>
        </div>
        <button onclick="window.toggleUserAdminRole('${u.id}', ${!u.isAdmin})" class="px-2.5 py-1 rounded-lg font-bold border transition cursor-pointer ${u.isAdmin ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-rose-600/20 hover:text-rose-300' : 'bg-slate-700 text-slate-300 hover:bg-amber-500/20 hover:text-amber-300'}">
          ${u.isAdmin ? 'Revoke Admin' : 'Make Admin'}
        </button>
      </div>
    `).join("");
  } catch (err) {
    container.innerHTML = `<div class="text-rose-400 text-xs p-2">Failed to load admin user list: ${err.message}</div>`;
  }
}

export async function toggleUserAdminRole(userId, newIsAdmin) {
  try {
    const res = await apiRequest(`/api/admin/users/${userId}/role`, {
      method: "PUT",
      body: { isAdmin: newIsAdmin }
    });

    showNotification("success", res.message);
    fetchAdminUserList();
  } catch (err) {
    showNotification("error", err.message);
  }
}

window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.toggleAuthMode = toggleAuthMode;
window.handleAuthFormSubmit = handleAuthFormSubmit;
window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.handleProfileAvatarSelected = handleProfileAvatarSelected;
window.handleSaveProfileSubmit = handleSaveProfileSubmit;
window.handleChangePasswordSubmit = handleChangePasswordSubmit;
window.handleSignOut = handleSignOut;
window.toggleUserAdminRole = toggleUserAdminRole;

export default {
  checkActiveUserSession,
  updateAuthUI,
  openAuthModal,
  closeAuthModal,
  toggleAuthMode,
  handleAuthFormSubmit,
  initializeGoogleSignIn,
  openProfileModal,
  closeProfileModal,
  handleProfileAvatarSelected,
  handleSaveProfileSubmit,
  handleChangePasswordSubmit,
  handleSignOut,
  fetchAdminUserList,
  toggleUserAdminRole
};
