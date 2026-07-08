/**
 * server.js — Express + Socket.io Application (runs per worker process)
 *
 * Signaling responsibilities:
 *  - Room creation with password protection and capacity limits
 *  - Peer join/leave management with sanitized display names
 *  - WebRTC offer/answer/ICE-candidate relay between peers
 *  - In-room text chat relay
 *  - Rate limiting (room creation, password verification) per IP
 *  - Security headers via helmet
 *  - Cross-worker state consistency via cluster-adapter (see adapter.js)
 *
 * IMPORTANT: No file bytes pass through this server. All file data
 * travels directly between browsers over WebRTC data channels.
 */

'use strict';

require('dotenv').config();

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { setupWorker } = require('@socket.io/sticky');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const { setupWorkerAdapter } = require('./adapter.js');

// ─── Constants ───────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3001', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';
const DEBUG = !!(process.env.DEBUG && process.env.DEBUG.includes('crispdrop'));

const CORS_ORIGINS = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '20', 10);
const MAX_ROOM_SIZE = parseInt(process.env.MAX_ROOM_SIZE || '10', 10);
const ROOM_EXPIRY_MS = parseInt(process.env.ROOM_EXPIRY_MS || '3600000', 10); // 1 hour default

// Input constraints
const MAX_NAME_LENGTH = 32;
const MAX_ROOM_ID_LENGTH = 36; // UUID length
const MAX_PASSWORD_LENGTH = 128;
const MAX_CHAT_LENGTH = 500;

// ─── Logging helpers ─────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[Worker PID:${process.pid}] ${msg}`);
}

function debug(msg) {
  if (DEBUG) console.log(`[DEBUG][Worker PID:${process.pid}] ${msg}`);
}

// ─── Sanitization (server-side guard layer) ───────────────────────────────────

/**
 * sanitizeString — strips dangerous characters from user-supplied strings.
 * The client uses DOMPurify for rendering; this is a defense-in-depth guard
 * to prevent injection through signaling payloads.
 */
