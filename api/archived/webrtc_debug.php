<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Client-ID, X-Session-ID, X-Debug-Mode');
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
$debugLogDir = $dataDir . '/debug_logs';

// Flag to enable detailed debugging (can be enabled via header)
$debugMode = isset($_SERVER['HTTP_X_DEBUG_MODE']) && $_SERVER['HTTP_X_DEBUG_MODE'] === 'true';

// Create a debug log function
function debugLog($message, $data = null) {
    global $debugMode, $debugLogDir, $sessionId, $clientId;
    
    if (!$debugMode) return;
    
    try {
        // Create debug log directory if it doesn't exist
        if (!file_exists($debugLogDir)) {
            if (!mkdir($debugLogDir, 0755, true)) {
                error_log("Failed to create debug log directory: {$debugLogDir}");
                return;
            }
            chmod($debugLogDir, 0755);
        }
        
        // Format the log entry
        $timestamp = date('Y-m-d H:i:s');
        $logEntry = "[{$timestamp}] [{$sessionId}] [{$clientId}] {$message}";
        
        if ($data !== null) {
            $logEntry .= "\n" . json_encode($data, JSON_PRETTY_PRINT);
        }
        
        $logEntry .= "\n\n";
        
        // Write to session-specific log file
        $logFile = $debugLogDir . "/webrtc_{$sessionId}.log";
        
        // Attempt to write to the log file
        $result = file_put_contents($logFile, $logEntry, FILE_APPEND);
        
        // If writing failed, check permissions and try to fix
        if ($result === false) {
            error_log("Failed to write to debug log file: {$logFile}");
            
            // Try to create a new file if it doesn't exist
            if (!file_exists($logFile)) {
                file_put_contents($logFile, "Debug log initialized at {$timestamp}\n\n{$logEntry}");
                chmod($logFile, 0644);
            }
        }
    } catch (Exception $e) {
        // Log to PHP error log if debugging fails
        error_log("Error in WebRTC debug logging: " . $e->getMessage());
    }
}

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

// Get active clients for this session
function getActiveClients($sessionId) {
    global $dataDir;
    
    $activeSessionsFile = $dataDir . '/active_sessions.json';
    $activeClients = [];
    
    if (file_exists($activeSessionsFile)) {
        $data = file_get_contents($activeSessionsFile);
        if ($data) {
            $sessions = json_decode($data, true) ?: [];
            if (isset($sessions[$sessionId]) && isset($sessions[$sessionId]['clients'])) {
                $activeClients = array_keys($sessions[$sessionId]['clients']);
            }
        }
    }
    
    return $activeClients;
}

// Handle POST requests (client sending a signal to another client)
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Read the request body
    $inputJSON = file_get_contents('php://input');
    $input = json_decode($inputJSON, TRUE);
    
    // Validate input
    if (!isset($input['target']) || !isset($input['signal'])) {
        debugLog("Invalid POST request - missing target or signal", $_POST);
        echo json_encode(['error' => 'Missing target or signal']);
        exit;
    }
    
    $target = $input['target'];
    $signal = $input['signal'];
    
    // Log the signal type for debugging
    $signalType = isset($signal['type']) ? $signal['type'] : 'ICE candidate';
    debugLog("Sending signal of type '{$signalType}' to target '{$target}'", $signal);
    
    // Handle 'all' as a special case for broadcast messages
    $broadcastToAll = false;
    if ($target === 'all') {
        $broadcastToAll = true;
    } else {
        // Validate target format
        if (!preg_match('/^client-[0-9]+-[a-z0-9]+$/', $target)) {
            debugLog("Invalid target format: {$target}");
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
        // Get all active clients
        $activeClients = getActiveClients($sessionId);
        debugLog("Broadcasting to all active clients", $activeClients);
        
        // Add the signal to all clients except the sender
        foreach ($activeClients as $activeClientId) {
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
            
            debugLog("Signal queued for client {$activeClientId}");
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
        
        debugLog("Signal queued for target {$target}");
    }
    
    // Save the updated session data
    file_put_contents($sessionFile, json_encode($sessionData));
    
    echo json_encode(['status' => 'success']);
    exit;
}

// Get signals for this client
function getSignalsForClient($sessionFile, $clientId) {
    global $debugMode;
    
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
                
                // Log the signal type for debugging
                if ($debugMode) {
                    $signalType = isset($message['signal']['type']) ? $message['signal']['type'] : 'ICE candidate';
                    debugLog("Retrieved signal of type '{$signalType}' from sender '{$sender}'", $message['signal']);
                }
                
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
    debugLog("Polling for signals");
    
    $result = getSignalsForClient($sessionFile, $clientId);
    $signalCount = count($result['signals']);
    
    debugLog("Found {$signalCount} signals for client");
    
    // Send the signals
    echo json_encode([
        'status' => 'success',
        'signals' => $result['signals'],
        'debug' => $debugMode ? [
            'active_clients' => getActiveClients($sessionId),
            'signalCount' => $signalCount,
            'sessionFile' => $sessionFile
        ] : null
    ]);
    exit;
}

// Handle session status requests
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['status'])) {
    $activeClients = getActiveClients($sessionId);
    $connections = [];
    
    // Load existing session data
    $sessionData = [];
    if (file_exists($sessionFile)) {
        $data = file_get_contents($sessionFile);
        if ($data) {
            $sessionData = json_decode($data, true) ?: [];
        }
    }
    
    // Build a connection matrix
    foreach ($activeClients as $client) {
        $connections[$client] = [];
        foreach ($activeClients as $peer) {
            if ($client !== $peer) {
                $hasOutgoing = isset($sessionData[$client][$peer]) && !empty($sessionData[$client][$peer]);
                $hasIncoming = isset($sessionData[$peer][$client]) && !empty($sessionData[$peer][$client]);
                
                $connections[$client][$peer] = [
                    'outgoing' => $hasOutgoing,
                    'incoming' => $hasIncoming
                ];
            }
        }
    }
    
    echo json_encode([
        'status' => 'success',
        'active_clients' => $activeClients,
        'connections' => $connections,
        'session_data' => $debugMode ? $sessionData : null
    ]);
    exit;
}

