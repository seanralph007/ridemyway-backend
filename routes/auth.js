const express = require("express");
const router = express.Router();
const pool = require("../db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const authMiddleware = require("../middleware/auth");
const Brevo = require("@getbrevo/brevo");

const brevoClient = new Brevo.TransactionalEmailsApi();
brevoClient.setApiKey(
  Brevo.TransactionalEmailsApiApiKeys.apiKey,
  process.env.BREVO_API_KEY
);

// const nodemailer = require("nodemailer");

// // Configure Brevo SMTP Transport
// const transporter = nodemailer.createTransport({
//   host: "smtp-relay.brevo.com",
//   port: 587,
//   auth: {
//     user: process.env.BREVO_SMTP_USER,
//     pass: process.env.BREVO_SMTP_PASS,
//   },
// });

// SIGNUP
router.post("/signup", async (req, res) => {
  const { name, email, password, role } = req.body;

  try {
    const existingUser = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString("hex");

    await pool.query(
      `INSERT INTO users (name, email, password, role, is_verified, verification_token)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [name, email, hashedPassword, role, false, verificationToken]
    );

    const link = `${
      process.env.CLIENT_URL
    }/verify-email?token=${verificationToken}&email=${encodeURIComponent(
      email
    )}`;

    await brevoClient.sendTransacEmail({
      sender: { name: "RideMyWay", email: process.env.EMAIL_FROM },
      to: [{ email }],
      subject: "Verify Your RideMyWay Account",
      htmlContent: `
        <h2>Hi ${name},</h2>
        <p>Welcome to <strong>RideMyWay</strong>!</p>
        <p>Please verify your email by clicking the button below:</p>
        <p><a href="${link}" style="padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">
        Verify Email</a></p>
        <p>If you didn’t create this account, you can safely ignore this message.</p>
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

// TEST EMAIL
router.get("/test-email", async (req, res) => {
  try {
    await brevoClient.sendTransacEmail({
      sender: { name: "RideMyWay", email: process.env.EMAIL_FROM },
      to: [{ email: "web3chuks007@gmail.com" }],
      subject: "Test Email from RideMyWay (Brevo API)",
      htmlContent: "<p>If you received this, the Brevo API is working </p>",
    });

    res.send("Brevo Test email sent successfully.");
  } catch (err) {
    res.status(500).send("Email failed: " + err.message);
  }
});

// EMAIL VERIFICATION
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

    await pool.query(
      "UPDATE users SET is_verified = true, verification_token = null WHERE email = $1",
      [email]
    );

    const user = result.rows[0];

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
      return res.status(403).json({
        message: "Please verify your email before logging in.",
      });
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

// LOGOUT
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

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error("Get user error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
