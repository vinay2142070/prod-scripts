// etag-lru-cache.js
// Middleware: ETag + LRU cache for GET responses (JSON/text)
// Dependencies: npm install lru-cache

const crypto = require('crypto');
const LRU = require('lru-cache');

function makeEtagLruCache(opts = {}) {
  const {
    max = 500,         // max number of entries
    ttl = 1000 * 60,   // default TTL in ms (1 minute)
    allowStatuses = [200], // statuses to cache
    shouldCache = null // optional (req, res, body) => boolean
  } = opts;

  const cache = new LRU({ max, ttl });

  return function etagLruMiddleware(req, res, next) {
    if (req.method !== 'GET') return next();

    const key = req.originalUrl || req.url;
    const ifNoneMatch = req.headers['if-none-match'];

    // Serve from cache if present
    const cached = cache.get(key);
    if (cached) {
      // If client already has the same ETag, 304
      if (ifNoneMatch && ifNoneMatch === cached.etag) {
        res.status(304).end();
        return;
      }

      // Serve cached response
      // Restore headers (except hop-by-hop headers)
      Object.entries(cached.headers || {}).forEach(([name, value]) => {
        // avoid setting content-length header incorrectly for Buffer
        res.setHeader(name, value);
      });
      // mark cache hit
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('ETag', cached.etag);
      res.status(cached.statusCode || 200);
      // cached.body is a Buffer
      return res.send(cached.body);
    }

    // Not cached -> intercept res.send to capture output
    const originalSend = res.send.bind(res);

    res.send = function sendOverride(body) {
      try {
        // Convert body to Buffer for hashing & storage
        let bufferBody;
        if (Buffer.isBuffer(body)) {
          bufferBody = body;
        } else if (typeof body === 'object') {
          // JSON object (res.json uses res.send internally)
          bufferBody = Buffer.from(JSON.stringify(body));
        } else {
          bufferBody = Buffer.from(String(body));
        }

        // Compute ETag
        const etag = crypto.createHash('sha1').update(bufferBody).digest('hex');
        // Set ETag header
        res.setHeader('ETag', etag);

        // If client has the same ETag, short-circuit to 304
        if (ifNoneMatch && ifNoneMatch === etag) {
          res.status(304).end();
          return res;
        }

        // Respect explicit Cache-Control: no-store / private
        const cc = res.getHeader('Cache-Control');
        const ccLower = cc ? String(cc).toLowerCase() : '';
        const cacheAllowedByHeader = !(ccLower.includes('no-store') || ccLower.includes('private'));

        // Allow user override
        const userAllows = typeof shouldCache === 'function'
          ? shouldCache(req, res, bufferBody)
          : true;

        // If status is allowed, header allows, and user allows, cache it
        const statusAllowed = allowStatuses.includes(res.statusCode || 200);

        if (statusAllowed && cacheAllowedByHeader && userAllows) {
          // store minimal snapshot: body (Buffer), headers, statusCode, etag
          const snapshot = {
            etag,
            body: bufferBody,
            headers: res.getHeaders ? res.getHeaders() : {},
            statusCode: res.statusCode || 200
          };
          cache.set(key, snapshot);
        }

        // Mark miss before sending (so header is present)
        res.setHeader('X-Cache', 'MISS');

        // Send original response
        return originalSend(body);
      } catch (err) {
        // On error, fallback to original send
        return originalSend(body);
      }
    };

    next();
  };
}

module.exports = makeEtagLruCache;
