import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import { z } from "zod";
import multer from "multer";
import { Buffer } from "buffer";
import xss from "xss";

const prisma = new PrismaClient();
export const router = Router();

const env = { JWT_SECRET: process.env.JWT_SECRET || "dev-secret" };

// Sanitize user input to prevent XSS attacks
function sanitizeInput(input: string): string {
  // Allow some safe HTML for rich text content
  return xss(input, {
    whiteList: {
      br: [],
      p: [],
      strong: [],
      em: [],
      u: [],
      ol: [],
      ul: [],
      li: [],
      a: ['href', 'target'],
    },
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script']
  });
}

function authUserId(req: any): number | null {
  const auth = req.header("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try {
  const token = auth.slice("Bearer ".length);
  const payload = jwt.verify(token, env.JWT_SECRET) as unknown as { sub: number };
  return payload.sub;
  } catch {
    return null;
  }
}

router.get("/me", async (req, res) => {
  const userId = authUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  
  try {
    const user = await prisma.user.findUnique({ 
      where: { id: userId },
      include: { profile: true }
    });
    
    if (!user?.profile) {
      return res.status(404).json({ error: "Profile not found" });
    }
    
    const profile = user.profile;
    const sanitizedFirstName = sanitizeInput(profile.firstName || '');
    const sanitizedLastName = sanitizeInput(profile.lastName || '');
    const sanitizedName = sanitizeInput(user.name);
    const sanitizedBio = profile.bio ? sanitizeInput(profile.bio) : '';
    const sanitizedWorkPlace = profile.workPlace ? sanitizeInput(profile.workPlace) : '';
    const sanitizedCity = profile.city ? sanitizeInput(profile.city) : '';
    const sanitizedCountry = profile.country ? sanitizeInput(profile.country) : '';
    
    const prof: any = {
      firstName: sanitizedFirstName,
      lastName: sanitizedLastName,
      name: sanitizedName,
      bio: sanitizedBio,
      workPlace: sanitizedWorkPlace,
      skills: profile.skillsCsv ? profile.skillsCsv.split(',').filter(Boolean) : [],
      interests: profile.interestsCsv ? profile.interestsCsv.split(',').filter(Boolean) : [],
      portfolio: profile.portfolioJson ? JSON.parse(profile.portfolioJson) : null,
      phone: user.phone || '',
      email: user.email || '',
      avatarUrl: profile.avatarUrl || '',
      city: sanitizedCity,
      country: sanitizedCountry,
    };
    
    res.json({ profile: prof });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// Setup multer for file uploads with size limits and file type validation
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (_req, file, cb) => {
    // Accept PDF, DOC, DOCX for portfolio files
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Недопустимый формат файла. Разрешены только PDF, DOC, DOCX'));
    }
  }
});

// Setup multer for avatar uploads with size limits and file type validation
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (_req, file, cb) => {
    // Accept only image files for avatars
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Недопустимый формат файла. Разрешены только JPG, PNG, GIF'));
    }
  }
});

// Эндпоинт для загрузки файла портфолио
router.post("/me/portfolio-file", upload.single('file'), async (req, res) => {
  try {
    const userId = authUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Файл не предоставлен" });

    // Validate file size again (extra security measure)
    if (file.size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: "Файл слишком большой. Максимальный размер 5MB." });
    }

    const profile = await prisma.profile.update({
      where: { userId },
      // cast to any to allow writing raw binary fields added to schema
      data: ({
        portfolioFile: Buffer.from(file.buffer),
        portfolioFileName: file.originalname.substring(0, 100), // Limit filename length
        portfolioFileType: file.mimetype.substring(0, 50) // Limit mimetype length
      } as any)
    });

    res.json({ success: true, fileName: file.originalname });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: "Ошибка при загрузке файла" });
  }
});

// Эндпоинт для скачивания файла портфолио
router.get("/me/portfolio-file", async (req, res) => {
  try {
    const userId = authUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    
    const profile = await prisma.profile.findUnique({ where: { userId } });
    const profAny = profile as any;
    if (!profAny?.portfolioFile) {
      return res.status(404).json({ error: "Файл не найден" });
    }

    res.setHeader('Content-Type', profAny.portfolioFileType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(profAny.portfolioFileName || 'download')}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff'); // Security header
    res.send(profAny.portfolioFile);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ error: "Ошибка при скачивании файла" });
  }
});

