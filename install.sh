#!/bin/bash

###############################################
# Mooza One-Liner Installation Script
# Run: curl -fsSL https://... | bash
###############################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
REPO_URL="https://github.com/your-username/mooza-dev.git"
DEPLOY_PATH="/opt/mooza"
BRANCH="main"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║    Mooza VPS Installation Script      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}This script must be run as root${NC}"
   exit 1
fi

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo -e "${RED}Cannot detect OS${NC}"
    exit 1
fi

# Install dependencies based on OS
echo -e "${YELLOW}Step 1: Installing dependencies...${NC}"

if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
    apt-get update -qq
    apt-get install -y -qq \
        curl \
        git \
        wget \
        htop \
        net-tools \
        ca-certificates \
        gnupg \
        lsb-release \
        > /dev/null 2>&1
    
    # Install Node.js
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - > /dev/null 2>&1
    apt-get install -y -qq nodejs > /dev/null 2>&1
    
    # Install Docker
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh > /dev/null 2>&1
    rm -f get-docker.sh
    
    # Install Docker Compose
    echo "Installing Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
        -o /usr/local/bin/docker-compose > /dev/null 2>&1
    chmod +x /usr/local/bin/docker-compose
    
    # Install Nginx and Certbot
    echo "Installing Nginx and Certbot..."
    apt-get install -y -qq nginx certbot python3-certbot-nginx > /dev/null 2>&1
    
    # Install PostgreSQL client
    apt-get install -y -qq postgresql-client > /dev/null 2>&1
    
elif [ "$OS" = "centos" ] || [ "$OS" = "rhel" ] || [ "$OS" = "fedora" ]; then
    yum groupinstall -y "Development Tools" > /dev/null 2>&1
    yum install -y -q \
        curl \
        git \
        wget \
        htop \
        net-tools \
        > /dev/null 2>&1
    
    # Install Node.js
    curl -fsSL https://rpm.nodesource.com/setup_18.x | bash - > /dev/null 2>&1
    yum install -y -q nodejs > /dev/null 2>&1
    
    # Install Docker
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh > /dev/null 2>&1
    rm -f get-docker.sh
    
    # Install Docker Compose
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
        -o /usr/local/bin/docker-compose > /dev/null 2>&1
    chmod +x /usr/local/bin/docker-compose
    
    # Install Nginx
    yum install -y -q nginx > /dev/null 2>&1
    
    # Install Certbot
    yum install -y -q certbot python3-certbot-nginx > /dev/null 2>&1
else
    echo -e "${RED}Unsupported OS: $OS${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Dependencies installed${NC}"

# Setup Docker group
echo -e "${YELLOW}Step 2: Configuring Docker...${NC}"
if ! getent group docker > /dev/null; then
    groupadd docker > /dev/null 2>&1
fi
usermod -aG docker root > /dev/null 2>&1
systemctl enable docker > /dev/null 2>&1
systemctl start docker > /dev/null 2>&1
echo -e "${GREEN}✓ Docker configured${NC}"

# Clone repository
echo -e "${YELLOW}Step 3: Cloning repository...${NC}"
if [ ! -d "$DEPLOY_PATH" ]; then
    git clone -b "$BRANCH" "$REPO_URL" "$DEPLOY_PATH" > /dev/null 2>&1
    echo -e "${GREEN}✓ Repository cloned to $DEPLOY_PATH${NC}"
else
    echo -e "${YELLOW}Directory already exists, pulling latest changes...${NC}"
    cd "$DEPLOY_PATH"
    git pull origin "$BRANCH" > /dev/null 2>&1
    echo -e "${GREEN}✓ Repository updated${NC}"
fi

# Setup environment
echo -e "${YELLOW}Step 4: Setting up environment...${NC}"
cd "$DEPLOY_PATH"

if [ ! -f ".env" ]; then
    cat > .env << 'EOF'
# Server Configuration
PORT=3001
NODE_ENV=production

# Database
DATABASE_URL="postgresql://mooza:mooza_secure_password@db:5432/mooza_db"

# JWT Secret (auto-generated)
JWT_SECRET=$(openssl rand -base64 32)

# File upload paths
UPLOAD_DIR=/app/uploads

# CORS Configuration
CORS_ORIGIN=http://localhost:3000

