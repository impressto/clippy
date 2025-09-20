<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Client-ID, X-Session-ID');
header("X-Content-Type-Options: nosniff");
header("X-Frame-Options: DENY");
header("Content-Security-Policy: default-src 'none'");

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Get the session ID and client ID from headers
$sessionId = isset($_SERVER['HTTP_X_SESSION_ID']) ? $_SERVER['HTTP_X_SESSION_ID'] : null;
$clientId = isset($_SERVER['HTTP_X_CLIENT_ID']) ? $_SERVER['HTTP_X_CLIENT_ID'] : null;

if (!$sessionId || !$clientId) {
    echo json_encode(['error' => 'Missing session ID or client ID']);
    exit;
}

// Validate session ID format to prevent directory traversal
if (!preg_match('/^[a-f0-9]+$/', $sessionId)) {
    echo json_encode(['error' => 'Invalid session ID format']);
    exit;
}

// Validate client ID format - accept both formats:
// 1. client-timestamp-random (from App.jsx)
// 2. random only (from WebRTCManager.js)
if (!preg_match('/^(client-[0-9]+-[a-z0-9]+|[a-z0-9]+)$/', $clientId)) {
    echo json_encode(['error' => 'Invalid client ID format']);
    exit;
}

// Directory to store shared text files
$dataDir = __DIR__ . '/../data';
// Session activity tracking file
$sessionTrackingFile = $dataDir . '/active_sessions.json';

// Update active sessions with this client
try {
    // Get the existing active sessions
    $sessions = [];
    if (file_exists($sessionTrackingFile)) {
        $data = file_get_contents($sessionTrackingFile);
        if ($data) {
            $sessions = json_decode($data, true) ?: [];
        }
    }
    
    // Current timestamp
    $now = time();
    
    // Clean up expired sessions (older than 30 seconds)
    foreach ($sessions as $id => $sessionData) {
        foreach ($sessionData['clients'] as $cId => $lastSeen) {
            if ($now - $lastSeen > 30) {
                unset($sessions[$id]['clients'][$cId]);
            }
        }
        
        // If no clients left, remove the session
        if (empty($sessions[$id]['clients'])) {
            unset($sessions[$id]);
        }
    }
    
    // Update or create session for this client
    if (!isset($sessions[$sessionId])) {
        $sessions[$sessionId] = [
            'clients' => [],
            'created' => $now
        ];
    }
    
    // Update this client's timestamp
    $sessions[$sessionId]['clients'][$clientId] = $now;
    
    // Save updated session data
    file_put_contents($sessionTrackingFile, json_encode($sessions));
    
    // Create the client list to return
    $clientList = [];
    if (isset($sessions[$sessionId]) && isset($sessions[$sessionId]['clients'])) {
        $clientList = array_keys($sessions[$sessionId]['clients']);
    }
    
    // Return success with client list and active users count
    echo json_encode([
        'status' => 'success',
        'activeUsers' => count($clientList),
        'clientList' => $clientList
    ]);
    
} catch (Exception $e) {
    echo json_encode([
        'status' => 'error',
        'message' => 'Failed to update peer discovery information',
        'debug' => $e->getMessage()
    ]);
}
?>
