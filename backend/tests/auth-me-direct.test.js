// tests/auth.me.direct.test.js
import { it, expect, vi } from "vitest";

it("directly invokes /me handler to cover object literal return lines", async () => {
  vi.resetModules();

  // Minimal env & mailer mocks so routes/auth.js imports cleanly
  process.env.NODE_ENV = "test";
  process.env.EMAIL_USER = "test@gmail.com";
  process.env.EMAIL_PASS = "pass";
  process.env.JWT_SECRET = "x";
  process.env.JWT_REFRESH_SECRET = "y";

  vi.doMock("dotenv", () => {
    const config = vi.fn(() => ({ parsed: {} }));
    return { default: { config }, config };
  });
  vi.doMock("nodemailer", () => {
    const transporter = {
      verify: vi.fn(() => Promise.resolve()),
      sendMail: vi.fn(() => Promise.resolve({ messageId: "ok" })),
    };
    const createTransport = vi.fn(() => transporter);
    return { default: { createTransport }, createTransport, __mocks: { transporter } };
  });

  // *** CRITICAL: mock the User model BEFORE importing routes ***
  vi.doMock("../models/User.js", () => {
    return {
      default: {
        // Only the chain used by /me is needed:
        findById: vi.fn(() => ({
          select: vi.fn(() => ({
            lean: vi.fn(async () => ({
              _id: "U1",
              name: "Alice",
              email: "alice@example.com",
              role: "Staff",
              createdAt: new Date("2025-01-01T00:00:00Z"),
              updatedAt: new Date("2025-01-02T00:00:00Z"),
            })),
          })),
        })),
      },
    };
  });

  // Now import the router (will use our mocked model)
  const mod = await import("../routes/auth.js");
  const router = mod.default;

  // Find GET /me route and take the LAST handler (skips verifyAuth middleware)
  const layer = router.stack.find(
    (l) => l?.route?.path === "/me" && l.route?.methods?.get
  );
  expect(layer).toBeTruthy();
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;

  // Minimal req/res; verifyAuth is skipped so we provide userId directly
  const req = { userId: "U1" };
  const res = {
    _status: 200,
    status(s) { this._status = s; return this; },
    jsonPayload: null,
    json(obj) { this.jsonPayload = obj; return obj; },
  };

  // Invoke the handler
  await handler(req, res);

  // Assert the exact object so each property line (411–422) is marked covered
  expect(res.jsonPayload).toEqual({
    user: {
      id: "U1",
      name: "Alice",
      email: "alice@example.com",
      role: "Staff",
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
      updatedAt: new Date("2025-01-02T00:00:00.000Z"),
    },
  });
});
