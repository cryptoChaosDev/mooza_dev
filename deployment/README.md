# Mooza Deployment

This directory contains scripts and documentation for deploying the Mooza application to various environments.

## Deployment Options

### 1. VPS Deployment (Recommended)

Deploy Mooza to a Linux VPS server for production use.

**Files:**
- `deploy-to-vps.sh` - Bash script to deploy directly on a Linux VPS
- `deploy-to-vps.ps1` - PowerShell script to deploy from Windows to a VPS
- `automated-deploy.sh` - Enhanced automated deployment script with better error handling
- `simple-deploy.sh` - Simplified deployment script for basic setups
- `troubleshoot.sh` - Diagnostic script to help troubleshoot deployment issues
- `fix-deployment.sh` - Script to fix common deployment issues
- `fix-docker-rate-limit.sh` - Script to fix Docker Hub rate limit issues
- `fix-missing-deps.sh` - Script to fix missing dependencies issues
- `detailed-diag.sh` - Detailed diagnostic script for complex issues
- `setup-vps.sh` - Helper script to install and prepare the deployment environment
- `install-deploy.sh` - Simple installer for the deployment tools

### 2. Docker Deployment

Deploy using Docker containers on any Docker-supported platform.

## Quick Start - VPS Deployment

### Automated Deployment (Easiest):

```bash
# One-liner to install and deploy
curl -fsSL https://raw.githubusercontent.com/cryptoChaosDev/mooza_dev/master/deployment/setup-vps.sh | sudo bash
sudo mooza-deploy
```

### Simple Deployment:

```bash
# Download and run the simple deployment script
curl -fsSL -o simple-deploy.sh https://raw.githubusercontent.com/cryptoChaosDev/mooza_dev/master/deployment/simple-deploy.sh
chmod +x simple-deploy.sh
sudo ./simple-deploy.sh
```

### Troubleshooting Deployment Issues:

```bash
# Download and run the troubleshooting script
curl -fsSL -o troubleshoot.sh https://raw.githubusercontent.com/cryptoChaosDev/mooza_dev/master/deployment/troubleshoot.sh
chmod +x troubleshoot.sh
sudo ./troubleshoot.sh
```

### Fixing Common Deployment Issues:

```bash
# Download and run the fix deployment script
curl -fsSL -o fix-deployment.sh https://raw.githubusercontent.com/cryptoChaosDev/mooza_dev/master/deployment/fix-deployment.sh
chmod +x fix-deployment.sh
sudo ./fix-deployment.sh
```

### Fixing Docker Hub Rate Limit Issues:

```bash
# Download and run the Docker rate limit fix script
curl -fsSL -o fix-docker-rate-limit.sh https://raw.githubusercontent.com/cryptoChaosDev/mooza_dev/master/deployment/fix-docker-rate-limit.sh
chmod +x fix-docker-rate-limit.sh
sudo ./fix-docker-rate-limit.sh
```

### Fixing Missing Dependencies Issues:

```bash
# Download and run the missing dependencies fix script
curl -fsSL -o fix-missing-deps.sh https://raw.githubusercontent.com/cryptoChaosDev/mooza_dev/master/deployment/fix-missing-deps.sh
chmod +x fix-missing-deps.sh
sudo ./fix-missing-deps.sh
```

### Detailed Diagnostics for Complex Issues:

```bash
# Download and run the detailed diagnostic script
curl -fsSL -o detailed-diag.sh https://raw.githubusercontent.com/cryptoChaosDev/mooza_dev/master/deployment/detailed-diag.sh
chmod +x detailed-diag.sh
sudo ./detailed-diag.sh
```

### Manual Deployment:

#### From Linux VPS:
```bash
# Copy the deployment script to your VPS
scp deploy-to-vps.sh root@your-vps-ip:/root/

# SSH into your VPS
ssh root@your-vps-ip

# Make the script executable and run it
chmod +x deploy-to-vps.sh
./deploy-to-vps.sh
```

#### From Windows:
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
- `VPS_DEPLOYMENT.md` - Comprehensive VPS deployment guide
- `AUTOMATED_DEPLOYMENT.md` - Guide for the new automated deployment system

## Support

For issues with deployment, please check:
1. The documentation in `VPS_DEPLOYMENT.md`
2. The application logs
3. Run the troubleshooting script
4. Try the fix deployment script
5. Fix Docker rate limit issues
6. Fix missing dependencies issues
7. Run the detailed diagnostics script
8. Open an issue on the GitHub repository