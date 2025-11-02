// tests/auth.transporter.verify.test.js
import { it, expect, vi, beforeEach } from "vitest";

function setMailEnv() {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("EMAIL_USER", "test@gmail.com");
  vi.stubEnv("EMAIL_PASS", "pass");
  vi.stubEnv("JWT_SECRET", "x");
  vi.stubEnv("JWT_REFRESH_SECRET", "y");
  vi.stubEnv("FRONTEND_URL", "http://localhost:5173");
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  setMailEnv();
});

it("covers transporter.verify rejection init path", async () => {
  vi.mock("dotenv", () => {
    const config = vi.fn(() => ({ parsed: {} }));
    return { default: { config }, config };
  });

  vi.mock("nodemailer", () => {
    const transporter = {
      verify: vi.fn(() => Promise.reject(new Error("init verify failed"))),
      sendMail: vi.fn(() => Promise.resolve({ messageId: "ok" })),
    };
    const createTransport = vi.fn(() => transporter);
    return { default: { createTransport }, createTransport, __mocks: { transporter } };
  });

  const mod = await import("../routes/auth.js");
  expect(typeof mod.default).toBe("function");
});
