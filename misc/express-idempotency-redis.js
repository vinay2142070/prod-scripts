// express-idempotency-redis.js
// Requires: npm install ioredis
// Usage: app.use(idempotency({ redis, ttl: 3600 }))

function idempotency({ redis, ttl = 3600, processingTtl = 60, header = 'Idempotency-Key', methods = ['POST', 'PUT', 'PATCH'] } = {}) {
  if (!redis) throw new Error('redis client required');

  return async function (req, res, next) {
    try {
      if (!methods.includes(req.method)) return next();

      const keyHeader = req.get(header);
      if (!keyHeader) return next();

      const redisKey = `idem:${req.method}:${keyHeader}:${req.originalUrl}`;

      // Check if response already stored
      const cached = await redis.get(redisKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        // If already processed, return cached response
        if (parsed.processed) {
          res.status(parsed.status);
          if (parsed.headers) {
            for (const [k, v] of Object.entries(parsed.headers)) {
              res.set(k, v);
            }
          }
          return res.send(Buffer.from(parsed.body, 'base64'));
        }

        // If currently processing by another worker, return 409 Conflict
        if (parsed.processing) {
          return res.status(409).json({ error: 'Request is being processed' });
        }
      }

      // Try to mark as processing (NX). If another process set it between the get and set, handle below.
      const processingMarker = JSON.stringify({ processing: true });
      // redis.set(key, val, 'NX', 'EX', seconds) works with ioredis and node-redis v4
      const setOk = await redis.set(redisKey, processingMarker, 'NX', 'EX', processingTtl);
      if (!setOk) {
        // Another process claimed processing; return 409
        return res.status(409).json({ error: 'Request is being processed' });
      }

      // Hook into send to capture status, headers, and body
      const originalSend = res.send.bind(res);
      let chunks = [];

      // Override res.write and res.end for cases where body is streamed or Buffer-based
      const originalWrite = res.write.bind(res);
      const originalEnd = res.end.bind(res);

      res.write = function (chunk, ...args) {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        return originalWrite(chunk, ...args);
      };

      res.end = function (chunk, ...args) {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        return originalEnd(chunk, ...args);
      };

      res.send = function (body) {
        if (body) {
          if (Buffer.isBuffer(body)) chunks.push(body);
          else if (typeof body === 'string') chunks.push(Buffer.from(body));
          else if (typeof body === 'object') chunks.push(Buffer.from(JSON.stringify(body)));
        }
        const result = originalSend(body);
        // After sending, persist result
        const bodyBuf = Buffer.concat(chunks);
        const store = {
          processed: true,
          status: res.statusCode || 200,
          headers: {
            'content-type': res.get('Content-Type') || ''
            // add other headers if needed
          },
          body: bodyBuf.toString('base64'),
          ts: Date.now()
        };
        // Store the response for ttl seconds
        redis.set(redisKey, JSON.stringify(store), 'EX', ttl).catch((err) => {
          // don't break response on cache errors
          console.error('Failed to store idempotent response:', err);
        });
        return result;
      };

      // Proceed to actual handler
      return next();
    } catch (err) {
      // On unexpected errors, cleanup marker if present so requests aren't forever blocked
      try {
        const keyHeader = req.get(header);
        if (keyHeader) {
          const redisKey = `idem:${req.method}:${keyHeader}:${req.originalUrl}`;
          const val = await redis.get(redisKey);
          if (val) {
            const parsed = JSON.parse(val);
            if (parsed.processing) {
              // remove marker to allow retry
              await redis.del(redisKey);
            }
          }
        }
      } catch (e) {
        // ignore cleanup errors
      }
      return next(err);
    }
  };
}

module.exports = idempotency;
