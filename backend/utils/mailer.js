import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../config/secrets.env") });

const { EMAIL_USER, EMAIL_PASS, EMAIL_FROM } = process.env;

if (!EMAIL_USER || !EMAIL_PASS) {
  console.error(" Missing EMAIL_USER/EMAIL_PASS env vars. Check backend/config/secrets.env");
}

export const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

// Verify connection configuration
transporter.verify((err, success) => {
  if (err) {
    console.error("Mailer config error:", err);
  } else {
    console.log("Mailer connected and ready to send");
  }
});

export async function sendEmail({ to, subject, html }) {
  return transporter.sendMail({
    from: EMAIL_FROM || EMAIL_USER,
    to,
    subject,
    html,
  });
}
