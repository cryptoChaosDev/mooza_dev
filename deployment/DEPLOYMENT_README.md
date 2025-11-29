# Mooza Music Social Network - Deployment

This directory contains scripts and documentation for deploying the Mooza application to various environments.

## Deployment Options

### 1. VPS Deployment (Recommended)

Deploy Mooza to a Linux VPS server for production use.

**Files:**
- [`deploy-to-vps.sh`](file://c:\Users\79779\Desktop\mooza_dev\mooza_dev\deploy-to-vps.sh) - Bash script to deploy directly on a Linux VPS
- [`deploy-to-vps.ps1`](file://c:\Users\79779\Desktop\mooza_dev\mooza_dev\deploy-to-vps.ps1) - PowerShell script to deploy from Windows to a VPS
- [`VPS_DEPLOYMENT.md`](file://c:\Users\79779\Desktop\mooza_dev\mooza_dev\VPS_DEPLOYMENT.md) - Detailed guide for VPS deployment

**Usage:**
1. For Linux VPS: Copy `deploy-to-vps.sh` to your VPS and run it
2. For Windows users: Run `deploy-to-vps.ps1` from PowerShell to deploy to your VPS

### 2. Docker Deployment (Alternative)

Deploy using Docker containers on any Docker-supported platform.

**Files:**
- [`docker-compose.yml`](file://c:\Users\79779\Desktop\mooza_dev\mooza_dev\backend\docker-compose.yml) - Existing Docker Compose configuration in the backend directory

## Quick Start - VPS Deployment

### From Linux VPS:
```bash
# Copy the deployment script to your VPS
scp deploy-to-vps.sh root@your-vps-ip:/root/

# SSH into your VPS
ssh root@your-vps-ip

# Make the script executable and run it
chmod +x deploy-to-vps.sh
./deploy-to-vps.sh
```

### From Windows:
```powershell
# Run the PowerShell deployment helper
.\deploy-to-vps.ps1
```

## Architecture Overview

The deployment includes:

1. **Frontend**: React application served by Nginx
2. **Backend**: Node.js/Express API with SQLite database
3. **Reverse Proxy**: Nginx routing requests to appropriate services
4. **Containerization**: Docker for consistent deployment across environments

## Requirements

### VPS Deployment:
- Ubuntu 20.04 LTS or newer (recommended)
- 1 CPU core, 1GB RAM minimum
- 10GB disk space
- SSH access
- Public IP address

### Local Dependencies:
- Git
- SSH client
- SCP client

## Documentation

For detailed deployment instructions, please refer to:
- [`VPS_DEPLOYMENT.md`](file://c:\Users\79779\Desktop\mooza_dev\mooza_dev\VPS_DEPLOYMENT.md) - Comprehensive VPS deployment guide

## Support

For issues with deployment, please check:
1. The documentation in [`VPS_DEPLOYMENT.md`](file://c:\Users\79779\Desktop\mooza_dev\mooza_dev\VPS_DEPLOYMENT.md)
2. The application logs
3. Open an issue on the GitHub repository