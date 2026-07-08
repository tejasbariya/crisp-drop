/**
 * utils/chunker.js — Backpressure-Aware File Chunking & Reassembly
 *
 * Sending (sliceFile):
 *   Slices a File into binary ArrayBuffer chunks using the FileReader API.
 *   Monitors the WebRTC DataChannel's bufferedAmount to implement backpressure:
 *   if the buffer exceeds the high-water mark, the stream pauses until the
 *   `bufferedamountlow` event fires before sending the next chunk.
 *
 *   This prevents the browser from running out of memory when sending large files
 *   over a connection that is slower than the disk read speed.
 *
 * Receiving (ChunkAssembler):
 *   Collects binary ArrayBuffer chunks in insertion order and assembles
 *   a final Blob once all expected bytes have been received.
 *
 * Forward-compatibility note:
 *   Both sliceFile and ChunkAssembler are designed so that a Web Crypto API
 *   encryption step can be layered in transparently:
 *     - In sliceFile: encrypt each ArrayBuffer chunk before passing to onChunk
 *     - In ChunkAssembler: decrypt each chunk in the add() method before storing
 *   No structural changes to the calling code are required.
 */

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default chunk size: 16KB. Range: 8KB–64KB. */
export const DEFAULT_CHUNK_SIZE = 16 * 1024; // 16KB

/**
 * High-water mark: pause sending when the data channel buffer exceeds this.
 * Browser DataChannel buffers are typically capped at 16MB; we pause at 1MB
 * to leave ample headroom and avoid memory pressure.
 */
const BUFFER_HIGH_WATER = 1 * 1024 * 1024; // 1MB

/**
 * Low threshold: resume sending when bufferedAmount drops below this.
 * Must be set via dataChannel.bufferedAmountLowThreshold.
 */
const BUFFER_LOW_THRESHOLD = 256 * 1024; // 256KB

// ─── File Slicing & Sending ──────────────────────────────────────────────────

/**
 * sliceFile — Reads a File in chunks and sends each over a WebRTC DataChannel
 * with backpressure management.
 *
 * @param {Object} options
 * @param {File}   options.file          - The File object to send
 * @param {RTCDataChannel} options.dataChannel - Open, ready WebRTC data channel
 * @param {number} [options.chunkSize]   - Bytes per chunk (default: DEFAULT_CHUNK_SIZE)
 * @param {function(number): void} [options.onProgress] - Called with bytes sent so far
 * @param {function(): boolean} [options.shouldCancel]  - Return true to abort transfer
 * @param {function(ArrayBuffer): Promise<ArrayBuffer>} [options.encryptChunk]
 *   Optional hook for client-side encryption before send (forward-compat layer).
 *   If omitted, chunks are sent as-is.
 *
 * @returns {Promise<void>} Resolves when all chunks have been queued to the channel.
 */
export async function sliceFile({
  file,
  dataChannel,
  chunkSize = DEFAULT_CHUNK_SIZE,
  onProgress,
  shouldCancel,
  encryptChunk,
}) {
  if (!file || !(file instanceof File)) {
    throw new TypeError('sliceFile: `file` must be a File object');
  }
  if (!dataChannel || dataChannel.readyState !== 'open') {
    throw new Error('sliceFile: dataChannel must be open');
  }

  // Clamp chunk size to safe range
  const clampedChunkSize = Math.min(Math.max(chunkSize, 8 * 1024), 64 * 1024);

  // Configure backpressure low threshold on the data channel
  dataChannel.bufferedAmountLowThreshold = BUFFER_LOW_THRESHOLD;

  let byteOffset = 0;
  const totalBytes = file.size;

  /**
   * readChunk — reads a single slice from the file as an ArrayBuffer.
   * Uses FileReader wrapped in a Promise for async/await compatibility.
   */
  const readChunk = (start, end) =>
    new Promise((resolve, reject) => {
      const slice = file.slice(start, end);
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error(`FileReader error at byte ${start}`));
      reader.readAsArrayBuffer(slice);
    });

  /**
   * waitForDrain — returns a Promise that resolves when bufferedAmount
   * drops below BUFFER_LOW_THRESHOLD, allowing sending to resume.
   */
  const waitForDrain = () =>
    new Promise((resolve, reject) => {
      const onLow = () => {
        dataChannel.removeEventListener('bufferedamountlow', onLow);
        dataChannel.removeEventListener('close', onClose);
        dataChannel.removeEventListener('error', onError);
        resolve();
      };
      const onClose = () => {
        reject(new Error('DataChannel closed while waiting for buffer drain'));
      };
      const onError = (e) => {
        reject(new Error(`DataChannel error: ${e.message || 'unknown'}`));
      };
      dataChannel.addEventListener('bufferedamountlow', onLow);
      dataChannel.addEventListener('close', onClose);
      dataChannel.addEventListener('error', onError);
    });

  // ─── Main Send Loop ───────────────────────────────────────────────────────

  while (byteOffset < totalBytes) {
    // Check for external cancellation
    if (shouldCancel?.()) {
      throw new Error('Transfer cancelled by user');
    }

    // Check data channel health
    if (dataChannel.readyState !== 'open') {
      throw new Error('DataChannel closed unexpectedly during transfer');
    }

    // Backpressure check — pause if buffer is too full
    if (dataChannel.bufferedAmount >= BUFFER_HIGH_WATER) {
      await waitForDrain();
    }

    // Read the next slice
    const end = Math.min(byteOffset + clampedChunkSize, totalBytes);
    let chunk = await readChunk(byteOffset, end);

    // Forward-compatibility: apply encryption if provided
    if (typeof encryptChunk === 'function') {
      chunk = await encryptChunk(chunk);
    }

    // Send the chunk
    dataChannel.send(chunk);
    byteOffset = end;

    // Report progress
    onProgress?.(byteOffset);
  }
}

