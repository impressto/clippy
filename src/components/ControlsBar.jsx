import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave, faSync, faShare, faUsers } from '@fortawesome/free-solid-svg-icons';

/**
 * ControlsBar component displays the main control buttons and status information
 * including save button, check updates button, share button, and WebRTC connection status.
 */
const ControlsBar = ({
  hasChanges,
  saveText,
  activeUsers,
  manualCheckForUpdates,
  setShowShareModal,
  status,
  lastSaved,
  rtcSupported,
  isRtcConnected,
  connectedPeers,
  isPollingPaused,
  lastChecked,
  updatesAvailable
}) => {
  return (
    <div className="controls-bar">
      <div className="button-group">
        <button 
          className={`save-button ${hasChanges ? 'has-changes' : ''}`} 
          onClick={saveText}
          disabled={!hasChanges}
          title={activeUsers > 1 ? "Save the current state to the server permanently" : "Save your changes to the server"}
        >
          <FontAwesomeIcon icon={faSave} className="button-icon" /> 
          {activeUsers > 1 ? "Save Permanently" : "Save Changes"}
        </button>
        
        {!isRtcConnected && (
          <button 
            className="check-updates-button"
            onClick={manualCheckForUpdates}
            title="Check for updates now"
          >
            <FontAwesomeIcon icon={faSync} className="button-icon" /> Check Updates
          </button>
        )}
        
        <button 
          className="share-toggle-button"
          onClick={() => setShowShareModal(true)}
        >
          <FontAwesomeIcon icon={faShare} className="button-icon" /> Share
        </button>
      </div>
      
      <div className="status">
        {status === 'saved' ? (
          <>
            <span className="status-saved">✓ Saved</span>
            {lastSaved && <span className="last-saved"> at {lastSaved.toLocaleTimeString()}</span>}
          </>
        ) : status === 'saving' ? (
          <span className="status-saving">Saving...</span>
        ) : status === 'error' ? (
          <span className="status-error">Error saving!</span>
        ) : status === 'updated' ? (
          <span className="status-updated">✓ Updates applied</span>
        ) : hasChanges ? (
          <span className="status-unsaved">Unsaved changes</span>
        ) : (
          <span className="status-idle">No changes</span>
        )}
        
        {rtcSupported && isRtcConnected && (
          <span className="rtc-status">· <span className="rtc-connected">⚡ WebRTC connected</span> <FontAwesomeIcon icon={faUsers} /> ({connectedPeers.length} other client{connectedPeers.length !== 1 ? 's' : ''}){isPollingPaused && <span className="polling-paused"> · Server polling paused</span>}</span>
        )}
        {rtcSupported && activeUsers > 1 && !isRtcConnected && (
          <span className="rtc-status">· <span className="rtc-connecting">⏳ Connecting WebRTC...</span></span>
        )}
        {lastChecked && (
          <span className="last-checked"> · Last checked: {lastChecked.toLocaleTimeString()}{!updatesAvailable && ' (no updates)'}</span>
        )}
      </div>
    </div>
  );
};

export default ControlsBar;
