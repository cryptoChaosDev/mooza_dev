import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { authenticateToken } from "../middleware/auth";
import User from "../models/User";
import Profile from "../models/Profile";

const router = Router();

// Register endpoint
router.post("/register", async (req: Request, res: Response) => {
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

    // Create profile for the user
    const names = name.split(' ');
    const firstName = names[0] || name;
    const lastName = names.slice(1).join(' ') || '';
    
    await Profile.create({
      userId: user.id,
      firstName,
      lastName,
      skills: '',
      interests: ''
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
router.post("/login", async (req: Request, res: Response) => {
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
router.get("/me", authenticateToken, async (req: any, res: Response) => {
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