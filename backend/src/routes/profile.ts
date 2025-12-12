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