// Эндпоинт для загрузки аватара
router.post("/me/avatar", avatarUpload.single('avatar'), async (req, res) => {
  try {
    const userId = authUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Файл не предоставлен" });

    // Validate file size again (extra security measure)
    if (file.size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: "Файл слишком большой. Максимальный размер 5MB." });
    }

    // For simplicity, we'll store the avatar as a base64 string in the database
    // In a production environment, you'd want to store this in a file system or cloud storage
    const avatarBase64 = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    
    const profile = await prisma.profile.update({
      where: { userId },
      data: {
        avatarUrl: avatarBase64
      }
    });

    res.json({ success: true, avatarUrl: avatarBase64 });
  } catch (error) {
    console.error('Error uploading avatar:', error);
    res.status(500).json({ error: "Ошибка при загрузке аватара" });
  }
});

router.put("/me", async (req, res) => {
  const userId = authUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  
  // Validate and parse request body with Zod
  const profileSchema = z.object({
    firstName: z.string().min(1).max(50).transform(s => s.trim()),
    lastName: z.string().min(1).max(50).transform(s => s.trim()),
    avatarUrl: z.string().url().nullable().optional().or(z.literal("")),
    bio: z.string().optional().default("").transform(s => s.trim().substring(0, 1000)),
    workPlace: z.string().optional().default("").transform(s => s.trim().substring(0, 100)),
    skills: z.array(z.string().min(1).max(50)).default([]).transform(arr => arr.map(s => s.trim()).filter(Boolean)),
    interests: z.array(z.string().min(1).max(50)).default([]).transform(arr => arr.map(s => s.trim()).filter(Boolean)),
    portfolio: z.object({
      text: z.string().optional().default("").transform(s => s.trim().substring(0, 500)),
      fileName: z.string().optional(),
      fileUrl: z.string().optional(),
    }).nullable().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    city: z.string().optional().default("").transform(s => s.trim().substring(0, 50)),
    country: z.string().optional().default("").transform(s => s.trim().substring(0, 50)),
  });

  // Parse and validate request body
  const parseResult = profileSchema.safeParse(req.body);
  if (!parseResult.success) {
    console.error('Validation error:', parseResult.error.flatten());
    return res.status(400).json({ error: "Validation failed", details: parseResult.error.flatten() });
  }
  
  const data = parseResult.data;
  
  // Debug parsed & validated data
  console.log('PUT /profile/me validated data:', JSON.stringify(data, null, 2));

  // Temporary debug log to inspect incoming payload and catch mapping issues
  try {
    console.log('PUT /profile/me payload (raw req.body):', JSON.stringify(req.body));
    console.log('PUT /profile/me parsed data:', JSON.stringify(data));
  } catch (e) {
    console.log('PUT /profile/me payload: [unable to stringify request body]');
  }

  // normalize phone similar to auth routes
  const normalizePhone = (phone?: string) => {
    if (!phone) return undefined;
    const digits = phone.replace(/\D/g, '');
    if (!digits) return undefined;
    if (digits.startsWith('8')) return '+7' + digits.slice(1);
    if (digits.startsWith('7')) return '+7' + digits.slice(1);
    return '+' + digits;
  };

  const name = `${data.firstName} ${data.lastName}`.trim();
  const normalizedPhone = normalizePhone(data.phone);

  // Update both User and Profile in a transaction
  const updatedRaw = await prisma.$transaction(async (tx) => {
    // update user (name / phone / email) if provided
    const userUpdate: any = { name };
    if (data.email) userUpdate.email = data.email;
    if (normalizedPhone) userUpdate.phone = normalizedPhone;
    await tx.user.update({ where: { id: userId }, data: userUpdate });

    // Prepare profile data (validated and transformed by zod)
    const profileData = {
      firstName: data.firstName, // Already trimmed by zod
      lastName: data.lastName,   // Already trimmed by zod
      avatarUrl: data.avatarUrl || null,
      bio: data.bio,            // Already trimmed by zod
      workPlace: data.workPlace,// Already trimmed by zod
      skillsCsv: data.skills.join(','), // Already filtered by zod
      interestsCsv: data.interests.join(','), // Already filtered by zod
      portfolioJson: data.portfolio ? JSON.stringify(data.portfolio) : null,
      city: data.city,          // Already trimmed by zod
      country: data.country,    // Already trimmed by zod
    };

    console.log('Saving profile data:', JSON.stringify(profileData, null, 2));

    const up = await tx.profile.upsert({
      where: { userId },
      update: profileData,
      create: {
        userId,
        ...profileData,
      },
    });
    return up;
  });

  const updated = {
    ...updatedRaw,
    skills: updatedRaw.skillsCsv ? updatedRaw.skillsCsv.split(',').filter(Boolean) : [],
    interests: updatedRaw.interestsCsv ? updatedRaw.interestsCsv.split(',').filter(Boolean) : [],
    portfolio: updatedRaw.portfolioJson ? JSON.parse(updatedRaw.portfolioJson) : null,
  } as any;
  res.json({ profile: updated });
});