# API Configuration
API_BASE_URL=http://localhost/api
EOF
    echo -e "${GREEN}✓ Environment file created${NC}"
    echo -e "${YELLOW}Please update .env with your configuration${NC}"
else
    echo -e "${YELLOW}Environment file already exists${NC}"
fi

# Create server .env if needed
if [ ! -f "server/.env" ] && [ -f "server/.env.example" ]; then
    cp "server/.env.example" "server/.env"
    echo -e "${GREEN}✓ Server environment file created${NC}"
fi

# Build and start Docker containers
echo -e "${YELLOW}Step 5: Building Docker images...${NC}"
docker-compose build --no-cache > /dev/null 2>&1
echo -e "${GREEN}✓ Docker images built${NC}"

echo -e "${YELLOW}Step 6: Starting services...${NC}"
docker-compose up -d > /dev/null 2>&1

# Wait for services to start
echo -e "${YELLOW}Waiting for services to start...${NC}"
sleep 10

# Run database migrations
echo -e "${YELLOW}Step 7: Running database migrations...${NC}"
docker-compose exec -T server npm run prisma:migrate:deploy > /dev/null 2>&1 || true
echo -e "${GREEN}✓ Database migrations completed${NC}"

# Verify installation
echo -e "${YELLOW}Step 8: Verifying installation...${NC}"

if [ "$(docker-compose ps -q server)" ]; then
    echo -e "${GREEN}✓ Server is running${NC}"
else
    echo -e "${RED}✗ Server failed to start${NC}"
fi

if [ "$(docker-compose ps -q client)" ]; then
    echo -e "${GREEN}✓ Client is running${NC}"
else
    echo -e "${RED}✗ Client failed to start${NC}"
fi

if [ "$(docker-compose ps -q db)" ]; then
    echo -e "${GREEN}✓ Database is running${NC}"
else
    echo -e "${RED}✗ Database failed to start${NC}"
fi

# Setup Nginx (optional)
echo ""
read -p "Do you want to setup Nginx reverse proxy? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Setting up Nginx...${NC}"
    
    read -p "Enter your domain name (e.g., mooza.com): " DOMAIN_NAME
    
    # Create Nginx configuration
    cat > /etc/nginx/sites-available/mooza << NGINX_CONFIG
server {
    listen 80;
    server_name $DOMAIN_NAME;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN_NAME;
    
    client_max_body_size 50M;
    
    # SSL certificates (setup with certbot)
    # ssl_certificate /etc/letsencrypt/live/$DOMAIN_NAME/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/$DOMAIN_NAME/privkey.pem;
    
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
    
    ln -sf /etc/nginx/sites-available/mooza /etc/nginx/sites-enabled/mooza
    rm -f /etc/nginx/sites-enabled/default
    
    nginx -t > /dev/null 2>&1
    systemctl restart nginx > /dev/null 2>&1
    
    echo -e "${GREEN}✓ Nginx configured${NC}"
    
    # Setup SSL
    echo ""
    read -p "Do you want to setup SSL with Let's Encrypt? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Setting up SSL certificate...${NC}"
        certbot certonly --nginx -d "$DOMAIN_NAME" --agree-tos --no-eff-email --non-interactive > /dev/null 2>&1 || true
        systemctl reload nginx > /dev/null 2>&1
        echo -e "${GREEN}✓ SSL certificate installed${NC}"
    fi
fi

# Final status
echo ""
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Installation Complete!              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Your Mooza application is ready!${NC}"
echo ""
echo "Quick commands:"
echo -e "  ${YELLOW}View logs:${NC}        docker-compose -f $DEPLOY_PATH/docker-compose.yml logs -f"
echo -e "  ${YELLOW}Stop services:${NC}    docker-compose -f $DEPLOY_PATH/docker-compose.yml down"
echo -e "  ${YELLOW}Restart services:${NC} docker-compose -f $DEPLOY_PATH/docker-compose.yml restart"
echo -e "  ${YELLOW}View status:${NC}      docker-compose -f $DEPLOY_PATH/docker-compose.yml ps"
echo ""
echo "Access your application:"
echo -e "  ${YELLOW}Frontend:${NC}  http://localhost:3000"
echo -e "  ${YELLOW}API:${NC}       http://localhost:3001"
echo ""
echo "For more information, see $DEPLOY_PATH/DEPLOYMENT_GUIDE.md"
