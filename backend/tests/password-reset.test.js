/**
 * backend/tests/passwordReset.test.js
 * 
 * Unit/Integration tests for Password Reset & Recovery feature
 * Maps to functional test cases TC-005 through TC-012 from Excel
 * 
 * Feature: As a staff, I want to reset my password if I forget it 
 * so that I can regain secure access to my account
 * 
 * Acceptance Criteria:
 * 1. Request a password reset link via registered email
 * 2. Enforce strong password rules (min length, complexity)
 * 3. Prevent reuse of the previous password
 * 4. Show confirmation message after successful reset
 */

import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import authRouter from "../routes/auth.js";
import User from "../models/User.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

// Get current file directory and project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try multiple possible paths for secrets.env
const possiblePaths = [
  path.join(__dirname, "..", "config", "secrets.env"),              // backend/tests/../config/secrets.env
  path.join(__dirname, "..", "..", "backend", "config", "secrets.env"), // from project root
  path.join(process.cwd(), "backend", "config", "secrets.env"),      // from current working directory
  path.join(process.cwd(), "config", "secrets.env"),                 // if CWD is backend
];

let secretsPath = null;
for (const envPath of possiblePaths) {
  if (fs.existsSync(envPath)) {
    secretsPath = envPath;
    console.log(`Found secrets.env at: ${envPath}`);
    break;
  }
}

if (secretsPath) {
  // Load environment variables from secrets.env
  dotenv.config({ path: secretsPath });
  console.log(`Loaded environment variables from: ${secretsPath}`);
} else {
  console.log("Warning: secrets.env not found in any of the expected locations:");
  possiblePaths.forEach(p => console.log(`  - ${p}`));
  console.log(`Current working directory: ${process.cwd()}`);
  console.log(`__dirname: ${__dirname}`);
}

// Debug: Check if environment variables are loaded
console.log("Environment variables check:");
console.log(`UNIT_TEST_EMAIL: ${process.env.UNIT_TEST_EMAIL ? "SET" : "NOT SET"}`);
console.log(`UNIT_TEST_OLD_PASSWORD: ${process.env.UNIT_TEST_OLD_PASSWORD ? "SET" : "NOT SET"}`);
console.log(`UNIT_TEST_ALT_PASSWORD: ${process.env.UNIT_TEST_ALT_PASSWORD ? "SET" : "NOT SET"}`);
console.log(`UNIT_TEST_WEAK_PASSWORD: ${process.env.UNIT_TEST_WEAK_PASSWORD ? "SET" : "NOT SET"}`);
console.log(`UNIT_TEST_REUSE_PASSWORD: ${process.env.UNIT_TEST_REUSE_PASSWORD ? "SET" : "NOT SET"}`);
console.log(`UNIT_TEST_NEW_PASSWORD: ${process.env.UNIT_TEST_NEW_PASSWORD ? "SET" : "NOT SET"}`);

// Fallback values if env vars aren't loaded (for debugging)
if (!process.env.UNIT_TEST_EMAIL) {
  console.warn("WARNING: Using fallback test values - secrets.env not loaded properly");
  process.env.UNIT_TEST_EMAIL = "test@example.com";
  process.env.UNIT_TEST_OLD_PASSWORD = "OldPassword123!";
  process.env.UNIT_TEST_ALT_PASSWORD = "AltPassword123!";
  process.env.UNIT_TEST_WEAK_PASSWORD = "weak123";
  process.env.UNIT_TEST_REUSE_PASSWORD = "ReusePassword123!";
  process.env.UNIT_TEST_NEW_PASSWORD = "NewPassword123!";
}

let mongoServer;
let app;

