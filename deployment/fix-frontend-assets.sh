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

# Check and fix public directory
check_public_directory() {
    log "Checking public directory..."
    
    if [ ! -d "frontend/public" ]; then
        error "frontend/public directory not found"
        log "Creating public directory and copying required files..."
        
        # Create public directory
        mkdir -p frontend/public
        
        # Check if we have the source files in the repository
        if [ -d ".git" ]; then
            # Try to restore public directory from git
            log "Attempting to restore public directory from git..."
            git checkout -- frontend/public >> /var/log/mooza-deploy.log 2>&1
        fi
        
        # If public directory is still missing, we need to recreate it
        if [ ! -d "frontend/public" ] || [ -z "$(ls -A frontend/public)" ]; then
            warning "Public directory is empty or missing. Creating minimal required files..."
            
            # Create a basic index.html
            cat > frontend/public/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%PUBLIC_URL%/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <meta name="description" content="Mooza Music Social Network" />
    <link rel="apple-touch-icon" href="%PUBLIC_URL%/logo192.png" />
    <link rel="manifest" href="%PUBLIC_URL%/manifest.json" />
    <link href="https://fonts.googleapis.com/css2?family=Pacifico&display=swap" rel="stylesheet">
    <title>Mooza Music</title>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
  </body>
</html>
EOF
            
            # Create a basic manifest.json
            cat > frontend/public/manifest.json << 'EOF'
{
  "short_name": "Mooza",
  "name": "Mooza Music Social Network",
  "icons": [
    {
      "src": "favicon.ico",
      "sizes": "64x64 32x32 24x24 16x16",
      "type": "image/x-icon"
    },
    {
      "src": "logo192.png",
      "type": "image/png",
      "sizes": "192x192"
    },
    {
      "src": "logo512.png",
      "type": "image/png",
      "sizes": "512x512"
    }
  ],
  "start_url": ".",
  "display": "standalone",
  "theme_color": "#000000",
  "background_color": "#ffffff"
}
EOF
            
            # Create a basic robots.txt
            echo "# https://www.robotstxt.org/robotstxt.html" > frontend/public/robots.txt
            echo "User-agent: *" >> frontend/public/robots.txt
            echo "Disallow:" >> frontend/public/robots.txt
            
            # Create a favicon (empty file, will be replaced if needed)
            touch frontend/public/favicon.ico
        fi
    else
        log "Public directory exists"
        
        # Check if required files exist
        local missing_files=()
        if [ ! -f "frontend/public/index.html" ]; then
            missing_files+=("index.html")
        fi
        if [ ! -f "frontend/public/manifest.json" ]; then
            missing_files+=("manifest.json")
        fi
        if [ ! -f "frontend/public/robots.txt" ]; then
            missing_files+=("robots.txt")
        fi
        
        if [ ${#missing_files[@]} -gt 0 ]; then
            warning "Missing files in public directory: ${missing_files[*]}"
            log "Creating missing files..."
            
            # Create missing files
            for file in "${missing_files[@]}"; do
                case $file in
                    "index.html")
                        cat > frontend/public/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%PUBLIC_URL%/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <meta name="description" content="Mooza Music Social Network" />
    <link rel="apple-touch-icon" href="%PUBLIC_URL%/logo192.png" />
    <link rel="manifest" href="%PUBLIC_URL%/manifest.json" />
    <link href="https://fonts.googleapis.com/css2?family=Pacifico&display=swap" rel="stylesheet">
    <title>Mooza Music</title>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
  </body>
</html>
EOF
                        ;;
                    "manifest.json")
                        cat > frontend/public/manifest.json << 'EOF'
{
  "short_name": "Mooza",
  "name": "Mooza Music Social Network",
  "icons": [
    {
      "src": "favicon.ico",
      "sizes": "64x64 32x32 24x24 16x16",
      "type": "image/x-icon"
    },
    {
      "src": "logo192.png",
      "type": "image/png",
      "sizes": "192x192"
    },
    {
      "src": "logo512.png",
      "type": "image/png",
      "sizes": "512x512"
    }
  ],
  "start_url": ".",
  "display": "standalone",
  "theme_color": "#000000",
  "background_color": "#ffffff"
}
EOF
                        ;;
                    "robots.txt")
                        echo "# https://www.robotstxt.org/robotstxt.html" > frontend/public/robots.txt
                        echo "User-agent: *" >> frontend/public/robots.txt
                        echo "Disallow:" >> frontend/public/robots.txt
                        ;;
                esac
            done
        fi
    fi
    
    success "Public directory checked and fixed"
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
    check_public_directory
    fix_homepage_field
    rebuild_frontend
    restart_services
    
    echo
    success "Frontend assets fix completed!"
    log "Please access your application at: http://your-vps-ip"
}

# Run main function
main "$@"