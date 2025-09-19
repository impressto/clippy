import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave, faSync, faShare, faUsers, faUserPlus, faUserMinus } from '@fortawesome/free-solid-svg-icons';

/**
 * ControlsBar component displays the main control buttons and status information
 * including save button, check updates button, share button, connect to peers button,
 * and WebRTC connection status.
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
  updatesAvailable,
  webRtcConnectionStage,
  startPeerSearch,
  disconnectPeers,
  peerDiscoveryEnabled
}) => {
  // Function to get WebRTC status message based on the connection stage
  const getRtcStatusMessage = () => {
    switch(webRtcConnectionStage) {
      case 'initializing':
        return '⏳ Initializing WebRTC...';
      case 'discovering':
        return '🔍 Discovering peers...';
      case 'connecting':
        return '⏳ Establishing WebRTC connection...';
      case 'partially-connected':
        return '⚡ Partially connected';
      case 'fully-connected':
        return '⚡ WebRTC connected';
      case 'failed':
        return '❌ WebRTC connection failed';
      case 'waiting':
        return '⏸ Waiting for peers';
      default:
        return '⏳ Connecting WebRTC...';
    }
  };

  // Function to get the CSS class for the WebRTC status
  const getRtcStatusClass = () => {
    if (webRtcConnectionStage === 'fully-connected' || webRtcConnectionStage === 'partially-connected') {
      return 'rtc-connected';
    } else if (webRtcConnectionStage === 'failed') {
      return 'rtc-failed';
    } else {
      return 'rtc-connecting';
    }
  };
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
        
        {rtcSupported && (
          <button 
            className={`peer-connection-button ${peerDiscoveryEnabled ? 'discovery-enabled' : ''}`}
            onClick={peerDiscoveryEnabled ? disconnectPeers : startPeerSearch}
            title={peerDiscoveryEnabled ? "Disconnect from peers" : "Connect to peers for real-time collaboration"}
          >
            <FontAwesomeIcon icon={peerDiscoveryEnabled ? faUserMinus : faUserPlus} className="button-icon" /> 
            {peerDiscoveryEnabled ? "Disconnect Peers" : "Connect to Peers"}
          </button>
        )}
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
          <span className="rtc-status">· <span className={getRtcStatusClass()}>{getRtcStatusMessage()}</span> <FontAwesomeIcon icon={faUsers} /> ({connectedPeers.length} other client{connectedPeers.length !== 1 ? 's' : ''}){isPollingPaused && <span className="polling-paused"> · Server polling paused</span>}</span>
        )}
        {rtcSupported && activeUsers > 1 && !isRtcConnected && (
          <span className="rtc-status">· <span className={getRtcStatusClass()}>{getRtcStatusMessage()}</span></span>
        )}
        {lastChecked && !isRtcConnected && (
          <span className="last-checked"> · Last checked: {lastChecked.toLocaleTimeString()}{!updatesAvailable && ' (no updates)'}</span>
        )}
      </div>
    </div>
  );
};

export default ControlsBar;
