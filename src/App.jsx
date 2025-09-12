import { useState, useEffect } from 'react';
import { createHashRouter, RouterProvider, Link, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import './App.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

// TextShareApp Component
function TextShareApp() {
  const { id } = useParams(); // Get id from URL parameter with hash routing
  const [text, setText] = useState('');
  const [savedText, setSavedText] = useState('');
  const [serverText, setServerText] = useState('');
  const [lastServerText, setLastServerText] = useState(''); // Store the last received server text for comparison
  const [status, setStatus] = useState('idle');
  const [lastSaved, setLastSaved] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [updatesAvailable, setUpdatesAvailable] = useState(false);
  const [lastChecked, setLastChecked] = useState(null);

  // Helper function for deep text comparison
  const areTextsEqual = (a, b) => {
    // Normalize both strings (trim whitespace, normalize line endings)
    const normalizeText = (text) => text.trim().replace(/\r\n/g, '\n');
    return normalizeText(a) === normalizeText(b);
  };

  // Check for updates from server without updating text
  const checkForUpdates = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/share.php?id=${id}`);
      const data = await response.json();
      
      if (data.text !== undefined) {
        const newServerText = data.text;
        
        // Use our helper for accurate comparison
        const hasChanged = !areTextsEqual(newServerText, lastServerText);
        const isDifferentFromEditor = !areTextsEqual(newServerText, text);
        
        // Store the server response
        setServerText(newServerText);
        
        // Debug information to help diagnose comparison issues
        console.log('Update check:', { 
          newServerText: newServerText.substring(0, 20) + '...',
          lastServerText: lastServerText.substring(0, 20) + '...',
          editorText: text.substring(0, 20) + '...',
          hasChanged,
          isDifferentFromEditor
        });
        
        // ONLY show updates when:
        // 1. The text from server is different from our last known server state AND
        // 2. It's different from what's currently in the editor AND
        // 3. It's not empty
        if (hasChanged && isDifferentFromEditor && newServerText.trim() !== '') {
          console.log('⭐ New updates detected - showing update button');
          setUpdatesAvailable(true);
        } else {
          console.log('✓ No meaningful changes - hiding update button');
          setUpdatesAvailable(false);
        }
        
        setLastChecked(new Date());
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
    
    // Clear update notification
    setUpdatesAvailable(false);
    setStatus('updated');
    
    console.log('✅ Updates applied - text synchronized with server');
  };

  // Initial load of text from server
  const initialLoad = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/share.php?id=${id}`);
      const data = await response.json();
      if (data.text !== undefined) {
        const initialText = data.text;
        setText(initialText);
        setSavedText(initialText);
        setServerText(initialText);
        setLastServerText(initialText); // Store initial text as last server text
        setHasChanges(false);
      }
    } catch (error) {
      console.error('Error loading initial text:', error);
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
      
      // Update all state variables to match the saved text
      setStatus('saved');
      setLastSaved(new Date());
      setSavedText(textToSave);
      setServerText(textToSave);
      setLastServerText(textToSave); // Critical: Update last known server state
      setHasChanges(false);
      setUpdatesAvailable(false);
      
      console.log('💾 Text saved to server and state synchronized');
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
    
    // Set up polling for updates
    const interval = setInterval(checkForUpdates, 10000);
    
    return () => clearInterval(interval);
  }, [id]);

  const handleTextChange = (e) => {
    const newText = e.target.value;
    setText(newText);
    setHasChanges(newText !== savedText);
    setStatus('unsaved');
  };

  const getShareUrl = () => {
    return `${window.location.origin}/clippy/#/share/${id}`;
  };

  return (
    <div className="text-share-container">
      <h1>Text Share</h1>
      
      {updatesAvailable ? (
        <div className="updates-banner">
          <span>New updates available!</span>
          <button 
            className="refresh-button"
            onClick={applyUpdates}
          >
            Load Updates
          </button>
        </div>
      ) : lastChecked && (
        <div className="status-banner">
          <span>No new updates available</span>
        </div>
      )}
      
      <div className="text-area-container">
        <textarea 
          value={text} 
          onChange={handleTextChange} 
          className="share-textarea"
          placeholder="Start typing here..."
        />
      </div>
      
      <div className="controls-bar">
        <div className="button-group">
          <button 
            className={`save-button ${hasChanges ? 'has-changes' : ''}`} 
            onClick={saveText}
            disabled={!hasChanges}
          >
            Save Changes
          </button>
          
          <button 
            className="check-updates-button"
            onClick={checkForUpdates}
            title="Check for updates now"
          >
            Check Updates
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
      
      <div className="share-info">
        <p>Share this URL with others to collaborate:</p>
        <div className="share-container">
          <div className="share-url">
            <input
              type="text"
              readOnly
              value={getShareUrl()}
              onClick={(e) => e.target.select()}
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(getShareUrl());
                alert('URL copied to clipboard!');
              }}
            >
              Copy
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
      
      <div className="navigation">
        <Link to="/" className="home-link">Return to Home</Link>
      </div>
    </div>
  );
}

// Home Component
function Home() {
  const [uniqueId, setUniqueId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

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
      <h1>Welcome to Clippy</h1>
      <p className="app-description">
        Share text between computers securely and easily
      </p>
      
      {isLoading ? (
        <div className="loading">Generating secure session...</div>
      ) : (
        <div className="start-sharing">
          <Link to={`/share/${uniqueId}`} className="start-button">
            Start New Sharing Session
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
      <h1>Oops!</h1>
      <p>Sorry, an unexpected error has occurred.</p>
      <Link to="/" className="home-link">Return to Home</Link>
      
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
