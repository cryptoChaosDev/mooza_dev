#!/bin/bash

# Mooza Frontend API Fix Script
# Fixes issues with frontend API URL configuration for VPS deployment

echo "========================================="
echo "  Mooza Frontend API Fix Script"
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
        error "Deployment directory /opt/mooza not found"
        exit 1
    fi
    
    cd /opt/mooza
    
    if [ ! -f "frontend/package.json" ]; then
        error "frontend/package.json not found"
        exit 1
    fi
    
    if [ ! -f "backend/package.json" ]; then
        error "backend/package.json not found"
        exit 1
    fi
    
    # Create frontend .env file if it doesn't exist
    if [ ! -f "frontend/.env" ]; then
        log "Creating frontend .env file"
        echo "REACT_APP_API_URL=http://147.45.166.246" > frontend/.env
    fi
    
    success "Deployment directory verified"
}

# Rebuild frontend
rebuild_frontend() {
    log "Rebuilding frontend..."
    
    cd frontend
    
    # Clean build directory
    if [ -d "build" ]; then
        rm -rf build
        log "Cleaned build directory"
    fi
    
    # Check if node_modules exists and remove it to ensure clean install
    if [ -d "node_modules" ]; then
        log "Removing existing node_modules directory"
        rm -rf node_modules
    fi
    
    # Install dependencies with verbose output on failure
    log "Installing frontend dependencies..."
    if ! sudo -u "$SUDO_USER" npm ci >> /var/log/mooza-deploy.log 2>&1; then
        warning "npm ci failed, trying npm install..."
        if ! sudo -u "$SUDO_USER" npm install >> /var/log/mooza-deploy.log 2>&1; then
            error "Failed to install frontend dependencies"
            log "Check /var/log/mooza-deploy.log for more details"
            return 1
        fi
    fi
    
    # Build frontend with verbose output on failure
    log "Building frontend..."
    if ! sudo -u "$SUDO_USER" npm run build >> /var/log/mooza-deploy.log 2>&1; then
        error "Failed to build frontend"
        log "Check /var/log/mooza-deploy.log for more details"
        log "Trying to build with increased memory limit..."
        # Try with increased memory limit
        if ! sudo -u "$SUDO_USER" NODE_OPTIONS="--max-old-space-size=4096" npm run build >> /var/log/mooza-deploy.log 2>&1; then
            error "Failed to build frontend even with increased memory"
            log "Last 50 lines of build log:"
            tail -n 50 /var/log/mooza-deploy.log
            return 1
        fi
    fi
    
    # Verify build was successful
    if [ ! -d "build" ] || [ -z "$(ls -A build)" ]; then
        error "Build directory is empty or missing after build process"
        return 1
    fi
    
    log "Verifying build contents..."
    if [ ! -f "build/index.html" ]; then
        error "Build completed but index.html is missing"
        return 1
    fi
    
    success "Frontend rebuilt successfully"
    cd ..
}

# Rebuild backend
rebuild_backend() {
    log "Rebuilding backend..."
    
    cd backend
    
    # Clean dist directory
    if [ -d "dist" ]; then
        rm -rf dist
        log "Cleaned dist directory"
    fi
    
    # Check if node_modules exists and remove it to ensure clean install
    if [ -d "node_modules" ]; then
        log "Removing existing node_modules directory"
        rm -rf node_modules
    fi
    
    # Install dependencies
    log "Installing backend dependencies..."
    if ! sudo -u "$SUDO_USER" npm ci >> /var/log/mooza-deploy.log 2>&1; then
        warning "npm ci failed, trying npm install..."
        if ! sudo -u "$SUDO_USER" npm install >> /var/log/mooza-deploy.log 2>&1; then
            error "Failed to install backend dependencies"
            log "Check /var/log/mooza-deploy.log for more details"
            return 1
        fi
    fi
    
    # Build backend
    log "Building backend..."
    if ! sudo -u "$SUDO_USER" npm run build >> /var/log/mooza-deploy.log 2>&1; then
        error "Failed to build backend"
        log "Check /var/log/mooza-deploy.log for more details"
        return 1
    fi
    
    success "Backend rebuilt successfully"
    cd ..
}

# Restart services
restart_services() {
    log "Restarting services..."
    
    if command -v docker &> /dev/null; then
        # Check if docker-compose file exists
        if [ -f "docker-compose.prod.yml" ]; then
            # Stop services
            log "Stopping services..."
            sudo -u "$SUDO_USER" docker compose -f docker-compose.prod.yml down >> /var/log/mooza-deploy.log 2>&1
            
            # Start services
            log "Starting services..."
            sudo -u "$SUDO_USER" docker compose -f docker-compose.prod.yml up -d --build >> /var/log/mooza-deploy.log 2>&1
            
            if [ $? -eq 0 ]; then
                success "Services restarted successfully"
            else
                error "Failed to restart services"
                return 1
            fi
        else
            error "docker-compose.prod.yml not found"
            return 1
        fi
    else
        error "Docker not found"
        return 1
    fi
}

# Verify deployment
verify_deployment() {
    log "Verifying deployment..."
    
    # Wait a moment for services to start
    sleep 10
    
    # Check if we can access the site
    if command -v curl &> /dev/null; then
        local response_code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/)
        if [ "$response_code" == "200" ]; then
            success "Frontend is accessible (HTTP 200)"
        else
            warning "Frontend returns HTTP $response_code"
        fi
        
        # Check API health
        local api_response_code=$(curl -s -o /dev/null -w "%{http_code}" http://147.45.166.246/health)
        if [ "$api_response_code" == "200" ]; then
            success "API is accessible (HTTP 200)"
        else
            warning "API returns HTTP $api_response_code"
        fi
    else
        warning "curl not available, skipping verification"
    fi
}

# Main execution
main() {
    check_root
    check_deployment_dir
    rebuild_frontend
    rebuild_backend
    restart_services
    verify_deployment
    
    echo
    success "Frontend API fix completed!"
    log "Please access your application at: http://147.45.166.246"
}

# Run main function
main "$@"