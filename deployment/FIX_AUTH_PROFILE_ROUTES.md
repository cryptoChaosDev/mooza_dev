# Mooza Auth and Profile Routes Fix

This document explains how to use the fix script for issues with authentication and profile routes that prevent proper profile creation and retrieval after registration.

## Problem Description

After registering a new user, the profile is not properly created or retrieved, causing users to not be redirected to their personal cabinet. The issue manifests as:

1. Registration succeeds but profile data is not properly associated with the user
2. Login works but profile data is null or incomplete
3. Users are not redirected to their personal cabinet after authentication

## Root Cause

The issue is caused by inconsistencies in how profiles are created and retrieved in the auth and profile routes:

1. Profiles may not be created during registration
2. The `/profile/me` endpoint may not properly find or create profiles when they don't exist
3. Profile data structure may not match what the frontend expects

## Solution

The fix involves updating both the auth and profile routes to ensure:

1. Profiles are properly created during user registration
2. The `/profile/me` endpoint reliably finds or creates profiles
3. Profile data is returned in the correct format expected by the frontend

## Usage

### Run the Fix Script

```bash
# Download the script
curl -fsSL -o fix-auth-profile-routes.sh https://raw.githubusercontent.com/cryptoChaosDev/mooza_dev/master/deployment/fix-auth-profile-routes.sh

# Make it executable
chmod +x fix-auth-profile-routes.sh

# Run the script with sudo
sudo ./fix-auth-profile-routes.sh
```

## What the Script Does

### 1. Fixes Auth Route Implementation
The script updates the `backend/src/routes/auth.ts` file to ensure proper profile creation during registration:

```typescript
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
      skills: [],
      interests: []
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
```

### 2. Fixes Profile Route Implementation
The script updates the `backend/src/routes/profile.ts` file to ensure proper profile retrieval:

```typescript
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
```

### 3. Rebuilds and Restarts Services
After applying the fixes, the script:

- Stops existing containers
- Removes old images
- Builds new images with corrected code
- Restarts all services
- Verifies services are running correctly

## Verification

After running the script, test the registration and login flow:

1. Register a new user
2. Verify that you're redirected to your personal cabinet
3. Check that profile data is properly loaded
4. Test login with existing users

## Manual Fix (if needed)

If you prefer to apply the fix manually:

1. Update the auth route as shown above
2. Update the profile route as shown above
3. Rebuild and restart the services:

```bash
cd /opt/mooza
sudo -u "$SUDO_USER" docker compose -f docker-compose.prod.yml down
sudo -u "$SUDO_USER" docker rmi mooza-api 2>/dev/null || true
sudo -u "$SUDO_USER" docker compose -f docker-compose.prod.yml up -d --build
```

## Common Issues

### Profile Still Null
If profiles are still showing as null after the fix:

1. Check the database to ensure profiles are being created
2. Verify that the JWT token contains the correct userId
3. Check the logs for any errors in the profile route

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
- The fix ensures backward compatibility with existing users
- Profile data will be automatically created for users who don't have profiles yet