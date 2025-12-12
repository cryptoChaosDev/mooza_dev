#!/bin/bash

# Auto-rebuild script for Mooza
# Checks for repository updates and rebuilds if needed

DEPLOY_DIR="/opt/mooza"
LOG_FILE="/var/log/mooza-auto-rebuild.log"

# Logging functions
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# Check if there are updates
check_for_updates() {
    cd "$DEPLOY_DIR"
    
    # Fetch latest changes
    git fetch origin >> "$LOG_FILE" 2>&1
    
    # Check if local branch is behind remote
    LOCAL=$(git rev-parse HEAD)
    REMOTE=$(git rev-parse @{u})
    
    if [ "$LOCAL" != "$REMOTE" ]; then
        log "Updates detected, starting rebuild..."
        return 0
    else
        log "No updates found"
        return 1
    fi
}

# Rebuild the application
rebuild_application() {
    cd "$DEPLOY_DIR"
    
    # Pull the latest changes
    git pull origin master >> "$LOG_FILE" 2>&1
    
    # Rebuild with Docker Compose
    if [ -n "$JWT_SECRET" ]; then
        JWT_SECRET=$JWT_SECRET sudo -u "$SUDO_USER" docker compose -f docker-compose.prod.yml up -d --build >> "$LOG_FILE" 2>&1
    else
        sudo -u "$SUDO_USER" docker compose -f docker-compose.prod.yml up -d --build >> "$LOG_FILE" 2>&1
    fi
    
    if [ $? -eq 0 ]; then
        log "Application rebuilt successfully"
    else
        log "Application rebuild failed"
        return 1
    fi
}

# Main execution
main() {
    log "Checking for updates..."
    
    if check_for_updates; then
        log "Rebuilding application..."
        rebuild_application
    fi
}

main "$@"