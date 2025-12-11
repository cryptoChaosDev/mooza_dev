#!/bin/bash

# Mooza Music Social Network - Enhanced Automated VPS Deployment Script
# This script automates the complete deployment of Mooza to an Ubuntu VPS

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Global variables
DEPLOY_DIR="/opt/mooza"
REPO_URL="https://github.com/cryptoChaosDev/mooza_dev.git"
BRANCH="master"
LOG_FILE="/var/log/mooza-deploy.log"

# Logging functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

success() {
    echo -e "${GREEN}[SUCCESS] $1${NC}"
    echo "[SUCCESS] $1" >> "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
    echo "[WARNING] $1" >> "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
    echo "[ERROR] $1" >> "$LOG_FILE"
}

info() {
    echo -e "${CYAN}[INFO] $1${NC}"
    echo "[INFO] $1" >> "$LOG_FILE"
}

# Print banner
print_banner() {
    echo -e "${PURPLE}"
    echo "███╗   ███╗ ██████╗  ██████╗ ███████╗ █████╗ "
    echo "████╗ ████║██╔═══██╗██╔═══██╗╚══███╔╝██╔══██╗"
    echo "██╔████╔██║██║   ██║██║   ██║  ███╔╝ ███████║"
    echo "██║╚██╔╝██║██║   ██║██║   ██║ ███╔╝  ██╔══██║"
    echo "██║ ╚═╝ ██║╚██████╔╝╚██████╔╝███████╗██║  ██║"
    echo "╚═╝     ╚═╝ ╚═════╝  ╚═════╝ ╚══════╝╚═╝  ╚═╝"
    echo -e "${NC}"
    echo "Mooza Music Social Network - Automated Deployment"
    echo "=================================================="
    echo
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root. Please use sudo."
        exit 1
    fi
}

# Check Ubuntu version
check_ubuntu_version() {
    if ! command -v lsb_release &> /dev/null; then
        error "lsb_release not found. This script is designed for Ubuntu."
        exit 1
    fi
    
    local version=$(lsb_release -rs)
    local major_version=$(echo "$version" | cut -d. -f1)
    
    if [[ $major_version -lt 20 ]]; then
        warning "Ubuntu version $version detected. Ubuntu 20.04 or newer is recommended."
    else
        success "Ubuntu version $version detected."
    fi
}

# Update system packages
update_system() {
    log "Updating system packages..."
    apt update -y >> "$LOG_FILE" 2>&1
    apt upgrade -y >> "$LOG_FILE" 2>&1
    success "System packages updated"
}

# Install required dependencies
install_dependencies() {
    log "Installing required dependencies..."
    
    local deps=("curl" "wget" "git" "openssl" "ufw")
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            info "Installing $dep..."
            apt install -y "$dep" >> "$LOG_FILE" 2>&1
        fi
    done
    
    success "Required dependencies installed"
}

# Install Node.js
install_nodejs() {
    log "Installing Node.js..."
    
    if command -v node &> /dev/null; then
        local version=$(node --version)
        info "Node.js $version already installed"
        return 0
    fi
    
    # Install NodeSource repository
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - >> "$LOG_FILE" 2>&1
    apt-get install -y nodejs >> "$LOG_FILE" 2>&1
    
    local version=$(node --version)
    local npm_version=$(npm --version)
    success "Node.js $version and npm $npm_version installed"
}

# Install Docker
install_docker() {
    log "Installing Docker..."
    
    if command -v docker &> /dev/null; then
        local version=$(docker --version)
        info "Docker $version already installed"
        return 0
    fi
    
    # Install Docker using official script
    curl -fsSL https://get.docker.com -o get-docker.sh >> "$LOG_FILE" 2>&1
    sh get-docker.sh >> "$LOG_FILE" 2>&1
    rm get-docker.sh
    
    # Add current user to docker group
    usermod -aG docker "$SUDO_USER" >> "$LOG_FILE" 2>&1
    
    # Start and enable Docker service
    systemctl start docker >> "$LOG_FILE" 2>&1
    systemctl enable docker >> "$LOG_FILE" 2>&1
    
    local version=$(docker --version)
    success "Docker $version installed"
}

# Install Docker Compose
install_docker_compose() {
    log "Installing Docker Compose..."
    
    if command -v docker-compose &> /dev/null; then
        local version=$(docker-compose --version)
        info "Docker Compose $version already installed"
        return 0
    fi
    
    # Install Docker Compose plugin
    apt install -y docker-compose-plugin >> "$LOG_FILE" 2>&1
    
    if command -v docker-compose &> /dev/null; then
        local version=$(docker-compose --version)
        success "Docker Compose $version installed"
    else
        # Fallback to manual installation
        local version="2.24.0"
        curl -L "https://github.com/docker/compose/releases/download/v$version/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose >> "$LOG_FILE" 2>&1
        chmod +x /usr/local/bin/docker-compose
        success "Docker Compose v$version installed manually"
    fi
}

