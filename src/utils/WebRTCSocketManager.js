// WebRTCSocketManager.js - Modified to use WebSocket server instead of PHP endpoints
import { useState, useRef, useEffect, useCallback } from 'react';
import socketAdapter from './WebRTCSocketAdapter';

// Constants for WebRTC configuration
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

// Socket server URL - can be overridden with environment variable
const SOCKET_SERVER_URL = 
  import.meta.env.VITE_SOCKET_SERVER_URL || 'http://localhost:3000';

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
  
  // Function to announce presence to all active users in the session
  const sendPresenceAnnouncement = useCallback((force = false) => {
    if (!id || !clientIdRef.current) {
      console.warn('Cannot send presence announcement: missing ID or client ID');
      return;
    }
    
    // Only send presence announcements if peer discovery is enabled
    if (!peerDiscoveryEnabledRef.current && !force) {
      console.log('Skipping presence announcement because peer discovery is disabled');
      return;
    }
    
    console.log('Sending presence announcement');
    const success = socketAdapter.sendPresenceAnnouncement();
    if (!success) {
      console.error('Failed to send presence announcement');
    }
  }, [id]);
  
  // Initialize client ID and socket connection on component mount
  useEffect(() => {
    if (!clientIdRef.current) {
      clientIdRef.current = Math.random().toString(36).substring(2, 10);
      console.log(`Generated WebRTCManager client ID: ${clientIdRef.current}`);
    }
    
    // Check if WebRTC is supported
    if (window.RTCPeerConnection) {
      setRtcSupported(true);
      console.log('WebRTC is supported');
      
      // Initialize socket adapter
      socketAdapter.init(SOCKET_SERVER_URL);
      
      // Set up signal handler
      socketAdapter.onSignal((data) => {
        processSignal(data);
      });
      
      // Set up session update handler
      socketAdapter.onSessionUpdate((data) => {
        console.log(`Session update from socket server: ${data.activeUsers} users`);
        setActiveUsers(data.activeUsers);
      });
      
      // Set up client list handler
      socketAdapter.onClientList((clients) => {
        if (!id || !clientIdRef.current) return;
        
        console.log(`Received client list from socket server for session ${id}: ${clients.join(', ')}`);
        console.log(`Current client ID: ${clientIdRef.current}, is in list: ${clients.includes(clientIdRef.current)}`);
        
        // Check for new clients to connect to
        clients.forEach(otherClientId => {
          if (otherClientId !== clientIdRef.current) {
            // Check if we already have a connection
            const hasConnection = peerConnectionsRef.current[otherClientId];
            
            if (!hasConnection) {
              console.log(`New client detected: ${otherClientId}, sending hello`);
              sendSignal(otherClientId, { type: 'hello' });
            }
          }
        });
        
        // Check for clients that have left
        Object.keys(peerConnectionsRef.current).forEach(peerId => {
          if (!clients.includes(peerId)) {
            console.log(`Client ${peerId} has left, disconnecting`);
            handlePeerDisconnect(peerId);
          }
        });
        
        // Update connection status
        updateRtcConnectionStatus();
      });
    } else {
      console.warn('WebRTC is not supported in this browser');
    }
    
    return () => {
      // Clean up all connections when unmounting
      Object.keys(peerConnectionsRef.current).forEach(peerId => {
        handlePeerDisconnect(peerId);
      });
      
      // Disconnect socket
      socketAdapter.disconnect();
    };
  }, []);
  
  // Join session when ID changes
  useEffect(() => {
    if (id && clientIdRef.current && rtcSupported) {
      console.log(`Joining session ${id} (WebRTC passive mode)`);
      const joinResult = socketAdapter.joinSession(id, clientIdRef.current);
      if (!joinResult) {
        console.warn('Failed to join session');
      }
    }
    
    return () => {
      if (id && clientIdRef.current) {
        socketAdapter.leaveSession();
      }
    };
  }, [id, rtcSupported]);
  
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
  const updateActiveUserCount = useCallback(() => {
    // Count number of connected peers plus this client
    const connectedPeers = Object.keys(dataChannelsRef.current).filter(
      peerId => dataChannelsRef.current[peerId] && dataChannelsRef.current[peerId].readyState === 'open'
    ).length;
    
    // Add 1 for the current user
    const totalUsers = connectedPeers + 1;
    
    // Update active users count if different
    if (totalUsers !== activeUsers) {
      console.log(`Updating active users count from ${activeUsers} to ${totalUsers} (based on WebRTC connections)`);
      setActiveUsers(totalUsers);
    }
    
    // If no WebRTC connections and peer discovery is disabled, we might need to rely on socket server count
    // This will be updated the next time the socket server sends a session update
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
    
    // Always update the active user count when connection status changes
    updateActiveUserCount();
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
  
  // Send WebRTC signal to another client using the socket adapter
  const sendSignal = useCallback(async (targetClientId, signal) => {
    if (!id || !clientIdRef.current) return;
    
    // Only send signals if peer discovery is enabled
    if (!peerDiscoveryEnabledRef.current) {
      console.log('Skipping signal send because peer discovery is disabled');
      return;
    }
    
    console.log(`Sending signal to ${targetClientId}:`, signal.type || 'ICE candidate');
    socketAdapter.sendSignal(targetClientId, signal);
  }, [id]);
  
  // Process a WebRTC signal received from the socket server
  const processSignal = useCallback((signalData) => {
    const { from: peerId, signal } = signalData;
    
    // Don't process signals from self
    if (peerId === clientIdRef.current) return;
    
    console.log(`Processing signal from ${peerId}:`, signal.type || 'ICE candidate');
    
    // Handle different signal types
    if (signal.type === 'hello') {
      // If we receive a hello signal, create an offer if we don't have a connection
      if (!peerConnectionsRef.current[peerId] || 
          (peerConnectionsRef.current[peerId].connectionState !== 'connected' && 
          peerConnectionsRef.current[peerId].connectionState !== 'connecting')) {
        console.log(`Creating peer connection to ${peerId} (as initiator)`);
        createPeerConnection(peerId, true);
      } else {
        console.log(`Already have connection to ${peerId}, ignoring hello`);
      }
    }
    else if (signal.type === 'offer') {
      handleOffer(peerId, signal);
    }
    else if (signal.type === 'answer') {
      handleAnswer(peerId, signal);
    }
    else if (signal.candidate) {
      handleIceCandidate(peerId, signal);
    }
    else if (signal.type === 'bye') {
      handlePeerDisconnect(peerId);
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
    
    // Update connection status with a small delay to ensure cleanup is complete
    setTimeout(() => {
      updateRtcConnectionStatus();
    }, 50);
  }, [updateRtcConnectionStatus]);
  
  // Handle text updates received from peers
  const handleTextUpdate = useCallback((newText) => {
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
      setText(newText);
      setSavedText(newText);
      setServerText(newText);
      setLastServerText(newText);
      lastServerTextRef.current = newText;
      setHasChanges(false);
    } else {
      console.log('Currently typing, saving update for later');
      // Save for later application when we're done typing
      pendingTextUpdatesRef.current = newText;
    }
  }, [setText, setSavedText, setServerText, setLastServerText, setHasChanges]);
  
  // Set up data channel for a peer
  const setupDataChannel = useCallback((dataChannel, peerId) => {
    console.log(`Setting up data channel for peer ${peerId}`);
    dataChannelsRef.current[peerId] = dataChannel;
    
    dataChannel.onopen = () => {
      console.log(`Data channel with ${peerId} opened`);
      
      // Update the overall connection status when a data channel opens
      updateRtcConnectionStatus();
      
      // Explicitly update active user count when a new channel opens
      updateActiveUserCount();
      
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
                console.error(`Error sending redundant initial text: ${err.message}`);
              }
            }
          }, 500);
        } catch (err) {
          console.error(`Error sending initial text: ${err.message}`);
        }
      }
    };
    
    dataChannel.onclose = () => {
      console.log(`Data channel with ${peerId} closed`);
      updateRtcConnectionStatus();
      updateActiveUserCount(); // Update user count when a channel closes
    };
    
    dataChannel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'text_update') {
          console.log(`Received text update from ${peerId}, length: ${data.text.length}`);
          handleTextUpdate(data.text);
        }
      } catch (error) {
        console.error('Error processing message:', error);
      }
    };
  }, [text, updateRtcConnectionStatus, updateActiveUserCount]);
  
  // Function to broadcast text to all connected peers
  const broadcastTextToAllPeers = useCallback((textToSend) => {
    if (!textToSend || textToSend === lastSentTextRef.current) {
      return; // Don't send if nothing changed
    }
    
    const connectedPeers = Object.keys(dataChannelsRef.current).filter(
      peerId => dataChannelsRef.current[peerId].readyState === 'open'
    );
    
    console.log(`Broadcasting text to ${connectedPeers.length} peers, length: ${textToSend.length}`);
    
    connectedPeers.forEach(peerId => {
      try {
        dataChannelsRef.current[peerId].send(JSON.stringify({
          type: 'text_update',
          text: textToSend
        }));
      } catch (error) {
        console.error(`Error sending text to peer ${peerId}:`, error);
      }
    });
    
    lastSentTextRef.current = textToSend;
  }, []);
  
  // Function to manually start peer discovery process
  const startPeerSearch = useCallback(() => {
    if (!peerDiscoveryEnabled && rtcSupported && clientIdRef.current) {
      console.log('User initiated WebRTC peer discovery');
      
      // Ensure session is joined before starting peer discovery
      if (!socketAdapter.sessionId && id) {
        console.log('Session not joined, joining now...');
        const joinResult = socketAdapter.joinSession(id, clientIdRef.current);
        if (!joinResult) {
          console.error('Failed to join session for peer discovery');
          return;
        }
      }
      
      setPeerDiscoveryEnabled(true);
      setWebRtcConnectionStage('discovering');
      
      // Reset any existing connections for a fresh start
      Object.keys(peerConnectionsRef.current).forEach(peerId => {
        handlePeerDisconnect(peerId);
      });
      
      // Force a presence announcement to discover peers
      sendPresenceAnnouncement(true);
    }
  }, [rtcSupported, peerDiscoveryEnabled, handlePeerDisconnect, sendPresenceAnnouncement, id]);
  
  // Function to disconnect from peers and disable peer discovery
  const disconnectPeers = useCallback(() => {
    if (peerDiscoveryEnabled) {
      console.log('User initiated WebRTC peer disconnection');
      setPeerDiscoveryEnabled(false);
      setWebRtcConnectionStage('waiting');
      
      // Disconnect from all peers
      Object.keys(peerConnectionsRef.current).forEach(peerId => {
        sendSignal(peerId, { type: 'bye' });
        handlePeerDisconnect(peerId);
      });
      
      // Reset active users count to socket server count when disconnecting from WebRTC
      // This will be updated by the next session update from the socket server
      setActiveUsers(1); // Reset to 1 (just this client) until socket server updates
      
      // Send a presence announcement to trigger session update from socket server
      // This helps other clients get updated user counts
      setTimeout(() => {
        if (socketAdapter.isConnected) {
          socketAdapter.sendPresenceAnnouncement();
        }
      }, 100);
    }
  }, [peerDiscoveryEnabled, handlePeerDisconnect, sendSignal]);
  
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
  
  // Function to manually initiate peer connections
  const initiatePeerConnections = () => {
    console.log('Manually initiating peer connections');
    
    // Set the connection stage to discovering
    setWebRtcConnectionStage('discovering');
    
    // Enable peer discovery
    setPeerDiscoveryEnabled(true);
    peerDiscoveryEnabledRef.current = true;
    
    // Ensure the socket is initialized
    if (!socketAdapter.isConnected) {
      console.log('Socket not connected, initializing...');
      socketAdapter.init(SOCKET_SERVER_URL);
    }
    
    // Wait a short time to ensure socket connection is established
    setTimeout(() => {
      // Join the session if not already joined
      if (id && clientIdRef.current) {
        console.log(`Joining session ${id} as ${clientIdRef.current}`);
        const joined = socketAdapter.joinSession(id, clientIdRef.current);
        console.log(`Join session result: ${joined ? 'success' : 'failed'}`);
      } else {
        console.error('Cannot join session: missing id or clientId', { id, clientId: clientIdRef.current });
      }
      
      // Announce presence to get the client list
      console.log('Sending presence announcement');
      socketAdapter.sendPresenceAnnouncement();
      
      // Set a timer to retry presence announcement in case the first one doesn't work
      setTimeout(() => {
        console.log('Sending follow-up presence announcement');
        socketAdapter.sendPresenceAnnouncement();
      }, 2000);
    }, 500);
  };
  
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
    // Additional properties
    webRtcConnectionStage,
    startPeerSearch,
    disconnectPeers,
    peerDiscoveryEnabled,
    setPeerDiscoveryEnabled,
    // Add the initiate connections function
    initiatePeerConnections,
    // Add method to send text to all peers
    sendTextToAllPeers: broadcastTextToAllPeers,
    // Add isPollingPaused for the App component
    isPollingPaused: false
  };
};
