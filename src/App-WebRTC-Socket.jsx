// App-WebRTC-Socket.jsx
// Modified version of App.jsx that uses the WebSocket server for WebRTC signaling
// UPDATED VERSION - with "Connect to Peers" button integration

import { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import './App.css';
import AppHeader from './components/AppHeader.jsx';
import ControlsBar from './components/ControlsBar.jsx';
import ShareModal from './components/ShareModal.jsx';
import TextAreaContainer from './components/TextAreaContainer.jsx';
import Footer from './components/Footer.jsx';
import { useTheme } from './theme/ThemeContext.jsx';
import { canCallEndpoint } from './utils/RateLimiter.js';
import { enableWebRTCDebug } from './utils/WebRTCDebug.js';
import { useWebRTCManager } from './utils/WebRTCSocketManager.js';
import { initSocketBasedWebRTC } from './utils/WebRTCSocketIntegration.js';

// Constants
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const LOGO_URL = import.meta.env.VITE_LOGO_URL || '/clippy.png';
const MAX_TEXT_LENGTH = 20000; // Limit text to 20,000 characters (approx. 20KB)
const MAX_STORAGE_SIZE = 4 * 1024 * 1024; // 4MB limit for localStorage

// TextShareApp Component
function TextShareApp() {
  // Helper function to encode text to base64
  const encodeTextToBase64 = (text) => {
    try {
      return btoa(encodeURIComponent(text));
    } catch (e) {
      console.error('Error encoding text to base64:', e);
      return '';
    }
  };
  
  // Helper function to decode base64 text
  const decodeTextFromBase64 = (encoded) => {
    try {
      return decodeURIComponent(atob(encoded));
    } catch (e) {
      console.error('Error decoding base64 text:', e);
      return '';
    }
  };

  const { id, seedData } = useParams();
  
  // Decode the seed text if it exists from path parameter
  const seedText = seedData ? decodeTextFromBase64(seedData) : '';
  
  // State variables
  const [text, setText] = useState('');
  const [savedText, setSavedText] = useState('');
  const [serverText, setServerText] = useState('');
  const [lastServerText, setLastServerText] = useState('');
  const [status, setStatus] = useState('idle');
  const [lastSaved, setLastSaved] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [updatesAvailable, setUpdatesAvailable] = useState(false);
  const [lastChecked, setLastChecked] = useState(new Date());
  const [contentChecked, setContentChecked] = useState(true);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [showDraft, setShowDraft] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(() => {
    try {
      const saved = localStorage.getItem('clippy-auto-update');
      return saved === 'true';
    } catch {
      return false;
    }
  });
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  
  // Reference for whether the user is currently typing
  const isTypingRef = useRef(false);
  const lastSaveTimeRef = useRef(0);
  const pollingTimeoutRef = useRef(null);
  const isPollingPausedRef = useRef(false);
  
  // Use the WebRTCSocketManager hook
  const {
    rtcSupported,
    rtcConnected: isRtcConnected,
    connectionStatus,
    activeUsers,
    webRtcConnectionStage,
    broadcastTextToAllPeers,
    peerDiscoveryEnabled,
    startPeerSearch,
    disconnectPeers,
    clientId
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
  
  // Store client ID in ref
  const clientIdRef = useRef(clientId);
  
  // Function to initiate peer connections - will be called by the "Connect to Peers" button
  const initiatePeerConnections = () => {
    console.log("Initiating peer connections using socket server");
    if (!id || !clientIdRef.current) {
      console.error("Cannot initiate connections: missing session ID or client ID");
      return;
    }
    
    // Use the startPeerSearch function from useWebRTCManager
    if (typeof startPeerSearch === 'function') {
      startPeerSearch();
      setToastMessage('Connecting to peers...');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } else {
      console.error("startPeerSearch function not available");
    }
  };
  
  // Make the initiatePeerConnections function available globally for the button
  useEffect(() => {
    window.initiatePeerConnections = initiatePeerConnections;
    return () => {
      delete window.initiatePeerConnections;
    };
  }, [id, clientIdRef.current]);
  
  // Your existing functions for handling text changes, saving, etc.
  // ...
  
  const handleTextChange = (e) => {
    const newText = e.target.value;
    
    // Set typing flag
    isTypingRef.current = true;
    
    // Clear typing flag after delay
    clearTimeout(window.typingTimeout);
    window.typingTimeout = setTimeout(() => {
      isTypingRef.current = false;
    }, 500);
    
    // Check if text exceeds maximum length
    if (newText.length > MAX_TEXT_LENGTH) {
      setShowToast(true);
      setToastMessage(`Text too long - maximum ${MAX_TEXT_LENGTH.toLocaleString()} characters allowed`);
      setTimeout(() => setShowToast(false), 3000);
      return;
    }
    
    if (showDraft) {
      // We're editing the draft
      setDraftText(newText);
      try {
        localStorage.setItem(`clippy-draft-${id}`, newText);
      } catch (error) {
        console.error('Error auto-saving draft to localStorage:', error);
      }
    } else {
      // We're editing the main text
      setText(newText);
      setHasChanges(newText !== savedText);
      setStatus('unsaved');
      
      // Broadcast to all connected peers if WebRTC is connected
      if (isRtcConnected) {
        console.log(`Broadcasting text change to peers, length: ${newText.length}`);
        broadcastTextToAllPeers(newText);
      }
    }
  };
  
  // Additional functions needed for your application
  // ...
  
  return (
    <div className="text-share-container">
      {showToast && (
        <div className="toast-notification">
          {toastMessage}
        </div>
      )}
      <AppHeader 
        LOGO_URL={LOGO_URL}
        autoUpdate={autoUpdate}
        setAutoUpdate={setAutoUpdate}
        updatesAvailable={updatesAvailable}
        applyUpdates={() => {/* Your applyUpdates function */}}
        lastChecked={lastChecked}
        text={text}
        serverText={serverText}
        isRtcConnected={isRtcConnected}
      />
      <TextAreaContainer
        showDraft={showDraft}
        setShowDraft={setShowDraft}
        hasDraft={hasDraft}
        deleteDraft={() => {/* Your deleteDraft function */}}
        setText={setText}
        draftText={draftText}
        setHasChanges={setHasChanges}
        savedText={savedText}
        setStatus={setStatus}
        saveDraft={() => {/* Your saveDraft function */}}
        text={text}
        handleTextChange={handleTextChange}
        MAX_TEXT_LENGTH={MAX_TEXT_LENGTH}
      />
      
      <ControlsBar
        hasChanges={hasChanges}
        saveText={() => {/* Your saveText function */}}
        manualCheckForUpdates={() => {/* Your manualCheckForUpdates function */}}
        setShowShareModal={setShowShareModal}
        status={status}
        lastSaved={lastSaved}
        rtcSupported={rtcSupported}
        isRtcConnected={isRtcConnected}
        isPollingPaused={isPollingPausedRef.current}
        lastChecked={lastChecked}
        updatesAvailable={updatesAvailable}
        webRtcConnectionStage={webRtcConnectionStage}
        startPeerSearch={startPeerSearch}
        disconnectPeers={disconnectPeers}
        peerDiscoveryEnabled={peerDiscoveryEnabled}
        activeUsers={activeUsers}
      />
      
      <ShareModal
        showShareModal={showShareModal}
        setShowShareModal={setShowShareModal}
        getShareUrl={() => {/* Your getShareUrl function */}}
        shareViaEmail={() => {/* Your shareViaEmail function */}}
        newSessionId={""}
        createNewSession={() => {/* Your createNewSession function */}}
        creatingNewSession={false}
        text={text}
        shareNewSessionViaEmail={() => {/* Your shareNewSessionViaEmail function */}}
        window={window}
      />
      
      <Footer />
    </div>
  );
}

export default TextShareApp;
