import dotenv from "dotenv";
dotenv.config({ path: "./config/secrets.env" });
import express from "express";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import User from "../models/User.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET ?? "dev_secret_change_me";
const JWT_EXPIRES_IN = "1h";

function getTransporter() {
  if (process.env.MAILTRAP_HOST) {
    return nodemailer.createTransport({
      host: process.env.MAILTRAP_HOST,
      port: Number(process.env.MAILTRAP_PORT ?? 2525),
      auth: { user: process.env.MAILTRAP_USER, pass: process.env.MAILTRAP_PASS },
    });
  }
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error("EMAIL_USER/EMAIL_PASS not set");
  }
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
}

const transporter = getTransporter();
const FROM = process.env.EMAIL_FROM || `Little Farms <${process.env.EMAIL_USER}>`;

transporter.verify().then(
  () => console.log("Email transporter ready"),
  (err) => console.error("Email transporter error:", err)
);

const signToken = (user) =>
  jwt.sign({ sub: user._id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "name, email, and password are required" });
    }
    const user = new User({ name, email, password, role });
    await user.save();
    const token = signToken(user);
    return res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error("REGISTER error:", err);
    if (err?.code === 11000) return res.status(409).json({ message: "Email already in use" });
    if (err?.name === "ValidationError") {
      const details = Object.values(err.errors || {}).map((e) => e.message);
      return res.status(400).json({ message: "Validation failed", details });
    }
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "email and password required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: "Invalid email or password" });

    if (user.isLocked && user.isLocked()) {
      return res.status(403).json({
        message: `Account locked.`,
        unlockTime: user.lockUntil,
      });
    }

    const ok = await user.matchPassword(password);
    if (!ok) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
        await user.save();
        return res.status(403).json({
          message: "Too many failed attempts. Account locked for 15 minutes.",
          unlockTime: user.lockUntil,
        });
      }
      await user.save();
      return res.status(401).json({
        message: `Invalid email or password. Attempts left: ${5 - user.failedLoginAttempts}`,
      });
    }

    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    user.otp = otp;
    user.otpExpires = new Date(Date.now() + 5 * 60 * 1000); // store as Date
    await user.save({ validateBeforeSave: false });

    try {
      await transporter.sendMail({
        from: { name: "Little Farms OTP", address: process.env.EMAIL_USER },
        to: user.email,
        subject: "Your Login OTP",
        text: `Your OTP is ${otp}. It expires in 5 minutes.`,
        html: `<p>Your OTP is <b>${otp}</b>. It expires in 5 minutes.</p>`,
      });
      return res.json({ message: "OTP sent to your email" });
    } catch (mailErr) {
      console.error("EMAIL SEND ERROR:", mailErr);
      return res.status(502).json({ message: "Failed to send OTP email. Please try again." });
    }
  } catch (err) {
    console.error("LOGIN error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ message: "email and otp required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });

    if (!user.otp || !user.otpExpires || user.otp !== otp || user.otpExpires < new Date()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save({ validateBeforeSave: false });

    const token = signToken(user);
    return res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error("VERIFY OTP error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

export function verifyAuth(req, res, next) {
  const h = req.header("Authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Missing token" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;
    req.userRole = payload.role;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

router.post("/logout", (req, res) => {
  res.json({ message: "Logged out successfully" });
});

export default router;
