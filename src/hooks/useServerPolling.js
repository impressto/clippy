// useServerPolling.js - Custom hook to manage server polling for updates
import { useEffect, useCallback } from 'react';

/**
 * Custom hook to manage periodic server polling for text updates
 * 
 * @param {Object} config - Configuration object
 * @param {string} config.id - Session ID
 * @param {boolean} config.autoUpdate - Whether auto-update is enabled
 * @param {boolean} config.isPollingPausedFromTyping - Whether polling is paused due to typing
 * @param {function} config.loadTextFromServer - Function to load text from server
 * @param {string} config.serverText - Current server text
 * @param {string} config.text - Current local text
 * @param {function} config.applyUpdates - Function to apply server updates
 * @param {function} config.setLastChecked - Function to update last checked timestamp
 * @param {function} config.setUpdatesAvailable - Function to set updates available state
 * @param {Object} config.userEditingRef - Ref to track if user is editing
 * @param {number} config.pollingInterval - Polling interval in milliseconds (default: 10000)
 * @returns {void}
 */
export const useServerPolling = ({
  id,
  autoUpdate,
  isPollingPausedFromTyping,
  loadTextFromServer,
  serverText,
  text,
  applyUpdates,
  setLastChecked,
  setUpdatesAvailable,
  userEditingRef,
  pollingInterval = 10000 // Default to 10 seconds
}) => {
  
  // Set up periodic polling for updates if autoUpdate is enabled
  useEffect(() => {
    // Don't poll if required conditions aren't met
    if (!id || !autoUpdate || isPollingPausedFromTyping) {
      console.log('Polling disabled:', {
        hasId: !!id,
        autoUpdate,
        isPollingPausedFromTyping
      });
      return;
    }
    
    console.log('Setting up server polling:', {
      id,
      autoUpdate,
      isPollingPausedFromTyping,
      pollingInterval
    });
    
    const checkInterval = setInterval(() => {
      // Skip polling if typing has been detected since interval started
      if (isPollingPausedFromTyping) {
        console.log('Skipping poll because user is typing');
        return;
      }
      
      console.log('Executing polling check...');
      
      loadTextFromServer().then(() => {
        setLastChecked(new Date());
        
        // Check if there are updates available
        if (serverText && serverText !== text) {
          console.log('Updates available:', {
            autoUpdate,
            userEditing: userEditingRef.current,
            serverTextLength: serverText.length,
            localTextLength: text.length
          });
          
          setUpdatesAvailable(true);
          
          // If autoUpdate is enabled, apply the updates immediately
          if (autoUpdate && !userEditingRef.current) {
            console.log('Auto-applying updates');
            applyUpdates();
          } else if (autoUpdate && userEditingRef.current) {
            console.log('Not auto-applying updates because user is editing');
          }
        } else {
          console.log('No updates needed - server and local text match');
        }
      }).catch((error) => {
        console.error('Error during polling check:', error);
      });
    }, pollingInterval);
    
    console.log(`Polling interval set up with ${pollingInterval}ms interval`);
    
    // Cleanup function
    return () => {
      console.log('Cleaning up polling interval');
      clearInterval(checkInterval);
    };
  }, [
    id,
    autoUpdate,
    isPollingPausedFromTyping,
    loadTextFromServer,
    serverText,
    text,
    applyUpdates,
    setLastChecked,
    setUpdatesAvailable,
    userEditingRef,
    pollingInterval
  ]);
};
