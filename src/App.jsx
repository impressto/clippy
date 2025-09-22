// App.jsx - TextShareApp component
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import './App.css';
import AppHeader from './components/AppHeader.jsx';
import HomeContainer from './components/HomeContainer.jsx';
import TextAreaContainer from './components/TextAreaContainer.jsx';
import ControlsBar from './components/ControlsBar.jsx';
import Footer from './components/Footer.jsx';
import ShareModal from './components/ShareModal.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import Toast from './components/Toast.jsx';
import { useTheme } from './theme/ThemeContext.jsx';
// import { useWebRTCManager } from './utils/WebRTCSocketManager.js'; // TEMPORARILY DISABLED

// Constants
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const LOGO_URL = import.meta.env.VITE_LOGO_URL || '/clippy.png';
const MAX_TEXT_LENGTH = 20000; // Limit text to 20,000 characters (approx. 20KB)
const MAX_STORAGE_SIZE = 4 * 1024 * 1024; // 4MB limit for localStorage

// TextShareApp Component
function TextShareApp() {
  // Get route parameters
  const { id, seedData } = useParams();
  // Helper function to encode text to base64
  const encodeTextToBase64 = (text) => {
    try {
      return btoa(encodeURIComponent(text));
    } catch (e) {
      console.error('Error encoding text to base64:', e);
      return '';
    }
  };
  
  // Helper function to decode base64 to text
  const decodeBase64ToText = (base64) => {
    try {
      return decodeURIComponent(atob(base64));
    } catch (e) {
      console.error('Error decoding base64 to text:', e);
      return '';
    }
  };

  // Theme
  const { isDark } = useTheme();
  const theme = isDark ? 'dark-theme' : 'light-theme';
  
  // Navigation and parameters
  const navigate = useNavigate();
  
  // State for text
  const [text, setText] = useState('');
  const [savedText, setSavedText] = useState('');
  const [serverText, setServerText] = useState('');
  const [lastServerText, setLastServerText] = useState('');
  const [loadedFromServer, setLoadedFromServer] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [isRtcConnected, setIsRtcConnected] = useState(false);
  const [isRtcPollingPaused, setIsRtcPollingPaused] = useState(false);
  const [isServerOnline, setIsServerOnline] = useState(true);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [socketClients, setSocketClients] = useState(0);
  const [isPollingPausedFromTyping, setIsPollingPausedFromTyping] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(() => {
    // Load from localStorage if available
    const saved = localStorage.getItem('autoUpdate');
    return saved !== null ? saved === 'true' : true;
  });
  const [lastChecked, setLastChecked] = useState(null);
  const [updatesAvailable, setUpdatesAvailable] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [showDraft, setShowDraft] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('info');
  
  // Refs
  const textAreaRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);
  const savingTimeoutRef = useRef(null);
  const lastActivityTimeRef = useRef(Date.now());
  const userEditingRef = useRef(false);
  
  // Initialize WebRTC - TEMPORARILY DISABLED to focus on share.php polling
  // const {
  //   rtcSupported,
  //   rtcConnected,
  //   connectionStatus,
  //   activeUsers,
  //   dataChannelStatus,
  //   setDebugMode,
  //   webRtcConnectionStage: rtcStage,
  //   isPollingPaused: rtcPollingPaused,
  //   sendTextToAllPeers,
  //   initiatePeerConnections
  // } = useWebRTCManager(
  //   id,
  //   text,
  //   setText,
  //   setSavedText,
  //   setServerText,
  //   setLastServerText,
  //   setHasChanges,
  //   isTypingRef.current
  // );
  
  // Placeholder values for disabled WebRTC
  const rtcSupported = false;
  const rtcConnected = false;
  const connectionStatus = 'disabled';
  const activeUsers = 1;
  const dataChannelStatus = {};
  const setDebugMode = () => {};
  const rtcStage = 'disabled';
  const rtcPollingPaused = false;
  const sendTextToAllPeers = () => {};
  const initiatePeerConnections = () => {};
  
  // Update our state when WebRTCSocketManager state changes
  useEffect(() => {
    if (rtcConnected !== undefined) {
      setIsRtcConnected(rtcConnected);
    }
  }, [rtcConnected]);
  
  useEffect(() => {
    if (rtcPollingPaused !== undefined) {
      setIsRtcPollingPaused(rtcPollingPaused);
    }
  }, [rtcPollingPaused]);
  
  // Save autoUpdate preference
  useEffect(() => {
    localStorage.setItem('autoUpdate', autoUpdate.toString());
  }, [autoUpdate]);
  
  // Clean up typing detection timer on unmount
  useEffect(() => {
    return () => {
      if (window.userEditingResetTimer) {
        clearTimeout(window.userEditingResetTimer);
      }
      if (savingTimeoutRef.current) {
        clearTimeout(savingTimeoutRef.current);
      }
    };
  }, []);

  // WebRTC Socket Manager handles all WebRTC signaling now - no polling needed

  // Track user activity for auto-save and offline detection
  const updateLastActivityTime = useCallback(() => {
    lastActivityTimeRef.current = Date.now();
    
    // If user is active and WebRTC polling was paused due to inactivity, resume
    if (isRtcPollingPaused) {
      console.log('User activity detected, resuming WebRTC polling');
      setIsRtcPollingPaused(false);
    }
  }, [isRtcPollingPaused]);
  
  // Monitor user activity
  useEffect(() => {
    const handleActivity = () => {
      updateLastActivityTime();
    };
    
    // Add event listeners for user activity
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keypress', handleActivity);
    window.addEventListener('touchstart', handleActivity);
    window.addEventListener('click', handleActivity);
    
    // Set initial activity time
    updateLastActivityTime();
    
    return () => {
      // Clean up event listeners
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keypress', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('click', handleActivity);
    };
  }, [updateLastActivityTime]);
  
  // Handle typing status
  const handleTypingStart = useCallback(() => {
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      setIsTyping(true);
    }
    
    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Set a new timeout
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      setIsTyping(false);
    }, 2000);
  }, []);
  
  // Handle text changes
  const handleChange = useCallback((e) => {
    const newText = e.target.value;
    
    // Check if we're editing the draft or main text
    if (showDraft) {
      // Update draft text
      setDraftText(newText);
      
      // Save draft to localStorage
      if (id) {
        localStorage.setItem(`clippy_draft_${id}`, newText);
      }
      return;
    }
    
    // Only process if main text has actually changed
    if (newText !== text) {
      // Handle typing indicator
      handleTypingStart();
      
      // Enforce max length
      if (newText.length > MAX_TEXT_LENGTH) {
        alert(`Text is too long. Maximum length is ${MAX_TEXT_LENGTH} characters.`);
        return;
      }
      
      // Update text state
      setText(newText);
      setHasChanges(newText !== serverText);
      userEditingRef.current = true;
      
      // Pause polling while typing
      setIsPollingPausedFromTyping(true);
      console.log('Polling paused due to typing - waiting for Save button click');
      
      // Clear any existing auto-save timer
      if (savingTimeoutRef.current) {
        clearTimeout(savingTimeoutRef.current);
      }
      
      // Set up a timer to reset userEditingRef after typing stops
      if (window.userEditingResetTimer) {
        clearTimeout(window.userEditingResetTimer);
      }
      window.userEditingResetTimer = setTimeout(() => {
        userEditingRef.current = false;
        // Do not resume polling here - we'll wait for the Save button click
      }, 3000); // Reset after 3 seconds of no typing
      
      // Remove auto-save functionality - wait for explicit save button click
      // savingTimeoutRef.current = setTimeout(() => {
      //   handleSave();
      // }, 2000);
      
      // WebRTC disabled - no need to broadcast to peers
      // if (rtcConnected) {
      //   sendTextToAllPeers(newText);
      // }
    }
  }, [text, serverText, handleTypingStart, showDraft, setDraftText, id, setIsPollingPausedFromTyping]);
  
  // Handle save operation
  const handleSave = useCallback(async () => {
    // Skip saving if no changes
    if (!hasChanges || !id) return;
    
    // Skip saving if text is too long
    if (text.length > MAX_TEXT_LENGTH) {
      alert(`Text is too long. Maximum length is ${MAX_TEXT_LENGTH} characters.`);
      return;
    }
    
    const tempText = text;
    setSavedText(tempText);
    
    try {
      const headers = new Headers();
      headers.append('Content-Type', 'application/json');
      
      const response = await fetch(`${API_BASE_URL}/share.php?id=${id}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text: tempText })
      });
      
      const data = await response.json();
      
      if (data.status === 'success') {
        setServerText(tempText);
        setLastServerText(tempText);
        setHasChanges(false);
        console.log('Text saved to server');
        
        // Resume polling after saving
        setIsPollingPausedFromTyping(false);
        console.log('Polling resumed after saving');
        
        // Update online status if it was offline
        if (!isServerOnline) {
          setIsServerOnline(true);
        }
        
        // Store in localStorage as backup
        try {
          const key = `clippy_text_${id}`;
          localStorage.setItem(key, encodeTextToBase64(tempText));
          console.log('Text saved to localStorage');
        } catch (e) {
          console.error('Error saving to localStorage:', e);
        }
      } else {
        console.error('Error saving text:', data.message);
      }
    } catch (error) {
      console.error('Error saving text:', error);
      setIsServerOnline(false);
      
      // If the server is offline, still store in localStorage
      try {
        const key = `clippy_text_${id}`;
        localStorage.setItem(key, encodeTextToBase64(tempText));
        console.log('Text saved to localStorage (server offline)');
      } catch (e) {
        console.error('Error saving to localStorage:', e);
      }
    }
  }, [id, text, hasChanges, isServerOnline]);
  
  // Load text from server
  const loadTextFromServer = useCallback(async () => {
    if (!id) {
      console.error('Cannot load text: No session ID provided');
      console.trace('Stack trace for missing ID');
      return;
    }
    
    // Skip loading if polling is paused due to typing
    if (isPollingPausedFromTyping) {
      console.log('Skipping text load from server because polling is paused due to typing');
      return;
    }
    
    try {
      console.log(`Loading text from server for session ${id}`);
      
      const response = await fetch(`${API_BASE_URL}/share.php?id=${id}&track=true`);
      
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }
      
      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        console.error('Error parsing JSON response:', jsonError);
        console.log('Response text:', await response.text());
        throw new Error('Invalid JSON response from server');
      }
      
      // Check if response contains text (even if status is not explicitly 'success')
      if (data && data.text !== undefined) {
        console.log('Text loaded from server');
        
        // Ensure data.text is defined and not null
        const serverText = data.text || '';
        
        // Update server text state
        setServerText(serverText);
        setLastServerText(serverText);
        
        // Only update the text if we haven't loaded yet or user isn't editing
        if (!loadedFromServer) {
          console.log('Auto-applying server text - first load (loadedFromServer:', loadedFromServer, ')');
          setText(serverText);
          setSavedText(serverText);
          setHasChanges(false);
        } else if (serverText !== text) {
          console.log('Server text differs from current text - showing toast');
          console.log('Server text length:', serverText.length, 'Current text length:', text.length);
          console.log('loadedFromServer:', loadedFromServer, 'userEditingRef.current:', userEditingRef.current);
          
          // Update the text area immediately to show the new content
          setText(serverText);
          setSavedText(serverText);
          setHasChanges(false);
          
          // Show toast notification for updates if text has changed
          const serverTextLength = serverText.length;
          const currentTextLength = text.length;
          const diffLength = Math.abs(serverTextLength - currentTextLength);
          const diffPercent = Math.round((diffLength / Math.max(currentTextLength, 1)) * 100);
          
          let updateMessage;
          if (serverTextLength > currentTextLength) {
            updateMessage = `New content added (+${diffLength} chars, ~${diffPercent}%)`;
          } else if (serverTextLength < currentTextLength) {
            updateMessage = `Content updated (${diffLength} chars removed, ~${diffPercent}%)`;
          } else {
            updateMessage = 'Content modified (same length)';
          }
          
          console.log('Toast message:', updateMessage);
          setToastMessage(updateMessage);
          setToastType('info');
          setShowToast(true);
        } else {
          console.log('No action needed - server text matches current text');
        }
        
        // Mark as loaded
        setLoadedFromServer(true);
        
        // Update online status if it was offline
        if (!isServerOnline) {
          setIsServerOnline(true);
        }
        
        // Store in localStorage as backup
        try {
          const key = `clippy_text_${id}`;
          localStorage.setItem(key, encodeTextToBase64(data.text));
        } catch (e) {
          console.error('Error saving to localStorage:', e);
        }
      } else {
        console.error('Error loading text:', data.message);
      }
    } catch (error) {
      console.error('Error loading text from server:', error);
      setIsServerOnline(false);
      
      // Try to get from localStorage as fallback
      try {
        const key = `clippy_text_${id}`;
        const savedText = localStorage.getItem(key);
        
        if (savedText) {
          const decodedText = decodeBase64ToText(savedText);
          console.log('Text loaded from localStorage (server offline)');
          setText(decodedText);
          setSavedText(decodedText);
          setLoadedFromServer(true);
        }
      } catch (e) {
        console.error('Error loading from localStorage:', e);
      }
    }
  }, [id, text, loadedFromServer, isPollingPausedFromTyping]);
  
  // Function to apply server updates
  const applyUpdates = useCallback(() => {
    if (serverText !== text) {
      // If there are unsaved changes, offer to save as draft
      if (hasChanges && userEditingRef.current) {
        const saveAsDraft = window.confirm('You have unsaved changes. Would you like to save them as a draft before loading the updates?');
        
        if (saveAsDraft) {
          // Save current text as draft
          setDraftText(text);
          setHasDraft(true);
          
          // Save to localStorage
          if (id) {
            localStorage.setItem(`clippy_draft_${id}`, text);
          }
        }
      }
      
      console.log('Applying server updates');
      setText(serverText);
      setSavedText(serverText);
      setHasChanges(false);
      setUpdatesAvailable(false);
      // Reset editing state after applying updates
      userEditingRef.current = false;
      
      // Ensure the toast stays visible for at least 1 second
      const minimumVisibleTime = 1000; // 1 second
      
      // Change toast message to indicate updates were applied
      setToastMessage('Updates applied successfully');
      setToastType('success');
      
      // Delay hiding the toast to ensure visibility
      setTimeout(() => {
        setShowToast(false);
      }, minimumVisibleTime);
      
      // Clear any existing reset timer
      if (window.userEditingResetTimer) {
        clearTimeout(window.userEditingResetTimer);
        window.userEditingResetTimer = null;
      }
    }
  }, [serverText, text, hasChanges, userEditingRef, id]);
  
  // Add keyboard event listener for Enter key to apply updates
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Apply updates when Enter key is pressed and updates are available
      if (e.key === 'Enter' && updatesAvailable) {
        applyUpdates();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [updatesAvailable, applyUpdates]);
  
  // Initial load effect
  useEffect(() => {
    console.log('Initial load effect triggered, id:', id);
    if (id) {
      // Initialize text from server
      console.log('Initializing text from server for session:', id);
      loadTextFromServer();
      
      // If there's seed data, use it
      if (seedData && !loadedFromServer) {
        const initialText = seedData || '';
        console.log('Using seed data for initial text');
        setText(initialText);
        setSavedText(initialText);
        setHasChanges(true);
      }
    } else {
      console.log('No session ID available, not loading text');
    }
  }, [id, seedData, loadTextFromServer, loadedFromServer]);
  
  // Set up periodic polling for updates if autoUpdate is enabled
  useEffect(() => {
    // For now, ignore WebRTC connection status and focus on share.php polling
    // TODO: Re-enable WebRTC condition when socket server is running
    // if (!id || isRtcConnected || !autoUpdate || isPollingPausedFromTyping) return;
    if (!id || !autoUpdate || isPollingPausedFromTyping) return;
    
    console.log('Setting up polling, isPollingPausedFromTyping:', isPollingPausedFromTyping, 'isRtcConnected:', isRtcConnected);
    
    const checkInterval = setInterval(() => {
      // Skip polling if typing has been detected since interval started
      if (isPollingPausedFromTyping) {
        console.log('Skipping poll because user is typing');
        return;
      }
      
      loadTextFromServer().then(() => {
        setLastChecked(new Date());
        // Check if there are updates available
        if (serverText && serverText !== text) {
          console.log('Updates available, autoUpdate:', autoUpdate, 'userEditing:', userEditingRef.current);
          setUpdatesAvailable(true);
          
          // If autoUpdate is enabled, apply the updates immediately
          if (autoUpdate && !userEditingRef.current) {
            console.log('Auto-applying updates');
            applyUpdates();
          } else if (autoUpdate && userEditingRef.current) {
            console.log('Not auto-applying updates because user is editing');
          }
        }
      });
    }, 10000); // Check every 10 seconds

    return () => clearInterval(checkInterval);
  }, [id, autoUpdate, loadTextFromServer, serverText, text, applyUpdates, isPollingPausedFromTyping]);
  
  // Handle copy to clipboard
  const handleCopy = useCallback(() => {
    if (!navigator.clipboard) {
      alert('Clipboard API not available in your browser');
      return;
    }
    
    navigator.clipboard.writeText(text)
      .then(() => {
        console.log('Text copied to clipboard');
        
        // Flash the UI to indicate success
        const textAreaContainer = document.querySelector('.text-area-container');
        if (textAreaContainer) {
          textAreaContainer.classList.add('copied');
          setTimeout(() => {
            textAreaContainer.classList.remove('copied');
          }, 200);
        }
      })
      .catch(err => {
        console.error('Error copying text to clipboard:', err);
        alert('Failed to copy text to clipboard');
      });
  }, [text]);
  
  // Handle share button click
  const handleShare = useCallback(() => {
    setShowModal(true);
  }, []);
  
  // Handle modal close
  const handleCloseModal = useCallback(() => {
    setShowModal(false);
  }, []);
  
  // Create a new document
  const handleNew = useCallback(() => {
    // Generate a new ID and navigate to it
    const newId = Math.random().toString(16).substring(2, 18);
    navigate(`/${newId}`);
    
    // Reset state
    setText('');
    setSavedText('');
    setServerText('');
    setLastServerText('');
    setHasChanges(false);
    setLoadedFromServer(false);
  }, [navigate]);
  
  // Draft management functions
  const saveDraft = useCallback(() => {
    // Save current text as draft
    setDraftText(text);
    setHasDraft(true);
    
    // Save draft to localStorage for persistence
    if (id) {
      localStorage.setItem(`clippy_draft_${id}`, text);
    }
    
    // Show a confirmation message
    alert('Draft saved. You can access it from the "My Draft" tab.');
  }, [text, id]);
  
  const deleteDraft = useCallback(() => {
    // Confirm deletion
    if (window.confirm('Are you sure you want to delete your draft?')) {
      setDraftText('');
      setHasDraft(false);
      setShowDraft(false);
      
      // Remove from localStorage
      if (id) {
        localStorage.removeItem(`clippy_draft_${id}`);
      }
    }
  }, [id]);
  
  // Function to apply draft text to main text
  const applyDraft = useCallback(() => {
    console.log('Applying draft text:', draftText);
    
    if (draftText && draftText.trim().length > 0) {
      console.log('Setting text to draft text');
      
      // Need to explicitly set text to the draft value
      setText(draftText);
      
      // Update other state
      setHasChanges(true);  // Always mark as having changes
      setSavedText(text);   // Store the previous text value
      setShowDraft(false);  // Switch back to main text view
      
      // Also update editing state
      userEditingRef.current = true;
      
      // Reset editing timer
      if (window.userEditingResetTimer) {
        clearTimeout(window.userEditingResetTimer);
      }
      window.userEditingResetTimer = setTimeout(() => {
        userEditingRef.current = false;
      }, 3000);
      
      console.log('Draft text applied to main text area');
    } else {
      console.log('Cannot apply draft: empty or undefined');
    }
  }, [draftText, text, setText, setHasChanges, setSavedText, setShowDraft]);
  
  // Load draft from localStorage on initial load
  useEffect(() => {
    if (id) {
      const savedDraft = localStorage.getItem(`clippy_draft_${id}`);
      if (savedDraft) {
        setDraftText(savedDraft);
        setHasDraft(true);
      }
    }
  }, [id]);
  
  // Calculate stats
  const wordCount = text && text.trim() ? text.trim().split(/\s+/).length : 0;
  const charCount = text ? text.length : 0;
  
  // Assemble WebRTC status message
  const getWebRTCStatusMessage = useCallback(() => {
    if (!rtcSupported) {
      return 'WebRTC not supported';
    }
    
    if (rtcConnected) {
      const otherClients = activeUsers - 1;
      const clientLabel = otherClients === 1 ? 'client' : 'clients';
      return `Connected via WebRTC\n(${otherClients} other ${clientLabel})`;
    }
    
    if (rtcStage === 'connecting') {
      return 'WebRTC connecting...';
    }
    
    if (rtcStage === 'discovering') {
      return 'Looking for peers...';
    }
    
    if (rtcStage === 'failed') {
      return 'WebRTC connection failed';
    }
    
    return 'WebRTC ready';
  }, [rtcSupported, rtcConnected, rtcStage, activeUsers]);
  
  // Enable WebRTC Debug
  const handleDebugWebRTC = useCallback(() => {
    // Use WebRTCSocketManager's built-in debug functionality
    setDebugMode(true);
    console.log('WebRTC debug mode enabled');
  }, [setDebugMode]);
  
  // Handle Debug Log Submit
  const handleSubmitDebugLogs = useCallback(() => {
    // Log connection status to console
    console.log('WebRTC debug information:', {
      connectionStatus,
      activeUsers,
      rtcSupported,
      rtcConnected,
      webRtcConnectionStage: rtcStage,
      dataChannelStatus
    });
    alert('Debug information has been logged to the console');
  }, [connectionStatus, activeUsers, rtcSupported, rtcConnected, rtcStage, dataChannelStatus]);
  
  // Handle toast close
  const handleToastClose = useCallback(() => {
    setShowToast(false);
  }, []);
  
  // Handle toast click
  const handleToastClick = useCallback(() => {
    const clickTime = Date.now();
    
    // Apply updates immediately
    applyUpdates();
    
    // Ensure the toast stays visible for at least 1 second
    const timeElapsed = Date.now() - clickTime;
    const minimumVisibleTime = 1000; // 1 second
    
    if (timeElapsed < minimumVisibleTime) {
      // Keep toast visible temporarily
      setTimeout(() => {
        setShowToast(false);
      }, minimumVisibleTime - timeElapsed);
    } else {
      setShowToast(false);
    }
  }, [applyUpdates]);
  
  // Handle test toast (for testing purposes)
  const handleTestToast = useCallback(() => {
    const testMessages = [
      'New content added (+15 chars, ~5%)',
      'Content updated (8 chars removed, ~3%)',
      'Content modified (same length)',
      'Test toast notification - Click to dismiss',
      'This is a longer test message to see how the toast handles more text content in the notification area'
    ];
    
    const randomMessage = testMessages[Math.floor(Math.random() * testMessages.length)];
    const randomType = Math.random() > 0.5 ? 'info' : 'success';
    
    setToastMessage(randomMessage);
    setToastType(randomType);
    setShowToast(true);
    
    console.log('Test toast triggered:', randomMessage);
  }, []);
  
  // Render
  return (
    <div className={`app-container ${theme}`}>
      {!id ? (
        // Home/Landing page - no session ID
        <div className="landing-page">
          <div className="app-header landing-header-centered">
            <div className="app-title">
              <img src={LOGO_URL} alt="Clippy Logo" className="app-logo" />
              <h1>Clippy</h1>
              <ThemeToggle />
            </div>
          </div>
          <HomeContainer onNewClick={handleNew} API_BASE_URL={API_BASE_URL} LOGO_URL={LOGO_URL} />
          <Footer />
        </div>
      ) : (
        // App with session ID
        <>
          <AppHeader
            LOGO_URL={LOGO_URL}
            onNew={handleNew}
            showRTCStatus={true}
            rtcStatus={getWebRTCStatusMessage()}
            rtcConnected={isRtcConnected}
            rtcStage={rtcStage}
            onDebugWebRTC={handleDebugWebRTC}
            onSubmitDebugLogs={handleSubmitDebugLogs}
            autoUpdate={autoUpdate}
            setAutoUpdate={setAutoUpdate}
            updatesAvailable={updatesAvailable}
            applyUpdates={applyUpdates}
            lastChecked={lastChecked}
            text={text}
            serverText={serverText}
            isRtcConnected={isRtcConnected}
            onTestToast={handleTestToast}
          />
          
          <TextAreaContainer
            text={text}
            handleTextChange={handleChange}
            textAreaRef={textAreaRef}
            rtcStatus={rtcStage}
            isTyping={isTyping}
            draftText={draftText}
            showDraft={showDraft}
            setShowDraft={setShowDraft}
            hasDraft={hasDraft}
            deleteDraft={deleteDraft}
            setText={setText}
            setHasChanges={setHasChanges}
            savedText={savedText}
            setStatus={(status) => setHasChanges(status === 'unsaved')}
            saveDraft={saveDraft}
            applyDraft={applyDraft}
            MAX_TEXT_LENGTH={MAX_TEXT_LENGTH}
          />
          
          <ControlsBar
            hasChanges={hasChanges}
            saveText={handleSave}
            isServerOnline={isServerOnline}
            isRtcConnected={isRtcConnected}
            wordCount={wordCount}
            charCount={charCount}
            onSave={handleSave}
            onCopy={handleCopy}
            onShare={handleShare}
            onRefresh={() => {
              // If typing is happening, we'll save first then load from server
              if (isPollingPausedFromTyping && hasChanges) {
                handleSave();
              }
              loadTextFromServer();
            }}
            showRTCControls={rtcSupported}
            rtcPollingPaused={isRtcPollingPaused}
            rtcStage={rtcStage}
            webRtcConnectionStage={rtcStage}
            activeUsers={activeUsers}
            connectedPeers={Object.keys(dataChannelStatus || {})}
            setShowShareModal={setShowModal}
            isPollingPaused={isRtcPollingPaused || isPollingPausedFromTyping}
            status={hasChanges ? "unsaved" : "saved"}
          />
          
          <Footer />
          
          {showModal && (
            <ShareModal
              id={id}
              onClose={handleCloseModal}
              rtcSupported={rtcSupported}
              rtcConnected={isRtcConnected}
            />
          )}
          
          {/* Toast notification for updates */}
          <Toast 
            message={toastMessage}
            type={toastType}
            show={showToast}
            onClose={handleToastClose}
            onClick={handleToastClick}
            duration={5000}
          />
        </>
      )}
    </div>
  );
}

export default TextShareApp;
