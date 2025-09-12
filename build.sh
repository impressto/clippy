#!/bin/bash

# Script to build for different environments

# Function to display usage
function show_usage {
  echo "Usage: $0 [dev|prod]"
  echo "  dev  - Build for development environment"
  echo "  prod - Build for production environment"
  exit 1
}

# Check for correct number of arguments
if [ $# -ne 1 ]; then
  show_usage
fi

# Set environment based on argument
ENV=$1

case $ENV in
  dev)
    echo "Building for development environment..."
    echo "VITE_API_BASE_URL=https://impressto.ca/clippy/api" > .env.local
    yarn build
    ;;
  prod)
    echo "Building for production environment..."
    # Set production base in vite.config.js
    sed -i 's/base: "\/",/base: "\/clippy\/",/' vite.config.js
    # Update environment variables
    echo "VITE_API_BASE_URL=https://impressto.ca/clippy/api" > .env.production
    yarn build
    # Restore original vite.config.js
    sed -i 's/base: "\/clippy\/",/base: "\/",/' vite.config.js
    ;;
  *)
    show_usage
    ;;
esac

echo "Build completed!"
