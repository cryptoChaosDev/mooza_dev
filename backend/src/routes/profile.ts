import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth";
import User from "../models/User";
import Profile from "../models/Profile";
import Post from "../models/Post";
import Like from "../models/Like";
import Friendship from "../models/Friendship";
const multer = require('multer');
import path from 'path';
import fs from 'fs';

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req: any, file: any, cb: any) {
    // Use a fixed path that's easy to serve
    const uploadDir = '/app/uploads';
    console.log('Attempting to create/upload to directory:', uploadDir);
    if (!fs.existsSync(uploadDir)) {
      try {
        fs.mkdirSync(uploadDir, { recursive: true });
        console.log('Created upload directory:', uploadDir);
      } catch (err) {
        console.error('Failed to create upload directory:', err);
      }
    }
    console.log('Upload directory exists:', fs.existsSync(uploadDir));
    cb(null, uploadDir);
  },
  filename: function (req: any, file: any, cb: any) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = 'avatar-' + uniqueSuffix + path.extname(file.originalname);
    console.log('Generated filename:', filename);
    cb(null, filename);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req: any, file: any, cb: any) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

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
        skills: '',
        interests: ''
      });
    }

    res.json({
      profile: {
        ...profile.toJSON(),
        skills: profile.skills ? profile.skills.split(',') : [],
        interests: profile.interests ? profile.interests.split(',') : [],
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
    
    console.log("Updating profile for user:", userId);
    console.log("Profile data received:", profileData);

    // Update user fields that exist in the User model
    const updateUserFields: any = {};
    if (profileData.firstName || profileData.lastName) {
      updateUserFields.name = `${profileData.firstName || ''} ${profileData.lastName || ''}`.trim();
    }
    
    if (Object.keys(updateUserFields).length > 0) {
      console.log("Updating user fields:", updateUserFields);
      await User.update(updateUserFields, {
        where: { id: userId }
      });
    }

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
        skills: Array.isArray(profileData.skills) ? profileData.skills.join(',') : (profileData.skills || ''),
        interests: Array.isArray(profileData.interests) ? profileData.interests.join(',') : (profileData.interests || ''),
        portfolio: profileData.portfolio ? (typeof profileData.portfolio === 'string' ? profileData.portfolio : JSON.stringify(profileData.portfolio)) : null,
        city: profileData.city || '',
        country: profileData.country || '',
        vkId: profileData.vkId || '',
        youtubeId: profileData.youtubeId || '',
        telegramId: profileData.telegramId || ''
      }
    });
    
    console.log("Profile found or created:", created);

    if (!created) {
      // Update existing profile
      const updateProfileFields = {
        firstName: profileData.firstName || '',
        lastName: profileData.lastName || '',
        avatarUrl: profileData.avatarUrl || '',
        bio: profileData.bio || '',
        workPlace: profileData.workPlace || '',
        skills: Array.isArray(profileData.skills) ? profileData.skills.join(',') : (profileData.skills || ''),
        interests: Array.isArray(profileData.interests) ? profileData.interests.join(',') : (profileData.interests || ''),
        portfolio: profileData.portfolio ? (typeof profileData.portfolio === 'string' ? profileData.portfolio : JSON.stringify(profileData.portfolio)) : null,
        city: profileData.city || '',
        country: profileData.country || '',
        vkId: profileData.vkId || '',
        youtubeId: profileData.youtubeId || '',
        telegramId: profileData.telegramId || ''
      };
      
      console.log("Updating profile fields:", updateProfileFields);
      await profile.update(updateProfileFields);
    }

    // Return updated profile
    const updatedUser = await User.findByPk(userId, {
      attributes: { exclude: ['password'] }
    });

    const updatedProfile = await Profile.findOne({
      where: { userId: userId }
    });
    
    console.log("Updated user:", updatedUser?.toJSON());
    console.log("Updated profile:", updatedProfile?.toJSON());

    res.json({
      profile: {
        ...updatedProfile!.toJSON(),
        skills: updatedProfile!.skills ? updatedProfile!.skills.split(',') : [],
        interests: updatedProfile!.interests ? updatedProfile!.interests.split(',') : [],
        phone: updatedUser!.phone || '',
        email: updatedUser!.email || '',
        name: updatedUser!.name
      }
    });
  } catch (error) {
    console.error("Update profile error:", error);
    // Log more detailed error information
    if (error instanceof Error) {
      console.error("Error name:", error.name);
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
    res.status(500).json({ error: "Failed to update profile", details: error instanceof Error ? error.message : String(error) });
  }
});

