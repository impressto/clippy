import React, { useState, useEffect } from 'react';
import './Toast.css';

/**
 * Toast component displays temporary notifications in the upper right corner of the screen
 * @param {Object} props - Component props
 * @param {string} props.message - Message to display in the toast
 * @param {string} props.type - Type of toast (success, error, info, warning)
 * @param {boolean} props.show - Whether to show the toast
 * @param {Function} props.onClose - Function to call when toast is closed or auto-hidden
 * @param {Function} props.onClick - Function to call when toast is clicked
 * @param {number} props.duration - Duration in milliseconds to show the toast (default: 3000)
 */
const Toast = ({ message, type = 'info', show, onClose, onClick, duration = 3000 }) => {
  // Auto-hide the toast after duration
  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      
      return () => clearTimeout(timer);
    }
  }, [show, duration, onClose]);
  
  if (!show) return null;
  
  return (
    <div className={`toast-container ${type} ${onClick ? 'clickable' : ''}`} onClick={onClick}>
      <div className="toast-message">
        {type === 'info' && <span role="img" aria-label="info">ℹ️ </span>}
        {type === 'success' && <span role="img" aria-label="success">✅ </span>}
        {type === 'warning' && <span role="img" aria-label="warning">⚠️ </span>}
        {type === 'error' && <span role="img" aria-label="error">❌ </span>}
        {message}
        {onClick && <span className="toast-action-hint"> (Click to apply)</span>}
      </div>
      <button 
        className="toast-close" 
        onClick={(e) => {
          e.stopPropagation(); // Prevent triggering onClick of the parent
          onClose();
        }}
      >
        ×
      </button>
    </div>
  );
};

export default Toast;
