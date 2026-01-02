#!/bin/bash

# Mooza Deployment and Testing Script
# This script rebuilds the containers and tests their functionality

set -e  # Exit on any error

echo "==========================================="
echo "Mooza Deployment and Testing Script"
echo "==========================================="

echo
echo "Step 1: Stopping existing containers..."
docker compose down || true

echo
echo "Step 2: Pulling latest code changes..."
git pull origin master

echo
echo "Step 3: Building frontend..."
cd frontend
npm install
npm run build
cd ..

echo
echo "Step 4: Rebuilding API container with no cache..."
docker compose build --no-cache api

echo
echo "Step 5: Starting services..."
docker compose up -d

echo
echo "Step 6: Waiting for containers to start (10 seconds)..."
sleep 10

echo
echo "Step 7: Checking container status..."
docker ps

echo
echo "Step 8: Checking API logs for errors..."
echo "API Container Logs:"
docker compose logs api

echo
echo "Step 9: Checking nginx logs..."
echo "Nginx Container Logs:"
docker compose logs nginx

echo
echo "Step 10: Testing API endpoint..."
if curl -f -s -o /dev/null http://localhost:4000/; then
    echo "✓ API is responding"
else
    echo "✗ API is not responding"
fi

echo
echo "Step 11: Testing nginx frontend..."
if curl -f -s -o /dev/null http://localhost/; then
    echo "✓ Frontend is accessible"
else
    echo "✗ Frontend is not accessible"
fi

echo
echo "Step 12: Checking if API container is running..."
API_STATUS=$(docker ps --filter "name=mooza-api-1" --format "table {{.Status}}" | grep -v Status || echo "not running")
if [[ "$API_STATUS" == *"Up"* ]]; then
    echo "✓ API container is running"
else
    echo "✗ API container is not running - check the logs above for errors"
fi

echo
echo "Step 13: Checking if nginx container is running..."
NGINX_STATUS=$(docker ps --filter "name=mooza-nginx-1" --format "table {{.Status}}" | grep -v Status || echo "not running")
if [[ "$NGINX_STATUS" == *"Up"* ]]; then
    echo "✓ Nginx container is running"
else
    echo "✗ Nginx container is not running"
fi

echo
echo "Step 14: Testing specific API endpoints..."
echo "Testing API root endpoint:"
curl -s -w "\nHTTP Status: %{http_code}\n" -o /dev/null http://localhost:4000/

echo
echo "Testing API health endpoint (if available):"
curl -s -w "\nHTTP Status: %{http_code}\n" -o /dev/null http://localhost:4000/api/health 2>/dev/null || echo "Health endpoint not available"

echo
echo "Step 15: Checking frontend CSS file accessibility..."
if curl -f -s -o /dev/null http://localhost/static/css/main.*.css 2>/dev/null; then
    echo "✓ Frontend CSS is accessible"
else
    # Try to find the actual CSS file name
    CSS_FILE=$(curl -s http://localhost/ 2>/dev/null | grep -o 'static/css/main\.[a-z0-9]\+\.css' | head -1)
    if [ -n "$CSS_FILE" ]; then
        if curl -f -s -o /dev/null http://localhost/$CSS_FILE 2>/dev/null; then
            echo "✓ Frontend CSS is accessible as $CSS_FILE"
        else
            echo "✗ Frontend CSS is not accessible as $CSS_FILE"
        fi
    else
        echo "✗ Could not find CSS file in frontend"
    fi
fi

echo
echo "==========================================="
echo "Deployment and Testing Complete"
echo "==========================================="

echo
echo "Summary:"
echo "- Check the logs above for any errors"
echo "- If API container is still failing, run: docker compose logs api"
echo "- If you need to troubleshoot further, check: docker ps -a"
echo "- To view live logs: docker compose logs -f api"