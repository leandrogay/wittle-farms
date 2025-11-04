import express from "express";
import mongoose, { Schema, model } from "mongoose";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

/* ------------------------- Minimal Schemas ------------------------- */

let User, Department, Project;

try { User = mongoose.model("User"); } catch {
  User = model("User", new Schema({ name: String }, { timestamps: true }));
}

try { Department = mongoose.model("Department"); } catch {
  Department = model("Department", new Schema({ name: { type: String, required: true } }));
}

try { Project = mongoose.model("Project"); } catch {
  Project = model(
    "Project",
    new Schema(
      {
        name: { type: String, required: true },
        description: String,
        priority: { type: String, enum: ["Low", "Medium", "High"], default: "Medium" },
        visibility: { type: String, enum: ["Private", "Team", "Org"], default: "Team" },
        projectLead: { type: mongoose.Types.ObjectId, ref: "User", required: true },
        teamMembers: [{ type: mongoose.Types.ObjectId, ref: "User", required: true }],
        department: [{ type: mongoose.Types.ObjectId, ref: "Department", required: true }],
        startDate: { type: Date, required: true },
        endDate: { type: Date },
        deadline: { type: Date },
        createdBy: { type: mongoose.Types.ObjectId, ref: "User", required: true },
      },
      { timestamps: true }
    )
  );
}

/* --------------------- Router (Create + Get one) --------------------- */

function projectRow(p) {
  return {
    id: String(p._id),
    name: p.name,
    description: p.description ?? "",
    priority: p.priority ?? "Medium",
    visibility: p.visibility ?? "Team",
    projectLead: p.projectLead ? { id: String(p.projectLead._id), name: p.projectLead.name ?? "" } : null,
    teamMembers: (p.teamMembers || []).map(u => ({ id: String(u._id), name: u.name ?? "" })),
    departments: (p.department || []).map(d => ({ id: String(d._id), name: d.name })),
    startDate: p.startDate ? new Date(p.startDate).toISOString() : null,
    endDate: p.endDate ? new Date(p.endDate).toISOString() : null,
    deadline: p.deadline ? new Date(p.deadline).toISOString() : null,
    createdBy: p.createdBy ? String(p.createdBy._id ?? p.createdBy) : null,
  };
}

