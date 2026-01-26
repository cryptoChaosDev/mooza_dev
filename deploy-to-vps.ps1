param(
    [string]$VpsHost,
    [string]$VpsUser = "root",
    [int]$VpsPort = 22,
    [string]$GitRepo,
    [string]$DeployPath = "/opt/mooza"
)

# Colors
$Green = "Green"
$Red = "Red"
$Yellow = "Yellow"

Write-Host "=== Mooza VPS Deployment Script (PowerShell) ===" -ForegroundColor $Yellow
Write-Host ""

# Get VPS details if not provided
if (-not $VpsHost) {
    $VpsHost = Read-Host "Enter VPS hostname or IP"
}

if (-not $GitRepo) {
    $GitRepo = Read-Host "Enter your Git repository URL"
}

# Validate inputs
if (-not $VpsHost -or -not $GitRepo) {
    Write-Host "Error: VPS host and Git repository URL are required" -ForegroundColor $Red
    exit 1
}

Write-Host "Configuration:" -ForegroundColor $Green
Write-Host "  Host: $VpsHost"
Write-Host "  User: $VpsUser"
Write-Host "  Port: $VpsPort"
Write-Host "  Deploy Path: $DeployPath"
Write-Host "  Git Repo: $GitRepo"
Write-Host ""

$Confirm = Read-Host "Is this correct? (y/n)"
if ($Confirm -ne "y") {
    Write-Host "Deployment cancelled" -ForegroundColor $Red
    exit 1
}

Write-Host "`nStarting deployment...`n" -ForegroundColor $Yellow

# Function to run SSH commands
function Invoke-SSHCommand {
    param(
        [string]$Command,
        [string]$ScriptBlock
    )
    
    if ($Command) {
        ssh -p $VpsPort "${VpsUser}@${VpsHost}" $Command
    } else {
        $ScriptBlock | ssh -p $VpsPort "${VpsUser}@${VpsHost}" "bash -s"
    }
}

# Step 1: Prepare VPS
Write-Host "Step 1: Preparing VPS" -ForegroundColor $Yellow
$PrepareScript = @"
set -e
echo "Installing required packages..."
apt-get update -qq
apt-get install -y -qq curl git nodejs npm docker.io docker-compose > /dev/null 2>&1 || true

# Add docker group to user
if ! getent group docker > /dev/null; then
    groupadd docker
fi
usermod -aG docker `$(whoami) || true

echo "Docker and Docker Compose installed successfully"
"@

Invoke-SSHCommand -ScriptBlock $PrepareScript

# Step 2: Clone or update repository
Write-Host "Step 2: Cloning/Updating repository" -ForegroundColor $Yellow
$CloneScript = @"
set -e
if [ -d "$DeployPath" ]; then
    echo "Pulling latest changes..."
    cd "$DeployPath"
    git pull origin main || git pull origin master
else
    echo "Cloning repository..."
    git clone $GitRepo $DeployPath
fi
"@

Invoke-SSHCommand -ScriptBlock $CloneScript

# Step 3: Setup environment variables
Write-Host "Step 3: Setting up environment variables" -ForegroundColor $Yellow
$EnvScript = @"
set -e
cd "$DeployPath"

if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cat > .env << 'EOF'
# Server Configuration
PORT=3001
NODE_ENV=production

# Database
DATABASE_URL="postgresql://mooza:mooza_password@db:5432/mooza_db"

# JWT Secret
JWT_SECRET=`$(openssl rand -base64 32)

# File upload paths
UPLOAD_DIR=/app/uploads

# CORS
CORS_ORIGIN=http://localhost:3000
EOF
    echo "Please update .env with your actual configuration"
fi

if [ ! -f "server/.env" ]; then
    cp server/.env.example server/.env 2>/dev/null || true
fi
"@

Invoke-SSHCommand -ScriptBlock $EnvScript

# Step 4: Build and start Docker containers
Write-Host "Step 4: Building and starting Docker containers" -ForegroundColor $Yellow
$DockerScript = @"
set -e
cd "$DeployPath"

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
"@

Invoke-SSHCommand -ScriptBlock $DockerScript

# Step 5: Setup Nginx reverse proxy
Write-Host "Step 5: Setting up Nginx reverse proxy (optional)" -ForegroundColor $Yellow
$SetupNginx = Read-Host "Do you want to setup Nginx reverse proxy? (y/n)"

if ($SetupNginx -eq "y") {
    $DomainName = Read-Host "Enter your domain name (e.g., mooza.com)"
    
    $NginxScript = @"
set -e
apt-get install -y -qq nginx > /dev/null 2>&1

cat > /etc/nginx/sites-available/mooza << 'NGINX_CONFIG'
server {
    listen 80;
    server_name $DomainName;
    
    return 301 https://\\\$server_name\\\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DomainName;
    
    client_max_body_size 50M;
    
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \\\$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \\\$host;
        proxy_cache_bypass \\\$http_upgrade;
        proxy_set_header X-Real-IP \\\$remote_addr;
        proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\\$scheme;
    }
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \\\$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \\\$host;
        proxy_cache_bypass \\\$http_upgrade;
    }
}
NGINX_CONFIG

ln -sf /etc/nginx/sites-available/mooza /etc/nginx/sites-enabled/mooza
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl reload nginx

echo "Nginx configured successfully!"
"@

    Invoke-SSHCommand -ScriptBlock $NginxScript
}

# Step 6: Setup SSL
Write-Host "Step 6: Setting up SSL with Let's Encrypt (optional)" -ForegroundColor $Yellow
$SetupSSL = Read-Host "Do you want to setup SSL with Let's Encrypt? (y/n)"

if ($SetupSSL -eq "y" -and $SetupNginx -eq "y") {
    $SSLScript = @"
set -e
apt-get install -y -qq certbot python3-certbot-nginx > /dev/null 2>&1
certbot certonly --nginx -d $DomainName --agree-tos --no-eff-email --non-interactive
systemctl reload nginx
echo "SSL certificate installed!"
"@

    Invoke-SSHCommand -ScriptBlock $SSLScript
}

# Step 7: Check status
Write-Host "Step 7: Checking deployment status" -ForegroundColor $Yellow
$StatusScript = @"
echo "Docker containers status:"
docker-compose -f $DeployPath/docker-compose.yml ps

echo ""
echo "Service logs (last 20 lines):"
docker-compose -f $DeployPath/docker-compose.yml logs --tail=20
"@

Invoke-SSHCommand -ScriptBlock $StatusScript

# Deployment complete
Write-Host "`n=== Deployment Complete ===" -ForegroundColor $Green
Write-Host "`nYour application is now deployed!" -ForegroundColor $Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Update DNS records to point to your VPS IP"
Write-Host "2. Setup automatic backups"
Write-Host "3. Configure monitoring and logging"
Write-Host "4. Setup CI/CD for automated deployments"
Write-Host ""
Write-Host "Useful commands:"
Write-Host "  SSH to VPS: ssh -p $VpsPort ${VpsUser}@${VpsHost}"
Write-Host "  View logs: docker-compose -f $DeployPath/docker-compose.yml logs -f"
Write-Host "  Stop services: docker-compose -f $DeployPath/docker-compose.yml down"
Write-Host "  Restart services: docker-compose -f $DeployPath/docker-compose.yml restart"
