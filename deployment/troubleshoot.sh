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

echo "4. Checking running containers..."
if command -v docker &> /dev/null; then
    if docker compose ps &> /dev/null; then
        docker compose -f /opt/mooza/docker-compose.yml ps 2>/dev/null || docker compose ps
    else
        echo "No containers running or docker-compose not working"
    fi
else
    echo "Docker not available"
fi
echo

echo "5. Checking container logs..."
if [ -d "/opt/mooza" ] && command -v docker &> /dev/null; then
    cd /opt/mooza
    echo "--- Nginx logs ---"
    docker compose logs nginx 2>/dev/null | tail -n 10 || echo "Could not get nginx logs"
    echo
    echo "--- API logs ---"
    docker compose logs api 2>/dev/null | tail -n 20 || echo "Could not get API logs"
else
    echo "Cannot check logs - deployment directory or Docker not available"
fi
echo

echo "6. Checking network connectivity..."
if command -v curl &> /dev/null; then
    echo "Testing localhost:4000..."
    curl -v http://localhost:4000/health 2>&1 | head -n 10
else
    echo "curl not available"
fi
echo

echo "7. Checking disk space..."
df -h
echo

echo "8. Checking system resources..."
free -h
echo

echo "Troubleshooting complete."
echo
echo "Common solutions:"
echo "1. If containers aren't starting, check the logs above for error messages"
echo "2. If API isn't responding, ensure the backend built correctly"
echo "3. If nginx isn't serving content, check the nginx configuration"
echo "4. If database issues occur, check the backend logs for Prisma errors"
echo
echo "To manually check container status:"
echo "  cd /opt/mooza && docker compose ps"
echo
echo "To view detailed logs:"
echo "  cd /opt/mooza && docker compose logs api"
echo "  cd /opt/mooza && docker compose logs nginx"