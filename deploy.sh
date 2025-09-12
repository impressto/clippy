#!/bin/bash

# Clippy Deployment Script
# This script builds and prepares the application for deployment

# Display help information
function show_usage {
  echo "Usage: $0 [dev|prod]"
  echo "  dev  - Build for development environment"
  echo "  prod - Build for production environment (default)"
  exit 1
}

# Set environment based on argument
ENV=${1:-prod}  # Default to prod if no argument given

# Create or update the .env file for development
if [ "$ENV" = "dev" ]; then
  echo "Building for development environment..."
  echo "VITE_API_BASE_URL=https://impressto.ca/clippy/api" > .env.local
  echo "DEV=true" >> .env.local
  # Ensure base path is / for development
  sed -i 's/base: "\/clippy\/",/base: "\/",/' vite.config.js 2>/dev/null || true
fi

# Create or update the .env file for production
if [ "$ENV" = "prod" ]; then
  echo "Building for production environment..."
  echo "VITE_API_BASE_URL=https://impressto.ca/clippy/api" > .env.production
  # Ensure base path is /clippy/ for production
  sed -i 's/base: "\/",/base: "\/clippy\/",/' vite.config.js 2>/dev/null || true
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  yarn
fi

# Build the application
echo "Building the application..."
yarn build

# Check if the build was successful
if [ ! -d "dist" ]; then
  echo "Error: Build failed"
  exit 1
fi

# Create the data directory if it doesn't exist
if [ ! -d "data" ]; then
  echo "Creating data directory..."
  mkdir -p data
  chmod 755 data
fi

echo "Build complete!"
echo ""
echo "To deploy this application:"
echo "1. Upload all files to your web server"
echo "2. Ensure the server is configured to handle PHP"
echo "3. Make sure the 'data' directory is writable by the web server"
echo ""

if [ "$ENV" = "dev" ]; then
  echo "For local testing: yarn dev"
fi

if [ "$ENV" = "prod" ]; then
  echo "Your application will be available at: https://impressto.ca/clippy/"
fi