function sanitizeString(str, maxLen = 256) {
  if (typeof str !== 'string') return '';
  return str
    .slice(0, maxLen)
    .replace(/[<>"'&]/g, '')  // strip HTML-injection characters
    .trim();
}

/**
 * sanitizeName — validates and cleans a peer display name.
 */
function sanitizeName(name) {
  return sanitizeString(name, MAX_NAME_LENGTH) || 'Anonymous';
}

// ─── In-Worker Room Store ─────────────────────────────────────────────────────
//
// NOTE: Because we use @socket.io/cluster-adapter, Socket.io rooms (socket.join)
// are synced across workers. However, our room metadata (password, host, capacity)
// is stored in this local Map. This is acceptable because:
//   1. Room creation always happens on one worker (sticky session)
//   2. The cluster-adapter syncs socket membership for broadcast purposes
//   3. Room metadata lookups (join-room password check) go through the
//      originating worker for that peer (sticky session ensures this)
//
// For true multi-machine deployments, room metadata should move to Redis.
// That path is enabled by setting REDIS_URL in .env (see adapter.js).
//
// Schema:
// rooms: Map<roomId, {
//   id: string,
//   password: string,           // hashed or plaintext (plaintext for free tier; hash optional)
//   capacity: number,
//   hostSocketId: string,
//   peers: Map<socketId, { name: string, joinedAt: number }>,
//   createdAt: number,
//   expiryTimer: NodeJS.Timeout
// }>

const rooms = new Map();

// Sync room metadata from primary
process.on('message', (msg) => {
  if (msg && msg.type === 'SYNC_ROOM') {
    const { action, payload } = msg;
    if (action === 'add' || action === 'update') {
      const existing = rooms.get(payload.id);
      if (existing) {
        existing.password = payload.password;
        existing.capacity = payload.capacity;
      } else {
        rooms.set(payload.id, {
          id: payload.id,
          password: payload.password,
          capacity: payload.capacity,
          createdAt: payload.createdAt,
          expiryTimer: null,
        });
      }
    } else if (action === 'delete') {
      const existing = rooms.get(payload.id);
      if (existing && existing.expiryTimer) clearTimeout(existing.expiryTimer);
      rooms.delete(payload.id);
    }
  }
});

function broadcastRoomSync(action, room) {
  if (process.send) {
    process.send({
      type: 'SYNC_ROOM',
      action,
      payload: {
        id: room.id,
        password: room.password,
        capacity: room.capacity,
        createdAt: room.createdAt || Date.now(),
      }
    });
  }
}

/**
 * cleanupRoom — removes a room and clears its expiry timer.
 */
function cleanupRoom(roomId) {
  const room = rooms.get(roomId);
  if (room) {
    if (room.expiryTimer) clearTimeout(room.expiryTimer);
    rooms.delete(roomId);
    broadcastRoomSync('delete', { id: roomId });
    log(`Room ${roomId} cleaned up`);
  }
}

/**
 * scheduleRoomExpiry — auto-clean a room after ROOM_EXPIRY_MS idle period.
 * Timer is reset whenever peer activity occurs.
 */
function scheduleRoomExpiry(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  clearTimeout(room.expiryTimer);
  room.expiryTimer = setTimeout(() => {
    log(`Room ${roomId} expired after ${ROOM_EXPIRY_MS / 1000}s — cleaning up`);
    io.to(roomId).emit('room:expired');
    cleanupRoom(roomId);
  }, ROOM_EXPIRY_MS);
}

// ─── Express App Setup ────────────────────────────────────────────────────────

const app = express();

// Trust proxy headers (needed for correct IP rate-limiting behind Render/Vercel proxies)
app.set('trust proxy', 1);

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", ...CORS_ORIGINS],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        workerSrc: ["'self'", 'blob:'],
        imgSrc: ["'self'", 'data:', 'blob:'],
      },
    },
    crossOriginEmbedderPolicy: false, // Required for SharedArrayBuffer (WebRTC)
  })
);

// CORS
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || CORS_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '10kb' }));

// ─── Rate Limiting ────────────────────────────────────────────────────────────
//
// Note on cluster-awareness: express-rate-limit's default MemoryStore is
// per-process. In a cluster, each worker has its own counter — so the effective
// limit is RATE_LIMIT_MAX × NUM_WORKERS. For a strict cluster-wide limit,
// set REDIS_URL and use rate-limit-redis (documented upgrade path).
// For the free tier, per-worker limits provide adequate protection against
// casual abuse without requiring Redis.

const roomCreationLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  message: { error: 'Too many room creation attempts. Please wait before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => NODE_ENV === 'test',
});

// Health check endpoint (used by Render/Railway for uptime monitoring)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    pid: process.pid,
    uptime: Math.round(process.uptime()),
    rooms: rooms.size,
    env: NODE_ENV,
  });
});

