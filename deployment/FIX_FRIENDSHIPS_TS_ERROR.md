# Mooza Friendships Route TypeScript Error Fix

This document explains how to use the fix script for the specific TypeScript error in the friendships route that prevents the Docker build from completing.

## Problem Description

The Docker build is failing with the following error:

```
src/routes/friendships.ts(22,44): error TS2551: Property 'friend' does not exist on type 'Friendship'. Did you mean 'friendId'?
```

This error occurs because the code is trying to access a property called `friend` on the `Friendship` model, but this property doesn't exist in the Sequelize implementation.

## Root Cause

After migrating from Prisma to Sequelize, the friendships route was not properly updated. The code was still trying to use Prisma-style relationship access where you could directly access related models through properties. In Sequelize, you need to explicitly query related models separately.

Additionally, the Sequelize models and dependencies were not properly installed, causing import errors.

## Solution

The fix involves:

1. Installing the required Sequelize dependencies (sequelize, pg, @types/pg)
2. Creating the Sequelize models directory and model files
3. Updating the package.json to remove Prisma dependencies and add Sequelize dependencies
4. Updating the implementation to use the correct Sequelize approach

## Usage

### Run the Fix Script

```bash
# Download the script
curl -fsSL -o fix-friendships-ts-error.sh https://raw.githubusercontent.com/cryptoChaosDev/mooza_dev/master/deployment/fix-friendships-ts-error.sh

# Make it executable
chmod +x fix-friendships-ts-error.sh

# Run the script with sudo
sudo ./fix-friendships-ts-error.sh
```

## What the Script Does

### 1. Installs Sequelize Dependencies
The script installs the required dependencies:

- `sequelize` - The Sequelize ORM
- `pg` - PostgreSQL driver
- `@types/pg` - TypeScript definitions for PostgreSQL

### 2. Creates Sequelize Models
The script creates all the necessary Sequelize models:

- `backend/src/config/database.ts` - Database configuration
- `backend/src/models/User.ts` - User model
- `backend/src/models/Profile.ts` - Profile model
- `backend/src/models/Post.ts` - Post model
- `backend/src/models/Like.ts` - Like model
- `backend/src/models/Friendship.ts` - Friendship model

### 3. Updates package.json
The script updates the package.json file to:

- Remove Prisma dependencies and scripts
- Add Sequelize dependencies
- Create a backup of the original package.json

### 4. Fixes the Friendships Route Implementation
The script updates the `backend/src/routes/friendships.ts` file with the correct Sequelize implementation:

```typescript
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
```

### 5. Creates Backups
Before making changes, the script creates backups of the original files:

- `backend/src/routes/friendships.ts.backup.[timestamp]`
- `backend/package.json.backup.[timestamp]`

### 6. Rebuilds and Restarts Services
After applying the fix, the script:

- Installs the new dependencies
- Stops existing containers
- Removes old images
- Builds new images with corrected code
- Restarts all services
- Verifies services are running correctly

## Verification

After running the script, the Docker build should complete successfully without the TypeScript error. You can verify this by checking the build logs:

```bash
docker compose -f docker-compose.prod.yml logs --tail=50
```

The build should complete and show something like:

```
=> [7/7] RUN npm run build
=> ✔ [7/7] RUN npm run build
```

## Manual Fix (if needed)

If you prefer to apply the fix manually, you need to:

1. Install the Sequelize dependencies:
   ```bash
   npm install sequelize pg
   npm install --save-dev @types/node @types/pg
   ```

2. Update package.json to remove Prisma dependencies and add Sequelize dependencies

3. Create the model files as shown above

4. Update the `backend/src/routes/friendships.ts` file directly with the correct implementation shown above

## Common Issues

### SSH Host Key Verification
If you encounter SSH host key verification issues when deploying, you may need to remove the cached host key:

```bash
ssh-keygen -R [your-server-ip]
```

### Docker Cache Issues
If the build still fails, you may need to clear Docker's build cache:

```bash
docker builder prune -a
```

## Additional Notes

- The script must be run with sudo privileges
- Ensure you have internet connectivity for Docker image pulls and npm installs
- The fix is specifically targeted at the TypeScript error and doesn't affect other functionality
- The script will automatically install all required dependencies