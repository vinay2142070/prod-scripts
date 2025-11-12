// express-body-size-guard.js
// Simple Express middleware to limit request body size and return 413 early.

function bodySizeLimit(maxBytes) {
  if (typeof maxBytes !== 'number' || maxBytes <= 0) {
    throw new Error('maxBytes must be a positive number');
  }

  return function (req, res, next) {
    // If Content-Length is present, check it immediately.
    const lenHeader = req.headers['content-length'];
    const parsedLen = lenHeader ? Number(lenHeader) : NaN;
    if (!Number.isNaN(parsedLen) && parsedLen > maxBytes) {
      res.statusCode = 413; // Payload Too Large
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.end('Payload Too Large');
    }

    // Otherwise, count incoming chunks.
    let received = 0;
    let finished = false;

    function cleanup() {
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onError);
    }

    function onData(chunk) {
      // chunk may be string or Buffer; ensure numeric length
      const chunkLen = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk));
      received += chunkLen;

      if (received > maxBytes && !finished) {
        finished = true;
        cleanup();
        // Try to respond with 413 and destroy the socket to halt further data.
        try {
          res.statusCode = 413;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end('Payload Too Large');
        } catch (err) {
          // ignore send errors
        }
        // Best-effort to stop the client sending more data
        if (req.socket && !req.socket.destroyed) {
          req.socket.destroy();
        }
      }
    }

    function onEnd() {
      if (finished) return;
      finished = true;
      cleanup();
      next();
    }

    function onError(err) {
      if (finished) return;
      finished = true;
      cleanup();
      next(err);
    }

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
  };
}

module.exports = bodySizeLimit;

/* Usage example:
const express = require('express');
const bodySizeLimit = require('./express-body-size-guard');

const app = express();

// Limit bodies to 1MB (1 * 1024 * 1024 bytes)
app.use(bodySizeLimit(1 * 1024 * 1024));

// Then add parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post('/upload', (req, res) => {
  res.send({ ok: true });
});

app.listen(3000);
*/
