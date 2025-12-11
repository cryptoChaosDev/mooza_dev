#!/bin/bash

# Mooza Migration Script: Prisma to Sequelize
# Migrates the Mooza application from Prisma to Sequelize ORM

echo "========================================="
echo "  Mooza Prisma to Sequelize Migration"
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

# Remove Prisma dependencies
remove_prisma_deps() {
    log "Removing Prisma dependencies..."
    
    # Remove Prisma from package.json
    cd /opt/mooza/backend
    
    # Uninstall Prisma packages
    if sudo -u "$SUDO_USER" npm uninstall @prisma/client prisma; then
        success "Prisma packages uninstalled"
    else
        warning "Failed to uninstall Prisma packages"
    fi
    
    # Remove Prisma directory
    if [ -d "prisma" ]; then
        rm -rf prisma
        success "Prisma directory removed"
    fi
    
    cd /opt/mooza
}

# Install Sequelize dependencies
install_sequelize_deps() {
    log "Installing Sequelize dependencies..."
    
    cd /opt/mooza/backend
    
    # Install Sequelize and related packages
    if sudo -u "$SUDO_USER" npm install sequelize pg; then
        success "Sequelize dependencies installed"
    else
        error "Failed to install Sequelize dependencies"
        return 1
    fi
    
    # Install TypeScript definitions
    if sudo -u "$SUDO_USER" npm install --save-dev @types/sequelize; then
        success "TypeScript definitions installed"
    else
        warning "Failed to install TypeScript definitions"
    fi
    
    cd /opt/mooza
}

# Create Sequelize models
create_sequelize_models() {
    log "Creating Sequelize models..."
    
    cd /opt/mooza/backend
    
    # Create models directory
    mkdir -p src/models
    
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
    cd /opt/mooza
}

# Create database configuration
create_database_config() {
    log "Creating database configuration..."
    
    cd /opt/mooza/backend
    
    # Create config directory
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

    success "Database configuration created"
    cd /opt/mooza
}

# Update auth routes to use Sequelize
update_auth_routes() {
    log "Updating auth routes to use Sequelize..."
    
    cd /opt/mooza/backend
    
    # Backup the original auth route
    if [ -f "src/routes/auth.ts" ]; then
        cp src/routes/auth.ts src/routes/auth.ts.prismabackup
    fi
    
    # Create updated auth route
    cat > src/routes/auth.ts << 'EOF'
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User";
import { authenticateToken } from "../middleware/auth";

const router = Router();

// Register endpoint
router.post("/register", async (req, res) => {
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
router.post("/login", async (req, res) => {
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
router.get("/me", authenticateToken, async (req, res) => {
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

    success "Auth routes updated"
    cd /opt/mooza
}

# Update server to initialize Sequelize
update_server_initialization() {
    log "Updating server initialization..."
    
    cd /opt/mooza/backend
    
    # Backup the original server file
    if [ -f "src/server.ts" ]; then
        cp src/server.ts src/server.ts.prismabackup
    fi
    
    # Update server to initialize Sequelize
    cat > src/server.ts << 'EOF'
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { createServer } from "http";
import { sequelize } from "./config/database";
import User from "./models/User";
import Profile from "./models/Profile";
import Post from "./models/Post";
import Like from "./models/Like";
import Friendship from "./models/Friendship";

const app = express();

app.use(cors({
  origin: process.env.NODE_ENV === "production" 
    ? ["https://mooza-music.vercel.app", "http://147.45.166.246"] 
    : ["http://localhost:3000", "http://localhost:4000"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Authorization"],
  maxAge: 86400, // 24 hours
}));
app.use(express.json({ limit: '10mb' }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Add security headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ ok: true, uptimeSec: process.uptime() });
});

// Import routers
import { router as authRouter } from "./routes/auth";
import { router as categoriesRouter } from "./routes/categories";
import { router as profileRouter } from "./routes/profile";
import { router as friendshipsRouter } from "./routes/friendships";

app.use("/auth", authRouter);
app.use("/categories", categoriesRouter);
app.use("/profile", profileRouter);
app.use("/friendships", friendshipsRouter);

// Initialize database
const initializeDatabase = async () => {
  try {
    // Authenticate database connection
    await sequelize.authenticate();
    console.log('Database connection established successfully.');
    
    // Sync models
    await sequelize.sync({ alter: true });
    console.log('Database synchronized successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }
};

export default app;
export { initializeDatabase };
EOF

    # Update index.ts to call initializeDatabase
    cat > src/index.ts << 'EOF'
import app from "./server";
import { initializeDatabase } from "./server";

const port = process.env.PORT || 4000;

// Initialize database before starting server
initializeDatabase().then(() => {
  app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
}).catch((error) => {
  console.error('Failed to initialize database:', error);
  process.exit(1);
});
EOF

    success "Server initialization updated"
    cd /opt/mooza
}

# Update Dockerfile for Sequelize
update_dockerfile() {
    log "Updating Dockerfile for Sequelize..."
    
    cd /opt/mooza/backend
    
    # Backup the original Dockerfile
    if [ -f "Dockerfile" ]; then
        cp Dockerfile Dockerfile.prismabackup
    fi
    
    # Create updated Dockerfile
    cat > Dockerfile << 'EOF'
# Use Node.js 18 as the base image
FROM node:18-alpine

# Install Python and build tools for native dependencies
RUN apk add --no-cache python3 py3-pip make g++

# Set the working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Expose the port
EXPOSE 4000

# Start the application
CMD ["node", "dist/index.js"]
EOF

    success "Dockerfile updated"
    cd /opt/mooza
}

# Update package.json scripts
update_package_json() {
    log "Updating package.json scripts..."
    
    cd /opt/mooza/backend
    
    # Update package.json to remove Prisma scripts and add Sequelize
    sudo -u "$SUDO_USER" npm pkg delete scripts.postinstall
    sudo -u "$SUDO_USER" npm pkg set scripts.build="tsc"
    sudo -u "$SUDO_USER" npm pkg set scripts.start="node dist/index.js"
    
    success "Package.json updated"
    cd /opt/mooza
}

# Restart services
restart_services() {
    log "Restarting services..."
    
    cd /opt/mooza
    
    sudo -u "$SUDO_USER" docker compose -f docker-compose.prod.yml down
    sudo -u "$SUDO_USER" docker compose -f docker-compose.prod.yml up -d --build
    
    success "Services restarted"
}

# Main execution
main() {
    check_root
    check_deployment_dir
    remove_prisma_deps
    install_sequelize_deps
    create_sequelize_models
    create_database_config
    update_auth_routes
    update_server_initialization
    update_dockerfile
    update_package_json
    restart_services
    
    echo
    success "Migration from Prisma to Sequelize completed!"
    log "Your application is now using Sequelize ORM instead of Prisma."
    log "Please test the registration and login functionality."
}

# Run main function
main "$@"