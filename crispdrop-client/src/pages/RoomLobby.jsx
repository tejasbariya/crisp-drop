/**
 * pages/RoomLobby.jsx — Room Creation & Waiting Lobby
 *
 * Two modes (determined by route state):
 *   create: Show room creation form (capacity, password, name)
 *   join:   Directly join a room using credentials from Home
 *
 * After joining, shows:
 *   - Room ID (copyable)
 *   - Real-time participant list with sanitized names
 *   - Peer count vs capacity indicator
 *   - "Start Transfer" CTA (navigates to TransferScreen)
 *   - "Leave Room" button
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { Button } from '../components/Button';
import { Input } from '../components/Input';

// ─── Peer Avatar ─────────────────────────────────────────────────────────────

function PeerAvatar({ name, isHost, isSelf }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group">
      <div className="peer-avatar relative">
        <span>{initials}</span>
        {isHost && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" className="text-white">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">
          {name}
          {isSelf && <span className="ml-2 text-xs text-indigo-400 font-normal">(you)</span>}
        </p>
        <p className="text-xs text-gray-400">{isHost ? 'Room Host' : 'Peer'}</p>
      </div>
      <div className="status-dot online flex-shrink-0" />
    </div>
  );
}

// ─── Room Creation Form ────────────────────────────────────────────────────────

function CreateRoomForm({ onCreated }) {
  const { createRoom, joinRoom } = useSocket();
  const [name, setName] = useState('');
  const [requirePassword, setRequirePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [capacity, setCapacity] = useState('2');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const capacityOptions = [
    { value: '2', label: '2 peers' },
    { value: '4', label: '4 peers' },
    { value: '5', label: '5 peers' },
    { value: '8', label: '8 peers' },
    { value: '10', label: '10 peers' },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const trimmedName = name.trim();
    if (!trimmedName) return setError('Please enter your name');
    if (requirePassword && password.length < 4) return setError('Password must be at least 4 characters');

    setLoading(true);
    try {
      const roomPayload = { capacity: parseInt(capacity, 10) };
      if (requirePassword) roomPayload.password = password;

      const { roomId } = await createRoom(roomPayload);
      await joinRoom({ roomId, password: requirePassword ? password : '', name: trimmedName });
      onCreated(roomId);
    } catch (err) {
      setError(err.message || 'Failed to create room');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <Input
        id="create-room-name"
        label="Your Display Name"
        placeholder="How should peers see you?"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        hint="Max 32 characters"
      />

      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-700 select-none">
          <input
            type="checkbox"
            checked={requirePassword}
            onChange={(e) => {
              setRequirePassword(e.target.checked);
              if (!e.target.checked) setPassword('');
            }}
            className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
          />
          Require a password to join this room
        </label>

        {requirePassword && (
          <Input
            id="create-room-password"
            type="password"
            placeholder="Set a password for this room"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            hint="Share this password with peers who want to join"
          />
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">
          Room Capacity <span className="text-indigo-500">*</span>
        </label>
        <div className="grid grid-cols-5 gap-2">
          {capacityOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              id={`capacity-${opt.value}`}
              onClick={() => setCapacity(opt.value)}
              className={`py-2.5 rounded-xl text-sm font-semibold border-2 transition-all duration-150 ${
                capacity === opt.value
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-indigo'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600'
              }`}
            >
              {opt.value}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400">Max peers in this room (including you)</p>
      </div>

      {error && (
        <p className="text-sm text-red-500 font-medium" role="alert">{error}</p>
      )}

      <Button
        id="create-room-submit"
        type="submit"
        fullWidth
        loading={loading}
        size="lg"
        className="mt-2"
      >
        Create Room
      </Button>
    </form>
  );
}

// ─── Waiting Lobby ────────────────────────────────────────────────────────────

function WaitingLobby({ roomId, onStartTransfer, onLeave }) {
  const { peers, mySocketId, myName, roomCapacity, isHost } = useSocket();
  const [copied, setCopied] = useState(false);

  const copyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for non-secure contexts
    }
  };

  const allPeers = [
    { socketId: mySocketId, name: myName, isHost, isSelf: true },
    ...peers
      .filter((p) => p.socketId !== mySocketId)
      .map((p) => ({ ...p, isSelf: false })),
  ];

  const peerCount = allPeers.length;
  const isReadyToTransfer = peerCount >= 2;

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Room ID panel */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5">
        <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wide mb-2">
          Room ID — Share with peers
        </p>
        <div className="flex items-center gap-3">
          <code className="flex-1 font-mono text-sm text-indigo-800 bg-white rounded-xl px-4 py-2.5 border border-indigo-100 overflow-x-auto">
            {roomId}
          </code>
          <button
            id="copy-room-id"
            onClick={copyRoomId}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${
              copied
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-100'
            }`}
            aria-label="Copy Room ID"
          >
            {copied ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Copy
              </>
            )}
          </button>
        </div>
      </div>

      {/* Peer count */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">
          Participants
        </h3>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <div className="flex -space-x-2">
            {allPeers.slice(0, 4).map((p, i) => (
              <div
                key={p.socketId}
                className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-400 border-2 border-white flex items-center justify-center text-white text-xs font-bold"
                style={{ zIndex: 10 - i }}
              >
                {p.name?.[0]?.toUpperCase()}
              </div>
            ))}
          </div>
          <span className="font-semibold text-gray-700">
            {peerCount} / {roomCapacity}
          </span>
        </div>
      </div>

      {/* Progress bar for capacity */}
      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-full transition-[width] duration-500"
          style={{ width: `${Math.min((peerCount / roomCapacity) * 100, 100)}%` }}
        />
      </div>

      {/* Peer list */}
      <div className="card overflow-hidden divide-y divide-gray-50">
        {allPeers.map((peer) => (
          <PeerAvatar
            key={peer.socketId}
            name={peer.name}
            isHost={peer.isHost}
            isSelf={peer.isSelf}
          />
        ))}
        {peerCount < roomCapacity && (
          <div className="flex items-center gap-3 p-3 text-gray-400">
            <div className="w-10 h-10 rounded-full border-2 border-dashed border-gray-200 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            </div>
            <span className="text-sm">Waiting for peers to join…</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          id="lobby-start-transfer"
          fullWidth
          disabled={!isReadyToTransfer}
          onClick={onStartTransfer}
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          }
        >
          {isReadyToTransfer ? 'Start File Transfer' : `Waiting for peers (${peerCount}/${roomCapacity})`}
        </Button>

        <Button
          id="lobby-leave-room"
          variant="ghost"
          onClick={onLeave}
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          }
        >
          Leave
        </Button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function RoomLobby() {
  const navigate = useNavigate();
  const location = useLocation();
  const { joinRoom, leaveRoom, isConnected, notification } = useSocket();

  const mode = location.state?.mode || 'create';
  const [phase, setPhase] = useState(mode === 'join' ? 'joining' : 'form');
  const [roomId, setRoomId] = useState('');
  const [joinError, setJoinError] = useState('');

  // If navigated here to join (from Home's join modal), auto-join
  useEffect(() => {
    if (mode === 'join' && location.state) {
      const { roomId: rid, password, name } = location.state;
      (async () => {
        try {
          await joinRoom({ roomId: rid, password, name });
          setRoomId(rid);
          setPhase('lobby');
        } catch (err) {
          setJoinError(err.message);
          setPhase('error');
        }
      })();
    }
  }, []);

  const handleRoomCreated = (createdRoomId) => {
    setRoomId(createdRoomId);
    setPhase('lobby');
  };

  const handleStartTransfer = () => {
    navigate('/transfer', { state: { roomId } });
  };

  const handleLeave = () => {
    leaveRoom();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-hero flex items-start justify-center py-12 px-4">
      <div className="w-full max-w-lg animate-slide-in-up">
        {/* Back button */}
        <button
          id="lobby-back"
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-8 group"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="group-hover:-translate-x-0.5 transition-transform">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to Home
        </button>

        <div className="card p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">
              {phase === 'form' ? 'Create a Room' : phase === 'joining' ? 'Joining Room…' : 'Waiting Lobby'}
            </h1>
            <p className="text-sm text-gray-500">
              {phase === 'form'
                ? 'Set your room capacity and password, then share the Room ID with peers.'
                : phase === 'lobby'
                ? 'Peers are joining. Start the transfer when everyone is ready.'
                : ''}
            </p>
          </div>

          {/* Connection warning */}
          {!isConnected && (
            <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3 text-sm text-amber-700">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>Not connected to signaling server — reconnecting…</span>
            </div>
          )}

          {/* Content by phase */}
          {phase === 'form' && <CreateRoomForm onCreated={handleRoomCreated} />}

          {phase === 'joining' && (
            <div className="flex flex-col items-center gap-4 py-8 text-gray-500">
              <div className="w-12 h-12 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin-slow" />
              <p className="text-sm font-medium">Connecting to room…</p>
            </div>
          )}

          {phase === 'lobby' && (
            <WaitingLobby
              roomId={roomId}
              onStartTransfer={handleStartTransfer}
              onLeave={handleLeave}
            />
          )}

          {phase === 'error' && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-gray-900">Could not join room</p>
                <p className="text-sm text-red-500 mt-1">{joinError}</p>
              </div>
              <Button id="lobby-error-back" variant="secondary" onClick={() => navigate('/')}>
                Go back
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
