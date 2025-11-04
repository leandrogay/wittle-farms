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
        createdBy: { type: mongoose.Types.ObjectId, ref: "User" },
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

/* --------------------- Inline router (create/update) --------------------- */
/**
 * POST /api/manager/tasks
 * PUT  /api/manager/tasks/:id
 * GET  /api/manager/tasks/:id  (for assertions)
 */
function makeRouter() {
  const router = express.Router();

  router.get("/tasks/:id", async (req, res) => {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Invalid task id" });
    const t = await Task.findById(id)
      .populate("assignedProject", "name")
      .populate("assignedTeamMembers", "name")
      .lean();
    if (!t) return res.status(404).json({ error: "Task not found" });
    return res.json({ item: projectRow(t) });
  });

  router.post("/tasks", async (req, res) => {
    try {
      const payload = req.body || {};

      // Basic validations
      if (!payload.title || typeof payload.title !== "string") {
        return res.status(400).json({ error: "Title is required" });
      }
      const allowed = ["To Do", "In Progress", "Done"];
      if (!payload.status || !allowed.includes(payload.status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      if (payload.priority !== undefined && payload.priority !== null) {
        const p = Number(payload.priority);
        if (!Number.isInteger(p) || p < 1 || p > 10) {
          return res.status(400).json({ error: "Invalid priority" });
        }
      }

      // Validate project id if provided
      if (payload.assignedProject) {
        if (!mongoose.isValidObjectId(payload.assignedProject)) {
          return res.status(400).json({ error: "Invalid project id" });
        }
        const exists = await Project.exists({ _id: payload.assignedProject });
        if (!exists) return res.status(400).json({ error: "Project not found" });
      }

      // Validate team members if provided
      if (payload.assignedTeamMembers) {
        const ids = payload.assignedTeamMembers;
        if (!Array.isArray(ids)) return res.status(400).json({ error: "Invalid team members" });
        for (const id of ids) {
          if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Invalid team member id" });
        }
        const count = await User.countDocuments({ _id: { $in: ids } });
        if (count !== ids.length) return res.status(400).json({ error: "Team member not found" });
      }

      const created = await Task.create(payload);
      const t = await Task.findById(created._id)
        .populate("assignedProject", "name")
        .populate("assignedTeamMembers", "name")
        .lean();

      return res.status(201).json({ item: projectRow(t) });
    } catch (err) {
      return res.status(500).json({ error: "Server error", detail: String(err?.message || err) });
    }
  });

  router.put("/tasks/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const payload = req.body || {};

      if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Invalid task id" });

      if (payload.status !== undefined) {
        const allowed = ["To Do", "In Progress", "Done"];
        if (!allowed.includes(payload.status)) {
          return res.status(400).json({ error: "Invalid status" });
        }
      }
      if (payload.priority !== undefined && payload.priority !== null) {
        const p = Number(payload.priority);
        if (!Number.isInteger(p) || p < 1 || p > 10) {
          return res.status(400).json({ error: "Invalid priority" });
        }
      }
      if (payload.assignedProject !== undefined) {
        if (payload.assignedProject && !mongoose.isValidObjectId(payload.assignedProject)) {
          return res.status(400).json({ error: "Invalid project id" });
        }
        if (payload.assignedProject) {
          const exists = await Project.exists({ _id: payload.assignedProject });
          if (!exists) return res.status(400).json({ error: "Project not found" });
        }
      }
      if (payload.assignedTeamMembers !== undefined) {
        const ids = payload.assignedTeamMembers;
        if (!Array.isArray(ids)) return res.status(400).json({ error: "Invalid team members" });
        for (const uid of ids) {
          if (!mongoose.isValidObjectId(uid)) return res.status(400).json({ error: "Invalid team member id" });
        }
        const count = await User.countDocuments({ _id: { $in: ids } });
        if (count !== ids.length) return res.status(400).json({ error: "Team member not found" });
      }

      const updated = await Task.findByIdAndUpdate(id, payload, { new: true, runValidators: true })
        .populate("assignedProject", "name")
        .populate("assignedTeamMembers", "name")
        .lean();

      if (!updated) return res.status(404).json({ error: "Task not found" });
      return res.json({ item: projectRow(updated) });
    } catch (err) {
      return res.status(500).json({ error: "Server error", detail: String(err?.message || err) });
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

let mongod, app, agent;
const BIG_TIMEOUT = 120_000;

async function connectMemoryMongo() {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri, { dbName: "taskform_testdb" });
}

async function resetDb() {
  const collections = await mongoose.connection.db.listCollections().toArray();
  await Promise.all(
    collections.map((c) => mongoose.connection.db.collection(c.name).deleteMany({}))
  );
}

async function seedRefs() {
  const [alpha, mgr, alice, bob] = await Promise.all([
    Project.create({ name: "Alpha" }),
    User.create({ name: "Manager" }),
    User.create({ name: "Alice" }),
    User.create({ name: "Bob" }),
  ]);
  return { alpha, mgr, alice, bob };
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

describe("TaskForm API seam (create/update)", () => {
  it("creates a task with full fields (positive)", async () => {
    const { alpha, mgr, alice, bob } = await seedRefs();
    const payload = {
      title: "Create via Form",
      description: "desc",
      notes: "note",
      status: "To Do",
      priority: 6,
      deadline: "2025-10-20T10:00:00.000Z",
      assignedProject: alpha._id.toString(),
      assignedTeamMembers: [alice._id.toString(), bob._id.toString()],
      createdBy: mgr._id.toString(),
    };

    const res = await agent.post("/api/manager/tasks").send(payload);
    expect(res.statusCode).toBe(201);
    const item = res.body.item;

    expect(item).toMatchObject({
      title: "Create via Form",
      description: "desc",
      notes: "note",
      status: "To Do",
      priority: 6,
      project: "Alpha",
    });
    // projected team names
    expect(item.team.map((t) => t.name).sort()).toEqual(["Alice", "Bob"]);
    // deadline ISO
    expect(new Date(item.deadline).toISOString()).toBe("2025-10-20T10:00:00.000Z");

    // Confirm persisted
    const getRes = await agent.get(`/api/manager/tasks/${item.id}`);
    expect(getRes.statusCode).toBe(200);
    expect(getRes.body.item.title).toBe("Create via Form");
  });

  it("creates with boundary payload (minimal fields; nullables) (boundary)", async () => {
    const { alpha } = await seedRefs();
    const res = await agent.post("/api/manager/tasks").send({
      title: "Boundary Task",
      status: "To Do",
      assignedProject: alpha._id.toString(),
      // no team, no notes, no description, no priority, no deadline
    });
    expect(res.statusCode).toBe(201);
    const item = res.body.item;
    expect(item.notes).toBe(""); // default to empty string on projection
    expect(item.description).toBe("");
    expect(item.priority).toBeNull();
    expect(item.deadline).toBeNull();
    expect(item.team).toHaveLength(0);
    expect(item.project).toBe("Alpha");
  });

  it("rejects invalid status / priority / ids (negative)", async () => {
    const { alpha, alice } = await seedRefs();

    // invalid status
    let res = await agent.post("/api/manager/tasks").send({
      title: "X",
      status: "SOMETHING",
      assignedProject: alpha._id.toString(),
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Invalid status");

    // invalid priority
    res = await agent.post("/api/manager/tasks").send({
      title: "X",
      status: "To Do",
      priority: 11,
      assignedProject: alpha._id.toString(),
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Invalid priority");

    // invalid project id
    res = await agent.post("/api/manager/tasks").send({
      title: "X",
      status: "To Do",
      assignedProject: "not-an-id",
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Invalid project id");

    // invalid team member id
    res = await agent.post("/api/manager/tasks").send({
      title: "X",
      status: "To Do",
      assignedProject: alpha._id.toString(),
      assignedTeamMembers: ["nope", alice._id.toString()],
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Invalid team member id");

    // non-existent project
    const fakeProj = new mongoose.Types.ObjectId().toString();
    res = await agent.post("/api/manager/tasks").send({
      title: "X",
      status: "To Do",
      assignedProject: fakeProj,
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Project not found");
  });

  it("updates an existing task (positive)", async () => {
    const { alpha, mgr, alice } = await seedRefs();
    const create = await agent.post("/api/manager/tasks").send({
      title: "To Update",
      status: "To Do",
      assignedProject: alpha._id.toString(),
      assignedTeamMembers: [alice._id.toString()],
      createdBy: mgr._id.toString(),
    });
    expect(create.statusCode).toBe(201);
    const id = create.body.item.id;

    const upd = await agent.put(`/api/manager/tasks/${id}`).send({
      title: "Updated Title",
      priority: 9,
      notes: "updated notes",
      status: "In Progress",
    });
    expect(upd.statusCode).toBe(200);
    expect(upd.body.item).toMatchObject({
      title: "Updated Title",
      priority: 9,
      notes: "updated notes",
      status: "In Progress",
    });

    // verify persisted
    const again = await agent.get(`/api/manager/tasks/${id}`);
    expect(again.statusCode).toBe(200);
    expect(again.body.item.title).toBe("Updated Title");
  });

  it("rejects bad updates (negative)", async () => {
    const { alpha } = await seedRefs();

    // invalid task id
    let res = await agent.put(`/api/manager/tasks/not-an-id`).send({ title: "X" });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Invalid task id");

    // not found
    const fake = new mongoose.Types.ObjectId().toString();
    res = await agent.put(`/api/manager/tasks/${fake}`).send({ title: "X" });
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe("Task not found");

    // invalid status
    const create = await agent.post("/api/manager/tasks").send({
      title: "For Bad Update",
      status: "To Do",
      assignedProject: alpha._id.toString(),
    });
    const id = create.body.item.id;

    res = await agent.put(`/api/manager/tasks/${id}`).send({ status: "BAD" });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Invalid status");

    // invalid priority
    res = await agent.put(`/api/manager/tasks/${id}`).send({ priority: 0 });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Invalid priority");
  });
});
