// WebRTCSocketAdapter.js
// This adapter connects to the Node.js WebSocket server for WebRTC signaling
import { io } from 'socket.io-client';

class WebRTCSocketAdapter {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.sessionId = null;
    this.clientId = null;
    this.onSignalCallback = null;
    this.onSessionUpdateCallback = null;
    this.onClientListCallback = null;
  }

  // Initialize the socket connection
  init(socketServerUrl = 'http://localhost:3000') {
    // Don't re-initialize if already connected
    if (this.socket && this.isConnected) return;
    
    console.log(`Initializing WebRTC Socket adapter with URL: ${socketServerUrl}`);
    
    this.socket = io(socketServerUrl, {
      reconnectionDelayMax: 10000,
      transports: ['websocket', 'polling']
    });
    
    // Set up event listeners
    this.socket.on('connect', () => {
      console.log('Connected to WebRTC socket server');
      this.isConnected = true;
      
      // Rejoin session if we have sessionId and clientId
      if (this.sessionId && this.clientId) {
        this.joinSession(this.sessionId, this.clientId);
      }
    });
    
    this.socket.on('disconnect', () => {
      console.log('Disconnected from WebRTC socket server');
      this.isConnected = false;
    });
    
    this.socket.on('signal', (data) => {
      console.log(`Received signal from ${data.from}`);
      if (this.onSignalCallback) {
        this.onSignalCallback(data);
      }
    });
    
    this.socket.on('session-update', (data) => {
      console.log(`Session update: ${data.activeUsers} active users`);
      if (this.onSessionUpdateCallback) {
        this.onSessionUpdateCallback(data);
      }
    });
    
    this.socket.on('client-list', (clients) => {
      console.log(`Received client list: ${clients.join(', ')}`);
      if (this.onClientListCallback) {
        this.onClientListCallback(clients);
      }
    });
    
    return this;
  }

  // Join a session
  joinSession(sessionId, clientId) {
    if (!this.isConnected) {
      console.warn('Cannot join session: not connected to socket server');
      return false;
    }
    
    this.sessionId = sessionId;
    this.clientId = clientId;
    
    console.log(`Joining session ${sessionId} as ${clientId}`);
    this.socket.emit('join-session', { sessionId, clientId });
    
    return true;
  }

  // Leave the current session
  leaveSession() {
    if (!this.isConnected || !this.sessionId) {
      return false;
    }
    
    console.log(`Leaving session ${this.sessionId}`);
    this.socket.emit('leave-session');
    
    return true;
  }

  // Send a WebRTC signal
  sendSignal(target, signal) {
    if (!this.isConnected || !this.sessionId) {
      console.warn('Cannot send signal: not connected or no session');
      return false;
    }
    
    console.log(`Sending signal to ${target}: ${signal.type || 'ICE candidate'}`);
    this.socket.emit('signal', { target, signal });
    
    return true;
  }

  // Announce presence to get client list
  sendPresenceAnnouncement() {
    if (!this.isConnected || !this.sessionId) {
      console.warn('Cannot announce presence: not connected or no session');
      return false;
    }
    
    console.log('Sending presence announcement');
    this.socket.emit('presence');
    
    return true;
  }

  // Register signal callback
  onSignal(callback) {
    this.onSignalCallback = callback;
  }

  // Register session update callback
  onSessionUpdate(callback) {
    this.onSessionUpdateCallback = callback;
  }

  // Register client list callback
  onClientList(callback) {
    this.onClientListCallback = callback;
  }
  
  // Disconnect from socket server
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }
}

// Export a singleton instance
const socketAdapter = new WebRTCSocketAdapter();
export default socketAdapter;
