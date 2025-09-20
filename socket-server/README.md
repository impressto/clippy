# Clippy WebRTC Socket Server

This is a Node.js WebSocket server that handles WebRTC signaling for the Clippy text sharing application. It replaces the PHP-based signaling endpoints with a more efficient real-time communication system using Socket.IO.

## Features

- Real-time WebRTC signaling
- Client presence tracking
- Session management
- Active user statistics
- Compatible with the Clippy front-end

## Requirements

- Node.js 14+ (16+ recommended)
- npm or yarn

## Installation

1. Install dependencies:

```bash
# Using npm
npm install

# Using yarn
yarn install
```

2. Configure environment variables (optional):
   - Create a `.env` file in this directory with:
   ```
   PORT=3000
   ```
   - You can change the port as needed.

## Running the Server

Start the server in development mode (with auto-restart):

```bash
npm run dev
```

Start the server in production mode:

```bash
npm start
```

## API Endpoints

- `GET /status` - Check server status and get active sessions

## WebSocket Events

### Client to Server

- `join-session` - Join a session with sessionId and clientId
- `leave-session` - Leave the current session
- `signal` - Send a WebRTC signaling message to another client
- `presence` - Announce presence and get list of other clients

### Server to Client

- `signal` - Receive a WebRTC signaling message from another client
- `session-update` - Receive updates about active users in the session
- `client-list` - Receive list of active clients in the session

## Integration with Clippy Frontend

To use this WebSocket server with the Clippy frontend, set the `VITE_SOCKET_SERVER_URL` environment variable in your `.env` or `.env.local` file:

```
VITE_SOCKET_SERVER_URL=http://localhost:3000
```

Then, make sure to import `WebRTCSocketManager.js` instead of `WebRTCManager.js` in your React components.

## Deploying to Production

1. Build for production:

```bash
npm install
```

2. Start with a process manager like PM2:

```bash
pm2 start server.js --name clippy-socket-server
```

## Running Behind a Reverse Proxy

When running behind Nginx or another reverse proxy, ensure WebSocket connections are properly forwarded:

For Nginx, add:

```
location /socket.io/ {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```
