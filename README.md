# Crispdrop

Crispdrop is a blazingly fast, browser-native Progressive Web App (PWA) for sharing files peer-to-peer. It leverages WebRTC for secure, direct data transfer and Socket.io for lightweight signaling. The architecture is designed for multi-core Node.js horizontal scaling, while keeping operational costs at $0.

## Features

- **Peer-to-Peer Transfer**: Files stream directly between browsers over WebRTC data channels.
- **Zero Storage Cost**: No files are ever uploaded to a central server.
- **Clustered Signaling**: The Node.js backend uses cluster-adapter and IPC to span all available CPU cores.
- **Progressive Web App**: Installable on desktop and mobile devices.
- **Multi-Peer Rooms**: Support for sending to multiple peers simultaneously.

## Tech Stack

- **Client**: React, Vite, TailwindCSS (Vanilla UI design), WebRTC API.
- **Server**: Node.js, Express, Socket.io, Node.js `cluster` API.

## Getting Started

### Prerequisites
- Node.js (v20+ recommended)

### Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/crispdrop.git
   cd crispdrop
   ```

2. **Install Client Dependencies:**
   ```bash
   cd crispdrop-client
   npm install
   ```

3. **Install Server Dependencies:**
   ```bash
   cd ../crispdrop-server
   npm install
   ```

4. **Environment Variables:**
   Copy the example env file in the server directory (or root) and adjust if needed:
   ```bash
   cp .env.example .env
   ```

### Running Locally

You'll need two terminal windows:

**Terminal 1 (Backend):**
```bash
cd crispdrop-server
npm run dev
```

**Terminal 2 (Frontend):**
```bash
cd crispdrop-client
npm run dev
```

The app will be available at `http://localhost:5173`.

## Architecture Note

The signaling server relies on `@socket.io/cluster-adapter` and `@socket.io/sticky`. It spins up one worker process per CPU core. Room metadata is synced via IPC, and peer tracking leverages `fetchSockets()`. This allows high-throughput signaling without the need for a Redis instance.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