// New endpoint to fetch all users with their profiles
router.get("/", async (req, res) => {
  try {
    const currentUserId = authUserId(req);
    if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });
    
    // Get all users with their profiles, excluding the current user
    const usersWithProfiles = await prisma.user.findMany({
      where: {
        id: {
          not: currentUserId
        }
      },
      include: {
        profile: true
      }
    });

    // Transform the data to match the frontend UserProfile type
    const users = usersWithProfiles.map(user => {
      const profile = user.profile;
      if (!profile) return null;

      // Sanitize all text fields to prevent XSS
      const sanitizedFirstName = sanitizeInput(profile.firstName || '');
      const sanitizedLastName = sanitizeInput(profile.lastName || '');
      const sanitizedName = sanitizeInput(user.name);
      const sanitizedBio = profile.bio ? sanitizeInput(profile.bio) : '';
      const sanitizedWorkPlace = profile.workPlace ? sanitizeInput(profile.workPlace) : '';
      const sanitizedCity = profile.city ? sanitizeInput(profile.city) : '';
      const sanitizedCountry = profile.country ? sanitizeInput(profile.country) : '';

      return {
        userId: `user_${user.id}`,
        firstName: sanitizedFirstName,
        lastName: sanitizedLastName,
        name: sanitizedName,
        bio: sanitizedBio,
        workPlace: sanitizedWorkPlace,
        skills: profile.skillsCsv ? profile.skillsCsv.split(',').filter(Boolean) : [],
        interests: profile.interestsCsv ? profile.interestsCsv.split(',').filter(Boolean) : [],
        portfolio: profile.portfolioJson ? JSON.parse(profile.portfolioJson) : null,
        phone: user.phone || '',
        email: user.email || '',
        avatarUrl: profile.avatarUrl || '',
        city: sanitizedCity,
        country: sanitizedCountry,
        socials: [] // We might want to add social links to the database schema in the future
      };
    }).filter(Boolean); // Remove any null entries

    res.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Friends endpoints using raw SQL queries since Prisma client may not be updated
// Add a friend
router.post("/me/friends/:userId", async (req, res) => {
  const currentUserId = authUserId(req);
  if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });

  const targetUserIdStr = req.params.userId;
  const targetUserId = parseInt(targetUserIdStr.replace('user_', ''));
  
  if (isNaN(targetUserId)) {
    return res.status(400).json({ error: "Invalid user ID" });
  }

  // Prevent users from adding themselves
  if (currentUserId === targetUserId) {
    return res.status(400).json({ error: "Cannot add yourself as friend" });
  }

  try {
    // Get both users to verify they exist
    const [currentUser, targetUser] = await Promise.all([
      prisma.user.findUnique({ where: { id: currentUserId } }),
      prisma.user.findUnique({ where: { id: targetUserId } })
    ]);

    if (!currentUser || !targetUser) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get current user's profile using raw query to access friendsCsv
    const currentUserProfiles: any[] = await prisma.$queryRaw`
      SELECT * FROM Profile WHERE userId = ${currentUserId}
    `;

    let currentUserProfile = currentUserProfiles[0];

    // Create profile if it doesn't exist
    if (!currentUserProfile) {
      const names = currentUser.name.split(' ');
      const firstName = names[0] || currentUser.name;
      const lastName = names.slice(1).join(' ') || '';
      
      await prisma.$executeRaw`
        INSERT INTO Profile (userId, firstName, lastName, skillsCsv, interestsCsv, friendsCsv, createdAt, updatedAt)
        VALUES (${currentUserId}, ${firstName}, ${lastName}, '', '', '', datetime('now'), datetime('now'))
      `;
      
      // Fetch the newly created profile
      const newProfiles: any[] = await prisma.$queryRaw`
        SELECT * FROM Profile WHERE userId = ${currentUserId}
      `;
      currentUserProfile = newProfiles[0];
    }

    // Parse current friends
    const currentFriends = currentUserProfile.friendsCsv 
      ? currentUserProfile.friendsCsv.split(',').filter(Boolean) 
      : [];

    // Check if already friends
    if (currentFriends.includes(`user_${targetUserId}`)) {
      return res.status(400).json({ error: "Already friends" });
    }

    // Add new friend
    const updatedFriends = [...currentFriends, `user_${targetUserId}`];
    
    // Update profile using raw query
    await prisma.$executeRaw`
      UPDATE Profile 
      SET friendsCsv = ${updatedFriends.join(',')}
      WHERE userId = ${currentUserId}
    `;

    res.json({ success: true });
  } catch (error) {
    console.error('Error adding friend:', error);
    res.status(500).json({ error: "Failed to add friend" });
  }
});

