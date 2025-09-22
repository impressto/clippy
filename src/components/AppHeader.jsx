import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSync, faFlask } from '@fortawesome/free-solid-svg-icons';
import ThemeToggle from './ThemeToggle';

/**
 * AppHeader component displays the main header of the application
 * including the app title, auto-update checkbox, and update status.
 */
const AppHeader = ({ 
  LOGO_URL, 
  autoUpdate = false, 
  setAutoUpdate = () => {}, 
  updatesAvailable = false, 
  applyUpdates = () => {}, 
  lastChecked = null, 
  text = '', 
  serverText = '',
  isRtcConnected = true,
  isWebRTCActive = false // Hide polling-related UI when WebRTC is connecting/connected
}) => {
  return (
    <div className="app-header">
      <div className="app-title">
        <img src={LOGO_URL} alt="Clippy Logo" className="app-logo" />
        <h1>Clippy</h1>
        <ThemeToggle />
      </div>
      
      {!isWebRTCActive && (
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginRight: '0.75rem' }}>
            <input 
              type="checkbox" 
              checked={autoUpdate || false} 
              onChange={e => typeof setAutoUpdate === 'function' && setAutoUpdate(e.target.checked)} 
            />
            <span style={{ fontSize: '0.85rem' }}>Auto-load updates</span>
          </label>
        
          {updatesAvailable ? (
          <div className="header-updates">
            <span>New updates available!</span>
            <span style={{ fontStyle: 'italic', opacity: 0.9 }}>Press Enter to load</span>
            <button 
              className="refresh-button"
              onClick={applyUpdates}
            >
              <FontAwesomeIcon icon={faSync} className="button-icon" /> Load
            </button>
            {lastChecked && (
              <span className="last-checked">
                · {lastChecked.toLocaleTimeString()}
              </span>
            )}
          </div>
        ) : lastChecked && (
          <div className="header-status">
            <span>
              No updates
              {import.meta.env.DEV && (
                <small style={{ fontSize: '0.8em', marginLeft: '0.5em', opacity: 0.7 }}>
                  ({text.length}/{serverText.length})
                </small>
              )}
              <span className="last-checked">
                · {lastChecked.toLocaleTimeString()}
              </span>
            </span>
          </div>
        )}
      </div>
      )}
    </div>
  );
};

export default AppHeader;
