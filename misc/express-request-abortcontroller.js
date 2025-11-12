// express-request-abortcontroller.js
// Node 18+ (built-in fetch). For older Node, install a fetch polyfill like node-fetch.
// Usage: app.use(yourRoutes) or mount per-route as shown below.

const express = require('express');

/**
 * Middleware factory to attach an AbortController to each request.
 * - ms: timeout in milliseconds to auto-abort the request
 */
function requestTimeout(ms = 5000) {
  return (req, res, next) => {
    const controller = new AbortController();
    const signal = controller.signal;

    // Expose to handlers: req.abortController and req.signal
    req.abortController = controller;
    req.signal = signal;

    // Auto-abort if timeout elapses
    const timeoutId = setTimeout(() => {
      controller.abort(new Error('timeout'));
    }, ms);

    // If response finishes normally, clear the timeout
    res.on('finish', () => clearTimeout(timeoutId));

    // If client disconnects (socket closed) — abort ongoing operations
    req.on('close', () => {
      // If response already finished, close won't do anything problematic
      controller.abort(new Error('client disconnected'));
    });

    next();
  };
}

// Example Express app using the middleware and fetch with the signal
async function main() {
  const app = express();

  // Route-level timeout: override default if needed
  app.get('/proxy', requestTimeout(5000), async (req, res, next) => {
    try {
      // Use global fetch (Node 18+) — pass the per-request signal
      const upstream = await fetch('https://httpbin.org/delay/10', { signal: req.signal });
      const body = await upstream.text();
      res.type('text').send(body);
    } catch (err) {
      // AbortError from fetch will be named 'AbortError' in many fetch implementations.
      // We also check for our custom messages to give a 504-style response.
      const isAbort = err.name === 'AbortError' || /timeout|client disconnected/i.test(err.message);
      if (isAbort) {
        return res.status(504).json({ error: 'Request aborted (timeout or client disconnected)' });
      }
      next(err);
    }
  });

  // Generic error handler
  app.use((err, req, res, next) => {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error' });
    } else {
      next(err);
    }
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Server listening on ${port}`));
}

if (require.main === module) main().catch(err => {
  console.error('Failed to start app', err);
  process.exit(1);
});