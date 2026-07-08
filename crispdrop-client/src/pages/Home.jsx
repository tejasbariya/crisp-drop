/**
 * pages/Home.jsx — Landing Page
 *
 * Features:
 *  - Hero section with animated brand mark and tagline
 *  - Feature highlights (P2P, E2E privacy, multi-peer)
 *  - "Start Sharing" CTA leading to Room creation
 *  - "Join a Room" entry for receiving peers
 *  - PWA install prompt integration
 *  - Responsive, glassmorphism-infused design
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { InstallPrompt } from '../components/InstallPrompt';

// ── Feature Card ─────────────────────────────────────────────────────────────

function FeatureCard({ icon, title, description, delay = 0 }) {
  return (
    <div
      className="card p-6 flex flex-col gap-3 hover:shadow-lg-soft transition-shadow duration-300 animate-fade-in"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
        {icon}
      </div>
      <h3 className="font-semibold text-gray-900 text-[0.9375rem]">{title}</h3>
      <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
    </div>
  );
}

// ── Brand Mark SVG ────────────────────────────────────────────────────────────

function BrandMark({ size = 48 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="14" fill="#4F46E5" />
      {/* Lightning bolt */}
      <path
        d="M28 8L18 26h8l-6 14 18-20h-10z"
        fill="white"
        fillOpacity="0.95"
      />
    </svg>
  );
}

// ── Join Modal ────────────────────────────────────────────────────────────────

function JoinModal({ onClose, onJoin }) {
  const [roomId, setRoomId] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmedId = roomId.trim();
    const trimmedName = name.trim();
    if (!trimmedId) return setError('Please enter a Room ID');
    if (!trimmedName) return setError('Please enter your name');
    setError('');
    onJoin({ roomId: trimmedId, password, name: trimmedName });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card w-full max-w-md p-8 animate-scale-in">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">Join a Room</h2>
          <button
            id="join-modal-close"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            id="join-room-id"
            label="Room ID"
            placeholder="Paste the Room ID here"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            required
          />
          <Input
            id="join-room-password"
            label="Room Password (Optional)"
            type="password"
            placeholder="Only if the room has one"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Input
            id="join-room-name"
            label="Your Name"
            placeholder="How should peers see you?"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            hint="Max 32 characters"
          />

          {error && (
            <p className="text-sm text-red-500 font-medium" role="alert">{error}</p>
          )}

          <Button id="join-room-submit" type="submit" fullWidth className="mt-2">
            Join Room
          </Button>
        </form>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function Home() {
  const navigate = useNavigate();
  const [showJoin, setShowJoin] = useState(false);

  const handleJoin = ({ roomId, password, name }) => {
    navigate('/lobby', { state: { mode: 'join', roomId, password, name } });
  };

  return (
    <div className="min-h-screen bg-hero flex flex-col">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <BrandMark size={36} />
          <span className="font-bold text-gray-900 text-lg tracking-tight">Crispdrop</span>
        </div>

        <nav className="flex items-center gap-3">
          <Button
            id="nav-join-room"
            variant="ghost"
            size="sm"
            onClick={() => setShowJoin(true)}
          >
            Join Room
          </Button>
          <Button
            id="nav-create-room"
            variant="secondary"
            size="sm"
            onClick={() => navigate('/lobby', { state: { mode: 'create' } })}
          >
            Create Room
          </Button>
        </nav>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        {/* Decorative ring */}
        <div className="relative mb-8 animate-fade-in">
          <div className="absolute inset-0 rounded-full bg-indigo-500/10 blur-2xl scale-150" />
          <div className="relative w-24 h-24 rounded-[28px] bg-gradient-to-br from-indigo-600 to-indigo-400 flex items-center justify-center shadow-indigo-lg">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <path d="M30 6L18 26h10l-8 16 22-26h-12z" fill="white" fillOpacity="0.95" />
            </svg>
          </div>
        </div>

        <div className="animate-slide-in-up max-w-2xl">
          <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-full px-4 py-1.5 mb-6">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse-soft" />
            <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">
              100% Browser-Native · Zero Upload Cost
            </span>
          </div>

          <h1 className="text-5xl sm:text-6xl font-black text-gray-900 leading-[1.08] tracking-tight mb-5">
            Share files{' '}
            <span className="text-gradient">instantly</span>
            <br />
            peer to peer.
          </h1>

          <p className="text-lg text-gray-500 mb-10 leading-relaxed max-w-lg mx-auto">
            Crispdrop streams files directly between browsers using WebRTC.
            No uploads, no server storage — just pure, fast, private transfers.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 justify-center">
            <Button
              id="hero-create-room"
              size="lg"
              onClick={() => navigate('/lobby', { state: { mode: 'create' } })}
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
              }
            >
              Create a Room
            </Button>

            <Button
              id="hero-join-room"
              variant="outline"
              size="lg"
              onClick={() => setShowJoin(true)}
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" strokeLinecap="round" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
              }
            >
              Join a Room
            </Button>
          </div>
        </div>

        {/* ── Feature Cards ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-20 max-w-3xl w-full">
          <FeatureCard
            delay={100}
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
            title="Real-time P2P Transfer"
            description="Chunks stream directly browser-to-browser over WebRTC DataChannels. Your data never touches a server."
          />
          <FeatureCard
            delay={200}
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            }
            title="Password-Protected Rooms"
            description="Each room requires a password. Only peers who know it can join — no accounts required."
          />
          <FeatureCard
            delay={300}
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            }
            title="Multi-Peer Mesh"
            description="Send to multiple peers simultaneously. Each connection is independent, maximising throughput."
          />
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="py-6 text-center text-xs text-gray-400">
        <p>
          Crispdrop © {new Date().getFullYear()} · Built with WebRTC + Socket.io ·{' '}
          <a
            href="https://github.com"
            className="text-indigo-400 hover:text-indigo-600 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Source
          </a>
        </p>
      </footer>

      {/* ── Overlays ─────────────────────────────────────────────────────── */}
      {showJoin && (
        <JoinModal
          onClose={() => setShowJoin(false)}
          onJoin={handleJoin}
        />
      )}

      <InstallPrompt />
    </div>
  );
}
