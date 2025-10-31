import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

// Mock bcryptjs so we can flip behaviours per test
vi.mock("bcryptjs", () => {
  const genSalt = vi.fn(async () => "salt-ok");
  const hash = vi.fn(async (pwd, salt) => `hashed:${pwd}:${salt}`);
  const compare = vi.fn(async (entered, stored) => stored.startsWith("hashed:"));
  return { default: { genSalt, hash, compare } };
});
import bcrypt from "bcryptjs";

import User from "../models/User.js";

let mongod;

describe("User model pre('save') hook & helpers", () => {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri(), { dbName: "user-model-prehook" });
  });

  afterAll(async () => {
    try { await mongoose.disconnect(); } finally { await mongod.stop(); }
  });

  beforeEach(async () => {
    // reset db + mocks
    const colls = await mongoose.connection.db.listCollections().toArray();
    await Promise.all(colls.map(c => mongoose.connection.db.collection(c.name).deleteMany({})));
    vi.clearAllMocks();
  });

  it("hashes password successfully (happy path already covered but re-assert)", async () => {
    const u = await User.create({
      name: "Alice",
      email: "alice@example.com",
      password: "Password123!",
      role: "Staff",
    });
    expect(u.password).toMatch(/^hashed:Password123!:salt-ok$/);
    // matchPassword uses bcrypt.compare mock
    const ok = await u.matchPassword("any");
    expect(ok).toBe(true);
  });

  it("propagates error via next(err) when bcrypt.genSalt throws (covers catch at lines 29–30)", async () => {
    // Make genSalt fail for this test to exercise the catch branch
    bcrypt.genSalt.mockRejectedValueOnce(new Error("salt-broke"));

    await expect(User.create({
      name: "Bob",
      email: "bob@example.com",
      password: "Secret123!",
      role: "Staff",
    }))
      .rejects.toThrow(/salt-broke/);

    // Ensure hash was never called due to early failure
    expect(bcrypt.hash).not.toHaveBeenCalled();
  });

  it("propagates error via next(err) when bcrypt.hash throws (alternate catch path)", async () => {
    // genSalt ok, but hash fails
    bcrypt.hash.mockRejectedValueOnce(new Error("hash-broke"));

    await expect(User.create({
      name: "Cara",
      email: "cara@example.com",
      password: "Secret123!",
      role: "Staff",
    }))
      .rejects.toThrow(/hash-broke/);

    expect(bcrypt.genSalt).toHaveBeenCalled();
  });

  it("isLocked() covers true/false branches", async () => {
    const u = new User({
      name: "Danny",
      email: "danny@example.com",
      password: "Password123!",
      role: "Staff",
    });

    // No lockUntil -> false
    expect(u.isLocked()).toBeFalsy();

    // Past -> false
    u.lockUntil = new Date(Date.now() - 60_000);
    expect(u.isLocked()).toBeFalsy();

    // Future -> true
    u.lockUntil = new Date(Date.now() + 60_000);
    expect(u.isLocked()).toBeTruthy();
  });
});
