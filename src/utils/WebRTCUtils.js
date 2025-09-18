// WebRTCUtils.js - Helper functions for WebRTC connections
// This file contains extracted functions from App.jsx for better organization

/**
 * Creates a new WebRTC peer connection
 * 
 * @param {string} peerId - The ID of the peer to connect to
 * @param {boolean} isInitiator - Whether this client is initiating the connection
 * @param {Object} peerConnectionsRef - Reference to peer connections
 * @param {Object} dataChannelsRef - Reference to data channels
 * @param {Function} setPeerConnections - State setter for peer connections
 * @param {Function} setConnectionStatus - State setter for connection status
 * @param {Function} setConnectedPeers - State setter for connected peers
 * @param {Function} handlePeerDisconnect - Function to handle peer disconnection
 * @param {Function} setupDataChannel - Function to set up data channel
 * @param {Function} updateRtcConnectionStatus - Function to update overall connection status
 * @param {Function} sendSignal - Function to send WebRTC signals
 * @returns {RTCPeerConnection} The created peer connection
 */
export const createPeerConnection = (
  peerId, 
  isInitiator, 
  peerConnectionsRef,
  dataChannelsRef,
  setPeerConnections,
  setConnectionStatus,
  setConnectedPeers,
  handlePeerDisconnect,
  setupDataChannel,
  updateRtcConnectionStatus,
  sendSignal,
  text
) => {
  console.log(`Creating peer connection with ${peerId}, initiator: ${isInitiator}`);
  
  // If we already have a connection for this peer, check its state
  if (peerConnectionsRef.current[peerId]) {
    const existingConnection = peerConnectionsRef.current[peerId];
    const connectionState = existingConnection.connectionState;
    
    console.log(`Already have connection for ${peerId}, state: ${connectionState}`);
    
    // If the connection is in a good state, return it
    if (connectionState === 'connected' || connectionState === 'connecting') {
      return existingConnection;
    }
    
    // Otherwise, close the existing connection
    console.log(`Existing connection to ${peerId} is in state ${connectionState}, recreating`);
    handlePeerDisconnect(
      peerId, 
      dataChannelsRef, 
      peerConnectionsRef, 
      setConnectedPeers, 
      setConnectionStatus, 
      setPeerConnections, 
      updateRtcConnectionStatus
    );
  }
  
  // Configure ICE servers (STUN/TURN)
  const configuration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };
  
  // Create a new peer connection
  const pc = new RTCPeerConnection(configuration);
  
  // Store the peer connection
  peerConnectionsRef.current[peerId] = pc;
  setPeerConnections(prev => ({...prev, [peerId]: pc}));
  
  // Update connection status
  setConnectionStatus(prev => ({
    ...prev, 
    [peerId]: {
      state: 'connecting',
      lastUpdated: Date.now()
    }
  }));
  
  // Create a data channel if initiator
  if (isInitiator) {
    console.log(`Creating data channel as initiator for ${peerId}`);
    const dataChannel = pc.createDataChannel('text');
    setupDataChannel(dataChannel, peerId);
  } else {
    // Otherwise listen for data channel
    console.log(`Listening for data channel from ${peerId}`);
    pc.ondatachannel = (event) => {
      console.log(`Received data channel from ${peerId}`);
      setupDataChannel(event.channel, peerId);
    };
  }
  
  // Handle ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log(`Sending ICE candidate to ${peerId}`);
      sendSignal(peerId, event.candidate);
    }
  };
  
  // Handle ICE connection state changes
  pc.oniceconnectionstatechange = () => {
    console.log(`ICE connection state with ${peerId} changed to: ${pc.iceConnectionState}`);
    
    // If ICE connection fails, try to reconnect
    if (pc.iceConnectionState === 'failed') {
      console.log(`ICE connection with ${peerId} failed, attempting to restart ICE`);
      pc.restartIce();
    } else if (pc.iceConnectionState === 'disconnected') {
      console.log(`ICE connection with ${peerId} disconnected, waiting for reconnection`);
      
      // Add a timer to check if we're still disconnected after a few seconds
      setTimeout(() => {
        if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
          console.log(`ICE connection with ${peerId} still ${pc.iceConnectionState} after timeout, restarting`);
          pc.restartIce();
        }
      }, 5000);
    }
  };
  
  // Handle connection state changes
  pc.onconnectionstatechange = () => {
    console.log(`Connection state with ${peerId} changed to: ${pc.connectionState}`);
    
    // Update connection status
    setConnectionStatus(prev => ({
      ...prev, 
      [peerId]: {
        state: pc.connectionState,
        lastUpdated: Date.now()
      }
    }));
    
    if (pc.connectionState === 'connected') {
      console.log(`Successfully connected to peer ${peerId}!`);
      // Add peer to connected peers
      setConnectedPeers(prev => {
        if (!prev.includes(peerId)) {
          return [...prev, peerId];
        }
        return prev;
      });
      
      // Update overall connection status
      updateRtcConnectionStatus(
        dataChannelsRef,
        null, // activeUsers is not needed here
        null, // setIsRtcConnected is not needed here
        null  // sendPresenceAnnouncement is not needed here
      );
    } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      console.log(`Connection with ${peerId} ended: ${pc.connectionState}`);
      handlePeerDisconnect(
        peerId, 
        dataChannelsRef, 
        peerConnectionsRef, 
        setConnectedPeers, 
        setConnectionStatus, 
        setPeerConnections, 
        updateRtcConnectionStatus
      );
    }
  };
  
  // Create and send an offer if initiator
  if (isInitiator) {
    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .then(() => sendSignal(peerId, pc.localDescription))
      .catch(error => console.error('Error creating offer:', error));
  }
  
  return pc;
};

