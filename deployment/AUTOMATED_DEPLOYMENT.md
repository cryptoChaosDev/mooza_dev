# Mooza Automated VPS Deployment

This guide explains how to automatically deploy the Mooza Music Social Network to an Ubuntu VPS using our enhanced automated deployment scripts.

## Overview

The automated deployment solution includes:

1. **automated-deploy.sh** - The main deployment script that handles the complete setup
2. **setup-vps.sh** - A helper script to easily install and prepare the deployment environment
3. **VPS Requirements** - Ubuntu 20.04+ with at least 2GB RAM recommended

## Prerequisites

1. An Ubuntu VPS (20.04 LTS or newer recommended)
2. Root or sudo access to the VPS
3. At least 2GB RAM and 10GB disk space
4. SSH access to the VPS

## Quick Deployment

For the fastest deployment, run this one-liner on your VPS:

```bash
curl -fsSL https://raw.githubusercontent.com/cryptoChaosDev/mooza_dev/master/deployment/setup-vps.sh | sudo bash
```

Then run the deployment:

```bash
sudo mooza-deploy
```

## Manual Deployment

If you prefer to manually download and run the scripts:

### 1. Connect to Your VPS

```bash
ssh root@your-vps-ip
```

### 2. Download the Setup Script

```bash
# Install wget if not already installed
sudo apt update
sudo apt install -y wget

# Download the setup script
wget https://raw.githubusercontent.com/cryptoChaosDev/mooza_dev/master/deployment/setup-vps.sh
```

### 3. Make the Script Executable and Run It

```bash
chmod +x setup-vps.sh
sudo ./setup-vps.sh
```

### 4. Run the Deployment

```bash
sudo mooza-deploy
```

## What the Deployment Script Does

The automated deployment script performs the following tasks:

1. **System Preparation**
   - Updates system packages
   - Installs required dependencies (curl, wget, git, openssl, ufw)
   - Sets up proper firewall rules

2. **Runtime Installation**
   - Installs Node.js 20.x
   - Installs Docker and Docker Compose
   - Adds the current user to the docker group

3. **Application Setup**
   - Clones the Mooza repository to `/opt/mooza`
   - Builds the frontend React application
   - Prepares the backend Node.js/Express API
   - Generates Prisma client for database access

4. **Configuration**
   - Creates environment files with secure secrets
   - Configures Nginx as a reverse proxy
   - Sets up Docker Compose for service orchestration
   - Creates systemd service for automatic startup

5. **Deployment**
   - Starts all services using Docker Compose
   - Verifies that services are running correctly
   - Provides deployment summary and next steps

## Post-Deployment Steps

After successful deployment, your application will be accessible at:

- **Web Interface**: http://your-vps-ip
- **API Endpoint**: http://your-vps-ip/api
- **Health Check**: http://your-vps-ip/health

### Setting Up SSL (Recommended)

To enable HTTPS with a free SSL certificate:

1. Install Certbot:
   ```bash
   sudo apt install certbot python3-certbot-nginx
   ```

2. Obtain SSL certificate:
   ```bash
   sudo certbot --nginx -d your-domain.com
   ```

### Managing the Application

- **View service status**:
  ```bash
  systemctl status mooza
  ```

- **View application logs**:
  ```bash
  docker compose -f /opt/mooza/docker-compose.prod.yml logs -f
  ```

- **Restart services**:
  ```bash
  sudo systemctl restart mooza
  ```

- **Stop services**:
  ```bash
  sudo systemctl stop mooza
  ```

## Updating the Application

To update to the latest version:

```bash
sudo mooza-deploy
```

The script will automatically pull the latest changes and redeploy the application.

## Customization Options

### Changing the Deployment Directory

Edit the `DEPLOY_DIR` variable in the deployment script to change where the application is installed.

### Using a Custom Branch

Modify the `BRANCH` variable in the deployment script to deploy a different branch.

### Custom Domain

To use a custom domain, update the Nginx configuration in `/opt/mooza/nginx.conf`:

```nginx
server {
    listen 80;
    server_name your-domain.com;  # Change this line
    
    # ... rest of configuration
}
```

Then restart the services:
```bash
sudo systemctl restart mooza
```

## Troubleshooting

### Common Issues

1. **Permission denied with Docker**:
   ```bash
   # Add your user to the docker group
   sudo usermod -aG docker $USER
   
   # Log out and log back in
   exit
   ```

2. **Port already in use**:
   ```bash
   # Check which process is using port 80 or 4000
   sudo lsof -i :80
   sudo lsof -i :4000
   
   # Kill the process if needed
   sudo kill -9 PID
   ```

3. **Database connection issues**:
   ```bash
   # Check if the database file exists
   ls -la /opt/mooza/backend/prisma/prod.db
   
   # Check database permissions
   sudo chown $USER:$USER /opt/mooza/backend/prisma/prod.db
   ```

### Checking Logs

All deployment logs are stored in `/var/log/mooza-deploy.log`.

Application logs can be viewed with:
```bash
docker compose -f /opt/mooza/docker-compose.prod.yml logs
```

## Security Considerations

1. **Firewall**: The script configures UFW to only allow necessary ports (22, 80, 443)
2. **Automatic Updates**: Enable automatic security updates for your OS
3. **Regular Backups**: Implement regular database backups
4. **Monitoring**: Set up monitoring for your services

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