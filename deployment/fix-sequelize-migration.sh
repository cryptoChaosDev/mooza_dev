#!/bin/bash

# Mooza Fix Script: Sequelize Migration Issues
# Fixes issues with Sequelize migration and TypeScript compilation errors

echo "========================================="
echo "  Mooza Sequelize Migration Fix Script"
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

# Create missing auth middleware
create_auth_middleware() {
    log "Creating auth middleware..."
    
    cd /opt/mooza
    
    # Create the middleware directory
    mkdir -p backend/src/middleware
    
    # Create the auth middleware
    cat > backend/src/middleware/auth.ts << 'EOF'
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

interface AuthenticatedRequest extends Request {
  user?: {
    userId: number;
  };
}

const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  jwt.verify(token, process.env.JWT_SECRET || "fallback_secret", (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid token" });
    }
    req.user = user as { userId: number };
    next();
  });
};

export { authenticateToken, AuthenticatedRequest };
EOF

    success "Auth middleware created"
}

# Fix auth route TypeScript errors
fix_auth_route() {
    log "Fixing auth route..."
    
    cd /opt/mooza
    
    # Update the auth route
    cat > backend/src/routes/auth.ts << 'EOF'
import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { authenticateToken } from "../middleware/auth";
import User from "../models/User";

const router = Router();

// Register endpoint
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, phone, password, name } = req.body;

    // Validate input
    if ((!email && !phone) || !password || !name) {
      return res.status(400).json({ error: "Все поля обязательны" });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      where: {
        [email ? 'email' : 'phone']: email || phone
      }
    });

    if (existingUser) {
      return res.status(400).json({ error: "Пользователь уже существует" });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = await User.create({
      email,
      phone,
      password: hashedPassword,
      name
    });

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: "24h" }
    );

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        name: user.name
      }
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Registration failed" });
  }
});

// Login endpoint
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, phone, password } = req.body;

    // Validate input
    if ((!email && !phone) || !password) {
      return res.status(400).json({ error: "Email/phone and password are required" });
    }

    // Find user
    const user = await User.findOne({
      where: {
        [email ? 'email' : 'phone']: email || phone
      }
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: "24h" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        name: user.name
      }
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

// Get current user endpoint
router.get("/me", authenticateToken, async (req: any, res: Response) => {
  try {
    const user = await User.findByPk(req.user.userId, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ user });
  } catch (error) {
    console.error("Auth verification error:", error);
    res.status(500).json({ error: "Authentication verification failed" });
  }
});

export { router };
EOF

    success "Auth route fixed"
}

