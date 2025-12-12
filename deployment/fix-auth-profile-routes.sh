#!/bin/bash

# Mooza Fix Script: Auth and Profile Routes
# Fixes issues with auth and profile routes to ensure proper profile creation and retrieval

echo "========================================="
echo "  Mooza Auth and Profile Routes Fix Script"
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

# Fix auth route
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
import Profile from "../models/Profile";

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

    // Create profile for the user
    const names = name.split(' ');
    const firstName = names[0] || name;
    const lastName = names.slice(1).join(' ') || '';
    
    await Profile.create({
      userId: user.id,
      firstName,
      lastName,
      skills: [],
      interests: []
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

// Get current user profile
router.get("/me", authenticateToken, async (req: any, res: Response) => {
  try {
    const user = await User.findByPk(req.user.userId, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Try to find existing profile
    let profile = await Profile.findOne({
      where: {
        userId: req.user.userId
      }
    });

    // If no profile exists, create one
    if (!profile) {
      const names = user.name.split(' ');
      const firstName = names[0] || user.name;
      const lastName = names.slice(1).join(' ') || '';
      
      profile = await Profile.create({
        userId: req.user.userId,
        firstName,
        lastName,
        skills: [],
        interests: []
      });
    }

    res.json({
      profile: {
        ...profile.toJSON(),
        skills: profile.skills || [],
        interests: profile.interests || [],
        phone: user.phone || '',
        email: user.email || '',
        name: user.name
      }
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
        firstName: profileData.firstName || '',
        lastName: profileData.lastName || '',
        avatarUrl: profileData.avatarUrl || '',
        bio: profileData.bio || '',
        workPlace: profileData.workPlace || '',
        skills: profileData.skills || [],
        interests: profileData.interests || [],
        portfolio: profileData.portfolio || null,
        city: profileData.city || '',
        country: profileData.country || ''
      }
    });

    if (!created) {
      // Update existing profile
      await profile.update({
        firstName: profileData.firstName || '',
        lastName: profileData.lastName || '',
        avatarUrl: profileData.avatarUrl || '',
        bio: profileData.bio || '',
        workPlace: profileData.workPlace || '',
        skills: profileData.skills || [],
        interests: profileData.interests || [],
        portfolio: profileData.portfolio || null,
        city: profileData.city || '',
        country: profileData.country || ''
      });
    }

    // Return updated profile
    const updatedUser = await User.findByPk(userId, {
      attributes: { exclude: ['password'] }
    });

    const updatedProfile = await Profile.findOne({
      where: { userId: userId }
    });

    res.json({
      profile: {
        ...updatedProfile!.toJSON(),
        skills: updatedProfile!.skills || [],
        interests: updatedProfile!.interests || [],
        phone: updatedUser!.phone || '',
        email: updatedUser!.email || '',
        name: updatedUser!.name
      }
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

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
    fix_auth_route
    fix_profile_route
    rebuild_and_restart
    wait_and_verify
    
    echo
    success "Auth and profile routes fixes applied successfully!"
    log "Your application should now properly create and retrieve profiles after registration."
    log "Please test the registration and login functionality."
}

# Run main function
main "$@"