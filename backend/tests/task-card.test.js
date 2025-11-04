import express from "express";
import mongoose, { Schema, model } from "mongoose";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

/* ------------------------- Minimal Schemas ------------------------- */
// Reuse existing models if present; otherwise define minimal ones for tests.
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
  Project = model("Project", new Schema({ name: { type: String, required: true } }));
}

let User;
try {
  User = mongoose.model("User");
} catch {
  User = model("User", new Schema({ name: String }));
}

/* --------------------- Inline "manager" router --------------------- */
/**
 * GET /api/manager/tasks/:id
 *   -> Returns one task projected as a "card" view model
 */
function makeRouter() {
  const router = express.Router();

  router.get("/tasks/:id", async (req, res) => {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid task id" });
    }

    const t = await Task.findById(id)
      .populate("assignedProject", "name")
      .populate("assignedTeamMembers", "name")
      .lean();

    if (!t) {
      return res.status(404).json({ error: "Task not found" });
    }

    return res.json({ item: projectRow(t) });
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

let mongod, app, agent;
const BIG_TIMEOUT = 120_000;

async function connectMemoryMongo() {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri, { dbName: "taskcard_testdb" });
}

async function resetDb() {
  const collections = await mongoose.connection.db.listCollections().toArray();
  await Promise.all(
    collections.map((c) => mongoose.connection.db.collection(c.name).deleteMany({}))
  );
}

async function seedTaskFull() {
  const [p, a, b, m] = await Promise.all([
    Project.create({ name: "Alpha" }),
    User.create({ name: "Alice" }),
    User.create({ name: "Bob" }),
    User.create({ name: "Manager" }),
  ]);

  const baseDeadline = new Date("2025-10-20T10:00:00.000Z");
  const task = await Task.create({
    title: "Spec Task",
    description: "Full description",
    notes: "Some notes",
    status: "To Do",
    priority: 8,
    deadline: baseDeadline,
    assignedProject: p._id,
    assignedTeamMembers: [a._id, b._id],
    createdBy: m._id,
    subtasks: [
      { title: "Sub A", status: "To Do", priority: 5, deadline: new Date("2025-10-22T00:00:00.000Z") },
      { title: "Sub B", status: "In Progress", priority: 7, deadline: null },
    ],
  });

  return { task };
}

async function seedTaskBoundary() {
  const p = await Project.create({ name: "Alpha" });
  const t = await Task.create({
    title: "No Deadline/Notes",
    description: "",
    notes: "", // boundary: empty notes
    status: "Done",
    priority: null, // boundary: no priority
    deadline: null, // boundary: no deadline
    assignedProject: p._id,
    assignedTeamMembers: [], // boundary: no team
    subtasks: [],
  });
  return { t };
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

describe("GET /api/manager/tasks/:id (Task Card view model)", () => {
  it("returns full details for a valid task (positive)", async () => {
    const { task } = await seedTaskFull();

    const res = await agent.get(`/api/manager/tasks/${task._id.toString()}`);
    expect(res.statusCode).toBe(200);

    const item = res.body.item;
    expect(item).toMatchObject({
      title: "Spec Task",
      description: "Full description",
      notes: "Some notes",
      status: "To Do",
      priority: 8,
      project: "Alpha",
    });

    // deadline is ISO string
    expect(typeof item.deadline).toBe("string");
    expect(new Date(item.deadline).toISOString()).toBe(item.deadline);

    // team members projected
    const names = item.team.map((m) => m.name).sort();
    expect(names).toEqual(["Alice", "Bob"]);

    // subtasks included
    expect(item.subtasks).toHaveLength(2);
    expect(item.subtasks[0]).toMatchObject({ title: "Sub A", status: "To Do", priority: 5 });
  });

  it("handles boundary fields: null deadline, empty notes, no team (boundary)", async () => {
    const { t } = await seedTaskBoundary();

    const res = await agent.get(`/api/manager/tasks/${t._id.toString()}`);
    expect(res.statusCode).toBe(200);

    const item = res.body.item;
    // null deadline is preserved (frontend can render "No deadline")
    expect(item.deadline).toBeNull();
    // priority may be null if not provided
    expect(item.priority).toBeNull();
    // empty notes allowed
    expect(item.notes).toBe("");
    // no team members -> empty array
    expect(Array.isArray(item.team)).toBe(true);
    expect(item.team).toHaveLength(0);
  });

  it("400 on invalid ObjectId (negative)", async () => {
    const res = await agent.get(`/api/manager/tasks/not-an-objectid`);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Invalid task id");
  });

  it("404 when task not found (negative)", async () => {
    const fake = new mongoose.Types.ObjectId();
    const res = await agent.get(`/api/manager/tasks/${fake.toString()}`);
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe("Task not found");
  });
});
