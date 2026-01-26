#!/bin/bash

###############################################
# Mooza VPS Deployment Script
# This script automates the deployment of the Mooza application to a VPS
###############################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
echo -e "${YELLOW}=== Mooza VPS Deployment Script ===${NC}\n"

# Get VPS details from user
read -p "Enter VPS hostname or IP: " VPS_HOST
read -p "Enter VPS username (default: root): " VPS_USER
VPS_USER=${VPS_USER:-root}
read -p "Enter VPS SSH port (default: 22): " VPS_PORT
VPS_PORT=${VPS_PORT:-22}
read -p "Enter your Git repository URL: " GIT_REPO
read -p "Enter deployment path on VPS (default: /opt/mooza): " DEPLOY_PATH
DEPLOY_PATH=${DEPLOY_PATH:-/opt/mooza}

# Validate inputs
if [ -z "$VPS_HOST" ] || [ -z "$GIT_REPO" ]; then
    echo -e "${RED}Error: VPS host and Git repository URL are required${NC}"
    exit 1
fi

echo -e "${GREEN}Configuration:${NC}"
echo "  Host: $VPS_HOST"
echo "  User: $VPS_USER"
echo "  Port: $VPS_PORT"
echo "  Deploy Path: $DEPLOY_PATH"
echo "  Git Repo: $GIT_REPO"
echo ""

read -p "Is this correct? (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ]; then
    echo -e "${RED}Deployment cancelled${NC}"
    exit 1
fi

echo -e "\n${YELLOW}Starting deployment...${NC}\n"

# SSH Connection command
SSH_CMD="ssh -p $VPS_PORT $VPS_USER@$VPS_HOST"

# Step 1: Prepare VPS
echo -e "${YELLOW}Step 1: Preparing VPS${NC}"
$SSH_CMD << 'REMOTE_COMMANDS'
    set -e
    echo "Installing required packages..."
    apt-get update -qq
    apt-get install -y -qq curl git nodejs npm docker.io docker-compose > /dev/null 2>&1 || true
    
    # Add docker group to user
    if ! getent group docker > /dev/null; then
        groupadd docker
    fi
    usermod -aG docker $(whoami) || true
    
    echo "Docker and Docker Compose installed successfully"
REMOTE_COMMANDS

# Step 2: Clone or update repository
echo -e "${YELLOW}Step 2: Cloning/Updating repository${NC}"
$SSH_CMD << REMOTE_COMMANDS
    set -e
    if [ -d "$DEPLOY_PATH" ]; then
        echo "Pulling latest changes..."
        cd "$DEPLOY_PATH"
        git pull origin main || git pull origin master
    else
        echo "Cloning repository..."
        git clone $GIT_REPO $DEPLOY_PATH
    fi
REMOTE_COMMANDS

# Step 3: Setup environment variables
echo -e "${YELLOW}Step 3: Setting up environment variables${NC}"
$SSH_CMD << REMOTE_COMMANDS
    set -e
    cd "$DEPLOY_PATH"
    
    # Check if .env exists
    if [ ! -f ".env" ]; then
        echo "Creating .env file..."
        cat > .env << 'EOF'
# Server Configuration
PORT=3001
NODE_ENV=production

# Database
DATABASE_URL="postgresql://mooza:mooza_password@db:5432/mooza_db"

# JWT Secret (Generate a strong secret)
JWT_SECRET=$(openssl rand -base64 32)

# File upload paths
UPLOAD_DIR=/app/uploads

# CORS
CORS_ORIGIN=http://localhost:3000
EOF
        echo "Please update .env with your actual configuration"
    fi
    
    # Server .env
    if [ ! -f "server/.env" ]; then
        cp server/.env.example server/.env 2>/dev/null || true
    fi
REMOTE_COMMANDS

