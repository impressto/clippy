// useTextManager.js - Custom hook to manage text state and operations
import { useState, useRef, useCallback } from 'react';

/**
 * Custom hook to manage text state, changes, typing detection, and polling control
 * 
 * @param {Object} config - Configuration object
 * @param {string} config.id - Session ID
 * @param {string} config.serverText - Current server text
 * @param {number} config.MAX_TEXT_LENGTH - Maximum allowed text length
 * @param {function} config.setIsPollingPausedFromTyping - Function to control polling pause state
 * @param {function} config.handleTypingStart - Function to handle typing start
 * @param {function} config.broadcastTextToAllPeers - Optional function to broadcast text to WebRTC peers
 * @returns {Object} Text management state and functions
 */
export const useTextManager = ({
  id,
  serverText,
  MAX_TEXT_LENGTH,
  setIsPollingPausedFromTyping,
  handleTypingStart,
  broadcastTextToAllPeers
}) => {
  // Text state
  const [text, setText] = useState('');
  const [savedText, setSavedText] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  
  // Refs for tracking user activity
  const userEditingRef = useRef(false);
  const savingTimeoutRef = useRef(null);
  
  /**
   * Handle text changes with typing detection and polling control
   */
  const handleChange = useCallback((e) => {
    const newText = e.target.value;
    
    // Only process if text has actually changed
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
      
      // Broadcast text to WebRTC peers if available
      if (broadcastTextToAllPeers && typeof broadcastTextToAllPeers === 'function') {
        broadcastTextToAllPeers(newText);
      }
      
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
    }
  }, [text, serverText, handleTypingStart, MAX_TEXT_LENGTH, setIsPollingPausedFromTyping, broadcastTextToAllPeers]);
  
  /**
   * Update text state from external source (e.g., server, WebRTC)
   */
  const updateTextFromExternal = useCallback((newText) => {
    setText(newText);
    setSavedText(newText);
    setHasChanges(false);
  }, []);
  
  /**
   * Mark text as saved
   */
  const markAsSaved = useCallback(() => {
    setSavedText(text);
    setHasChanges(false);
    
    // Resume polling after saving
    setIsPollingPausedFromTyping(false);
    console.log('Polling resumed after saving');
  }, [text, setIsPollingPausedFromTyping]);
  
  /**
   * Reset editing state
   */
  const resetEditingState = useCallback(() => {
    userEditingRef.current = false;
    
    // Clear any existing reset timer
    if (window.userEditingResetTimer) {
      clearTimeout(window.userEditingResetTimer);
      window.userEditingResetTimer = null;
    }
  }, []);
  
  // Cleanup function for timers
  const cleanup = useCallback(() => {
    if (window.userEditingResetTimer) {
      clearTimeout(window.userEditingResetTimer);
    }
    if (savingTimeoutRef.current) {
      clearTimeout(savingTimeoutRef.current);
    }
  }, []);
  
  return {
    // State
    text,
    setText,
    savedText,
    setSavedText,
    hasChanges,
    setHasChanges,
    
    // Refs
    userEditingRef,
    
    // Functions
    handleChange,
    updateTextFromExternal,
    markAsSaved,
    resetEditingState,
    cleanup
  };
};
