import { useState, useEffect, useRef } from 'react';
import { createHashRouter, RouterProvider, Link, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSave, 
  faSync, 
  faShare, 
  faEye, 
  faEyeSlash, 
  faCopy, 
  faPlay, 
  faHome,
  faEnvelope
} from '@fortawesome/free-solid-svg-icons';
import './App.css';
import ThemeToggle from './components/ThemeToggle.jsx';
import { useTheme } from './theme/ThemeContext.jsx';
import Footer from './components/Footer.jsx';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const LOGO_URL = import.meta.env.VITE_LOGO_URL || '/clippy.png';

// TextShareApp Component
function TextShareApp() {
  // Helper function to encode text to base64
  const encodeTextToBase64 = (text) => {
    try {
      return btoa(encodeURIComponent(text));
    } catch (e) {
      console.error('Error encoding text to base64:', e);
      return '';
    }
  };
  
  // Helper function to decode base64 text
  const decodeTextFromBase64 = (encoded) => {
    try {
      return decodeURIComponent(atob(encoded));
    } catch (e) {
      console.error('Error decoding base64 text:', e);
      return '';
    }
  };

  const { id, seedData } = useParams(); // Get id and seedData from URL parameter with hash routing
  
  // Decode the seed text if it exists from path parameter
  const seedText = seedData ? decodeTextFromBase64(seedData) : '';
  
  const [text, setText] = useState('');
  const [savedText, setSavedText] = useState('');
  const [serverText, setServerText] = useState('');
  const [lastServerText, setLastServerText] = useState(''); // Store the last received server text for comparison
  const [status, setStatus] = useState('idle');
  const [lastSaved, setLastSaved] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [updatesAvailable, setUpdatesAvailable] = useState(false);
  const [lastChecked, setLastChecked] = useState(new Date()); // Initialize with current date
  const [contentChecked, setContentChecked] = useState(true); // Start with contentChecked true
  const [showShareOptions, setShowShareOptions] = useState(false); // Hide share options by default
  const [showShareModal, setShowShareModal] = useState(false); // For the share modal
  const [isInitialized, setIsInitialized] = useState(false); // Track if we've initialized with seed text
  // Remove local theme state in favor of context
  const { isDark } = useTheme();
  
  // Use a ref to store the lastServerText that persists across renders
  // This will be shared between all our functions
  const lastServerTextRef = useRef('');
  
  // Create a ref for the current checksum
  const currentChecksumRef = useRef('');

  // Helper function for deep text comparison
  const areTextsEqual = (a, b) => {
    // Normalize both strings (trim whitespace, normalize line endings)
    const normalizeText = (text) => text.trim().replace(/\r\n/g, '\n');
    return normalizeText(a) === normalizeText(b);
  };

  // This function is replaced with a more stable version in the useEffect
  // It's still used for manual "Check Updates" button clicks
  const checkForUpdates = async () => {
    try {
      
      
      // Add timestamp to URL to prevent caching issues
      const cacheBreaker = new Date().getTime();
      const response = await fetch(`${API_BASE_URL}/share.php?id=${id}&t=${cacheBreaker}`);
      const data = await response.json();
      
      if (data.text !== undefined) {
        const newServerText = data.text;
        
        // Direct string comparison for determining changes
        const hasChanged = newServerText !== lastServerText;
        const isDifferentFromEditor = newServerText !== text;
        
        // Store the server response
        setServerText(newServerText);
        
        // Debug information to help diagnose comparison issues
        
        
        // ONLY show updates when:
        // 1. The text from server is different from our last known server state AND
        // 2. It's different from what's currently in the editor AND
        // 3. It's not empty
        if (hasChanged && isDifferentFromEditor && newServerText.trim() !== '') {
          setUpdatesAvailable(true);
        } else {
          setUpdatesAvailable(false);
        }
        
        // Important: Always update our record of the last server text after each check
        setLastServerText(newServerText);
        setLastChecked(new Date());
        setContentChecked(true);
        setContentChecked(true);
      }
    } catch (error) {
      console.error('Error checking for updates:', error);
    }
  };

  // Apply updates from server
  const applyUpdates = () => {
    // Apply server text to editor
    setText(serverText);
    setSavedText(serverText);
    
    // Update our reference of what the server has
    setLastServerText(serverText);
    lastServerTextRef.current = serverText; // Update ref too
    
    // Clear update notification
    setUpdatesAvailable(false);
    setStatus('updated');
    
    
  };

  // Initial load of text from server
  const initialLoad = async () => {
    try {
      
      
      // First, fetch the text content
      const response = await fetch(`${API_BASE_URL}/share.php?id=${id}`);
      const data = await response.json();
      
      // Also get the status data to store the initial checksum
      const statusResponse = await fetch(`${API_BASE_URL}/share.php?id=${id}&status=1`);
      const statusData = await statusResponse.json();
      
      // Update checksum reference if available
      if (statusData.exists && statusData.checksum) {
        
        // Store in our ref
        currentChecksumRef.current = statusData.checksum;
      }
      
      // Check if we have seed text and the server returned empty text
      if (seedText && (!data.text || data.text.trim() === '')) {
        
        
        // Save the seed text to server
        await fetch(`${API_BASE_URL}/share.php?id=${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: seedText }),
        });
        
        // Set all our state variables to the seed text
        setText(seedText);
        setSavedText(seedText);
        setServerText(seedText);
        setLastServerText(seedText);
        lastServerTextRef.current = seedText;
        setHasChanges(false);
        setLastSaved(new Date());
        setStatus('saved');
        
        
      } 
      else if (data.text !== undefined) {
        const initialText = data.text;
        
        
        
        setText(initialText);
        setSavedText(initialText);
        setServerText(initialText);
        setLastServerText(initialText); // Store initial text as last server text
        lastServerTextRef.current = initialText; // Also store in our ref
        setHasChanges(false);
        
        
      }
      
      setIsInitialized(true);
    } catch (error) {
      console.error('Error loading initial text:', error);
      setIsInitialized(true);
    }
  };

  // Save text to server
  const saveText = async () => {
    try {
      setStatus('saving');
      
      // Capture the exact text being saved
      const textToSave = text;
      
      // Send to server
      await fetch(`${API_BASE_URL}/share.php?id=${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToSave }),
      });
      
      // After saving, get the new checksum for this content
      const statusResponse = await fetch(`${API_BASE_URL}/share.php?id=${id}&status=1`);
      const statusData = await statusResponse.json();
      
      // Update our stored checksum
      if (statusData.exists && statusData.checksum) {
        currentChecksumRef.current = statusData.checksum;
        
      }
      
      // Update all state variables to match the saved text
      setStatus('saved');
      setLastSaved(new Date());
      setSavedText(textToSave);
      setServerText(textToSave);
      setLastServerText(textToSave); // Critical: Update last known server state
      lastServerTextRef.current = textToSave; // Also update our ref
      setHasChanges(false);
      setUpdatesAvailable(false);
      
      
    } catch (error) {
      console.error('Error saving text:', error);
      setStatus('error');
    }
  };

  // Poll for updates every 10 seconds
  useEffect(() => {
    if (!id) return;
    
    
    
    // Initial load
    initialLoad();
    
    // Define a wrapped check function that uses our ref for stable state between calls
    const stableCheckFunction = async () => {
      try {
        
        
        // Add timestamp to URL to prevent caching issues
        const cacheBreaker = new Date().getTime();
        
        // First, only fetch the status (lightweight request)
        const statusResponse = await fetch(`${API_BASE_URL}/share.php?id=${id}&status=1&t=${cacheBreaker}`);
        const statusData = await statusResponse.json();
        
        // Update the last checked time
        setLastChecked(new Date());
        setContentChecked(true);
        
        // Initialize currentChecksumRef on first poll if needed
        if (!currentChecksumRef.current) {
          
        }
        
        if (statusData.exists) {
          
          
          // Check if content has changed by comparing checksums
          const hasChanged = currentChecksumRef.current !== statusData.checksum;
          
          if (hasChanged) {
            
            
            // Only fetch the full content if the status check indicates changes
            const contentResponse = await fetch(`${API_BASE_URL}/share.php?id=${id}&t=${cacheBreaker}`);
            const contentData = await contentResponse.json();
            
            if (contentData.text !== undefined) {
              const newServerText = contentData.text;
              
              // Update the checksum reference
              currentChecksumRef.current = statusData.checksum;
              
              // We need to get the current text value directly rather than from closure
              const currentText = text; // Get current text from state
              const isDifferentFromEditor = newServerText !== currentText;
              
              // Store the server response in React state
              setServerText(newServerText);
              
              if (isDifferentFromEditor && newServerText.trim() !== '') {
                
                setUpdatesAvailable(true);
              } else {
                setUpdatesAvailable(false);
              }
              
              // Update our stable reference AND the React state
              lastServerTextRef.current = newServerText;
              setLastServerText(newServerText);
              
              
            }
          } else {
            
            setUpdatesAvailable(false);
          }
        }
      } catch (error) {
        console.error('Error in stable check function:', error);
      }
    };
    
    // Set up polling with our wrapped function
    const interval = setInterval(stableCheckFunction, 10000);
    
    return () => clearInterval(interval);
  }, [id]); // Only depend on id, not text

  const handleTextChange = (e) => {
    const newText = e.target.value;
    setText(newText);
    setHasChanges(newText !== savedText);
    setStatus('unsaved');
  };

  const getShareUrl = () => {
    return window.location.origin + window.location.pathname + `#/share/${id}`;
  };
  
  // Function to share via email
  const shareViaEmail = () => {
    const subject = encodeURIComponent('Clippy: Shared Text Session');
    const body = encodeURIComponent(
      `I've shared a text session with you using Clippy.\n\n` +
      `Access it at: ${getShareUrl()}\n\n` +
      `Simply open the link to view and collaborate on the shared text.`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };
  
  // Get a shareable URL with the current text as a seed
  const getSeedUrl = () => {
    // Only encode if there's text to share
    if (text.trim()) {
      const encodedText = encodeTextToBase64(text);
      return window.location.origin + window.location.pathname + `#/share/${id}/seed/${encodedText}`;
    }
    
    // If no text, return regular share URL
    return getShareUrl();
  };
  
  // Function to create a new session with the current text
  const [newSessionId, setNewSessionId] = useState('');
  const [creatingNewSession, setCreatingNewSession] = useState(false);
  
  const createNewSession = async () => {
    if (!text.trim()) return; // Don't create empty sessions
    
    try {
      setCreatingNewSession(true);
      
      // First, get a new ID
      const idResponse = await fetch(`${API_BASE_URL}/share.php`);
      const idData = await idResponse.json();
      
      if (idData.id) {
        // Save the current text to the new ID
        await fetch(`${API_BASE_URL}/share.php?id=${idData.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        
        // Store the new ID for the UI
        setNewSessionId(idData.id);
      }
    } catch (error) {
      console.error('Error creating new session:', error);
    } finally {
      setCreatingNewSession(false);
    }
  };
  
  // Manual check function for the "Check Updates" button
  const manualCheckForUpdates = async () => {
    try {
      
      
      // Add timestamp to URL to prevent caching issues
      const cacheBreaker = new Date().getTime();
      
      // First, fetch the status to check the checksum
      const statusResponse = await fetch(`${API_BASE_URL}/share.php?id=${id}&status=1&t=${cacheBreaker}`);
      const statusData = await statusResponse.json();
      
      // Get current checksum from our ref
      const currentChecksum = currentChecksumRef.current || '';
      
      // Check if content has changed by comparing checksums
      const hasChanged = currentChecksum !== statusData.checksum;
      
      
      
      if (hasChanged) {
        // Only fetch the full content if the status check indicates changes
        const contentResponse = await fetch(`${API_BASE_URL}/share.php?id=${id}&t=${cacheBreaker}`);
        const contentData = await contentResponse.json();
        
        if (contentData.text !== undefined) {
          const newServerText = contentData.text;
          
          // Update the stored checksum
          currentChecksumRef.current = statusData.checksum;
          
          // Check if different from editor text
          const isDifferentFromEditor = newServerText !== text;
          
          // Store the server response
          setServerText(newServerText);
          
          
          
          if (hasChanged && isDifferentFromEditor && newServerText.trim() !== '') {
            setUpdatesAvailable(true);
          } else {
            setUpdatesAvailable(false);
          }
          
          // Update our state
          setLastServerText(newServerText);
          lastServerTextRef.current = newServerText; // Update ref too
          setLastChecked(new Date());
          setContentChecked(true);
          
          
        }
      } else {
        
        setUpdatesAvailable(false);
        setLastChecked(new Date());
        setContentChecked(true);
      }
    } catch (error) {
      console.error('Error in manual check:', error);
    }
  };

  // Function to share new session via email
  const shareNewSessionViaEmail = () => {
    if (!newSessionId) return;
    
    const newSessionUrl = `${window.location.origin}${window.location.pathname}#/share/${newSessionId}`;
    const subject = encodeURIComponent('Clippy: New Text Session');
    const body = encodeURIComponent(
      `I've created a new text session for you using Clippy.\n\n` +
      `Access it at: ${newSessionUrl}\n\n` +
      `Simply open the link to view and collaborate on the shared text.`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  return (
    <div className="text-share-container">
      <div className="app-header">
        <div className="app-title">
          <img src={LOGO_URL} alt="Clippy Logo" className="app-logo" />
          <h1>Clippy</h1>
          <ThemeToggle />
        </div>
        
        {updatesAvailable ? (
          <div className="header-updates">
            <span>New updates available!</span>
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
      
      <div className="text-area-container">
        <textarea 
          value={text} 
          onChange={handleTextChange} 
          className="share-textarea"
          placeholder="Start typing here..."
        />
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
      
      <div className="controls-bar">
        <div className="button-group">
          <button 
            className={`save-button ${hasChanges ? 'has-changes' : ''}`} 
            onClick={saveText}
            disabled={!hasChanges}
          >
            <FontAwesomeIcon icon={faSave} className="button-icon" /> Save Changes
          </button>
          
          <button 
            className="check-updates-button"
            onClick={manualCheckForUpdates}
            title="Check for updates now"
          >
            <FontAwesomeIcon icon={faSync} className="button-icon" /> Check Updates
          </button>
          
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
          {lastChecked && (
            <span className="last-checked"> · Last checked: {lastChecked.toLocaleTimeString()}{!updatesAvailable && ' (no updates)'}</span>
          )}
        </div>
      </div>
      
      {/* Share Modal */}
      {showShareModal && (
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
      )}
      
      <div className="navigation">
        <Link to="/" className="home-link">
          <FontAwesomeIcon icon={faHome} className="button-icon" /> Return to Home
        </Link>
      </div>
  <Footer />
    </div>
  );
}

// Home Component
function Home() {
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
  }, []);

  return (
    <div className="home-container">
      <div className="app-header">
        <div className="app-title">
          <img src={LOGO_URL} alt="Clippy Logo" className="app-logo" />
          <h1>Welcome to Clippy</h1>
          <ThemeToggle />
        </div>
      </div>
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
          <li>Type your text and click the "Save Changes" button when you're ready to share it</li>
          <li>You'll be notified when updates are available from other users</li>
          <li>Choose when to apply updates so your typing won't be interrupted</li>
        </ul>
      </div>
  <Footer />
    </div>
  );
}

// Error Component
function ErrorPage() {
  const location = window.location;
  const path = location.hash.substring(1); // Remove the # character
  const shareId = path.match(/\/share\/([^\/]+)/)?.[1]; // Extract ID from path if it exists

  return (
    <div className="error-container">
      <div className="app-header">
        <div className="app-title">
          <img src={LOGO_URL} alt="Clippy Logo" className="app-logo" />
          <h1>Oops!</h1>
          <ThemeToggle />
        </div>
      </div>
      <p>Sorry, an unexpected error has occurred.</p>
      <Link to="/" className="home-link">
        <FontAwesomeIcon icon={faHome} className="button-icon" /> Return to Home
      </Link>
      
      {shareId && (
        <div className="error-help">
          <p>It looks like you're trying to access a shared document with ID: <strong>{shareId}</strong></p>
          <p>Try these links instead:</p>
          <ul>
            <li><a href={`/clippy/#/share/${shareId}`}>Direct Link</a></li>
            <li><a href={`/clippy/index.php?share=${shareId}`}>PHP Link</a></li>
          </ul>
        </div>
      )}
      
      {!shareId && (
        <p className="error-help">
          If you're trying to access a shared document, make sure the URL is in the correct format.
        </p>
      )}
  <Footer />
    </div>
  );
}

// Create router with hash routing
const router = createHashRouter([
  {
    path: '/',
    element: <Home />,
    errorElement: <ErrorPage />,
  },
  {
    path: '/share/:id',
    element: <TextShareApp />,
    errorElement: <ErrorPage />
  },
  {
    // Route that handles a seed parameter in the URL hash
    path: '/share/:id/seed/:seedData',
    element: <TextShareApp />,
    errorElement: <ErrorPage />
  }
]);

// Main App
function App() {
  return (
    <div className="app">
      <RouterProvider router={router} />
    </div>
  );
}

export default App;
