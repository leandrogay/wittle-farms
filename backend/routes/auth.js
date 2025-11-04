import dotenv from "dotenv";
import { Router } from 'express';
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import User from "../models/User.js";
import crypto from "crypto";
import bcrypt from "bcryptjs"; 
import cookieParser from "cookie-parser";

dotenv.config({ path: "./config/secrets.env" });

const router = Router();
router.use(cookieParser());
const JWT_SECRET = process.env.JWT_SECRET ?? "dev_secret_change_me";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? "dev_refresh_secret_change_me";
const JWT_EXPIRES_IN = "30m"; // access token 
const JWT_REFRESH_EXPIRES_IN = "7d"; // refresh token 
const DEV_OTP_CODE = process.env.DEV_OTP_CODE || null;
const ALLOW_DEV_OTP_IN_PROD = String(process.env.ALLOW_DEV_OTP_IN_PROD).toLowerCase() === "true";


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

const signAccessToken = (user) => 
  jwt.sign({ sub: user._id, role: user.role}, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

const signRefreshToken = (user) => 
  jwt.sign({ sub: user._id }, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });

const sendRefreshToken = (res, token) => {
  res.cookie('refreshToken', token, {
    httpOnly: true, 
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

const handleSucessfulAuth = async (res, user) => {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  
  user.refreshToken = refreshToken; // store refresh token in db
  await user.save({ validateBeforeSave: false});

  sendRefreshToken(res, refreshToken);

  return res.json({
    accessToken,
    user: { id: user._id, name: user.name, email: user.email, role: user.role }
  });
};

/**
 * @openapi
 * tags:
 *   - name: Auth
 *     description: Authentication & session flows (email/password, OTP, refresh tokens)
 */

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AuthRegisterRequest'
 *           examples:
 *             default:
 *               value:
 *                 name: Jane Doe
 *                 email: jane@example.com
 *                 password: S3cureP@ssw0rd
 *                 role: user
 *     responses:
 *       200:
 *         description: Registration successful; returns an access token and sets refresh token cookie
 *         headers:
 *           Set-Cookie:
 *             description: HttpOnly refreshToken cookie
 *             schema: { type: string }
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthSuccessResponse'
 *       400:
 *         description: Missing or invalid fields
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       409:
 *         description: Email already in use
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "name, email, and password are required" });
    }
    const user = new User({ name, email, password, role });
    await user.save();
    return await handleSucessfulAuth(res, user);
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

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Start login (email + password), sends OTP by email if password is valid
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/AuthLoginRequest' }
 *     responses:
 *       200:
 *         description: OTP has been sent to the user's email
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Message' }
 *       401:
 *         description: Invalid email or password
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: Account locked (too many attempts)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AuthLockedResponse' }
 *       400:
 *         description: Missing fields
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       502:
 *         description: Failed to send OTP email
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
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

/**
 * @openapi
 * /api/auth/verify-otp:
 *   post:
 *     summary: Verify OTP and complete login
 *     description: Accepts a one-time password sent via email. In development, a DEV_OTP_CODE bypass is supported (configurable).
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/VerifyOtpRequest' }
 *     responses:
 *       200:
 *         description: Successful auth; returns an access token and sets refresh token cookie
 *         headers:
 *           Set-Cookie:
 *             description: HttpOnly refreshToken cookie
 *             schema: { type: string }
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AuthSuccessResponse' }
 *       400:
 *         description: Invalid or expired OTP / no active OTP session
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ message: "email and otp required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });

    // ----- DEV-ONLY OTP BYPASS -----
    const envIsProd = process.env.NODE_ENV === "production";
    const devBypassAllowed =
      DEV_OTP_CODE &&
      otp === DEV_OTP_CODE &&
      (!envIsProd || ALLOW_DEV_OTP_IN_PROD);

    if (devBypassAllowed) {
      if (!user.otpExpires || user.otpExpires < new Date()) {
        return res.status(400).json({ message: "No active login session to bypass OTP" });
      }
      console.warn(`[DEV OTP BYPASS] ${email} authenticated via DEV_OTP_CODE`);
      user.otp = undefined;
      user.otpExpires = undefined;
      return await handleSucessfulAuth(res, user);
    }

    if (!user.otp || !user.otpExpires || user.otp !== otp || user.otpExpires < new Date()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    user.otp = undefined;
    user.otpExpires = undefined;

    return await handleSucessfulAuth(res, user);
  } catch (err) {
    console.error("VERIFY OTP error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * @openapi
 * /api/auth/refresh:
 *   post:
 *     summary: Rotate and return a new access token (uses HttpOnly refreshToken cookie)
 *     tags: [Auth]
 *     security:
 *       - cookieAuth: []   # describes the refreshToken cookie
 *     responses:
 *       200:
 *         description: Returns a new access token and rotates the refresh cookie
 *         headers:
 *           Set-Cookie:
 *             description: New HttpOnly refreshToken cookie
 *             schema: { type: string }
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/RefreshResponse' }
 *       401:
 *         description: No refresh token provided
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: Invalid or expired refresh token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post("/refresh", async(req, res) => {
  const token = req.cookies.refreshToken;
  if(!token) return res.status(401).json({ message: "No refresh token provided" });

  try {
    const payload = jwt.verify(token, JWT_REFRESH_SECRET);
    const user = await User.findById(payload.sub);

    if (!user || user.refreshToken !== token){
      return res.status(403).json({ message: "Invalid refresh token" });
    }

    const newAccessToken = signAccessToken(user);
    const newRefreshToken = signRefreshToken(user);

    user.refreshToken = newRefreshToken;
    await user.save({ validateBeforeSave: false });

    sendRefreshToken(res, newRefreshToken);

    return res.json({ accessToken: newAccessToken });

  } catch (err) {
    return res.status(403).json({ message: "Invalid or expired refresh token" });
  }
});

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     summary: Logout and clear refresh token
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Logged out successfully; refresh cookie cleared
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Message' }
 */
