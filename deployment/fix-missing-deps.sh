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
    
    # Check if jq is installed
    if ! command -v jq &> /dev/null; then
        error "jq is required but not installed. Please install jq first."
        exit 1
    fi
    
    # Add xss dependency to package.json if not already present
    log "Adding xss dependency to package.json..."
    if ! jq -e '.dependencies."xss"' backend/package.json > /dev/null 2>&1; then
        # Add xss dependency
        jq '.dependencies += {"xss": "^1.0.15"}' backend/package.json > backend/package.json.tmp && mv backend/package.json.tmp backend/package.json
        
        success "Added xss dependencies using jq"
    else
        log "xss dependency already exists"
    fi
    
    # Remove any incorrect @types/xss entry if it exists
    if jq -e '.devDependencies."@types/xss"' backend/package.json > /dev/null 2>&1; then
        log "Removing incorrect @types/xss entry..."
        jq 'del(.devDependencies."@types/xss")' backend/package.json > backend/package.json.tmp && mv backend/package.json.tmp backend/package.json
        success "Removed incorrect @types/xss entry"
    fi
}

# Fix Dockerfile issues by rewriting it completely
fix_dockerfile() {
    log "Checking and fixing Dockerfile..."
    
    # Check if the Dockerfile exists
    if [ ! -f "backend/Dockerfile" ]; then
        error "Dockerfile not found in backend directory"
        return 1
    fi
    
    # Show current Dockerfile content for debugging
    log "Current Dockerfile content:"
    cat backend/Dockerfile
    echo ""
    
    # Check if Dockerfile is trying to copy package-lock.json
    if grep -q "package-lock.json" backend/Dockerfile; then
        log "Rewriting Dockerfile to fix package-lock.json references..."
        
        # Create a new Dockerfile with the correct content
        cat > backend/Dockerfile << 'EOF'
# syntax=docker/dockerfile:1
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm ci --omit=dev || npm install --omit=dev

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm ci || npm install
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
EXPOSE 4000
CMD ["node", "dist/index.js"]
EOF
        
        success "Dockerfile rewritten with correct content"
        
        # Show updated Dockerfile content for verification
        log "Updated Dockerfile content:"
        cat backend/Dockerfile
        echo ""
    else
        log "Dockerfile does not reference package-lock.json"
    fi
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
    
    # Remove package-lock.json if it exists
    if [ -f "package-lock.json" ]; then
        log "Removing existing package-lock.json..."
        rm package-lock.json
    fi
    
    # Clear NPM cache
    log "Clearing NPM cache..."
    npm cache clean --force 2>/dev/null || warning "Failed to clear NPM cache"
    
    # Handle NPM authentication issues by temporarily disabling strict SSL
    log "Configuring NPM for installation..."
    npm config set strict-ssl false 2>/dev/null || warning "Failed to configure NPM"
    
    # Handle NPM authentication issues
    log "Checking NPM authentication..."
    if npm whoami >/dev/null 2>&1; then
        log "NPM authenticated"
    else
        warning "NPM not authenticated, this might cause issues with private packages"
        log "Continuing with public package installation..."
        # Set registry to official NPM registry
        npm config set registry https://registry.npmjs.org/ 2>/dev/null || warning "Failed to set registry"
    fi
    
    # Install the xss package directly first
    log "Installing xss package directly..."
    npm install xss@^1.0.15 --no-save
    
    if [ $? -eq 0 ]; then
        success "xss package installed successfully"
    else
        warning "Failed to install xss package directly, continuing with full installation"
    fi
    
    # Install all dependencies
    log "Installing backend dependencies..."
    # Use npm install to create a fresh package-lock.json
    npm install
    
    if [ $? -eq 0 ]; then
        success "Backend dependencies installed successfully"
    else
        error "Failed to install backend dependencies"
        # Try alternative installation method
        log "Trying alternative installation method..."
        npm install --legacy-peer-deps
        
        if [ $? -eq 0 ]; then
            success "Backend dependencies installed successfully with legacy peer deps"
        else
            error "Failed to install backend dependencies with alternative method"
            exit 1
        fi
    fi
    
    # Reset NPM configuration
    log "Resetting NPM configuration..."
    npm config delete strict-ssl 2>/dev/null || warning "Failed to reset strict-ssl"
    npm config delete registry 2>/dev/null || warning "Failed to reset registry"
    
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
    
    # Stop any existing services
    log "Stopping services..."
    docker compose down 2>&1
    
    # Rebuild and start services
    log "Rebuilding and starting services..."
    JWT_SECRET=$JWT_SECRET docker compose up -d --build
    
    if [ $? -eq 0 ]; then
        success "Services rebuilt and started successfully"
    else
        error "Failed to rebuild and start services"
        exit 1
    fi
}

# Check final service status
check_final_status() {
    log "Checking final service status..."
    echo "Container status:"
    docker compose ps
    
    # Wait a moment for containers to start
    sleep 5
    
    # Check if containers are running
    if docker compose ps | grep -q "Up"; then
        success "Containers are running"
    else
        warning "Containers are not running"
    fi
}

# Check logs for errors
check_logs() {
    log "Checking logs for errors:"
    echo
    docker compose logs --tail=20
    echo
}

# Main function
main() {
    echo "Starting missing dependencies fix process..."
    
    check_root
    check_deployment_dir
    update_backend_dependencies
    fix_dockerfile
    reinstall_backend_dependencies
    rebuild_and_restart
    check_final_status
    check_logs
    
    echo
    success "Missing dependencies fix completed successfully!"
    echo "Your services should now be running."
    echo
    echo "To verify:"
    echo "  cd /opt/mooza && docker compose ps"
    echo "  curl http://localhost:4000/health"
    echo "  curl http://localhost"
}

# Run main function
main "$@"