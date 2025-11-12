// misc/retry-with-backoff.js
// Reusable async retry helper with exponential backoff, jitter, and AbortSignal support.

async function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Aborted'));
    const t = setTimeout(() => resolve(), ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new Error('Aborted'));
    }, { once: true });
  });
}

/**
 * Retry an async function with exponential backoff.
 *
 * @param {Function} fn - async function to run. Receives attempt number (1-based).
 * @param {Object} options
 *   - retries (number): max attempts (default 5)
 *   - minDelay (number ms): starting delay (default 100)
 *   - maxDelay (number ms): max delay cap (default 10000)
 *   - factor (number): exponential factor (default 2)
 *   - jitter (boolean): add randomized jitter to reduce thundering herd (default true)
 *   - shouldRetry (fn|undefined): (err) => boolean to decide retry on error (default: retry on any error)
 *   - onRetry (fn|undefined): (err, attempt, nextDelay) => void callback on each retry
 *   - signal (AbortSignal|undefined): optional AbortSignal to cancel retries
 */
async function retryWithBackoff(fn, options = {}) {
  const {
    retries = 5,
    minDelay = 100,
    maxDelay = 10000,
    factor = 2,
    jitter = true,
    shouldRetry = () => true,
    onRetry,
    signal
  } = options;

  let attempt = 0;
  let lastError;

  while (attempt < retries) {
    if (signal?.aborted) throw new Error('Aborted');

    attempt += 1;
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      const willRetry = attempt < retries && shouldRetry(err);
      if (!willRetry) break;

      // compute exponential backoff
      let next = Math.min(minDelay * Math.pow(factor, attempt - 1), maxDelay);
      if (jitter) {
        // full jitter
        next = Math.floor(Math.random() * next);
      }

      try {
        onRetry?.(err, attempt, next);
        await delay(next, signal);
      } catch (delayErr) {
        // delay was aborted
        throw delayErr;
      }
    }
  }

  throw lastError;
}

module.exports = { retryWithBackoff };
