// express-redis-rate-limit.js
// Usage: app.use(rateLimiter(redisClient, { window: 60, max: 100 }));

/**
 * Distributed rate limiter middleware using Redis.
 * Works with node-redis v4 (async client) or ioredis (both support incr/expire).
 *
 * Options:
 *  - window: time window in seconds (default: 60)
 *  - max: max requests per window (default: 100)
 *  - keyPrefix: redis key prefix (default: 'rl:')
 *  - id: function(req) -> unique identifier string (defaults to req.ip)
 */
function rateLimiter(redisClient, options = {}) {
  const {
    window = 60,
    max = 100,
    keyPrefix = 'rl:',
    id = (req) => req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
  } = options;

  return async function (req, res, next) {
    try {
      const identifier = id(req);
      const key = `${keyPrefix}${identifier}`;

      // Atomic-ish: INCR then set EXPIRE only when counter is 1 (first request).
      // Works fine for most use-cases; for strict token-bucket behavior consider Lua scripts.
      const current = await redisClient.incr(key);
      if (current === 1) {
        // set expiry on first increment
        await redisClient.expire(key, window);
      }

      const remaining = Math.max(0, max - current);

      // Add headers for client visibility
      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', String(remaining));
      res.setHeader('X-RateLimit-Reset', String(Date.now() + window * 1000));

      if (current > max) {
        // Optionally send Retry-After in seconds
        res.setHeader('Retry-After', String(window));
        return res.status(429).json({
          error: 'Too many requests',
          message: `Rate limit exceeded. Try again in ${window} seconds.`,
        });
      }

      next();
    } catch (err) {
      // Fail open: if Redis is down, allow requests (or change to fail-closed if desired)
      // Log the error in your real app
      console.error('Rate limiter error:', err);
      next();
    }
  };
}

module.exports = rateLimiter;