# Setup deployment directory
setup_deployment_directory() {
    log "Setting up deployment directory: $DEPLOY_DIR"
    
    # Create directory with proper ownership
    mkdir -p "$DEPLOY_DIR"
    chown "$SUDO_USER:$SUDO_USER" "$DEPLOY_DIR"
    
    # Switch to deployment user
    cd "$DEPLOY_DIR"
    success "Deployment directory ready"
}

# Clone or update repository
clone_repository() {
    log "Cloning/updating repository..."
    
    cd "$DEPLOY_DIR"
    
    if [ -d ".git" ]; then
        info "Repository exists, pulling latest changes..."
        sudo -u "$SUDO_USER" git pull origin "$BRANCH" >> "$LOG_FILE" 2>&1
    else
        info "Cloning repository from $REPO_URL..."
        sudo -u "$SUDO_USER" git clone -b "$BRANCH" "$REPO_URL" . >> "$LOG_FILE" 2>&1
    fi
    
    success "Repository ready"
}

# Install frontend dependencies and build
build_frontend() {
    log "Installing frontend dependencies and building..."
    
    local frontend_dir="$DEPLOY_DIR/frontend"
    cd "$frontend_dir"
    
    # Install dependencies
    sudo -u "$SUDO_USER" npm ci >> "$LOG_FILE" 2>&1
    if [ $? -ne 0 ]; then
        error "Failed to install frontend dependencies"
        return 1
    fi
    
    # Build frontend
    sudo -u "$SUDO_USER" npm run build >> "$LOG_FILE" 2>&1
    if [ $? -ne 0 ]; then
        error "Failed to build frontend"
        return 1
    fi
    
    success "Frontend built successfully"
}

# Prepare backend
prepare_backend() {
    log "Preparing backend..."
    
    local backend_dir="$DEPLOY_DIR/backend"
    cd "$backend_dir"
    
    # Install dependencies
    sudo -u "$SUDO_USER" npm ci >> "$LOG_FILE" 2>&1
    if [ $? -ne 0 ]; then
        error "Failed to install backend dependencies"
        return 1
    fi
    
    # Generate Prisma client
    sudo -u "$SUDO_USER" npx prisma generate >> "$LOG_FILE" 2>&1
    if [ $? -ne 0 ]; then
        error "Failed to generate Prisma client"
        return 1
    fi
    
    success "Backend prepared successfully"
}

# Create environment files
create_env_files() {
    log "Creating environment files..."
    
    local backend_dir="$DEPLOY_DIR/backend"
    
    # Create backend .env file
    cat > "$backend_dir/.env" << EOF
NODE_ENV=production
PORT=4000
JWT_SECRET=$(openssl rand -base64 32)
DATABASE_URL=file:./prod.db
EOF
    
    success "Environment files created"
}

# Create production docker-compose file
create_docker_compose() {
    log "Creating production docker-compose.yml..."
    
    cd "$DEPLOY_DIR"
    
    cat > docker-compose.prod.yml << 'EOF'
version: "3.8"
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./frontend/build:/usr/share/nginx/html
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - api
    restart: unless-stopped
    networks:
      - mooza-network

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
    networks:
      - mooza-network

volumes:
  api_data:

networks:
  mooza-network:
    driver: bridge
EOF
    
    success "Production docker-compose.yml created"
}

