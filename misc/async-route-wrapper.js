// misc/async-route-wrapper.js

/**
 * Wrap an async Express route handler and forward errors to next().
 * Usage: app.get('/path', asyncHandler(async (req, res) => { ... }));
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Simple centralized error handler for Express.
 * Put this AFTER your routes: app.use(errorHandler);
 */
const errorHandler = (err, req, res, next) => {
  // Log server-side
  console.error(err);

  // Normalize status and message
  const status = err.status && Number.isInteger(err.status) ? err.status : 500;
  const message = err.message || 'Internal Server Error';

  // Minimal JSON error response
  res.status(status).json({ error: message });
};

module.exports = { asyncHandler, errorHandler };