// WebRTCSocketIntegration.js
//
// This file provides utility functions to integrate the socket-based WebRTC
// implementation with the existing application. It serves as a bridge between
// the existing code and the WebRTCSocketManager/WebRTCSocketAdapter.
//
// Usage:
// 1. Import this file in your App.jsx
// 2. Call initSocketBasedWebRTC() to set up socket-based WebRTC functionality
// 3. Pass the returned functions to your components as needed

import socketAdapter from './WebRTCSocketAdapter';
import { useWebRTCManager } from './WebRTCSocketManager';

// Socket server URL - can be overridden with environment variable
const SOCKET_SERVER_URL = 
  import.meta.env.VITE_SOCKET_SERVER_URL || 'http://localhost:3000';

/**
 * Initialize the socket-based WebRTC functionality
 * 
 * @param {string} sessionId - The current session ID
 * @param {string} clientId - The current client ID
 * @returns {object} - Functions to interact with the socket server
 */
export const initSocketBasedWebRTC = (sessionId, clientId) => {
  // Initialize socket adapter
  socketAdapter.init(SOCKET_SERVER_URL);
  
  // Join session if we have session and client IDs
  if (sessionId && clientId) {
    socketAdapter.joinSession(sessionId, clientId);
  }
  
  /**
   * Initiate peer connections using the socket server
   */
  const initiatePeerConnections = () => {
    console.log("Initiating peer connections using socket server");
    if (!sessionId || !clientId) {
      console.error("Cannot initiate connections: missing session ID or client ID");
      return;
    }
    
    // Send a signal to all clients to initiate peer connections
    if (socketAdapter && typeof socketAdapter.sendSignal === 'function') {
      console.log("Sending hello signal to all peers via socket");
      return socketAdapter.sendSignal('all', { type: 'hello' });
    } else {
      console.error("Socket adapter not available or sendSignal method not found");
      return false;
    }
  };
  
  /**
   * Send a WebRTC signal to a specific peer
   * 
   * @param {string} targetClientId - The target client ID
   * @param {object} signal - The signal to send
   */
  const sendSignal = (targetClientId, signal) => {
    return socketAdapter.sendSignal(targetClientId, signal);
  };
  
  /**
   * Set up event handlers for socket events
   * 
   * @param {Function} onSignal - Callback when signal is received
   * @param {Function} onSessionUpdate - Callback when session is updated
   * @param {Function} onClientList - Callback when client list is received
   */
  const setupEventHandlers = (onSignal, onSessionUpdate, onClientList) => {
    socketAdapter.onSignal(onSignal || console.log);
    socketAdapter.onSessionUpdate(onSessionUpdate || console.log);
    socketAdapter.onClientList(onClientList || console.log);
  };
  
  /**
   * Clean up socket connection
   */
  const cleanup = () => {
    socketAdapter.leaveSession();
    socketAdapter.disconnect();
  };
  
  // Return functions to interact with socket server
  return {
    initiatePeerConnections,
    sendSignal,
    setupEventHandlers,
    cleanup
  };
};

/**
 * Export the useWebRTCManager hook directly
 */
export { useWebRTCManager };

// Export the socket adapter instance directly
export const socketServerAdapter = socketAdapter;
