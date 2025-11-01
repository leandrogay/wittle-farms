import { vi, it, expect } from "vitest";

// Set Gmail env so getTransporter() chooses Gmail branch
process.env.NODE_ENV = "test";
process.env.EMAIL_USER = "test@gmail.com";
process.env.EMAIL_PASS = "pass";

// Mock nodemailer so verify REJECTS -> covers the error side of transporter.verify().then(...)
vi.mock("nodemailer", () => {
  const transporter = {
    verify: vi.fn(() => Promise.reject(new Error("smtp verify failed"))),
    sendMail: vi.fn(() => Promise.resolve({ messageId: "ok" })),
  };
  const createTransport = vi.fn(() => transporter);
  return { default: { createTransport }, createTransport, __mocks: { transporter } };
});

// Import the module; it should NOT throw even if verify rejects (it just logs)
it("module import succeeds even if transporter.verify rejects (covers error branch)", async () => {
  const mod = await import("../routes/auth.js");
  expect(mod).toHaveProperty("default");
});
