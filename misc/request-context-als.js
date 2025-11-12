// request-context.js
const { AsyncLocalStorage } = require('async_hooks');
const { v4: uuidv4 } = require('uuid');

const als = new AsyncLocalStorage();

/**
 * Express middleware: creates a per-request context and sets X-Request-Id.
 * If the client provides X-Request-Id it will be used, otherwise a UUID is generated.
 */
function requestContextMiddleware(req, res, next) {
  const ctx = {
    requestId: req.headers['x-request-id'] || uuidv4(),
    startTime: Date.now()
  };

  // Run the request inside the ALS context so downstream code can access it.
  als.run(ctx, () => {
    // Expose the request-id back to the client and downstream middlewares
    res.setHeader('X-Request-Id', ctx.requestId);
    next();
  });
}

/** Return the current request context object (or undefined if none). */
function getRequestContext() {
  return als.getStore();
}

/** Convenience getter for current request id. */
function getRequestId() {
  const ctx = getRequestContext();
  return ctx && ctx.requestId;
}

/**
 * Minimal request-aware logger. You can replace with pino/winston by injecting metadata.
 * Usage: const { logger } = require('./request-context'); logger('something happened');
 */
function logger(...args) {
  const id = getRequestId() || '-';
  const ts = new Date().toISOString();
  console.log(`[${ts}] [req:${id}]`, ...args);
}

module.exports = {
  requestContextMiddleware,
  getRequestContext,
  getRequestId,
  logger
};