// Remove a friend
router.delete("/me/friends/:userId", async (req, res) => {
  const currentUserId = authUserId(req);
  if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });

  const targetUserIdStr = req.params.userId;
  const targetUserId = parseInt(targetUserIdStr.replace('user_', ''));
  
  if (isNaN(targetUserId)) {
    return res.status(400).json({ error: "Invalid user ID" });
  }

  try {
    // Get current user's profile using raw query
    const currentUserProfiles: any[] = await prisma.$queryRaw`
      SELECT * FROM Profile WHERE userId = ${currentUserId}
    `;

    const currentUserProfile = currentUserProfiles[0];

    if (!currentUserProfile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    // Parse current friends
    const currentFriends = currentUserProfile.friendsCsv 
      ? currentUserProfile.friendsCsv.split(',').filter(Boolean) 
      : [];

    // Check if not friends
    if (!currentFriends.includes(`user_${targetUserId}`)) {
      return res.status(400).json({ error: "Not friends" });
    }

    // Remove friend
    const updatedFriends = currentFriends.filter((id: string) => id !== `user_${targetUserId}`);
    
    // Update profile using raw query
    await prisma.$executeRaw`
      UPDATE Profile 
      SET friendsCsv = ${updatedFriends.join(',')}
      WHERE userId = ${currentUserId}
    `;

    res.json({ success: true });
  } catch (error) {
    console.error('Error removing friend:', error);
    res.status(500).json({ error: "Failed to remove friend" });
  }
});

// Get all friends for current user
router.get("/me/friends", async (req, res) => {
  const currentUserId = authUserId(req);
  if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });

  try {
    // Get current user's profile using raw query
    const currentUserProfiles: any[] = await prisma.$queryRaw`
      SELECT * FROM Profile WHERE userId = ${currentUserId}
    `;

    const currentUserProfile = currentUserProfiles[0];

    if (!currentUserProfile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    // Parse friends
    const friendIds = currentUserProfile.friendsCsv 
      ? currentUserProfile.friendsCsv.split(',').filter(Boolean) 
      : [];

    res.json({ friendIds });
  } catch (error) {
    console.error('Error fetching friends:', error);
    res.status(500).json({ error: "Failed to fetch friends" });
  }
});

// Create a new post
router.post("/me/posts", async (req, res) => {
  const userId = authUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    // First get the user's profile
    const profile = await prisma.profile.findUnique({
      where: { userId }
    });

    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    // Validate request body
    const { content, tags, attachmentUrl } = req.body;
    
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: "Content is required" });
    }

    // Sanitize content to prevent XSS
    const sanitizedContent = sanitizeInput(content);
    
    // Process tags
    const tagsCsv = Array.isArray(tags) ? tags.join(',') : "";

    // Create the post
    // @ts-ignore: Prisma client post model not recognized by TypeScript
    const post = await prisma.post.create({
      data: {
        profileId: profile.id,
        content: sanitizedContent,
        tagsCsv,
        attachmentUrl: attachmentUrl || null
      }
    });

    res.status(201).json({ post });
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ error: "Failed to create post" });
  }
});

// Get all posts for the current user
router.get("/me/posts", async (req, res) => {
  const userId = authUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    // First get the user's profile
    const profile = await prisma.profile.findUnique({
      where: { userId }
    });

    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    // Get all posts for this profile
    // @ts-ignore: Prisma client post model not recognized by TypeScript
    const posts = await prisma.post.findMany({
      where: { profileId: profile.id },
      orderBy: { createdAt: 'desc' }
    });

    // Transform posts to match frontend expectations
    const transformedPosts = posts.map((post: any) => ({
      id: post.id,
      userId: String(userId),
      author: `${profile.firstName} ${profile.lastName}`,
      avatarUrl: profile.avatarUrl || null,
      content: post.content,
      tags: post.tagsCsv ? post.tagsCsv.split(',').filter(Boolean) : [],
      attachmentUrl: post.attachmentUrl || null,
      liked: post.liked,
      favorite: false,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString()
    }));

    res.json({ posts: transformedPosts });
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ error: "Failed to fetch posts" });
  }
});

