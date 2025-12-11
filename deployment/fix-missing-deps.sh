#!/bin/bash

# Mooza Missing Dependencies Fix Script
# Fixes issues with missing dependencies in backend package.json

echo "========================================="
echo "  Mooza Missing Dependencies Fix Script"
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

# Update backend dependencies
update_backend_dependencies() {
    log "Updating backend dependencies..."
    
    if [ ! -d "backend" ]; then
        error "Backend directory not found"
        exit 1
    fi
    
    cd backend
    
    # Check if xss is already in package.json
    if grep -q '"xss":' package.json && grep -q '"@types/xss":' package.json; then
        success "xss dependencies already present in package.json"
        cd ..
        return 0
    fi
    
    # Add xss dependency to package.json
    log "Adding xss dependency to package.json..."
    
    # Use jq to add the dependencies if available
    if command -v jq &> /dev/null; then
        # Add xss to dependencies
        jq '.dependencies += {"xss": "^1.0.15"}' package.json > temp.json && mv temp.json package.json
        
        # Add @types/xss to devDependencies
        jq '.devDependencies += {"@types/xss": "^1.0.0"}' package.json > temp.json && mv temp.json package.json
        
        success "Added xss dependencies using jq"
    else
        warning "jq not available, dependencies should already be added manually"
    fi
    
    cd ..
}

# Reinstall backend dependencies
reinstall_backend_dependencies() {
    log "Reinstalling backend dependencies..."
    
    cd backend
    
    # Clean install
    if [ -d "node_modules" ]; then
        log "Removing existing node_modules..."
        rm -rf node_modules
    fi
    
    if [ -f "package-lock.json" ]; then
        log "Removing existing package-lock.json..."
        rm -f package-lock.json
    fi
    
    # Install dependencies
    log "Installing backend dependencies..."
    npm ci
    
    if [ $? -eq 0 ]; then
        success "Backend dependencies installed successfully"
    else
        error "Failed to install backend dependencies"
        cd ..
        return 1
    fi
    
    cd ..
}

# Rebuild and restart services
rebuild_and_restart() {
    log "Rebuilding and restarting services..."
    
    # Generate JWT_SECRET if not set
    if [ -z "$JWT_SECRET" ]; then
        export JWT_SECRET=$(openssl rand -base64 32)
        log "Generated new JWT_SECRET"
    fi
    
    # Save to .env file
    echo "JWT_SECRET=$JWT_SECRET" > .env
    log "Saved JWT_SECRET to .env file"
    
    # Stop services
    log "Stopping services..."
    docker compose down 2>/dev/null || true
    
    # Rebuild and start services
    log "Rebuilding and starting services..."
    JWT_SECRET=$JWT_SECRET docker compose up -d --build
    
    if [ $? -eq 0 ]; then
        success "Services rebuilt and started successfully"
    else
        error "Failed to rebuild and start services"
        return 1
    fi
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
    log "Starting missing dependencies fix process..."
    
    check_root
    check_deployment_dir
    update_backend_dependencies
    reinstall_backend_dependencies
    rebuild_and_restart
    check_final_status
    
    echo
    if [ $? -eq 0 ]; then
        success "Missing dependencies fix completed successfully!"
        echo "Your services should now be running."
        echo
        echo "To verify:"
        echo "  cd /opt/mooza && docker compose ps"
        echo "  curl http://localhost:4000/health"
        echo "  curl http://localhost"
    else
        error "Missing dependencies fix failed"
        echo "Please check the logs above for specific error messages."
        echo
        echo "Additional troubleshooting steps:"
        echo "1. Check Docker daemon status: systemctl status docker"
        echo "2. Check disk space: df -h"
        echo "3. Check memory: free -h"
        echo "4. Manually verify backend/package.json has xss dependencies"
        echo "5. Try running the detailed diagnostics script"
    fi
}

# Run main function
main "$@"