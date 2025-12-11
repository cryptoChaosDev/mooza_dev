#!/bin/bash

# Simple Mooza Deployment Script
# A simplified deployment script for Ubuntu VPS

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

# Install prerequisites
install_prerequisites() {
    log "Installing prerequisites..."
    
    # Update package list
    apt update -y >/dev/null 2>&1
    
    # Install required packages
    apt install -y curl wget git openssl ufw >/dev/null 2>&1
    
    success "Prerequisites installed"
}

# Install Node.js
install_nodejs() {
    log "Installing Node.js..."
    
    if command -v node &> /dev/null; then
        local version=$(node --version)
        log "Node.js $version already installed"
        return 0
    fi
    
    # Install NodeSource repository
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - >/dev/null 2>&1
    apt-get install -y nodejs >/dev/null 2>&1
    
    local version=$(node --version)
    success "Node.js $version installed"
}

# Install Docker
install_docker() {
    log "Installing Docker..."
    
    if command -v docker &> /dev/null; then
        local version=$(docker --version)
        log "Docker $version already installed"
        return 0
    fi
    
    # Install Docker using official script
    curl -fsSL https://get.docker.com -o get-docker.sh >/dev/null 2>&1
    sh get-docker.sh >/dev/null 2>&1
    rm get-docker.sh
    
    # Start and enable Docker service
    systemctl start docker >/dev/null 2>&1
    systemctl enable docker >/dev/null 2>&1
    
    local version=$(docker --version)
    success "Docker $version installed"
}

# Install Docker Compose
install_docker_compose() {
    log "Installing Docker Compose..."
    
    if command -v docker-compose &> /dev/null; then
        local version=$(docker-compose --version)
        log "Docker Compose $version already installed"
        return 0
    fi
    
    # Install Docker Compose plugin
    apt install -y docker-compose-plugin >/dev/null 2>&1
    
    if command -v docker-compose &> /dev/null; then
        local version=$(docker-compose --version)
        success "Docker Compose $version installed"
    else
        # Fallback to manual installation
        local version="2.24.0"
        curl -L "https://github.com/docker/compose/releases/download/v$version/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose >/dev/null 2>&1
        chmod +x /usr/local/bin/docker-compose
        success "Docker Compose v$version installed manually"
    fi
}

# Setup deployment directory
setup_deployment_directory() {
    log "Setting up deployment directory..."
    
    # Create directory
    mkdir -p /opt/mooza
    cd /opt/mooza
    
    success "Deployment directory ready"
}

# Clone repository
clone_repository() {
    log "Cloning repository..."
    
    cd /opt/mooza
    
    if [ -d ".git" ]; then
        log "Repository exists, pulling latest changes..."
        git pull origin master >/dev/null 2>&1
    else
        log "Cloning repository..."
        git clone https://github.com/cryptoChaosDev/mooza_dev.git . >/dev/null 2>&1
    fi
    
    success "Repository ready"
}

# Install dependencies and build
install_and_build() {
    log "Installing dependencies and building..."
    
    cd /opt/mooza
    
    # Install frontend dependencies and build
    cd frontend
    npm ci >/dev/null 2>&1
    npm run build >/dev/null 2>&1
    cd ..
    
    # Install backend dependencies
    cd backend
    npm ci >/dev/null 2>&1
    npx prisma generate >/dev/null 2>&1
    cd ..
    
    success "Dependencies installed and built"
}

# Create environment file
create_env_file() {
    log "Creating environment file..."
    
    cd /opt/mooza/backend
    
    cat > .env << EOF
NODE_ENV=production
PORT=4000
JWT_SECRET=$(openssl rand -base64 32)
DATABASE_URL=file:./prod.db
EOF
    
    success "Environment file created"
}

# Create docker-compose file
create_docker_compose() {
    log "Creating docker-compose file..."
    
    cd /opt/mooza
    
    cat > docker-compose.yml << 'EOF'
version: "3.8"
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./frontend/build:/usr/share/nginx/html
    depends_on:
      - api
    restart: unless-stopped

  api:
    build: 
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "4000:4000"
    environment:
      - NODE_ENV=production
      - PORT=4000
      - JWT_SECRET=${JWT_SECRET}
      - DATABASE_URL=file:/app/prisma/prod.db
    volumes:
      - api_data:/app/prisma
    restart: unless-stopped

volumes:
  api_data:
EOF
    
    success "Docker Compose file created"
}

# Create Nginx configuration
create_nginx_config() {
    log "Creating Nginx configuration..."
    
    cd /opt/mooza
    
    cat > nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    
    server {
        listen 80;
        server_name _;
        
        root /usr/share/nginx/html;
        index index.html;
        
        location / {
            try_files $uri $uri/ /index.html;
        }
        
        location /api/ {
            proxy_pass http://api:4000/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
        
        location /health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }
    }
}
EOF
    
    success "Nginx configuration created"
}

# Start services
start_services() {
    log "Starting services..."
    
    cd /opt/mooza
    
    # Set JWT secret
    export JWT_SECRET=$(openssl rand -base64 32)
    
    # Start services
    docker compose up -d --build >/dev/null 2>&1
    
    success "Services started"
}

# Check status
check_status() {
    log "Checking status..."
    
    cd /opt/mooza
    
    # Wait a moment for services to start
    sleep 10
    
    # Check if containers are running
    if docker compose ps | grep -q "Up"; then
        success "Containers are running"
    else
        warning "Containers may not be running properly"
    fi
    
    # Check API health
    if curl -f http://localhost:4000/health >/dev/null 2>&1; then
        success "API is responding"
    else
        warning "API health check failed"
    fi
    
    echo
    log "Deployment completed!"
    log "Access your application at: http://your-vps-ip"
    log "API endpoint: http://your-vps-ip/api"
}

# Main function
main() {
    echo "========================================="
    echo "  Mooza Simple Deployment Script"
    echo "========================================="
    echo
    
    check_root
    install_prerequisites
    install_nodejs
    install_docker
    install_docker_compose
    setup_deployment_directory
    clone_repository
    install_and_build
    create_env_file
    create_docker_compose
    create_nginx_config
    start_services
    check_status
    
    echo
    success "Mooza deployment completed successfully!"
    echo "Next steps:"
    echo "  1. Access your application at: http://your-vps-ip"
    echo "  2. For SSL, install certbot: sudo apt install certbot python3-certbot-nginx"
    echo "  3. Then run: sudo certbot --nginx"
}

# Run main function
main "$@"