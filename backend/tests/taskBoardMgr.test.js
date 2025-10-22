/**
 * Run locally:
 *   npx vitest run --config ./config/vitest.config.js backend/tests/taskBoardMgr.test.js
 *
 * What this covers (acceptance criteria):
 * - View task/subtask details (title, desc, assigned team members, status, deadline, notes)
 * - View tasks/subtasks of all team members (by team membership)
 * - Filter by Status, Priority, Project Name
 * - Sort by Deadline (nulls last)
 */

import express from "express";
import mongoose, { Schema, model } from "mongoose";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

/* ------------------------- Minimal Schemas ------------------------- */
// Reuse existing Task model if defined, else create a minimal compatible one.
let Task;
try {
  Task = mongoose.model("Task");
} catch {
  Task = model(
    "Task",
    new Schema(
      {
        title: { type: String, required: true },
        description: String,
        notes: String,
        status: { type: String, enum: ["To Do", "In Progress", "Done"], required: true },
        priority: { type: Number, min: 1, max: 10 },
        deadline: Date,
        assignedProject: { type: mongoose.Types.ObjectId, ref: "Project" },
        assignedTeamMembers: [{ type: mongoose.Types.ObjectId, ref: "User" }],
        subtasks: [
          new Schema(
            {
              title: String,
              status: { type: String, enum: ["To Do", "In Progress", "Done"] },
              priority: { type: Number, min: 1, max: 10 },
              deadline: Date,
            },
            { _id: true }
          ),
        ],
        createdBy: { type: mongoose.Types.ObjectId, ref: "User" },
      },
      { timestamps: true }
    )
  );
}

let Project;
try {
  Project = mongoose.model("Project");
} catch {
  Project = model(
    "Project",
    new Schema({ name: { type: String, required: true } }, { timestamps: true })
  );
}

let User;
try {
  User = mongoose.model("User");
} catch {
  User = model(
    "User",
    new Schema({ name: String }, { timestamps: true })
  );
}

/* --------------------- Inline "manager" router --------------------- */
/**
 * GET /api/manager/tasks
 * Query params:
 *  - team: comma-separated user ids (team members)
 *  - project: project name (exact match)
 *  - status: "To Do" | "In Progress" | "Done"
 *  - priority: integer 1..10
 *  - sort: "deadline" (asc, nulls last)
 *
 * Returns: array of tasks with projected fields, including subtasks.
 */
function makeRouter() {
  const router = express.Router();

  router.get("/tasks", async (req, res) => {
    try {
      const { team, project, status, priority, sort } = req.query;

      // Validate & build filters
      const filter = {};

      // Team members (view tasks of all their team members)
      if (team) {
        const teamIds = team
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => (mongoose.isValidObjectId(s) ? new mongoose.Types.ObjectId(s) : null))
          .filter(Boolean);

        if (!teamIds.length) {
          return res.status(400).json({ error: "Invalid team member ids" });
        }
        // user is included if ANY of the assignedTeamMembers is in teamIds
        filter.assignedTeamMembers = { $in: teamIds };
      }

      // Status filter (optional)
      if (status) {
        const allowed = ["To Do", "In Progress", "Done"];
        if (!allowed.includes(status)) {
          return res.status(400).json({ error: "Invalid status" });
        }
        filter.status = status;
      }

      // Priority filter (optional)
      if (priority !== undefined) {
        const p = Number(priority);
        if (!Number.isInteger(p) || p < 1 || p > 10) {
          return res.status(400).json({ error: "Invalid priority" });
        }
        filter.priority = p;
      }

      // Project filter (by name)
      if (project) {
        const projDoc = await Project.findOne({ name: project }).lean();
        if (!projDoc) {
          // no such project => empty list
          return res.json({ items: [] });
        }
        filter.assignedProject = projDoc._id;
      }

      // Query
      let cursor = Task.find(filter)
        .populate("assignedProject", "name")
        .populate("assignedTeamMembers", "name")
        .lean();

      // Sort by deadline (asc), nulls last
      if (sort === "deadline") {
        // We’ll sort in-memory so we can push nulls last portably
        const data = await cursor.exec();
        data.sort((a, b) => {
          const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
          const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
          if (da === db) return 0;
          return da - db;
        });

        return res.json({
          items: data.map(projectRow),
        });
      }

      const items = await cursor.exec();
      res.json({ items: items.map(projectRow) });
    } catch (err) {
      res.status(500).json({ error: "Server error", detail: String(err?.message || err) });
    }
  });

  return router;
}

