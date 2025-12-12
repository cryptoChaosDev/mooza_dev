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

## Solution

The fix involves updating the implementation to:

1. First query the `Friendship` model to get the friendships
2. Extract the friend IDs from the friendships
3. Then query the `User` model separately to get the friend details

This is the correct approach for Sequelize relationships.

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

### 1. Fixes the Friendships Route Implementation
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

### 2. Creates a Backup
Before making changes, the script creates a backup of the original file:

- `backend/src/routes/friendships.ts.backup.[timestamp]`

### 3. Rebuilds and Restarts Services
After applying the fix, the script:

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

If you prefer to apply the fix manually, you can update the `backend/src/routes/friendships.ts` file directly with the correct implementation shown above.

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
- Ensure you have internet connectivity for Docker image pulls
- The fix is specifically targeted at the TypeScript error and doesn't affect other functionality