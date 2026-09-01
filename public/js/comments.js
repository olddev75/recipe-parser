/**
 * @file public/js/comments.js
 * @description Threaded Recipe Discussion Comments & Cooking Notes Module.
 * Fetches, posts, and deletes user comments on active recipes.
 */

import store from "./store.js";
import { apiRequest, showNotification } from "./api.js";

/**
 * Loads comments for current active recipe
 */
export async function loadRecipeComments() {
  const container = document.getElementById("commentsListContainer");
  if (!container || !store.activeRecipe || !store.activeRecipe.id) return;

  try {
    const res = await apiRequest(`/api/recipes/${store.activeRecipe.id}/comments`);
    const comments = res.comments || [];

    if (comments.length === 0) {
      container.innerHTML = `<div class="text-xs text-slate-500 italic py-2">No comments or cooking notes yet. Be the first to add one!</div>`;
      return;
    }

    const currentUser = store.currentUser;

    container.innerHTML = comments.map(c => `
      <div class="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 text-xs">
        <div class="flex items-center justify-between mb-1">
          <span class="font-bold text-slate-300">${c.userDisplayName}</span>
          <div class="flex items-center gap-2">
            <span class="text-[10px] text-slate-500">${new Date(c.createdAt).toLocaleDateString()}</span>
            ${(currentUser && (currentUser.id === c.userId || currentUser.isAdmin)) ? `<button onclick="window.deleteComment(${c.id})" class="text-rose-400 hover:text-rose-300 text-[10px]">Delete</button>` : ''}
          </div>
        </div>
        <p class="text-slate-300 leading-relaxed">${c.comment}</p>
      </div>
    `).join("");
  } catch (err) {
    console.warn("Could not load comments:", err.message);
  }
}

/**
 * Submits a new comment on active recipe
 * @param {Event} e 
 */
export async function handlePostCommentSubmit(e) {
  e.preventDefault();
  const recipe = store.activeRecipe;
  if (!recipe || !recipe.id) return;

  if (!store.currentUser) {
    showNotification("warning", "Please sign in to leave a comment.");
    return window.openAuthModal("login");
  }

  const input = document.getElementById("commentInput");
  const comment = input?.value?.trim();

  if (!comment) {
    return showNotification("error", "Comment text cannot be empty.");
  }

  try {
    await apiRequest(`/api/recipes/${recipe.id}/comments`, {
      method: "POST",
      body: { comment }
    });

    if (input) input.value = "";
    showNotification("success", "Comment posted!");
    loadRecipeComments();
  } catch (err) {
    showNotification("error", err.message);
  }
}

/**
 * Deletes a comment
 * @param {number} commentId 
 */
export async function deleteComment(commentId) {
  try {
    await apiRequest(`/api/comments/${commentId}`, { method: "DELETE" });
    showNotification("info", "Comment deleted.");
    loadRecipeComments();
  } catch (err) {
    showNotification("error", err.message);
  }
}

window.loadRecipeComments = loadRecipeComments;
window.handlePostCommentSubmit = handlePostCommentSubmit;
window.deleteComment = deleteComment;

export default { loadRecipeComments, handlePostCommentSubmit, deleteComment };