/**
 * Handle disconnection of a peer connection
 * 
 * @param {string} peerId - The ID of the peer to disconnect
 * @param {Object} dataChannelsRef - Reference to data channels
 * @param {Object} peerConnectionsRef - Reference to peer connections
 * @param {Function} setConnectedPeers - State setter for connected peers
 * @param {Function} setConnectionStatus - State setter for connection status
 * @param {Function} setPeerConnections - State setter for peer connections
 * @param {Function} updateRtcConnectionStatus - Function to update overall WebRTC status
 */
export const handlePeerDisconnect = (
  peerId,
  dataChannelsRef,
  peerConnectionsRef,
  setConnectedPeers,
  setConnectionStatus,
  setPeerConnections,
  updateRtcConnectionStatus
) => {
  console.log(`Handling disconnect for peer ${peerId}`);
  // Remove peer from connected peers
  setConnectedPeers(prev => prev.filter(id => id !== peerId));
  
  // Update connection status
  setConnectionStatus(prev => {
    const newStatus = {...prev};
    if (newStatus[peerId]) {
      newStatus[peerId] = {
        ...newStatus[peerId],
        state: 'disconnected',
        lastUpdated: Date.now()
      };
    }
    return newStatus;
  });
  
  // Close and remove data channel
  if (dataChannelsRef.current[peerId]) {
    dataChannelsRef.current[peerId].close();
    delete dataChannelsRef.current[peerId];
  }
  
  // Close and remove peer connection
  if (peerConnectionsRef.current[peerId]) {
    peerConnectionsRef.current[peerId].close();
    delete peerConnectionsRef.current[peerId];
    
    // Update state
    setPeerConnections(prev => {
      const newPeers = {...prev};
      delete newPeers[peerId];
      return newPeers;
    });
  }
  
  // Update RTC connected state
  updateRtcConnectionStatus();
};

/**
 * Update the overall WebRTC connection status
 * 
 * @param {Object} dataChannelsRef - Reference to data channels
 * @param {number} activeUsers - Count of active users in the session
 * @param {Function} setIsRtcConnected - State setter for RTC connected status
 * @param {Function} sendPresenceAnnouncement - Function to announce presence
 */
