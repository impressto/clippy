// useTypingDetection.js - Custom hook to manage typing detection
import { useState, useRef, useCallback } from 'react';

/**
 * Custom hook to manage typing detection and indicators
 * 
 * @returns {Object} Typing detection state and functions
 */
export const useTypingDetection = () => {
  // Typing state
  const [isTyping, setIsTyping] = useState(false);
  
  // Refs for timing
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);
  
  /**
   * Handle typing start with timeout management
   */
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
  
  /**
   * Cleanup function for timers
   */
  const cleanup = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  }, []);
  
  return {
    // State
    isTyping,
    isTypingRef,
    
    // Functions
    handleTypingStart,
    cleanup
  };
};
