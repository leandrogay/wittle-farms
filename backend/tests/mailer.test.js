// backend/tests/mailer.test.js
import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";

let mockTransport;

vi.mock("nodemailer", () => {
  const createTransport = vi.fn(() => mockTransport);
  return {
    default: { createTransport },
    createTransport,
  };
});

async function loadMailerWithEnv({
  EMAIL_USER,
  EMAIL_PASS,
  EMAIL_FROM,
  NODE_ENV = "development",
} = {}) {
  vi.resetModules();

  mockTransport = {
    verify: vi.fn((cb) => { mockTransport.__verifyCb = cb; }),
    sendMail: vi.fn(async (opts) => ({ accepted: [opts.to], messageId: "test-id" })),
  };

  const oldEnv = { ...process.env };

  process.env.NODE_ENV = NODE_ENV;
  process.env.EMAIL_USER = EMAIL_USER;
  process.env.EMAIL_PASS = EMAIL_PASS;

  if (EMAIL_FROM === undefined) {
    delete process.env.EMAIL_FROM;
  } else {
    process.env.EMAIL_FROM = EMAIL_FROM;
  }

  const mod = await import("../utils/mailer.js"); // { transporter, sendEmail }

  Object.assign(process.env, oldEnv, {
    NODE_ENV,
    EMAIL_USER,
    EMAIL_PASS,
    EMAIL_FROM,
  });

  return mod;
}

describe("utils/mailer.js", () => {
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

  beforeEach(() => {
    errSpy.mockClear();
    logSpy.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs a clear error when EMAIL_USER / EMAIL_PASS are missing (covers lines 12–13)", async () => {
    await loadMailerWithEnv({ EMAIL_USER: "", EMAIL_PASS: "", EMAIL_FROM: "" });
    expect(errSpy).toHaveBeenCalled();
    const msg = errSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(msg).toMatch(/missing email_user\/email_pass/i);
  });

  it("transporter.verify success branch is executed (without asserting console)", async () => {
    await loadMailerWithEnv({
      EMAIL_USER: "bot@example.com",
      EMAIL_PASS: "secret",
      EMAIL_FROM: "",
      NODE_ENV: "development",
    });

    // verify wired at import:
    expect(mockTransport.verify).toHaveBeenCalledTimes(1);

    // manually drive success branch:
    const cb = mockTransport.verify.mock.calls[0][0];
    expect(typeof cb).toBe("function");
    // Should not throw:
    expect(() => cb(null, true)).not.toThrow();
  });

  it("transporter.verify error branch is executed (covers line 26) (without asserting console)", async () => {
    await loadMailerWithEnv({
      EMAIL_USER: "bot@example.com",
      EMAIL_PASS: "secret",
      EMAIL_FROM: "",
      NODE_ENV: "development",
    });

    expect(mockTransport.verify).toHaveBeenCalledTimes(1);

    const cb = mockTransport.verify.mock.calls[0][0];
    expect(typeof cb).toBe("function");
    // Should not throw either; executes console.error in the module:
    expect(() => cb(new Error("boom"), false)).not.toThrow();
  });

  it("sendEmail uses EMAIL_FROM when provided (explicit custom from)", async () => {
    const CUSTOM_FROM = "Little Farms <no-reply@littlefarms.test>";

    const { sendEmail } = await loadMailerWithEnv({
      EMAIL_USER: "bot@example.com",
      EMAIL_PASS: "secret",
      EMAIL_FROM: CUSTOM_FROM,
    });

    const res = await sendEmail({
      to: "alice@example.com",
      subject: "Hello",
      html: "<b>Hi</b>",
    });

    expect(mockTransport.sendMail).toHaveBeenCalledTimes(1);
    const arg = mockTransport.sendMail.mock.calls[0][0];
    expect(arg).toMatchObject({
      from: CUSTOM_FROM,
      to: "alice@example.com",
      subject: "Hello",
      html: "<b>Hi</b>",
    });
    expect(res).toMatchObject({ accepted: ["alice@example.com"], messageId: "test-id" });
  });

  it("sendEmail falls back to EMAIL_USER when EMAIL_FROM is falsy (covers lines 33–39 fallback)", async () => {
    const { sendEmail } = await loadMailerWithEnv({
      EMAIL_USER: "bot@example.com",
      EMAIL_PASS: "secret",
      EMAIL_FROM: "", // falsy → fallback
    });

    await sendEmail({
      to: "bob@example.com",
      subject: "Fallback",
      html: "<i>Hi</i>",
    });

    expect(mockTransport.sendMail).toHaveBeenCalledTimes(1);
    const arg = mockTransport.sendMail.mock.calls[0][0];
    expect(arg.from).toBe("bot@example.com");
    expect(arg.to).toBe("bob@example.com");
    expect(arg.subject).toBe("Fallback");
    expect(arg.html).toBe("<i>Hi</i>");
  });
});