// Handle direct view of signaling data (debug-only)
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['view']) && $debugMode) {
    if (file_exists($sessionFile)) {
        $data = file_get_contents($sessionFile);
        if ($data) {
            $sessionData = json_decode($data, true) ?: [];
            echo json_encode([
                'status' => 'success',
                'session_data' => $sessionData
            ]);
            exit;
        }
    }
    
    echo json_encode([
        'status' => 'error',
        'message' => 'No session data found'
    ]);
    exit;
}

// Handle debug log requests
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['logs']) && $debugMode) {
    $logFile = $debugLogDir . "/webrtc_{$sessionId}.log";
    
    // If log file doesn't exist, create a placeholder entry
    if (!file_exists($logFile)) {
        // Create directory if it doesn't exist
        if (!file_exists($debugLogDir)) {
            mkdir($debugLogDir, 0755, true);
        }
        
        // Create a placeholder log entry
        $timestamp = date('Y-m-d H:i:s');
        $initialLog = "[{$timestamp}] [{$sessionId}] [system] Debug logging initialized for session {$sessionId}\n";
        $initialLog .= "[{$timestamp}] [{$sessionId}] [system] Client {$clientId} requested logs\n";
        file_put_contents($logFile, $initialLog);
        
        echo json_encode([
            'status' => 'success',
            'logs' => $initialLog,
            'note' => 'New log file created'
        ]);
        exit;
    }
    
    // Read the log file
    $logs = file_get_contents($logFile);
    echo json_encode([
        'status' => 'success',
        'logs' => $logs
    ]);
    exit;
}

// Handle debug ping (to ensure log file exists)
if (($_SERVER['REQUEST_METHOD'] === 'POST' || $_SERVER['REQUEST_METHOD'] === 'GET') && isset($_GET['ping']) && $debugMode) {
    // Create log directory if it doesn't exist
    if (!file_exists($debugLogDir)) {
        mkdir($debugLogDir, 0755, true);
    }
    
    $logFile = $debugLogDir . "/webrtc_{$sessionId}.log";
    $timestamp = date('Y-m-d H:i:s');
    
    // Read request body if it's a POST
    $inputData = null;
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $inputJSON = file_get_contents('php://input');
        $inputData = json_decode($inputJSON, TRUE);
    }
    
    $pingLog = "[{$timestamp}] [{$sessionId}] [{$clientId}] Debug ping received\n";
    
    // Add client info if provided
    if ($inputData && isset($inputData['clientInfo'])) {
        $pingLog .= "[{$timestamp}] [{$sessionId}] [{$clientId}] Client info: " . json_encode($inputData['clientInfo']) . "\n";
    }
    
    // Write to log file
    if (file_exists($logFile)) {
        file_put_contents($logFile, $pingLog, FILE_APPEND);
    } else {
        file_put_contents($logFile, $pingLog);
    }
    
    echo json_encode([
        'status' => 'success',
        'message' => 'Debug ping received and logged'
    ]);
    exit;
}

echo json_encode(['error' => 'Invalid request method']);
?>
