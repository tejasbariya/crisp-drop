/**
 * adapter.js — Socket.io adapter configuration
 *
 * Wires up:
 *   - @socket.io/cluster-adapter  → cross-worker broadcast sync
 *   - @socket.io/sticky           → sticky HTTP session dispatch at primary level
 *
 * The sticky-session dispatcher lives in cluster.js (primary process).
 * This file handles the per-worker Socket.io adapter setup.
 *
 * Optional upgrade path: Set REDIS_URL in .env to switch to the Redis adapter
 * for multi-instance (multi-machine) deployments on paid hosting tiers.
 */

'use strict';

const { createAdapter } = require('@socket.io/cluster-adapter');

/**
 * setupWorkerAdapter
 * Called once per worker process after the Socket.io server is created.
 * Attaches the cluster-adapter so all workers share a common broadcast channel
 * via IPC messages routed through the primary process.
 *
 * @param {import('socket.io').Server} io - The Socket.io server instance
 */
function setupWorkerAdapter(io) {
  // If a Redis URL is configured, use the Redis adapter instead (multi-instance upgrade path).
  if (process.env.REDIS_URL) {
    _setupRedisAdapter(io);
  } else {
    // Default: cluster-adapter for single-dyno multi-core deployments (zero-cost free tier)
    io.adapter(createAdapter());
    _debug(`[Worker PID:${process.pid}] Cluster adapter attached (IPC-based cross-worker sync)`);
  }
}

/**
 * _setupRedisAdapter (optional upgrade path — multi-instance paid tier)
 * Dynamically requires the redis adapter only when REDIS_URL is set,
 * so the dependency is not required in free-tier deployments.
 *
 * @param {import('socket.io').Server} io
 */
function _setupRedisAdapter(io) {
  try {
    // These packages must be installed separately for the Redis path:
    //   npm install @socket.io/redis-adapter ioredis
    const { createAdapter: createRedisAdapter } = require('@socket.io/redis-adapter');
    const { createClient } = require('ioredis');

    const pubClient = createClient(process.env.REDIS_URL);
    const subClient = pubClient.duplicate();

    Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
      io.adapter(createRedisAdapter(pubClient, subClient));
      _debug(`[Worker PID:${process.pid}] Redis adapter attached (multi-instance sync via ${process.env.REDIS_URL})`);
    }).catch((err) => {
      console.error(`[Worker PID:${process.pid}] Redis adapter connection failed, falling back to cluster-adapter:`, err.message);
      io.adapter(createAdapter());
    });
  } catch (err) {
    console.error(
      `[Worker PID:${process.pid}] @socket.io/redis-adapter not installed. ` +
      `Run: npm install @socket.io/redis-adapter ioredis\n` +
      `Falling back to cluster-adapter.`
    );
    io.adapter(createAdapter());
  }
}

/**
 * _debug — conditional debug logger gated on DEBUG env var
 */
function _debug(...args) {
  if (process.env.DEBUG && process.env.DEBUG.includes('crispdrop')) {
    console.log('[DEBUG]', ...args);
  }
}

module.exports = { setupWorkerAdapter };
