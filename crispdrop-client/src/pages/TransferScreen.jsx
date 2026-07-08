/**
 * pages/TransferScreen.jsx — File Transfer UI
 *
 * Sender flow:
 *   1. Drop zone / file picker
 *   2. Announce transfer metadata to room via Socket.io
 *   3. Drive sliceFile over each peer's DataChannel via useFileStream
 *   4. Show per-peer progress bars and overall status
 *   5. Signal transfer:complete when all chunks are sent
 *
 * Receiver flow:
 *   1. React to `transfer:incoming` event (set by SocketContext)
 *   2. Register chunk handler with registerTransferHandlers
 *   3. Assemble chunks with ChunkAssembler
 *   4. Auto-trigger download when complete
 *
 * Chat panel: real-time message relay via Socket.io
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { useFileStream } from '../hooks/useFileStream';
import { ChunkAssembler, triggerDownload, formatBytes, DEFAULT_CHUNK_SIZE } from '../utils/chunker';
import { Button } from '../components/Button';
import { ProgressBar } from '../components/ProgressBar';
import { Input } from '../components/Input';
import DOMPurify from 'dompurify';

// ─── Chat Panel ───────────────────────────────────────────────────────────────

function ChatPanel({ messages, mySocketId, onSend }) {
  const [text, setText] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {messages.length === 0 && (
          <div className="text-center text-sm text-gray-400 py-8">
            <svg className="mx-auto mb-2" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            No messages yet
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.isSelf ? 'items-end' : 'items-start'}`}
          >
            {!msg.isSelf && (
              <span className="text-xs text-gray-400 mb-1 ml-1">{msg.fromName}</span>
            )}
            <div
              className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                msg.isSelf
                  ? 'bg-indigo-600 text-white rounded-tr-sm'
                  : 'bg-gray-100 text-gray-800 rounded-tl-sm'
              }`}
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(msg.text) }}
            />
            <span className="text-2xs text-gray-300 mt-1 mx-1">
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-gray-100">
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            id="chat-input"
            type="text"
            placeholder="Message…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            className="input-base flex-1 !py-2.5 !text-sm"
          />
          <button
            id="chat-send"
            type="submit"
            disabled={!text.trim()}
            className="btn-primary !px-4 !py-2.5 !rounded-xl disabled:opacity-40"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Drop Zone ────────────────────────────────────────────────────────────────

function DropZone({ onFileSelected, disabled }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) onFileSelected(file);
  };

  return (
    <div
      id="file-drop-zone"
      className={`drop-zone cursor-pointer select-none ${dragging ? 'drag-over' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      tabIndex={0}
      aria-label="Drop a file here or click to select"
      onKeyDown={(e) => e.key === 'Enter' && !disabled && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        id="file-input"
        type="file"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFileSelected(file);
          e.target.value = '';
        }}
        disabled={disabled}
      />

      <div className="flex flex-col items-center gap-4 pointer-events-none">
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors ${dragging ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>

        <div>
          <p className="font-semibold text-gray-700 text-base">
            {dragging ? 'Drop it!' : 'Drop a file or click to browse'}
          </p>
          <p className="text-sm text-gray-400 mt-1">Any file type · No size limit</p>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function TransferScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    peers,
    mySocketId,
    myName,
    isHost,
    chatMessages,
    sendChatMessage,
    incomingTransfer,
    announceTransfer,
    announceTransferComplete,
    signalReady,
    getDataChannel,
    getAllDataChannels,
    registerTransferHandlers,
    leaveRoom,
  } = useSocket();

  const { sendFile, transferState, bytesSent, totalBytes, progress, error, reset } = useFileStream();

  // Selected file
  const [selectedFile, setSelectedFile] = useState(null);

  // Receiving state
  const [receiveProgress, setReceiveProgress] = useState(0);
  const [receiveTotalBytes, setReceiveTotalBytes] = useState(0);
  const [receiveState, setReceiveState] = useState('idle'); // idle | receiving | done
  const [receivedFileName, setReceivedFileName] = useState('');
  const [downloadUrl, setDownloadUrl] = useState(null);

  // Assembler ref (one per active transfer)
  const assemblerRef = useRef(null);
  const transferIdRef = useRef(null);

  // ── Receiver: register chunk handler ──────────────────────────────────────

  useEffect(() => {
    registerTransferHandlers({
      onChunk: async ({ data }) => {
        if (!assemblerRef.current) return;
        const done = await assemblerRef.current.add(data);
        if (done) {
          const blob = assemblerRef.current.assemble();
          triggerDownload(blob, receivedFileName || 'crispdrop-file');
          setReceiveState('done');
          setDownloadUrl(URL.createObjectURL(blob));
        }
      },
      onComplete: ({ transferId }) => {
        // Server signals EOF — assembler handles actual completion via bytes check
        if (assemblerRef.current && !assemblerRef.current.isComplete) {
          console.warn('[TransferScreen] transfer:complete received but assembler not done yet');
        }
      },
    });
  }, [receivedFileName, registerTransferHandlers]);

  // ── Receiver: react to incoming transfer announcement ─────────────────────

  useEffect(() => {
    if (!incomingTransfer || isHost) return;

    const { fileName, fileSize, fileType, transferId, fromSocketId } = incomingTransfer;

    setReceivedFileName(fileName);
    setReceiveTotalBytes(fileSize);
    setReceiveState('receiving');
    setReceiveProgress(0);
    transferIdRef.current = transferId;

    // Create assembler for this transfer
    assemblerRef.current = new ChunkAssembler({
      totalSize: fileSize,
      mimeType: fileType || 'application/octet-stream',
      onProgress: (received) => {
        setReceiveProgress(received);
      },
    });

    // Signal ready to sender
    signalReady(transferId);
  }, [incomingTransfer, isHost, signalReady]);

  // ── Sender: send file to all peers ────────────────────────────────────────

  const handleSendFile = useCallback(async () => {
    if (!selectedFile) return;

    // Announce transfer metadata to all peers
    const transferMeta = {
      fileName: selectedFile.name,
      fileSize: selectedFile.size,
      fileType: selectedFile.type || 'application/octet-stream',
      chunkSize: DEFAULT_CHUNK_SIZE,
    };
    announceTransfer(transferMeta);

    // Wait a moment for receivers to set up their assemblers
    await new Promise((r) => setTimeout(r, 500));

    // Get all open data channels and send to each peer simultaneously
    const channels = getAllDataChannels();
    if (channels.length === 0) {
      return;
    }

    // Send to first connected peer (for multi-peer, we send in parallel)
    const sendPromises = channels.map((dc) =>
      sendFile(selectedFile, dc, { chunkSize: DEFAULT_CHUNK_SIZE })
    );

    try {
      await Promise.all(sendPromises);
      announceTransferComplete(transferMeta.fileName);
    } catch (err) {
      console.error('[TransferScreen] Send failed:', err);
    }
  }, [selectedFile, announceTransfer, getAllDataChannels, sendFile, announceTransferComplete]);

  const handleLeave = () => {
    leaveRoom();
    navigate('/');
  };

  // ── Compute state labels ───────────────────────────────────────────────────

  const connectedPeers = peers.filter((p) => p.socketId !== mySocketId);
  const hasOpenChannels = getAllDataChannels().length > 0;

  const sendStateLabel = {
    idle: selectedFile ? `Ready to send ${formatBytes(selectedFile.size)}` : 'Select a file',
    sending: 'Sending…',
    done: 'Transfer complete ✓',
    error: `Error: ${error}`,
    cancelled: 'Transfer cancelled',
  }[transferState] || '';

  return (
    <div className="min-h-screen bg-hero">
      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 glass border-b border-white/60 px-4 sm:px-8 py-3 flex items-center gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-400 flex items-center justify-center shadow-indigo flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
              <path d="M13 2L4.5 13H11L8 22l12.5-12.5H14z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm truncate">
              {location.state?.roomId ? `Room: ${location.state.roomId.slice(0, 8)}…` : 'Transfer Room'}
            </p>
            <p className="text-xs text-gray-400">
              {connectedPeers.length + 1} participants
            </p>
          </div>
        </div>

        {/* Peer avatars */}
        <div className="flex -space-x-2 mx-auto">
          {[{ socketId: mySocketId, name: myName }, ...connectedPeers].slice(0, 5).map((p, i) => (
            <div
              key={p.socketId}
              title={p.name}
              className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-400 border-2 border-white flex items-center justify-center text-white text-xs font-bold"
              style={{ zIndex: 10 - i }}
            >
              {p.name?.[0]?.toUpperCase()}
            </div>
          ))}
        </div>

        <Button id="transfer-leave" variant="ghost" size="sm" onClick={handleLeave}>
          Leave
        </Button>
      </header>

      {/* ── Main Layout ───────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8 flex flex-col lg:flex-row gap-6">

        {/* ── Transfer Panel ─────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col gap-5">

          {/* Sender section */}
          {(isHost || connectedPeers.length > 0) && (
            <section className="card p-6 flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  Send a File
                </h2>
                {!hasOpenChannels && connectedPeers.length > 0 && (
                  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full font-medium">
                    Establishing P2P connection…
                  </span>
                )}
              </div>

              {transferState === 'idle' || transferState === 'cancelled' ? (
                <DropZone
                  onFileSelected={setSelectedFile}
                  disabled={!hasOpenChannels && connectedPeers.length > 0}
                />
              ) : null}

              {selectedFile && (transferState === 'idle' || transferState === 'cancelled') && (
                <div className="flex items-center gap-4 p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                  <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 flex-shrink-0">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate text-sm">{selectedFile.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatBytes(selectedFile.size)} · {selectedFile.type || 'Unknown type'}
                    </p>
                  </div>
                  <button
                    id="clear-selected-file"
                    onClick={() => { setSelectedFile(null); reset(); }}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label="Remove selected file"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              )}

              {/* Send progress */}
              {(transferState === 'sending' || transferState === 'done') && (
                <div className="flex flex-col gap-3">
                  <ProgressBar
                    progress={progress}
                    bytesSent={bytesSent}
                    totalBytes={totalBytes}
                    label={selectedFile?.name}
                    color={transferState === 'done' ? 'green' : 'indigo'}
                  />

                  {transferState === 'done' && (
                    <div className="flex items-center gap-2 text-emerald-600 text-sm font-semibold">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                      Transfer complete — all peers received the file!
                    </div>
                  )}
                </div>
              )}

              {/* Error state */}
              {transferState === 'error' && (
                <p className="text-sm text-red-500 font-medium" role="alert">
                  Transfer failed: {error}
                </p>
              )}

              {/* Send button */}
              {selectedFile && (transferState === 'idle' || transferState === 'cancelled') && (
                <Button
                  id="send-file-btn"
                  fullWidth
                  disabled={!hasOpenChannels}
                  onClick={handleSendFile}
                  icon={
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  }
                >
                  Send to {connectedPeers.length} peer{connectedPeers.length !== 1 ? 's' : ''}
                </Button>
              )}

              {transferState === 'sending' && (
                <Button id="cancel-transfer-btn" variant="danger" fullWidth onClick={reset}>
                  Cancel Transfer
                </Button>
              )}

              {transferState === 'done' && (
                <Button
                  id="send-another-btn"
                  variant="secondary"
                  fullWidth
                  onClick={() => { setSelectedFile(null); reset(); }}
                >
                  Send Another File
                </Button>
              )}
            </section>
          )}

          {/* Receiving section */}
          {receiveState !== 'idle' && (
            <section className="card p-6 flex flex-col gap-4 animate-fade-in">
              <h2 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Receiving File
              </h2>

              <ProgressBar
                progress={receiveTotalBytes > 0 ? receiveProgress / receiveTotalBytes : 0}
                bytesSent={receiveProgress}
                totalBytes={receiveTotalBytes}
                label={receivedFileName}
                color={receiveState === 'done' ? 'green' : 'indigo'}
                animated={receiveState !== 'done'}
              />

              {receiveState === 'done' && (
                <div className="flex flex-col items-start gap-3">
                  <div className="flex items-center gap-2 text-emerald-600 text-sm font-semibold">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    File received! Download started automatically.
                  </div>
                  {downloadUrl && (
                    <a
                      id="manual-download-link"
                      href={downloadUrl}
                      download={receivedFileName}
                      className="text-sm text-indigo-600 underline underline-offset-2 hover:text-indigo-800 transition-colors"
                    >
                      Click here if download didn't start
                    </a>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Empty state: no peers */}
          {connectedPeers.length === 0 && receiveState === 'idle' && (
            <div className="card p-10 flex flex-col items-center gap-4 text-center text-gray-400">
              <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-gray-600">Waiting for peers to connect</p>
                <p className="text-sm mt-1">WebRTC connections are established once all peers join the room</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Chat Sidebar ───────────────────────────────────────────────── */}
        <aside className="w-full lg:w-80 card overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 10rem)', minHeight: '400px' }}>
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-900 text-base flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Room Chat
              <span className="ml-auto text-xs font-normal text-gray-400">
                {connectedPeers.length + 1} online
              </span>
            </h2>
          </div>
          <div className="flex-1 overflow-hidden">
            <ChatPanel
              messages={chatMessages}
              mySocketId={mySocketId}
              onSend={sendChatMessage}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
