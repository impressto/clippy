// SocketConnectionTest.jsx
// A simple component to test the socket server connection

import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import socketAdapter from './utils/WebRTCSocketAdapter';

function SocketConnectionTest() {
  const { sessionId: sessionIdParam } = useParams();
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [sessionId, setSessionId] = useState(sessionIdParam || 'test-session');
  const [clientId, setClientId] = useState(`client-${Date.now()}`);
  const [messages, setMessages] = useState([]);
  const [socketServerUrl, setSocketServerUrl] = useState(
    import.meta.env.VITE_SOCKET_SERVER_URL || 'http://localhost:3000'
  );
  const [socketConnected, setSocketConnected] = useState(false);
  const [error, setError] = useState(null);
  
  // WebRTC data channel test
  const [peerConnections, setPeerConnections] = useState({});
  const [dataChannels, setDataChannels] = useState({});
  const [rtcMessage, setRtcMessage] = useState('');
  const [receivedMessages, setReceivedMessages] = useState([]);
  const [connectedPeers, setConnectedPeers] = useState([]);
  
  // Keep a reference to the adapter for debugging
  const adapterRef = useRef(socketAdapter);
  
  // Config for RTCPeerConnection
  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  // Initialize socket connection
  useEffect(() => {
    setError(null);
    try {
      addMessage(`Initializing socket connection to ${socketServerUrl}`);
      socketAdapter.init(socketServerUrl);
      
      // Add connect/disconnect handlers
      const socketInstance = socketAdapter.socket;
      if (socketInstance) {
        socketInstance.on('connect', () => {
          addMessage('Socket connected! ✅');
          setSocketConnected(true);
          setError(null);
        });
        
        socketInstance.on('connect_error', (err) => {
          const errorMsg = `Socket connection error: ${err.message}`;
          addMessage(errorMsg + ' ❌');
          setSocketConnected(false);
          setError(errorMsg);
          setConnectionStatus('Error connecting');
        });
        
        socketInstance.on('disconnect', (reason) => {
          addMessage(`Socket disconnected: ${reason} ⚠️`);
          setSocketConnected(false);
          setConnectionStatus('Disconnected');
        });
      }

      // Set up event handlers
      socketAdapter.onSignal((data) => {
        addMessage(`Signal received from ${data.from}: ${data.signal.type || 'ICE'}`);
      });

      socketAdapter.onSessionUpdate((data) => {
        addMessage(`Session update: ${data.activeUsers} users active`);
        setConnectionStatus(`Connected (${data.activeUsers} users)`);
      });

      socketAdapter.onClientList((clients) => {
        addMessage(`Client list received: ${clients.join(', ')}`);
      });
      
      // Check connection status immediately
      setTimeout(() => {
        if (socketAdapter.isConnected) {
          addMessage('Connection check: Socket is connected ✅');
          setSocketConnected(true);
        } else {
          addMessage('Connection check: Socket is not connected ⚠️');
        }
      }, 1000);
    } catch (err) {
      const errorMsg = `Error setting up socket: ${err.message}`;
      addMessage(errorMsg + ' ❌');
      setError(errorMsg);
    }

    return () => {
      addMessage('Disconnecting socket');
      socketAdapter.disconnect();
    };
  }, [socketServerUrl]);

  // Join session
  const joinSession = () => {
    if (socketAdapter.joinSession(sessionId, clientId)) {
      addMessage(`Joined session: ${sessionId} as ${clientId}`);
      setConnectionStatus('Joining...');
    } else {
      addMessage('Failed to join session');
    }
  };

  // Leave session
  const leaveSession = () => {
    if (socketAdapter.leaveSession()) {
      addMessage('Left session');
      setConnectionStatus('Disconnected');
    } else {
      addMessage('Failed to leave session');
    }
  };

  // Send presence announcement
  const sendPresence = () => {
    if (socketAdapter.sendPresenceAnnouncement()) {
      addMessage('Sent presence announcement');
    } else {
      addMessage('Failed to send presence announcement');
    }
  };

  // Send a test signal
  const sendTestSignal = () => {
    if (socketAdapter.sendSignal('all', { type: 'test', message: 'Hello from socket test' })) {
      addMessage('Sent test signal to all clients');
    } else {
      addMessage('Failed to send test signal');
    }
  };

  // Helper to add a message to the log
  const addMessage = (message) => {
    setMessages((prev) => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  // Add debug info function
  const getDebugInfo = () => {
    return {
      socketConnected: socketAdapter.isConnected,
      socketId: socketAdapter.socket?.id || 'unknown',
      clientId: socketAdapter.clientId,
      sessionId: socketAdapter.sessionId
    };
  };
  
  // Show debug info
  const showDebugInfo = () => {
    const info = getDebugInfo();
    addMessage(`Debug info:\n- Socket connected: ${info.socketConnected}\n- Socket ID: ${info.socketId}\n- Client ID: ${info.clientId}\n- Session ID: ${info.sessionId}`);
  };
  
  // Reset socket connection
  const resetConnection = () => {
    addMessage('Resetting socket connection...');
    socketAdapter.disconnect();
    setTimeout(() => {
      socketAdapter.init(socketServerUrl);
      addMessage('Socket connection reset complete');
    }, 500);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>WebRTC Socket Connection Test</h1>
      
      {error && (
        <div style={{ 
          padding: '10px', 
          backgroundColor: '#ffebee', 
          border: '1px solid #f44336',
          borderRadius: '4px',
          marginBottom: '20px'
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}
      
      <div style={{ 
        padding: '10px', 
        backgroundColor: socketConnected ? '#e8f5e9' : '#fff3e0', 
        border: socketConnected ? '1px solid #4caf50' : '1px solid #ff9800',
        borderRadius: '4px',
        marginBottom: '20px'
      }}>
        <strong>Socket Status:</strong> {socketConnected ? 'Connected ✅' : 'Disconnected ⚠️'}
      </div>
      
      <div style={{ marginBottom: '20px' }}>
        <div>
          <label>
            Socket Server URL:
            <input
              type="text"
              value={socketServerUrl}
              onChange={(e) => setSocketServerUrl(e.target.value)}
              style={{ width: '300px', marginLeft: '10px' }}
            />
          </label>
          <button onClick={resetConnection} style={{ marginLeft: '10px' }}>Reset Connection</button>
        </div>
        
        <div style={{ marginTop: '10px' }}>
          <label>
            Session ID:
            <input
              type="text"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              style={{ marginLeft: '10px' }}
            />
          </label>
        </div>
        
        <div style={{ marginTop: '10px' }}>
          <label>
            Client ID:
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              style={{ marginLeft: '10px' }}
            />
          </label>
        </div>
      </div>
      
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={joinSession} 
          style={{ marginRight: '10px' }}
          disabled={!socketConnected}
        >
          Join Session
        </button>
        <button 
          onClick={leaveSession} 
          style={{ marginRight: '10px' }}
          disabled={!socketConnected}
        >
          Leave Session
        </button>
        <button 
          onClick={sendPresence} 
          style={{ marginRight: '10px' }}
          disabled={!socketConnected}
        >
          Send Presence
        </button>
        <button 
          onClick={sendTestSignal}
          style={{ marginRight: '10px' }}
          disabled={!socketConnected}
        >
          Send Test Signal
        </button>
        <button 
          onClick={showDebugInfo}
          style={{ marginRight: '10px' }}
        >
          Debug Info
        </button>
      </div>
      
      <div>
        <h3>Connection Status: {connectionStatus}</h3>
      </div>
      
      <div style={{ marginTop: '20px' }}>
        <h3>Event Log:</h3>
        <div
          style={{
            height: '300px',
            overflowY: 'auto',
            border: '1px solid #ccc',
            padding: '10px',
            backgroundColor: '#f8f8f8',
            borderRadius: '4px'
          }}
        >
          {messages.map((msg, index) => (
            <div key={index} style={{ fontFamily: 'monospace', marginBottom: '5px' }}>
              {msg}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default SocketConnectionTest;
