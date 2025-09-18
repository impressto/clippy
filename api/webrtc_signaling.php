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

// Directory to store signaling data
$dataDir = __DIR__ . '/../data';
$signalingDir = $dataDir . '/signaling';

try {
    // Create data directory if it doesn't exist
    if (!file_exists($dataDir)) {
        if (!mkdir($dataDir, 0755, true)) {
            throw new Exception("Failed to create data directory at: {$dataDir}");
        }
        chmod($dataDir, 0755); // Ensure proper permissions
    }
    
    // Create signaling directory if it doesn't exist
    if (!file_exists($signalingDir)) {
        if (!mkdir($signalingDir, 0755, true)) {
            throw new Exception("Failed to create signaling directory at: {$signalingDir}");
        }
        chmod($signalingDir, 0755); // Ensure proper permissions
    }
    
    // Verify the directory is writable
    if (!is_writable($signalingDir)) {
        throw new Exception("Signaling directory exists but is not writable: {$signalingDir}");
    }
} catch (Exception $e) {
    echo json_encode(['error' => 'Server configuration error', 'debug' => $e->getMessage()]);
    exit;
}

// Get the session ID from headers
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

// Validate client ID format
if (!preg_match('/^client-[0-9]+-[a-z0-9]+$/', $clientId)) {
    echo json_encode(['error' => 'Invalid client ID format']);
    exit;
}

// File to store session signals
$sessionFile = $signalingDir . "/session_{$sessionId}.json";

// Clean up old messages (older than 5 minutes)
function cleanupOldMessages($sessionData) {
    $now = time();
    foreach ($sessionData as $sender => $receivers) {
        foreach ($receivers as $receiver => $messages) {
            foreach ($messages as $idx => $message) {
                if ($now - $message['timestamp'] > 300) { // 5 minutes
                    unset($sessionData[$sender][$receiver][$idx]);
                }
            }
            
            // Reindex the array
            if (!empty($sessionData[$sender][$receiver])) {
                $sessionData[$sender][$receiver] = array_values($sessionData[$sender][$receiver]);
            }
            
            // Remove empty receivers
            if (empty($sessionData[$sender][$receiver])) {
                unset($sessionData[$sender][$receiver]);
            }
        }
        
        // Remove empty senders
        if (empty($sessionData[$sender])) {
            unset($sessionData[$sender]);
        }
    }
    
    return $sessionData;
}

// Handle POST requests (client sending a signal to another client)
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Read the request body
    $inputJSON = file_get_contents('php://input');
    $input = json_decode($inputJSON, TRUE);
    
    // Validate input
    if (!isset($input['target']) || !isset($input['signal'])) {
        echo json_encode(['error' => 'Missing target or signal']);
        exit;
    }
    
    $target = $input['target'];
    $signal = $input['signal'];
    
    // Handle 'all' as a special case for broadcast messages
    $broadcastToAll = false;
    if ($target === 'all') {
        $broadcastToAll = true;
    } else {
        // Validate target format
        if (!preg_match('/^client-[0-9]+-[a-z0-9]+$/', $target)) {
            echo json_encode(['error' => 'Invalid target format']);
            exit;
        }
    }
    
    // Load existing session data
    $sessionData = [];
    if (file_exists($sessionFile)) {
        $data = file_get_contents($sessionFile);
        if ($data) {
            $sessionData = json_decode($data, true) ?: [];
        }
    }
    
    // Clean up old messages
    $sessionData = cleanupOldMessages($sessionData);
    
    // Initialize sender if not exists
    if (!isset($sessionData[$clientId])) {
        $sessionData[$clientId] = [];
    }
    
    if ($broadcastToAll) {
        // For broadcast, get all active clients from share.php's active_sessions.json
        $activeSessionsFile = $dataDir . '/active_sessions.json';
        $activeSessions = [];
        
        if (file_exists($activeSessionsFile)) {
            $activeData = file_get_contents($activeSessionsFile);
            if ($activeData) {
                $activeSessions = json_decode($activeData, true) ?: [];
            }
        }
        
        // Add the signal to all clients except the sender
        if (isset($activeSessions[$sessionId]) && isset($activeSessions[$sessionId]['clients'])) {
            foreach (array_keys($activeSessions[$sessionId]['clients']) as $activeClientId) {
                // Skip sending to self
                if ($activeClientId === $clientId) {
                    continue;
                }
                
                // Initialize target if not exists
                if (!isset($sessionData[$clientId][$activeClientId])) {
                    $sessionData[$clientId][$activeClientId] = [];
                }
                
                // Add the new signal
                $sessionData[$clientId][$activeClientId][] = [
                    'signal' => $signal,
                    'timestamp' => time()
                ];
            }
        }
    } else {
        // For direct message to specific target
        if (!isset($sessionData[$clientId][$target])) {
            $sessionData[$clientId][$target] = [];
        }
        
        // Add the new signal
        $sessionData[$clientId][$target][] = [
            'signal' => $signal,
            'timestamp' => time()
        ];
    }
    
    // Save the updated session data
    file_put_contents($sessionFile, json_encode($sessionData));
    
    echo json_encode(['status' => 'success']);
    exit;
}

// Get signals for this client
function getSignalsForClient($sessionFile, $clientId) {
    // Load existing session data
    $sessionData = [];
    if (file_exists($sessionFile)) {
        $data = file_get_contents($sessionFile);
        if ($data) {
            $sessionData = json_decode($data, true) ?: [];
        }
    }
    
    // Clean up old messages
    $sessionData = cleanupOldMessages($sessionData);
    
    // Get signals for this client
    $signals = [];
    $modified = false;
    
    // Check for signals from any client to this client
    foreach ($sessionData as $sender => $receivers) {
        if (isset($receivers[$clientId]) && !empty($receivers[$clientId])) {
            // Add each signal to the result
            foreach ($receivers[$clientId] as $message) {
                $signals[] = [
                    'from' => $sender,
                    'signal' => $message['signal'],
                    'timestamp' => $message['timestamp']
                ];
                
                // Remove the message after sending it
                // This is a simple way to ensure each message is only sent once
                $idx = array_search($message, $receivers[$clientId]);
                unset($sessionData[$sender][$clientId][$idx]);
            }
            
            $modified = true;
            
            // Reindex the array
            $sessionData[$sender][$clientId] = array_values($sessionData[$sender][$clientId]);
            
            // Remove empty receivers
            if (empty($sessionData[$sender][$clientId])) {
                unset($sessionData[$sender][$clientId]);
            }
            
            // Remove empty senders
            if (empty($sessionData[$sender])) {
                unset($sessionData[$sender]);
            }
        }
    }
    
    // Only write back to the file if we modified the data
    if ($modified) {
        file_put_contents($sessionFile, json_encode($sessionData));
    }
    
    return [
        'signals' => $signals,
        'sessionData' => $sessionData
    ];
}

// Handle GET requests (client polling for signals)
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $result = getSignalsForClient($sessionFile, $clientId);
    
    // Send the signals
    echo json_encode([
        'status' => 'success',
        'signals' => $result['signals']
    ]);
    exit;
}

echo json_encode(['error' => 'Invalid request method']);
?>
