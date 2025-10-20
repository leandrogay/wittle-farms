/**
 * Run locally:
 *   npx vitest run backend/tests/timeline.test.js
 *
 * CI notes:
 * - Uses mongodb-memory-server (downloads a MongoDB binary at runtime).
 * - Uses Vitest hooks instead of a custom test runner.
 */
import express from "express";
import mongoose, { Schema, model } from "mongoose";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

import timelineRouter from "../routes/timeline.js";
import Task from "../models/Task.js";

// Some CI runners can be slow to download the MongoDB binary:
const BIG_TIMEOUT = 120_000;

/* ----------------------- App / DB helpers ------------------------ */
function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/timeline", timelineRouter);
  return app;
}

let mongod;
let app;
let agent;

// Minimal Project model for populate("assignedProject", "name")
let Project;
try {
  Project = mongoose.model("Project");
} catch {
  Project = model(
    "Project",
    new Schema({ name: { type: String, required: true } }, { timestamps: true })
  );
}

async function connectMemoryMongo() {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri, { dbName: "testdb" });
}

async function resetDb() {
  const collections = await mongoose.connection.db.listCollections().toArray();
  await Promise.all(
    collections.map((c) =>
      mongoose.connection.db.collection(c.name).deleteMany({})
    )
  );
}

async function seedData() {
  const users = {
    A: new mongoose.Types.ObjectId(),
    B: new mongoose.Types.ObjectId(),
  };
  const proj1 = await Project.create({ name: "Alpha" });
  const proj2 = await Project.create({ name: "Beta" });

  // fixed reference time (kept to align with your expectations)
  const now = new Date("2025-10-15T12:00:00.000Z");
  const DAY = 24 * 60 * 60 * 1000;
  const addMs = (base, ms) => new Date(base.getTime() + ms);

  await Task.insertMany([
    {
      title: "T1 - created recently, deadline soon",
      status: "To Do",
      assignedProject: proj1._id,
      assignedTeamMembers: [users.A],
      createdBy: users.A,
      createdAt: addMs(now, -1 * DAY),
      deadline: addMs(now, 2 * DAY),
    },
    {
      title: "T2 - only createdAt in range",
      status: "In Progress",
      assignedProject: proj2._id,
      assignedTeamMembers: [users.A],
      createdBy: users.A,
      createdAt: addMs(now, -3 * DAY),
    },
    {
      title: "T3 - only deadline in range",
      status: "To Do",
      assignedProject: proj1._id,
      assignedTeamMembers: [users.A],
      createdBy: users.A,
      createdAt: addMs(now, -50 * DAY),
      deadline: addMs(now, 1 * DAY),
    },
    {
      title: "T4 - completed",
      status: "Done",
      assignedProject: proj2._id,
      assignedTeamMembers: [users.A],
      createdBy: users.A,
      createdAt: addMs(now, -10 * DAY),
      startAt: addMs(now, -9 * DAY),
      endAt: addMs(now, -2 * DAY),
      completedAt: addMs(now, -1 * DAY),
    },
    // Other user
    {
      title: "T5 - belongs to other user",
      status: "To Do",
      assignedProject: proj1._id,
      assignedTeamMembers: [users.B],
      createdBy: users.B,
      createdAt: addMs(now, -1 * DAY),
      deadline: addMs(now, 3 * DAY),
    },
  ]);

  return { users, proj1, proj2, now, DAY, addMs };
}

/* --------------------------- Lifecycle --------------------------- */
beforeAll(async () => {
  await connectMemoryMongo();
  app = makeApp();
  agent = request(app);
}, BIG_TIMEOUT);

afterAll(async () => {
  try {
    await mongoose.disconnect();
  } finally {
    if (mongod) await mongod.stop();
  }
}, BIG_TIMEOUT);

beforeEach(async () => {
  await resetDb();
}, BIG_TIMEOUT);

/* --------------------------- Tests --------------------------- */

