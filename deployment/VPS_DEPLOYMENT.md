# Mooza Music Social Network - VPS Deployment Guide

This guide explains how to deploy the Mooza application to a VPS server using the provided deployment script.

## Prerequisites

1. A Linux VPS server (Ubuntu 20.04 LTS or newer recommended)
2. SSH access to the VPS
3. A domain name (optional, for SSL certificate)
4. Basic understanding of Linux command line

## Supported Operating Systems

- Ubuntu 20.04 LTS or newer
- Debian 10 or newer
- CentOS 8 or newer
- Other modern Linux distributions

## Deployment Steps

### 1. Connect to Your VPS

```bash
ssh root@your-vps-ip
```

### 2. Download the Deployment Script

```bash
# Install wget if not already installed
sudo apt update
sudo apt install -y wget

# Download the deployment script
wget https://raw.githubusercontent.com/cryptoChaosDev/mooza_dev/main/deploy-to-vps.sh
```

Alternatively, you can copy the script directly to your VPS:

```bash
# Using scp from your local machine
scp deploy-to-vps.sh root@your-vps-ip:/root/
```

### 3. Make the Script Executable

```bash
chmod +x deploy-to-vps.sh
```

### 4. Run the Deployment Script

```bash
./deploy-to-vps.sh
```

The script will automatically:
- Check and install required dependencies
- Set up the deployment directory
- Clone the repository
- Build the frontend and backend
- Create necessary configuration files
- Deploy the application using Docker Compose

### 5. Verify Deployment

After the script completes, you can check the status of your services:

```bash
# Check running containers
docker-compose -f /opt/mooza/docker-compose.prod.yml ps

# Check API health
curl http://localhost:4000/health

# View logs
docker-compose -f /opt/mooza/docker-compose.prod.yml logs
```

## Architecture

The deployment uses the following components:

1. **Nginx** - Reverse proxy and static file server
2. **Node.js/Express API** - Backend service running on port 4000
3. **SQLite Database** - Persistent storage for user data and posts
4. **Docker Compose** - Orchestration of services

## Configuration

### Environment Variables

The deployment script automatically generates a `.env` file for the backend with the following variables:

- `NODE_ENV=production`
- `PORT=4000`
- `JWT_SECRET` - Randomly generated secret key
- `DATABASE_URL=file:./prod.db`

### Custom Domain

To use a custom domain:

1. Point your domain's DNS A record to your VPS IP address
2. Modify the Nginx configuration in `/opt/mooza/nginx.conf`:
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;  # Change this line
       
       # ... rest of configuration
   }
   ```
3. Restart the services:
   ```bash
   cd /opt/mooza
   docker-compose -f docker-compose.prod.yml down
   docker-compose -f docker-compose.prod.yml up -d
   ```

### SSL Certificate (HTTPS)

To enable HTTPS, you can use Let's Encrypt with Certbot:

1. Install Certbot:
   ```bash
   sudo apt install certbot python3-certbot-nginx
   ```

2. Obtain SSL certificate:
   ```bash
   sudo certbot --nginx -d your-domain.com
   ```

3. Certbot will automatically modify your Nginx configuration to redirect HTTP to HTTPS.

## Maintenance

### Updating the Application

To update to the latest version:

```bash
cd /opt/mooza
./deploy-to-vps.sh
```

The script will automatically pull the latest changes and redeploy the application.

### Backup Database

To backup the SQLite database:

```bash
# Copy the database file
cp /opt/mooza/backend/prisma/prod.db /path/to/backup/location/

# Or create a timestamped backup
cp /opt/mooza/backend/prisma/prod.db /path/to/backup/location/prod.db.$(date +%Y%m%d_%H%M%S)
```

### View Logs

To view application logs:

```bash
# View all logs
docker-compose -f /opt/mooza/docker-compose.prod.yml logs

# View API logs
docker-compose -f /opt/mooza/docker-compose.prod.yml logs api

# View Nginx logs
docker-compose -f /opt/mooza/docker-compose.prod.yml logs nginx

# Follow logs in real-time
docker-compose -f /opt/mooza/docker-compose.prod.yml logs -f
```

### Restart Services

To restart all services:

```bash
cd /opt/mooza
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d
```

## Troubleshooting

### Common Issues

1. **Port already in use**
   ```bash
   # Check which process is using port 80 or 4000
   sudo lsof -i :80
   sudo lsof -i :4000
   
   # Kill the process if needed
   sudo kill -9 PID
   ```

2. **Docker permission denied**
   ```bash
   # Add your user to the docker group
   sudo usermod -aG docker $USER
   
   # Log out and log back in
   exit
   ```

3. **Database connection issues**
   ```bash
   # Check if the database file exists
   ls -la /opt/mooza/backend/prisma/prod.db
   
   # Check database permissions
   sudo chown $USER:$USER /opt/mooza/backend/prisma/prod.db
   ```

### Getting Help

If you encounter issues not covered in this guide:

1. Check the application logs
2. Verify all prerequisites are met
3. Ensure your VPS meets the minimum requirements
4. Open an issue on the GitHub repository

## Security Considerations

1. **Firewall**: Configure your VPS firewall to only allow necessary ports (22, 80, 443)
2. **SSH**: Use key-based authentication instead of passwords
3. **Updates**: Regularly update your OS and dependencies
4. **Backups**: Implement regular database backups
5. **Monitoring**: Set up monitoring for your services

## System Requirements

### Minimum Requirements
- CPU: 1 core
- RAM: 1 GB
- Storage: 10 GB SSD

### Recommended Requirements
- CPU: 2 cores
- RAM: 2 GB
- Storage: 20 GB SSD

## Support

For issues with the deployment script or application, please open an issue on the GitHub repository:
https://github.com/cryptoChaosDev/mooza_dev/issues

Enjoy your deployed Mooza Music Social Network!