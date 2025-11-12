// graceful-shutdown.js
// Usage: const setupGracefulShutdown = require('./graceful-shutdown');
// setupGracefulShutdown({ server, cleanup: [fn1, fn2], timeout: 30000, logger });

function setupGracefulShutdown({ server, cleanup = [], timeout = 30000, logger = console } = {}) {
  if (!server || typeof server.on !== 'function') {
    throw new Error('A valid server instance is required (http.Server).');
  }

  const connections = new Set();
  let shuttingDown = false;

  server.on('connection', (socket) => {
    connections.add(socket);
    socket.on('close', () => connections.delete(socket));
  });

  async function runCleanup() {
    for (const fn of cleanup) {
      try {
        // allow sync or promise-based cleanup functions
        await Promise.resolve(fn());
      } catch (err) {
        logger.error && logger.error('Cleanup function failed:', err);
      }
    }
  }

  async function shutdown(signal = 'SIGTERM') {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info && logger.info(`[graceful-shutdown] Received ${signal} — starting shutdown`);

    // Stop accepting new connections
    server.close((err) => {
      if (err) logger.error && logger.error('Server close error:', err);
    });

    // Force kill timer
    const forceKill = setTimeout(() => {
      logger.warn && logger.warn('[graceful-shutdown] Timeout reached — destroying connections');
      for (const socket of connections) {
        try { socket.destroy(); } catch (_) {}
      }
      process.exit(1);
    }, timeout).unref();

    // Run provided cleanup functions (DB disconnects, cache quits, etc.)
    await runCleanup();

    // Give in-flight requests a short grace window, then destroy lingering sockets
    for (const socket of connections) {
      try {
        socket.end(); // try to politely close
        setTimeout(() => {
          try { socket.destroy(); } catch (_) {}
        }, 1000).unref();
      } catch (_) {}
    }

    clearTimeout(forceKill);
    logger.info && logger.info('[graceful-shutdown] Shutdown complete — exiting');
    process.exit(0);
  }

  // Listen for signals
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Optional programmatic shutdown trigger
  return { shutdown };
}

module.exports = setupGracefulShutdown;
