#!/bin/bash

# Mooza Music Social Network - VPS Deployment Script
# This script deploys the Mooza application to a VPS server

# Color codes for output
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

# Check if running on Linux (VPS)
if [[ "$OSTYPE" != "linux-gnu"* ]]; then
    error "This script is intended to run on a Linux VPS server"
    exit 1
fi

# Check if required tools are installed
check_dependencies() {
    log "Checking dependencies..."
    
    local deps=("node" "npm" "docker" "docker-compose" "git")
    local missing_deps=()
    
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            missing_deps+=("$dep")
        fi
    done
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        error "Missing dependencies: ${missing_deps[*]}"
        error "Please install the missing dependencies and run this script again"
        exit 1
    fi
    
    success "All dependencies are installed"
}

# Install Node.js if not present (Ubuntu/Debian)
install_nodejs() {
    if ! command -v node &> /dev/null; then
        log "Installing Node.js..."
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
        success "Node.js installed"
    fi
}

# Install Docker if not present (Ubuntu/Debian)
install_docker() {
    if ! command -v docker &> /dev/null; then
        log "Installing Docker..."
        sudo apt update
        sudo apt install -y apt-transport-https ca-certificates curl software-properties-common
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
        sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"
        sudo apt update
        sudo apt install -y docker-ce
        sudo systemctl start docker
        sudo systemctl enable docker
        success "Docker installed"
    fi
}

# Install Docker Compose if not present
install_docker_compose() {
    if ! command -v docker-compose &> /dev/null; then
        log "Installing Docker Compose..."
        sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        sudo chmod +x /usr/local/bin/docker-compose
        success "Docker Compose installed"
    fi
}

# Create deployment directory
setup_deployment_directory() {
    local deploy_dir="/opt/mooza"
    log "Setting up deployment directory: $deploy_dir"
    
    sudo mkdir -p "$deploy_dir"
    sudo chown $USER:$USER "$deploy_dir"
    cd "$deploy_dir"
    
    success "Deployment directory ready"
}

# Clone or update repository
clone_repository() {
    local repo_url="https://github.com/cryptoChaosDev/mooza_dev.git"
    local deploy_dir="/opt/mooza"
    
    cd "$deploy_dir"
    
    if [ -d ".git" ]; then
        log "Updating existing repository..."
        git pull origin main
    else
        log "Cloning repository..."
        git clone "$repo_url" .
    fi
    
    success "Repository ready"
}

# Build frontend
build_frontend() {
    local deploy_dir="/opt/mooza"
    cd "$deploy_dir"
    
    log "Installing frontend dependencies..."
    npm ci
    
    log "Building frontend..."
    npm run build
    
    if [ $? -eq 0 ]; then
        success "Frontend built successfully"
    else
        error "Frontend build failed"
        exit 1
    fi
}

# Prepare backend
prepare_backend() {
    local deploy_dir="/opt/mooza"
    local backend_dir="$deploy_dir/backend"
    cd "$backend_dir"
    
    log "Installing backend dependencies..."
    npm ci
    
    log "Generating Prisma client..."
    npx prisma generate
    
    success "Backend prepared"
}

# Create production environment files
create_env_files() {
    local deploy_dir="/opt/mooza"
    local backend_dir="$deploy_dir/backend"
    
    log "Creating environment files..."
    
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
    local deploy_dir="/opt/mooza"
    cd "$deploy_dir"
    
    log "Creating production docker-compose.yml..."
    
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
      - ./build:/usr/share/nginx/html
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - api
    restart: unless-stopped

  api:
    build: 
      context: ./backend
      dockerfile: Dockerfile.prod
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
    
    success "Production docker-compose.yml created"
}

# Create Nginx configuration
create_nginx_config() {
    local deploy_dir="/opt/mooza"
    cd "$deploy_dir"
    
    log "Creating Nginx configuration..."
    
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
        server_name localhost;
        
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
        }
    }
}
EOF
    
    success "Nginx configuration created"
}

# Create production Dockerfile for backend
create_backend_dockerfile() {
    local deploy_dir="/opt/mooza"
    local backend_dir="$deploy_dir/backend"
    cd "$backend_dir"
    
    log "Creating production Dockerfile for backend..."
    
    cat > Dockerfile.prod << 'EOF'
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy Prisma schema and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy source code
COPY src ./src/
COPY tsconfig.json ./

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1

# Run the application
CMD ["node", "dist/index.js"]
EOF
    
    success "Backend production Dockerfile created"
}

# Deploy application using docker-compose
deploy_with_docker() {
    local deploy_dir="/opt/mooza"
    cd "$deploy_dir"
    
    log "Deploying application with Docker Compose..."
    
    # Set JWT secret environment variable
    export JWT_SECRET=$(openssl rand -base64 32)
    
    # Pull latest images
    docker-compose -f docker-compose.prod.yml pull
    
    # Build and start services
    docker-compose -f docker-compose.prod.yml up -d --build
    
    if [ $? -eq 0 ]; then
        success "Application deployed successfully"
    else
        error "Deployment failed"
        exit 1
    fi
}

# Check deployment status
check_status() {
    log "Checking deployment status..."
    
    # Check if containers are running
    if docker-compose -f docker-compose.prod.yml ps | grep -q "Up"; then
        success "Containers are running"
    else
        warning "Some containers may not be running properly"
    fi
    
    # Check API health
    sleep 10
    if curl -f http://localhost:4000/health > /dev/null 2>&1; then
        success "API is responding"
    else
        warning "API health check failed"
    fi
    
    success "Deployment completed! Access your application at http://your-vps-ip"
}

# Main deployment function
main() {
    log "Starting Mooza deployment to VPS..."
    
    # Check dependencies
    check_dependencies
    
    # Setup deployment directory
    setup_deployment_directory
    
    # Clone repository
    clone_repository
    
    # Prepare frontend and backend
    build_frontend
    prepare_backend
    
    # Create configuration files
    create_env_files
    create_docker_compose
    create_nginx_config
    create_backend_dockerfile
    
    # Deploy with Docker
    deploy_with_docker
    
    # Check status
    check_status
    
    success "Mooza deployment completed successfully!"
    log "Access your application at: http://your-vps-ip"
    log "API endpoint: http://your-vps-ip/api"
}

# Run main function
main "$@"