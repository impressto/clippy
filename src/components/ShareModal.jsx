import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy, faEnvelope } from '@fortawesome/free-solid-svg-icons';
import { QRCodeSVG } from 'qrcode.react';

/**
 * ShareModal component displays a modal with sharing options
 * including direct URL sharing, email sharing, and WebRTC status.
 */
const ShareModal = ({
  id,
  onClose,
  rtcSupported,
  rtcConnected
}) => {
  // Generate share URL based on the current window location and session ID
  const getShareUrl = () => {
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}#/share/${id}`;
  };
  
  // Share via email function
  const shareViaEmail = () => {
    const subject = encodeURIComponent("Join my Clippy sharing session");
    const body = encodeURIComponent(`I'm sharing text with you using Clippy. Click this link to join: ${getShareUrl()}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Share Options</h2>
          <button 
            className="modal-close" 
            onClick={onClose}
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
          
          {rtcSupported && (
            <div className="webrtc-status">
              <p>
                <strong>WebRTC Status:</strong> {rtcConnected ? 'Connected' : 'Not Connected'}
              </p>
              <p className="webrtc-info">
                WebRTC enables real-time collaboration without server delays.
              </p>
            </div>
          )}
          <p className="share-info-note">
            Anyone with this link can view and edit this shared text.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ShareModal;
