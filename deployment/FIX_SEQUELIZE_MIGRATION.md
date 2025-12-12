# Mooza Sequelize Migration Fix Script

This document explains how to use the fix script for issues encountered during the Sequelize migration.

## Purpose

This script fixes common issues that occur when migrating from Prisma to Sequelize:

1. **Missing auth middleware** - Creates the required authentication middleware
2. **TypeScript compilation errors** - Fixes type issues in route files
3. **Route implementation updates** - Updates routes to use Sequelize models
4. **Service rebuilding** - Rebuilds and restarts Docker containers

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

The script creates the authentication middleware that was missing:

- Creates `backend/src/middleware/auth.ts`
- Implements JWT token verification
- Provides proper TypeScript typings

### 2. Fixes Auth Route

Updates `backend/src/routes/auth.ts` to:

- Fix TypeScript type errors
- Use Sequelize models instead of Prisma client
- Maintain all existing functionality

### 3. Fixes Friendships Route

Updates `backend/src/routes/friendships.ts` to:

- Remove all Prisma references
- Implement Sequelize equivalents
- Maintain all existing endpoints

### 4. Fixes Profile Route

Updates `backend/src/routes/profile.ts` to:

- Replace Prisma client with Sequelize models
- Fix TypeScript compilation issues
- Maintain all existing functionality

### 5. Rebuilds Services

- Stops existing containers
- Removes old images
- Builds new images with updated code
- Restarts services

## Manual Fix Steps

If you prefer to apply the fixes manually:

### 1. Create Auth Middleware

Create `backend/src/middleware/auth.ts`:

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

### 2. Update Route Files

Update each route file to use Sequelize models and fix TypeScript errors as shown in the script.

### 3. Rebuild Services

```bash
cd /opt/mooza
sudo docker compose -f docker-compose.prod.yml down
sudo docker rmi mooza-api
sudo docker compose -f docker-compose.prod.yml up -d --build
```

## Testing

After running the fix script:

1. **Check the logs**:
   ```bash
   sudo docker compose -f docker-compose.prod.yml logs api
   ```

2. **Test registration**:
   ```bash
   curl -X POST http://147.45.166.246/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"password123","name":"Test User"}'
   ```

3. **Test login**:
   ```bash
   curl -X POST http://147.45.166.246/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"password123"}'
   ```

## Troubleshooting

### Common Issues

1. **Build Still Fails**:
   - Check that all Prisma references have been removed
   - Ensure all TypeScript types are correct
   - Verify Sequelize models are properly imported

2. **Runtime Errors**:
   - Check database connection settings
   - Verify environment variables
   - Ensure PostgreSQL container is running

3. **Authentication Issues**:
   - Check JWT_SECRET in environment variables
   - Verify middleware is properly applied to routes

### Rolling Back

If you need to roll back:

1. Restore the backed up files if you made copies
2. Reinstall Prisma if needed:
   ```bash
   cd /opt/mooza/backend
   npm install @prisma/client prisma
   ```

## Benefits

This fix script resolves the immediate issues with the Sequelize migration while maintaining all application functionality. After applying these fixes, your application should:

1. Build successfully without TypeScript errors
2. Run without runtime errors
3. Maintain all existing features
4. Use Sequelize ORM for database operations