describe("GET /api/timeline", () => {
  it("400 when user id is missing", async () => {
    const res = await agent.get("/api/timeline");
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Invalid or missing user id");
  });

  it("400 when user id is invalid", async () => {
    const res = await agent.get("/api/timeline").query({ user: "not-an-oid" });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Invalid or missing user id");
  });

  it("returns only tasks for user and sorted by createdAt desc", async () => {
    const { users } = await seedData();
    const res = await agent
      .get("/api/timeline")
      .query({ user: users.A.toString() });

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);

    const titles = res.body.items.map((i) => i.title).sort();
    expect(titles).toStrictEqual(
      [
        "T1 - created recently, deadline soon",
        "T2 - only createdAt in range",
        "T3 - only deadline in range",
        "T4 - completed",
      ].sort()
    );

    const created = res.body.items.map((i) => new Date(i.createdAt).getTime());
    const sortedDesc = [...created].sort((a, b) => b - a);
    expect(created).toStrictEqual(sortedDesc);

    // populated project name exists (string)
    expect(typeof res.body.items[0].project).toBe("string");

    // startAt falls back to createdAt when missing
    const t2 = res.body.items.find((i) => i.title.startsWith("T2"));
    expect(new Date(t2.startAt).toISOString()).toBe(
      new Date(t2.createdAt).toISOString()
    );
  });

  it("date range filter (from & to inclusive across createdAt OR deadline)", async () => {
    const { users } = await seedData();
    const res = await agent.get("/api/timeline").query({
      user: users.A.toString(),
      from: "2025-10-12",
      to: "2025-10-16",
    });

    expect(res.statusCode).toBe(200);
    const titles = res.body.items.map((i) => i.title).sort();
    expect(titles).toStrictEqual(
      [
        "T1 - created recently, deadline soon",
        "T2 - only createdAt in range",
        "T3 - only deadline in range",
      ].sort()
    );
  });

  it("only-from boundary (>= 00:00:00.000Z of that day)", async () => {
    const { users } = await seedData();
    const res = await agent.get("/api/timeline").query({
      user: users.A.toString(),
      from: "2025-10-15",
    });

    expect(res.statusCode).toBe(200);
    const titles = res.body.items.map((i) => i.title).sort();
    // With only 'from', createdAt >= from OR deadline >= from.
    expect(titles).toStrictEqual(
      ["T1 - created recently, deadline soon", "T3 - only deadline in range"].sort()
    );
  });

  it("only-to boundary (<= 23:59:59.999Z of that day)", async () => {
    const { users } = await seedData();
    const res = await agent.get("/api/timeline").query({
      user: users.A.toString(),
      to: "2025-10-15",
    });

    expect(res.statusCode).toBe(200);
    const titles = res.body.items.map((i) => i.title).sort();
    expect(titles).toStrictEqual(
      [
        "T1 - created recently, deadline soon",
        "T2 - only createdAt in range",
        "T3 - only deadline in range",
        "T4 - completed",
      ].sort()
    );
  });

  it("nullable fields are null when absent", async () => {
    const { users } = await seedData();
    const res = await agent
      .get("/api/timeline")
      .query({ user: users.A.toString() });

    const t2 = res.body.items.find((i) => i.title.startsWith("T2"));
    expect(t2.deadline).toBe(null);
    expect(t2.endAt).toBe(null);
    expect(t2.completedAt).toBe(null);
  });

  it("uses explicit startAt if present", async () => {
    const { users } = await seedData();
    const res = await agent
      .get("/api/timeline")
      .query({ user: users.A.toString() });

    const t4 = res.body.items.find((i) => i.title.startsWith("T4"));
    expect(new Date(t4.startAt).getTime()).toBeLessThan(
      new Date(t4.endAt).getTime()
    );
  });

  // 1) Include when user is among multiple assignees
  it("includes task when user is among multiple assignedTeamMembers", async () => {
    const { users, proj1, now, addMs } = await seedData();
    await Task.create({
      title: "T6 - multi assignees includes A",
      status: "To Do",
      assignedProject: proj1._id,
      assignedTeamMembers: [users.A, users.B],
      createdBy: users.B,
      createdAt: addMs(now, -2 * 24 * 60 * 60 * 1000),
      deadline: addMs(now, 5 * 24 * 60 * 60 * 1000),
    });

    const res = await agent
      .get("/api/timeline")
      .query({ user: users.A.toString() });

    expect(res.statusCode).toBe(200);
    const titles = res.body.items.map((i) => i.title);
    expect(titles).toContain("T6 - multi assignees includes A");
  });

  // 2) Task without a project → project should be empty string
  it("maps project to empty string when assignedProject is missing", async () => {
    const { users, now, addMs } = await seedData();
    await Task.create({
      title: "T7 - no project",
      status: "To Do",
      assignedTeamMembers: [users.A],
      createdBy: users.A,
      createdAt: addMs(now, -4 * 24 * 60 * 60 * 1000),
    });

    const res = await agent
      .get("/api/timeline")
      .query({ user: users.A.toString() });

    expect(res.statusCode).toBe(200);
    const t7 = res.body.items.find((i) => i.title === "T7 - no project");
    expect(t7).toBeTruthy();
    expect(t7.project).toBe("");
  });

  // 3) Tight range far from any createdAt/deadline → empty array
  it("returns empty items when no createdAt or deadline falls in the range", async () => {
    const { users } = await seedData();
    const res = await agent.get("/api/timeline").query({
      user: users.A.toString(),
      from: "2020-01-01",
      to: "2020-01-02",
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.items).toStrictEqual([]);
  });

  // 4) Boundary inclusivity: created exactly at 00:00:00.000Z and deadline exactly at 23:59:59.999Z
  it("includes exact-day boundaries (createdAt at 00:00 and deadline at 23:59:59.999)", async () => {
    const { users } = await seedData();

    const day = "2025-10-10";
    const createdAtExactlyStart = new Date(`${day}T00:00:00.000Z`);
    const deadlineExactlyEnd = new Date(`${day}T23:59:59.999Z`);

    await Task.create({
      title: "T8 - created at day start",
      status: "To Do",
      assignedTeamMembers: [users.A],
      createdBy: users.A,
      createdAt: createdAtExactlyStart,
    });

    await Task.create({
      title: "T9 - deadline at day end",
      status: "To Do",
      assignedTeamMembers: [users.A],
      createdBy: users.A,
      createdAt: new Date("2025-09-01T00:00:00.000Z"),
      deadline: deadlineExactlyEnd,
    });

    const res = await agent.get("/api/timeline").query({
      user: users.A.toString(),
      from: day,
      to: day,
    });

    expect(res.statusCode).toBe(200);
    const titles = res.body.items.map((i) => i.title);
    expect(titles).toContain("T8 - created at day start");
    expect(titles).toContain("T9 - deadline at day end");
  });

  // 5) Explicit fallback check: startAt missing -> equals createdAt exactly
  it("startAt == createdAt when startAt is missing", async () => {
    const { users, now } = await seedData();

    const custom = await Task.create({
      title: "T10 - startAt fallback",
      status: "To Do",
      assignedTeamMembers: [users.A],
      createdBy: users.A,
      createdAt: new Date(now.toISOString()),
    });

    const res = await agent
      .get("/api/timeline")
      .query({ user: users.A.toString() });

    expect(res.statusCode).toBe(200);
    const t10 = res.body.items.find((i) => i.id === String(custom._id));
    expect(t10).toBeTruthy();
    expect(new Date(t10.startAt).toISOString()).toBe(
      new Date(t10.createdAt).toISOString()
    );
  });
});
