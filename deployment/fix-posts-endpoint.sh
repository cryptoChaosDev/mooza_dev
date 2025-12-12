#!/bin/bash

# Mooza Fix Script: Posts Endpoint
# Fixes the 500 Internal Server Error in the /profile/posts endpoint

echo "========================================="
echo "  Mooza Posts Endpoint Fix Script"
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

# Fix profile route posts endpoint
fix_posts_endpoint() {
    log "Fixing posts endpoint in profile route..."
    
    cd /opt/mooza
    
    # Create backup
    cp backend/src/routes/profile.ts backend/src/routes/profile.ts.backup.$(date +%s)
    
    # Update the profile route to fix the posts endpoint
    # We need to find the /posts endpoint and fix it
    sed -i '/\/\/ Get all posts (from friends and self)/,/^});/c\
// Get all posts (from friends and self)\
router.get("/posts", authenticateToken, async (req: any, res: Response) => {\
  try {\
    // Get friends'"'"' IDs\
    const friendships = await Friendship.findAll({\
      where: {\
        userId: req.user.userId\
      }\
    });\
\
    const friendIds = friendships.map(f => f.friendId);\
    friendIds.push(req.user.userId); // Include own posts\
\
    const posts = await Post.findAll({\
      where: {\
        userId: friendIds\
      },\
      order: [['createdAt', '"'"'DESC'"'"']]\
    });\
\
    // Manually fetch user data for each post\
    const userIds = [...new Set(posts.map(post => post.userId))];\
    const users = await User.findAll({\
      where: {\
        id: userIds\
      },\
      attributes: ['"'"'id'"'"', '"'"'name'"'"']\
    });\
\
    // Create a map for quick user lookup\
    const userMap = users.reduce((map, user) => {\
      map[user.id] = user;\
      return map;\
    }, {} as Record<number, typeof users[0]>);\
\
    // Add user data to each post\
    const postsWithUserData = posts.map(post => {\
      const user = userMap[post.userId];\
      return {\
        ...post.toJSON(),\
        user: user ? { id: user.id, name: user.name } : null\
      };\
    });\
\
    res.json(postsWithUserData);\
  } catch (error) {\
    console.error("Get posts error:", error);\
    res.status(500).json({ error: "Failed to fetch posts" });\
  }\
});' backend/src/routes/profile.ts

    success "Posts endpoint fixed"
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
    fix_posts_endpoint
    rebuild_and_restart
    wait_and_verify
    
    echo
    success "Posts endpoint fix applied successfully!"
    log "The /profile/posts endpoint should now work without 500 errors."
    log "Please test the application to verify that posts are loading correctly."
}

# Run main function
main "$@"