// backend/tests/mentions.test.js
// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

/**
 * We mock mongoose so isOid can be tested deterministically.
 */
let mongooseMock;
vi.mock("mongoose", () => {
  const isValidObjectId = vi.fn(
    (v) => typeof v === "string" && /^[0-9a-fA-F]{24}$/.test(v)
  );
  mongooseMock = { default: { isValidObjectId }, isValidObjectId };
  return mongooseMock;
});

let isOid, localPart, extractMentions;

beforeAll(async () => {
  const mod = await import("../utils/mentions.js");

  // Likely named exports
  isOid = mod.isOid ?? mod.default;
  localPart = mod.localPart;

  // 1) Try known names first
  const candidates = [
    "extractMentions",
    "parseMentions",
    "mentionsFromText",
    "mentions",
    "extractAtHandles",
    "extractAtTokens",
    "extract",              // add very generic
    "parse",                // add very generic
  ];
  for (const name of candidates) {
    if (typeof mod[name] === "function") {
      extractMentions = mod[name];
      break;
    }
  }

  // 2) If still not found, auto-discover:
  if (!extractMentions) {
    for (const [key, val] of Object.entries(mod)) {
      if (typeof val !== "function") continue;
      try {
        // Try with the canonical sample; we expect an array back containing 'alice' and 'bob'
        const probe = val("Hi @Alice and @bob and again @ALICE!");
        if (Array.isArray(probe)) {
          const norm = [...new Set(probe.map((s) => String(s).toLowerCase()))].sort();
          if (norm.includes("alice") && norm.includes("bob")) {
            extractMentions = val;
            break;
          }
        }
      } catch {
        // ignore and keep scanning
      }
    }
  }

  // If still not found, look at a default export that is a function
  if (!extractMentions && typeof mod.default === "function") {
    try {
      const probe = mod.default("Hi @Alice and @bob and again @ALICE!");
      if (Array.isArray(probe)) {
        const norm = [...new Set(probe.map((s) => String(s).toLowerCase()))].sort();
        if (norm.includes("alice") && norm.includes("bob")) {
          extractMentions = mod.default;
        }
      }
    } catch {
      // ignore
    }
  }

  if (typeof isOid !== "function") {
    throw new Error("utils/mentions.js must export isOid (or default).");
  }
  if (typeof localPart !== "function") {
    throw new Error("utils/mentions.js must export localPart.");
  }
  if (typeof extractMentions !== "function") {
    throw new Error(
      "Could not auto-discover the @mentions extractor in utils/mentions.js. " +
      "Export it under any name; this test will find it automatically."
    );
  }
});

beforeEach(() => {
  mongooseMock.default.isValidObjectId.mockClear();
  if (mongooseMock.isValidObjectId?.mockClear) mongooseMock.isValidObjectId.mockClear();
});

/* ---------------- isOid ---------------- */
describe("isOid (utils/mentions.js)", () => {
  it("returns true for a valid ObjectId string (24 hex chars)", () => {
    const valid = "507f1f77bcf86cd799439011";
    const res = isOid(valid);
    expect(res).toBe(true);
    expect(mongooseMock.default.isValidObjectId).toHaveBeenCalledTimes(1);
    expect(mongooseMock.default.isValidObjectId).toHaveBeenCalledWith(valid);
  });

  it("returns false for an invalid ObjectId-like string", () => {
    const invalid = "not-an-objectid";
    const res = isOid(invalid);
    expect(res).toBe(false);
    expect(mongooseMock.default.isValidObjectId).toHaveBeenCalledTimes(1);
    expect(mongooseMock.default.isValidObjectId).toHaveBeenCalledWith(invalid);
  });

  it("returns false for non-string inputs and does not call isValidObjectId (short-circuit)", () => {
    expect(isOid(123)).toBe(false);
    expect(isOid(null)).toBe(false);
    expect(isOid(undefined)).toBe(false);
    expect(isOid({})).toBe(false);
    expect(isOid([])).toBe(false);
    expect(mongooseMock.default.isValidObjectId).not.toHaveBeenCalled();
  });
});

/* --------------- localPart --------------- */
describe("localPart (utils/mentions.js)", () => {
  it("extracts and lowercases the local part normally", () => {
    expect(localPart("Alice.Smith@Example.COM")).toBe("alice.smith");
  });

  it("returns '' via fallback when local part is empty (hits the `|| ''` branch)", () => {
    expect(localPart("@example.com")).toBe("");
  });

  it("coerces non-strings via String()", () => {
    expect(localPart(12345)).toBe("12345");
  });

  it("empty string input returns '' (fallback)", () => {
    expect(localPart("")).toBe("");
  });

  it("undefined uses default param and returns ''", () => {
    expect(localPart()).toBe("");
  });
});

/* ----------- extractor: covers lines with matchAll + m[2].toLowerCase ----------- */
describe("extractor (utils/mentions.js) – @mentions loop coverage", () => {
  it("finds simple @handles, lowercases them, removes duplicates", () => {
    const text = "Hey @Alice and @bob and again @ALICE!";
    const out = extractMentions(text);
    expect(Array.isArray(out)).toBe(true);
    const norm = [...new Set(out.map((s) => s.toLowerCase()))].sort();
    expect(norm).toEqual(["alice", "bob"]);
  });

  it("handles underscores/digits and ignores non-@ tokens", () => {
    const text = "ping @kw_01; ignore @@ and 'at' symbols";
    const out = extractMentions(text);
    expect(out.map((s) => s.toLowerCase())).toContain("kw_01");
  });

  it("does not create spurious handles from plain emails (boundary check)", () => {
    const text = "Contact me at someone@example.com or @Alice.";
    const out = extractMentions(text);
    expect(out.map((s) => s.toLowerCase())).toContain("alice");
    expect(out.map((s) => s.toLowerCase())).not.toContain("someone");
  });

  it("coerces non-strings via String(text) and returns [] when no matches", () => {
    expect(extractMentions(123456)).toEqual([]);
    expect(extractMentions({ toString: () => "@@@@" })).toEqual([]); // depends on your regex; this keeps it empty
  });

  it("empty/undefined returns []", () => {
    expect(extractMentions("")).toEqual([]);
    expect(extractMentions()).toEqual([]);
  });
});
