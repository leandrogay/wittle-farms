// forgotPasswordTest.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import User from "./models/User.js";  // must include .js for ESM

dotenv.config({ path: "./config/secrets.env" });

const TEST_EMAIL = process.env.FORGOTPW_TEST_EMAIL;
const TEST_PASSWORD = process.env.FORGOTPW_TEST_PASSWORD;

async function resetTestUser() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("Connected to MongoDB");

    const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);

    await User.findOneAndUpdate(
      { email: TEST_EMAIL },
      {
        email: TEST_EMAIL,
        password: hashedPassword,
        // resetToken: null,
        // resetTokenExpires: null,
      },
      { upsert: true, new: true }
    );

    console.log(
      `Test user ready: ${TEST_EMAIL} with password "${TEST_PASSWORD}"`
    );
  } catch (err) {
    console.error("Error resetting test user:", err);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
}

resetTestUser();

