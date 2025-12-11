# Mooza Deployment Scripts

This directory contains scripts for deploying the Mooza application to a VPS.

## Available Scripts

### 1. Automated Deployment Script
- **File**: [automated-deploy.sh](file:///c:/Users/79779/Desktop/mooza_dev/mooza_dev/deployment/automated-deploy.sh)
- **Purpose**: Fully automated deployment of the Mooza application to a fresh Ubuntu VPS
- **Usage**: 
  ```bash
  curl -fsSL -o automated-deploy.sh https://raw.githubusercontent.com/cryptoChaosDev/mooza_dev/master/deployment/automated-deploy.sh
  chmod +x automated-deploy.sh
  sudo ./automated-deploy.sh
  ```

### 2. Troubleshooting Script
- **File**: [troubleshoot-deploy.sh](file:///c:/Users/79779/Desktop/mooza_dev/mooza_dev/deployment/troubleshoot-deploy.sh)
- **Purpose**: Diagnose common deployment issues
- **Usage**:
  ```bash
  curl -fsSL -o troubleshoot-deploy.sh https://raw.githubusercontent.com/cryptoChaosDev/mooza_dev/master/deployment/troubleshoot-deploy.sh
  chmod +x troubleshoot-deploy.sh
  sudo ./troubleshoot-deploy.sh
  ```

### 3. Missing Dependencies Fix Script
- **File**: [fix-missing-deps.sh](file:///c:/Users/79779/Desktop/mooza_dev/mooza_dev/deployment/fix-missing-deps.sh)
- **Purpose**: Fix issues with missing dependencies in backend package.json
- **Usage**:
  ```bash
  curl -fsSL -o fix-missing-deps.sh https://raw.githubusercontent.com/cryptoChaosDev/mooza_dev/master/deployment/fix-missing-deps.sh
  chmod +x fix-missing-deps.sh
  sudo ./fix-missing-deps.sh
  ```

### 4. Frontend Assets Fix Script
- **File**: [fix-frontend-assets.sh](file:///c:/Users/79779/Desktop/mooza_dev/mooza_dev/deployment/fix-frontend-assets.sh)
- **Purpose**: Fix issues with frontend asset paths for VPS deployment
- **Usage**:
  ```bash
  curl -fsSL -o fix-frontend-assets.sh https://raw.githubusercontent.com/cryptoChaosDev/mooza_dev/master/deployment/fix-frontend-assets.sh
  chmod +x fix-frontend-assets.sh
  sudo ./fix-frontend-assets.sh
  ```

## Common Issues and Solutions

### White Screen Issue
If you're seeing a white screen when accessing your deployed application, it's likely due to incorrect asset paths in the frontend build.

**Symptoms**:
- Application loads but shows a blank white screen
- Browser console shows 404 errors for CSS/JS files

**Solution**:
Run the [fix-frontend-assets.sh](file:///c:/Users/79779/Desktop/mooza_dev/mooza_dev/deployment/fix-frontend-assets.sh) script to correct the asset paths.

### Docker Rate Limit Issues
Docker Hub has rate limits for anonymous pulls which can cause deployment failures.

**Solution**:
1. Create a Docker Hub account
2. Login to Docker Hub on your VPS:
   ```bash
   sudo docker login
   ```
3. Re-run the deployment script

### Prisma Client Initialization Error
Error: `@prisma/client did not initialize yet. Please run "prisma generate" and try to import it again.`

**Solution**:
Run the [fix-missing-deps.sh](file:///c:/Users/79779/Desktop/mooza_dev/mooza_dev/deployment/fix-missing-deps.sh) script which includes fixes for Prisma client issues.

## Accessing Your Deployed Application

After successful deployment, you can access your application at:
- **Web Interface**: `http://your-vps-ip`
- **API Endpoint**: `http://your-vps-ip/api`
- **Health Check**: `http://your-vps-ip/health`

## Updating Your Deployment

To update your deployed application:
1. Navigate to `/opt/mooza`
2. Pull the latest changes: `git pull origin master`
3. Rebuild and restart services: `sudo docker compose -f docker-compose.prod.yml up -d --build`