export const updateRtcConnectionStatus = (
  dataChannelsRef,
  activeUsers,
  setIsRtcConnected,
  sendPresenceAnnouncement
) => {
  // Count connected peers with open data channels
  let connectedCount = 0;
  
  for (const peerId in dataChannelsRef.current) {
    if (dataChannelsRef.current[peerId].readyState === 'open') {
      connectedCount++;
    }
  }
  
  // Update connection status
  const isConnected = connectedCount > 0;
  console.log(`WebRTC connection status: ${isConnected ? 'connected' : 'disconnected'} with ${connectedCount} peers`);
  setIsRtcConnected(isConnected);
  
  // If expected peers don't match active users, try to connect to missing peers
  if (activeUsers > 1 && connectedCount < activeUsers - 1) {
    console.log(`Missing connections: have ${connectedCount}, need ${activeUsers - 1}`);
    sendPresenceAnnouncement();
  }
};

/**
 * Send text to a specific peer
 * 
 * @param {string} peerId - The ID of the peer to send to
 * @param {string} textToSend - The text to send
 * @param {Object} dataChannelsRef - Reference to data channels
 */
export const sendTextToPeer = (
  peerId,
  textToSend,
  dataChannelsRef
) => {
  const dataChannel = dataChannelsRef.current[peerId];
  if (dataChannel && dataChannel.readyState === 'open') {
    console.log(`Sending text update to peer ${peerId}, length: ${textToSend.length}`);
    dataChannel.send(JSON.stringify({
      type: 'text_update',
      text: textToSend
    }));
  } else {
    console.warn(`Cannot send to peer ${peerId}, data channel not open`);
  }
};

/**
 * Broadcast text to all connected peers
 * 
 * @param {string} textToSend - The text to broadcast
 * @param {Object} lastSentTextRef - Reference to the last sent text
 * @param {Object} dataChannelsRef - Reference to data channels
 * @param {Object} peerConnectionsRef - Reference to peer connections
 * @param {number} activeUsers - Count of active users in the session
 * @param {Function} sendPresenceAnnouncement - Function to announce presence
 * @param {Function} updateRtcConnectionStatus - Function to update overall WebRTC status
 * @param {Function} handlePeerDisconnect - Function to handle peer disconnection
 * @param {Function} setConnectedPeers - State setter for connected peers
 * @param {Function} setConnectionStatus - State setter for connection status
 * @param {Function} setPeerConnections - State setter for peer connections
 */
export const broadcastTextToAllPeers = (
  textToSend,
  lastSentTextRef,
  dataChannelsRef,
  peerConnectionsRef,
  activeUsers,
  sendPresenceAnnouncement,
  updateRtcConnectionStatusFn,
  handlePeerDisconnectFn,
  setConnectedPeers,
  setConnectionStatus,
  setPeerConnections
) => {
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
      }
    } else {
      console.warn(`Cannot send to peer ${peerId}, data channel state: ${dataChannel ? dataChannel.readyState : 'undefined'}`);
      failedPeers.push(peerId);
    }
  }
  
  // If we failed to send to any peers, update our connection status
  if (failedPeers.length > 0) {
    console.warn(`Failed to send to ${failedPeers.length} peers: ${failedPeers.join(', ')}`);
    
    // Check connection state and potentially reconnect
    for (const failedPeerId of failedPeers) {
      const connectionState = peerConnectionsRef.current[failedPeerId]?.connectionState;
      console.log(`Connection state with ${failedPeerId}: ${connectionState || 'no connection'}`);
      
      // If connection is failed/disconnected or the data channel is closed, try to reconnect
      if (!connectionState || 
          connectionState === 'disconnected' || 
          connectionState === 'failed' || 
          connectionState === 'closed') {
        // Handle disconnect to clean up
        handlePeerDisconnectFn(
          failedPeerId,
          dataChannelsRef,
          peerConnectionsRef,
          setConnectedPeers,
          setConnectionStatus,
          setPeerConnections,
          () => updateRtcConnectionStatusFn(
            dataChannelsRef,
            activeUsers,
            setIsRtcConnected,
            sendPresenceAnnouncement
          )
        );
      }
    }
    
    // Check overall connection status
    updateRtcConnectionStatusFn(
      dataChannelsRef,
      activeUsers,
      setIsRtcConnected,
      sendPresenceAnnouncement
    );
  }
  
  // If we have fewer successful sends than expected active peers, announce presence
  if (activeUsers > 2 && successCount < activeUsers - 1) {
    console.warn(`Only sent to ${successCount} peers but ${activeUsers} users are active. Reconnecting...`);
    // Try to establish connections with missing peers
    sendPresenceAnnouncement();
  }
  
  console.log(`Successfully sent text to ${successCount} peers: ${sentToPeers.join(', ')}`);
  lastSentTextRef.current = textToSend;
};

