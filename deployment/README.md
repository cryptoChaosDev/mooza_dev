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

Deploy using Docker containers for isolated environments.

**Files:**
- `docker-compose.yml` - Docker Compose configuration for development
- `docker-compose.prod.yml` - Docker Compose configuration for production

### 3. GitHub Pages Deployment

Deploy the frontend to GitHub Pages for static hosting.

**Files:**
- `.github/workflows/deploy.yml` - GitHub Actions workflow for deployment

## Quick Start (VPS)

1. Copy the deployment scripts to your VPS:
   ```bash
   scp deploy-to-vps.sh user@your-vps-ip:/tmp/
   ```

2. SSH into your VPS and run the deployment script:
   ```bash
   ssh user@your-vps-ip
   sudo /tmp/deploy-to-vps.sh
   ```

## Troubleshooting

If you encounter issues during deployment, try these diagnostic tools:

1. **Run the troubleshooting script:**
   ```bash
   curl -fsSL -o troubleshoot.sh https://raw.githubusercontent.com/cryptoChaosDev/mooza_dev/master/deployment/troubleshoot.sh
   chmod +x troubleshoot.sh
   sudo ./troubleshoot.sh
   ```

2. **Check common deployment issues:**
   ```bash
   curl -fsSL -o fix-deployment.sh https://raw.githubusercontent.com/cryptoChaosDev/mooza_dev/master/deployment/fix-deployment.sh
   chmod +x fix-deployment.sh
   sudo ./fix-deployment.sh
   ```

3. **Fix Docker rate limit issues:**
   ```bash
   curl -fsSL -o fix-docker-rate-limit.sh https://raw.githubusercontent.com/cryptoChaosDev/mooza_dev/master/deployment/fix-docker-rate-limit.sh
   chmod +x fix-docker-rate-limit.sh
   sudo ./fix-docker-rate-limit.sh
   ```

4. **Fix missing dependencies issues:**
   ```bash
   curl -fsSL -o fix-missing-deps.sh https://raw.githubusercontent.com/cryptoChaosDev/mooza_dev/master/deployment/fix-missing-deps.sh
   chmod +x fix-missing-deps.sh
   sudo ./fix-missing-deps.sh
   ```

5. **Run detailed diagnostics:**
   ```bash
   curl -fsSL -o detailed-diag.sh https://raw.githubusercontent.com/cryptoChaosDev/mooza_dev/master/deployment/detailed-diag.sh
   chmod +x detailed-diag.sh
   sudo ./detailed-diag.sh
   ```

## Manual Installation

If you prefer to install manually:

1. Install prerequisites:
   ```bash
   sudo apt update
   sudo apt install -y curl git docker.io docker-compose
   ```

2. Clone the repository:
   ```bash
   git clone https://github.com/cryptoChaosDev/mooza_dev.git
   cd mooza_dev
   ```

3. Install dependencies and build:
   ```bash
   cd frontend && npm install && npm run build && cd ..
   cd backend && npm install && npx prisma generate && npm run build && cd ..
   ```

4. Configure environment:
   ```bash
   echo "JWT_SECRET=$(openssl rand -base64 32)" > .env
   ```

5. Start services:
   ```bash
   docker compose up -d
   ```

## Common Issues and Solutions

### Docker Rate Limits
Docker Hub imposes rate limits on anonymous image pulls. To resolve:
1. Create a Docker Hub account
2. Log in on your server: `docker login`
3. Or use the fix-docker-rate-limit.sh script

### Missing Dependencies
If you see TypeScript compilation errors about missing modules:
1. Ensure all required dependencies are in package.json
2. Run npm install in the appropriate directory
3. Or use the fix-missing-deps.sh script

### Container Won't Start
If containers fail to start:
1. Check Docker logs: `docker compose logs`
2. Verify environment variables are set correctly
3. Ensure ports are not already in use
4. Or use the detailed-diag.sh script for comprehensive diagnostics

### NPM Authentication Issues
If you encounter NPM authentication errors:
1. The fix-missing-deps.sh script now handles this by:
   - Clearing the NPM cache
   - Temporarily disabling strict SSL
   - Setting the registry to the official NPM registry
   - Installing packages directly when needed
   - Using alternative installation methods if the primary method fails
2. It will continue with public package installation if authentication fails

### Package Not Found Errors
If you encounter "package not found" errors:
1. The fix-missing-deps.sh script now handles this by:
   - Installing packages directly before full installation
   - Using legacy peer dependencies when needed
   - Clearing all caches and temporary files

### Docker Build Issues
If you encounter Docker build errors related to missing files:
1. The fix-missing-deps.sh script now handles this by:
   - Checking and fixing Dockerfile references to non-existent files
   - Ensuring only existing files are copied during the build process