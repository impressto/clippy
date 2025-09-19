import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy, faEnvelope, faPlay } from '@fortawesome/free-solid-svg-icons';
import { QRCodeSVG } from 'qrcode.react';

/**
 * ShareModal component displays a modal with sharing options
 * including direct URL sharing, email sharing, and creating new sessions.
 */
const ShareModal = ({
  showShareModal,
  setShowShareModal,
  getShareUrl,
  shareViaEmail,
  newSessionId,
  createNewSession,
  creatingNewSession,
  text,
  shareNewSessionViaEmail,
  window
}) => {
  return (
    showShareModal && (
      <div className="modal-overlay" onClick={() => setShowShareModal(false)}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Share Options</h2>
            <button 
              className="modal-close" 
              onClick={() => setShowShareModal(false)}
            >
              ×
            </button>
          </div>
          <div className="share-info">
            <div className="share-tabs">
              <p>Share this URL with others to collaborate:</p>
              <div className="share-container">
                <div className="share-url">
                  <input
                    type="text"
                    readOnly
                    value={getShareUrl()}
                    onClick={(e) => e.target.select()}
                  />
                </div>
                <div className="share-actions">
                  <button
                    className="share-action-button"
                    onClick={() => {
                      navigator.clipboard.writeText(getShareUrl());
                      alert('URL copied to clipboard!');
                    }}
                  >
                    <FontAwesomeIcon icon={faCopy} className="button-icon" /> Copy Link
                  </button>
                  <button
                    className="share-action-button"
                    onClick={shareViaEmail}
                    title="Share via Email"
                  >
                    <FontAwesomeIcon icon={faEnvelope} className="button-icon" /> Share via Email
                  </button>
                </div>
                <div className="qr-code-container">
                  <div className="qr-code">
                    <QRCodeSVG value={getShareUrl()} size={128} />
                  </div>
                  <p className="qr-code-label">Scan with your phone</p>
                </div>
              </div>
            </div>
            
            <div className="share-new-session">
              <p className="share-seed-heading">Create a new session with current text:</p>
              {!newSessionId ? (
                <button 
                  className="create-new-session-button"
                  onClick={createNewSession}
                  disabled={creatingNewSession || !text.trim()}
                >
                  {creatingNewSession ? (
                    <span>Creating...</span>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faPlay} className="button-icon" /> 
                      Create New Session
                    </>
                  )}
                </button>
              ) : (
                <div className="new-session-created">
                  <p>New session created! Share this URL:</p>
                  <div className="share-container">
                    <div className="share-url">
                      <input
                        type="text"
                        readOnly
                        value={`${window.location.origin}${window.location.pathname}#/share/${newSessionId}`}
                        onClick={(e) => e.target.select()}
                      />
                    </div>
                    <div className="share-actions">
                      <button
                        className="share-action-button"
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#/share/${newSessionId}`);
                          alert('New session URL copied to clipboard!');
                        }}
                      >
                        <FontAwesomeIcon icon={faCopy} className="button-icon" /> Copy Link
                      </button>
                      <button
                        className="share-action-button"
                        onClick={shareNewSessionViaEmail}
                        title="Share via Email"
                      >
                        <FontAwesomeIcon icon={faEnvelope} className="button-icon" /> Share via Email
                      </button>
                    </div>
                  </div>
                  <div className="session-buttons">
                    <a 
                      href={`${window.location.origin}${window.location.pathname}#/share/${newSessionId}`}
                      className="go-to-session-button"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <FontAwesomeIcon icon={faPlay} className="button-icon" /> 
                      Open in New Tab
                    </a>
                    <button 
                      className="reset-session-button"
                      onClick={() => setNewSessionId('')}
                    >
                      Create Another
                    </button>
                  </div>
                </div>
              )}
              <p className="share-seed-description">
                This creates a brand new sharing session containing the current text, separate from this one.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  );
};

export default ShareModal;
