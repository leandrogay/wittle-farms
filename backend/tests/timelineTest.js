/**
 * Run: node tests/timelineTest.js
 */
import express from "express";
import mongoose, { Schema, model } from "mongoose";
import supertest from "supertest";
import assert from "node:assert/strict";
import { MongoMemoryServer } from "mongodb-memory-server";

import timelineRouter from "../routes/timeline.js";
import Task from "../models/Task.js";

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

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
async function run() {
  let passed = 0;
  for (const t of tests) {
    try { await t.fn(); console.log(`✔ ${t.name}`); passed++; }
    catch (e) { console.error(`✖ ${t.name}`); console.error(e); }
  }
  console.log(`\n${passed}/${tests.length} tests passed`);
  if (passed !== tests.length) process.exitCode = 1;
}

/* ----------------------- App / DB helpers ------------------------ */
function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/timeline", timelineRouter);
  return app;
}

async function connectMemoryMongo() {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri, { dbName: "testdb" });
  return mongod;
}

async function resetDb() {
  const collections = await mongoose.connection.db.listCollections().toArray();
  await Promise.all(collections.map(c =>
    mongoose.connection.db.collection(c.name).deleteMany({})
  ));
}

async function seedData() {
  const users = { A: new mongoose.Types.ObjectId(), B: new mongoose.Types.ObjectId() };
  const proj1 = await Project.create({ name: "Alpha" });
  const proj2 = await Project.create({ name: "Beta" });

  // fixed reference time
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

/* ----------------------- Boot env ------------------------ */
const mongod = await connectMemoryMongo();
const app = makeApp();
const agent = supertest(app);

async function beforeEach() { await resetDb(); return await seedData(); }
async function afterAll() { await mongoose.disconnect(); await mongod.stop(); }

/* --------------------------- Tests --------------------------- */

test("400 when user id is missing", async () => {
  const res = await agent.get("/api/timeline");
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, "Invalid or missing user id");
});

test("400 when user id is invalid", async () => {
  const res = await agent.get("/api/timeline").query({ user: "not-an-oid" });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, "Invalid or missing user id");
});

test("returns only tasks for user and sorted by createdAt desc", async () => {
  const { users } = await beforeEach();
  const res = await agent.get("/api/timeline").query({ user: users.A.toString() });

  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.body.items));

  const titles = res.body.items.map(i => i.title).sort();
  assert.deepEqual(
    titles,
    [
      "T1 - created recently, deadline soon",
      "T2 - only createdAt in range",
      "T3 - only deadline in range",
      "T4 - completed",
    ].sort()
  );

  const created = res.body.items.map(i => new Date(i.createdAt).getTime());
  const sortedDesc = [...created].sort((a, b) => b - a);
  assert.deepEqual(created, sortedDesc);

  // populated project name exists
  assert.equal(typeof res.body.items[0].project, "string");

  // startAt falls back to createdAt when missing
  const t2 = res.body.items.find(i => i.title.startsWith("T2"));
  assert.equal(
    new Date(t2.startAt).toISOString(),
    new Date(t2.createdAt).toISOString()
  );
});

test("date range filter (from & to inclusive across createdAt OR deadline)", async () => {
  const { users } = await beforeEach();
  const res = await agent.get("/api/timeline").query({
    user: users.A.toString(),
    from: "2025-10-12",
    to:   "2025-10-16",
  });
  assert.equal(res.statusCode, 200);
  const titles = res.body.items.map(i => i.title).sort();
  assert.deepEqual(
    titles,
    [
      "T1 - created recently, deadline soon",
      "T2 - only createdAt in range",
      "T3 - only deadline in range",
    ].sort()
  );
});

test("only-from boundary (>= 00:00:00.000Z of that day)", async () => {
  const { users } = await beforeEach();
  const res = await agent.get("/api/timeline").query({
    user: users.A.toString(),
    from: "2025-10-15",
  });
  assert.equal(res.statusCode, 200);
  const titles = res.body.items.map(i => i.title).sort();

  // With only 'from', createdAt >= from OR deadline >= from.
  assert.deepEqual(
    titles,
    [
      "T1 - created recently, deadline soon",
      "T3 - only deadline in range",
    ].sort()
  );
});

