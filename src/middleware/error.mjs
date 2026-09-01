/**
 * @file src/middleware/error.mjs
 * @description Centralized Express Error Handling Middleware.
 * Catches unhandled 404 routes and application runtime errors,
 * formatting consistent JSON responses.
 */

export function notFoundHandler(req, res, next) {
  if (req.accepts("html") && !req.path.startsWith("/api/")) {
    return res.status(404).sendFile("index.html", { root: "./public" });
  }
  res.status(404).json({ error: `Cannot ${req.method} ${req.path}` });
}

export function errorHandler(err, req, res, next) {
  console.error(`[Error] ${req.method} ${req.path}:`, err);
  const status = err.status || err.statusCode || 500;
  const message = err.message || "An unexpected internal server error occurred.";
  res.status(status).json({ error: message });
}

export default { notFoundHandler, errorHandler };
