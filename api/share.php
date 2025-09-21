<?php
header('Content-Type: application/json');

// Allow requests from any origin during development
$allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:8080',
    'https://impressto.ca'
];

$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';

if (in_array($origin, $allowedOrigins)) {
    header("Access-Control-Allow-Origin: $origin");
} else {
    header("Access-Control-Allow-Origin: https://impressto.ca");
}

header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Credentials: true');
header("X-Content-Type-Options: nosniff");
header("X-Frame-Options: DENY");
header("Content-Security-Policy: default-src 'none'");

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Directory to store shared text files
$dataDir = __DIR__ . '/../data';

try {
    // Create data directory if it doesn't exist
    if (!file_exists($dataDir)) {
        if (!mkdir($dataDir, 0755, true)) {
            throw new Exception("Failed to create data directory at: {$dataDir}");
        }
        chmod($dataDir, 0755); // Ensure proper permissions
    }
    
    // Verify the directory is writable
    if (!is_writable($dataDir)) {
        throw new Exception("Data directory exists but is not writable: {$dataDir}");
    }
} catch (Exception $e) {
    echo json_encode(['status' => 'error', 'message' => 'Server configuration error', 'debug' => $e->getMessage()]);
    exit;
}

// Generate a unique ID for new sessions
if ($_SERVER['REQUEST_METHOD'] === 'GET' && !isset($_GET['id'])) {
    $uniqueId = bin2hex(random_bytes(8)); // Using 8 bytes for stronger security
    echo json_encode(['status' => 'success', 'id' => $uniqueId]);
    exit;
}

// Handle text sharing
// Get session ID from header or query parameter
$id = isset($_SERVER['HTTP_X_SESSION_ID']) ? $_SERVER['HTTP_X_SESSION_ID'] : ($_GET['id'] ?? null);

// Validate ID format to prevent directory traversal
if (!preg_match('/^[a-f0-9]+$/', $id)) {
    echo json_encode(['status' => 'error', 'message' => 'Invalid ID format']);
    exit;
}

$filename = $dataDir . "/shared_text_{$id}.txt";

// For POST requests, save the text to the file
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $inputJSON = file_get_contents('php://input');
    $input = json_decode($inputJSON, TRUE);
    $text = $input['text'] ?? '';
    
    // Limit the text size to prevent DOS attacks (100KB is reasonable for text sharing)
    if (strlen($text) > 100 * 1024) {
        echo json_encode([
            'status' => 'error',
            'message' => 'Text exceeds maximum allowed size of 100KB'
        ]);
        exit;
    }
    
    if ($id && $text !== null) {
        try {
            // Check parent directory exists and is writable before writing
            if (!is_writable(dirname($filename))) {
                throw new Exception("Directory is not writable: " . dirname($filename));
            }
            
            // Set a maximum number of files (prevent unlimited file creation)
            $maxFiles = 1000;
            $files = glob("{$dataDir}/shared_text_*.txt");
            if (count($files) >= $maxFiles) {
                // Optional: Remove oldest file
                if (count($files) > 0) {
                    // Sort files by modification time, oldest first
                    usort($files, function($a, $b) {
                        return filemtime($a) - filemtime($b);
                    });
                    // Delete oldest file
                    @unlink($files[0]);
                }
            }
            
            // Write the text to the file
            if (file_put_contents($filename, $text) === false) {
                throw new Exception("Failed to write to file: {$filename}");
            }
            
            echo json_encode(['status' => 'success']);
        } catch (Exception $e) {
            echo json_encode([
                'status' => 'error',
                'message' => 'Failed to save text file',
                'debug' => $e->getMessage()
            ]);
        }
        exit;
    }
}

// Load text status (lightweight endpoint for polling)
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $id && isset($_GET['status'])) {
    try {
        if (file_exists($filename)) {
            // Get file metadata
            $mtime = filemtime($filename);
            $checksum = md5_file($filename);
            $size = filesize($filename);
            
            echo json_encode([
                'status' => 'success',
                'exists' => true,
                'modified' => $mtime,
                'modified_iso' => date('c', $mtime),
                'checksum' => $checksum,
                'size' => $size
            ]);
        } else {
            // File doesn't exist
            echo json_encode([
                'status' => 'success',
                'exists' => false
            ]);
        }
    } catch (Exception $e) {
        echo json_encode([
            'status' => 'error', 
            'message' => 'Could not retrieve text status',
            'debug' => $e->getMessage()
        ]);
    }
    exit;
}

// Load text
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $id) {
    try {
        if (file_exists($filename)) {
            // Check if the file is readable
            if (!is_readable($filename)) {
                throw new Exception("File exists but is not readable: {$filename}");
            }
            
            // Read the file with error checking
            $content = file_get_contents($filename);
            if ($content === false) {
                throw new Exception("Failed to read file content: {$filename}");
            }
            
            echo json_encode(['status' => 'success', 'text' => $content]);
        } else {
            // Return empty text for new shares
            echo json_encode(['status' => 'success', 'text' => '']);
        }
    } catch (Exception $e) {
        echo json_encode([
            'status' => 'error', 
            'message' => 'Could not retrieve text data',
            'debug' => $e->getMessage()
        ]);
    }
    exit;
}

// If we get here, the request is invalid
echo json_encode(['status' => 'error', 'message' => 'Invalid request']);
?>