test("only-to boundary (<= 23:59:59.999Z of that day)", async () => {
  const { users } = await beforeEach();
  const res = await agent.get("/api/timeline").query({
    user: users.A.toString(),
    to: "2025-10-15",
  });
  assert.equal(res.statusCode, 200);
  const titles = res.body.items.map(i => i.title).sort();
  assert.deepEqual(
    titles,
    [
      "T1 - created recently, deadline soon",
      "T2 - only createdAt in range",
      "T3 - only deadline in range",
      "T4 - completed",
    ].sort()
  );
});

test("nullable fields are null when absent", async () => {
  const { users } = await beforeEach();
  const res = await agent.get("/api/timeline").query({ user: users.A.toString() });
  const t2 = res.body.items.find(i => i.title.startsWith("T2"));
  assert.equal(t2.deadline, null);
  assert.equal(t2.endAt, null);
  assert.equal(t2.completedAt, null);
});

test("uses explicit startAt if present", async () => {
  const { users } = await beforeEach();
  const res = await agent.get("/api/timeline").query({ user: users.A.toString() });
  const t4 = res.body.items.find(i => i.title.startsWith("T4"));
  assert.ok(new Date(t4.startAt).getTime() < new Date(t4.endAt).getTime());
});


// 1) Include when user is among multiple assignees
test("includes task when user is among multiple assignedTeamMembers", async () => {
  const { users, proj1, now, addMs } = await beforeEach();
  await Task.create({
    title: "T6 - multi assignees includes A",
    status: "To Do",
    assignedProject: proj1._id,
    assignedTeamMembers: [users.A, users.B],
    createdBy: users.B,
    createdAt: addMs(now, -2 * 24 * 60 * 60 * 1000),
    deadline: addMs(now, 5 * 24 * 60 * 60 * 1000),
  });

  const res = await agent.get("/api/timeline").query({ user: users.A.toString() });
  assert.equal(res.statusCode, 200);
  const titles = res.body.items.map(i => i.title);
  assert.ok(titles.includes("T6 - multi assignees includes A"));
});

// 2) Task without a project → project should be empty string
test("maps project to empty string when assignedProject is missing", async () => {
  const { users, now, addMs } = await beforeEach();
  await Task.create({
    title: "T7 - no project",
    status: "To Do",
    assignedTeamMembers: [users.A],
    createdBy: users.A,
    createdAt: addMs(now, -4 * 24 * 60 * 60 * 1000),
  });

  const res = await agent.get("/api/timeline").query({ user: users.A.toString() });
  assert.equal(res.statusCode, 200);
  const t7 = res.body.items.find(i => i.title === "T7 - no project");
  assert.ok(t7);
  assert.equal(t7.project, "");
});

// 3) Tight range far from any createdAt/deadline → empty array
test("returns empty items when no createdAt or deadline falls in the range", async () => {
  const { users } = await beforeEach();
  const res = await agent.get("/api/timeline").query({
    user: users.A.toString(),
    from: "2020-01-01",
    to:   "2020-01-02",
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.items, []);
});

// 4) Boundary inclusivity: created exactly at 00:00:00.000Z and deadline exactly at 23:59:59.999Z
test("includes exact-day boundaries (createdAt at 00:00 and deadline at 23:59:59.999)", async () => {
  const { users } = await beforeEach();

  // Create two boundary tasks
  const day = "2025-10-10";
  const createdAtExactlyStart = new Date(`${day}T00:00:00.000Z`);
  const deadlineExactlyEnd   = new Date(`${day}T23:59:59.999Z`);

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
    to:   day,
  });

  assert.equal(res.statusCode, 200);
  const titles = res.body.items.map(i => i.title).sort();
  assert.ok(titles.includes("T8 - created at day start"));
  assert.ok(titles.includes("T9 - deadline at day end"));
});

// 5) Explicit fallback check: startAt missing -> equals createdAt exactly
test("startAt == createdAt when startAt is missing", async () => {
  const { users, now } = await beforeEach();

  const custom = await Task.create({
    title: "T10 - startAt fallback",
    status: "To Do",
    assignedTeamMembers: [users.A],
    createdBy: users.A,
    createdAt: new Date(now.toISOString()),
  });

  const res = await agent.get("/api/timeline").query({ user: users.A.toString() });
  assert.equal(res.statusCode, 200);
  const t10 = res.body.items.find(i => i.id === String(custom._id));
  assert.ok(t10);
  assert.equal(new Date(t10.startAt).toISOString(), new Date(t10.createdAt).toISOString());
});

await run();
await afterAll();
