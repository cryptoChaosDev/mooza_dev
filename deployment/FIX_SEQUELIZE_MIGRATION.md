# Mooza Sequelize Migration Fix Script

This document explains how to use the fix script for issues encountered during the Sequelize migration.

## Purpose

This script fixes common issues that occur when migrating from Prisma to Sequelize:

1. **Missing auth middleware** - Creates the required authentication middleware
2. **TypeScript compilation errors** - Fixes type issues in route files
3. **Route implementation updates** - Updates routes to use Sequelize models
4. **Service rebuilding** - Rebuilds and restarts Docker containers
5. **Frontend redirection fix** - Ensures proper navigation after registration

## Usage

### Run the Fix Script

```bash
# Download the script
curl -fsSL -o fix-sequelize-migration.sh https://raw.githubusercontent.com/cryptoChaosDev/mooza_dev/master/deployment/fix-sequelize-migration.sh

# Make it executable
chmod +x fix-sequelize-migration.sh

# Run the script with sudo
sudo ./fix-sequelize-migration.sh
```

## What the Script Does

### 1. Creates Missing Middleware
The script creates the authentication middleware that was missing after the Sequelize migration:

- Creates `backend/src/middleware/auth.ts`
- Implements the `authenticateToken` function
- Properly verifies JWT tokens
- Adds proper typing for authenticated requests

### 2. Fixes Route Implementations
Updates all route files to use Sequelize models instead of Prisma:

- `backend/src/routes/auth.ts` - Registration, login, and user verification
- `backend/src/routes/friendships.ts` - Friend management (add, remove, list)
- `backend/src/routes/profile.ts` - Profile management and posts

### 3. Fixes TypeScript Compilation Errors
Resolves all TypeScript errors that occurred during the migration:

- Corrects model imports
- Updates function signatures
- Fixes property access issues
- Resolves type inconsistencies

### 4. Rebuilds Services
After applying fixes, the script:

- Stops existing containers
- Removes old images
- Builds new images with corrected code
- Restarts all services
- Verifies services are running correctly

### 5. Fixes Frontend Redirection
Ensures proper navigation after registration:

- Updates App.tsx to navigate to home page after registration
- Verifies registration flow redirects correctly

## Common Issues Fixed

### TypeScript Error: Property 'friend' does not exist on type 'Friendship'
This error occurs when trying to access a property that doesn't exist on the Sequelize model. The fix involves:

1. First querying the Friendship model to get friendships
2. Extracting friend IDs from the friendships
3. Then querying the User model separately to get friend details

### Authentication Middleware Missing
After migration, the authentication middleware was missing. The script creates:

```typescript
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
```

## Verification Steps

After running the script, verify that:

1. Services build successfully without TypeScript errors
2. Backend API responds correctly to requests
3. Registration and login work properly
4. Friend management functions correctly
5. Posts can be created and retrieved
6. Frontend redirects properly after registration

## Troubleshooting

If you still encounter issues:

1. Check the logs: `docker compose -f docker-compose.prod.yml logs`
2. Verify all environment variables are set correctly
3. Ensure the database is accessible and has the correct schema
4. Confirm that all dependencies are installed: `npm install` in both frontend and backend directories

## Additional Notes

- The script creates backups of original files before modifying them
- All changes are logged with timestamps for debugging
- The script must be run with sudo privileges
- Ensure you have internet connectivity for Docker image pulls