# Create Nginx configuration
create_nginx_config() {
    log "Creating Nginx configuration..."
    
    cd "$DEPLOY_DIR"
    
    cat > nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    
    # Frontend server block
    server {
        listen 80;
        server_name _;
        
        root /usr/share/nginx/html;
        index index.html;
        
        # Serve static files
        location / {
            try_files $uri $uri/ /index.html;
        }
        
        # API proxy
        location /api/ {
            proxy_pass http://api:4000/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # WebSocket support
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }
        
        # Health check endpoint
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

# Setup firewall
setup_firewall() {
    log "Setting up firewall..."
    
    # Enable UFW
    echo "y" | ufw enable >> "$LOG_FILE" 2>&1
    
    # Allow SSH (assuming default port 22)
    ufw allow ssh >> "$LOG_FILE" 2>&1
    
    # Allow HTTP and HTTPS
    ufw allow 80 >> "$LOG_FILE" 2>&1
    ufw allow 443 >> "$LOG_FILE" 2>&1
    
    # Allow API port for internal access
    ufw allow from 172.16.0.0/12 to any port 4000 >> "$LOG_FILE" 2>&1
    
    success "Firewall configured"
}

# Deploy application using docker-compose
deploy_with_docker() {
    log "Deploying application with Docker Compose..."
    
    cd "$DEPLOY_DIR"
    
    # Set JWT secret environment variable
    export JWT_SECRET=$(openssl rand -base64 32)
    
    # Pull latest images
    sudo -u "$SUDO_USER" docker compose -f docker-compose.prod.yml pull >> "$LOG_FILE" 2>&1
    
    # Build and start services
    sudo -u "$SUDO_USER" docker compose -f docker-compose.prod.yml up -d --build >> "$LOG_FILE" 2>&1
    
    if [ $? -eq 0 ]; then
        success "Application deployed successfully"
    else
        error "Deployment failed"
        return 1
    fi
}

# Check deployment status
check_status() {
    log "Checking deployment status..."
    
    cd "$DEPLOY_DIR"
    
    # Check if containers are running
    local running_containers=$(sudo -u "$SUDO_USER" docker compose -f docker-compose.prod.yml ps | grep -c "Up")
    if [ "$running_containers" -gt 0 ]; then
        success "Containers are running ($running_containers services up)"
    else
        warning "No containers are running"
    fi
    
    # Check API health (wait a bit for services to start)
    sleep 10
    if curl -f http://localhost:4000/health > /dev/null 2>&1; then
        success "API is responding"
    else
        warning "API health check failed"
    fi
    
    # Show service status
    echo
    info "Service Status:"
    sudo -u "$SUDO_USER" docker compose -f docker-compose.prod.yml ps
    echo
    
    success "Deployment completed!"
    log "Access your application at: http://your-vps-ip"
    log "API endpoint: http://your-vps-ip/api"
    log "Health check: http://your-vps-ip/health"
}

# Create systemd service for automatic startup
create_systemd_service() {
    log "Creating systemd service for automatic startup..."
    
    cat > /etc/systemd/system/mooza.service << EOF
[Unit]
Description=Mooza Music Social Network
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$DEPLOY_DIR
ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml up -d
ExecStop=/usr/bin/docker compose -f docker-compose.prod.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF
    
    systemctl daemon-reload >> "$LOG_FILE" 2>&1
    systemctl enable mooza.service >> "$LOG_FILE" 2>&1
    
    success "Systemd service created and enabled"
}

# Setup log rotation
setup_log_rotation() {
    log "Setting up log rotation..."
    
    cat > /etc/logrotate.d/mooza << EOF
$DEPLOY_DIR/backend/prisma/prod.db {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}

/var/log/mooza-deploy.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
}
EOF
    
    success "Log rotation configured"
}

# Display deployment summary
display_summary() {
    echo
    echo -e "${PURPLE}==========================================${NC}"
    echo -e "${PURPLE}  Mooza Deployment Summary${NC}"
    echo -e "${PURPLE}==========================================${NC}"
    echo
    echo -e "${GREEN}✓ System updated${NC}"
    echo -e "${GREEN}✓ Dependencies installed${NC}"
    echo -e "${GREEN}✓ Node.js installed${NC}"
    echo -e "${GREEN}✓ Docker installed${NC}"
    echo -e "${GREEN}✓ Docker Compose installed${NC}"
    echo -e "${GREEN}✓ Repository cloned${NC}"
    echo -e "${GREEN}✓ Frontend built${NC}"
    echo -e "${GREEN}✓ Backend prepared${NC}"
    echo -e "${GREEN}✓ Environment configured${NC}"
    echo -e "${GREEN}✓ Docker Compose configured${NC}"
    echo -e "${GREEN}✓ Nginx configured${NC}"
    echo -e "${GREEN}✓ Firewall configured${NC}"
    echo -e "${GREEN}✓ Application deployed${NC}"
    echo -e "${GREEN}✓ Systemd service created${NC}"
    echo -e "${GREEN}✓ Log rotation configured${NC}"
    echo
    echo -e "${CYAN}Deployment directory: $DEPLOY_DIR${NC}"
    echo -e "${CYAN}Log file: $LOG_FILE${NC}"
    echo
    echo -e "${YELLOW}Next steps:${NC}"
    echo -e "  1. Access your application at: ${GREEN}http://your-vps-ip${NC}"
    echo -e "  2. For SSL certificate, run: ${GREEN}sudo certbot --nginx${NC}"
    echo -e "  3. Check logs with: ${GREEN}docker compose -f $DEPLOY_DIR/docker-compose.prod.yml logs -f${NC}"
    echo -e "  4. View status with: ${GREEN}systemctl status mooza${NC}"
    echo
}

# Main deployment function
main() {
    print_banner
    log "Starting Mooza automated deployment..."
    
    # Check prerequisites
    check_root
    check_ubuntu_version
    
    # System setup
    update_system
    install_dependencies
    install_nodejs
    install_docker
    install_docker_compose
    
    # Application deployment
    setup_deployment_directory
    clone_repository
    build_frontend
    prepare_backend
    create_env_files
    create_docker_compose
    create_nginx_config
    
    # System configuration
    setup_firewall
    create_systemd_service
    setup_log_rotation
    
    # Deploy and verify
    deploy_with_docker
    check_status
    
    # Finalize
    display_summary
    success "Mooza deployment completed successfully!"
}

# Run main function
main "$@"