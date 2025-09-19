import { useState, useEffect, useRef } from 'react';
import { createHashRouter, RouterProvider, Link, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSave, 
  faSync, 
  faShare, 
  faEye, 
  faEyeSlash, 
  faCopy, 
  faPlay, 
  faHome,
  faEnvelope,
  faUsers
} from '@fortawesome/free-solid-svg-icons';
import './App.css';
import ThemeToggle from './components/ThemeToggle.jsx';
import AppHeader from './components/AppHeader.jsx';
import ControlsBar from './components/ControlsBar.jsx';
import ShareModal from './components/ShareModal.jsx';
import TextAreaContainer from './components/TextAreaContainer.jsx';
import { useTheme } from './theme/ThemeContext.jsx';
import Footer from './components/Footer.jsx';
import {
  handlePeerDisconnect,
  updateRtcConnectionStatus,
  sendTextToPeer,
  broadcastTextToAllPeers,
  handleTextUpdateFromPeer,
  forwardTextUpdateToOtherPeers,
  createPeerConnection
} from './utils/WebRTCUtils.js';
import { canCallEndpoint } from './utils/RateLimiter.js';
import { enableWebRTCDebug, sendWebRTCLogs } from './utils/WebRTCDebug.js';

  // Constants
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
  const LOGO_URL = import.meta.env.VITE_LOGO_URL || '/clippy.png';
  const MAX_TEXT_LENGTH = 20000; // Limit text to 20,000 characters (approx. 20KB)
  const MAX_STORAGE_SIZE = 4 * 1024 * 1024; // 4MB limit for localStorage// TextShareApp Component
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

  const { id, seedData } = useParams(); // Get id and seedData from URL parameter with hash routing
  
  // Decode the seed text if it exists from path parameter
  const seedText = seedData ? decodeTextFromBase64(seedData) : '';
  
  const [text, setText] = useState('');
  const [savedText, setSavedText] = useState('');
  const [serverText, setServerText] = useState('');
  const [lastServerText, setLastServerText] = useState(''); // Store the last received server text for comparison
  const [status, setStatus] = useState('idle');
  const [lastSaved, setLastSaved] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [updatesAvailable, setUpdatesAvailable] = useState(false);
  const [lastChecked, setLastChecked] = useState(new Date()); // Initialize with current date
  const [contentChecked, setContentChecked] = useState(true); // Start with contentChecked true
  const [showShareOptions, setShowShareOptions] = useState(false); // Hide share options by default
  const [showShareModal, setShowShareModal] = useState(false); // For the share modal
  const [isInitialized, setIsInitialized] = useState(false); // Track if we've initialized with seed text
  const [hasDraft, setHasDraft] = useState(false); // Whether user has a saved draft
  const [draftText, setDraftText] = useState(''); // Store the draft text
  const [showDraft, setShowDraft] = useState(false); // Whether to show the draft or current text
  const [autoUpdate, setAutoUpdate] = useState(() => {
    try {
      const saved = localStorage.getItem('clippy-auto-update');
      return saved === 'true';
    } catch { return false; }
  });
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  // Active users tracking
  const [activeUsers, setActiveUsers] = useState(1); // Start with yourself
  const clientIdRef = useRef(null);
  
  // WebRTC related state
  const [peerConnections, setPeerConnections] = useState({});
  const [connectedPeers, setConnectedPeers] = useState([]);
  const [rtcSupported, setRtcSupported] = useState(false);
  const [isRtcConnected, setIsRtcConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState({});
  const [isPollingPaused, setIsPollingPaused] = useState(false);
  const peerConnectionsRef = useRef({});
  const dataChannelsRef = useRef({});
  const isTypingRef = useRef(false);
  const lastSentTextRef = useRef('');
  const lastReceivedTextRef = useRef('');
  const pendingTextUpdatesRef = useRef(null);
  const lastUpdateTimestampRef = useRef(0);
  const lastReceivedTimestampRef = useRef(0);
  
  // Connection status logger - helps monitor WebRTC status
  const connectionLoggerRef = useRef(null);
  
  // Function to log the current WebRTC connection status
  const logConnectionStatus = () => {
    // Only log when we have an active session
    if (!id || !clientIdRef.current) return;
    
    const connectedPeersCount = Object.keys(dataChannelsRef.current).filter(
      peerId => dataChannelsRef.current[peerId].readyState === 'open'
    ).length;
    
    const expectedPeerCount = activeUsers - 1;
    const allPeersConnected = connectedPeersCount >= expectedPeerCount && expectedPeerCount > 0;
    
    console.log(
      `WebRTC Status: ${allPeersConnected ? 'FULLY CONNECTED' : 'PARTIAL CONNECTION'} - ` +
      `Connected: ${connectedPeersCount}/${expectedPeerCount}, ` +
      `Polling interval: ${pollIntervalRef.current}ms`
    );
    
    // Log details of each connection
    for (const peerId in dataChannelsRef.current) {
      console.log(`- Peer ${peerId}: ${dataChannelsRef.current[peerId].readyState}`);
    }
    
    // Schedule next log
    connectionLoggerRef.current = setTimeout(logConnectionStatus, 30000); // Log every 30 seconds
  };
  
  // Remove local theme state in favor of context
  const { isDark } = useTheme();
  
  // Use a ref to store the lastServerText that persists across renders
  // This will be shared between all our functions
  const lastServerTextRef = useRef('');
  
  // Create a ref for the current checksum
  const currentChecksumRef = useRef('');

  // Helper function for deep text comparison
  const areTextsEqual = (a, b) => {
    // Normalize both strings (trim whitespace, normalize line endings)
    const normalizeText = (text) => text.trim().replace(/\r\n/g, '\n');
    return normalizeText(a) === normalizeText(b);
  };

  // This function is replaced with a more stable version in the useEffect
  // It's still used for manual "Check Updates" button clicks
  const checkForUpdates = async () => {
    try {
      
      
      // Add timestamp to URL to prevent caching issues
      const cacheBreaker = new Date().getTime();
      const response = await fetch(`${API_BASE_URL}/share.php?id=${id}&t=${cacheBreaker}`);
      const data = await response.json();
      
      if (data.text !== undefined) {
        const newServerText = data.text;
        
        // Direct string comparison for determining changes
        const hasChanged = newServerText !== lastServerText;
        const isDifferentFromEditor = newServerText !== text;
        
        // Store the server response
        setServerText(newServerText);
        
        // Debug information to help diagnose comparison issues
        
        
        // ONLY show updates when:
        // 1. The text from server is different from our last known server state AND
        // 2. It's different from what's currently in the editor AND
        // 3. It's not empty
        if (hasChanged && isDifferentFromEditor && newServerText.trim() !== '') {
          if (autoUpdate) {
            // When auto-updating, use the new text directly to avoid race conditions
            setText(newServerText);
            setSavedText(newServerText);
            setLastServerText(newServerText);
            lastServerTextRef.current = newServerText;
            setStatus('updated');
          } else {
            setUpdatesAvailable(true);
          }
        } else {
          setUpdatesAvailable(false);
        }
        
        // Important: Always update our record of the last server text after each check
        setLastServerText(newServerText);
        setLastChecked(new Date());
        setContentChecked(true);
        setContentChecked(true);
      }
    } catch (error) {
      console.error('Error checking for updates:', error);
    }
  };

  // Apply updates from server
  const applyUpdates = () => {
    // Apply server text to editor
    setText(serverText);
    setSavedText(serverText);
    
    // Update our reference of what the server has
    setLastServerText(serverText);
    lastServerTextRef.current = serverText; // Update ref too
    
    // Clear update notification
    setUpdatesAvailable(false);
    setStatus('updated');
    
    // If we're viewing the draft, switch back to the shared text
    if (showDraft) {
      setShowDraft(false);
    }
    
    // Show toast notification for manual update
    setToastMessage('Updates applied successfully');
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  // Save auto-update preference
  useEffect(() => {
    try {
      localStorage.setItem('clippy-auto-update', autoUpdate ? 'true' : 'false');
    } catch {}
  }, [autoUpdate]);

  // Check for saved draft on initial load
  useEffect(() => {
    if (!id) return;
    try {
      const savedDraft = localStorage.getItem(`clippy-draft-${id}`);
      if (savedDraft) {
        setDraftText(savedDraft);
        setHasDraft(true);
      }
    } catch (error) {
      console.error('Error loading draft from localStorage:', error);
    }
  }, [id]);

  // Save current text as draft
  const saveDraft = () => {
    try {
      // Check text size
      if (text.length > MAX_TEXT_LENGTH) {
        setShowToast(true);
        setToastMessage(`Draft too large - maximum ${MAX_TEXT_LENGTH.toLocaleString()} characters allowed`);
        setTimeout(() => setShowToast(false), 3000);
        return;
      }
      
      // Check if we'd exceed localStorage limits
      const draftKey = `clippy-draft-${id}`;
      const draftSize = new Blob([text]).size;
      
      // Estimate total localStorage size (rough calculation)
      let totalSize = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key);
        totalSize += new Blob([key]).size + new Blob([value]).size;
      }
      
      // If this new draft would exceed our size limit
      if (totalSize - (localStorage.getItem(draftKey)?.length || 0) + draftSize > MAX_STORAGE_SIZE) {
        setShowToast(true);
        setToastMessage('Cannot save draft - browser storage limit reached');
        setTimeout(() => setShowToast(false), 3000);
        return;
      }
      
      // Store the draft
      localStorage.setItem(draftKey, text);
      setDraftText(text);
      setHasDraft(true);
      setShowToast(true);
      setToastMessage('Draft saved successfully');
      setTimeout(() => setShowToast(false), 3000);
    } catch (error) {
      console.error('Error saving draft to localStorage:', error);
      setShowToast(true);
      setToastMessage('Error saving draft');
      setTimeout(() => setShowToast(false), 3000);
    }
  };

  // Delete the saved draft
  const deleteDraft = () => {
    try {
      localStorage.removeItem(`clippy-draft-${id}`);
      setHasDraft(false);
      setDraftText('');
      setShowDraft(false);
      setShowToast(true);
      setToastMessage('Draft deleted');
      setTimeout(() => setShowToast(false), 3000);
    } catch (error) {
      console.error('Error deleting draft from localStorage:', error);
    }
  };

  // Toggle between draft and current text
  const toggleDraft = () => {
    setShowDraft(!showDraft);
  };

  // Initial load of text from server
  const initialLoad = async () => {
    try {
      
      
      // First, fetch the text content
      const response = await fetch(`${API_BASE_URL}/share.php?id=${id}`);
      const data = await response.json();
      
      // Also get the status data to store the initial checksum
      const statusResponse = await fetch(`${API_BASE_URL}/share.php?id=${id}&status=1`);
      const statusData = await statusResponse.json();
      
      // Update checksum reference if available
      if (statusData.exists && statusData.checksum) {
        
        // Store in our ref
        currentChecksumRef.current = statusData.checksum;
      }
      
      // Check if we have seed text and the server returned empty text
      if (seedText && (!data.text || data.text.trim() === '')) {
        
        
        // Save the seed text to server
        await fetch(`${API_BASE_URL}/share.php?id=${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: seedText }),
        });
        
        // Set all our state variables to the seed text
        setText(seedText);
        setSavedText(seedText);
        setServerText(seedText);
        setLastServerText(seedText);
        lastServerTextRef.current = seedText;
        setHasChanges(false);
        setLastSaved(new Date());
        setStatus('saved');
        
        
      } 
      else if (data.text !== undefined) {
        const initialText = data.text;
        
        
        
        setText(initialText);
        setSavedText(initialText);
        setServerText(initialText);
        setLastServerText(initialText); // Store initial text as last server text
        lastServerTextRef.current = initialText; // Also store in our ref
        setHasChanges(false);
        
        
      }
      
      setIsInitialized(true);
    } catch (error) {
      console.error('Error loading initial text:', error);
      setIsInitialized(true);
    }
  };

  // Save text to server
  const saveText = async () => {
    try {
      setStatus('saving');
      
      // Capture the exact text being saved
      const textToSave = text;
      
      // Send to server
      await fetch(`${API_BASE_URL}/share.php?id=${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToSave }),
      });
      
      // After saving, get the new checksum for this content
      const statusResponse = await fetch(`${API_BASE_URL}/share.php?id=${id}&status=1`);
      const statusData = await statusResponse.json();
      
      // Update our stored checksum
      if (statusData.exists && statusData.checksum) {
        currentChecksumRef.current = statusData.checksum;
        
      }
      
      // Update all state variables to match the saved text
      setStatus('saved');
      setLastSaved(new Date());
      setSavedText(textToSave);
      setServerText(textToSave);
      setLastServerText(textToSave); // Critical: Update last known server state
      lastServerTextRef.current = textToSave; // Also update our ref
      setHasChanges(false);
      setUpdatesAvailable(false);
      
      
    } catch (error) {
      console.error('Error saving text:', error);
      setStatus('error');
    }
  };

  // Poll for updates every 10 seconds
  useEffect(() => {
    if (!id) return;
    
    
    
    // Initial load
    initialLoad();
    
    // Define a wrapped check function that uses our ref for stable state between calls
    const stableCheckFunction = async () => {
      // Skip checking for content updates if WebRTC polling is paused
      if (isPollingPausedRef.current) {
        setLastChecked(new Date()); // Still update the timestamp so UI shows recent check
        return;
      }
      
      try {
        
        
        // Add timestamp to URL to prevent caching issues
        const cacheBreaker = new Date().getTime();
        
        // First, only fetch the status (lightweight request)
        const statusResponse = await fetch(`${API_BASE_URL}/share.php?id=${id}&status=1&t=${cacheBreaker}`);
        const statusData = await statusResponse.json();
        
        // Update the last checked time
        setLastChecked(new Date());
        setContentChecked(true);
        
        // Initialize currentChecksumRef on first poll if needed
        if (!currentChecksumRef.current) {
          
        }
        
        if (statusData.exists) {
          
          
          // Check if content has changed by comparing checksums
          const hasChanged = currentChecksumRef.current !== statusData.checksum;
          
          if (hasChanged) {
            
            
            // Only fetch the full content if the status check indicates changes
            const contentResponse = await fetch(`${API_BASE_URL}/share.php?id=${id}&t=${cacheBreaker}`);
            const contentData = await contentResponse.json();
            
            if (contentData.text !== undefined) {
              const newServerText = contentData.text;
              
              // Update the checksum reference
              currentChecksumRef.current = statusData.checksum;
              
              // We need to get the current text value directly rather than from closure
              const currentText = text; // Get current text from state
              const isDifferentFromEditor = newServerText !== currentText;
              
              // Store the server response in React state
              setServerText(newServerText);
              
              if (isDifferentFromEditor && newServerText.trim() !== '') {
                if (autoUpdate) {
                  // When auto-updating, use the new text directly to avoid race conditions
                  setText(newServerText);
                  setSavedText(newServerText);
                  setLastServerText(newServerText);
                  lastServerTextRef.current = newServerText;
                  setStatus('updated');
                  
                  // If user is viewing draft, don't switch views but still notify
                  const switchedFromDraft = showDraft;
                  if (showDraft) {
                    setToastMessage('Text updated in shared view (you\'re viewing your draft)');
                  } else {
                    setToastMessage('Text updated automatically and copied to clipboard');
                    // Copy the new content to clipboard only if not viewing draft
                    navigator.clipboard.writeText(newServerText)
                      .catch(err => console.error('Could not copy text to clipboard:', err));
                  }
                  
                  setShowToast(true);
                  setTimeout(() => setShowToast(false), 3000);
                } else {
                  setUpdatesAvailable(true);
                }
              } else {
                setUpdatesAvailable(false);
              }
              
              // Update our stable reference AND the React state
              lastServerTextRef.current = newServerText;
              setLastServerText(newServerText);
              
              
            }
          } else {
            
            setUpdatesAvailable(false);
          }
        }
      } catch (error) {
        console.error('Error in stable check function:', error);
      }
    };
    
    // Set up polling with our wrapped function
    const interval = setInterval(() => {
      stableCheckFunction();
      
      // Also ping for active users if we have an ID and polling isn't paused
      if (id && clientIdRef.current && !isPollingPausedRef.current) {
        pingActiveUsers();
      }
    }, 10000); // 10 second interval is fine since we have rate limiting
    
    // Set up periodic checking for new clients with dynamic interval
    const clientCheckInterval = setInterval(() => {
      if (id && clientIdRef.current && rtcSupported && activeUsers > 1) {
        // Check if we have connections to all peers
        const connectedPeersCount = Object.keys(dataChannelsRef.current).filter(
          peerId => dataChannelsRef.current[peerId].readyState === 'open'
        ).length;
        
        const allPeersConnected = connectedPeersCount >= activeUsers - 1;
        
        // If polling is paused, only check very rarely for new clients
        if (isPollingPausedRef.current) {
          // If polling is paused and we're fully connected, only check 5% of the time
          if (Math.random() < 0.05) {
            sendPresenceAnnouncement();
          }
        } 
        // Otherwise, if we're fully connected, check occasionally
        else if (allPeersConnected && Math.random() < 0.3) {
          sendPresenceAnnouncement();
        }
        // If not fully connected, check more frequently
        else if (!allPeersConnected) {
          sendPresenceAnnouncement();
        }
        
        // Send WebRTC debug logs periodically, but only when not fully connected or randomly
        if (window.webrtcLogs && window.webrtcLogs.length > 0 && 
           (!allPeersConnected || (isPollingPausedRef.current ? Math.random() < 0.05 : Math.random() < 0.2))) {
          sendWebRTCLogs(id, clientIdRef.current);
        }
      }
    }, 15000); // 15 second interval with rate limiting
    
    return () => {
      clearInterval(interval);
      clearInterval(clientCheckInterval);
      
      // Clear the connection logger
      if (connectionLoggerRef.current) {
        clearTimeout(connectionLoggerRef.current);
      }
      
      // Leave the session when unmounting the component
      if (id && clientIdRef.current) {
        leaveSession();
      }
    };
  }, [id, autoUpdate]); // Include autoUpdate in deps to respond to changes
  
  // Function to generate a client ID on mount
  useEffect(() => {
    // Generate a unique client ID if we don't have one yet
    if (!clientIdRef.current) {
      clientIdRef.current = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      console.log("Generated client ID:", clientIdRef.current);
    }
    
    // Check if WebRTC is supported
    if (window.RTCPeerConnection && window.RTCSessionDescription) {
      console.log("WebRTC is supported in this browser");
      setRtcSupported(true);
      
      // Enable WebRTC debugging
      enableWebRTCDebug();
    } else {
      console.warn("WebRTC is NOT supported in this browser");
    }
    
    // Ping for active users immediately on mount if we have an ID
    if (id) {
      console.log("Session ID:", id);
      
      // First ping to get active users
      pingActiveUsers().then(() => {
        // If WebRTC is supported, start WebRTC signaling
        if (window.RTCPeerConnection && window.RTCSessionDescription) {
          console.log("Starting WebRTC signaling...");
          startWebRTCSignaling();
          
          // Start the connection status logger
          logConnectionStatus();
          
          // After a short delay, send a presence announcement to initiate connections
          setTimeout(() => {
            sendPresenceAnnouncement();
          }, 2000);
        }
      });
    }
    
    // Set up beforeunload event to leave the session when the user closes the tab
    const handleBeforeUnload = () => {
      if (id && clientIdRef.current) {
        leaveSession();
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      
      // Clear the polling timeout when unmounting
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
      }
    };
  }, [id]); // Remove rtcSupported from dependency array since we check it inside
  
  // Effect to sync polling paused ref to state for UI
  useEffect(() => {
    const interval = setInterval(() => {
      if (isPollingPausedRef.current !== isPollingPaused) {
        setIsPollingPaused(isPollingPausedRef.current);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isPollingPaused]);
  
  // WebRTC Signaling Functions
  const startWebRTCSignaling = () => {
    console.log("Starting WebRTC signaling with client ID:", clientIdRef.current);
    // Start polling for signals
    pollForSignals();
  };
  
  // Reference to store the polling timeout ID
  const pollingTimeoutRef = useRef(null);
  // Track poll interval (will increase with backoff)
  const pollIntervalRef = useRef(1000); // Start with 1s
  // Track the last time we received signals
  const lastSignalTimeRef = useRef(0);
  // Track if we're in active connection mode
  const activeConnectionModeRef = useRef(false);
  // Track if polling is paused due to complete WebRTC connections
  const isPollingPausedRef = useRef(false);
  
  const pollForSignals = async () => {
    if (!id || !clientIdRef.current) return;
    
    // Don't call the rate limiter here since we use a dynamic polling interval instead
    // The polling logic already handles backoff
    
    // Check if we already have connections to all peers
    const connectedPeersCount = Object.keys(dataChannelsRef.current).filter(
      peerId => dataChannelsRef.current[peerId].readyState === 'open'
    ).length;
    
    // If we have connections to all peers, we can pause polling
    const allPeersConnected = connectedPeersCount >= activeUsers - 1 && activeUsers > 1;
    
    if (allPeersConnected) {
      if (!isPollingPausedRef.current) {
        console.log(`All peers connected (${connectedPeersCount}/${activeUsers-1}), pausing signaling polling`);
        isPollingPausedRef.current = true;
        // Schedule a very infrequent check (once every 2 minutes) to handle potential new peers
        pollIntervalRef.current = 120000; // 2 minutes
      }
    } else {
      // If we were paused but lost connections, resume normal polling
      if (isPollingPausedRef.current) {
        console.log('Not all peers connected, resuming normal polling frequency');
        isPollingPausedRef.current = false;
        pollIntervalRef.current = 5000; // Reset to 5 seconds
      }
    }
    
    try {
      const headers = new Headers();
      headers.append('X-Client-ID', clientIdRef.current);
      headers.append('X-Session-ID', id);
      
      const response = await fetch(`${API_BASE_URL}/webrtc_signaling.php`, {
        headers
      });
      
      const data = await response.json();
      
      if (data.status === 'success') {
        // If we have signals, process them and reset poll interval to be more responsive
        if (data.signals && data.signals.length > 0) {
          console.log(`Received ${data.signals.length} WebRTC signals:`, data.signals);
          
          // Process each signal
          for (const signal of data.signals) {
            processSignal(signal);
          }
          
          // Update last signal time
          lastSignalTimeRef.current = Date.now();
          
          // If we're actively receiving signals, switch to active mode with faster polling
          activeConnectionModeRef.current = true;
          pollIntervalRef.current = 1000; // Reset to 1s during active connection
        } else {
          // No signals, potentially increase poll interval if we haven't received signals in a while
          const timeSinceLastSignal = Date.now() - lastSignalTimeRef.current;
          
          // If we're in active mode but haven't received signals for 10 seconds, exit active mode
          if (activeConnectionModeRef.current && timeSinceLastSignal > 10000) {
            activeConnectionModeRef.current = false;
          }
          
          // If we have established WebRTC connections to all active peers, we can slow down polling significantly
          const connectedPeersCount = Object.keys(dataChannelsRef.current).filter(
            peerId => dataChannelsRef.current[peerId].readyState === 'open'
          ).length;
          
          // If we have connections to everyone (activeUsers minus ourselves)
          if (connectedPeersCount >= activeUsers - 1 && activeUsers > 1) {
            // Set polling to paused state since we don't need signaling anymore
            // But still keep it running at a very slow rate in case new peers join
            isPollingPausedRef.current = true;
            pollIntervalRef.current = 120000; // 2 minutes
            console.log(`All peers connected (${connectedPeersCount}/${activeUsers-1}), pausing signaling with check every ${pollIntervalRef.current/1000} seconds`);
          } else
          // If we're not in active mode, implement exponential backoff up to 10 seconds
          if (!activeConnectionModeRef.current) {
            // Not paused since we don't have all connections
            isPollingPausedRef.current = false;
            // Increase interval with each empty response, max 10s
            pollIntervalRef.current = Math.min(pollIntervalRef.current * 1.5, 10000);
          }
        }
      }
      
      // Schedule next poll with current interval
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = setTimeout(pollForSignals, pollIntervalRef.current);
    } catch (error) {
      console.error('Error polling for WebRTC signals:', error);
      
      // On error, back off more aggressively
      // Check if we're fully connected
      const connectedPeersCount = Object.keys(dataChannelsRef.current).filter(
        peerId => dataChannelsRef.current[peerId].readyState === 'open'
      ).length;
      
      // Allow longer backoff intervals when we have full connectivity
      if (connectedPeersCount >= activeUsers - 1 && activeUsers > 1) {
        isPollingPausedRef.current = true;
        pollIntervalRef.current = 120000; // 2 minutes on error with all peers connected
        console.log(`Network error, but all peers connected. Pausing polling with check every ${pollIntervalRef.current/1000} seconds`);
      } else {
        pollIntervalRef.current = Math.min(pollIntervalRef.current * 2, 15000); // Up to 15 seconds
      }
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = setTimeout(pollForSignals, pollIntervalRef.current);
    }
  };
  
  const sendSignal = async (targetClientId, signal) => {
    if (!id || !clientIdRef.current) return;
    
    // Rate limit sending signals to the same target
    // Use a shorter timeout for critical signaling messages like offers/answers
    const isNegotiation = signal.type === 'offer' || signal.type === 'answer' || signal.type === 'hello';
    const timeout = isNegotiation ? 2000 : 5000; // 2s for negotiation, 5s for other signals
    
    if (!canCallEndpoint(`send-signal-${id}-${targetClientId}-${signal.type || 'ice'}`, timeout)) {
      console.log(`Rate limited: Not sending ${signal.type || 'ICE candidate'} to ${targetClientId}`);
      return;
    }
    
    try {
      console.log(`Sending signal to ${targetClientId}:`, signal.type || 'ICE candidate');
      
      const headers = new Headers();
      headers.append('X-Client-ID', clientIdRef.current);
      headers.append('X-Session-ID', id);
      headers.append('Content-Type', 'application/json');
      
      const response = await fetch(`${API_BASE_URL}/webrtc_signaling.php`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          target: targetClientId,
          signal
        })
      });
      
      const data = await response.json();
      if (data.status === 'success') {
        console.log(`Successfully sent signal to ${targetClientId}`);
      } else {
        console.error(`Error sending signal to ${targetClientId}:`, data);
        
        // If there's an error sending a signal, try resending after a short delay
        // but only for important negotiation signals
        if (isNegotiation) {
          setTimeout(() => {
            console.log(`Retrying sending ${signal.type} to ${targetClientId}`);
            // We need to bypass rate limiting for the retry
            // This is a special case where we force a retry
            fetch(`${API_BASE_URL}/webrtc_signaling.php`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                target: targetClientId,
                signal
              })
            }).catch(err => console.error(`Retry failed: ${err.message}`));
          }, 2000);
        }
      }
    } catch (error) {
      console.error('Error sending WebRTC signal:', error);
    }
  };
  
  const processSignal = async (signalData) => {
    const { from, signal } = signalData;
    
    // Don't process signals from self
    if (from === clientIdRef.current) return;
    
    console.log(`Processing signal from ${from}:`, signal.type || 'ICE candidate');
    
    // If it's an offer, we need to create an answer
    if (signal.type === 'offer') {
      await handleOffer(from, signal);
    }
    // If it's an answer, set the remote description
    else if (signal.type === 'answer') {
      await handleAnswer(from, signal);
    }
    // If it's an ICE candidate, add it
    else if (signal.candidate) {
      await handleCandidate(from, signal);
    }
    // If it's a client hello message
    else if (signal.type === 'hello') {
      console.log(`Received hello from ${from}, creating offer`);
      
      // Create an offer for this client if we don't already have a connection
      if (!peerConnectionsRef.current[from] || 
          (peerConnectionsRef.current[from].connectionState !== 'connected' && 
           peerConnectionsRef.current[from].connectionState !== 'connecting')) {
        
        console.log(`No active connection to ${from}, creating new peer connection`);
        createPeerConnectionWrapper(from, true);
      } else {
        console.log(`Already have connection to ${from}, connection state: ${peerConnectionsRef.current[from].connectionState}`);
        
        // If we have a connection but the data channel is closed, recreate it
        if (!dataChannelsRef.current[from] || dataChannelsRef.current[from].readyState !== 'open') {
          console.log(`Data channel to ${from} is not open, recreating connection`);
          
          // Close existing connection
          if (peerConnectionsRef.current[from]) {
            peerConnectionsRef.current[from].close();
            delete peerConnectionsRef.current[from];
          }
          
          // Create new connection
          createPeerConnectionWrapper(from, true);
        }
      }
    }
    else if (signal.type === 'bye') {
      console.log(`Peer ${from} disconnected`);
      handlePeerDisconnectWrapper(from);
    }
  };
  
  const handleOffer = async (peerId, offer) => {
    try {
      console.log(`Handling offer from ${peerId}:`, offer);
      
      // Create a peer connection if it doesn't exist
      const pc = createPeerConnectionWrapper(peerId, false);
      
      // Set the remote description
      console.log(`Setting remote description for ${peerId}`);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      
      // Create an answer
      console.log(`Creating answer for ${peerId}`);
      const answer = await pc.createAnswer();
      console.log(`Setting local description for ${peerId}`);
      await pc.setLocalDescription(answer);
      
      // Send the answer
      console.log(`Sending answer to ${peerId}`);
      sendSignal(peerId, pc.localDescription);
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  };
  
  const handleAnswer = async (peerId, answer) => {
    try {
      // Get the peer connection
      const pc = peerConnectionsRef.current[peerId];
      if (!pc) return;
      
      // Set the remote description
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  };
  
  const handleCandidate = async (peerId, candidate) => {
    try {
      // Get the peer connection
      const pc = peerConnectionsRef.current[peerId];
      if (!pc) return;
      
      // Add the ICE candidate
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('Error handling ICE candidate:', error);
    }
  };
  
  const createPeerConnectionWrapper = (peerId, isInitiator) => {
    // Call the utility function with all required parameters
    return createPeerConnection(
      peerId,
      isInitiator,
      peerConnectionsRef,
      dataChannelsRef,
      setPeerConnections,
      setConnectionStatus,
      setConnectedPeers,
      handlePeerDisconnectWrapper, // Use wrapper function
      setupDataChannel,
      updateRtcConnectionStatusWrapper, // Use wrapper function
      sendSignal,
      text
    );
  };
  
  const setupDataChannel = (dataChannel, peerId) => {
    console.log(`Setting up data channel for peer ${peerId}`);
    dataChannelsRef.current[peerId] = dataChannel;
    
    dataChannel.onopen = () => {
      console.log(`Data channel with ${peerId} opened`);
      
      // Update the overall connection status when a data channel opens
      updateRtcConnectionStatusWrapper();
      
      // When connected, send current text to peer
      if (text) {
        console.log(`Sending initial text to peer ${peerId}`);
        sendTextToPeerWrapper(peerId, text);
      }
      
      // Announce the connection to help complete the mesh network
      sendPresenceAnnouncement();
    };
    
    dataChannel.onclose = () => {
      console.log(`Data channel with ${peerId} closed`);
      updateRtcConnectionStatusWrapper();
    };
    
    dataChannel.onmessage = (event) => {
      console.log(`Received message from ${peerId}:`, event.data.substring(0, 50) + '...');
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'text_update') {
          console.log(`Received text update from ${peerId}, length: ${data.text.length}, timestamp: ${data.timestamp || 0}`);
          handleTextUpdateFromPeerWrapper(data.text, data.timestamp || 0);
          
          // Forward the update to all other peers (mesh network)
          forwardTextUpdateToOtherPeersWrapper(peerId, data.text, data.timestamp);
        }
      } catch (error) {
        console.error('Error processing message:', error);
      }
    };
  };
  
  // Forward text updates to all peers except the original sender
  const forwardTextUpdateToOtherPeers = (fromPeerId, textToForward, lastSentTextRef, dataChannelsRef, timestamp) => {
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
            text: textToForward,
            timestamp: timestamp || Date.now()
          }));
          forwardedToPeers.push(peerId);
        } catch (err) {
          console.error(`Failed to forward to peer ${peerId}:`, err);
        }
      }
    }
    
    if (forwardedToPeers.length > 0) {
      console.log(`Successfully forwarded text to ${forwardedToPeers.length} peers: ${forwardedToPeers.join(', ')}`);
      // Update our last sent text reference
      lastSentTextRef.current = textToForward;
    }
  };

  // Create a wrapper for forwardTextUpdateToOtherPeers
  const forwardTextUpdateToOtherPeersWrapper = (fromPeerId, textToForward, timestamp = Date.now()) => {
    forwardTextUpdateToOtherPeers(
      fromPeerId, 
      textToForward, 
      lastSentTextRef, 
      dataChannelsRef, 
      timestamp
    );
  };
  
  const handlePeerDisconnectWrapper = (peerId) => {
    // Use the imported utility function with all the needed parameters
    handlePeerDisconnect(
      peerId,
      dataChannelsRef,
      peerConnectionsRef,
      setConnectedPeers,
      setConnectionStatus,
      setPeerConnections,
      updateRtcConnectionStatusWrapper
    );
  };
  
  // Function to update the overall WebRTC connection status
  const updateRtcConnectionStatusWrapper = () => {
    // Use the imported utility function with all the needed parameters
    updateRtcConnectionStatus(
      dataChannelsRef,
      activeUsers,
      setIsRtcConnected,
      sendPresenceAnnouncement
    );
  };
  
  const sendTextToPeerWrapper = (peerId, textToSend) => {
    // Use the imported utility function with all the needed parameters
    sendTextToPeer(
      peerId,
      textToSend,
      dataChannelsRef
    );
  };
  
  const broadcastTextToAllPeers = (textToSend) => {
    if (textToSend === lastSentTextRef.current) return; // Don't send if nothing changed
    
    const peerCount = Object.keys(dataChannelsRef.current).length;
    console.log(`Broadcasting text to ${peerCount} peers, length: ${textToSend.length}`);
    
    let successCount = 0;
    // Track which peers we've sent to
    const sentToPeers = [];
    const failedPeers = [];
    
    // Create a single timestamp for this broadcast to ensure consistency
    const timestamp = Date.now();
    
    for (const peerId in dataChannelsRef.current) {
      const dataChannel = dataChannelsRef.current[peerId];
      if (dataChannel && dataChannel.readyState === 'open') {
        try {
          dataChannel.send(JSON.stringify({
            type: 'text_update',
            text: textToSend,
            timestamp: timestamp
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
          handlePeerDisconnectWrapper(failedPeerId);
        }
      }
      
      // Check overall connection status
      updateRtcConnectionStatusWrapper();
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
  
  const handleTextUpdateFromPeer = (newText) => {
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
  
  // Wrapper function to call the imported handleTextUpdateFromPeer from WebRTCUtils with all required parameters
  const handleTextUpdateFromPeerWrapper = (newText, timestamp = 0) => {
    // Use the imported utility function with all the needed parameters
    handleTextUpdateFromPeer(
      newText,
      lastReceivedTextRef,
      isTypingRef,
      pendingTextUpdatesRef,
      setText,
      setSavedText,
      setHasChanges,
      timestamp,
      lastReceivedTimestampRef
    );
  };
  
  // Announce presence to all active users when active user count changes
  useEffect(() => {
    if (activeUsers > 1 && rtcSupported && id && clientIdRef.current) {
      console.log(`Detected ${activeUsers} active users, announcing our presence`);
      
      // Instead of sending to 'all', which isn't a valid target ID,
      // we'll check for active users and directly announce to them
      sendPresenceAnnouncement();
      
      // When active users count changes, force a quick poll cycle
      // to establish connections faster
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
      }
      
      // Reset polling interval to be responsive when users are detected
      pollIntervalRef.current = 1000;
      activeConnectionModeRef.current = true;
      lastSignalTimeRef.current = Date.now();
      
      // Start polling immediately
      pollForSignals();
    }
  }, [activeUsers, rtcSupported, id]);
  
  // Function to announce our presence to other users
  const sendPresenceAnnouncement = async () => {
    if (!id || !clientIdRef.current) return;
    
    // Check if we already have connections to all peers
    const connectedPeersCount = Object.keys(dataChannelsRef.current).filter(
      peerId => dataChannelsRef.current[peerId].readyState === 'open'
    ).length;
    
    // If we have connections to all peers, we can reduce the announcement frequency
    const announcementInterval = (connectedPeersCount >= activeUsers - 1 && activeUsers > 1) ? 30000 : 5000;
    
    // Rate limit presence announcements based on connection status
    if (!canCallEndpoint(`send-presence-${id}`, announcementInterval)) {
      return;
    }
    
    try {
      // Get the list of active users to announce to
      const headers = new Headers();
      headers.append('X-Client-ID', clientIdRef.current);
      
      const response = await fetch(`${API_BASE_URL}/share.php?id=${id}&track=ping`, {
        headers
      });
      
      const data = await response.json();
      
      if (data.status === 'success' && data.clientList && Array.isArray(data.clientList)) {
        console.log(`Sending presence announcement to ${data.clientList.length} active clients`);
        
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
            
            if (!hasActiveConnection) {
              console.log(`No active connection to ${otherClientId}, announcing presence`);
              
              // Check if we already have a connection attempt in progress
              const existingConnection = peerConnectionsRef.current[otherClientId];
              if (existingConnection) {
                const state = existingConnection.connectionState;
                console.log(`Existing connection to ${otherClientId} in state: ${state}`);
                
                // If the connection is failed or closed, recreate it
                if (state === 'failed' || state === 'closed' || state === 'disconnected') {
                  console.log(`Cleaning up failed connection to ${otherClientId}`);
                  handlePeerDisconnectWrapper(otherClientId);
                  
                  // Send a new hello signal
                  sendSignal(otherClientId, { type: 'hello' });
                }
              } else {
                // No existing connection, send hello
                sendSignal(otherClientId, { type: 'hello' });
              }
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
            handlePeerDisconnectWrapper(peerId);
          }
        }
        
        // Update overall WebRTC connection status
        updateRtcConnectionStatusWrapper();
      } else {
        // If server doesn't provide client list, fall back to broadcast
        console.log('Server did not provide client list, using broadcast');
        sendSignal('all', { type: 'hello' });
      }
    } catch (error) {
      console.error('Error sending presence announcement:', error);
    }
  };
  
  // Function to ping the server for active users
  const pingActiveUsers = async () => {
    if (!id || !clientIdRef.current) return;
    
    // Check if we already have connections to all peers
    const connectedPeersCount = Object.keys(dataChannelsRef.current).filter(
      peerId => dataChannelsRef.current[peerId].readyState === 'open'
    ).length;
    
    // If we have connections to all peers, we can reduce the ping frequency
    const pingInterval = (connectedPeersCount >= activeUsers - 1 && activeUsers > 1) ? 30000 : 5000;
    
    // Rate limit this call based on connection status
    if (!canCallEndpoint(`ping-active-users-${id}`, pingInterval)) {
      return;
    }
    
    try {
      const headers = new Headers();
      headers.append('X-Client-ID', clientIdRef.current);
      
      const response = await fetch(`${API_BASE_URL}/share.php?id=${id}&track=ping`, {
        headers
      });
      
      const data = await response.json();
      
      if (data.status === 'success' && data.activeUsers !== undefined) {
        if (activeUsers !== data.activeUsers) {
          console.log(`Active users changed: ${activeUsers} -> ${data.activeUsers}`);
          
          // If user count increased, reset the polling interval to be more responsive
          if (data.activeUsers > activeUsers) {
            pollIntervalRef.current = 1000;
            console.log(`New users detected, resetting signaling poll interval to ${pollIntervalRef.current}ms`);
            
            // Reset polling paused state when new users are detected
            isPollingPausedRef.current = false;
            
            // Force an immediate poll to connect with new users
            if (pollingTimeoutRef.current) {
              clearTimeout(pollingTimeoutRef.current);
              pollForSignals();
            }
          }
        }
        setActiveUsers(data.activeUsers);
      }
    } catch (error) {
      console.error('Error pinging for active users:', error);
    }
  };
  
  // Function to leave the session
  const leaveSession = async () => {
    if (!id || !clientIdRef.current) return;
    
    try {
      // Send bye signal to all connected peers
      if (rtcSupported && Object.keys(peerConnectionsRef.current).length > 0) {
        for (const peerId in peerConnectionsRef.current) {
          sendSignal(peerId, { type: 'bye' });
        }
      }
      
      // Close all peer connections
      for (const peerId in peerConnectionsRef.current) {
        if (peerConnectionsRef.current[peerId]) {
          peerConnectionsRef.current[peerId].close();
        }
      }
      
      const headers = new Headers();
      headers.append('X-Client-ID', clientIdRef.current);
      
      await fetch(`${API_BASE_URL}/share.php?id=${id}&track=leave`, {
        headers
      });
    } catch (error) {
      console.error('Error leaving session:', error);
    }
  };

  const handleTextChange = (e) => {
    const newText = e.target.value;
    
    // Set typing flag
    isTypingRef.current = true;
    
    // Clear typing flag after delay
    clearTimeout(window.typingTimeout);
    window.typingTimeout = setTimeout(() => {
      isTypingRef.current = false;
      console.log("Typing stopped, checking for pending updates");
      
      // Apply any pending updates
      if (pendingTextUpdatesRef.current !== null) {
        console.log("Applying pending text update");
        setText(pendingTextUpdatesRef.current);
        setSavedText(pendingTextUpdatesRef.current);
        pendingTextUpdatesRef.current = null;
      }
    }, 500);
    
    // Check if text exceeds maximum length
    if (newText.length > MAX_TEXT_LENGTH) {
      setShowToast(true);
      setToastMessage(`Text too long - maximum ${MAX_TEXT_LENGTH.toLocaleString()} characters allowed`);
      setTimeout(() => setShowToast(false), 3000);
      return; // Don't update the state
    }
    
    if (showDraft) {
      // We're editing the draft
      setDraftText(newText);
      try {
        localStorage.setItem(`clippy-draft-${id}`, newText);
      } catch (error) {
        console.error('Error auto-saving draft to localStorage:', error);
        // Only show error toast if it's a storage-related error, not a quota error
        if (!(error instanceof DOMException && error.name === 'QuotaExceededError')) {
          setShowToast(true);
          setToastMessage('Error saving draft');
          setTimeout(() => setShowToast(false), 3000);
        }
      }
    } else {
      // We're editing the main text
      setText(newText);
      setHasChanges(newText !== savedText);
      setStatus('unsaved');
      
      // Broadcast to all connected peers if WebRTC is connected
      if (isRtcConnected && Object.keys(dataChannelsRef.current).length > 0) {
        console.log(`Broadcasting text change to peers, length: ${newText.length}`);
        broadcastTextToAllPeers(newText);
      } else if (Object.keys(dataChannelsRef.current).length > 0) {
        console.log(`Not broadcasting, WebRTC status: ${isRtcConnected ? 'connected' : 'not connected'}, peers: ${Object.keys(dataChannelsRef.current).length}`);
      }
    }
  };

  const getShareUrl = () => {
    return window.location.origin + window.location.pathname + `#/share/${id}`;
  };
  
  // Function to share via email
  const shareViaEmail = () => {
    const subject = encodeURIComponent('Clippy: Shared Text Session');
    const body = encodeURIComponent(
      `I've shared a text session with you using Clippy.\n\n` +
      `Access it at: ${getShareUrl()}\n\n` +
      `Simply open the link to view and collaborate on the shared text.`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };
  
  // Get a shareable URL with the current text as a seed
  const getSeedUrl = () => {
    // Only encode if there's text to share
    if (text.trim()) {
      const encodedText = encodeTextToBase64(text);
      return window.location.origin + window.location.pathname + `#/share/${id}/seed/${encodedText}`;
    }
    
    // If no text, return regular share URL
    return getShareUrl();
  };
  
  // Function to create a new session with the current text
  const [newSessionId, setNewSessionId] = useState('');
  const [creatingNewSession, setCreatingNewSession] = useState(false);
  
  const createNewSession = async () => {
    if (!text.trim()) return; // Don't create empty sessions
    
    try {
      setCreatingNewSession(true);
      
      // First, get a new ID
      const idResponse = await fetch(`${API_BASE_URL}/share.php`);
      const idData = await idResponse.json();
      
      if (idData.id) {
        // Save the current text to the new ID
        await fetch(`${API_BASE_URL}/share.php?id=${idData.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        
        // Store the new ID for the UI
        setNewSessionId(idData.id);
      }
    } catch (error) {
      console.error('Error creating new session:', error);
    } finally {
      setCreatingNewSession(false);
    }
  };
  
  // Manual check function for the "Check Updates" button
  const manualCheckForUpdates = async () => {
    try {
      
      
      // Add timestamp to URL to prevent caching issues
      const cacheBreaker = new Date().getTime();
      
      // First, fetch the status to check the checksum
      const statusResponse = await fetch(`${API_BASE_URL}/share.php?id=${id}&status=1&t=${cacheBreaker}`);
      const statusData = await statusResponse.json();
      
      // Get current checksum from our ref
      const currentChecksum = currentChecksumRef.current || '';
      
      // Check if content has changed by comparing checksums
      const hasChanged = currentChecksum !== statusData.checksum;
      
      
      
      if (hasChanged) {
        // Only fetch the full content if the status check indicates changes
        const contentResponse = await fetch(`${API_BASE_URL}/share.php?id=${id}&t=${cacheBreaker}`);
        const contentData = await contentResponse.json();
        
        if (contentData.text !== undefined) {
          const newServerText = contentData.text;
          
          // Update the stored checksum
          currentChecksumRef.current = statusData.checksum;
          
          // Check if different from editor text
          const isDifferentFromEditor = newServerText !== text;
          
          // Store the server response
          setServerText(newServerText);
          
          
          
          if (hasChanged && isDifferentFromEditor && newServerText.trim() !== '') {
            if (autoUpdate) {
              // When auto-updating, use the new text directly to avoid race conditions
              setText(newServerText);
              setSavedText(newServerText);
              setLastServerText(newServerText);
              lastServerTextRef.current = newServerText;
              setStatus('updated');
              
              // If user is viewing draft, don't switch views but still notify
              if (showDraft) {
                setToastMessage('Text updated in shared view (you\'re viewing your draft)');
              } else {
                setToastMessage('Text updated automatically and copied to clipboard');
                // Copy the new content to clipboard only if not viewing draft
                navigator.clipboard.writeText(newServerText)
                  .catch(err => console.error('Could not copy text to clipboard:', err));
              }
              
              setShowToast(true);
              setTimeout(() => setShowToast(false), 3000);
            } else {
              setUpdatesAvailable(true);
            }
          } else {
            setUpdatesAvailable(false);
          }
          
          // Update our state
          setLastServerText(newServerText);
          lastServerTextRef.current = newServerText; // Update ref too
          setLastChecked(new Date());
          setContentChecked(true);
          
          
        }
      } else {
        
        setUpdatesAvailable(false);
        setLastChecked(new Date());
        setContentChecked(true);
      }
    } catch (error) {
      console.error('Error in manual check:', error);
    }
  };

  // Function to share new session via email
  const shareNewSessionViaEmail = () => {
    if (!newSessionId) return;
    
    const newSessionUrl = `${window.location.origin}${window.location.pathname}#/share/${newSessionId}`;
    const subject = encodeURIComponent('Clippy: New Text Session');
    const body = encodeURIComponent(
      `I've created a new text session for you using Clippy.\n\n` +
      `Access it at: ${newSessionUrl}\n\n` +
      `Simply open the link to view and collaborate on the shared text.`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

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
        applyUpdates={applyUpdates}
        lastChecked={lastChecked}
        text={text}
        serverText={serverText}
      />
      <TextAreaContainer
        showDraft={showDraft}
        setShowDraft={setShowDraft}
        hasDraft={hasDraft}
        deleteDraft={deleteDraft}
        setText={setText}
        draftText={draftText}
        setHasChanges={setHasChanges}
        savedText={savedText}
        setStatus={setStatus}
        saveDraft={saveDraft}
        text={text}
        handleTextChange={handleTextChange}
        MAX_TEXT_LENGTH={MAX_TEXT_LENGTH}
      />
      
      <ControlsBar
        hasChanges={hasChanges}
        saveText={saveText}
        activeUsers={activeUsers}
        manualCheckForUpdates={manualCheckForUpdates}
        setShowShareModal={setShowShareModal}
        status={status}
        lastSaved={lastSaved}
        rtcSupported={rtcSupported}
        isRtcConnected={isRtcConnected}
        connectedPeers={connectedPeers}
        isPollingPaused={isPollingPaused}
        lastChecked={lastChecked}
        updatesAvailable={updatesAvailable}
      />
      
      <ShareModal
        showShareModal={showShareModal}
        setShowShareModal={setShowShareModal}
        getShareUrl={getShareUrl}
        shareViaEmail={shareViaEmail}
        newSessionId={newSessionId}
        createNewSession={createNewSession}
        creatingNewSession={creatingNewSession}
        text={text}
        shareNewSessionViaEmail={shareNewSessionViaEmail}
        window={window}
      />
      
      <div className="navigation">
        <Link to="/" className="home-link">
          <FontAwesomeIcon icon={faHome} className="button-icon" /> Return to Home
        </Link>
      </div>
  <Footer />
    </div>
  );
}

// Home Component
function Home() {
  const [uniqueId, setUniqueId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const { isDark } = useTheme();

  // Generate a unique ID for a new sharing session
  useEffect(() => {
    const generateId = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`${API_BASE_URL}/share.php`);
        const data = await response.json();
        if (data.id) {
          setUniqueId(data.id);
        }
      } catch (error) {
        console.error('Error generating ID:', error);
      } finally {
        setIsLoading(false);
      }
    };

    generateId();
  }, []);

  return (
    <div className="home-container">
      <div className="app-header">
        <div className="app-title">
          <img src={LOGO_URL} alt="Clippy Logo" className="app-logo" />
          <h1>Welcome to Clippy</h1>
          <ThemeToggle />
        </div>
      </div>
      <p className="app-description">
        Share text between computers securely and easily
      </p>
      
      {isLoading ? (
        <div className="loading">Generating secure session...</div>
      ) : (
        <div className="start-sharing">
          <Link to={`/share/${uniqueId}`} className="start-button">
            <FontAwesomeIcon icon={faPlay} className="button-icon" /> Start New Sharing Session
          </Link>
        </div>
      )}
      
      <div className="app-info">
        <h2>How it works</h2>
        <ul>
          <li>Click the button above to start a new sharing session</li>
          <li>Share the generated URL or scan the QR code with anyone you want to collaborate with</li>
          <li>Type your text and click the "Save" button when you're ready to share it</li>
          <li>You'll be notified when updates are available from other users</li>
          <li>Choose when to apply updates so your typing won't be interrupted</li>
        </ul>
      </div>
  <Footer />
    </div>
  );
}

// Error Component
function ErrorPage() {
  const location = window.location;
  const path = location.hash.substring(1); // Remove the # character
  const shareId = path.match(/\/share\/([^\/]+)/)?.[1]; // Extract ID from path if it exists

  return (
    <div className="error-container">
      <div className="app-header">
        <div className="app-title">
          <img src={LOGO_URL} alt="Clippy Logo" className="app-logo" />
          <h1>Oops!</h1>
          <ThemeToggle />
        </div>
      </div>
      <p>Sorry, an unexpected error has occurred.</p>
      <Link to="/" className="home-link">
        <FontAwesomeIcon icon={faHome} className="button-icon" /> Return to Home
      </Link>
      
      {shareId && (
        <div className="error-help">
          <p>It looks like you're trying to access a shared document with ID: <strong>{shareId}</strong></p>
          <p>Try these links instead:</p>
          <ul>
            <li><a href={`/clippy/#/share/${shareId}`}>Direct Link</a></li>
            <li><a href={`/clippy/index.php?share=${shareId}`}>PHP Link</a></li>
          </ul>
        </div>
      )}
      
      {!shareId && (
        <p className="error-help">
          If you're trying to access a shared document, make sure the URL is in the correct format.
        </p>
      )}
  <Footer />
    </div>
  );
}

// Create router with hash routing
const router = createHashRouter([
  {
    path: '/',
    element: <Home />,
    errorElement: <ErrorPage />,
  },
  {
    path: '/share/:id',
    element: <TextShareApp />,
    errorElement: <ErrorPage />
  },
  {
    // Route that handles a seed parameter in the URL hash
    path: '/share/:id/seed/:seedData',
    element: <TextShareApp />,
    errorElement: <ErrorPage />
  }
]);

// Main App
function App() {
  return (
    <div className="app">
      <RouterProvider router={router} />
    </div>
  );
}

export default App;
