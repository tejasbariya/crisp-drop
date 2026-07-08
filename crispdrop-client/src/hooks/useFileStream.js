/**
 * hooks/useFileStream.js
 *
 * Drives the WebRTC file sending pipeline using sliceFile from chunker.js.
 * Exposes:
 *   - sendFile(file, dataChannel, options) — initiates a transfer
 *   - cancelTransfer() — aborts an in-progress transfer
 *   - progress — bytes sent / total (0–1)
 *   - bytesSent — raw bytes sent
 *   - transferState — 'idle' | 'sending' | 'paused' | 'done' | 'error' | 'cancelled'
 */

import { useState, useCallback, useRef } from 'react';
import { sliceFile, DEFAULT_CHUNK_SIZE } from '../utils/chunker';

export function useFileStream() {
  const [transferState, setTransferState] = useState('idle');
  const [bytesSent, setBytesSent] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [error, setError] = useState(null);

  const cancelRef = useRef(false);

  const progress = totalBytes > 0 ? Math.min(bytesSent / totalBytes, 1) : 0;

  /**
   * sendFile — sends a file over an open WebRTC DataChannel.
   *
   * @param {File} file
   * @param {RTCDataChannel} dataChannel
   * @param {Object} [options]
   * @param {number} [options.chunkSize]
   * @param {function(ArrayBuffer): Promise<ArrayBuffer>} [options.encryptChunk]
   *   Optional encryption hook (forward-compat layer from chunker.js)
   */
  const sendFile = useCallback(async (file, dataChannel, options = {}) => {
    if (!file || !dataChannel) return;

    cancelRef.current = false;
    setTransferState('sending');
    setBytesSent(0);
    setTotalBytes(file.size);
    setError(null);

    try {
      await sliceFile({
        file,
        dataChannel,
        chunkSize: options.chunkSize || DEFAULT_CHUNK_SIZE,
        encryptChunk: options.encryptChunk,
        onProgress: (sent) => {
          setBytesSent(sent);
        },
        shouldCancel: () => cancelRef.current,
      });

      setTransferState('done');
    } catch (err) {
      if (cancelRef.current) {
        setTransferState('cancelled');
      } else {
        console.error('[useFileStream] Transfer error:', err);
        setError(err.message);
        setTransferState('error');
      }
    }
  }, []);

  const cancelTransfer = useCallback(() => {
    cancelRef.current = true;
    setTransferState('cancelled');
  }, []);

  const reset = useCallback(() => {
    cancelRef.current = false;
    setTransferState('idle');
    setBytesSent(0);
    setTotalBytes(0);
    setError(null);
  }, []);

  return {
    sendFile,
    cancelTransfer,
    reset,
    transferState,
    bytesSent,
    totalBytes,
    progress,
    error,
  };
}
