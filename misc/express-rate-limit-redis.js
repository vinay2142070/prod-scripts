// rateLimiter.js
// Requires: ioredis (npm i ioredis)
// Usage: const limiter = createRateLimiter({ redis, windowSize: 60, max: 100 })
// app.use(limiter)

const createRateLimiter = ({ redis, windowSize = 60, max = 100, keyPrefix = 'rl' } = {}) => {
  if (!redis) throw new Error('Redis client required');

  const windowMs = windowSize * 1000;

  return async (req, res, next) => {
    try {
      const id = (req.ip || req.headers['x-forwarded-for'] || 'anon').toString();
      const key = `${keyPrefix}:${id}`;
      const now = Date.now();
      const member = `${now}-${Math.random().toString(36).slice(2)}`;
      const windowStart = now - windowMs;

      // Use a pipeline for performance: ZADD, ZREMRANGEBYSCORE, ZCARD, EXPIRE
      const pipeline = redis.pipeline();
      pipeline.zadd(key, now, member);                        // add request
      pipeline.zremrangebyscore(key, 0, windowStart);         // remove old entries
      pipeline.zcard(key);                                    // count in window
      pipeline.expire(key, windowSize + 1);                  // TTL to auto-clean
      const results = await pipeline.exec();

      // Extract zcard result robustly (ioredis: [err, result] tuples)
      const zcardEntry = results[2];
      const count = Array.isArray(zcardEntry) ? zcardEntry[1] : zcardEntry;

      if (count > max) {
        // Find the earliest timestamp in the sorted set to compute Retry-After
        const oldest = await redis.zrange(key, 0, 0, 'WITHSCORES'); // [member, score]
        const oldestScore = oldest && oldest.length >= 2 ? parseInt(oldest[1], 10) : now;
        const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - oldestScore)) / 1000));

        res.set('Retry-After', String(retryAfterSec));
        return res.status(429).json({
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Try again in ${retryAfterSec} second(s).`
        });
      }

      // Optionally expose remaining quota in headers
      res.set('X-RateLimit-Limit', String(max));
      res.set('X-RateLimit-Remaining', String(Math.max(0, max - count)));
      return next();
    } catch (err) {
      // Fail-open: if Redis is down, allow the request (or change to fail-closed if preferred)
      console.error('Rate limiter error:', err);
      return next();
    }
  };
};

module.exports = createRateLimiter;
