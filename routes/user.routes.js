const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/user.model");

const ACCESS_SECRET = process.env.SECRET || "ACCESS_TOKEN_SECRET";
const REFRESH_SECRET = process.env.REFRESH_SECRET || "REFRESH_TOKEN_SECRET";

// Helper functions to generate tokens
const generateAccessToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role, email: user.email, name: user.name, lastName: user.lastName },
    ACCESS_SECRET,
    { expiresIn: "15m" }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user._id },
    REFRESH_SECRET,
    { expiresIn: "14d" }
  );
};

// Register (any user can sign up with role: doctor or secretary)
router.post("/register", async (req, res) => {
  try {
    const { name, lastName, email, password, role, phone, dateOfBirth, gender, image } = req.body;

    if (!name || !lastName || !email || !password || !role) {
      return res.status(400).json({ message: "Missing required fields (name, lastName, email, password, role)" });
    }

    if (!["doctor", "secretary"].includes(role)) {
      return res.status(400).json({ message: "Role must be either 'doctor' or 'secretary'" });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      name,
      lastName,
      email: email.toLowerCase(),
      password: hashedPassword,
      role,
      phone,
      dateOfBirth,
      gender,
      image
    });

    await newUser.save();

    res.status(201).json({ message: "User registered successfully", user: {
      id: newUser._id,
      name: newUser.name,
      lastName: newUser.lastName,
      email: newUser.email,
      role: newUser.role
    }});
  } catch (error) {
    res.status(500).json({ message: "Server error during registration", error: error.message });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Support both bcrypt hash and direct plain-text entry in database (auto-upgrade to hash)
    let isMatch = false;
    const isBcryptHash = typeof user.password === "string" && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(user.password);

    if (isBcryptHash) {
      isMatch = await bcrypt.compare(password, user.password);
    } else {
      // Plain text match (e.g. manually set in MongoDB Atlas)
      isMatch = (password === user.password);
      if (isMatch) {
        // Automatically upgrade to bcrypt hash for future security
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
      }
    }

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }


    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshToken = refreshToken;
    await user.save();

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        _id: user._id,
        name: user.name,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        specialty: user.specialty || "Médecin Dentiste",
        phone: user.phone || "",
        dateOfBirth: user.dateOfBirth,
        gender: user.gender
      }
    });
  } catch (error) {
    console.error("CRITICAL LOGIN ERROR:", error);
    res.status(500).json({
      message: `Erreur serveur lors de la connexion: ${error.message || error}`,
      error: error.message || String(error)
    });
  }
});


// Refresh Token Route
router.post("/refresh-token", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(401).json({ message: "Refresh Token required" });
    }

    jwt.verify(refreshToken, REFRESH_SECRET, async (err, decoded) => {
      if (err) {
        return res.status(403).json({ message: "Invalid or expired Refresh Token" });
      }

      const user = await User.findById(decoded.id);
      if (!user || user.refreshToken !== refreshToken) {
        return res.status(403).json({ message: "Invalid Refresh Token" });
      }

      const newAccessToken = generateAccessToken(user);
      const newRefreshToken = generateRefreshToken(user);

      user.refreshToken = newRefreshToken;
      await user.save();

      res.json({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
      });
    });
  } catch (error) {
    res.status(500).json({ message: "Server error during token refresh", error: error.message });
  }
});

// Logout
router.post("/logout", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      const user = await User.findOne({ refreshToken });
      if (user) {
        user.refreshToken = null;
        await user.save();
      }
    }
    res.json({ message: "Logged out successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error during logout", error: error.message });
  }
});

// Update Profile Route (Doctor or Secretary)
router.put("/profile/:id", async (req, res) => {
  try {
    const { name, lastName, email, specialty, phone, password } = req.body;
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (name) user.name = name;
    if (lastName) user.lastName = lastName;
    if (email) user.email = email.toLowerCase();
    if (specialty !== undefined) user.specialty = specialty;
    if (phone !== undefined) user.phone = phone;

    if (password && password.trim().length > 0) {
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password, salt);
    }

    await user.save();

    res.json({
      message: "Profile updated successfully",
      user: {
        id: user._id,
        _id: user._id,
        name: user.name,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        specialty: user.specialty,
        phone: user.phone
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Error updating profile", error: error.message });
  }
});

module.exports = router;
