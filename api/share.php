<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Directory to store shared text files
$dataDir = __DIR__ . '/../data';
if (!file_exists($dataDir)) {
    mkdir($dataDir, 0755, true);
}

// Generate a unique ID for new sessions
if ($_SERVER['REQUEST_METHOD'] === 'GET' && !isset($_GET['id'])) {
    $uniqueId = bin2hex(random_bytes(8)); // Using 8 bytes for stronger security
    echo json_encode(['id' => $uniqueId]);
    exit;
}

// Handle text sharing
$id = $_GET['id'] ?? '';

// Validate ID format to prevent directory traversal
if (!preg_match('/^[a-f0-9]+$/', $id)) {
    echo json_encode(['error' => 'Invalid ID format']);
    exit;
}

$filename = $dataDir . "/shared_text_{$id}.txt";

// For POST requests, get the text from the request body
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $inputJSON = file_get_contents('php://input');
    $input = json_decode($inputJSON, TRUE);
    $text = $input['text'] ?? '';
    
    if ($id && $text !== null) {
        file_put_contents($filename, $text);
        echo json_encode(['status' => 'success']);
        exit;
    }
}

// Load text
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $id) {
    if (file_exists($filename)) {
        $content = file_get_contents($filename);
        echo json_encode(['text' => $content]);
    } else {
        echo json_encode(['text' => '']);
    }
    exit;
}

echo json_encode(['error' => 'Invalid request']);
?>
