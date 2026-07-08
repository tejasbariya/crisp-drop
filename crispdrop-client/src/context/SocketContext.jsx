/**
 * context/SocketContext.jsx
 *
 * Global signaling state and WebRTC mesh management.
 *
 * Responsibilities:
 *  - Manage the single Socket.io connection to the signaling server
 *  - Orchestrate a full-mesh WebRTC connection between all room peers
 *    (every peer holds an RTCPeerConnection to every other peer)
 *  - Handle offer/answer/ICE-candidate negotiation via Socket.io relay
 *  - Expose data channels for file transfer and chat to consumers
 *  - Detect and surface offline/reconnecting state
 *  - DOMPurify all user-generated strings before storing in state
 *
 * Architecture note:
 *  This context intentionally owns ALL WebRTC state. Pages/components consume
 *  it via useSocket() — they never create RTCPeerConnections themselves.
 *  This keeps the mesh topology logic centralized and testable.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import { io } from 'socket.io-client';
import DOMPurify from 'dompurify';

// ─── ICE Server Configuration ─────────────────────────────────────────────────
// Using public STUN servers. For production behind symmetric NATs,
// add TURN server credentials here.
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

const SERVER_URL = import.meta.env.VITE_API_URL;

// ─── Context Definition ───────────────────────────────────────────────────────

const SocketContext = createContext(null);

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SocketProvider({ children }) {
  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Room state
  const [roomId, setRoomId] = useState(null);
  const [mySocketId, setMySocketId] = useState(null);
  const [myName, setMyName] = useState('');
  const [peers, setPeers] = useState([]); // [{ socketId, name, isHost }]
  const [isHost, setIsHost] = useState(false);
  const [roomCapacity, setRoomCapacity] = useState(0);

  // Chat
  const [chatMessages, setChatMessages] = useState([]);

  // Transfer metadata (set when a sender announces a file)
  const [incomingTransfer, setIncomingTransfer] = useState(null);

  // Errors / notifications
  const [notification, setNotification] = useState(null);

  // Refs for WebRTC connections and data channels (not in state — no re-render on update)
  const socketRef = useRef(null);
  /** @type {React.MutableRefObject<Map<string, RTCPeerConnection>>} */
  const peerConnectionsRef = useRef(new Map());
  /** @type {React.MutableRefObject<Map<string, RTCDataChannel>>} */
  const dataChannelsRef = useRef(new Map());

  // External callbacks registered by TransferScreen
  const onChunkReceivedRef = useRef(null);
  const onTransferCompleteRef = useRef(null);

  // ── Sanitize helper ────────────────────────────────────────────────────────

  const sanitize = useCallback((str) => {
    if (typeof str !== 'string') return '';
    return DOMPurify.sanitize(str.slice(0, 512));
  }, []);

  // ── Online/Offline detection ───────────────────────────────────────────────

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ── Socket.io Connection ───────────────────────────────────────────────────

  useEffect(() => {
    const socket = io(SERVER_URL, {
      transports: ['polling', 'websocket'],
      autoConnect: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      setMySocketId(socket.id);
    });

    socket.on('disconnect', (reason) => {
      setIsConnected(false);
      if (reason === 'io server disconnect') {
        // Server deliberately disconnected us — do not auto-reconnect
        socket.connect();
      }
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket.io] Connection error:', err.message);
    });

    // ── Room state sync (from server, works across cluster workers) ────────

    socket.on('room:state', ({ peers: peerList, capacity, peerCount }) => {
      setPeers(
        (peerList || []).map((p) => ({
          socketId: p.socketId,
          name: sanitize(p.name),
          isHost: p.isHost,
        }))
      );
      setRoomCapacity(capacity || 0);
    });

    socket.on('room:expired', () => {
      setNotification({ type: 'error', message: 'Room has expired. Please create a new room.' });
      _leaveRoom();
    });

    // ── Peer lifecycle ─────────────────────────────────────────────────────

    socket.on('peer:joined', async ({ socketId, name }) => {
      const cleanName = sanitize(name);
      // Initiator side: create offer for the new peer
      await _createPeerConnection(socketId, cleanName, true /* isInitiator */);
    });

    socket.on('peer:left', ({ socketId, name, newHostSocketId }) => {
      _closePeerConnection(socketId);
      if (newHostSocketId === socket.id) {
        setIsHost(true);
      }
    });

    // ── WebRTC Signaling relay ─────────────────────────────────────────────

    socket.on('webrtc:offer', async ({ fromSocketId, offer }) => {
      await _handleOffer(fromSocketId, offer);
    });

    socket.on('webrtc:answer', async ({ fromSocketId, answer }) => {
      await _handleAnswer(fromSocketId, answer);
    });

    socket.on('webrtc:ice-candidate', async ({ fromSocketId, candidate }) => {
      await _handleIceCandidate(fromSocketId, candidate);
    });

    // ── Transfer signaling ─────────────────────────────────────────────────

    socket.on('transfer:incoming', (meta) => {
      setIncomingTransfer({
        ...meta,
        fileName: sanitize(meta.fileName),
        fromName: sanitize(meta.fromName),
      });
    });

    socket.on('transfer:complete', ({ fromSocketId, transferId }) => {
      onTransferCompleteRef.current?.({ fromSocketId, transferId });
    });

    // ── Chat ───────────────────────────────────────────────────────────────

    socket.on('chat:message', ({ fromSocketId, fromName, text, timestamp }) => {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `${fromSocketId}-${timestamp}`,
          fromSocketId,
          fromName: sanitize(fromName),
          text: sanitize(text),
          timestamp,
          isSelf: fromSocketId === socket.id,
        },
      ]);
    });

    return () => {
      socket.disconnect();
      _cleanupAllConnections();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── WebRTC Helpers ─────────────────────────────────────────────────────────

  /**
   * _createPeerConnection — creates a new RTCPeerConnection for a given peer.
   * If isInitiator is true, we create the data channel and send an offer.
   * If false, we wait for the offer before answering.
   */
  const _createPeerConnection = useCallback(async (peerId, peerName, isInitiator) => {
    if (peerConnectionsRef.current.has(peerId)) {
      console.warn(`[WebRTC] Already have connection for peer ${peerId}`);
      return;
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnectionsRef.current.set(peerId, pc);

    // ICE candidate trickle
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        socketRef.current?.emit('webrtc:ice-candidate', {
          targetSocketId: peerId,
          candidate,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] ${peerId} connectionState: ${pc.connectionState}`);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        _closePeerConnection(peerId);
      }
    };

    if (isInitiator) {
      // Create data channel (initiator side)
      const dc = pc.createDataChannel('crispdrop-transfer', {
        ordered: true,
        maxRetransmits: null,
      });
      _setupDataChannel(dc, peerId);

      // Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current?.emit('webrtc:offer', { targetSocketId: peerId, offer });
    } else {
      // Answering peer — wait for datachannel from initiator
      pc.ondatachannel = ({ channel }) => {
        _setupDataChannel(channel, peerId);
      };
    }

    return pc;
  }, []);

  /**
   * _setupDataChannel — attaches event handlers to a RTCDataChannel.
   */
  const _setupDataChannel = useCallback((dc, peerId) => {
    dc.binaryType = 'arraybuffer';
    dataChannelsRef.current.set(peerId, dc);

    dc.onopen = () => {
      console.log(`[DataChannel] ${peerId}: open`);
    };

    dc.onclose = () => {
      console.log(`[DataChannel] ${peerId}: closed`);
      dataChannelsRef.current.delete(peerId);
    };

    dc.onerror = (e) => {
      console.error(`[DataChannel] ${peerId}: error`, e);
    };

    dc.onmessage = async (event) => {
      // Route incoming chunks to the registered handler (set by TransferScreen)
      if (onChunkReceivedRef.current) {
        await onChunkReceivedRef.current({ data: event.data, fromPeerId: peerId });
      }
    };
  }, []);

  /**
   * _handleOffer — processes an incoming WebRTC offer from a peer.
   */
  const _handleOffer = useCallback(async (fromSocketId, offer) => {
    const peerName = peers.find((p) => p.socketId === fromSocketId)?.name || 'Unknown';
    let pc = peerConnectionsRef.current.get(fromSocketId);

    if (!pc) {
      pc = await _createPeerConnection(fromSocketId, peerName, false);
    }

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socketRef.current?.emit('webrtc:answer', { targetSocketId: fromSocketId, answer });
  }, [peers, _createPeerConnection]);

  /**
   * _handleAnswer — processes an incoming WebRTC answer.
   */
  const _handleAnswer = useCallback(async (fromSocketId, answer) => {
    const pc = peerConnectionsRef.current.get(fromSocketId);
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  }, []);

  /**
   * _handleIceCandidate — adds a received ICE candidate to the connection.
   */
  const _handleIceCandidate = useCallback(async (fromSocketId, candidate) => {
    const pc = peerConnectionsRef.current.get(fromSocketId);
    if (!pc || !candidate) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn('[WebRTC] Failed to add ICE candidate:', err);
    }
  }, []);

  /**
   * _closePeerConnection — closes and cleans up a specific peer's connection.
   */
  const _closePeerConnection = useCallback((peerId) => {
    const dc = dataChannelsRef.current.get(peerId);
    if (dc) {
      try { dc.close(); } catch {}
      dataChannelsRef.current.delete(peerId);
    }

    const pc = peerConnectionsRef.current.get(peerId);
    if (pc) {
      try { pc.close(); } catch {}
      peerConnectionsRef.current.delete(peerId);
    }
  }, []);

  /**
   * _cleanupAllConnections — closes all peer connections and clears state.
   */
  const _cleanupAllConnections = useCallback(() => {
    peerConnectionsRef.current.forEach((_, peerId) => _closePeerConnection(peerId));
    peerConnectionsRef.current.clear();
    dataChannelsRef.current.clear();
  }, [_closePeerConnection]);

  /**
   * _leaveRoom — clears local room state.
   */
  const _leaveRoom = useCallback(() => {
    _cleanupAllConnections();
    setRoomId(null);
    setPeers([]);
    setIsHost(false);
    setRoomCapacity(0);
    setChatMessages([]);
    setIncomingTransfer(null);
  }, [_cleanupAllConnections]);

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * createRoom — calls the REST endpoint to create a new room.
   * Returns { roomId } or throws with an error message.
   */
  const createRoom = useCallback(async ({ password, capacity }) => {
    const res = await fetch(`${SERVER_URL}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, capacity }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create room');
    return data;
  }, []);

  /**
   * joinRoom — joins a room via Socket.io signaling.
   * Returns room info or throws with error message.
   */
  const joinRoom = useCallback(({ roomId: rid, password, name }) => {
    return new Promise((resolve, reject) => {
      if (!socketRef.current?.connected) {
        return reject(new Error('Not connected to signaling server'));
      }

      socketRef.current.emit(
        'room:join',
        { roomId: rid, password, name: sanitize(name) },
        (response) => {
          if (response?.error) {
            return reject(new Error(response.error));
          }

          setRoomId(rid);
          setMyName(sanitize(name));
          setIsHost(response.isHost);
          setRoomCapacity(response.capacity);
          setMySocketId(socketRef.current.id);

          resolve(response);
        }
      );
    });
  }, [sanitize]);

  /**
   * leaveRoom — disconnects from the current room.
   */
  const leaveRoom = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current?.connect();
    _leaveRoom();
  }, [_leaveRoom]);

  /**
   * sendChatMessage — sends a sanitized chat message to the room.
   */
  const sendChatMessage = useCallback((text) => {
    const clean = sanitize(text);
    if (!clean || !roomId) return;
    socketRef.current?.emit('chat:message', { text: clean });
  }, [sanitize, roomId]);

  /**
   * announceTransfer — notifies the room that a file transfer is starting.
   */
  const announceTransfer = useCallback((meta) => {
    socketRef.current?.emit('transfer:start', meta);
  }, []);

  /**
   * announceTransferComplete — signals end-of-file to all peers.
   */
  const announceTransferComplete = useCallback((transferId) => {
    socketRef.current?.emit('transfer:complete', { transferId });
  }, []);

  /**
   * signalReady — receiver signals it's ready to receive data.
   */
  const signalReady = useCallback((transferId) => {
    socketRef.current?.emit('transfer:ready', { transferId });
  }, []);

  /**
   * getDataChannel — returns the RTCDataChannel for a specific peer (if open).
   */
  const getDataChannel = useCallback((peerId) => {
    return dataChannelsRef.current.get(peerId) || null;
  }, []);

  /**
   * getAllDataChannels — returns all open data channels as an array.
   */
  const getAllDataChannels = useCallback(() => {
    return Array.from(dataChannelsRef.current.values()).filter(
      (dc) => dc.readyState === 'open'
    );
  }, []);

  /**
   * registerTransferHandlers — called by TransferScreen to receive chunk events.
   */
  const registerTransferHandlers = useCallback(({ onChunk, onComplete }) => {
    onChunkReceivedRef.current = onChunk;
    onTransferCompleteRef.current = onComplete;
  }, []);

  /**
   * clearNotification — dismisses the current notification.
   */
  const clearNotification = useCallback(() => setNotification(null), []);

  // ─── Context Value ───────────────────────────────────────────────────────────

  const value = {
    // Connection
    isConnected,
    isOnline,
    socket: socketRef.current,

    // Identity
    mySocketId,
    myName,

    // Room
    roomId,
    peers,
    isHost,
    roomCapacity,

    // Chat
    chatMessages,
    sendChatMessage,

    // Transfer
    incomingTransfer,
    announceTransfer,
    announceTransferComplete,
    signalReady,
    getDataChannel,
    getAllDataChannels,
    registerTransferHandlers,

    // Actions
    createRoom,
    joinRoom,
    leaveRoom,

    // Notifications
    notification,
    clearNotification,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}
