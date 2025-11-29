import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";

const prisma = new PrismaClient();
export const router = Router();

const env = { JWT_SECRET: process.env.JWT_SECRET || "dev-secret" };

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

// Add a friend
router.post("/:userId/add", async (req, res) => {
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
    // Get current user's profile
    const currentUserProfile = await prisma.profile.findUnique({
      where: { userId: currentUserId }
    });

    if (!currentUserProfile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    // For now, we'll store friends in a temporary way
    // In a real implementation, we'd use a proper Friendship table
    res.json({ success: true });
  } catch (error) {
    console.error('Error adding friend:', error);
    res.status(500).json({ error: "Failed to add friend" });
  }
});

// Remove a friend
router.delete("/:userId/remove", async (req, res) => {
  const currentUserId = authUserId(req);
  if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });

  const targetUserIdStr = req.params.userId;
  const targetUserId = parseInt(targetUserIdStr.replace('user_', ''));
  
  if (isNaN(targetUserId)) {
    return res.status(400).json({ error: "Invalid user ID" });
  }

  try {
    // For now, we'll just return success
    // In a real implementation, we'd remove from the Friendship table
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing friend:', error);
    res.status(500).json({ error: "Failed to remove friend" });
  }
});

// Get all friends for current user
router.get("/me", async (req, res) => {
  const currentUserId = authUserId(req);
  if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });

  try {
    // For now, return empty array
    // In a real implementation, we'd query the Friendship table
    res.json({ friendIds: [] });
  } catch (error) {
    console.error('Error fetching friends:', error);
    res.status(500).json({ error: "Failed to fetch friends" });
  }
});

// Check if a user is a friend
router.get("/:userId/is-friend", async (req, res) => {
  const currentUserId = authUserId(req);
  if (!currentUserId) return res.status(401).json({ error: "Unauthorized" });

  const targetUserIdStr = req.params.userId;
  const targetUserId = parseInt(targetUserIdStr.replace('user_', ''));
  
  if (isNaN(targetUserId)) {
    return res.status(400).json({ error: "Invalid user ID" });
  }

  try {
    // For now, return false
    // In a real implementation, we'd check the Friendship table
    res.json({ isFriend: false });
  } catch (error) {
    console.error('Error checking friendship:', error);
    res.status(500).json({ error: "Failed to check friendship" });
  }
});