// ─── Chunk Reassembly ─────────────────────────────────────────────────────────

/**
 * ChunkAssembler — collects incoming ArrayBuffer chunks and assembles them
 * into a final Blob when all expected bytes have arrived.
 *
 * Usage:
 *   const assembler = new ChunkAssembler({ totalSize, mimeType, onProgress, decryptChunk });
 *   dataChannel.onmessage = async (e) => {
 *     const done = await assembler.add(e.data);
 *     if (done) {
 *       const blob = assembler.assemble();
 *       // trigger download
 *     }
 *   };
 */
export class ChunkAssembler {
  /**
   * @param {Object} options
   * @param {number} options.totalSize   - Expected total bytes of the file
   * @param {string} [options.mimeType] - MIME type for the final Blob
   * @param {function(number): void} [options.onProgress] - Called with bytes received so far
   * @param {function(ArrayBuffer): Promise<ArrayBuffer>} [options.decryptChunk]
   *   Optional decryption hook (forward-compat layer matching encryptChunk in sliceFile).
   */
  constructor({ totalSize, mimeType = 'application/octet-stream', onProgress, decryptChunk }) {
    if (!totalSize || totalSize <= 0) {
      throw new TypeError('ChunkAssembler: totalSize must be a positive number');
    }
    this.totalSize = totalSize;
    this.mimeType = mimeType;
    this.onProgress = onProgress;
    this.decryptChunk = decryptChunk;

    /** @type {ArrayBuffer[]} */
    this._chunks = [];
    this._bytesReceived = 0;
    this._done = false;
  }

  /**
   * add — adds an incoming chunk to the assembler.
   * Accepts ArrayBuffer or any value from a DataChannel onmessage event.
   *
   * @param {ArrayBuffer | Blob | string} rawData
   * @returns {Promise<boolean>} true when all expected bytes have been received
   */
  async add(rawData) {
    if (this._done) return true;

    let buffer;

    if (rawData instanceof ArrayBuffer) {
      buffer = rawData;
    } else if (rawData instanceof Blob) {
      buffer = await rawData.arrayBuffer();
    } else {
      // Unexpected type — log and skip
      console.warn('[ChunkAssembler] Unexpected chunk type:', typeof rawData);
      return false;
    }

    // Forward-compat: decrypt if hook is provided
    if (typeof this.decryptChunk === 'function') {
      buffer = await this.decryptChunk(buffer);
    }

    this._chunks.push(buffer);
    this._bytesReceived += buffer.byteLength;

    // Report progress
    this.onProgress?.(this._bytesReceived);

    // Check completion
    if (this._bytesReceived >= this.totalSize) {
      this._done = true;
      return true;
    }

    return false;
  }

  /**
   * assemble — concatenates all received chunks into a single Blob.
   * Must only be called after add() returns true.
   *
   * @returns {Blob}
   * @throws {Error} if called before all chunks are received
   */
  assemble() {
    if (!this._done) {
      throw new Error('ChunkAssembler: cannot assemble — transfer is not complete');
    }
    return new Blob(this._chunks, { type: this.mimeType });
  }

  /**
   * reset — clears all state, allowing the assembler to be reused.
   */
  reset() {
    this._chunks = [];
    this._bytesReceived = 0;
    this._done = false;
  }

  get bytesReceived() {
    return this._bytesReceived;
  }

  get isComplete() {
    return this._done;
  }

  get progress() {
    if (this.totalSize === 0) return 0;
    return Math.min((this._bytesReceived / this.totalSize) * 100, 100);
  }
}

/**
 * triggerDownload — programmatically triggers a file download from a Blob.
 *
 * @param {Blob}   blob
 * @param {string} fileName
 */
export function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  // Revoke the object URL after a brief delay to allow the download to start
  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 1000);
}

/**
 * formatBytes — human-readable file size.
 *
 * @param {number} bytes
 * @param {number} [decimals=2]
 * @returns {string}
 */
export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
