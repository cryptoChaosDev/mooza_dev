#!/bin/bash

# Mooza Deployment Installer
# Simple script to install the deployment tools

# Detect if we're running as root
if [[ $EUID -eq 0 ]]; then
   echo "This script should not be run as root. It will prompt for sudo when needed."
   exit 1
fi

echo "Installing Mooza deployment tools..."

# Update package list
echo "Updating package list..."
sudo apt update

# Install required tools
echo "Installing required tools..."
sudo apt install -y curl wget git

# Download the setup script
echo "Downloading setup script..."
curl -fsSL -o ~/setup-vps.sh https://raw.githubusercontent.com/cryptoChaosDev/mooza_dev/master/deployment/setup-vps.sh

# Make it executable
chmod +x ~/setup-vps.sh

echo ""
echo "Installation complete!"
echo "To continue with deployment, run:"
echo "  sudo ~/setup-vps.sh"
echo ""