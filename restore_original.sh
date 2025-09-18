#!/bin/bash

# Restore the original App.jsx if needed
echo "This script will restore the original App.jsx file from backup."
echo "Only run this if you need to revert the WebRTC refactoring."

if [ -f "src/App.jsx.backup" ]; then
  echo "Restoring original App.jsx from backup..."
  cp src/App.jsx.backup src/App.jsx
  echo "Done! Original App.jsx has been restored."
else
  echo "Error: Backup file src/App.jsx.backup not found!"
  echo "Cannot restore the original file."
fi