function makeRouter() {
  const router = express.Router();

  router.get("/projects/:id", async (req, res) => {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Invalid project id" });

    const doc = await Project.findById(id)
      .populate("projectLead", "name")
      .populate("teamMembers", "name")
      .populate("department", "name")
      .lean();

    if (!doc) return res.status(404).json({ error: "Project not found" });
    return res.json({ item: projectRow(doc) });
  });

  router.post("/projects", async (req, res) => {
    try {
      const payload = req.body || {};
      const {
        name,
        description = "",
        priority = "Medium",
        visibility = "Team",
        projectLead,
        teamMembers,
        startDate,
        endDate,
        deadline,
        departmentIds,
        department,
        departments,
        departmentId,
        createdBy,
      } = payload;

      if (!name || typeof name !== "string" || !name.trim())
        return res.status(400).json({ error: "Project name is required" });

      // normalize departments
      let deptIds = [];
      if (Array.isArray(departmentIds)) deptIds = departmentIds;
      else if (Array.isArray(department)) deptIds = department;
      else if (Array.isArray(departments)) deptIds = departments;
      else if (departmentId) deptIds = [departmentId];
      if (!deptIds.length)
        return res.status(400).json({ error: "At least one department is required" });

      for (const id of deptIds) {
        if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Invalid department id" });
      }
      const deptCount = await Department.countDocuments({ _id: { $in: deptIds } });
      if (deptCount !== deptIds.length) return res.status(400).json({ error: "Department not found" });

      if (!projectLead || !mongoose.isValidObjectId(projectLead))
        return res.status(400).json({ error: "Invalid project lead" });

      if (!Array.isArray(teamMembers) || teamMembers.length === 0)
        return res.status(400).json({ error: "Team members are required" });

      for (const uid of teamMembers) {
        if (!mongoose.isValidObjectId(uid)) return res.status(400).json({ error: "Invalid team member id" });
      }

      if (!teamMembers.map(String).includes(String(projectLead)))
        return res.status(400).json({ error: "Project lead must be included in team members" });

      const usersCount = await User.countDocuments({ _id: { $in: teamMembers.concat([projectLead]) } });
      const uniqueIds = new Set(teamMembers.concat([projectLead]).map(String));
      if (usersCount !== uniqueIds.size) return res.status(400).json({ error: "User not found" });

      const allowedPriority = ["Low", "Medium", "High"];
      const allowedVisibility = ["Private", "Team", "Org"];
      if (!allowedPriority.includes(priority)) return res.status(400).json({ error: "Invalid priority" });
      if (!allowedVisibility.includes(visibility)) return res.status(400).json({ error: "Invalid visibility" });

      if (!startDate) return res.status(400).json({ error: "Start date is required" });
      const start = new Date(startDate);
      if (Number.isNaN(start.getTime())) return res.status(400).json({ error: "Invalid start date" });

      let end = null;
      if (endDate) {
        end = new Date(endDate);
        if (Number.isNaN(end.getTime())) return res.status(400).json({ error: "Invalid end date" });
        if (end.getTime() < start.getTime())
          return res.status(400).json({ error: "End date cannot be earlier than start date" });
      }

      let dl = null;
      if (deadline) {
        dl = new Date(deadline);
        if (Number.isNaN(dl.getTime())) return res.status(400).json({ error: "Invalid deadline" });
      }

      if (!createdBy || !mongoose.isValidObjectId(createdBy))
        return res.status(400).json({ error: "Invalid createdBy" });

      const created = await Project.create({
        name: name.trim(),
        description,
        priority,
        visibility,
        projectLead,
        teamMembers,
        department: deptIds,
        startDate: start,
        endDate: end,
        deadline: dl,
        createdBy,
      });

      const doc = await Project.findById(created._id)
        .populate("projectLead", "name")
        .populate("teamMembers", "name")
        .populate("department", "name")
        .lean();

      return res.status(201).json({ item: projectRow(doc) });
    } catch (err) {
      return res.status(500).json({ error: "Server error", detail: String(err?.message || err) });
    }
  });

  return router;
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
  await mongoose.connect(mongod.getUri(), { dbName: "create_project_testdb" });
}

async function resetDb() {
  const cols = await mongoose.connection.db.listCollections().toArray();
  await Promise.all(cols.map(c => mongoose.connection.db.collection(c.name).deleteMany({})));
}

async function seedRefs() {
  const [mgr, alice, bob] = await Promise.all([
    User.create({ name: "Manager" }),
    User.create({ name: "Alice" }),
    User.create({ name: "Bob" }),
  ]);
  const [eng, ops] = await Promise.all([
    Department.create({ name: "Engineering" }),
    Department.create({ name: "Operations" }),
  ]);
  return { mgr, alice, bob, eng, ops };
}

/* ---------------------------- Lifecycle ---------------------------- */

