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

### 3. Fix Frontend Assets Script
- **File**: [fix-frontend-assets.sh](file:///c:/Users/79779/Desktop/mooza_dev/mooza_dev/deployment/fix-frontend-assets.sh)
- **Purpose**: Fix frontend asset path issues for VPS deployment
- **Usage**:
  ```bash
  curl -fsSL -o fix-frontend-assets.sh https://raw.githubusercontent.com/cryptoChaosDev/mooza_dev/master/deployment/fix-frontend-assets.sh
  chmod +x fix-frontend-assets.sh
  sudo ./fix-frontend-assets.sh
  ```

### 4. Fix Frontend API Script
- **File**: [fix-frontend-api.sh](file:///c:/Users/79779/Desktop/mooza_dev/mooza_dev/deployment/fix-frontend-api.sh)
- **Purpose**: Fix frontend API URL configuration issues for VPS deployment
- **Usage**:
  ```bash
  curl -fsSL -o fix-frontend-api.sh https://raw.githubusercontent.com/cryptoChaosDev/mooza_dev/master/deployment/fix-frontend-api.sh
  chmod +x fix-frontend-api.sh
  sudo ./fix-frontend-api.sh
  ```

### 5. PostgreSQL Setup Script
- **File**: [fix-postgres-setup.sh](file:///c:/Users/79779/Desktop/mooza_dev/mooza_dev/deployment/fix-postgres-setup.sh)
- **Purpose**: Configure and set up PostgreSQL database for the Mooza application
- **Usage**:
  ```bash
  curl -fsSL -o fix-postgres-setup.sh https://raw.githubusercontent.com/cryptoChaosDev/mooza_dev/master/deployment/fix-postgres-setup.sh
  chmod +x fix-postgres-setup.sh
  sudo ./fix-postgres-setup.sh
  ```

### 6. Prisma to Sequelize Migration Script
- **File**: [migrate-to-sequelize.sh](file:///c:/Users/79779/Desktop/mooza_dev/mooza_dev/deployment/migrate-to-sequelize.sh)
- **Purpose**: Migrate the application from Prisma ORM to Sequelize ORM
- **Usage**:
  ```bash
  curl -fsSL -o migrate-to-sequelize.sh https://raw.githubusercontent.com/cryptoChaosDev/mooza_dev/master/deployment/migrate-to-sequelize.sh
  chmod +x migrate-to-sequelize.sh
  sudo ./migrate-to-sequelize.sh
  ```

## Documentation

- [Main VPS Deployment Guide](file:///c:/Users/79779/Desktop/mooza_dev/mooza_dev/deployment/VPS_DEPLOYMENT.md)
- [Automated Deployment Guide](file:///c:/Users/79779/Desktop/mooza_dev/mooza_dev/deployment/AUTOMATED_DEPLOYMENT.md)
- [Deployment Checklist](file:///c:/Users/79779/Desktop/mooza_dev/mooza_dev/deployment/DEPLOYMENT_CHECKLIST.md)
- [PostgreSQL Setup Guide](file:///c:/Users/79779/Desktop/mooza_dev/mooza_dev/deployment/POSTGRES_SETUP.md)
- [Sequelize Migration Guide](file:///c:/Users/79779/Desktop/mooza_dev/mooza_dev/deployment/SEQUELIZE_MIGRATION.md)

## Quick Start

For a fresh Ubuntu VPS, the fastest way to deploy is:

```bash
curl -fsSL https://raw.githubusercontent.com/cryptoChaosDev/mooza_dev/master/deployment/automated-deploy.sh | sudo bash
```