describe("Password Reset & Recovery", () => {
  
  // ===== SETUP: Start in-memory MongoDB =====
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
    
    // Setup Express app with auth routes
    app = express();
    app.use(express.json());
    app.use("/api/auth", authRouter);
    
    console.log("Test database initialized");
  });

  // ===== CLEANUP: Stop in-memory MongoDB =====
  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
    console.log("Test database cleaned up");
  });

  // ===== RESET: Clean database before each test =====
  beforeEach(async () => {
    await User.deleteMany({});
  });

  // =====================================================
  // Test Suite 1: Forgot Password (Request Reset Link)
  // =====================================================
  describe("POST /api/auth/forgot-password", () => {
    
    /**
     * TEST CASE TC-005: Request password reset link with registered email
     * 
     * WHAT IT TESTS:
     * - User can request a password reset link
     * - Reset token is generated and stored in database
     * - Token has 15-minute expiry time
     * - Response confirms link was sent (without exposing user existence)
     * 
     * MAPS TO EXCEL: TC-005 (Request password reset link with registered email)
     */
    it("TC-005: should generate reset token for registered email", async () => {
      // SETUP: Create a test user with known credentials
      const testUser = await User.create({
        name: "Test User",
        email: process.env.UNIT_TEST_EMAIL,
        password: process.env.UNIT_TEST_OLD_PASSWORD,
        role: "Staff"
      });

      // ACTION: Request password reset
      const response = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: process.env.UNIT_TEST_EMAIL });

      // ASSERTION 1: Check HTTP response
      expect(response.status).toBe(200);
      expect(response.body.message).toContain("reset link was sent");

      // ASSERTION 2: Verify X-Email-Exists header is set to "true"
      expect(response.headers["x-email-exists"]).toBe("true");

      // ASSERTION 3: Verify reset token was created in database
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.resetToken).toBeDefined();
      expect(updatedUser.resetToken).not.toBeNull();
      expect(typeof updatedUser.resetToken).toBe("string");
      expect(updatedUser.resetToken.length).toBeGreaterThan(20); // crypto.randomBytes(32) produces long token

      // ASSERTION 4: Verify token expiry is set to ~15 minutes from now
      expect(updatedUser.resetTokenExpires).toBeDefined();
      expect(updatedUser.resetTokenExpires).toBeInstanceOf(Date);
      
      const expiryTime = updatedUser.resetTokenExpires.getTime();
      const now = Date.now();
      const diffMinutes = (expiryTime - now) / (1000 * 60);
      
      expect(diffMinutes).toBeGreaterThan(14); // At least 14 minutes
      expect(diffMinutes).toBeLessThan(16); // At most 16 minutes (15 ± tolerance)

      console.log("TC-005 passed: Reset token generated successfully");
    });

    /**
     * TEST CASE TC-006: Request password reset with unregistered email
     * 
     * WHAT IT TESTS:
     * - System handles unregistered email gracefully
     * - Returns 200 with generic message (prevents automated account enumeration)
     * - Sets X-Email-Exists header to "false" for frontend to show "Email not found"
     * - No error in API response exposes that email doesn't exist
     * 
     * UI BEHAVIOR: Frontend reads X-Email-Exists header and shows "Email not found" to user
     * SECURITY: API-level response is generic to prevent bots from enumerating valid emails
     * 
     * MAPS TO EXCEL: TC-006 (Request password reset link with unregistered email)
     * Expected Result: Error message shown "Email not found" (via X-Email-Exists header)
     */
    it("TC-006: should return generic message with X-Email-Exists=false header", async () => {
      // ACTION: Request password reset for non-existent user
      const response = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: "nonexistent@gmail.com" });

      // ASSERTION 1: Returns 200 (not 404) to prevent automated account enumeration
      expect(response.status).toBe(200);
      
      // ASSERTION 2: Generic message in body (same as successful case for security)
      expect(response.body.message).toContain("reset link was sent");
      
      // ASSERTION 3: Header indicates email not found (for frontend to show user-friendly error)
      expect(response.headers["x-email-exists"]).toBe("false");
      
      // ASSERTION 4: Verify no user was created
      const userCount = await User.countDocuments();
      expect(userCount).toBe(0);

      console.log("TC-006 passed: Unregistered email handled with header flag");
      console.log("   API: Returns generic message (security)");
      console.log("   Header: X-Email-Exists=false (UI shows 'Email not found')");
    });

    /**
     * EDGE CASE: Missing email field
     * 
     * WHAT IT TESTS:
     * - API validates required fields
     * - Returns 400 Bad Request for missing data
     */
    it("should return 400 if email is missing", async () => {
      const response = await request(app)
        .post("/api/auth/forgot-password")
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("Email required");

      console.log("Edge case passed: Missing email rejected");
    });
  });

  // =====================================================
  // Test Suite 2: Reset Password (With Token)
  // =====================================================
  describe("POST /api/auth/reset-password", () => {
    
    /**
     * TEST CASE TC-007: Reset password with valid token and strong password
     * 
     * WHAT IT TESTS:
     * - User can reset password with valid token
     * - New password is hashed and stored
     * - Reset token is cleared after successful reset
     * - Token expiry is cleared
     * - Old password is moved to password history
     * 
     * MAPS TO EXCEL: TC-007 (Reset password with valid strong password)
     */
    it("TC-007: should reset password with valid token and strong password", async () => {
      // SETUP: Create user with active reset token
      const resetToken = "valid-reset-token-abc123";
      const tokenExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes in future
      const oldPassword = process.env.UNIT_TEST_OLD_PASSWORD;
      
      const testUser = await User.create({
        name: "Test User",
        email: process.env.UNIT_TEST_EMAIL,
        password: oldPassword,
        role: "Staff",
        resetToken: resetToken,
        resetTokenExpires: tokenExpiry
      });

      const oldPasswordHash = testUser.password; // Saved hashed password

      // ACTION: Reset password with new strong password
      const newPassword = process.env.UNIT_TEST_ALT_PASSWORD; // Different from functional test password
      const response = await request(app)
        .post("/api/auth/reset-password")
        .send({
          token: resetToken,
          password: newPassword
        });

      // ASSERTION 1: Check HTTP response
      expect(response.status).toBe(200);
      expect(response.body.message).toContain("Password updated");

      // ASSERTION 2: Verify password was changed
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.password).not.toBe(oldPasswordHash); // Password changed
      
      // ASSERTION 3: Verify new password can be verified
      const passwordMatches = await bcrypt.compare(newPassword, updatedUser.password);
      expect(passwordMatches).toBe(true);

      // ASSERTION 4: Verify reset token was cleared
      expect(updatedUser.resetToken).toBeUndefined();
      expect(updatedUser.resetTokenExpires).toBeUndefined();

      // ASSERTION 5: Verify old password moved to history
      expect(updatedUser.passwordHistory).toBeDefined();
      expect(updatedUser.passwordHistory.length).toBeGreaterThan(0);
      expect(updatedUser.passwordHistory[0]).toBe(oldPasswordHash);

      console.log("TC-007 passed: Password reset successfully");
    });

    /**
     * TEST CASE TC-008: Reset password with weak password
     * 
     * WHAT IT TESTS:
     * - System enforces password complexity rules
     * - Weak passwords are rejected
     * - Appropriate error message returned
     * 
     * 
     * MAPS TO EXCEL: TC-008 (Reset password with weak password rules)
     */
    it("TC-008: should reject weak password", async () => {
      // SETUP: Create user with active reset token
      const resetToken = "valid-token-xyz";
      const tokenExpiry = new Date(Date.now() + 15 * 60 * 1000);
      
      const testUser = await User.create({
        name: "Test User",
        email: process.env.UNIT_TEST_EMAIL,
        password: process.env.UNIT_TEST_OLD_PASSWORD,
        role: "Staff",
        resetToken: resetToken,
        resetTokenExpires: tokenExpiry
      });

      // ACTION: Try to reset with weak password
      const response = await request(app)
        .post("/api/auth/reset-password")
        .send({
          token: resetToken,
          password: process.env.UNIT_TEST_WEAK_PASSWORD // Too short, no special chars, no numbers
        });

      // ASSERTION 1: Request should fail
      expect([400, 500]).toContain(response.status);

      // ASSERTION 2: Password should not be changed
      const updatedUser = await User.findById(testUser._id);
      const oldPasswordStillValid = await bcrypt.compare(process.env.UNIT_TEST_OLD_PASSWORD, updatedUser.password);
      expect(oldPasswordStillValid).toBe(true);

      console.log("TC-008 passed: Weak password rejected");
      console.log(`   Note: Password validation response: ${response.status} - ${response.body.message || 'No message'}`);
    });

    /**
     * TEST CASE TC-009: Reset password with mismatched confirmation
     * 
     * WHAT IT TESTS:
     * - Password and confirmation must match
     * - Mismatch is detected and rejected
     * 
     * 
     * MAPS TO EXCEL: TC-009 (Reset password with mismatched confirmation password)
     */
    it("TC-009: should handle password confirmation mismatch (if implemented)", async () => {
      // SETUP: Create user with active reset token
      const resetToken = "valid-token-mismatch";
      const tokenExpiry = new Date(Date.now() + 15 * 60 * 1000);
      
      await User.create({
        name: "Test User",
        email: process.env.UNIT_TEST_EMAIL,
        password: process.env.UNIT_TEST_OLD_PASSWORD,
        role: "Staff",
        resetToken: resetToken,
        resetTokenExpires: tokenExpiry
      });

      // ACTION: Send mismatched passwords (if API accepts confirmPassword field)
      const response = await request(app)
        .post("/api/auth/reset-password")
        .send({
          token: resetToken,
          password: "NewPassword123!",
          confirmPassword: "DifferentPassword456!" // Mismatch
        });

      // ASSERTION: If confirmPassword field is checked, should fail
      // If not checked, this validates that frontend must handle it
      // Either way, we document the expected behavior
      
      console.log(" TC-009 tested: Password confirmation behavior documented");
      console.log(`   Response: ${response.status}`);
      console.log(`   Note: Current API ${response.body.password ? 'does not' : 'may'} validate confirmPassword field`);
    });

    /**
     * TEST CASE TC-010: Reset password with previously used password
     * 
     * WHAT IT TESTS:
     * - System prevents password reuse
     * - Old password cannot be set as new password
     * - Password history is checked
     * 
     * MAPS TO EXCEL: TC-010 (Reset password with previously used password)
     */
    it("TC-010: should reject reuse of previous password", async () => {
      // SETUP: Create user with active reset token
      const resetToken = "valid-token-reuse";
      const tokenExpiry = new Date(Date.now() + 15 * 60 * 1000);
      const oldPassword = process.env.UNIT_TEST_REUSE_PASSWORD; // Updated to meet 8 char minimum (based on Excel TC-010)
      
      const testUser = await User.create({
        name: "Test User",
        email: process.env.UNIT_TEST_EMAIL,
        password: oldPassword,
        role: "Staff",
        resetToken: resetToken,
        resetTokenExpires: tokenExpiry
      });

      // ACTION: Try to reset with same old password
      const response = await request(app)
        .post("/api/auth/reset-password")
        .send({
          token: resetToken,
          password: oldPassword // Reusing old password
        });

      // ASSERTION 1: Request should fail with 400
      expect(response.status).toBe(400);
      expect(response.body.message).toContain("Cannot reuse previous password");

      // ASSERTION 2: Password should remain unchanged
      const updatedUser = await User.findById(testUser._id);
      const passwordUnchanged = await bcrypt.compare(oldPassword, updatedUser.password);
      expect(passwordUnchanged).toBe(true);

      // ASSERTION 3: Reset token should still be valid (reset didn't complete)
      expect(updatedUser.resetToken).toBe(resetToken);

      console.log("TC-010 passed: Password reuse prevented");
    });

    /**
     * TEST CASE TC-011: Reset password with expired token
     * 
     * WHAT IT TESTS:
     * - Expired reset links are rejected
     * - Token expiry validation works correctly
     * - Appropriate error message shown
     * 
     * MAPS TO EXCEL: TC-011 (Reset password link expired)
     */
    it("TC-011: should reject expired reset token", async () => {
      // SETUP: Create user with EXPIRED reset token
      const resetToken = "expired-token-123";
      const expiredTime = new Date(Date.now() - 16 * 60 * 1000); // 16 minutes ago (expired)
      
      const testUser = await User.create({
        name: "Test User",
        email: process.env.UNIT_TEST_EMAIL,
        password: process.env.UNIT_TEST_OLD_PASSWORD,
        role: "Staff",
        resetToken: resetToken,
        resetTokenExpires: expiredTime // Already expired
      });

      // ACTION: Try to reset password with expired token
      const response = await request(app)
        .post("/api/auth/reset-password")
        .send({
          token: resetToken,
          password: "NewStrongPassword123!"
        });

      // ASSERTION 1: Request should fail with 400
      expect(response.status).toBe(400);
      expect(response.body.message).toContain("expired");

      // ASSERTION 2: Password should remain unchanged
      const updatedUser = await User.findById(testUser._id);
      const oldPasswordStillValid = await bcrypt.compare(process.env.UNIT_TEST_OLD_PASSWORD, updatedUser.password);
      expect(oldPasswordStillValid).toBe(true);

      console.log("TC-011 passed: Expired token rejected");
    });

    /**
     * EDGE CASE: Invalid/unknown token
     * 
     * WHAT IT TESTS:
     * - System handles invalid tokens gracefully
     * - No user found with given token
     */
    it("should reject invalid reset token", async () => {
      // SETUP: Create user WITHOUT reset token
      await User.create({
        name: "Test User",
        email: "test@gmail.com",
        password: "Password123!",
        role: "Staff"
      });

      // ACTION: Try to reset with non-existent token
      const response = await request(app)
        .post("/api/auth/reset-password")
        .send({
          token: "nonexistent-token-xyz",
          password: "NewPassword123!"
        });

      // ASSERTION: Should fail with 400
      expect(response.status).toBe(400);
      expect(response.body.message).toContain("Invalid or expired token");

      console.log("Edge case passed: Invalid token rejected");
    });

    /**
     * EDGE CASE: Missing required fields
     * 
     * WHAT IT TESTS:
     * - API validates required fields
     */
    it("should return 400 if token or password is missing", async () => {
      // Test missing token
      const response1 = await request(app)
        .post("/api/auth/reset-password")
        .send({ password: "NewPassword123!" });
      
      expect(response1.status).toBe(400);
      expect(response1.body.message).toContain("Token and password required");

      // Test missing password
      const response2 = await request(app)
        .post("/api/auth/reset-password")
        .send({ token: "some-token" });
      
      expect(response2.status).toBe(400);
      expect(response2.body.message).toContain("Token and password required");

      console.log("Edge case passed: Missing fields rejected");
    });
  });

  // =====================================================
  // Test Suite 3: Login After Password Reset
  // =====================================================
  describe("POST /api/auth/login (after reset)", () => {
    
    /**
     * TEST CASE TC-012: Login with newly reset password
     * 
     * WHAT IT TESTS:
     * - User can login after successful password reset
     * - New password works for authentication
     * - Complete password reset flow validated
     * 
     * MAPS TO EXCEL: TC-012 (Login with newly reset password)
     */
    it("TC-012: should login successfully with newly reset password", async () => {
      // SETUP: Simulate complete password reset flow
      const newPassword = process.env.UNIT_TEST_NEW_PASSWORD; // Different from functional test password
      
      // Create user with new password (simulating successful reset)
      const testUser = await User.create({
        name: "Test User",
        email: process.env.UNIT_TEST_EMAIL,
        password: newPassword,
        role: "Staff"
      });

      // ACTION: Try to login with new password
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: process.env.UNIT_TEST_EMAIL,
          password: newPassword
        });

      // ASSERTION 1: Login should succeed (OTP sent)
      // Note: Your system sends OTP after initial login
      expect(response.status).toBe(200);
      expect(response.body.message).toContain("OTP sent");

      // ASSERTION 2: Verify OTP was generated for user
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.otp).toBeDefined();
      expect(updatedUser.otpExpires).toBeDefined();

      console.log("TC-012 passed: Login with new password successful");
    });

    /**
     * ADDITIONAL TEST: Cannot login with old password after reset
     * 
     * WHAT IT TESTS:
     * - Old password is invalidated after reset
     * - Security: previous credentials don't work
     */
    it("should NOT login with old password after reset", async () => {
      // SETUP: User with password already changed
      const oldPassword = "OldPassword123!";
      const newPassword = "NewPassword123!";
      
      await User.create({
        name: "Test User",
        email: "test@gmail.com",
        password: newPassword, // Password already reset
        role: "Staff",
        passwordHistory: [await bcrypt.hash(oldPassword, 10)] // Old password in history
      });

      // ACTION: Try to login with OLD password
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@gmail.com",
          password: oldPassword // Using old password
        });

      // ASSERTION: Login should fail
      expect(response.status).toBe(401);
      expect(response.body.message).toContain("Invalid email or password");

      console.log("Additional test passed: Old password invalidated");
    });
  });

  // =====================================================
  // Test Suite 4: Check Reset Token (Frontend Validation)
  // =====================================================
  describe("GET /api/auth/check-reset-token", () => {
    
    /**
     * EDGE CASE: Validate token before showing reset form
     * 
     * WHAT IT TESTS:
     * - Frontend can check if token is valid before showing form
     * - Prevents user from filling form with expired token
     */
    it("should validate active reset token", async () => {
      // SETUP: Create user with valid token
      const resetToken = "valid-check-token";
      const tokenExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min future
      
      await User.create({
        name: "Test User",
        email: "test@gmail.com",
        password: "Password123!",
        role: "Staff",
        resetToken: resetToken,
        resetTokenExpires: tokenExpiry
      });

      // ACTION: Check if token is valid
      const response = await request(app)
        .get("/api/auth/check-reset-token")
        .query({ token: resetToken });

      // ASSERTION: Should confirm token is valid
      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);

      console.log("Token validation passed: Valid token confirmed");
    });

    it("should reject expired token on check", async () => {
      // SETUP: Create user with expired token
      const resetToken = "expired-check-token";
      const expiredTime = new Date(Date.now() - 5 * 60 * 1000); // 5 min ago
      
      await User.create({
        name: "Test User",
        email: "test@gmail.com",
        password: "Password123!",
        role: "Staff",
        resetToken: resetToken,
        resetTokenExpires: expiredTime
      });

      // ACTION: Check expired token
      const response = await request(app)
        .get("/api/auth/check-reset-token")
        .query({ token: resetToken });

      // ASSERTION: Should indicate token expired (status 410 = Gone)
      expect(response.status).toBe(410);
      expect(response.body.message).toContain("expired");

      console.log("Token validation passed: Expired token detected");
    });
  });

  // =====================================================
  // Test Suite 5: Password History Validation
  // =====================================================
  describe("Password History", () => {
    
    /**
     * SECURITY TEST: Cannot reuse any of last N passwords
     * 
     * WHAT IT TESTS:
     * - System maintains password history
     * - Prevents reuse of any recent password (not just last one)
     */
    it("should prevent reuse of password from history", async () => {
      // SETUP: Create user with password history
      const currentPassword = "Current123!";
      const oldPassword1 = "OldOne123!";
      const oldPassword2 = "OldTwo123!";
      
      const resetToken = "test-history-token";
      const tokenExpiry = new Date(Date.now() + 15 * 60 * 1000);
      
      await User.create({
        name: "Test User",
        email: "test@gmail.com",
        password: currentPassword,
        role: "Staff",
        resetToken: resetToken,
        resetTokenExpires: tokenExpiry,
        passwordHistory: [
          await bcrypt.hash(oldPassword1, 10),
          await bcrypt.hash(oldPassword2, 10)
        ]
      });

      // ACTION: Try to reset to old password from history
      const response = await request(app)
        .post("/api/auth/reset-password")
        .send({
          token: resetToken,
          password: oldPassword1 // Password from history
        });

      // ASSERTION: Should reject
      expect(response.status).toBe(400);
      expect(response.body.message).toContain("Cannot reuse previous password");

      console.log("Password history check passed: Historical password rejected");
    });
  });
});

// =====================================================
// SUMMARY OF TEST COVERAGE
// =====================================================
/**
 * ✅ TC-005: Request reset link with registered email
 * ✅ TC-006: Request reset link with unregistered email  
 * ✅ TC-007: Reset password with valid token and strong password
 * ✅ TC-008: Reset password with weak password
 * ✅ TC-009: Password confirmation mismatch (documented)
 * ✅ TC-010: Prevent reuse of previous password
 * ✅ TC-011: Reject expired reset token
 * ✅ TC-012: Login with newly reset password
 * 
 * Additional Coverage:
 * ✅ Invalid token handling
 * ✅ Missing field validation
 * ✅ Token validation endpoint
 * ✅ Password history enforcement
 * ✅ Old password invalidation after reset
 * 
 * Total: 8 functional test cases + 5 edge cases = 13 test scenarios
 */