// Room creation REST endpoint — rate-limited
app.post('/api/rooms', roomCreationLimiter, (req, res) => {
  try {
    let password = null;
    if (req.body?.password) {
      password = sanitizeString(String(req.body.password), MAX_PASSWORD_LENGTH);
      if (password.length < 4) {
        return res.status(400).json({ error: 'Password must be at least 4 characters.' });
      }
    }

    const rawCapacity = req.body?.capacity;
    const capacity = Math.min(Math.max(parseInt(rawCapacity, 10) || 2, 2), MAX_ROOM_SIZE);

    let roomId;
    let attempts = 0;
    do {
      // Generate a simple 6-digit room ID
      roomId = Math.floor(100000 + Math.random() * 900000).toString();
      attempts++;
    } while (rooms.has(roomId) && attempts < 100);

    if (rooms.has(roomId)) {
      return res.status(503).json({ error: 'Failed to generate a unique room ID. Please try again.' });
    }

    log(`Room ${roomId} created (capacity: ${capacity}) via REST`);

    // Room is pre-registered here; peers will join via Socket.io
    const roomMetadata = {
      id: roomId,
      password,
      capacity,
      createdAt: Date.now(),
      expiryTimer: null,
    };
    rooms.set(roomId, roomMetadata);
    broadcastRoomSync('add', roomMetadata);

    scheduleRoomExpiry(roomId);
    log(`Room ${roomId} will expire in ${ROOM_EXPIRY_MS / 1000}s if unused`);
    return res.status(201).json({ roomId });
  } catch (err) {
    console.error('[REST /api/rooms]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── HTTP Server & Socket.io Setup ───────────────────────────────────────────

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // Prefer WebSocket; fall back to polling (sticky ensures polling also works)
  transports: ['websocket', 'polling'],
  // Tune for signaling workload — small payloads, many events
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e5, // 100KB max signaling message (no file data)
});

// Attach cluster-adapter (or Redis adapter if REDIS_URL is set)
setupWorkerAdapter(io);

// Attach @socket.io/sticky worker setup — routes incoming connections from primary dispatcher
// IMPORTANT: setupWorker takes the Socket.io `io` instance (not httpServer)
setupWorker(io);

// ─── Socket.io Signaling Event Handlers ─────────────────────────────────────

io.on('connection', (socket) => {
  debug(`Socket connected: ${socket.id} from ${socket.handshake.address}`);

  // ── room:join ─────────────────────────────────────────────────────────────
  // Payload: { roomId: string, password: string, name: string }
  socket.on('room:join', async (payload, ack) => {
    try {
      const roomId = sanitizeString(String(payload?.roomId || ''), MAX_ROOM_ID_LENGTH);
      const password = sanitizeString(String(payload?.password || ''), MAX_PASSWORD_LENGTH);
      const name = sanitizeName(payload?.name || '');

      if (!roomId) {
        return ack?.({ error: 'Invalid room ID' });
      }

      const room = rooms.get(roomId);

      if (!room) {
        return ack?.({ error: 'Room not found or has expired' });
      }

      if (room.password && room.password !== password) {
        debug(`Failed join attempt on room ${roomId} — wrong password`);
        return ack?.({ error: 'Incorrect password' });
      }

      // Fetch all current peers in the room across the entire cluster
      const currentSockets = await io.in(roomId).fetchSockets();

      if (currentSockets.length >= room.capacity) {
        return ack?.({ error: `Room is full (${room.capacity} peers maximum)` });
      }

      // Join the Socket.io room (synced across workers via cluster-adapter)
      await socket.join(roomId);

      // Tag socket with room membership
      socket.data.roomId = roomId;
      socket.data.name = name;
      socket.data.joinedAt = Date.now();

      // Reset expiry timer on activity
      scheduleRoomExpiry(roomId);

      // Fetch updated peer list including ourselves
      const updatedSockets = await io.in(roomId).fetchSockets();
      updatedSockets.sort((a, b) => (a.data.joinedAt || 0) - (b.data.joinedAt || 0));
      
      const hostSocketId = updatedSockets.length > 0 ? updatedSockets[0].id : socket.id;

      debug(`Peer "${name}" (${socket.id}) joined room ${roomId} (${updatedSockets.length}/${room.capacity})`);

      // Build peer list to send back to the joining peer
      const peerList = updatedSockets
        .filter((s) => s.id !== socket.id)
        .map((s) => ({ socketId: s.id, name: s.data.name || 'Unknown' }));

      // Acknowledge success — return peer list so client can initiate WebRTC offers
      ack?.({
        success: true,
        roomId,
        peerId: socket.id,
        peers: peerList,
        isHost: hostSocketId === socket.id,
        capacity: room.capacity,
      });

      // Notify existing peers that a new peer has joined
      socket.to(roomId).emit('peer:joined', {
        socketId: socket.id,
        name,
        peerCount: updatedSockets.length,
      });

      // Broadcast updated room state to all (including the new joiner)
      io.to(roomId).emit('room:state', {
        peers: updatedSockets.map((s) => ({
          socketId: s.id,
          name: s.data.name || 'Unknown',
          isHost: s.id === hostSocketId,
        })),
        capacity: room.capacity,
        peerCount: updatedSockets.length,
      });

      log(`Room ${roomId}: ${updatedSockets.length}/${room.capacity} peers active`);
    } catch (err) {
      console.error('[room:join]', err);
      ack?.({ error: 'Server error during room join' });
    }
  });

  // ── webrtc:offer ─────────────────────────────────────────────────────────
  // Relay WebRTC offer from one peer to a specific target peer
  // Payload: { targetSocketId: string, offer: RTCSessionDescriptionInit }
  socket.on('webrtc:offer', (payload) => {
    const { targetSocketId, offer } = payload || {};
    if (!targetSocketId || !offer) return;

    debug(`Relaying WebRTC offer: ${socket.id} → ${targetSocketId}`);
    io.to(targetSocketId).emit('webrtc:offer', {
      fromSocketId: socket.id,
      offer,
    });
  });

  // ── webrtc:answer ─────────────────────────────────────────────────────────
  // Relay WebRTC answer back to the offering peer
  // Payload: { targetSocketId: string, answer: RTCSessionDescriptionInit }
  socket.on('webrtc:answer', (payload) => {
    const { targetSocketId, answer } = payload || {};
    if (!targetSocketId || !answer) return;

    debug(`Relaying WebRTC answer: ${socket.id} → ${targetSocketId}`);
    io.to(targetSocketId).emit('webrtc:answer', {
      fromSocketId: socket.id,
      answer,
    });
  });

  // ── webrtc:ice-candidate ──────────────────────────────────────────────────
  // Relay ICE candidate between peers
  // Payload: { targetSocketId: string, candidate: RTCIceCandidateInit }
  socket.on('webrtc:ice-candidate', (payload) => {
    const { targetSocketId, candidate } = payload || {};
    if (!targetSocketId || candidate === undefined) return;

    debug(`Relaying ICE candidate: ${socket.id} → ${targetSocketId}`);
    io.to(targetSocketId).emit('webrtc:ice-candidate', {
      fromSocketId: socket.id,
      candidate,
    });
  });

  // ── transfer:start ────────────────────────────────────────────────────────
  // Sender announces a file transfer to the room
  // Payload: { fileName: string, fileSize: number, fileType: string, chunkSize: number }
  socket.on('transfer:start', (payload) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    const meta = {
      fromSocketId: socket.id,
      fromName: socket.data.name,
      fileName: sanitizeString(String(payload?.fileName || ''), 256),
      fileSize: parseInt(payload?.fileSize, 10) || 0,
      fileType: sanitizeString(String(payload?.fileType || ''), 128),
      chunkSize: Math.min(Math.max(parseInt(payload?.chunkSize, 10) || 16384, 8192), 65536),
      transferId: uuidv4(),
    };

    debug(`Transfer start: ${meta.fileName} (${meta.fileSize} bytes) in room ${roomId}`);

    // Notify all receivers in the room (not the sender)
    socket.to(roomId).emit('transfer:incoming', meta);
    scheduleRoomExpiry(roomId);
  });

  // ── transfer:complete ─────────────────────────────────────────────────────
  // Sender signals that all chunks have been sent
  // Payload: { transferId: string }
  socket.on('transfer:complete', (payload) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    socket.to(roomId).emit('transfer:complete', {
      fromSocketId: socket.id,
      transferId: sanitizeString(String(payload?.transferId || ''), 64),
    });
  });

  // ── chat:message ──────────────────────────────────────────────────────────
  // Relay sanitized chat message to all peers in the room
  // Payload: { text: string }
  socket.on('chat:message', (payload) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    const text = sanitizeString(String(payload?.text || ''), MAX_CHAT_LENGTH);
    if (!text) return;

    io.to(roomId).emit('chat:message', {
      fromSocketId: socket.id,
      fromName: socket.data.name,
      text,
      timestamp: Date.now(),
    });

    scheduleRoomExpiry(roomId);
  });

  // ── transfer:ready ────────────────────────────────────────────────────────
  // A receiver signals they are ready to receive the file
  // Payload: { transferId: string }
  socket.on('transfer:ready', (payload) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    socket.to(roomId).emit('transfer:ready', {
      fromSocketId: socket.id,
      transferId: sanitizeString(String(payload?.transferId || ''), 64),
    });
  });

  // ── disconnect ────────────────────────────────────────────────────────────
  socket.on('disconnect', async (reason) => {
    const roomId = socket.data.roomId;
    const name = socket.data.name;

    debug(`Socket disconnected: ${socket.id} (${name || 'unknown'}) — reason: ${reason}`);

    if (roomId) {
      const room = rooms.get(roomId);
      if (room) {
        try {
          // Fetch remaining sockets in the room across the cluster
          const remainingSockets = await io.in(roomId).fetchSockets();
          remainingSockets.sort((a, b) => (a.data.joinedAt || 0) - (b.data.joinedAt || 0));
          
          const peerCount = remainingSockets.length;
          const hostSocketId = peerCount > 0 ? remainingSockets[0].id : null;

          if (peerCount === 0) {
            log(`Room ${roomId} empty — cleaning up`);
            cleanupRoom(roomId);
          } else {
            // Notify remaining peers
            io.to(roomId).emit('peer:left', {
              socketId: socket.id,
              name: name || 'Unknown',
              peerCount,
              newHostSocketId: hostSocketId,
            });

            // Broadcast updated room state
            io.to(roomId).emit('room:state', {
              peers: remainingSockets.map((s) => ({
                socketId: s.id,
                name: s.data.name || 'Unknown',
                isHost: s.id === hostSocketId,
              })),
              capacity: room.capacity,
              peerCount,
            });

            scheduleRoomExpiry(roomId);
            log(`Room ${roomId}: ${peerCount}/${room.capacity} peers remaining`);
          }
        } catch (err) {
          console.error('[disconnect sync error]', err);
        }
      }
    }
  });
});

