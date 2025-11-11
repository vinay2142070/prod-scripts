// server.js
const express = require('express');
const http = require('http');
// Example DB client: mongoose (MongoDB). Replace with your DB client having a `close()` method.
const mongoose = require('mongoose');

const PORT = process.env.PORT || 3000;
const FORCE_SHUTDOWN_MS = 30_000; // force shutdown after 30s

async function start() {
  // Connect to DB (replace URI with your own)
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/test', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const app = express();

  // Simple endpoints
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.get('/', (req, res) => {
    // simulate async work
    setTimeout(() => res.send('Hello world'), 200);
  });

  const server = http.createServer(app);

  // Track sockets so we can forcefully destroy them on timeout
  const sockets = new Set();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });

  // Graceful shutdown function
  const gracefulShutdown = async (signal) => {
    console.warn(`${signal} received: starting graceful shutdown`);
    try {
      // Stop accepting new connections
      server.close(async (err) => {
        if (err) {
          console.error('Error while closing server:', err);
        } else {
          console.log('HTTP server closed (no longer accepting new connections)');
        }

        // Close DB connection
        try {
          await mongoose.connection.close(false); // false = do not force
          console.log('Database connection closed');
        } catch (dbErr) {
          console.error('Error closing database connection:', dbErr);
        }

        console.log('Graceful shutdown complete. Exiting process.');
        process.exit(err ? 1 : 0);
      });

      // Force shutdown after timeout
      setTimeout(() => {
        console.warn(`Forcefully terminating after ${FORCE_SHUTDOWN_MS}ms`);
        for (const socket of sockets) {
          try { socket.destroy(); } catch (_) {}
        }
        // If DB still open, try to close synchronously
        try { mongoose.connection.close(); } catch (_) {}
        process.exit(1);
      }, FORCE_SHUTDOWN_MS).unref(); // allow process to exit if graceful completed earlier

    } catch (shutdownErr) {
      console.error('Unexpected error during shutdown:', shutdownErr);
      process.exit(1);
    }
  };

  // Listen for termination signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Optional: catch uncaught exceptions/rejections to attempt graceful shutdown
  process.on('uncaughtException', (err) => {
    console.error('uncaughtException:', err);
    gracefulShutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    console.error('unhandledRejection:', reason);
    gracefulShutdown('unhandledRejection');
  });
}

// Start server and log DB errors
start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
