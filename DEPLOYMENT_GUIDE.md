# Mooza VPS Deployment Guide

## Quick Start

### Using the deployment script (Recommended)

#### On Linux/Mac:
```bash
chmod +x deploy-to-vps.sh
./deploy-to-vps.sh
```

#### On Windows (PowerShell):
```powershell
.\deploy-to-vps.ps1
```

The script will guide you through the entire deployment process.

## Prerequisites

Before deploying, ensure you have:

1. **VPS/Server** - Ubuntu 20.04 or later recommended
   - Minimum 2GB RAM
   - 20GB disk space
   - SSH access
   
2. **Domain Name** (optional but recommended)
   - For HTTPS/SSL configuration
   
3. **Git Repository**
   - Your Mooza project pushed to GitHub/GitLab/etc

## Manual Deployment Steps

If you prefer manual deployment or need to customize the process:

### Step 1: Connect to Your VPS

```bash
ssh -p 22 root@your.vps.ip
# or with custom user
ssh -p 22 username@your.vps.ip
```

### Step 2: Install Required Dependencies

```bash
# Update system packages
apt-get update
apt-get upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt-get install -y nodejs

# Install Docker
apt-get install -y docker.io docker-compose

# Add current user to docker group
usermod -aG docker $(whoami)

# Install Git
apt-get install -y git
```

### Step 3: Clone Your Repository

```bash
# Create deployment directory
mkdir -p /opt
cd /opt

# Clone the repository
git clone https://github.com/your-username/mooza-dev.git mooza
cd mooza
```

### Step 4: Setup Environment Variables

```bash
# Create .env file
cat > .env << 'EOF'
# Server Configuration
PORT=3001
NODE_ENV=production

# Database (use PostgreSQL in production)
DATABASE_URL="postgresql://mooza:mooza_password@db:5432/mooza_db"

# JWT Secret (generate a strong random string)
JWT_SECRET=$(openssl rand -base64 32)

# File upload paths
UPLOAD_DIR=/app/uploads

# CORS Configuration
CORS_ORIGIN=https://yourdomain.com

# API Configuration
API_BASE_URL=https://yourdomain.com/api
EOF

# Create server .env
cp server/.env.example server/.env
nano server/.env  # Edit as needed
```

### Step 5: Build and Deploy with Docker

```bash
# Build Docker images
docker-compose build

# Start services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

### Step 6: Run Database Migrations

```bash
# Run Prisma migrations
docker-compose exec server npm run prisma:migrate:deploy

# Generate Prisma client
docker-compose exec server npm run prisma:generate
```

### Step 7: Setup Nginx Reverse Proxy (Optional but Recommended)

```bash
# Install Nginx
apt-get install -y nginx

# Create Nginx configuration
cat > /etc/nginx/sites-available/mooza << 'NGINX_CONFIG'
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL certificates (set up after installation)
    # ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    client_max_body_size 50M;

    # API proxy
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX_CONFIG

# Enable the site
ln -s /etc/nginx/sites-available/mooza /etc/nginx/sites-enabled/mooza
rm -f /etc/nginx/sites-enabled/default

# Test configuration
nginx -t

# Restart Nginx
systemctl restart nginx
```

### Step 8: Setup SSL Certificate with Let's Encrypt

```bash
# Install Certbot
apt-get install -y certbot python3-certbot-nginx

# Generate certificate
certbot certonly --nginx -d yourdomain.com -d www.yourdomain.com

# Update Nginx configuration with SSL paths
nano /etc/nginx/sites-available/mooza

# Test and reload Nginx
nginx -t
systemctl reload nginx
```

## Configuration Files

### docker-compose.yml
The main Docker Compose configuration file that defines all services:
- **client**: React frontend (port 3000)
- **server**: Node.js backend (port 3001)
- **db**: PostgreSQL database

### .env File
Critical environment variables:
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Secret key for JWT tokens
- `NODE_ENV`: Set to "production"
- `CORS_ORIGIN`: Your frontend domain

### server/.env
Server-specific configuration:
- Database credentials
- API ports
- File upload settings

## Managing Your Deployment

### View Logs
```bash
cd /opt/mooza

# All services
docker-compose logs -f

# Specific service
docker-compose logs -f server
docker-compose logs -f client
```

### Stop Services
```bash
docker-compose down
```

### Restart Services
```bash
docker-compose restart
# or specific service
docker-compose restart server
```

### Update Application

```bash
cd /opt/mooza

# Pull latest changes
git pull origin main

# Rebuild and restart
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Database Backup

```bash
# Backup database
docker-compose exec -T db pg_dump -U postgres mooza_db > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore database
docker-compose exec -T db psql -U postgres mooza_db < backup_20260126_120000.sql
```

## Monitoring and Maintenance

### Check Container Health
```bash
docker-compose ps
docker stats
```

### Setup Automatic Backups

Create a backup script `/opt/mooza/backup.sh`:
```bash
#!/bin/bash
BACKUP_DIR="/opt/mooza/backups"
mkdir -p $BACKUP_DIR
docker-compose exec -T db pg_dump -U postgres mooza_db | gzip > $BACKUP_DIR/backup_$(date +%Y%m%d_%H%M%S).sql.gz

# Keep only last 7 days of backups
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +7 -delete
```

Add to crontab:
```bash
crontab -e
# Add: 0 2 * * * /opt/mooza/backup.sh
```

### Monitor Disk Space
```bash
df -h
du -sh /opt/mooza/*
```

## Troubleshooting

### Container won't start
```bash
docker-compose logs
docker-compose down -v
docker-compose up -d --build
```

### Database connection issues
```bash
# Check if database is running
docker-compose ps

# Check database logs
docker-compose logs db

# Test connection
docker-compose exec server npm run prisma:migrate:status
```

### Certificate renewal
```bash
certbot renew --dry-run
# Certbot auto-renews 30 days before expiry
```

### Memory issues
```bash
# Increase Docker memory
# Edit: /etc/docker/daemon.json
# Add: "memory": "2g"

systemctl restart docker
```

## Performance Tips

1. **Enable Gzip Compression**
   - Add to Nginx config
   
2. **Setup Caching**
   - Use Redis for session storage
   
3. **CDN Integration**
   - Use CloudFlare or similar for static assets
   
4. **Database Optimization**
   - Regular vacuums and analyzes
   - Proper indexing on frequently queried fields

5. **Monitor Resource Usage**
   - Setup logging with ELK stack
   - Monitor with Prometheus/Grafana

## Security Best Practices

1. ✅ Use HTTPS/SSL certificates
2. ✅ Setup firewall rules
3. ✅ Keep packages updated
4. ✅ Use strong secrets/passwords
5. ✅ Enable rate limiting
6. ✅ Implement DDoS protection
7. ✅ Regular security audits
8. ✅ Backup sensitive data

## Support and Issues

For issues and questions:
1. Check logs: `docker-compose logs -f`
2. Review Docker documentation: https://docs.docker.com
3. Check Nginx error logs: `/var/log/nginx/error.log`

## Additional Resources

- Docker Documentation: https://docs.docker.com
- Nginx: https://nginx.org/
- PostgreSQL: https://www.postgresql.org/docs/
- Let's Encrypt: https://letsencrypt.org/
- Node.js: https://nodejs.org/docs/
