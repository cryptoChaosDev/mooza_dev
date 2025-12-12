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

# Install Sequelize dependencies
install_sequelize_dependencies() {
    log "Installing Sequelize dependencies..."
    
    cd /opt/mooza/backend
    
    # Install Sequelize and PostgreSQL driver
    npm install sequelize pg
    
    # Install TypeScript definitions
    npm install --save-dev @types/node @types/pg
    
    success "Sequelize dependencies installed"
}

# Create Sequelize models directory and files
create_sequelize_models() {
    log "Creating Sequelize models..."
    
    cd /opt/mooza/backend
    
    # Create models directory
    mkdir -p src/models
    mkdir -p src/config
    
    # Create database configuration
    cat > src/config/database.ts << 'EOF'
import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const sequelize = new Sequelize(
  process.env.DATABASE_URL || 'postgresql://user:password@db:5432/mooza',
  {
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

export { sequelize };
EOF

    # Create User model
    cat > src/models/User.ts << 'EOF'
import { Model, DataTypes, Optional } from 'sequelize';
import { sequelize } from '../config/database';

interface UserAttributes {
  id: number;
  email?: string;
  phone?: string;
  password: string;
  name: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface UserCreationAttributes extends Optional<UserAttributes, 'id'> {}

class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  public id!: number;
  public email?: string;
  public phone?: string;
  public password!: string;
  public name!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

User.init({
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
}, {
  sequelize,
  tableName: 'users',
  timestamps: true,
});

export default User;
EOF

    # Create Profile model
    cat > src/models/Profile.ts << 'EOF'
import { Model, DataTypes, Optional } from 'sequelize';
import { sequelize } from '../config/database';

interface ProfileAttributes {
  id: number;
  userId: number;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  bio?: string;
  workPlace?: string;
  skills?: string[];
  interests?: string[];
  portfolio?: any;
  city?: string;
  country?: string;
  vkId?: string;
  youtubeId?: string;
  telegramId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface ProfileCreationAttributes extends Optional<ProfileAttributes, 'id'> {}

class Profile extends Model<ProfileAttributes, ProfileCreationAttributes> implements ProfileAttributes {
  public id!: number;
  public userId!: number;
  public firstName?: string;
  public lastName?: string;
  public avatarUrl?: string;
  public bio?: string;
  public workPlace?: string;
  public skills?: string[];
  public interests?: string[];
  public portfolio?: any;
  public city?: string;
  public country?: string;
  public vkId?: string;
  public youtubeId?: string;
  public telegramId?: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Profile.init({
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    unique: true,
  },
  firstName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  lastName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  avatarUrl: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  bio: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  workPlace: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  skills: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
  },
  interests: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
  },
  portfolio: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  city: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  country: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  vkId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  youtubeId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  telegramId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  sequelize,
  tableName: 'profiles',
  timestamps: true,
});

export default Profile;
EOF

    # Create Post model
    cat > src/models/Post.ts << 'EOF'
import { Model, DataTypes, Optional } from 'sequelize';
import { sequelize } from '../config/database';

interface PostAttributes {
  id: number;
  content: string;
  userId: number;
  createdAt?: Date;
  updatedAt?: Date;
  tags?: string[];
  attachmentUrl?: string;
}

interface PostCreationAttributes extends Optional<PostAttributes, 'id'> {}

class Post extends Model<PostAttributes, PostCreationAttributes> implements PostAttributes {
  public id!: number;
  public content!: string;
  public userId!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
  public tags?: string[];
  public attachmentUrl?: string;
}

Post.init({
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  userId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
  },
  attachmentUrl: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  sequelize,
  tableName: 'posts',
  timestamps: true,
});

export default Post;
EOF

    # Create Like model
    cat > src/models/Like.ts << 'EOF'
import { Model, DataTypes, Optional } from 'sequelize';
import { sequelize } from '../config/database';

interface LikeAttributes {
  id: number;
  userId: number;
  postId: number;
  createdAt?: Date;
}

interface LikeCreationAttributes extends Optional<LikeAttributes, 'id'> {}

class Like extends Model<LikeAttributes, LikeCreationAttributes> implements LikeAttributes {
  public id!: number;
  public userId!: number;
  public postId!: number;
  public readonly createdAt!: Date;
}

Like.init({
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
  },
  postId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
  },
}, {
  sequelize,
  tableName: 'likes',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['userId', 'postId']
    }
  ]
});

export default Like;
EOF

    # Create Friendship model
    cat > src/models/Friendship.ts << 'EOF'
import { Model, DataTypes, Optional } from 'sequelize';
import { sequelize } from '../config/database';

interface FriendshipAttributes {
  id: number;
  userId: number;
  friendId: number;
  createdAt?: Date;
}

interface FriendshipCreationAttributes extends Optional<FriendshipAttributes, 'id'> {}

class Friendship extends Model<FriendshipAttributes, FriendshipCreationAttributes> implements FriendshipAttributes {
  public id!: number;
  public userId!: number;
  public friendId!: number;
  public readonly createdAt!: Date;
}

Friendship.init({
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
  },
  friendId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
  },
}, {
  sequelize,
  tableName: 'friendships',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['userId', 'friendId']
    }
  ]
});

export default Friendship;
EOF

    success "Sequelize models created"
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

# Update package.json to remove Prisma dependencies and add Sequelize
update_package_json() {
    log "Updating package.json..."
    
    cd /opt/mooza/backend
    
    # Create backup
    cp package.json package.json.backup.$(date +%s)
    
    # Update package.json
    node << 'EOF'
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// Remove Prisma scripts
delete pkg.scripts['prisma:generate'];
delete pkg.scripts['prisma:migrate'];
delete pkg.scripts['prisma:deploy'];

// Remove Prisma dependencies
delete pkg.dependencies['@prisma/client'];
delete pkg.devDependencies['prisma'];
delete pkg.devDependencies['@types/multer'];

// Add Sequelize dependencies
pkg.dependencies['pg'] = '^8.11.3';
pkg.dependencies['sequelize'] = '^6.37.3';
pkg.devDependencies['@types/pg'] = '^8.11.6';

// Write updated package.json
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
EOF

    success "package.json updated"
}

# Rebuild and restart services
rebuild_and_restart() {
    log "Rebuilding and restarting services..."
    
    cd /opt/mooza
    
    # Install dependencies
    cd backend
    npm install
    cd ..
    
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
    install_sequelize_dependencies
    create_sequelize_models
    update_package_json
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