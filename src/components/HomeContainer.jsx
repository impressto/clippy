import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlay } from '@fortawesome/free-solid-svg-icons';
import ThemeToggle from './ThemeToggle.jsx';
import { useTheme } from '../theme/ThemeContext.jsx';

/**
 * HomeContainer component that displays the application's home page
 * with information about the application and a button to start a new sharing session
 */
const HomeContainer = ({ LOGO_URL, API_BASE_URL }) => {
  const [uniqueId, setUniqueId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const { isDark } = useTheme();

  // Generate a unique ID for a new sharing session
  useEffect(() => {
    const generateId = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`${API_BASE_URL}/share.php`);
        const data = await response.json();
        if (data.id) {
          setUniqueId(data.id);
        }
      } catch (error) {
        console.error('Error generating ID:', error);
      } finally {
        setIsLoading(false);
      }
    };

    generateId();
  }, [API_BASE_URL]);

  return (
    <div className="home-container">
      <p className="app-description">
        Share text between computers securely and easily
      </p>
      
      {isLoading ? (
        <div className="loading">Generating secure session...</div>
      ) : (
        <div className="start-sharing">
          <Link to={`/share/${uniqueId}`} className="start-button">
            <FontAwesomeIcon icon={faPlay} className="button-icon" /> Start New Sharing Session
          </Link>
        </div>
      )}
      
      <div className="app-info">
        <h2>How it works</h2>
        <ul>
          <li>Click the button above to start a new sharing session</li>
          <li>Share the generated URL or scan the QR code with anyone you want to collaborate with</li>
          <li>Type your text and click the "Save" button when you're ready to share it</li>
          <li>You'll be notified when updates are available from other users</li>
          <li>Choose when to apply updates so your typing won't be interrupted</li>
        </ul>
      </div>
    </div>
  );
};

export default HomeContainer;
