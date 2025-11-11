// express-async-utils.js
// Simple utilities: asyncHandler, requestId, and logger (no external deps)

const crypto = require('crypto');

function genId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
}

// Adds or propagates a request id header and attaches req.id
const requestId = (headerName = 'x-request-id') => (req, res, next) => {
  req.id = req.headers[headerName] || genId();
  // expose id to client
  res.setHeader(headerName, req.id);
  next();
};

// Lightweight structured logger that emits one JSON-per-request on finish
const logger = (opts = {}) => (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const log = {
      ts: new Date().toISOString(),
      id: req.id,
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      duration_ms: Date.now() - start,
      remote: req.ip || (req.connection && req.connection.remoteAddress),
    };
    // swap this for your structured logger if desired
    console.log(JSON.stringify(log));
  });
  next();
};

// Wrap async route handlers so thrown/rejected errors go to next(error)
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = { asyncHandler, requestId, logger };

/*
Example usage:

const express = require('express');
const { asyncHandler, requestId, logger } = require('./express-async-utils');

const app = express();

app.use(requestId()); // sets/respects x-request-id
app.use(logger());

// Async route example
app.get('/user/:id', asyncHandler(async (req, res) => {
  const id = req.params.id;
  // await something that might throw
  const user = await db.getUser(id);
  if (!user) {
    const err = new Error('Not Found');
    err.status = 404;
    throw err;
  }
  res.json({ id: user.id, name: user.name });
}));

// Central error handler
app.use((err, req, res, next) => {
  const status = err.status || 500;
  console.error('error', { id: req.id, message: err.message, stack: err.stack });
  res.status(status).json({ error: err.message, requestId: req.id });
});

app.listen(3000);
*/