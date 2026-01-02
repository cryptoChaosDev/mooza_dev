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
    const { email, phone, password, name, profileType, firstName, lastName, middleName } = req.body;

    // Validate input
    if ((!email && !phone) || !password || !name || !profileType || !firstName || !lastName) {
      return res.status(400).json({ error: "Все обязательные поля должны быть заполнены" });
    }

    // Check if user already exists
    const existingUserByEmail = email ? await User.findOne({ where: { email } }) : null;
    const existingUserByPhone = phone ? await User.findOne({ where: { phone } }) : null;

    if (existingUserByEmail) {
      return res.status(400).json({ error: "Пользователь с таким email уже существует" });
    }

    if (existingUserByPhone) {
      return res.status(400).json({ error: "Пользователь с таким телефоном уже существует" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await User.create({
      email,
      phone,
      password: hashedPassword,
      name: `${firstName} ${lastName}`.trim(),
      profileType,
      firstName,
      lastName,
      middleName: middleName || '',
    });

    // Create profile
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

    res.json({
      id: user.id,
      email: user.email,
      phone: user.phone,
      name: user.name,
      profileType: user.profileType,
      firstName: user.firstName,
      lastName: user.lastName,
      middleName: user.middleName,
      isSeller: user.isSeller,
      isEmployer: user.isEmployer,
      city: user.city,
      country: user.country,
      myGroup: user.myGroup,
      workPlace: user.workPlace,
      bio: user.bio,
      education: user.education,
      interests: user.interests
    });
  } catch (error) {
    console.error("Get me error:", error);
    res.status(500).json({ error: "Failed to get user" });
  }
});

export { router };