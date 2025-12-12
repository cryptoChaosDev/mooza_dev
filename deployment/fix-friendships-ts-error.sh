#!/bin/bash

# Mooza Fix Script: Friendships Route TypeScript Error
# Fixes the specific TypeScript error in friendships route preventing Docker build

echo "========================================="
echo "  Mooza Friendships Route Fix Script"
echo "========================================="
echo

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

success() {
    echo -e "${GREEN}[SUCCESS] $1${NC}"
}

warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root. Please use sudo."
        exit 1
    fi
}

# Check deployment directory
check_deployment_dir() {
    log "Checking deployment directory..."
    if [ ! -d "/opt/mooza" ]; then
        error "Deployment directory /opt/mooza not found"
        exit 1
    fi
    
    cd /opt/mooza
    
    if [ ! -f "backend/package.json" ]; then
        error "Backend package.json not found"
        exit 1
    fi
    
    success "Deployment directory verified"
}

# Fix friendships route TypeScript error
fix_friendships_route_ts_error() {
    log "Fixing friendships route TypeScript error..."
    
    cd /opt/mooza
    
    # Create a backup of the original file
    if [ -f "backend/src/routes/friendships.ts" ]; then
        cp backend/src/routes/friendships.ts backend/src/routes/friendships.ts.backup.$(date +%s)
        success "Backup of friendships.ts created"
    fi
    
    # Write the correct implementation
    cat > backend/src/routes/friendships.ts << 'EOF'
import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth";
import User from "../models/User";
import Friendship from "../models/Friendship";

const router = Router();

// Get friends list
router.get("/me/friends", authenticateToken, async (req: any, res: Response) => {
  try {
    // First get the friendships
    const friendships = await Friendship.findAll({
      where: {
        userId: req.user.userId
      }
    });

    // Then get the friend users
    const friendIds = friendships.map(f => f.friendId);
    const friends = await User.findAll({
      where: {
        id: friendIds
      },
      attributes: ['id', 'name', 'email']
    });

    res.json(friends);
  } catch (error) {
    console.error("Get friends error:", error);
    res.status(500).json({ error: "Failed to fetch friends" });
  }
});

// Add friend
router.post("/me/friends/:friendId", authenticateToken, async (req: any, res: Response) => {
  try {
    const friendId = parseInt(req.params.friendId);
    
    // Check if friendship already exists
    const existingFriendship = await Friendship.findOne({
      where: {
        userId: req.user.userId,
        friendId: friendId
      }
    });

    if (existingFriendship) {
      return res.status(400).json({ error: "Already friends" });
    }

    // Create friendship
    const friendship = await Friendship.create({
      userId: req.user.userId,
      friendId: friendId
    });

    res.status(201).json(friendship);
  } catch (error) {
    console.error("Add friend error:", error);
    res.status(500).json({ error: "Failed to add friend" });
  }
});

// Remove friend
router.delete("/me/friends/:friendId", authenticateToken, async (req: any, res: Response) => {
  try {
    const friendId = parseInt(req.params.friendId);
    
    const friendship = await Friendship.findOne({
      where: {
        userId: req.user.userId,
        friendId: friendId
      }
    });

    if (!friendship) {
      return res.status(404).json({ error: "Friendship not found" });
    }

    await friendship.destroy();
    res.json({ message: "Friend removed" });
  } catch (error) {
    console.error("Remove friend error:", error);
    res.status(500).json({ error: "Failed to remove friend" });
  }
});

export { router };
EOF

    success "Friendships route TypeScript error fixed"
}

# Rebuild and restart services
rebuild_and_restart() {
    log "Rebuilding and restarting services..."
    
    cd /opt/mooza
    
    # Stop the services
    sudo -u "$SUDO_USER" docker compose -f docker-compose.prod.yml down
    
    # Remove any existing images
    sudo -u "$SUDO_USER" docker rmi mooza-api 2>/dev/null || true
    
    # Build and start the services
    sudo -u "$SUDO_USER" docker compose -f docker-compose.prod.yml up -d --build
    
    success "Services rebuilt and restarted"
}

# Wait and verify
wait_and_verify() {
    log "Waiting for services to start..."
    
    sleep 15
    
    log "Checking service status..."
    
    if sudo -u "$SUDO_USER" docker compose -f docker-compose.prod.yml ps | grep -q "Up"; then
        success "Services are running"
    else
        warning "Some services may not be running correctly"
        log "Checking logs..."
        sudo -u "$SUDO_USER" docker compose -f docker-compose.prod.yml logs --tail=20
    fi
}

# Main execution
main() {
    check_root
    check_deployment_dir
    fix_friendships_route_ts_error
    rebuild_and_restart
    wait_and_verify
    
    echo
    success "Friendships route TypeScript error fix applied successfully!"
    log "The Docker build should now complete without the TypeScript error."
    log "If you still encounter issues, please check the logs with:"
    log "  docker compose -f docker-compose.prod.yml logs"
}

# Run main function
main "$@"