router.post("/logout", async (req, res) => {
  const token = req.cookies.refreshToken;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_REFRESH_SECRET);
      const user = await User.findById(payload.sub);
      if (user) {
        user.refreshToken = undefined;
        await user.save({ validateBeforeSave: false });
      }
    } catch (err) {
      // ignore errors 
    }
  }
  res.clearCookie('refreshToken');
  res.json({ message: "Logged out successfully"})
});

// =====================
// Forgot / Reset Password
// =====================

/**
 * @openapi
 * /api/auth/forgot-password:
 *   post:
 *     summary: Send a password reset link to email
 *     description: Always returns 200 to avoid account enumeration. Check `X-Email-Exists` response header for internal UI hints.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ForgotPasswordRequest' }
 *     responses:
 *       200:
 *         description: If the email is registered, a reset link was sent.
 *         headers:
 *           X-Email-Exists:
 *             description: Internal hint whether the email exists ("true"/"false")
 *             schema: { type: string, enum: ["true","false"] }
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Message' }
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ message: "Email required" });

    const user = await User.findOne({ email });
    const exposeHeader = () => {
      res.setHeader("Access-Control-Expose-Headers","X-Email-Exists");
    };
    if (!user) {
      exposeHeader();
      res.setHeader("X-Email-Exists", "false");
      return res.json({ message: "If this email is registered, a reset link was sent." });
    };

    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    user.resetToken = token;
    user.resetTokenExpires = expires;
    await user.save({ validateBeforeSave: false });

    const frontend = process.env.FRONTEND_URL || "http://localhost:5173";
    const link = `${frontend}/reset-password?token=${token}`;

    try {
      await transporter.sendMail({
        from: { name: "Little Farms", address: process.env.EMAIL_USER },
        to: user.email,
        subject: "Reset your password",
        html: `<p>Click to reset your password:</p>
              <p><a href="${link}">${link}</a></p>
              <p>This link expires in 15 minutes.</p>`,
        replyTo: "no-reply@wittlefarms.com",
      });
      console.log("[ForgotPassword] Sent link:", link);
    } catch (mailErr) {
      console.error("EMAIL SEND ERROR:", mailErr);
    }

    exposeHeader();
    res.setHeader("X-Email-Exists", "true");
    return res.json({ message: "If this email is registered, a reset link was sent." });
  } catch (err) {
    console.error("FORGOT PASSWORD error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * @openapi
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset password using token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ResetPasswordRequest' }
 *     responses:
 *       200:
 *         description: Password updated
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Message' }
 *       400:
 *         description: Invalid/expired token or password reuse detected
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) {
      return res.status(400).json({ message: "Token and password required" });
    }

    const user = await User.findOne({ resetToken: token });
    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }
    if (!user.resetTokenExpires || user.resetTokenExpires < new Date()) {
      return res.status(400).json({ message: "Reset link expired, please request again" });
    }

    if (await bcrypt.compare(password, user.password || "")) {
      return res.status(400).json({ message: "Cannot reuse previous password" });
    }

    const PASSWORD_HISTORY_LIMIT = 5;
    for (const oldHash of user.passwordHistory || []) {
      if (await bcrypt.compare(password, oldHash)) {
        return res.status(400).json({ message: "Cannot reuse previous password" });
      }
    }

    const oldHash = user.password;
    if (oldHash) {
      user.passwordHistory = [ oldHash, ...(user.passwordHistory || []) ].slice(0, PASSWORD_HISTORY_LIMIT);
    }

    user.password = password;
    user.resetToken = undefined;
    user.resetTokenExpires = undefined;
    await user.save();

    return res.json({ message: "Password updated" });
  } catch (err) {
    console.error("RESET PASSWORD error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * @openapi
 * /api/auth/check-reset-token:
 *   get:
 *     summary: Validate a reset-password token
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Token is valid
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CheckResetTokenResponse' }
 *       400:
 *         description: Invalid or expired token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       410:
 *         description: Token expired (gone)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get("/check-reset-token", async (req, res) => {
  try {
    const { token } = req.query || {};
    if (!token) {
      console.error("[check-reset-token] No token provided");
      return res.status(400).json({ message: "Token required" });
    }

    const user = await User.findOne({ resetToken: token });
    if (!user) {
      console.error(`[check-reset-token] No user found for token: ${token}`);
      return res.status(400).json({ message: "Invalid or expired token" });
    }
    if (!user.resetTokenExpires || user.resetTokenExpires < new Date()) {
      console.error(`[check-reset-token] Token expired for user: ${user.email}, expires: ${user.resetTokenExpires}`);
      return res.status(410).json({ message: "Reset link expired, please request again" });
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error("[check-reset-token] Internal error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * Middleware (not an endpoint).
 */
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

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user details
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/MeResponse' }
 *       401:
 *         description: Missing or invalid access token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get("/me", verifyAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select("-password -otp -otpExpires -failedLoginAttempts -lockUntil -refreshToken")
      .lean();

    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (err) {
    console.error("ME error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * @openapi
 * /api/auth/session:
 *   get:
 *     summary: Get session info (from access token)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Session information
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SessionResponse' }
 *       401:
 *         description: Missing or invalid access token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get("/session", verifyAuth, (req, res) => {
  return res.json({
    session: {
      userId: req.userId,
      role: req.userRole,
    },
  });
});

export default router;

/**
 * @openapi
 * components:
 *   schemas:
 *     Message:
 *       type: object
 *       properties:
 *         message: { type: string, example: "OK" }
 *
 *     Error:
 *       type: object
 *       properties:
 *         message: { type: string, example: "Invalid or expired token" }
 *         details:
 *           type: array
 *           items: { type: string }
 *
 *     UserPublic:
 *       type: object
 *       properties:
 *         id: { type: string, example: "665f7f8a5e1c9c0f1a2b3c4d" }
 *         name: { type: string, example: "Jane Doe" }
 *         email: { type: string, example: "jane@example.com" }
 *         role: { type: string, example: "user" }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *
 *     AuthRegisterRequest:
 *       type: object
 *       required: [name, email, password]
 *       properties:
 *         name: { type: string }
 *         email: { type: string, format: email }
 *         password: { type: string, format: password }
 *         role: { type: string, example: "user" }
 *
 *     AuthLoginRequest:
 *       type: object
 *       required: [email, password]
 *       properties:
 *         email: { type: string, format: email }
 *         password: { type: string, format: password }
 *
 *     VerifyOtpRequest:
 *       type: object
 *       required: [email, otp]
 *       properties:
 *         email: { type: string, format: email }
 *         otp:
 *           type: string
 *           description: 6-digit OTP sent to email
 *           example: "123456"
 *
 *     AuthSuccessResponse:
 *       type: object
 *       properties:
 *         accessToken: { type: string, description: "JWT access token (Bearer)" }
 *         user:
 *           $ref: '#/components/schemas/UserPublic'
 *
 *     RefreshResponse:
 *       type: object
 *       properties:
 *         accessToken: { type: string }
 *
 *     ForgotPasswordRequest:
 *       type: object
 *       required: [email]
 *       properties:
 *         email: { type: string, format: email }
 *
 *     ResetPasswordRequest:
 *       type: object
 *       required: [token, password]
 *       properties:
 *         token: { type: string }
 *         password: { type: string, format: password }
 *
 *     CheckResetTokenResponse:
 *       type: object
 *       properties:
 *         ok: { type: boolean, example: true }
 *
 *     AuthLockedResponse:
 *       type: object
 *       properties:
 *         message: { type: string, example: "Too many failed attempts. Account locked for 15 minutes." }
 *         unlockTime: { type: string, format: date-time }
 *
 *     MeResponse:
 *       type: object
 *       properties:
 *         user:
 *           $ref: '#/components/schemas/UserPublic'
 *
 *     SessionResponse:
 *       type: object
 *       properties:
 *         session:
 *           type: object
 *           properties:
 *             userId: { type: string }
 *             role: { type: string }
 *
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *     cookieAuth:
 *       type: apiKey
 *       in: cookie
 *       name: refreshToken
 */