function projectRow(t) {
  return {
    id: String(t._id),
    title: t.title,
    description: t.description ?? "",
    notes: t.notes ?? "",
    status: t.status,
    priority: t.priority ?? null,
    deadline: t.deadline ? new Date(t.deadline).toISOString() : null,
    project: t.assignedProject?.name ?? "",
    team: (t.assignedTeamMembers || []).map((u) => ({ id: String(u._id), name: u.name ?? "" })),
    subtasks: (t.subtasks || []).map((s) => ({
      id: String(s._id),
      title: s.title,
      status: s.status,
      priority: s.priority ?? null,
      deadline: s.deadline ? new Date(s.deadline).toISOString() : null,
    })),
  };
}

/* ----------------------- App / DB helpers ----------------------- */
function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/manager", makeRouter());
  return app;
}

const BIG_TIMEOUT = 120_000;
let mongod, app, agent;

async function connectMemoryMongo() {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri, { dbName: "mgr_testdb" });
}

async function resetDb() {
  const collections = await mongoose.connection.db.listCollections().toArray();
  await Promise.all(
    collections.map((c) => mongoose.connection.db.collection(c.name).deleteMany({}))
  );
}

async function seedData() {
  const now = new Date("2025-10-15T12:00:00.000Z");
  const DAY = 24 * 60 * 60 * 1000;
  const addMs = (ms) => new Date(now.getTime() + ms);

  const manager = await User.create({ name: "Manager" });
  const alice = await User.create({ name: "Alice" });
  const bob = await User.create({ name: "Bob" });
  const charlie = await User.create({ name: "Charlie (not in team)" });

  const alpha = await Project.create({ name: "Alpha" });
  const beta = await Project.create({ name: "Beta" });

  const base = {
    createdBy: manager._id,
    assignedTeamMembers: [alice._id, bob._id],
    assignedProject: alpha._id,
  };

  await Task.insertMany([
    {
      ...base,
      title: "Overdue A",
      description: "A-desc",
      notes: "A-notes",
      status: "In Progress",
      priority: 7,
      deadline: addMs(-1 * DAY),
      subtasks: [{ title: "Sub High", status: "To Do", priority: 10, deadline: addMs(5 * DAY) }],
    },
    { ...base, title: "Due Today", status: "To Do", priority: 6, deadline: addMs(0) },
    { ...base, title: "Upcoming Low", status: "To Do", priority: 2, deadline: addMs(5 * DAY) },
    { ...base, title: "Completed", status: "Done", deadline: addMs(-2 * DAY), notes: "" },
    { ...base, title: "No deadline", status: "To Do", priority: 5, deadline: null },
    // Different project
    { ...base, title: "Beta Only", assignedProject: beta._id, status: "To Do", priority: 3 },
    // Belongs to someone NOT in this manager's team
    {
      title: "Other user task",
      status: "To Do",
      priority: 8,
      assignedProject: alpha._id,
      assignedTeamMembers: [charlie._id],
      createdBy: manager._id,
      deadline: addMs(3 * DAY),
    },
  ]);

  return { now, DAY, manager, team: [alice, bob], outsider: charlie, alpha, beta };
}

/* ---------------------------- Lifecycle ---------------------------- */
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

/* ------------------------------ Tests ------------------------------ */

