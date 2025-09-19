import React from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHome } from '@fortawesome/free-solid-svg-icons';

/**
 * ErrorPage component displays error information when something goes wrong
 * Provides a way for users to navigate back to the home page
 */
const ErrorPage = ({ title, message, error }) => {
  return (
    <div className="error-container">
      <h1>{title || 'Error'}</h1>
      <p>{message || 'An unexpected error occurred.'}</p>
      
      {error && (
        <div className="error-details">
          <pre>{error.toString()}</pre>
          {error.stack && (
            <details>
              <summary>Error Details</summary>
              <pre className="error-stack">{error.stack}</pre>
            </details>
          )}
        </div>
      )}
      
      <div className="error-actions">
        <Link to="/" className="home-link">
          <FontAwesomeIcon icon={faHome} /> Return to Home
        </Link>
      </div>
    </div>
  );
};

export default ErrorPage;
