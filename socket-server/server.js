const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// Create Express app
const app = express();
app.use(cors());
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Create Socket.IO server with CORS
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Store active sessions
const activeSessions = new Map();

// Data directory path (for compatibility with PHP version)
const dataDir = path.join(__dirname, '../data');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// REST endpoint for checking server status
app.get('/status', (req, res) => {
  res.json({
    status: 'success',
    message: 'WebRTC Socket server is running',
    activeSessions: Array.from(activeSessions.keys())
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);
  
  let sessionId = null;
  let clientId = null;

  // Handle client joining a session
  socket.on('join-session', ({ sessionId: sid, clientId: cid }) => {
    sessionId = sid;
    clientId = cid;
    
    console.log(`Client ${clientId} joined session ${sessionId}`);
    
    // Add client to session
    if (!activeSessions.has(sessionId)) {
      activeSessions.set(sessionId, new Map());
    }
    
    // Store client information
    activeSessions.get(sessionId).set(clientId, {
      socketId: socket.id,
      lastSeen: Date.now()
    });
    
    // Join room for this session
    socket.join(sessionId);
    
    // Notify everyone in the session about active users
    updateSessionStatus(sessionId);
  });

  // Handle WebRTC signaling
  socket.on('signal', ({ target, signal }) => {
    if (!sessionId || !clientId) {
      console.error('Client tried to send signal without joining a session');
      return;
    }

    console.log(`Signal from ${clientId} to ${target}`);

    if (target === 'all') {
      // Broadcast to all clients in this session except sender
      socket.to(sessionId).emit('signal', {
        from: clientId,
        signal
      });
    } else if (activeSessions.has(sessionId) && activeSessions.get(sessionId).has(target)) {
      // Send to specific client
      const targetSocketId = activeSessions.get(sessionId).get(target).socketId;
      io.to(targetSocketId).emit('signal', {
        from: clientId,
        signal
      });
    } else {
      console.warn(`Target client ${target} not found in session ${sessionId}`);
    }
  });

  // Handle presence announcements
  socket.on('presence', () => {
    if (!sessionId || !clientId) {
      console.error('Client tried to announce presence without joining a session');
      return;i
    }
    
    console.log(`Presence announcement from ${clientId}`);
    
    // Update client's last seen timestamp
    if (activeSessions.has(sessionId) && activeSessions.get(sessionId).has(clientId)) {
      activeSessions.get(sessionId).get(clientId).lastSeen = Date.now();
    }
    
    // Respond with client list for this session
    socket.emit('client-list', getSessionClients(sessionId));
  });

  // Handle client disconnect
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    
    if (sessionId && clientId) {
      if (activeSessions.has(sessionId)) {
        // Remove client from session
        activeSessions.get(sessionId).delete(clientId);
        
        // If session is empty, remove it
        if (activeSessions.get(sessionId).size === 0) {
          activeSessions.delete(sessionId);
        } else {
          // Otherwise update session status for remaining clients
          updateSessionStatus(sessionId);
        }
      }
    }
  });
  
  // Handle explicit leave session
  socket.on('leave-session', () => {
    if (sessionId && clientId && activeSessions.has(sessionId)) {
      // Remove client from session
      activeSessions.get(sessionId).delete(clientId);
      
      // If session is empty, remove it
      if (activeSessions.get(sessionId).size === 0) {
        activeSessions.delete(sessionId);
      } else {
        // Otherwise update session status
        updateSessionStatus(sessionId);
      }
    }
    
    sessionId = null;
    clientId = null;
  });
});

// Function to update session status for all clients in a session
function updateSessionStatus(sessionId) {
  if (!activeSessions.has(sessionId)) return;
  
  const clients = getSessionClients(sessionId);
  const clientCount = clients.length;
  
  // Broadcast to all clients in this session
  io.to(sessionId).emit('session-update', {
    activeUsers: clientCount,
    clientList: clients
  });
}

// Function to get client list for a session
function getSessionClients(sessionId) {
  if (!activeSessions.has(sessionId)) return [];
  
  // Clean up stale clients (inactive for more than 30 seconds)
  const now = Date.now();
  const sessionClients = activeSessions.get(sessionId);
  
  // Filter out stale clients
  for (const [clientId, data] of sessionClients.entries()) {
    if (now - data.lastSeen > 30000) {
      sessionClients.delete(clientId);
    }
  }
  
  // Return list of client IDs
  return Array.from(sessionClients.keys());
}

// Periodically clean up inactive sessions and clients
setInterval(() => {
  const now = Date.now();
  
  // Check each session
  for (const [sessionId, clients] of activeSessions.entries()) {
    let hasActiveClients = false;
    
    // Check each client in this session
    for (const [clientId, data] of clients.entries()) {
      if (now - data.lastSeen < 30000) {
        hasActiveClients = true;
      } else {
        clients.delete(clientId);
      }
    }
    
    // If no active clients, remove the session
    if (!hasActiveClients) {
      activeSessions.delete(sessionId);
    }
  }
}, 10000); // Run every 10 seconds

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
