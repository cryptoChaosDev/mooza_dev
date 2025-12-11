#!/bin/bash

# Mooza Detailed Diagnostic Script
# Provides detailed information about deployment issues

echo "========================================="
echo "  Mooza Detailed Diagnostic Script"
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

# Check Docker daemon
check_docker_daemon() {
    log "Checking Docker daemon status..."
    if ! systemctl is-active --quiet docker; then
        error "Docker daemon is not running"
        systemctl status docker --no-pager
        return 1
    else
        success "Docker daemon is running"
        systemctl status docker --no-pager | head -n 3
    fi
    return 0
}

# Check deployment directory
check_deployment_dir() {
    log "Checking deployment directory..."
    if [ ! -d "/opt/mooza" ]; then
        error "Deployment directory /opt/mooza does not exist"
        return 1
    fi
    
    cd /opt/mooza
    log "Deployment directory contents:"
    ls -la
    return 0
}

# Check docker-compose files
check_compose_files() {
    log "Checking docker-compose files..."
    if [ -f "docker-compose.yml" ]; then
        echo "Found docker-compose.yml:"
        head -n 20 docker-compose.yml
        echo
    fi
    
    if [ -f "docker-compose.prod.yml" ]; then
        echo "Found docker-compose.prod.yml:"
        head -n 20 docker-compose.prod.yml
        echo
    fi
    
    if [ ! -f "docker-compose.yml" ] && [ ! -f "docker-compose.prod.yml" ]; then
        error "No docker-compose files found"
        return 1
    fi
    return 0
}

# Validate docker-compose configuration
validate_compose_config() {
    log "Validating Docker Compose configuration..."
    
    local compose_file="docker-compose.yml"
    if [ -f "docker-compose.prod.yml" ]; then
        compose_file="docker-compose.prod.yml"
    fi
    
    log "Using compose file: $compose_file"
    
    # Validate configuration
    if ! docker compose -f $compose_file config >/dev/null 2>&1; then
        error "Docker Compose configuration is invalid"
        docker compose -f $compose_file config
        return 1
    else
        success "Docker Compose configuration is valid"
    fi
    return 0
}

# Check environment files
check_env_files() {
    log "Checking environment files..."
    
    if [ -f ".env" ]; then
        echo ".env file contents:"
        cat .env
        echo
    else
        warning "No .env file found"
    fi
    
    if [ -f "backend/.env" ]; then
        echo "backend/.env file contents:"
        cat backend/.env
        echo
    else
        warning "No backend/.env file found"
    fi
    return 0
}

# Try to start services with verbose output
try_start_services() {
    log "Attempting to start services with verbose output..."
    
    local compose_file="docker-compose.yml"
    if [ -f "docker-compose.prod.yml" ]; then
        compose_file="docker-compose.prod.yml"
    fi
    
    log "Using compose file: $compose_file"
    
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
    docker compose -f $compose_file down 2>&1
    
    # Try to build and start services
    log "Building and starting services..."
    echo "JWT_SECRET=$JWT_SECRET docker compose -f $compose_file up -d --build"
    JWT_SECRET=$JWT_SECRET docker compose -f $compose_file up -d --build
    
    local result=$?
    if [ $result -eq 0 ]; then
        success "Services started successfully"
    else
        error "Failed to start services (exit code: $result)"
        return 1
    fi
    return 0
}

# Check container status
check_container_status() {
    log "Checking container status..."
    
    local compose_file="docker-compose.yml"
    if [ -f "docker-compose.prod.yml" ]; then
        compose_file="docker-compose.prod.yml"
    fi
    
    docker compose -f $compose_file ps
    return 0
}

# Check detailed logs
check_detailed_logs() {
    log "Checking detailed container logs..."
    
    local compose_file="docker-compose.yml"
    if [ -f "docker-compose.prod.yml" ]; then
        compose_file="docker-compose.prod.yml"
    fi
    
    log "=== API Container Logs ==="
    docker compose -f $compose_file logs api --tail 50 2>/dev/null || echo "Could not get API logs"
    
    log "=== Nginx Container Logs ==="
    docker compose -f $compose_file logs nginx --tail 50 2>/dev/null || echo "Could not get Nginx logs"
    
    return 0
}

# Check for common issues
check_common_issues() {
    log "Checking for common issues..."
    
    # Check disk space
    log "Disk space:"
    df -h /
    
    # Check memory
    log "Memory:"
    free -h
    
    # Check if ports are in use
    log "Checking if ports 80 and 4000 are in use:"
    netstat -tlnp | grep ":80\|:4000" || echo "Ports 80 and 4000 are not in use"
    
    return 0
}

# Main function
main() {
    check_root
    check_docker_daemon
    check_deployment_dir
    check_compose_files
    validate_compose_config
    check_env_files
    try_start_services
    check_container_status
    check_detailed_logs
    check_common_issues
    
    echo
    log "Detailed diagnostics complete"
    echo "Review the output above to identify the cause of the deployment issues"
}

# Run main function
main "$@"