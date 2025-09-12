<?php
header('Content-Type: application/json');

// Generate a unique ID for new sessions
if ($_SERVER['REQUEST_METHOD'] === 'GET' && !isset($_GET['id'])) {
    $uniqueId = bin2hex(random_bytes(4));
    echo json_encode(['id' => $uniqueId]);
    exit;
}

// Handle text sharing
$id = $_GET['id'] ?? '';
$text = $_POST['text'] ?? '';
$filename = "shared_text_{$id}.txt";

// Save text
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $id && $text !== '') {
    file_put_contents($filename, $text);
    echo json_encode(['status' => 'success']);
    exit;
}

// Load text
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $id && file_exists($filename)) {
    $content = file_get_contents($filename);
    echo json_encode(['text' => $content]);
    exit;
}

echo json_encode(['error' => 'Invalid request']);
?>
