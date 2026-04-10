'use strict';

const config = require('../config');

/**
 * Global error handler — must be registered LAST in server.js (after all routes).
 * Catches any error passed to next(err) and returns a consistent JSON shape.
 */
function errorMiddleware(err, req, res, next) { // eslint-disable-line no-unused-vars
  // CORS rejections arrive as plain Error objects with no status — return 403
  const isCors = err.message && err.message.startsWith('CORS:');
  const status = isCors ? 403 : (err.status || err.statusCode || 500);

  // Log full stack in development; keep it terse in production.
  if (config.nodeEnv !== 'production') {
    console.error(err);
  } else {
    console.error(`[${status}] ${req.method} ${req.path} — ${err.message}`);
  }

  res.status(status).json({
    error: true,
    message: err.message || 'An unexpected error occurred.',
    status,
  });
}

/**
 * 404 catch-all — register BEFORE errorMiddleware but AFTER all routes.
 */
function notFoundMiddleware(req, res) {
  res.status(404).json({
    error: true,
    message: `Route not found: ${req.method} ${req.path}`,
    status: 404,
  });
}

module.exports = { errorMiddleware, notFoundMiddleware };
