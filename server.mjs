/**
 * @file server.mjs
 * @description Central Express Application Entry Point for Recipe Deck V2.0.
 * Configures middleware stack (cookie-parser, CORS, JSON body parser), mounts API routers,
 * initializes database connection & schema migrations, and serves PWA static files.
 *
 * Architecture: Modular Express 5 application with ES Module support.
 */

import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "path";

import config from "./src/config/env.mjs";
import { initDb } from "./src/db/schema.mjs";
import { notFoundHandler, errorHandler } from "./src/middleware/error.mjs";

// Import API Routers
import authRouter from "./src/routes/auth.mjs";
import recipesRouter from "./src/routes/recipes.mjs";
import commentsRouter, { deleteCommentRouter } from "./src/routes/comments.mjs";
import aiRouter from "./src/routes/ai.mjs";
import exportRouter from "./src/routes/export.mjs";
import adminRouter from "./src/routes/admin.mjs";

const app = express();

// ─── Middleware Configuration ────────────────────────────────────────────────
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));

// Serve static frontend assets from public/
app.use(express.static(config.publicDir));

// ─── Mount API Routes ────────────────────────────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api/recipes", recipesRouter);
app.use("/api/recipes", commentsRouter);
app.use("/api/comments", deleteCommentRouter);
app.use("/api", aiRouter);
app.use("/api/export", exportRouter);
app.use("/api/admin", adminRouter);

// Serve PWA SPA entry point for all non-API GET requests
app.get("/{*splat}", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(config.publicDir, "index.html"));
});

// ─── Error Handling Middleware ───────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

process.on("unhandledRejection", (reason) => {
  console.warn("[Process Notice] Unhandled promise rejection:", reason?.message || reason);
});

// ─── Bootstrap & Database Initialization ─────────────────────────────────────
async function startServer() {
  try {
    await initDb();
    const server = app.listen(config.port, "0.0.0.0", () => {
      console.log(`\n🚀 Recipe Deck V2.0 running at http://localhost:${config.port}\n`);
    });
    // Prevent event loop from exiting
    setInterval(() => {}, 3600000);
  } catch (err) {
    console.error("Fatal startup error:", err);
    process.exit(1);
  }
}

startServer();

export default app;
