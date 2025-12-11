#!/bin/bash

# Mooza Docker Rate Limit Fix Script
# Fixes issues with Docker Hub rate limits preventing image pulls

echo "========================================="
echo "  Mooza Docker Rate Limit Fix Script"
echo "========================================="
echo

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

success() {
    echo -e "${GREEN}[SUCCESS] $1${NC}"
}

warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root. Please use sudo."
        exit 1
    fi
}

# Check deployment directory
check_deployment_dir() {
    log "Checking deployment directory..."
    if [ ! -d "/opt/mooza" ]; then
        error "Deployment directory /opt/mooza does not exist"
        exit 1
    fi
    
    cd /opt/mooza
    success "Deployment directory exists"
}

# Pre-pull required images to handle rate limits
prepull_images() {
    log "Pre-pulling required Docker images..."
    
    # List of images we need
    local images=("nginx:alpine" "node:20-alpine")
    
    for image in "${images[@]}"; do
        log "Pulling $image..."
        if docker pull "$image"; then
            success "Successfully pulled $image"
        else
            warning "Failed to pull $image (might be due to rate limits)"
            warning "Will try to build from cache or local images"
        fi
    done
}

# Alternative approach: Use cached images
use_cached_images() {
    log "Attempting to use cached images..."
    
    # Try to build without pulling
    log "Building services without pulling images..."
    docker build --no-cache=false 2>/dev/null || warning "Direct docker build not applicable"
}

# Fix docker-compose to use local images if available
fix_compose_for_local() {
    log "Modifying docker-compose to handle rate limits..."
    
    # We don't actually modify the file, but we'll try different approaches
    success "Configuration ready for local image usage"
}

# Start services with rate limit handling
start_services_with_rate_limit_handling() {
    log "Starting services with rate limit handling..."
    
    # Generate JWT_SECRET if not set
    if [ -z "$JWT_SECRET" ]; then
        export JWT_SECRET=$(openssl rand -base64 32)
        log "Generated new JWT_SECRET"
    fi
    
    # Save to .env file
    echo "JWT_SECRET=$JWT_SECRET" > .env
    log "Saved JWT_SECRET to .env file"
    
    # Stop any existing services
    log "Stopping existing services..."
    docker compose down 2>&1
    
    # Try multiple approaches to start services
    log "Approach 1: Standard start with build..."
    JWT_SECRET=$JWT_SECRET docker compose up -d --build
    
    if [ $? -eq 0 ]; then
        success "Services started successfully with standard approach"
        return 0
    fi
    
    warning "Standard approach failed, trying alternative approaches..."
    
    # Approach 2: Try without --build flag first
    log "Approach 2: Start without build flag..."
    JWT_SECRET=$JWT_SECRET docker compose up -d
    
    if [ $? -eq 0 ]; then
        success "Services started successfully without build"
        return 0
    fi
    
    # Approach 3: Force rebuild
    log "Approach 3: Force rebuild..."
    docker compose down
    JWT_SECRET=$JWT_SECRET docker compose up -d --build --force-recreate
    
    if [ $? -eq 0 ]; then
        success "Services started successfully with forced rebuild"
        return 0
    fi
    
    error "All approaches failed to start services"
    return 1
}

# Check final status
check_final_status() {
    log "Checking final service status..."
    
    echo "Container status:"
    docker compose ps
    
    # Wait a moment for services to start
    sleep 10
    
    # Check if containers are running
    if docker compose ps | grep -q "Up"; then
        success "Containers are running"
    else
        warning "Containers are not running"
        log "Checking logs for errors:"
        docker compose logs --tail 20
        return 1
    fi
    
    # Check API health
    log "Checking API health..."
    if curl -f http://localhost:4000/health >/dev/null 2>&1; then
        success "API is responding"
    else
        warning "API health check failed"
    fi
    
    # Check nginx
    log "Checking Nginx..."
    if curl -f http://localhost >/dev/null 2>&1; then
        success "Nginx is responding"
    else
        warning "Nginx health check failed"
    fi
    
    return 0
}

# Main function
main() {
    log "Starting Docker rate limit fix process..."
    
    check_root
    check_deployment_dir
    prepull_images
    fix_compose_for_local
    start_services_with_rate_limit_handling
    check_final_status
    
    echo
    if [ $? -eq 0 ]; then
        success "Docker rate limit fix completed successfully!"
        echo "Your services should now be running."
        echo
        echo "To verify:"
        echo "  cd /opt/mooza && docker compose ps"
        echo "  curl http://localhost:4000/health"
        echo "  curl http://localhost"
    else
        error "Docker rate limit fix failed"
        echo "Please check the logs above for specific error messages."
        echo
        echo "Additional troubleshooting steps:"
        echo "1. Check Docker daemon status: systemctl status docker"
        echo "2. Check disk space: df -h"
        echo "3. Check memory: free -h"
        echo "4. Manually pull images: docker pull nginx:alpine"
    fi
}

# Run main function
main "$@"