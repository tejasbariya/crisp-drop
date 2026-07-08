/**
 * cluster.js — Primary Process Entry Point
 *
 * Responsibilities:
 *   1. Fork one worker per CPU core for horizontal signaling throughput scaling
 *   2. Attach @socket.io/sticky HTTP dispatcher so Socket.io long-polling/WebSocket
 *      handshakes consistently hit the same worker (sticky sessions)
 *   3. Respawn any crashed worker automatically (with backoff logging)
 *   4. Handle SIGTERM/SIGINT for graceful shutdown (drain in-flight connections)
 *
 * Clustering rationale: Node.js built-in `cluster` is used instead of PM2 to
 * keep the deployment zero-dependency and compatible with free-tier platforms
 * (Render, Railway) that run a single dyno. PM2 would require a separate runtime
 * install and adds operational complexity unnecessary for a single-dyno setup.
 */

'use strict';

require('dotenv').config();

const cluster = require('cluster');
const { createServer } = require('http');
const { setupMaster } = require('@socket.io/sticky');
const { setupPrimary } = require('@socket.io/cluster-adapter');
const os = require('os');

const NUM_WORKERS = os.cpus().length;
const PORT = parseInt(process.env.PORT || '3001', 10);
const DEBUG = !!(process.env.DEBUG && process.env.DEBUG.includes('crispdrop'));

// ─── Logging helpers ─────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[Primary PID:${process.pid}] ${msg}`);
}

function debug(msg) {
  if (DEBUG) console.log(`[DEBUG][Primary PID:${process.pid}] ${msg}`);
}

// ─── Primary Process ─────────────────────────────────────────────────────────

if (cluster.isPrimary) {
  log(`Crispdrop signaling server starting — forking ${NUM_WORKERS} worker(s)`);

  // Create a raw HTTP server in the primary to handle sticky session dispatch.
  // This server does NOT serve requests itself — it purely routes incoming
  // connections to the correct worker based on client IP hash (sticky sessions).
  const httpServer = createServer();

  // @socket.io/sticky: attach sticky-session dispatcher to the primary's HTTP server.
  // All incoming HTTP connections are balanced and pinned to the correct worker.
  setupMaster(httpServer);

  // @socket.io/cluster-adapter: initialize the primary process as the message broker.
  // This is required for workers to exchange Socket.io messages and fetchSockets().
  setupPrimary();

  // Start listening on the configured port
  httpServer.listen(PORT, () => {
    log(`HTTP dispatcher listening on port ${PORT}`);
    log(`Sticky session dispatch active — ${NUM_WORKERS} worker(s) will handle requests`);
  });

  // Track worker spawn timestamps for backoff logging
  const workerSpawnTimes = new Map();

  /**
   * forkWorker — Forks a new worker and tracks its spawn time.
   * Called on initial startup and when a worker needs to be replaced.
   */
  function forkWorker() {
    const worker = cluster.fork();
    workerSpawnTimes.set(worker.id, Date.now());
    log(`Worker #${worker.id} (PID:${worker.process.pid}) spawned`);

    // Listen for messages sent from workers (optional observability & state sync)
    worker.on('message', (msg) => {
      if (msg && msg.type === 'WORKER_READY') {
        debug(`Worker #${worker.id} (PID:${worker.process.pid}) is ready and accepting connections`);
      } else if (msg && msg.type === 'SYNC_ROOM') {
        // Broadcast room metadata sync to all OTHER workers
        for (const id in cluster.workers) {
          if (id !== worker.id.toString()) {
            cluster.workers[id].send(msg);
          }
        }
      }
    });

    return worker;
  }

  // Fork initial workers — one per CPU core
  for (let i = 0; i < NUM_WORKERS; i++) {
    forkWorker();
  }

  // Worker exit / crash handler — auto-respawn with diagnostic logging
  cluster.on('exit', (worker, code, signal) => {
    const spawnTime = workerSpawnTimes.get(worker.id);
    const uptime = spawnTime ? Math.round((Date.now() - spawnTime) / 1000) : 'unknown';
    workerSpawnTimes.delete(worker.id);

    if (worker.exitedAfterDisconnect) {
      // Intentional disconnect (e.g., graceful shutdown initiated by primary)
      log(`Worker #${worker.id} (PID:${worker.process.pid}) disconnected intentionally after ${uptime}s — not respawning`);
      return;
    }

    // Unexpected exit — log details and respawn
    log(
      `⚠️  Worker #${worker.id} (PID:${worker.process.pid}) exited unexpectedly ` +
      `(code: ${code}, signal: ${signal}) after ${uptime}s uptime — respawning...`
    );
    forkWorker();
  });

  // Worker online confirmation
  cluster.on('online', (worker) => {
    debug(`Worker #${worker.id} (PID:${worker.process.pid}) is online`);
  });

  // ─── Graceful Shutdown ──────────────────────────────────────────────────────

  let isShuttingDown = false;

  function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    log(`Received ${signal} — initiating graceful shutdown...`);

    // Stop accepting new connections on the primary HTTP dispatcher
    httpServer.close(() => {
      log('Primary HTTP dispatcher closed');
    });

    // Disconnect all workers gracefully — they will drain in-flight connections
    const workers = Object.values(cluster.workers);
    let pendingWorkers = workers.length;

    if (pendingWorkers === 0) {
      log('No workers to shut down — exiting');
      process.exit(0);
    }

    workers.forEach((worker) => {
      // Send graceful disconnect signal — worker handles SIGTERM internally
      worker.send({ type: 'SHUTDOWN' });
      worker.disconnect();

      worker.on('exit', () => {
        pendingWorkers--;
        log(`Worker #${worker.id} shut down cleanly (${pendingWorkers} remaining)`);
        if (pendingWorkers === 0) {
          log('All workers shut down — primary exiting cleanly');
          process.exit(0);
        }
      });
    });

    // Force-kill after 15s if workers don't exit cleanly
    setTimeout(() => {
      console.error('[Primary] Force-killing remaining workers after 15s timeout');
      process.exit(1);
    }, 15_000).unref();
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

} else {
  // ─── Worker Process ───────────────────────────────────────────────────────
  // Each worker runs the full Express + Socket.io app
  require('./server.js');
}
