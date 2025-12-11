#!/bin/bash

# Mooza Deployment Fix Script
# Attempts to fix common deployment issues

echo "========================================="
echo "  Mooza Deployment Fix Script"
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

# Check Docker installation
check_docker() {
    log "Checking Docker installation..."
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed"
        return 1
    fi
    
    # Check if Docker daemon is running
    if ! systemctl is-active --quiet docker; then
        log "Starting Docker daemon..."
        systemctl start docker
        if ! systemctl is-active --quiet docker; then
            error "Failed to start Docker daemon"
            return 1
        fi
    fi
    
    success "Docker is installed and running"
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
    success "Deployment directory exists"
    return 0
}

# Validate docker-compose configuration
validate_compose() {
    log "Validating Docker Compose configuration..."
    if [ ! -f "docker-compose.yml" ] && [ ! -f "docker-compose.prod.yml" ]; then
        error "No docker-compose file found"
        return 1
    fi
    
    local compose_file="docker-compose.yml"
    if [ -f "docker-compose.prod.yml" ]; then
        compose_file="docker-compose.prod.yml"
    fi
    
    docker compose -f $compose_file config >/dev/null 2>&1
    if [ $? -ne 0 ]; then
        error "Docker Compose configuration is invalid"
        docker compose -f $compose_file config
        return 1
    fi
    
    success "Docker Compose configuration is valid"
    return 0
}

# Check environment variables
check_env_vars() {
    log "Checking environment variables..."
    
    # Generate JWT_SECRET if not set
    if [ -z "$JWT_SECRET" ]; then
        log "Generating new JWT_SECRET..."
        export JWT_SECRET=$(openssl rand -base64 32)
    fi
    
    # Save to .env file
    echo "JWT_SECRET=$JWT_SECRET" > .env
    success "Environment variables configured"
    return 0
}

# Stop existing containers
stop_containers() {
    log "Stopping existing containers..."
    
    local compose_file="docker-compose.yml"
    if [ -f "docker-compose.prod.yml" ]; then
        compose_file="docker-compose.prod.yml"
    fi
    
    docker compose -f $compose_file down >/dev/null 2>&1
    success "Existing containers stopped"
    return 0
}

# Rebuild and start services
rebuild_and_start() {
    log "Rebuilding and starting services..."
    
    local compose_file="docker-compose.yml"
    if [ -f "docker-compose.prod.yml" ]; then
        compose_file="docker-compose.prod.yml"
    fi
    
    # Build and start services
    JWT_SECRET=$JWT_SECRET docker compose -f $compose_file up -d --build >/dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        success "Services rebuilt and started successfully"
        return 0
    else
        error "Failed to start services"
        return 1
    fi
}

# Check service status
check_status() {
    log "Checking service status..."
    
    local compose_file="docker-compose.yml"
    if [ -f "docker-compose.prod.yml" ]; then
        compose_file="docker-compose.prod.yml"
    fi
    
    echo "Container status:"
    docker compose -f $compose_file ps
    
    # Wait a moment for services to start
    sleep 10
    
    # Check API health
    log "Checking API health..."
    if curl -f http://localhost:4000/health >/dev/null 2>&1; then
        success "API is responding"
    else
        warning "API health check failed"
        log "API logs:"
        docker compose -f $compose_file logs api | tail -n 10
    fi
    
    # Check nginx
    log "Checking Nginx..."
    if curl -f http://localhost >/dev/null 2>&1; then
        success "Nginx is responding"
    else
        warning "Nginx health check failed"
        log "Nginx logs:"
        docker compose -f $compose_file logs nginx | tail -n 10
    fi
    
    return 0
}

# Main function
main() {
    check_root
    check_docker || exit 1
    check_deployment_dir || exit 1
    validate_compose || exit 1
    check_env_vars || exit 1
    stop_containers || exit 1
    rebuild_and_start || exit 1
    check_status
    
    echo
    success "Deployment fix attempt completed!"
    echo "Check the status above to see if services are running correctly."
    echo
    echo "If issues persist, run the troubleshooting script:"
    echo "  curl -fsSL -o troubleshoot.sh https://raw.githubusercontent.com/cryptoChaosDev/mooza_dev/master/deployment/troubleshoot.sh"
    echo "  chmod +x troubleshoot.sh"
    echo "  sudo ./troubleshoot.sh"
}

# Run main function
main "$@"