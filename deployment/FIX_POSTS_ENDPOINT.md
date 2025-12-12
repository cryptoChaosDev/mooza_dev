# Mooza Posts Endpoint Fix

This document explains how to use the fix script for the 500 Internal Server Error in the `/profile/posts` endpoint.

## Problem Description

The application was showing a 500 Internal Server Error when trying to fetch posts from the `/profile/posts` endpoint. The error was occurring because:

1. The endpoint was trying to use Sequelize model associations (`include`) that weren't properly defined
2. There was a circular dependency issue between the Post and User models
3. There was a TypeScript error with the `createdAt` field reference

## Root Cause

The issue was in the `/profile/posts` endpoint implementation in `backend/src/routes/profile.ts`. The code had a TypeScript error where `createdAt` was not properly referenced, and there were issues with model associations causing runtime errors.

## Solution

The fix involves updating the `/profile/posts` endpoint to:

1. Properly reference the `createdAt` field for ordering
2. Manually fetch user data instead of using Sequelize's `include` feature
3. Avoid circular dependency issues between models

## Usage

### Run the Fix Script

```bash
# Download the script
curl -fsSL -o fix-posts-endpoint.sh https://raw.githubusercontent.com/cryptoChaosDev/mooza_dev/master/deployment/fix-posts-endpoint.sh

# Make it executable
chmod +x fix-posts-endpoint.sh

# Run the script with sudo
sudo ./fix-posts-endpoint.sh
```

## What the Script Does

### 1. Fixes Posts Endpoint Implementation
The script updates the `/profile/posts` endpoint in `backend/src/routes/profile.ts` to fix the TypeScript error and avoid using Sequelize's `include` feature:

```typescript
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
      order: [["createdAt", "DESC"]]
    });

    // Manually fetch user data for each post
    const userIds = [...new Set(posts.map(post => post.userId))];
    const users = await User.findAll({
      where: {
        id: userIds
      },
      attributes: ["id", "name"]
    });

    // Create a map for quick user lookup
    const userMap = users.reduce((map, user) => {
      map[user.id] = user;
      return map;
    }, {} as Record<number, typeof users[0]>);

    // Add user data to each post
    const postsWithUserData = posts.map(post => {
      const user = userMap[post.userId];
      return {
        ...post.toJSON(),
        user: user ? { id: user.id, name: user.name } : null
      };
    });

    res.json(postsWithUserData);
  } catch (error) {
    console.error("Get posts error:", error);
    res.status(500).json({ error: "Failed to fetch posts" });
  }
});
```

### 2. Rebuilds and Restarts Services
After applying the fix, the script:

- Stops existing containers
- Removes old images
- Builds new images with corrected code
- Restarts all services
- Verifies services are running correctly

## Verification

After running the script, test the posts functionality:

1. Log in to the application
2. Check that posts are loading in the feed without errors
3. Verify that posts show the correct author information
4. Check the browser console for any remaining errors

## Manual Fix (if needed)

If you prefer to apply the fix manually:

1. Update the `/profile/posts` endpoint in `backend/src/routes/profile.ts` as shown above
2. Rebuild and restart the services:

```bash
cd /opt/mooza
sudo -u "$SUDO_USER" docker compose -f docker-compose.prod.yml down
sudo -u "$SUDO_USER" docker rmi mooza-api 2>/dev/null || true
sudo -u "$SUDO_USER" docker compose -f docker-compose.prod.yml up -d --build
```

## Common Issues

### Posts Still Not Loading
If posts are still not loading after the fix:

1. Check the server logs for any remaining errors:
   ```bash
   docker compose -f docker-compose.prod.yml logs api
   ```

2. Verify that the database contains posts data

3. Check that the Friendship table has data for the current user

### Docker Build Issues
If you encounter Docker build issues:

```bash
# Clear Docker build cache
docker builder prune -a

# Rebuild services
sudo -u "$SUDO_USER" docker compose -f docker-compose.prod.yml up -d --build
```

## Additional Notes

- The script must be run with sudo privileges
- Ensure you have internet connectivity for Docker image pulls
- The fix maintains backward compatibility with existing data
- The manual approach avoids circular dependency issues between models