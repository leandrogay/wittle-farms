// backend/tests/mentions.test.js
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

/**
 * utils/mentions.js:
 *   import mongoose from "mongoose";
 *   const { isValidObjectId } = mongoose;
 *   export function localPart(email = "") { return String(email).split("@")[0]?.toLowerCase() || ""; }
 *   export function isOid(v) { return typeof v === "string" && isValidObjectId(v); }
 *
 * We must mock mongoose's DEFAULT export with isValidObjectId.
 */
let mongooseMock;
vi.mock("mongoose", () => {
  const isValidObjectId = vi.fn(
    (v) => typeof v === "string" && /^[0-9a-fA-F]{24}$/.test(v)
  );
  // Provide default (for `import mongoose from "mongoose"`) and named (safe fallback)
  mongooseMock = { default: { isValidObjectId }, isValidObjectId };
  return mongooseMock;
});

// Import SUT AFTER the mock is set
let isOid, localPart;
beforeAll(async () => {
  const mod = await import("../utils/mentions.js"); // <-- plural path
  isOid = mod.isOid ?? mod.default;
  localPart = mod.localPart;

  if (typeof isOid !== "function") {
    throw new Error("utils/mentions.js must export isOid (or default).");
  }
  if (typeof localPart !== "function") {
    throw new Error("utils/mentions.js must export localPart.");
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

    // typeof v !== "string" → RHS must not run
    expect(mongooseMock.default.isValidObjectId).not.toHaveBeenCalled();
  });
});

/* --------------- localPart --------------- */
describe("localPart (utils/mentions.js)", () => {
  it("extracts and lowercases the local part normally", () => {
    expect(localPart("Alice.Smith@Example.COM")).toBe("alice.smith");
  });

  it("returns '' via fallback when local part is empty (hits the `|| ''` branch)", () => {
    // String('@example.com').split('@')[0] === '' -> fallback '' taken
    expect(localPart("@example.com")).toBe("");
  });

  it("coerces non-strings via String()", () => {
    // String(12345) => "12345"
    expect(localPart(12345)).toBe("12345");
  });

  it("empty string input returns '' (fallback)", () => {
    expect(localPart("")).toBe("");
  });

  it("undefined uses default param and returns ''", () => {
    expect(localPart()).toBe("");
  });
});
