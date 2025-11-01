// tests/auth.transport.verifyok.test.js
import { describe, it, expect, vi } from "vitest";

describe("transporter.verify success path executes when NODE_ENV != test", () => {
  it("imports without error and runs verify().then(success)", async () => {
    vi.resetModules();

    process.env.NODE_ENV = "development";
    process.env.EMAIL_USER = "test@gmail.com";
    process.env.EMAIL_PASS = "pass";
    process.env.JWT_SECRET = "x";
    process.env.JWT_REFRESH_SECRET = "y";

    vi.mock("dotenv", () => {
      const config = vi.fn(() => ({ parsed: {} }));
      return { default: { config }, config };
    });
    // resolve branch
    vi.mock("nodemailer", () => {
      const transporter = {
        verify: vi.fn(() => Promise.resolve()),
        sendMail: vi.fn(() => Promise.resolve({ messageId: "ok" })),
      };
      const createTransport = vi.fn(() => transporter);
      return { default: { createTransport }, createTransport, __mocks: { transporter } };
    });

    const mod = await import("../routes/auth.js");
    expect(mod).toHaveProperty("default");
  });
});
