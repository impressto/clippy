import React, { useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy } from '@fortawesome/free-solid-svg-icons';

/**
 * TextAreaContainer component displays the main text editing area
 * including tabs for shared text and draft, textarea, and character count.
 */
const TextAreaContainer = ({
  showDraft,
  setShowDraft,
  hasDraft,
  deleteDraft,
  setText,
  draftText,
  setHasChanges,
  savedText,
  setStatus,
  saveDraft,
  applyDraft,
  text,
  handleTextChange,
  handleDraftChange,
  MAX_TEXT_LENGTH
}) => {
  // Log when props change
  useEffect(() => {
    console.log('TextAreaContainer: text prop changed:', text);
  }, [text]);
  
  useEffect(() => {
    console.log('TextAreaContainer: showDraft changed:', showDraft);
  }, [showDraft]);
  
  useEffect(() => {
    console.log('TextAreaContainer: draftText changed:', draftText);
  }, [draftText]);
  
  const handleUseDraft = () => {
    console.log('Use Draft button clicked');
    if (typeof applyDraft === 'function') {
      applyDraft();
    } else {
      console.error('applyDraft is not a function:', applyDraft);
    }
  };
  
  // Handle text changes based on current mode (main text vs draft)
  const handleChange = (e) => {
    if (showDraft) {
      // Handle draft text changes
      if (handleDraftChange) {
        handleDraftChange(e.target.value);
      }
    } else {
      // Handle main text changes
      handleTextChange(e);
    }
  };
  
  return (
    <div className="text-area-container">
      <div className="text-tabs">
        <button 
          className={`text-tab ${!showDraft ? 'active-tab' : ''}`} 
          onClick={() => setShowDraft(false)}
        >
          Shared Text
        </button>
        <button 
          className={`text-tab ${showDraft ? 'active-tab' : ''}`} 
          onClick={() => setShowDraft(true)}
          disabled={!hasDraft}
        >
          My Draft
        </button>
        {showDraft ? (
          <div className="draft-actions">
            <button 
              className="draft-action-button draft-delete" 
              onClick={deleteDraft}
              title="Delete draft"
            >
              Delete Draft
            </button>
            <button 
              className="draft-action-button draft-use" 
              onClick={handleUseDraft}
              title="Use draft as main text"
            >
              Use Draft
            </button>
          </div>
        ) : (
          <div className="draft-actions">
            <button 
              className="draft-action-button draft-save" 
              onClick={saveDraft}
              title="Save current text as draft"
            >
              Save as Draft
            </button>
          </div>
        )}
      </div>
      <textarea 
        value={showDraft ? draftText : text} 
        onChange={handleChange}
        className="share-textarea"
        placeholder={showDraft ? "Your private draft text..." : "Start typing here..."}
        maxLength={MAX_TEXT_LENGTH}
      />
      <div className="textarea-footer">
        <span className="character-count">
          {(showDraft ? (draftText?.length || 0) : (text?.length || 0)).toLocaleString()} / {MAX_TEXT_LENGTH.toLocaleString()} characters
        </span>
      </div>
      <button 
        className="copy-textarea-button" 
        onClick={() => {
          navigator.clipboard.writeText(text);
          // Use a more subtle notification instead of an alert
          const originalTitle = document.title;
          document.title = "✓ Copied!";
          setTimeout(() => {
            document.title = originalTitle;
          }, 1500);
        }}
        title="Copy text to clipboard"
      >
        <FontAwesomeIcon icon={faCopy} />
      </button>
    </div>
  );
};

export default TextAreaContainer;
