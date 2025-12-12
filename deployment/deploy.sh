#!/bin/bash

# Deployment script for Mooza application
echo "Starting deployment..."

# Navigate to the application directory
cd /opt/mooza

# Pull the latest changes from the repository
echo "Pulling latest changes from repository..."
git pull origin master

# Stop the current containers
echo "Stopping current containers..."
sudo docker compose -f docker-compose.prod.yml down

# Build and start the containers
echo "Building and starting containers..."
sudo docker compose -f docker-compose.prod.yml up -d --build

# Show the status of the containers
echo "Checking container status..."
sudo docker compose -f docker-compose.prod.yml ps

echo "Deployment completed!"