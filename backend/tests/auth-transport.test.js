// tests/auth.transport.test.js
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

/* Keep dotenv from loading files */
vi.mock("dotenv", () => {
  const config = vi.fn(() => ({ parsed: {} }));
  return { default: { config }, config };
});

/* Stub nodemailer */
vi.mock("nodemailer", () => {
  const transporter = {
    verify: vi.fn(() => Promise.resolve()),
    sendMail: vi.fn(() => Promise.resolve({ messageId: "ok" })),
  };
  const createTransport = vi.fn(() => transporter);
  return { default: { createTransport }, createTransport, __mocks: { transporter } };
});

/* --- Env helpers (only touch mail vars) --- */
const MAIL_KEYS = [
  "MAILTRAP_HOST","MAILTRAP_PORT","MAILTRAP_USER","MAILTRAP_PASS",
  "EMAIL_USER","EMAIL_PASS",
];
const snapshot = {};
function snapEnv() {
  for (const k of MAIL_KEYS) snapshot[k] = process.env[k];
}
function restoreEnv() {
  for (const k of MAIL_KEYS) {
    if (snapshot[k] === undefined) delete process.env[k];
    else process.env[k] = snapshot[k];
  }
}
function wipeMailEnv() {
  for (const k of MAIL_KEYS) delete process.env[k];
}

async function reload() {
  vi.resetModules();                // re-evaluate the module
  return import("../routes/auth.js"); // static path (no template string)
}

beforeAll(() => snapEnv());
afterAll(() => restoreEnv());

describe.sequential("auth transporter init branches", () => {
  it("MAILTRAP branch", async () => {
    wipeMailEnv();
    process.env.MAILTRAP_HOST = "smtp.mailtrap.io";
    process.env.MAILTRAP_PORT = "2525";
    process.env.MAILTRAP_USER = "u";
    process.env.MAILTRAP_PASS = "p";
    const mod = await reload();
    expect(typeof mod.default).toBe("function");
  });

  it("Gmail branch", async () => {
    wipeMailEnv();
    process.env.EMAIL_USER = "test@gmail.com";
    process.env.EMAIL_PASS = "pass";
    const mod = await reload();
    expect(typeof mod.default).toBe("function");
  });

  it("throws when no mail creds configured", async () => {
    wipeMailEnv();
    await expect(reload()).rejects.toThrow("EMAIL_USER/EMAIL_PASS not set");
  });
});
