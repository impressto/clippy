# Socket Integration Guide

This document provides instructions for integrating the Node.js socket server with the Clippy application to replace the PHP-based WebRTC signaling.

## Overview

The socket server provides real-time WebRTC signaling functionality to replace the existing PHP endpoints. This guide will walk you through the steps to integrate the socket server with the application.

## Prerequisites

1. Node.js socket server running (typically on port 3000)
2. Environment variable set: `VITE_SOCKET_SERVER_URL=http://localhost:3000` (or your server URL)

## Integration Steps

### 1. Immediate Integration

We've created a new utility file `WebRTCSocketIntegration.js` that provides a simple way to use the socket-based WebRTC functionality. Here's how to use it:

1. Import the integration utilities in your App.jsx:

```javascript
import { 
  initSocketBasedWebRTC, 
  socketServerAdapter 
} from './utils/WebRTCSocketIntegration';
```

2. Initialize the socket-based WebRTC in your component:

```javascript
// In your TextShareApp component
const socketRTC = initSocketBasedWebRTC(id, clientIdRef.current);

// Set up event handlers
socketRTC.setupEventHandlers(
  (signal) => {
    console.log(`Received signal from ${signal.from}`);
    // Process the signal...
  },
  (sessionData) => {
    console.log(`Session update: ${sessionData.activeUsers} users`);
    setActiveUsers(sessionData.activeUsers);
  },
  (clients) => {
    console.log(`Client list updated: ${clients.join(', ')}`);
    // Process client list...
  }
);

// Make the initiate function available globally for the "Connect to Peers" button
window.initiatePeerConnections = socketRTC.initiatePeerConnections;

// Clean up in useEffect
useEffect(() => {
  return () => {
    socketRTC.cleanup();
    delete window.initiatePeerConnections;
  };
}, []);
```

### 2. Full Integration with useWebRTCManager Hook

For a more comprehensive integration, you can use the `useWebRTCManager` hook from `WebRTCSocketManager.js`:

```javascript
import { useWebRTCManager } from './utils/WebRTCSocketManager';

// In your component:
const {
  rtcSupported,
  rtcConnected,
  peerDiscoveryEnabled,
  setPeerDiscoveryEnabled,
  activeUsers,
  dataChannelStatus,
  webRtcConnectionStage,
  connectToPeer,
  disconnectFromPeer,
  sendTextToPeer,
  broadcastTextToAllPeers,
} = useWebRTCManager(
  id,
  text,
  setText,
  setSavedText,
  setServerText,
  setLastServerText,
  setHasChanges,
  isTyping
);
```

### 3. Using the "Connect to Peers" Button

The ControlsBar component has been updated to include a "Connect to Peers" button when WebRTC is supported but not yet connected. This button calls `window.initiatePeerConnections()` which triggers the connection process.

## Testing the Integration

1. Run the socket server:
   ```
   cd socket-server
   npm start
   ```

2. Run the Clippy application:
   ```
   npm run dev
   ```

3. Open the application in two different browser windows or tabs
4. Click the "Connect to Peers" button to initiate WebRTC connections

## Troubleshooting

- Check browser console for connection errors
- Verify the socket server is running correctly
- Ensure the `VITE_SOCKET_SERVER_URL` environment variable is set correctly
- Try using the test page: http://localhost:5173/clippy/#/socket-test

## Overview

The recent changes introduced a Node.js Socket.IO server to replace the PHP-based WebRTC signaling. This provides several benefits:

1. Real-time communication instead of polling
2. More efficient server usage
3. Simplified WebRTC signaling process
4. Better scalability

## Step-by-Step Integration

### 1. Install Dependencies

Make sure socket.io-client is installed in your React application:

```bash
npm install socket.io-client --save
```

### 2. Replace WebRTCManager with WebRTCSocketManager

In your App.jsx file, replace the current WebRTC implementation with the socket-based implementation:

```jsx
// Add this import at the top of App.jsx
import { useWebRTCManager } from './utils/WebRTCSocketManager.js';

// Replace or add the useWebRTCManager hook initialization
const {
  rtcSupported,
  rtcConnected: isRtcConnected,
  connectionStatus,
  activeUsers,
  webRtcConnectionStage,
  broadcastTextToAllPeers,
  peerDiscoveryEnabled,
  startPeerSearch,
  disconnectPeers
} = useWebRTCManager(
  id,
  text,
  setText,
  setSavedText,
  setServerText,
  setLastServerText,
  setHasChanges,
  isTypingRef.current
);
```

### 3. Remove PHP Endpoint Calls

Remove the following functions or sections that call PHP endpoints:

1. `sendSignal` function that calls `webrtc_signaling.php`
2. `pollForSignals` function that calls `webrtc_signaling.php`
3. Any other functions that call `webrtc_discover.php` or WebRTC-related PHP endpoints

### 4. Update References

Make sure any components that use WebRTC functionality are updated to use the new hooks and methods.

### 5. Environment Configuration

Make sure your environment variables are set correctly:

```
VITE_SOCKET_SERVER_URL=http://localhost:3000
```

This should be added to your `.env.local` file or appropriate environment configuration.

### 6. Ensure Socket Server is Running

The Node.js socket server must be running when you use the application. Start it with:

```bash
cd socket-server
npm run dev
```

## Example Implementation

See `App-WebRTC-Socket.jsx` for a simplified example of how to integrate the WebRTCSocketManager. This example shows the basic structure and how to use the hook.

## Testing the Integration

1. Start the socket server
2. Run the Clippy app
3. Open multiple browser windows/tabs with the same session ID
4. Click "Connect to peers" in each window
5. Verify that WebRTC connections are established
6. Test text synchronization between windows

## Troubleshooting

- Check browser console for connection errors
- Verify that the socket server is running and accessible
- Make sure the VITE_SOCKET_SERVER_URL environment variable is set correctly
- Check network tab for any failed socket connections
