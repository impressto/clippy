// WebRTCManager.js - Handles all WebRTC peer connections and data channels
import { useState, useRef, useEffect, useCallback } from 'react';

// Constants for WebRTC configuration
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

// API Base URL
const API_BASE_URL = window.location.pathname.includes('/clippy') 
  ? '/clippy/api' 
  : '/api';

// Rate limiting helper
const rateLimiters = {};
const isRateLimited = (key, limitMs = 1000) => {
  const now = Date.now();
  if (!rateLimiters[key] || now - rateLimiters[key] > limitMs) {
    rateLimiters[key] = now;
    return false;
  }
  return true;
};

/**
 * Custom hook to manage WebRTC connections for a shared text session
 * 
 * @param {string} id - The session ID
 * @param {string} text - The current text value
 * @param {function} setText - Function to update text value
 * @param {function} setSavedText - Function to update saved text value
 * @param {function} setServerText - Function to update server text value 
 * @param {function} setLastServerText - Function to update last server text value
 * @param {function} setHasChanges - Function to update hasChanges value
 * @param {boolean} isTyping - Whether user is currently typing
 * @returns {Object} WebRTC connection state and methods
 */
export const useWebRTCManager = (
  id,
  text,
  setText,
  setSavedText,
  setServerText,
  setLastServerText,
  setHasChanges,
  isTyping
) => {
  // State for tracking WebRTC status
  const [rtcSupported, setRtcSupported] = useState(false);
  const [rtcConnected, setRtcConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [activeUsers, setActiveUsers] = useState(1);
  const [dataChannelStatus, setDataChannelStatus] = useState({});
  // Explicit state for peer discovery control - false by default for privacy
  const [peerDiscoveryEnabled, setPeerDiscoveryEnabled] = useState(false);
  // More detailed connection stage for UI feedback
  const [webRtcConnectionStage, setWebRtcConnectionStage] = useState('waiting');
  
  // Debug mode state
  const [debugMode, setDebugMode] = useState(false);
  const [debugData, setDebugData] = useState(null);
  
  // Refs to maintain state across re-renders
  const clientIdRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const dataChannelsRef = useRef({});
  const isTypingRef = useRef(isTyping);
  const lastSentTextRef = useRef('');
  const lastReceivedTextRef = useRef('');
  const lastServerTextRef = useRef('');
  const pendingTextUpdatesRef = useRef(null);
  const peerDiscoveryEnabledRef = useRef(false);
  // Store pending ICE candidates that arrive before remote description is set
  const pendingIceCandidatesRef = useRef({});
  
  // Initialize client ID on component mount
  useEffect(() => {
    if (!clientIdRef.current) {
      clientIdRef.current = Math.random().toString(36).substring(2, 10);
      console.log(`Generated WebRTCManager client ID: ${clientIdRef.current}`);
    }
    
    // Check if WebRTC is supported
    if (window.RTCPeerConnection) {
      setRtcSupported(true);
      console.log('WebRTC is supported');
    } else {
      console.warn('WebRTC is not supported in this browser');
    }
    
    return () => {
      // Clean up all connections when unmounting
      Object.keys(peerConnectionsRef.current).forEach(peerId => {
        handlePeerDisconnect(peerId);
      });
    };
  }, []);
  
  // We've removed auto-enabling of peer discovery
  // Now the user must explicitly click "Connect to peers" to enable discovery
  
  // Update typing state ref when the prop changes
  useEffect(() => {
    isTypingRef.current = isTyping;
  }, [isTyping]);
  
  // Update server text ref when needed
  useEffect(() => {
    lastServerTextRef.current = text;
  }, [text]);
  
  // Helper function to update connection status
  // Function to update active user count based on WebRTC connections
  // This replaces the server-based activeUsers count with a more accurate
  // count derived directly from established WebRTC connections
  const updateActiveUserCount = useCallback(() => {
    // Count number of connected peers plus this client
    const connectedPeers = Object.keys(dataChannelsRef.current).filter(
      peerId => dataChannelsRef.current[peerId].readyState === 'open'
    ).length;
    
    // Add 1 for the current user
    const totalUsers = connectedPeers + 1;
    
    // Update active users count if different
    if (totalUsers !== activeUsers) {
      console.log(`Updating active users count from ${activeUsers} to ${totalUsers} (based on WebRTC connections)`);
      setActiveUsers(totalUsers);
    }
  }, [activeUsers]);

  const updateRtcConnectionStatus = useCallback(() => {
    const peerCount = Object.keys(peerConnectionsRef.current).length;
    const connectedChannels = Object.values(dataChannelsRef.current).filter(
      channel => channel.readyState === 'open'
    ).length;
    
    const connectingCount = Object.values(peerConnectionsRef.current).filter(
      pc => pc.connectionState === 'connecting' || pc.connectionState === 'new'
    ).length;
    
    const failedCount = Object.values(peerConnectionsRef.current).filter(
      pc => pc.connectionState === 'failed' || pc.connectionState === 'closed'
    ).length;
    
    let newStatus = 'disconnected';
    if (connectedChannels > 0) {
      newStatus = 'connected';
    } else if (connectingCount > 0) {
      newStatus = 'connecting';
    }
    
    // Update the connection stage for more detailed UI feedback
    const newConnectionStage = 
      connectedChannels > 0 ? 'fully-connected' :
      connectingCount > 0 ? 'connecting' :
      failedCount > 0 && connectedChannels === 0 ? 'failed' :
      peerDiscoveryEnabled && peerCount === 0 ? 'discovering' : 'waiting';
    
    console.log(`WebRTC status update: ${newStatus}, stage: ${newConnectionStage}, peers: ${peerCount}, open channels: ${connectedChannels}`);
    setRtcConnected(connectedChannels > 0);
    setConnectionStatus(newStatus);
    setWebRtcConnectionStage(newConnectionStage);
    
    // Update data channel status for debugging
    const channelStatus = {};
    Object.keys(dataChannelsRef.current).forEach(peerId => {
      const channel = dataChannelsRef.current[peerId];
      channelStatus[peerId] = {
        state: channel ? channel.readyState : 'closed',
        connection: peerConnectionsRef.current[peerId]?.connectionState || 'none'
      };
    });
    setDataChannelStatus(channelStatus);
    
    // Update active user count based on WebRTC connections
    updateActiveUserCount();
  }, [updateActiveUserCount, peerDiscoveryEnabled]);
  
  // Check the connection status with a peer and attempt to reconnect if needed
  const checkPeerConnectionStatus = useCallback((peerId) => {
    const connection = peerConnectionsRef.current[peerId];
    const connectionState = connection?.connectionState;
    
    console.log(`Checking connection with peer ${peerId}: ${connectionState || 'no connection'}`);
    
    // If the connection is in a problematic state, handle reconnection
    if (!connection || 
        !connectionState || 
        connectionState === 'disconnected' || 
        connectionState === 'failed' || 
        connectionState === 'closed') {
      
      console.log(`Connection with peer ${peerId} needs recovery, current state: ${connectionState || 'none'}`);
      
      // Clean up the existing connection
      handlePeerDisconnect(peerId);
      
      // Send a new presence announcement to trigger reconnection
      setTimeout(() => {
        console.log(`Triggering reconnection with peer ${peerId}`);
        sendPresenceAnnouncement(true); // Force a presence announcement
      }, 1000);
      
      return false;
    }
    
    return true;
  }, []);
  
  // Send WebRTC signal to another client
  const sendSignal = useCallback(async (targetClientId, signal) => {
    if (!id || !clientIdRef.current) return;
    
    // Only send signals if peer discovery is enabled
    if (!peerDiscoveryEnabledRef.current) {
      console.log('Skipping signal send because peer discovery is disabled');
      return;
    }
    
    try {
      const signalData = {
        from: clientIdRef.current,
        to: targetClientId,
        ...signal
      };
      
      const headers = new Headers();
      headers.append('Content-Type', 'application/json');
      headers.append('X-Client-ID', clientIdRef.current);
      headers.append('X-Session-ID', id); // Add session ID header
      if (debugMode) {
        headers.append('X-Debug-Mode', 'true');
      }
      
      console.log(`Sending signal to ${targetClientId}:`, signal.type);
      
      const response = await fetch(`${API_BASE_URL}/webrtc_signaling.php`, {
        method: 'POST',
        headers,
        body: JSON.stringify(signalData)
      });
      
      if (!response.ok) {
        throw new Error(`Signal send failed: ${response.status} ${response.statusText}`);
      }
      
      // If broadcast, we don't need to process the response
      if (targetClientId === 'all') return;
      
      const data = await response.json();
      
      if (data.status !== 'success') {
        throw new Error(`Signal send failed: ${data.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error sending signal:', error);
    }
  }, [id, debugMode]);
  
  // Poll for signals from other clients
  const pollSignals = useCallback(async () => {
    if (!id || !clientIdRef.current) return;
    
    // Only poll for signals if peer discovery is enabled
    if (!peerDiscoveryEnabledRef.current) {
      console.log('Skipping signal polling because peer discovery is disabled');
      return;
    }
    
    // Apply rate limiting for polling
    if (isRateLimited('poll', 2000)) {
      return;
    }
    
    try {
      const headers = new Headers();
      headers.append('X-Client-ID', clientIdRef.current);
      headers.append('X-Session-ID', id); // Add session ID header
      if (debugMode) {
        headers.append('X-Debug-Mode', 'true');
      }
      
      const response = await fetch(`${API_BASE_URL}/webrtc_signaling.php?poll=true`, {
        headers
      });
      
      if (!response.ok) {
        throw new Error(`Signal poll failed: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.status === 'success' && data.signals && Array.isArray(data.signals)) {
        if (data.signals.length > 0) {
          console.log(`Received ${data.signals.length} signals`);
        }
        
        // Process each signal
        for (const signal of data.signals) {
          processSignal(signal);
        }
        
        // Store debug data if available and debug mode is on
        if (debugMode && data.debug) {
          setDebugData(data.debug);
        }
      }
    } catch (error) {
      console.error('Error polling signals:', error);
    }
  }, [id, debugMode]);
  
  // Process a WebRTC signal
  const processSignal = useCallback((signal) => {
    if (!signal || !signal.from || signal.from === clientIdRef.current) return;
    
    const { from: peerId, type } = signal;
    
    console.log(`Processing signal from ${peerId}:`, type);
    
    // Handle different signal types
    switch (type) {
      case 'hello':
        // If we receive a hello signal, send an offer
        createPeerConnection(peerId, true);
        break;
        
      case 'offer':
        // If we receive an offer, create a peer connection if needed and set remote description
        handleOffer(peerId, signal);
        break;
        
      case 'answer':
        // If we receive an answer, set remote description
        handleAnswer(peerId, signal);
        break;
        
      case 'ice-candidate':
        // If we receive an ICE candidate, add it to the peer connection
        handleIceCandidate(peerId, signal);
        break;
        
      default:
        console.warn(`Unknown signal type: ${type}`);
    }
  }, []);
  
  // Create a peer connection
  const createPeerConnection = useCallback((peerId, initiator = false) => {
    // Check if we already have a connection
    if (peerConnectionsRef.current[peerId]) {
      const existingState = peerConnectionsRef.current[peerId].connectionState;
      
      // Only reuse if the connection is in a good state
      if (existingState === 'connected' || existingState === 'connecting') {
        console.log(`Reusing existing connection to ${peerId}, state: ${existingState}`);
        return peerConnectionsRef.current[peerId];
      }
      
      // Otherwise clean up and create a new connection
      console.log(`Replacing problematic connection to ${peerId}, state: ${existingState}`);
      handlePeerDisconnect(peerId);
    }
    
    console.log(`Creating new connection to ${peerId}, initiator: ${initiator}`);
    
    // Create new RTCPeerConnection
    const peerConnection = new RTCPeerConnection(RTC_CONFIG);
    peerConnectionsRef.current[peerId] = peerConnection;
    
    // Set up data channel
    if (initiator) {
      console.log(`Creating data channel as initiator for ${peerId}`);
      const dataChannel = peerConnection.createDataChannel('text');
      setupDataChannel(dataChannel, peerId);
    } else {
      // If not initiator, set up handler for data channel
      peerConnection.ondatachannel = (event) => {
        console.log(`Received data channel from ${peerId}`);
        setupDataChannel(event.channel, peerId);
      };
    }
    
    // Set up ICE candidate handling
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal(peerId, {
          type: 'ice-candidate',
          candidate: event.candidate
        });
      }
    };
    
    // Track connection state changes
    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      console.log(`Connection state change with ${peerId}: ${state}`);
      
      if (state === 'connected') {
        console.log(`Connected to peer ${peerId}`);
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        console.log(`Disconnected from peer ${peerId}`);
        
        // If connection is closed/failed, clean up
        if (state === 'failed' || state === 'closed') {
          handlePeerDisconnect(peerId);
        }
      }
      
      updateRtcConnectionStatus();
    };
    
    // If initiator, create offer
    if (initiator) {
      createOffer(peerId, peerConnection);
    }
    
    return peerConnection;
  }, [sendSignal, updateRtcConnectionStatus]);
  
  // Create and send an offer
  const createOffer = useCallback(async (peerId, peerConnection) => {
    try {
      console.log(`Creating offer for ${peerId}`);
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      
      sendSignal(peerId, {
        type: 'offer',
        sdp: peerConnection.localDescription
      });
    } catch (error) {
      console.error(`Error creating offer for ${peerId}:`, error);
    }
  }, [sendSignal]);
  
  // Handle an offer from a peer
  const handleOffer = useCallback(async (peerId, signal) => {
    try {
      console.log(`Handling offer from ${peerId}`);
      
      // Create peer connection if it doesn't exist
      const peerConnection = peerConnectionsRef.current[peerId] || createPeerConnection(peerId);
      
      // Set remote description from offer
      await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      
      // Apply any pending ICE candidates
      const pendingCandidates = pendingIceCandidatesRef.current[peerId];
      if (pendingCandidates && pendingCandidates.length > 0) {
        console.log(`Applying ${pendingCandidates.length} buffered ICE candidates for ${peerId}`);
        
        for (const candidate of pendingCandidates) {
          try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.warn(`Error applying buffered ICE candidate: ${err.message}`);
          }
        }
        
        // Clear the buffer
        pendingIceCandidatesRef.current[peerId] = [];
      }
      
      // Create and send answer
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      
      sendSignal(peerId, {
        type: 'answer',
        sdp: peerConnection.localDescription
      });
    } catch (error) {
      console.error(`Error handling offer from ${peerId}:`, error);
    }
  }, [createPeerConnection, sendSignal]);
  
  // Handle an answer from a peer
  const handleAnswer = useCallback(async (peerId, signal) => {
    try {
      console.log(`Handling answer from ${peerId}`);
      
      const peerConnection = peerConnectionsRef.current[peerId];
      if (!peerConnection) {
        console.warn(`No peer connection for ${peerId} to handle answer`);
        return;
      }
      
      await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      
      // Apply any pending ICE candidates now that remote description is set
      const pendingCandidates = pendingIceCandidatesRef.current[peerId];
      if (pendingCandidates && pendingCandidates.length > 0) {
        console.log(`Applying ${pendingCandidates.length} buffered ICE candidates for ${peerId}`);
        
        for (const candidate of pendingCandidates) {
          try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.warn(`Error applying buffered ICE candidate: ${err.message}`);
          }
        }
        
        // Clear the buffer
        pendingIceCandidatesRef.current[peerId] = [];
      }
    } catch (error) {
      console.error(`Error handling answer from ${peerId}:`, error);
    }
  }, []);
  
  // Handle ICE candidate from a peer
  const handleIceCandidate = useCallback(async (peerId, signal) => {
    try {
      const peerConnection = peerConnectionsRef.current[peerId];
      if (!peerConnection) {
        console.warn(`No peer connection for ${peerId} to handle ICE candidate`);
        return;
      }
      
      // Check if remote description is set
      if (peerConnection.remoteDescription === null) {
        // Buffer the candidate for later
        console.log(`Remote description not set yet for ${peerId}, buffering ICE candidate`);
        if (!pendingIceCandidatesRef.current[peerId]) {
          pendingIceCandidatesRef.current[peerId] = [];
        }
        pendingIceCandidatesRef.current[peerId].push(signal.candidate);
      } else {
        // Add the candidate immediately
        await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    } catch (error) {
      console.error(`Error handling ICE candidate from ${peerId}:`, error);
    }
  }, []);
  
  // Handle peer disconnect
  const handlePeerDisconnect = useCallback((peerId) => {
    console.log(`Handling peer disconnect for ${peerId}`);
    
    // Close data channel if it exists
    if (dataChannelsRef.current[peerId]) {
      dataChannelsRef.current[peerId].close();
      delete dataChannelsRef.current[peerId];
    }
    
    // Close peer connection if it exists
    if (peerConnectionsRef.current[peerId]) {
      peerConnectionsRef.current[peerId].close();
      delete peerConnectionsRef.current[peerId];
    }
    
    // Clean up any buffered ICE candidates
    if (pendingIceCandidatesRef.current[peerId]) {
      delete pendingIceCandidatesRef.current[peerId];
    }
    
    // Update connection status
    updateRtcConnectionStatus();
  }, [updateRtcConnectionStatus]);
  
  // Set up data channel for a peer
  const setupDataChannel = useCallback((dataChannel, peerId) => {
    console.log(`Setting up data channel for peer ${peerId}`);
    dataChannelsRef.current[peerId] = dataChannel;
    
    dataChannel.onopen = () => {
      console.log(`Data channel with ${peerId} opened`);
      
      // Update the overall connection status when a data channel opens
      updateRtcConnectionStatus();
      
      // When connected, send current text to peer
      if (text) {
        console.log(`Sending initial text to peer ${peerId}, length: ${text.length}`);
        // Force send text to the peer, even if it's the same as last sent
        // This ensures new connections get the current text state
        try {
          dataChannel.send(JSON.stringify({
            type: 'text_update',
            text: text
          }));
          console.log(`Initial text sent to peer ${peerId}`);
          
          // Schedule a redundant text send after a short delay
          // This helps resolve issues where the first message might be missed
          setTimeout(() => {
            if (dataChannel.readyState === 'open') {
              try {
                dataChannel.send(JSON.stringify({
                  type: 'text_update',
                  text: text
                }));
                console.log(`Redundant initial text sent to peer ${peerId}`);
              } catch (err) {
                console.error(`Failed to send redundant text to peer ${peerId}:`, err);
              }
            }
          }, 500);
        } catch (err) {
          console.error(`Failed to send initial text to peer ${peerId}:`, err);
        }
      }
      
      // Announce the connection to help complete the mesh network
      sendPresenceAnnouncement(true);
    };
    
    dataChannel.onclose = () => {
      console.log(`Data channel with ${peerId} closed`);
      updateRtcConnectionStatus();
    };
    
    // Track file chunk binary data reception
    let expectedFileChunk = null;
    
    dataChannel.onmessage = (event) => {
      // If we're expecting a binary file chunk
      if (expectedFileChunk) {
        // Handle binary data (file chunk)
        console.log(`Received binary file chunk from ${peerId}, size: ${event.data.byteLength} bytes`);
        handleFileChunk(peerId, expectedFileChunk, event.data);
        expectedFileChunk = null;
        return;
      }
      
      // Handle JSON messages
      if (typeof event.data === 'string') {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'text_update') {
            console.log(`Received text update from ${peerId}, length: ${data.text.length}`);
            // Ensure we handle the text update correctly
            if (data.text && data.text.trim() !== '') {
              handleTextUpdateFromPeer(data.text);
              
              // Forward the update to all other peers (mesh network)
              forwardTextUpdateToOtherPeers(peerId, data.text);
            } else {
              console.warn(`Received empty text update from ${peerId}, ignoring`);
            }
          }
          else if (data.type === 'file_metadata') {
            handleFileMetadata(peerId, data);
          }
          else if (data.type === 'file_chunk_info') {
            // Store chunk info and prepare to receive binary data
            console.log(`Received file chunk info from ${peerId}: chunk ${data.chunkIndex} of file ${data.fileId}`);
            expectedFileChunk = data;
          }
          else {
            console.warn(`Received unknown message type from ${peerId}:`, data.type);
          }
        } catch (error) {
          console.error('Error processing message:', error);
        }
      }
    };
  }, [text, updateRtcConnectionStatus]);
  
  // Forward text updates to all peers except the original sender
  const forwardTextUpdateToOtherPeers = useCallback((fromPeerId, textToForward) => {
    // Don't forward if it's identical to what we last sent
    if (textToForward === lastSentTextRef.current) {
      console.log(`Not forwarding text update from ${fromPeerId} - matches last sent text`);
      return;
    }
    
    console.log(`Forwarding text update from ${fromPeerId} to other peers`);
    const forwardedToPeers = [];
    const failedPeers = [];
    
    for (const peerId in dataChannelsRef.current) {
      // Skip the original sender
      if (peerId === fromPeerId) continue;
      
      const dataChannel = dataChannelsRef.current[peerId];
      if (dataChannel && dataChannel.readyState === 'open') {
        try {
          dataChannel.send(JSON.stringify({
            type: 'text_update',
            text: textToForward
          }));
          forwardedToPeers.push(peerId);
        } catch (err) {
          console.error(`Failed to forward to peer ${peerId}:`, err);
          failedPeers.push(peerId);
          checkPeerConnectionStatus(peerId);
        }
      } else {
        console.warn(`Cannot forward to peer ${peerId}, data channel not open`);
        failedPeers.push(peerId);
        checkPeerConnectionStatus(peerId);
      }
    }
    
    if (forwardedToPeers.length > 0) {
      console.log(`Successfully forwarded text to ${forwardedToPeers.length} peers: ${forwardedToPeers.join(', ')}`);
      // Update our last sent text reference
      lastSentTextRef.current = textToForward;
    } else if (failedPeers.length > 0) {
      console.warn(`Failed to forward to any peers. Failed: ${failedPeers.join(', ')}`);
      // Try to reconnect with a presence announcement
      setTimeout(() => sendPresenceAnnouncement(true), 1000);
    }
  }, [checkPeerConnectionStatus]);
  
  // Send text to a specific peer
  const sendTextToPeer = useCallback((peerId, textToSend) => {
    const dataChannel = dataChannelsRef.current[peerId];
    if (dataChannel && dataChannel.readyState === 'open') {
      try {
        console.log(`Sending text update to peer ${peerId}, length: ${textToSend.length}`);
        dataChannel.send(JSON.stringify({
          type: 'text_update',
          text: textToSend
        }));
        return true;
      } catch (err) {
        console.error(`Error sending text to peer ${peerId}:`, err);
        // Check connection and potentially trigger reconnection
        checkPeerConnectionStatus(peerId);
        return false;
      }
    } else {
      console.warn(`Cannot send to peer ${peerId}, data channel not open`);
      // Check connection and potentially trigger reconnection
      checkPeerConnectionStatus(peerId);
      return false;
    }
  }, [checkPeerConnectionStatus]);
  
  // Broadcast text to all connected peers
  const broadcastTextToAllPeers = useCallback((textToSend) => {
    if (textToSend === lastSentTextRef.current) return; // Don't send if nothing changed
    
    const peerCount = Object.keys(dataChannelsRef.current).length;
    console.log(`Broadcasting text to ${peerCount} peers, length: ${textToSend.length}`);
    
    let successCount = 0;
    // Track which peers we've sent to
    const sentToPeers = [];
    const failedPeers = [];
    
    for (const peerId in dataChannelsRef.current) {
      const dataChannel = dataChannelsRef.current[peerId];
      if (dataChannel && dataChannel.readyState === 'open') {
        try {
          dataChannel.send(JSON.stringify({
            type: 'text_update',
            text: textToSend
          }));
          successCount++;
          sentToPeers.push(peerId);
        } catch (err) {
          console.error(`Failed to send to peer ${peerId}:`, err);
          failedPeers.push(peerId);
          checkPeerConnectionStatus(peerId);
        }
      } else {
        console.warn(`Cannot send to peer ${peerId}, data channel state: ${dataChannel ? dataChannel.readyState : 'undefined'}`);
        failedPeers.push(peerId);
        checkPeerConnectionStatus(peerId);
      }
    }
    
    // If we have failed sends, try to reconnect
    if (failedPeers.length > 0) {
      console.warn(`Failed to send to ${failedPeers.length} peers. Attempting to reconnect...`);
      // Try to establish connections with missing peers
      sendPresenceAnnouncement(true);
    }
    
    console.log(`Successfully sent text to ${successCount} peers: ${sentToPeers.join(', ')}`);
    lastSentTextRef.current = textToSend;
  }, [checkPeerConnectionStatus]);
  
  // Handle text update from peer
  const handleTextUpdateFromPeer = useCallback((newText) => {
    console.log(`Handling text update from peer, length: ${newText.length}`);
    
    // Validate the text
    if (!newText || typeof newText !== 'string') {
      console.warn('Received invalid text update, ignoring');
      return;
    }
    
    // Check if this is the same as our last received text to prevent loops
    if (newText === lastReceivedTextRef.current) {
      console.log('Received duplicate text update, ignoring');
      return;
    }
    
    // Update our last received text reference
    lastReceivedTextRef.current = newText;
    
    // Only update if we're not currently typing
    if (!isTypingRef.current) {
      console.log('Not currently typing, updating text immediately');
      
      // Update all text state variables to ensure consistency
      setText(newText);
      setSavedText(newText);
      setServerText(newText);
      
      // Also update lastServerText to prevent conflicts with server polling
      setLastServerText(newText);
      lastServerTextRef.current = newText;
      
      // Make sure our savedText is updated so hasChanges is false
      setHasChanges(false);
      
      // Also update our sent text reference to prevent echo
      lastSentTextRef.current = newText;
    } else {
      console.log('Currently typing, saving update for later');
      // Save for later application when we're done typing
      pendingTextUpdatesRef.current = newText;
      
      // Ensure we update server text reference to prevent conflicts
      setServerText(newText);
      setLastServerText(newText);
      lastServerTextRef.current = newText;
    }
  }, [setText, setSavedText, setServerText, setLastServerText, setHasChanges]);
  
  // Handle file metadata received from peer
  const handleFileMetadata = useCallback((peerId, data) => {
    console.log(`Received file metadata from ${peerId}:`, data);
    // Implement file receiving logic here
  }, []);
  
  // Handle file chunk received from peer
  const handleFileChunk = useCallback((peerId, chunkInfo, binaryData) => {
    console.log(`Processing file chunk from ${peerId}:`, chunkInfo);
    // Implement file chunk processing logic here
  }, []);
  
  // Function to announce our presence to other users
  const sendPresenceAnnouncement = useCallback(async (force = false) => {
    if (!id || !clientIdRef.current) return;
    
    // Only send presence announcements if peer discovery is enabled
    if (!peerDiscoveryEnabledRef.current && !force) {
      console.log('Skipping presence announcement because peer discovery is disabled');
      return;
    }
    
    // Apply rate limiting for presence announcements, but only if not forced
    if (!force && isRateLimited('presence', 2000)) { // 2000ms for more frequent announcements
      console.log('Rate limited presence announcement, skipping');
      return;
    }
    
    try {
      console.log(`Sending presence announcement to find other clients (forced: ${force})`);
      
      // Get the list of active users to announce to
      const headers = new Headers();
      headers.append('X-Client-ID', clientIdRef.current);
      headers.append('X-Session-ID', id); // Add session ID header
      
      // We're only interested in the clientList for peer discovery, not the activeUsers count
      const response = await fetch(`${API_BASE_URL}/webrtc_discover.php`, {
        headers
      });
      
      const data = await response.json();
      
      if (data.status === 'success' && data.clientList && Array.isArray(data.clientList)) {
        console.log(`Found ${data.clientList.length} potential peers in session (from server)`);
        
        // First, check our current connections
        const currentPeers = Object.keys(peerConnectionsRef.current);
        const connectedDataChannels = Object.keys(dataChannelsRef.current).filter(
          peerId => dataChannelsRef.current[peerId].readyState === 'open'
        );
        
        console.log(`Current peer connections: ${currentPeers.length}, open data channels: ${connectedDataChannels.length}`);
        
        // Send hello signal to each client except ourselves
        for (const otherClientId of data.clientList) {
          if (otherClientId !== clientIdRef.current) {
            // Check if we have an active connection with this peer
            const hasActiveConnection = connectedDataChannels.includes(otherClientId);
            
            // If forced or no active connection, establish connection
            if (force || !hasActiveConnection) {
              console.log(`${force ? 'Force' : 'No active'} connection to ${otherClientId}, announcing presence`);
              
              // If forced, clean up existing connection first
              if (force && peerConnectionsRef.current[otherClientId]) {
                console.log(`Cleaning up existing connection to ${otherClientId} for forced reconnection`);
                handlePeerDisconnect(otherClientId);
              } else {
                // Check if we already have a connection attempt in progress
                const existingConnection = peerConnectionsRef.current[otherClientId];
                if (existingConnection) {
                  const state = existingConnection.connectionState;
                  console.log(`Existing connection to ${otherClientId} in state: ${state}`);
                  
                  // If the connection is not in a good state, recreate it
                  if (state !== 'connected' && state !== 'connecting') {
                    console.log(`Cleaning up problematic connection to ${otherClientId}`);
                    handlePeerDisconnect(otherClientId);
                  }
                }
              }
              
              // Send a new hello signal to initiate connection
              sendSignal(otherClientId, { type: 'hello' });
            } else {
              console.log(`Already have active connection to ${otherClientId}`);
            }
          }
        }
        
        // Check for peers we're connected to that aren't in the active user list
        // This helps clean up stale connections
        for (const peerId of currentPeers) {
          if (!data.clientList.includes(peerId)) {
            console.log(`Peer ${peerId} is no longer active, disconnecting`);
            handlePeerDisconnect(peerId);
          }
        }
        
        // Update overall WebRTC connection status
        updateRtcConnectionStatus();
      } else {
        // If server doesn't provide client list, fall back to broadcast
        console.log('Server did not provide client list, using broadcast');
        sendSignal('all', { type: 'hello' });
      }
    } catch (error) {
      console.error('Error sending presence announcement:', error);
    }
  }, [id, sendSignal, handlePeerDisconnect, updateRtcConnectionStatus]);

  // Function to manually start peer discovery process
  const startPeerSearch = useCallback(() => {
    if (!peerDiscoveryEnabled && rtcSupported && clientIdRef.current) {
      console.log('User initiated WebRTC peer discovery');
      setPeerDiscoveryEnabled(true);
      setWebRtcConnectionStage('discovering');
      
      // Reset any existing connections for a fresh start
      Object.keys(peerConnectionsRef.current).forEach(peerId => {
        handlePeerDisconnect(peerId);
      });
      
      // Force a presence announcement to discover peers
      sendPresenceAnnouncement(true);
    }
  }, [rtcSupported, peerDiscoveryEnabled, handlePeerDisconnect, sendPresenceAnnouncement]);
  
  // Function to disconnect from peers and disable peer discovery
  const disconnectPeers = useCallback(() => {
    if (peerDiscoveryEnabled) {
      console.log('User initiated WebRTC peer disconnection');
      setPeerDiscoveryEnabled(false);
      setWebRtcConnectionStage('waiting');
      
      // Disconnect from all peers
      Object.keys(peerConnectionsRef.current).forEach(peerId => {
        handlePeerDisconnect(peerId);
      });
    }
  }, [peerDiscoveryEnabled, handlePeerDisconnect]);
  
  // Fetch debug data from the server
  const fetchDebugData = useCallback(async () => {
    if (!id || !clientIdRef.current || !debugMode) return;
    
    try {
      console.log('Fetching WebRTC debug data');
      
      const headers = new Headers();
      headers.append('X-Client-ID', clientIdRef.current);
      headers.append('X-Debug-Mode', 'true');
      
      const response = await fetch(`${API_BASE_URL}/webrtc_debug.php?id=${id}`, {
        headers
      });
      
      const data = await response.json();
      
      if (data.status === 'success') {
        setDebugData(data);
      } else {
        console.error('Error fetching debug data:', data.message || 'Unknown error');
      }
    } catch (error) {
      console.error('Error fetching debug data:', error);
    }
  }, [id, debugMode]);
  
  // Set up polling intervals for signals and presence
  useEffect(() => {
    if (!rtcSupported || !id) return;
    
    // Set up interval for debugging data only
    const debugInterval = debugMode ? setInterval(fetchDebugData, 5000) : null;
    
    // Only setup WebRTC polling when peer discovery is enabled
    if (peerDiscoveryEnabled) {
      console.log('Setting up WebRTC polling intervals (peer discovery enabled)');
      
      // Set up interval for polling signals - only when peer discovery is enabled
      const pollInterval = setInterval(pollSignals, 2000);
      
      // Set the connection stage to discovering
      setWebRtcConnectionStage('discovering');
      
      // Send initial presence announcement
      setTimeout(() => {
        sendPresenceAnnouncement(true);
      }, 1000);
      
      // Periodically check for peer discovery to ensure connections
      // This replaces the previous activeUsers polling
      const discoveryInterval = setInterval(() => {
        const peerCount = Object.keys(peerConnectionsRef.current).length;
        if (peerCount === 0 && peerDiscoveryEnabled) {
          console.log('No peer connections found, initiating discovery');
          sendPresenceAnnouncement(true);
        }
      }, 30000); // Check every 30 seconds
      
      return () => {
        clearInterval(pollInterval);
        clearInterval(discoveryInterval);
        if (debugInterval) clearInterval(debugInterval);
      };
    } else {
      // No WebRTC polling when peer discovery is disabled
      console.log('Peer discovery is disabled, no WebRTC polling');
      
      return () => {
        if (debugInterval) clearInterval(debugInterval);
      };
    }
  }, [id, rtcSupported, debugMode, peerDiscoveryEnabled, pollSignals, sendPresenceAnnouncement, fetchDebugData]);
  
  // Handle changes to debug mode
  useEffect(() => {
    if (debugMode) {
      fetchDebugData();
    }
  }, [debugMode, fetchDebugData]);
  
  // Keep the ref updated when peerDiscoveryEnabled changes
  useEffect(() => {
    peerDiscoveryEnabledRef.current = peerDiscoveryEnabled;
    console.log(`Peer discovery ${peerDiscoveryEnabled ? 'enabled' : 'disabled'}`);
  }, [peerDiscoveryEnabled]);
  
  // Apply any pending text updates when typing stops
  useEffect(() => {
    if (!isTyping && pendingTextUpdatesRef.current) {
      console.log('Applying pending text update now that typing has stopped');
      const pendingText = pendingTextUpdatesRef.current;
      pendingTextUpdatesRef.current = null;
      
      setText(pendingText);
      setSavedText(pendingText);
      setServerText(pendingText);
      setLastServerText(pendingText);
      lastServerTextRef.current = pendingText;
      setHasChanges(false);
    }
  }, [isTyping, setText, setSavedText, setServerText, setLastServerText, setHasChanges]);
  
  // Return state and methods for use in components
  return {
    rtcSupported,
    rtcConnected,
    connectionStatus,
    activeUsers,
    dataChannelStatus,
    debugMode,
    debugData,
    broadcastTextToAllPeers,
    sendPresenceAnnouncement,
    setDebugMode,
    clientId: clientIdRef.current,
    // New properties
    webRtcConnectionStage,
    startPeerSearch,
    disconnectPeers,
    peerDiscoveryEnabled,
    setPeerDiscoveryEnabled
  };
};

export default useWebRTCManager;