describe("GET /api/manager/tasks", () => {
  it("400 when team ids are invalid (negative)", async () => {
    const res = await agent.get("/api/manager/tasks").query({ team: "nope,123" });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Invalid team member ids");
  });

  it("returns tasks for all team members & includes details (positive)", async () => {
    const { team } = await seedData();
    const teamParam = team.map((u) => u._id.toString()).join(",");
    const res = await agent.get("/api/manager/tasks").query({ team: teamParam });

    expect(res.statusCode).toBe(200);
    const titles = res.body.items.map((t) => t.title);
    // Does not include outsider's task
    expect(titles).not.toContain("Other user task");
    // Includes 6 tasks belonging to Alice/Bob across projects
    expect(titles.sort()).toEqual(
      ["Overdue A", "Due Today", "Upcoming Low", "Completed", "No deadline", "Beta Only"].sort()
    );

    // Check details for a sample row
    const sample = res.body.items.find((t) => t.title === "Overdue A");
    expect(sample).toMatchObject({
      title: "Overdue A",
      description: "A-desc",
      notes: "A-notes",
      status: "In Progress",
      priority: 7,
      project: "Alpha",
    });
    expect(Array.isArray(sample.team)).toBe(true);
    expect(sample.team.map((m) => m.name).sort()).toEqual(["Alice", "Bob"]);
    // Subtask exists with boundary priority 10
    expect(sample.subtasks[0]).toMatchObject({ title: "Sub High", priority: 10, status: "To Do" });
  });

  it("filters by Status, Priority, Project Name (positive + boundary)", async () => {
    const { team, alpha, beta } = await seedData();
    const teamParam = team.map((u) => u._id.toString()).join(",");

    // Status=To Do
    let res = await agent.get("/api/manager/tasks").query({ team: teamParam, status: "To Do" });
    expect(res.statusCode).toBe(200);
    const statusTitles = res.body.items.map((t) => t.title);
    expect(statusTitles).toEqual(expect.arrayContaining(["Due Today", "Upcoming Low", "No deadline", "Beta Only"]));
    expect(statusTitles).not.toContain("Completed");

    // Priority=10 (boundary; only subtask has it, but filter applies to task priority only)
    res = await agent.get("/api/manager/tasks").query({ team: teamParam, priority: 10 });
    expect(res.statusCode).toBe(200);
    expect(res.body.items).toStrictEqual([]); // parent priority is not 10

    // Priority=6
    res = await agent.get("/api/manager/tasks").query({ team: teamParam, priority: 6 });
    expect(res.statusCode).toBe(200);
    expect(res.body.items.map((t) => t.title)).toEqual(["Due Today"]);

    // Project by name: Alpha
    res = await agent.get("/api/manager/tasks").query({ team: teamParam, project: alpha.name });
    expect(res.statusCode).toBe(200);
    expect(res.body.items.map((t) => t.project)).toEqual(Array(res.body.items.length).fill("Alpha"));

    // Project by name: Beta
    res = await agent.get("/api/manager/tasks").query({ team: teamParam, project: beta.name });
    expect(res.statusCode).toBe(200);
    expect(res.body.items.map((t) => t.title)).toEqual(["Beta Only"]);

    // Non-existent project (negative)
    res = await agent.get("/api/manager/tasks").query({ team: teamParam, project: "DoesNotExist" });
    expect(res.statusCode).toBe(200);
    expect(res.body.items).toStrictEqual([]);
  });

  it("rejects invalid status or priority (negative)", async () => {
    const { team } = await seedData();
    const teamParam = team.map((u) => u._id.toString()).join(",");

    let res = await agent.get("/api/manager/tasks").query({ team: teamParam, status: "WHATEVER" });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Invalid status");

    res = await agent.get("/api/manager/tasks").query({ team: teamParam, priority: "999" });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Invalid priority");
  });

  it('sorts by deadline ascending with "No deadline" last (positive + boundary)', async () => {
    const { team } = await seedData();
    const teamParam = team.map((u) => u._id.toString()).join(",");
  
    const res = await agent
      .get("/api/manager/tasks")
      .query({ team: teamParam, sort: "deadline" });
  
    expect(res.statusCode).toBe(200);
    const items = res.body.items;
  
    // deadlines mapped to numeric, null => Infinity
    const nums = items.map(t => t.deadline ? new Date(t.deadline).getTime() : Infinity);
    const sorted = [...nums].sort((a, b) => a - b);
    expect(nums).toStrictEqual(sorted);
  
    // All null-deadline tasks should be at the tail
    const firstNullIdx = nums.findIndex(n => n === Infinity);
    expect(firstNullIdx).toBeGreaterThan(-1);
  
    const tail = items.slice(firstNullIdx);
    const tailTitles = tail.map(t => t.title).sort();
    // We expect BOTH "No deadline" and "Beta Only" to be there (order not guaranteed)
    expect(tailTitles).toEqual(["Beta Only", "No deadline"].sort());
  
    // And none of the earlier items should have null deadline
    items.slice(0, firstNullIdx).forEach(t => expect(t.deadline).not.toBeNull());
  });
  
});
