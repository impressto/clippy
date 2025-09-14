<?php
/**
 * Clippy - Text Sharing Application
 * 
 * This file serves as the entry point for the Clippy application.
 * It loads the built React application and handles proper routing.
 */

// Configuration
$basePath = '/clippy';  // Base path for the application
$assetsUrl = 'https://impressto.ca/clippy/dist';  // URL where the React assets are located

// Check if the request is for the API
if (preg_match('#^/api/.*#', $_SERVER['REQUEST_URI'])) {
    // If the request is for the API, forward to the appropriate file
    include __DIR__ . '/api/share.php';
    exit;
}

// Handle redirection from index.php to the hash-based routing
if (basename($_SERVER['SCRIPT_NAME']) == 'index.php' && isset($_GET['share'])) {
    // If we're accessing index.php directly with a share parameter,
    // redirect to the hash-based URL
    $shareId = htmlspecialchars($_GET['share']);
    header("Location: {$basePath}/#/share/{$shareId}");
    exit;
}

// For all other requests, serve the React app
?>
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <base href="<?php echo $basePath; ?>/" />
    <title>Clippy - Secure Text Sharing</title>
  <meta name="color-scheme" content="light dark" />
    <link rel="icon" type="image/png" href="https://impressto.ca/images/clippy.png" />
    <script type="module" crossorigin src="<?php echo $assetsUrl; ?>/assets/index.js"></script>
    <link rel="stylesheet" href="<?php echo $assetsUrl; ?>/assets/index.css">
    <script>
      window.appBasePath = "<?php echo $basePath; ?>";
    </script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>