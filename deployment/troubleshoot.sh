#!/bin/bash

# Mooza Troubleshooting Script
# Helps diagnose issues with the deployed application

echo "========================================="
echo "  Mooza Troubleshooting Script"
echo "========================================="
echo

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    echo "This script should be run as root for full diagnostics."
    echo "Some checks may be limited."
    echo
fi

echo "1. Checking Docker installation..."
if command -v docker &> /dev/null; then
    docker --version
else
    echo "Docker is not installed"
fi
echo

echo "2. Checking Docker Compose installation..."
if command -v docker-compose &> /dev/null; then
    docker-compose --version
else
    echo "Docker Compose is not installed"
fi
echo

echo "3. Checking deployment directory..."
if [ -d "/opt/mooza" ]; then
    echo "Deployment directory exists"
    ls -la /opt/mooza
else
    echo "Deployment directory does not exist"
fi
echo

echo "4. Checking environment variables..."
if [ -d "/opt/mooza" ]; then
    cd /opt/mooza
    if [ -f ".env" ]; then
        echo ".env file exists:"
        cat .env
    else
        echo "No .env file found"
    fi
else
    echo "Deployment directory not found"
fi
echo

echo "5. Checking Docker Compose configuration..."
if [ -d "/opt/mooza" ]; then
    cd /opt/mooza
    if [ -f "docker-compose.yml" ]; then
        echo "docker-compose.yml exists, validating..."
        docker compose config >/dev/null 2>&1
        if [ $? -eq 0 ]; then
            echo "Docker Compose configuration is valid"
        else
            echo "Docker Compose configuration has errors:"
            docker compose config
        fi
    else
        echo "docker-compose.yml not found"
    fi
else
    echo "Deployment directory not found"
fi
echo

echo "6. Checking running containers..."
if command -v docker &> /dev/null; then
    if docker compose ps &> /dev/null; then
        echo "Container status:"
        docker compose -f /opt/mooza/docker-compose.yml ps 2>/dev/null || docker compose ps
    else
        echo "No containers running or docker-compose not working"
    fi
else
    echo "Docker not available"
fi
echo

echo "7. Checking container logs..."
if [ -d "/opt/mooza" ] && command -v docker &> /dev/null; then
    cd /opt/mooza
    echo "--- Nginx logs ---"
    docker compose logs nginx 2>/dev/null | tail -n 15 || echo "Could not get nginx logs"
    echo
    echo "--- API logs ---"
    docker compose logs api 2>/dev/null | tail -n 30 || echo "Could not get API logs"
    
    # Check for JWT_SECRET warnings specifically
    echo
    echo "--- Checking for JWT_SECRET warnings ---"
    if docker compose logs api 2>/dev/null | grep -q "JWT_SECRET"; then
        echo "Found JWT_SECRET related messages in API logs:"
        docker compose logs api 2>/dev/null | grep "JWT_SECRET" | tail -n 5
    else
        echo "No JWT_SECRET warnings found in API logs"
    fi
    
    # Check for common startup errors
    echo
    echo "--- Checking for startup errors ---"
    if docker compose logs api 2>/dev/null | grep -E "(Error|Exception|failed|refused)"; then
        echo "Found potential errors in API logs:"
        docker compose logs api 2>/dev/null | grep -E "(Error|Exception|failed|refused)" | tail -n 10
    else
        echo "No obvious startup errors found in API logs"
    fi
else
    echo "Cannot check logs - deployment directory or Docker not available"
fi
echo

echo "8. Checking network connectivity..."
if command -v curl &> /dev/null; then
    echo "Testing localhost:4000 (API)..."
    curl -v http://localhost:4000/health 2>&1 | head -n 15
    echo
    echo "Testing localhost:80 (Nginx)..."
    curl -v http://localhost 2>&1 | head -n 15
else
    echo "curl not available"
fi
echo

echo "9. Checking disk space..."
df -h
echo

echo "10. Checking system resources..."
free -h
echo

echo "11. Checking Docker daemon status..."
systemctl is-active docker >/dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "Docker daemon is running"
else
    echo "Docker daemon is not running"
    systemctl status docker | head -n 10
fi
echo

echo "Troubleshooting complete."
echo
echo "Common solutions:"
echo "1. If JWT_SECRET warning appears, the secret is not being passed to containers"
echo "2. If containers aren't starting, check the logs above for error messages"
echo "3. If API isn't responding, ensure the backend built correctly"
echo "4. If nginx isn't serving content, check the nginx configuration"
echo "5. If database issues occur, check the backend logs for Prisma errors"
echo "6. If Docker daemon is not running, start it with: sudo systemctl start docker"
echo
echo "To manually check container status:"
echo "  cd /opt/mooza && docker compose ps"
echo
echo "To view detailed logs:"
echo "  cd /opt/mooza && docker compose logs api"
echo "  cd /opt/mooza && docker compose logs nginx"
echo
echo "To restart services with proper environment variables:"
echo "  cd /opt/mooza && export JWT_SECRET=\$(openssl rand -base64 32) && echo \"JWT_SECRET=\$JWT_SECRET\" > .env && docker compose down && JWT_SECRET=\$JWT_SECRET docker compose up -d"
echo
echo "To rebuild and restart services:"
echo "  cd /opt/mooza && docker compose down && docker compose up -d --build"