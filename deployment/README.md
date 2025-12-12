# Mooza Deployment Scripts

This directory contains all the scripts needed to deploy and manage the Mooza application.

## Available Scripts

### Main Deployment Scripts
- [automated-deploy.sh](file:///c:/Users/79779/Desktop/mooza_dev/mooza_dev/deployment/automated-deploy.sh) - Complete automated deployment script
- [auto-rebuild.sh](file:///c:/Users/79779/Desktop/mooza_dev/mooza_dev/deployment/auto-rebuild.sh) - Automatic rebuild script for continuous deployment

### Fix Scripts
- [fix-deployment.sh](file:///c:/Users/79779/Desktop/mooza_dev/mooza_dev/deployment/fix-deployment.sh) - General deployment fix script
- [fix-missing-deps.sh](file:///c:/Users/79779/Desktop/mooza_dev/mooza_dev/deployment/fix-missing-deps.sh) - Missing dependencies fix script
- [fix-docker-rate-limit.sh](file:///c:/Users/79779/Desktop/mooza_dev/mooza_dev/deployment/fix-docker-rate-limit.sh) - Docker rate limit fix script
- [fix-posts-endpoint.sh](file:///c:/Users/79779/Desktop/mooza_dev/mooza_dev/deployment/fix-posts-endpoint.sh) - Posts endpoint fix script
- [fix-frontend-assets.sh](file:///c:/Users/79779/Desktop/mooza_dev/mooza_dev/deployment/fix-frontend-assets.sh) - Frontend assets fix script
- [fix-auth-profile-routes.sh](file:///c:/Users/79779/Desktop/mooza_dev/mooza_dev/deployment/fix-auth-profile-routes.sh) - Auth and profile routes fix script
- [fix-sequelize-migration.sh](file:///c:/Users/79779/Desktop/mooza_dev/mooza_dev/deployment/fix-sequelize-migration.sh) - Sequelize migration fix script

### Configuration Files
- [nginx.conf](file:///c:/Users/79779/Desktop/mooza_dev/mooza_dev/deployment/nginx.conf) - Static Nginx configuration file with proper MIME type settings
- [docker-compose.prod.yml](file:///c:/Users/79779/Desktop/mooza_dev/mooza_dev/docker-compose.prod.yml) - Production docker-compose file that references the static nginx.conf

### Diagnostic Scripts
- [troubleshoot.sh](file:///c:/Users/79779/Desktop/mooza_dev/mooza_dev/deployment/troubleshoot.sh) - General troubleshooting script
- [detailed-diag.sh](file:///c:/Users/79779/Desktop/mooza_dev/mooza_dev/deployment/detailed-diag.sh) - Detailed diagnostics script

## Setting Up Continuous Deployment

To set up automatic rebuilding when you push changes to your repository:

1. Copy the auto-rebuild script to your VPS:
   ```bash
   sudo cp deployment/auto-rebuild.sh /opt/mooza/
   sudo chmod +x /opt/mooza/auto-rebuild.sh
   ```

2. Set up a cron job to run the script every 5 minutes:
   ```bash
   sudo crontab -e
   ```
   
   Add this line to the crontab:
   ```
   */5 * * * * /opt/mooza/auto-rebuild.sh
   ```

3. The script will automatically check for updates every 5 minutes and rebuild if needed.

## Manual Redeployment

To manually redeploy the application after making changes:

```bash
cd /opt/mooza
sudo ./deployment/automated-deploy.sh
```

Or to just rebuild with the latest changes:

```bash
cd /opt/mooza
sudo docker compose -f docker-compose.prod.yml up -d --build
```

## Troubleshooting

If you encounter issues, check the logs:
```bash
# Deployment logs
tail -f /var/log/mooza-deploy.log

# Auto-rebuild logs
tail -f /var/log/mooza-auto-rebuild.log

# Container logs
sudo docker compose -f docker-compose.prod.yml logs -f
```

You can also run the troubleshooting scripts:
```bash
# General troubleshooting
sudo ./deployment/troubleshoot.sh

# Detailed diagnostics
sudo ./deployment/detailed-diag.sh
```