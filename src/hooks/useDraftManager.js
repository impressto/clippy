// useDraftManager.js - Custom hook to manage draft text functionality
import { useState, useCallback } from 'react';

/**
 * Custom hook to manage draft text functionality and localStorage persistence
 * 
 * @param {Object} config - Configuration object
 * @param {string} config.id - Session ID for the draft storage key
 * @param {string} config.text - Current text value
 * @param {function} config.setText - Function to update text value
 * @param {function} config.setSavedText - Function to update saved text value
 * @param {function} config.setHasChanges - Function to update hasChanges state
 * @param {number} config.MAX_STORAGE_SIZE - Maximum storage size limit
 * @returns {Object} Draft management state and functions
 */
export const useDraftManager = ({
  id,
  text,
  setText,
  setSavedText,
  setHasChanges,
  MAX_STORAGE_SIZE
}) => {
  // State for draft functionality
  const [draftText, setDraftText] = useState('');
  const [hasDraft, setHasDraft] = useState(false);
  
  // Generate draft storage key
  const getDraftKey = useCallback(() => {
    return `draft_${id}`;
  }, [id]);
  
  // Handle draft text changes
  const handleDraftChange = useCallback((value) => {
    setDraftText(value);
  }, []);
  
  // Save draft to localStorage
  const saveDraft = useCallback(() => {
    if (!id || !draftText.trim()) return;
    
    try {
      // Check storage size
      const draftData = JSON.stringify({ text: draftText, timestamp: Date.now() });
      if (draftData.length > MAX_STORAGE_SIZE) {
        console.warn('Draft too large for localStorage');
        return;
      }
      
      localStorage.setItem(getDraftKey(), draftData);
      setHasDraft(true);
      console.log('Draft saved to localStorage');
    } catch (error) {
      console.error('Error saving draft:', error);
    }
  }, [id, draftText, getDraftKey, MAX_STORAGE_SIZE]);
  
  // Delete draft from localStorage
  const deleteDraft = useCallback(() => {
    if (!id) return;
    
    try {
      localStorage.removeItem(getDraftKey());
      setDraftText('');
      setHasDraft(false);
      console.log('Draft deleted from localStorage');
    } catch (error) {
      console.error('Error deleting draft:', error);
    }
  }, [id, getDraftKey]);
  
  // Apply draft to current text
  const applyDraft = useCallback(() => {
    if (!draftText.trim()) return;
    
    setText(draftText);
    setSavedText(draftText);
    setHasChanges(false);
    
    // Clear the draft after applying
    deleteDraft();
    
    console.log('Draft applied to current text');
  }, [draftText, setText, setSavedText, setHasChanges, deleteDraft]);
  
  // Load draft from localStorage on mount
  const loadDraft = useCallback(() => {
    if (!id) return;
    
    try {
      const draftKey = getDraftKey();
      const savedDraft = localStorage.getItem(draftKey);
      
      if (savedDraft) {
        const draftData = JSON.parse(savedDraft);
        setDraftText(draftData.text || '');
        setHasDraft(true);
        console.log('Draft loaded from localStorage');
      } else {
        setHasDraft(false);
      }
    } catch (error) {
      console.error('Error loading draft:', error);
      setHasDraft(false);
    }
  }, [id, getDraftKey]);
  
  return {
    draftText,
    setDraftText,
    hasDraft,
    setHasDraft,
    handleDraftChange,
    saveDraft,
    deleteDraft,
    applyDraft,
    loadDraft
  };
};