beforeAll(async () => {
  await connectMemoryMongo();
  app = makeApp();

  // --- attach minimal tasks-by-project route here ---
  let TaskLocal;
  try { TaskLocal = mongoose.model("Task"); } catch {
    TaskLocal = model(
      "Task",
      new Schema({
        title: { type: String, required: true },
        status: { type: String, enum: ["To Do", "In Progress", "Done"], required: true },
        assignedProject: { type: mongoose.Types.ObjectId, ref: "Project", required: true },
        subtasks: [{
          title: String,
          status: { type: String, enum: ["To Do", "In Progress", "Done"] },
        }],
      })
    );
  }

  app.get("/api/manager/projects/:id/tasks", async (req, res) => {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Invalid project id" });
    const rows = await TaskLocal.find({ assignedProject: id }).lean();
    res.json({
      items: rows.map(t => ({
        id: String(t._id),
        title: t.title,
        status: t.status,
        subtaskCount: (t.subtasks || []).length,
      })),
    });
  });
  // --- end helper route ---

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

describe("POST /api/manager/projects (Create Project)", () => {
  it("creates a project with full payload (positive)", async () => {
    const { mgr, alice, bob, eng, ops } = await seedRefs();

    const res = await agent.post("/api/manager/projects").send({
      name: "Q4 Website Revamp",
      description: "Revamp marketing site",
      priority: "High",
      visibility: "Team",
      projectLead: alice._id.toString(),
      teamMembers: [alice._id.toString(), bob._id.toString()],
      startDate: "2025-10-15T00:00:00.000Z",
      endDate: "2025-12-31T00:00:00.000Z",
      deadline: "2025-12-15T10:00:00.000Z",
      departmentIds: [eng._id.toString(), ops._id.toString()],
      createdBy: mgr._id.toString(),
    });

    expect(res.statusCode).toBe(201);
    const item = res.body.item;
    expect(item.name).toBe("Q4 Website Revamp");
    expect(item.description).toBe("Revamp marketing site");
    expect(item.projectLead.name).toBe("Alice");
  });

  it("creates with minimal payload (boundary)", async () => {
    const { mgr, alice, eng } = await seedRefs();

    const res = await agent.post("/api/manager/projects").send({
      name: "Boundary Project",
      department: [eng._id.toString()],
      projectLead: alice._id.toString(),
      teamMembers: [alice._id.toString()],
      startDate: "2025-10-15",
      createdBy: mgr._id.toString(),
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.item.priority).toBe("Medium");
  });

  it("rejects invalid or missing fields (negative)", async () => {
    const { mgr, alice, bob, eng } = await seedRefs();

    // missing name
    let r = await agent.post("/api/manager/projects").send({
      departmentIds: [eng._id.toString()],
      projectLead: alice._id.toString(),
      teamMembers: [alice._id.toString()],
      startDate: "2025-10-15",
      createdBy: mgr._id.toString(),
    });
    expect(r.statusCode).toBe(400);
    expect(r.body.error).toBe("Project name is required");

    // lead not in team
    r = await agent.post("/api/manager/projects").send({
      name: "X",
      departmentIds: [eng._id.toString()],
      projectLead: alice._id.toString(),
      teamMembers: [bob._id.toString()],
      startDate: "2025-10-15",
      createdBy: mgr._id.toString(),
    });
    expect(r.statusCode).toBe(400);
    expect(r.body.error).toBe("Project lead must be included in team members");
  });

  it("links tasks & subtasks to a project and can retrieve them (linkage acceptance)", async () => {
    const { mgr, alice, eng } = await seedRefs();

    // create project
    const p = await agent.post("/api/manager/projects").send({
      name: "Linkage Project",
      department: [eng._id.toString()],
      projectLead: alice._id.toString(),
      teamMembers: [alice._id.toString()],
      startDate: "2025-10-15T00:00:00.000Z",
      createdBy: mgr._id.toString(),
    });
    expect(p.statusCode).toBe(201);
    const projectId = p.body.item.id;

    // create tasks
    const TaskLocal = mongoose.model("Task");
    await TaskLocal.create({
      title: "Parent Task A",
      status: "To Do",
      assignedProject: projectId,
      subtasks: [
        { title: "Sub 1", status: "To Do" },
        { title: "Sub 2", status: "In Progress" },
      ],
    });
    await TaskLocal.create({
      title: "Parent Task B",
      status: "Done",
      assignedProject: projectId,
      subtasks: [],
    });

    // fetch tasks
    const res = await agent.get(`/api/manager/projects/${projectId}/tasks`);
    expect(res.statusCode).toBe(200);
    expect(res.body.items).toHaveLength(2);
    const byTitle = Object.fromEntries(res.body.items.map(i => [i.title, i]));
    expect(byTitle["Parent Task A"].subtaskCount).toBe(2);
    expect(byTitle["Parent Task B"].subtaskCount).toBe(0);
  });
});