/**
 * Handle text update received from a peer
 * 
 * @param {string} newText - The text received from peer
 * @param {Object} lastReceivedTextRef - Reference to last received text
 * @param {Object} isTypingRef - Reference to typing state
 * @param {Object} pendingTextUpdatesRef - Reference to pending text updates
 * @param {Function} setText - State setter for text
 * @param {Function} setSavedText - State setter for saved text
 * @param {Function} setHasChanges - State setter for changes flag
 */
export const handleTextUpdateFromPeer = (
  newText,
  lastReceivedTextRef,
  isTypingRef,
  pendingTextUpdatesRef,
  setText,
  setSavedText,
  setHasChanges
) => {
  console.log(`Handling text update from peer, length: ${newText.length}`);
  
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
    
    // Make sure our savedText is updated so hasChanges is false
    setHasChanges(false);
  } else {
    console.log('Currently typing, saving update for later');
    // Save for later application when we're done typing
    pendingTextUpdatesRef.current = newText;
  }
};

/**
 * Forward text updates to all peers except the original sender
 * 
 * @param {string} fromPeerId - The ID of the peer who sent the original update
 * @param {string} textToForward - The text to forward
 * @param {Object} lastSentTextRef - Reference to last sent text
 * @param {Object} dataChannelsRef - Reference to data channels
 */
export const forwardTextUpdateToOtherPeers = (
  fromPeerId,
  textToForward,
  lastSentTextRef,
  dataChannelsRef
) => {
  // Don't forward if it's identical to what we last sent
  if (textToForward === lastSentTextRef.current) return;
  
  console.log(`Forwarding text update from ${fromPeerId} to other peers`);
  const forwardedToPeers = [];
  
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
      }
    }
  }
};

/**
 * Sets up a WebRTC data channel for a peer
 * 
 * @param {RTCDataChannel} dataChannel - The data channel to set up
 * @param {string} peerId - The ID of the peer
 * @param {Object} dataChannelsRef - Reference to data channels
 * @param {Function} updateRtcConnectionStatus - Function to update RTC connection status
 * @param {string} text - Current text to send on connection
 * @param {Function} sendTextToPeer - Function to send text to a peer
 * @param {Function} sendPresenceAnnouncement - Function to announce presence
 * @param {Function} handleTextUpdateFromPeer - Function to handle text updates from peers
 * @param {Function} forwardTextUpdateToOtherPeers - Function to forward text updates to other peers
 */
export const setupDataChannel = (
  dataChannel, 
  peerId, 
  dataChannelsRef,
  updateRtcConnectionStatus,
  text,
  sendTextToPeer,
  sendPresenceAnnouncement,
  handleTextUpdateFromPeer,
  forwardTextUpdateToOtherPeers
) => {
  console.log(`Setting up data channel for peer ${peerId}`);
  dataChannelsRef.current[peerId] = dataChannel;
  
  dataChannel.onopen = () => {
    console.log(`Data channel with ${peerId} opened`);
    
    // Update the overall connection status when a data channel opens
    updateRtcConnectionStatus();
    
    // When connected, send current text to peer
    if (text) {
      console.log(`Sending initial text to peer ${peerId}`);
      sendTextToPeer(peerId, text);
    }
    
    // Announce the connection to help complete the mesh network
    sendPresenceAnnouncement();
  };
  
  dataChannel.onclose = () => {
    console.log(`Data channel with ${peerId} closed`);
    updateRtcConnectionStatus();
  };
  
  dataChannel.onmessage = (event) => {
    console.log(`Received message from ${peerId}:`, event.data.substring(0, 50) + '...');
    try {
      const data = JSON.parse(event.data);
      
      if (data.type === 'text_update') {
        console.log(`Received text update from ${peerId}, length: ${data.text.length}`);
        handleTextUpdateFromPeer(data.text);
        
        // Forward the update to all other peers (mesh network)
        forwardTextUpdateToOtherPeers(peerId, data.text);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  };
};
