import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

// Use your real tasks router so the same code path (computeNextDeadline + update->clone) runs
import tasksRouter from "../routes/tasks.js";

import Project from "../models/Project.js";
import User from "../models/User.js";
import Task from "../models/Task.js";

let mongod, app, agent;

// Minimal app that mounts the real /api/tasks router
function makeApp() {
  const server = express();
  server.use(express.json());
  // stub socket emission used by router (io?.emit?. calls)
  server.set("io", { emit: () => {} });
  server.use("/api/tasks", tasksRouter);
  return server;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: "task-month-no-overflow" });
  app = makeApp();
  agent = request(app);
});

afterAll(async () => {
  try { await mongoose.disconnect(); } finally {
    if (mongod) await mongod.stop();
  }
});

beforeEach(async () => {
  const collections = await mongoose.connection.db.listCollections().toArray();
  await Promise.all(
    collections.map(c => mongoose.connection.db.collection(c.name).deleteMany({}))
  );
});

describe("Monthly recurrence (no overflow) covers else-branch of overflow check", () => {
  it("marks Done and spawns next monthly instance from Mar 15 -> Apr 15 (no overflow path)", async () => {
    // Refs
    const mgr   = await User.create({ name: "Mgr", email: "mgr@example.com", password: "StrongP@ss1", role: "Manager" });
    const alice = await User.create({ name: "Alice", email: "alice@example.com", password: "StrongP@ss1", role: "Staff" });
    const proj  = await Project.create({ name: "Alpha", createdBy: mgr._id });

    // Choose a date where next month has the same day (=> no overflow)
    // Mar 15 -> Apr 15 is perfect
    const startDeadline = new Date("2025-03-15T09:00:00.000Z");

    // Create task with monthly recurrence
    const createRes = await agent.post("/api/tasks").send({
      title: "Monthly—No Overflow",
      status: "To Do",
      assignedProject: proj._id.toString(),
      assignedTeamMembers: [alice._id.toString()],
      createdBy: mgr._id.toString(),
      deadline: startDeadline.toISOString(),
      recurrence: { frequency: "monthly", interval: 1, ends: "never" },
      // offsets can be empty; model/route fills defaults when a deadline exists
      reminderOffsets: []
    });
    expect(createRes.status).toBe(201);
    const created = createRes.body;
    const taskId = created._id || created.id || created.task?._id || created.item?.id;

    // Transition to Done -> router computes next date using monthly branch
    const updRes = await agent.put(`/api/tasks/${taskId}`).send({ status: "Done" });
    expect(updRes.status).toBe(200);

    // Verify a clone for next occurrence exists at Apr 15 (no overflow branch)
    const all = await Task.find({ title: "Monthly—No Overflow" }).sort({ deadline: 1 }).lean();
    // Expect 2 docs: original (Done, Mar 15) + clone (To Do, Apr 15)
    expect(all.length).toBe(2);

    const [first, second] = all;
    expect(new Date(first.deadline).toISOString()).toBe(startDeadline.toISOString());
    expect(first.status).toBe("Done");

    const nextDeadline = new Date("2025-04-15T09:00:00.000Z").toISOString();
    expect(new Date(second.deadline).toISOString()).toBe(nextDeadline);
    expect(second.status).toBe("To Do");
  });
});
