#!/bin/bash

# Deploy script for Clippy WebRTC Socket Server
# This script installs dependencies and starts/restarts the socket server

echo "Deploying Clippy Socket Server..."

# Ensure we're in the socket-server directory
cd "$(dirname "$0")"

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "Node.js is required but not installed. Please install Node.js and try again."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "npm is required but not installed. Please install npm and try again."
    exit 1
fi

# Check if pm2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "pm2 is not installed. Installing pm2 globally..."
    npm install -g pm2
fi

# Install dependencies
echo "Installing dependencies..."
npm install

# Stop existing process if running
if pm2 list | grep -q "clippy-socket-server"; then
    echo "Stopping existing socket server..."
    pm2 stop clippy-socket-server
fi

# Start the server with PM2
echo "Starting socket server with PM2..."
pm2 start server.js --name clippy-socket-server

# Save PM2 configuration
echo "Saving PM2 configuration..."
pm2 save

echo "Socket server deployment complete!"
echo "Server running at http://localhost:$(grep PORT .env | cut -d '=' -f2 || echo 3000)"
