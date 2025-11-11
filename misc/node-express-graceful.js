// graceful-shutdown.js
// Simple Express server with graceful shutdown handling

const express = require('express');
const http = require('http');

const PORT = process.env.PORT || 3000;
const FORCE_SHUTDOWN_TIMEOUT = parseInt(process.env.FORCE_SHUTDOWN_TIMEOUT_MS, 10) || 30_000;

const app = express();
let inflightRequests = 0;
let isShuttingDown = false;

// Basic middleware to count in-flight requests
app.use((req, res, next) => {
  if (isShuttingDown) {
    // Tell load balancers / orchestrators we're not accepting traffic
    res.setHeader('Connection', 'close');
    return res.status(503).send('Server is in the process of restarting');
  }
  inflightRequests++;
  res.on('finish', () => {
    inflightRequests = Math.max(0, inflightRequests - 1);
  });
  next();
});

// Health endpoint: returns 503 when shutting down
app.get('/health', (req, res) => {
  if (isShuttingDown) return res.status(503).send({ status: 'shutting_down' });
  res.send({ status: 'ok' });
});

// Example route
app.get('/', (req, res) => {
  // Simulate work
  setTimeout(() => res.send('Hello World'), 200);
});

const server = http.createServer(app);

// Track open sockets so we can destroy them if needed
const sockets = new Set();
server.on('connection', (socket) => {
  sockets.add(socket);
  socket.on('close', () => sockets.delete(socket));
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n${signal} received: starting graceful shutdown`);

  // 1) Stop accepting new connections
  server.close((err) => {
    if (err) {
      console.error('Error while closing server', err);
      process.exit(1);
    }
    // If all connections closed naturally
    console.log('All connections closed. Exiting.');
    process.exit(0);
  });

  // 2) Wait for in-flight requests to finish (short loop); log status
  const checkInterval = 500;
  const start = Date.now();
  const waitForInflight = setInterval(() => {
    console.log(`Waiting for inflight requests: ${inflightRequests} remaining`);
    if (inflightRequests === 0) {
      clearInterval(waitForInflight);
      // server.close callback will be invoked when all connections are closed
    } else if (Date.now() - start > FORCE_SHUTDOWN_TIMEOUT) {
      console.warn('Force shutdown timeout reached. Destroying open sockets.');
      clearInterval(waitForInflight);
      // 3) Force-close remaining sockets
      for (const s of sockets) {
        try { s.destroy(); } catch (e) { /* ignore */ }
      }
      // Give a tiny grace before exit
      setTimeout(() => process.exit(1), 500);
    }
  }, checkInterval);

  // Safety: after FORCE_SHUTDOWN_TIMEOUT, ensure exit even if server.close didn't complete
  setTimeout(() => {
    console.warn('Forcing process exit due to timeout.');
    process.exit(1);
  }, FORCE_SHUTDOWN_TIMEOUT + 1000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Optional: handle uncaught exceptions to allow process manager to restart
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception, shutting down:', err);
  gracefulShutdown('uncaughtException');
});