// Get all posts (for feed)
router.get("/posts", async (req, res) => {
  const userId = authUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    // Get all posts ordered by creation date
    // @ts-ignore: Prisma client post model not recognized by TypeScript
    const posts = await prisma.post.findMany({
      include: {
        profile: {
          include: {
            user: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Transform posts to match frontend expectations
    const transformedPosts = posts.map((post: any) => {
      const profile = post.profile;
      const user = profile.user;
      
      return {
        id: post.id,
        userId: String(user.id),
        author: user.name,
        avatarUrl: profile.avatarUrl || null,
        content: post.content,
        tags: post.tagsCsv ? post.tagsCsv.split(',').filter(Boolean) : [],
        attachmentUrl: post.attachmentUrl || null,
        liked: post.liked,
        favorite: false,
        createdAt: post.createdAt.toISOString(),
        updatedAt: post.updatedAt.toISOString()
      };
    });

    res.json({ posts: transformedPosts });
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ error: "Failed to fetch posts" });
  }
});

// Update a post
router.put("/me/posts/:postId", async (req, res) => {
  const userId = authUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const postId = parseInt(req.params.postId);
    if (isNaN(postId)) {
      return res.status(400).json({ error: "Invalid post ID" });
    }

    // First get the user's profile
    const profile = await prisma.profile.findUnique({
      where: { userId }
    });

    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    // Check if the post belongs to this user
    // @ts-ignore: Prisma client post model not recognized by TypeScript
    const existingPost = await prisma.post.findUnique({
      where: { id: postId }
    });

    if (!existingPost) {
      return res.status(404).json({ error: "Post not found" });
    }

    if (existingPost.profileId !== profile.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Validate request body
    const { content, tags, attachmentUrl } = req.body;
    
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: "Content is required" });
    }

    // Sanitize content to prevent XSS
    const sanitizedContent = sanitizeInput(content);
    
    // Process tags
    const tagsCsv = Array.isArray(tags) ? tags.join(',') : "";

    // Update the post
    // @ts-ignore: Prisma client post model not recognized by TypeScript
    const updatedPost = await prisma.post.update({
      where: { id: postId },
      data: {
        content: sanitizedContent,
        tagsCsv,
        attachmentUrl: attachmentUrl || null
      }
    });

    res.json({ post: updatedPost });
  } catch (error) {
    console.error('Error updating post:', error);
    res.status(500).json({ error: "Failed to update post" });
  }
});

// Delete a post
router.delete("/me/posts/:postId", async (req, res) => {
  const userId = authUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const postId = parseInt(req.params.postId);
    if (isNaN(postId)) {
      return res.status(400).json({ error: "Invalid post ID" });
    }

    // First get the user's profile
    const profile = await prisma.profile.findUnique({
      where: { userId }
    });

    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    // Check if the post belongs to this user
    // @ts-ignore: Prisma client post model not recognized by TypeScript
    const existingPost = await prisma.post.findUnique({
      where: { id: postId }
    });

    if (!existingPost) {
      return res.status(404).json({ error: "Post not found" });
    }

    if (existingPost.profileId !== profile.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Delete the post
    // @ts-ignore: Prisma client post model not recognized by TypeScript
    await prisma.post.delete({
      where: { id: postId }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({ error: "Failed to delete post" });
  }
});

// Toggle post like
router.post("/posts/:postId/like", async (req, res) => {
  const userId = authUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const postId = parseInt(req.params.postId);
    if (isNaN(postId)) {
      return res.status(400).json({ error: "Invalid post ID" });
    }

    // Get the post
    // @ts-ignore: Prisma client post model not recognized by TypeScript
    const post = await prisma.post.findUnique({
      where: { id: postId }
    });

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    // Toggle the liked status
    // @ts-ignore: Prisma client post model not recognized by TypeScript
    const updatedPost = await prisma.post.update({
      where: { id: postId },
      data: {
        liked: !post.liked
      }
    });

    res.json({ liked: updatedPost.liked });
  } catch (error) {
    console.error('Error toggling post like:', error);
    res.status(500).json({ error: "Failed to toggle post like" });
  }
});
