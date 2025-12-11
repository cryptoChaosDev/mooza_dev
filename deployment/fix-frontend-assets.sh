#!/bin/bash

# Mooza Frontend Assets Fix Script
# Fixes issues with frontend asset paths for VPS deployment

echo "========================================="
echo "  Mooza Frontend Assets Fix Script"
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
    
    success "Deployment directory verified"
}

# Fix homepage field in package.json
fix_homepage_field() {
    log "Fixing homepage field in frontend/package.json..."
    
    # Check current homepage value
    local current_homepage=$(grep -o '"homepage": "[^"]*"' frontend/package.json | cut -d'"' -f4)
    
    if [ "$current_homepage" == "." ] || [ "$current_homepage" == "/" ]; then
        success "Homepage field is already correctly set to '$current_homepage'"
        return 0
    fi
    
    log "Current homepage field: $current_homepage"
    log "Updating homepage field to '.'"
    
    # Update the homepage field
    sed -i 's|"homepage": "[^"]*"|"homepage": "."|' frontend/package.json
    
    # Verify the change
    local new_homepage=$(grep -o '"homepage": "[^"]*"' frontend/package.json | cut -d'"' -f4)
    
    if [ "$new_homepage" == "." ]; then
        success "Homepage field successfully updated to '.'"
    else
        error "Failed to update homepage field"
        return 1
    fi
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
    
    success "Frontend rebuilt successfully"
    cd ..
}

# Restart services
restart_services() {
    log "Restarting services..."
    
    if command -v docker &> /dev/null; then
        # Check if docker-compose file exists in current directory
        if [ -f "docker-compose.prod.yml" ]; then
            # Stop services
            sudo -u "$SUDO_USER" docker compose -f docker-compose.prod.yml down >> /var/log/mooza-deploy.log 2>&1
            
            # Start services
            sudo -u "$SUDO_USER" docker compose -f docker-compose.prod.yml up -d --build >> /var/log/mooza-deploy.log 2>&1
            
            if [ $? -eq 0 ]; then
                success "Services restarted successfully"
            else
                error "Failed to restart services"
                return 1
            fi
        # Check if docker-compose file exists in deployment directory
        elif [ -f "deployment/docker-compose.prod.yml" ]; then
            # Stop services
            sudo -u "$SUDO_USER" docker compose -f deployment/docker-compose.prod.yml down >> /var/log/mooza-deploy.log 2>&1
            
            # Start services
            sudo -u "$SUDO_USER" docker compose -f deployment/docker-compose.prod.yml up -d --build >> /var/log/mooza-deploy.log 2>&1
            
            if [ $? -eq 0 ]; then
                success "Services restarted successfully"
            else
                error "Failed to restart services"
                return 1
            fi
        else
            warning "docker-compose.prod.yml not found, skipping Docker restart"
        fi
    else
        warning "Docker not found, skipping service restart"
    fi
}

# Main execution
main() {
    check_root
    check_deployment_dir
    fix_homepage_field
    rebuild_frontend
    restart_services
    
    echo
    success "Frontend assets fix completed!"
    log "Please access your application at: http://your-vps-ip"
}

# Run main function
main "$@"