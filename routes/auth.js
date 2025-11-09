const express = require("express");
const router = express.Router();
const pool = require("../db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const authMiddleware = require("../middleware/auth");

// Setup Nodemailer (using Gmail)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER, // Gmail address
    pass: process.env.EMAIL_PASS, // Gmail app password
  },
});

// SIGNUP
router.post("/signup", async (req, res) => {
  const { name, email, password, role } = req.body;
  try {
    // Check if user exists
    const existingUser = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString("hex");

    // Save user as unverified
    await pool.query(
      `
      INSERT INTO users (name, email, password, role, is_verified, verification_token)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
      [name, email, hashedPassword, role, false, verificationToken]
    );

    // Send verification email
    // const link = `http://localhost:5173/verify-email?token=${verificationToken}&email=${encodeURIComponent(email)}`;
    const link = `${
      process.env.CLIENT_URL
    }/verify-email?token=${verificationToken}&email=${encodeURIComponent(
      email
    )}`;

    console.log("Verification link:", link);

    await transporter.sendMail({
      // from: `"RideMyWay" <${process.env.EMAIL_USER}>`,
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Verify Your RideMyWay Account",
      html: `
        <h2>Hi ${name},</h2>
        <p>Thank you for signing up on RideMyWay!</p>
        <p>Click the link below to verify your email address:</p>
        <a href="${link}">Verify Email</a>
        <p>If you didn't request this, you can ignore this message.</p>
      `,
    });

    res.status(201).json({
      message: "Signup successful. Check your email to verify your account.",
    });
  } catch (err) {
    console.error("Signup error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/test-email", async (req, res) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: "lilkingzy007@gmail.com",
      subject: "Test Email",
      text: "If you receive this, email sending works!",
    });

    res.send("Email sent successfully");
  } catch (err) {
    res.status(500).send("Email failed: " + err.message);
  }
});

// EMAIL VERIFICATION route
router.get("/verify-email", async (req, res) => {
  const { token, email } = req.query;

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND verification_token = $2",
      [email, token]
    );

    if (result.rows.length === 0) {
      return res
        .status(400)
        .json({ message: "Invalid or expired verification link." });
    }

    // mark verified
    await pool.query(
      `
      UPDATE users
      SET is_verified = true, verification_token = null
      WHERE email = $1
    `,
      [email]
    );

    const user = result.rows[0];

    // issue JWT + cookie
    const jwtToken = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.cookie("token", jwtToken, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.json({ message: "Email verified and logged in successfully!" });
  } catch (err) {
    console.error("Verification error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    if (!user.is_verified) {
      return res
        .status(403)
        .json({ message: "Please verify your email before logging in." });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.json({ user: { id: user.id, name: user.name, role: user.role } });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Logout
router.post("/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
  });
  res.json({ message: "Logged out successfully" });
});

// GET CURRENT USER
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email, role FROM users WHERE id = $1",
      [req.user.id]
    );

    const user = result.rows[0];
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({ user });
  } catch (err) {
    console.error("Get user error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