// Get all users
router.get("/", authenticateToken, async (req: any, res: Response) => {
  try {
    const users = await User.findAll({
      attributes: { exclude: ['password'] }
    });
    
    // Get profiles for all users
    const userIds = users.map(user => user.id);
    const profiles = await Profile.findAll({
      where: {
        userId: userIds
      }
    });
    
    // Create a map for quick profile lookup
    const profileMap = profiles.reduce((map, profile) => {
      map[profile.userId] = profile;
      return map;
    }, {} as Record<number, typeof profiles[0]>);
    
    // Combine user and profile data
    const usersWithProfiles = users.map(user => {
      const profile = profileMap[user.id];
      return {
        ...user.toJSON(),
        firstName: profile?.firstName || '',
        lastName: profile?.lastName || '',
        avatarUrl: profile?.avatarUrl || '',
        bio: profile?.bio || '',
        workPlace: profile?.workPlace || '',
        skills: profile?.skills ? profile.skills.split(',') : [],
        interests: profile?.interests ? profile.interests.split(',') : [],
        portfolio: profile?.portfolio || null,
        city: profile?.city || '',
        country: profile?.country || '',
        vkId: profile?.vkId || '',
        youtubeId: profile?.youtubeId || '',
        telegramId: profile?.telegramId || ''
      };
    });
    
    res.json({ users: usersWithProfiles });
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
      order: [["createdAt", "DESC"]]
    });

    // Convert tags from comma-separated string to array
    const postsWithTagsArray = posts.map(post => {
      const postData = post.toJSON();
      return {
        ...postData,
        tags: postData.tags ? postData.tags.split(',') : []
      };
    });

    res.json(postsWithTagsArray);
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
      tags: tags ? (Array.isArray(tags) ? tags.join(',') : tags) : '',
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
      tags: tags ? (Array.isArray(tags) ? tags.join(',') : tags) : ''
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

    // Add user data to each post and convert tags
    const postsWithUserData = posts.map(post => {
      const user = userMap[post.userId];
      const postData = post.toJSON();
      return {
        ...postData,
        tags: postData.tags ? postData.tags.split(',') : [],
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
      attributes: ["id", "name", "email"]
    });
    
    // Get profiles for all friends
    const profiles = await Profile.findAll({
      where: {
        userId: friendIds
      }
    });
    
    // Create a map for quick profile lookup
    const profileMap = profiles.reduce((map, profile) => {
      map[profile.userId] = profile;
      return map;
    }, {} as Record<number, typeof profiles[0]>);
    
    // Combine user and profile data
    const friendsWithProfiles = friends.map(user => {
      const profile = profileMap[user.id];
      return {
        userId: String(user.id),
        firstName: profile?.firstName || '',
        lastName: profile?.lastName || '',
        name: user.name || '',
        avatarUrl: profile?.avatarUrl || '',
        bio: profile?.bio || '',
        workPlace: profile?.workPlace || '',
        skills: profile?.skills ? profile.skills.split(',') : [],
        interests: profile?.interests ? profile.interests.split(',') : [],
        portfolio: profile?.portfolio || null,
        phone: user.phone || '',
        email: user.email || '',
        vkId: profile?.vkId || '',
        youtubeId: profile?.youtubeId || '',
        telegramId: profile?.telegramId || '',
        city: profile?.city || '',
        country: profile?.country || ''
      };
    });

    res.json({ friends: friendsWithProfiles });
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

// Upload avatar endpoint
router.post("/me/avatar", authenticateToken, upload.single('avatar'), async (req: any, res: Response) => {
  try {
    console.log('Received avatar upload request');
    console.log('File info:', req.file);
    
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const userId = req.user.userId;
    
    // Generate avatar URL
    const avatarUrl = `/uploads/${req.file.filename}`;
    console.log('Generated avatar URL:', avatarUrl);
    
    // Update profile with new avatar URL
    const profile = await Profile.findOne({
      where: { userId: userId }
    });
    
    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }
    
    await profile.update({
      avatarUrl: avatarUrl
    });
    
    console.log('Profile updated with avatar URL:', avatarUrl);
    
    res.json({ 
      message: "Avatar uploaded successfully",
      avatarUrl: avatarUrl
    });
  } catch (error) {
    console.error("Avatar upload error:", error);
    res.status(500).json({ error: "Failed to upload avatar" });
  }
});

export { router };