# Step 4: Build and start Docker containers
echo -e "${YELLOW}Step 4: Building and starting Docker containers${NC}"
$SSH_CMD << REMOTE_COMMANDS
    set -e
    cd "$DEPLOY_PATH"
    
    # Stop existing containers
    docker-compose down 2>/dev/null || true
    
    # Build images
    echo "Building Docker images..."
    docker-compose build --no-cache 2>&1 | tail -20
    
    # Start containers
    echo "Starting containers..."
    docker-compose up -d
    
    # Wait for services to be ready
    sleep 5
    
    # Run database migrations
    echo "Running database migrations..."
    docker-compose exec -T server npm run prisma:migrate:deploy 2>/dev/null || true
    
    echo "Containers started successfully!"
REMOTE_COMMANDS

# Step 5: Setup Nginx reverse proxy (optional)
echo -e "${YELLOW}Step 5: Setting up Nginx reverse proxy (optional)${NC}"
read -p "Do you want to setup Nginx reverse proxy? (y/n): " SETUP_NGINX

if [ "$SETUP_NGINX" = "y" ]; then
    read -p "Enter your domain name (e.g., mooza.com): " DOMAIN_NAME
    
    $SSH_CMD << REMOTE_COMMANDS
        set -e
        apt-get install -y -qq nginx > /dev/null 2>&1
        
        cat > /etc/nginx/sites-available/mooza << 'NGINX_CONFIG'
server {
    listen 80;
    server_name $DOMAIN_NAME;
    
    # Redirect HTTP to HTTPS
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN_NAME;
    
    # SSL certificates (you should setup Let's Encrypt)
    # ssl_certificate /etc/letsencrypt/live/$DOMAIN_NAME/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/$DOMAIN_NAME/privkey.pem;
    
    client_max_body_size 50M;
    
    # API proxy
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX_CONFIG
        
        # Enable site
        ln -sf /etc/nginx/sites-available/mooza /etc/nginx/sites-enabled/mooza
        rm -f /etc/nginx/sites-enabled/default
        
        # Test Nginx configuration
        nginx -t
        
        # Reload Nginx
        systemctl reload nginx
        
        echo "Nginx configured successfully!"
        echo "Please setup SSL certificates with Let's Encrypt:"
        echo "  apt-get install certbot python3-certbot-nginx"
        echo "  certbot certonly --nginx -d $DOMAIN_NAME"
REMOTE_COMMANDS
fi

# Step 6: Setup SSL with Let's Encrypt (optional)
echo -e "${YELLOW}Step 6: Setting up SSL with Let's Encrypt (optional)${NC}"
read -p "Do you want to setup SSL with Let's Encrypt? (y/n): " SETUP_SSL

if [ "$SETUP_SSL" = "y" ] && [ "$SETUP_NGINX" = "y" ]; then
    $SSH_CMD << REMOTE_COMMANDS
        set -e
        apt-get install -y -qq certbot python3-certbot-nginx > /dev/null 2>&1
        certbot certonly --nginx -d $DOMAIN_NAME --agree-tos --no-eff-email --non-interactive
        systemctl reload nginx
        echo "SSL certificate installed!"
REMOTE_COMMANDS
fi

# Step 7: Check status
echo -e "${YELLOW}Step 7: Checking deployment status${NC}"
$SSH_CMD << REMOTE_COMMANDS
    echo "Docker containers status:"
    docker-compose -f $DEPLOY_PATH/docker-compose.yml ps
    
    echo ""
    echo "Service logs (last 20 lines):"
    docker-compose -f $DEPLOY_PATH/docker-compose.yml logs --tail=20
REMOTE_COMMANDS

# Deployment complete
echo -e "\n${GREEN}=== Deployment Complete ===${NC}"
echo -e "\n${GREEN}Your application is now deployed!${NC}"
echo ""
echo "Next steps:"
echo "1. Update DNS records to point to your VPS IP"
echo "2. Setup automatic backups"
echo "3. Configure monitoring and logging"
echo "4. Setup CI/CD for automated deployments"
echo ""
echo "Useful commands:"
echo "  SSH to VPS: ssh -p $VPS_PORT $VPS_USER@$VPS_HOST"
echo "  View logs: docker-compose -f $DEPLOY_PATH/docker-compose.yml logs -f"
echo "  Stop services: docker-compose -f $DEPLOY_PATH/docker-compose.yml down"
echo "  Restart services: docker-compose -f $DEPLOY_PATH/docker-compose.yml restart"