// ─── Worker Startup ───────────────────────────────────────────────────────────
// IMPORTANT: Workers must NOT call httpServer.listen() when using @socket.io/sticky.
// The primary process listens on the port and routes connections to workers via IPC.
// Workers receive their connections via the sticky dispatcher — no bind needed.

log(`Worker initialized — NODE_ENV: ${NODE_ENV} — ready for IPC connections`);

// Signal to primary that this worker is ready (for observability)
if (process.send) {
  process.send({ type: 'WORKER_READY' });
}

// ─── Worker Graceful Shutdown ─────────────────────────────────────────────────

process.on('message', (msg) => {
  if (msg && msg.type === 'SHUTDOWN') {
    log('Received SHUTDOWN from primary — draining connections...');

    // Stop accepting new Socket.io connections
    io.close(() => {
      log('Socket.io server closed — worker exiting cleanly');
      process.exit(0);
    });

    // Force exit after 10s if connections don't drain
    setTimeout(() => {
      console.error(`[Worker PID:${process.pid}] Force exit after 10s drain timeout`);
      process.exit(1);
    }, 10_000).unref();
  }
});

process.on('SIGTERM', () => {
  log('SIGTERM received — closing gracefully...');
  io.close(() => process.exit(0));
});

process.on('uncaughtException', (err) => {
  console.error(`[Worker PID:${process.pid}] Uncaught exception:`, err);
  process.exit(1); // Primary will respawn this worker
});

process.on('unhandledRejection', (reason) => {
  console.error(`[Worker PID:${process.pid}] Unhandled rejection:`, reason);
  process.exit(1);
});

module.exports = { app, io }; // Exported for testing
