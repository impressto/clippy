// useDraftManager.js - Custom hook to manage draft functionality
import { useState, useCallback, useEffect } from 'react';

/**
 * Custom hook to manage draft text functionality
 * 
 * @param {string} id - Session ID
 * @param {string} text - Current main text
 * @param {function} setText - Function to update main text
 * @param {function} setHasChanges - Function to mark text as changed
 * @param {function} setSavedText - Function to update saved text
 * @param {function} setShowDraft - Function to control draft view
 * @param {Object} userEditingRef - Ref to track user editing state
 * @returns {Object} Draft management state and functions
 */
export const useDraftManager = (id, text, setText, setHasChanges, setSavedText, setShowDraft, userEditingRef) => {
  // Draft state
  const [draftText, setDraftText] = useState('');
  const [hasDraft, setHasDraft] = useState(false);
  const [showDraft, setShowDraftInternal] = useState(false);
  
  // Handle draft text changes
  const handleDraftChange = useCallback((newText) => {
    setDraftText(newText);
    
    // Save draft to localStorage
    if (id) {
      localStorage.setItem(`clippy_draft_${id}`, newText);
    }
  }, [id]);
  
  // Save current text as draft
  const saveDraft = useCallback(() => {
    setDraftText(text);
    setHasDraft(true);
    
    // Save draft to localStorage for persistence
    if (id) {
      localStorage.setItem(`clippy_draft_${id}`, text);
    }
    
    // Show a confirmation message
    alert('Draft saved. You can access it from the "My Draft" tab.');
  }, [text, id]);
  
  // Delete draft
  const deleteDraft = useCallback(() => {
    // Confirm deletion
    if (window.confirm('Are you sure you want to delete your draft?')) {
      setDraftText('');
      setHasDraft(false);
      setShowDraftInternal(false);
      setShowDraft(false);
      
      // Remove from localStorage
      if (id) {
        localStorage.removeItem(`clippy_draft_${id}`);
      }
    }
  }, [id, setShowDraft]);
  
  // Apply draft text to main text
  const applyDraft = useCallback(() => {
    console.log('Applying draft text:', draftText);
    
    if (draftText && draftText.trim().length > 0) {
      console.log('Setting text to draft text');
      
      // Set text to the draft value
      setText(draftText);
      
      // Update other state
      setHasChanges(true);  // Always mark as having changes
      setSavedText(text);   // Store the previous text value
      setShowDraftInternal(false);  // Switch back to main text view
      setShowDraft(false);  
      
      // Update editing state
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
  }, [draftText, text, setText, setHasChanges, setSavedText, setShowDraft, userEditingRef]);
  
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
  
  // Sync internal showDraft state with external
  const toggleShowDraft = useCallback((show) => {
    setShowDraftInternal(show);
    setShowDraft(show);
  }, [setShowDraft]);
  
  return {
    // State
    draftText,
    setDraftText,
    hasDraft,
    showDraft: showDraft,
    
    // Functions
    handleDraftChange,
    saveDraft,
    deleteDraft,
    applyDraft,
    toggleShowDraft
  };
};
