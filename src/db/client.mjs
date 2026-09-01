/**
 * @file src/db/client.mjs
 * @description LibSQL / Turso Database Client Pooling & Persistence Module.
 * Manages database connection initialization, remote Turso Cloud synchronization,
 * and resilient local SQLite fallback (`file:recipes.db`) if offline or URL fetch fails.
 *
 * Exports:
 * - db: raw LibSQL client instance
 * - dbGet(sql, params): Fetch a single row object
 * - dbAll(sql, params): Fetch all matching row objects as an array
 * - dbRun(sql, params): Execute an INSERT/UPDATE/DELETE statement returning lastID and rowsAffected
 */

import { createClient } from "@libsql/client";
import config from "../config/env.mjs";

let dbInstance = null;
let isLocalFallback = false;

/**
 * Initializes database client. Attempts remote Turso Cloud connection first if URL is configured;
 * falls back to local SQLite file (`file:recipes.db`) on network failure or invalid credentials.
 */
export function getDbClient() {
  if (dbInstance) return dbInstance;

  if (config.tursoDatabaseUrl && config.tursoAuthToken) {
    try {
      dbInstance = createClient({
        url: config.tursoDatabaseUrl,
        authToken: config.tursoAuthToken
      });
      console.log(`[Database] Initializing connection to remote Turso Cloud (${config.tursoDatabaseUrl})`);
    } catch (err) {
      console.warn(`[Database] Turso initialization notice (${err.message}). Using local SQLite.`);
      dbInstance = createClient({ url: `file:${config.localDbPath}` });
      isLocalFallback = true;
    }
  } else {
    console.log(`[Database] No remote Turso URL provided. Using local SQLite at ${config.localDbPath}`);
    dbInstance = createClient({ url: `file:${config.localDbPath}` });
    isLocalFallback = true;
  }

  return dbInstance;
}

export const db = new Proxy({}, {
  get(target, prop) {
    const client = getDbClient();
    const value = client[prop];
    return typeof value === "function" ? value.bind(client) : value;
  }
});

/**
 * Executes a SELECT query returning the first matching row or null.
 * @param {string} sql 
 * @param {Array} params 
 * @returns {Promise<Object|null>}
 */
export async function dbGet(sql, params = []) {
  try {
    const res = await getDbClient().execute({ sql, args: params });
    return res.rows && res.rows.length > 0 ? res.rows[0] : null;
  } catch (err) {
    if (!isLocalFallback && (err.message?.includes("fetch failed") || err.message?.includes("ENOTFOUND"))) {
      console.warn("[Database] Remote Turso query failed. Falling back to local SQLite...");
      switchToLocalDb();
      return dbGet(sql, params);
    }
    throw err;
  }
}

export async function dbAll(sql, params = []) {
  try {
    const res = await getDbClient().execute({ sql, args: params });
    return res.rows || [];
  } catch (err) {
    if (!isLocalFallback && (err.message?.includes("fetch failed") || err.message?.includes("ENOTFOUND"))) {
      console.warn("[Database] Remote Turso query failed. Falling back to local SQLite...");
      switchToLocalDb();
      return dbAll(sql, params);
    }
    throw err;
  }
}

export async function dbRun(sql, params = []) {
  try {
    const res = await getDbClient().execute({ sql, args: params });
    const lastID = res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : 0;
    const rowsAffected = res.rowsAffected !== undefined ? Number(res.rowsAffected) : 0;
    return { lastID, rowsAffected };
  } catch (err) {
    if (!isLocalFallback && (err.message?.includes("fetch failed") || err.message?.includes("ENOTFOUND"))) {
      console.warn("[Database] Remote Turso query failed. Falling back to local SQLite...");
      switchToLocalDb();
      return dbRun(sql, params);
    }
    throw err;
  }
}

/**
 * Executes a raw query statement with automatic local SQLite fallback on network failure.
 * @param {string|Object} stmt 
 * @returns {Promise<any>}
 */
export async function dbExecute(stmt) {
  const client = getDbClient();
  try {
    return await client.execute(stmt);
  } catch (err) {
    if (!isLocalFallback && (err.message?.includes("fetch failed") || err.message?.includes("ENOTFOUND"))) {
      console.warn("[Database] Remote Turso connection failed. Falling back to local SQLite at " + config.localDbPath);
      switchToLocalDb();
      return dbInstance.execute(stmt);
    }
    throw err;
  }
}

/**
 * Fallback helper to switch current db instance to local file database
 */
function switchToLocalDb() {
  try { if (dbInstance && typeof dbInstance.close === "function") dbInstance.close(); } catch (e) {}
  dbInstance = createClient({ url: `file:${config.localDbPath}` });
  isLocalFallback = true;
}

export default { db, dbGet, dbAll, dbRun, dbExecute, getDbClient };