# Fix friendships route
fix_friendships_route() {
    log "Fixing friendships route..."
    
    cd /opt/mooza
    
    # Update friendships route
    cat > backend/src/routes/friendships.ts << 'EOF'
import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth";
import User from "../models/User";
import Friendship from "../models/Friendship";

const router = Router();

// Get friends list
router.get("/me/friends", authenticateToken, async (req: any, res: Response) => {
  try {
    const friendships = await Friendship.findAll({
      where: {
        userId: req.user.userId
      },
      include: [{
        model: User,
        as: 'friend',
        attributes: ['id', 'name', 'email']
      }]
    });

    const friends = friendships.map(f => f.friend);
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

    success "Friendships route fixed"
}

# Fix profile route
fix_profile_route() {
    log "Fixing profile route..."
    
    cd /opt/mooza
    
    # Update profile route
    cat > backend/src/routes/profile.ts << 'EOF'
import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth";
import User from "../models/User";
import Profile from "../models/Profile";
import Post from "../models/Post";
import Like from "../models/Like";
import Friendship from "../models/Friendship";

const router = Router();

// Get all users
router.get("/", authenticateToken, async (req: any, res: Response) => {
  try {
    const users = await User.findAll({
      attributes: { exclude: ['password'] }
    });
    res.json(users);
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Get current user profile
router.get("/me", authenticateToken, async (req: any, res: Response) => {
  try {
    const user = await User.findByPk(req.user.userId, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const profile = await Profile.findOne({
      where: {
        userId: req.user.userId
      }
    });

    res.json({
      ...user.toJSON(),
      profile: profile ? profile.toJSON() : null
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// Update current user profile
router.put("/me", authenticateToken, async (req: any, res: Response) => {
  try {
    const userId = req.user.userId;
    const profileData = req.body;

    // Update user
    await User.update(
      {
        name: `${profileData.firstName || ''} ${profileData.lastName || ''}`.trim()
      },
      {
        where: { id: userId }
      }
    );

    // Find or create profile
    const [profile, created] = await Profile.findOrCreate({
      where: { userId: userId },
      defaults: {
        userId: userId,
        ...profileData
      }
    });

    if (!created) {
      // Update existing profile
      await profile.update(profileData);
    }

    // Return updated profile
    const updatedUser = await User.findByPk(userId, {
      attributes: { exclude: ['password'] }
    });

    const updatedProfile = await Profile.findOne({
      where: { userId: userId }
    });

    res.json({
      ...updatedUser!.toJSON(),
      profile: updatedProfile ? updatedProfile.toJSON() : null
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// Get user posts
router.get("/me/posts", authenticateToken, async (req: any, res: Response) => {
  try {
    const posts = await Post.findAll({
      where: {
        userId: req.user.userId
      },
      order: [['createdAt', 'DESC']]
    });

    res.json(posts);
  } catch (error) {
    console.error("Get user posts error:", error);
    res.status(500).json({ error: "Failed to fetch posts" });
  }
});

// Create post
router.post("/me/posts", authenticateToken, async (req: any, res: Response) => {
  try {
    const { content, tags, attachmentUrl } = req.body;

    const post = await Post.create({
      content,
      userId: req.user.userId,
      tags: tags || [],
      attachmentUrl
    });

    res.status(201).json(post);
  } catch (error) {
    console.error("Create post error:", error);
    res.status(500).json({ error: "Failed to create post" });
  }
});

// Update post
router.put("/me/posts/:postId", authenticateToken, async (req: any, res: Response) => {
  try {
    const postId = parseInt(req.params.postId);
    const { content, tags } = req.body;

    const post = await Post.findOne({
      where: {
        id: postId,
        userId: req.user.userId
      }
    });

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    await post.update({
      content,
      tags: tags || []
    });

    res.json(post);
  } catch (error) {
    console.error("Update post error:", error);
    res.status(500).json({ error: "Failed to update post" });
  }
});

// Delete post
router.delete("/me/posts/:postId", authenticateToken, async (req: any, res: Response) => {
  try {
    const postId = parseInt(req.params.postId);

    const post = await Post.findOne({
      where: {
        id: postId,
        userId: req.user.userId
      }
    });

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    await post.destroy();
    res.json({ message: "Post deleted" });
  } catch (error) {
    console.error("Delete post error:", error);
    res.status(500).json({ error: "Failed to delete post" });
  }
});

// Get all posts (from friends and self)
router.get("/posts", authenticateToken, async (req: any, res: Response) => {
  try {
    // Get friends' IDs
    const friendships = await Friendship.findAll({
      where: {
        userId: req.user.userId
      }
    });

    const friendIds = friendships.map(f => f.friendId);
    friendIds.push(req.user.userId); // Include own posts

    const posts = await Post.findAll({
      where: {
        userId: friendIds
      },
      order: [['createdAt', 'DESC']],
      include: [{
        model: User,
        attributes: ['id', 'name']
      }]
    });

    res.json(posts);
  } catch (error) {
    console.error("Get posts error:", error);
    res.status(500).json({ error: "Failed to fetch posts" });
  }
});

// Toggle post like
router.post("/posts/:postId/like", authenticateToken, async (req: any, res: Response) => {
  try {
    const postId = parseInt(req.params.postId);

    // Check if like already exists
    const existingLike = await Like.findOne({
      where: {
        userId: req.user.userId,
        postId: postId
      }
    });

    if (existingLike) {
      // Remove like
      await existingLike.destroy();
      res.json({ liked: false });
    } else {
      // Add like
      const like = await Like.create({
        userId: req.user.userId,
        postId: postId
      });
      res.json({ liked: true });
    }
  } catch (error) {
    console.error("Toggle like error:", error);
    res.status(500).json({ error: "Failed to toggle like" });
  }
});

export { router };
EOF

    success "Profile route fixed"
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
    create_auth_middleware
    fix_auth_route
    fix_friendships_route
    fix_profile_route
    rebuild_and_restart
    wait_and_verify
    
    echo
    success "Sequelize migration fixes applied successfully!"
    log "Your application should now build and run correctly with Sequelize."
    log "Please test the registration and login functionality."
}

# Run main function
main "$@"