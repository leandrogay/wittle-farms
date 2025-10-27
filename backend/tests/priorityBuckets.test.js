import { describe, it, beforeAll, afterAll, beforeEach, expect } from "vitest";
import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import User from "../models/User.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";

let mongo;
let app;
const STRONG = "StrongPass123!";

// ---------- tiny auth helper for tests ----------
// Set req.user from header "x-user-id"
async function fakeAuth(req, _res, next) {
  const id = req.header("x-user-id");
  if (id) {
    const user = await User.findById(id).lean();
    if (user) req.user = { _id: user._id, role: user.role, name: user.name, email: user.email };
  }
  next();
}

// ---------- mount test-only routes ----------
function mountPriorityRoutes() {
  const router = express.Router();

  // Create task with priority (1..10)
  router.post("/tasks", async (req, res) => {
    try {
      const { title, assignedProject, assignedTeamMembers = [], status = "In Progress", priority } = req.body;
      const createdBy = req.user?._id;

      if (!title || !assignedProject || !createdBy) {
        return res.status(400).json({ error: "title, assignedProject, and auth user are required" });
      }

      // Validate priority range
      if (typeof priority !== "number" || !Number.isInteger(priority) || priority < 1 || priority > 10) {
        return res.status(400).json({ error: "priority must be an integer between 1 and 10" });
      }

      const task = await Task.create({
        title,
        assignedProject,
        assignedTeamMembers,
        status,
        createdBy,
        priority, // store straight on the doc
      });

      res.status(201).json({ item: { _id: task._id, title: task.title, priority: task.priority } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // Update priority any time by staff assignee or project owner (manager)
  router.patch("/tasks/:id/priority", async (req, res) => {
    try {
      const { id } = req.params;
      const { priority } = req.body;
      const userId = req.user?._id;

      if (!userId) return res.status(401).json({ error: "Auth required" });

      if (typeof priority !== "number" || !Number.isInteger(priority) || priority < 1 || priority > 10) {
        return res.status(400).json({ error: "priority must be an integer between 1 and 10" });
      }

      const task = await Task.findById(id).lean();
      if (!task) return res.status(404).json({ error: "Task not found" });

      const project = await Project.findById(task.assignedProject).select("createdBy").lean();
      const isProjectOwner = project && String(project.createdBy) === String(userId);
      const isAssignee = (task.assignedTeamMembers || []).some(uid => String(uid) === String(userId));

      if (!isProjectOwner && !isAssignee) {
        return res.status(403).json({ error: "Not allowed to update priority for this task" });
      }

      const updated = await Task.findByIdAndUpdate(id, { $set: { priority } }, { new: true }).lean();
      res.status(200).json({ item: { _id: updated._id, title: updated.title, priority: updated.priority } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // Taskboard view: list tasks for a project with title + priority (quick reference)
  router.get("/taskboard", async (req, res) => {
    try {
      const { project: projectId } = req.query;
      if (!projectId) return res.status(400).json({ error: "project query param is required" });

      const tasks = await Task.find({ assignedProject: projectId })
        .select("title priority status")
        .sort({ priority: -1, title: 1 })
        .lean();

      const items = tasks.map(t => ({ _id: t._id, title: t.title, priority: t.priority ?? null, status: t.status }));
      res.status(200).json({ items });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  app.use("/api", router);
}

describe("(Staff/Manager) Priority Buckets to Tasks", () => {
  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(fakeAuth);
    mountPriorityRoutes();

    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri(), { dbName: "e2e-priority-buckets" });
  });

  afterAll(async () => {
    try { await mongoose.connection.dropDatabase(); } catch {}
    try { await mongoose.connection.close(); } catch {}
    try { await mongo.stop(); } catch {}
  });

  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Project.deleteMany({}), Task.deleteMany({})]);
  });

  it("Staff can set a valid priority (1..10) on creation; taskboard shows it", async () => {
    const manager = await User.create({ name: "Mgr", email: "m@ex.com", role: "Manager", password: STRONG });
    const staff = await User.create({ name: "Staff", email: "s@ex.com", role: "Staff", password: STRONG });
    const project = await Project.create({ name: "Alpha", createdBy: manager._id });

    // Create task with priority 7 (valid)
    const resCreate = await request(app)
      .post("/api/tasks")
      .set("x-user-id", staff._id.toString()) // creator is staff
      .send({
        title: "Prepare dashboard",
        assignedProject: project._id,
        assignedTeamMembers: [staff._id],
        status: "In Progress",
        priority: 7,
      })
      .expect(201);

    expect(resCreate.body.item.priority).toBe(7);

    // Taskboard quick view
    const resBoard = await request(app)
      .get(`/api/taskboard?project=${project._id}`)
      .set("x-user-id", staff._id.toString())
      .expect(200);

    const items = resBoard.body.items;
    expect(items.length).toBe(1);
    expect(items[0].title).toBe("Prepare dashboard");
    expect(items[0].priority).toBe(7);
  });

  it("🟨 Boundary: accepts 1 and 10", async () => {
    const manager = await User.create({ name: "Mgr", email: "m@ex.com", role: "Manager", password: STRONG });
    const staff = await User.create({ name: "Staff", email: "s@ex.com", role: "Staff", password: STRONG });
    const project = await Project.create({ name: "Beta", createdBy: manager._id });

    // priority 1
    const t1 = await request(app)
      .post("/api/tasks")
      .set("x-user-id", staff._id.toString())
      .send({
        title: "Low prio task",
        assignedProject: project._id,
        assignedTeamMembers: [staff._id],
        status: "In Progress",
        priority: 1,
      })
      .expect(201);
    expect(t1.body.item.priority).toBe(1);

    // priority 10
    const t2 = await request(app)
      .post("/api/tasks")
      .set("x-user-id", staff._id.toString())
      .send({
        title: "Urgent task",
        assignedProject: project._id,
        assignedTeamMembers: [staff._id],
        status: "In Progress",
        priority: 10,
      })
      .expect(201);
    expect(t2.body.item.priority).toBe(10);

    // Taskboard lists both with their priorities
    const resBoard = await request(app)
      .get(`/api/taskboard?project=${project._id}`)
      .set("x-user-id", staff._id.toString())
      .expect(200);

    const titles = resBoard.body.items.map(i => i.title);
    expect(titles).toEqual(expect.arrayContaining(["Low prio task", "Urgent task"]));
    const prios = resBoard.body.items.map(i => i.priority);
    expect(prios).toEqual(expect.arrayContaining([1, 10]));
  });

  it("Creation fails when priority is out of range or non-integer", async () => {
    const manager = await User.create({ name: "Mgr", email: "m@ex.com", role: "Manager", password: STRONG });
    const staff = await User.create({ name: "Staff", email: "s@ex.com", role: "Staff", password: STRONG });
    const project = await Project.create({ name: "Gamma", createdBy: manager._id });

    // 0 -> invalid
    await request(app)
      .post("/api/tasks")
      .set("x-user-id", staff._id.toString())
      .send({
        title: "Invalid prio 0",
        assignedProject: project._id,
        status: "In Progress",
        priority: 0,
      })
      .expect(400);

    // 11 -> invalid
    await request(app)
      .post("/api/tasks")
      .set("x-user-id", staff._id.toString())
      .send({
        title: "Invalid prio 11",
        assignedProject: project._id,
        status: "In Progress",
        priority: 11,
      })
      .expect(400);

    // 5.5 -> invalid (non-integer)
    await request(app)
      .post("/api/tasks")
      .set("x-user-id", staff._id.toString())
      .send({
        title: "Invalid prio float",
        assignedProject: project._id,
        status: "In Progress",
        priority: 5.5,
      })
      .expect(400);
  });

  it("Staff assignee can edit priority at any time; persists", async () => {
    const manager = await User.create({ name: "Mgr", email: "m@ex.com", role: "Manager", password: STRONG });
    const staff = await User.create({ name: "Staff", email: "s@ex.com", role: "Staff", password: STRONG });
    const project = await Project.create({ name: "Delta", createdBy: manager._id });

    const task = await Task.create({
      title: "Refactor ETL",
      assignedProject: project._id,
      assignedTeamMembers: [staff._id],
      status: "In Progress",
      createdBy: staff._id,
      priority: 3,
    });

    const res = await request(app)
      .patch(`/api/tasks/${task._id}/priority`)
      .set("x-user-id", staff._id.toString())
      .send({ priority: 9 })
      .expect(200);

    expect(res.body.item.priority).toBe(9);

    const fetched = await Task.findById(task._id).lean();
    expect(fetched.priority).toBe(9);
  });

  it("Manager (project owner) can edit priority too", async () => {
    const manager = await User.create({ name: "Mgr", email: "m@ex.com", role: "Manager", password: STRONG });
    const staff = await User.create({ name: "Staff", email: "s@ex.com", role: "Staff", password: STRONG });
    const project = await Project.create({ name: "Epsilon", createdBy: manager._id });

    const task = await Task.create({
      title: "Vendor follow-up",
      assignedProject: project._id,
      assignedTeamMembers: [staff._id],
      status: "In Progress",
      createdBy: manager._id,
      priority: 4,
    });

    const res = await request(app)
      .patch(`/api/tasks/${task._id}/priority`)
      .set("x-user-id", manager._id.toString())
      .send({ priority: 8 })
      .expect(200);

    expect(res.body.item.priority).toBe(8);
  });

  it("Unauthorized user cannot edit priority", async () => {
    const manager = await User.create({ name: "Mgr", email: "m@ex.com", role: "Manager", password: STRONG });
    const staff = await User.create({ name: "Staff", email: "s@ex.com", role: "Staff", password: STRONG });
    const stranger = await User.create({ name: "Other", email: "o@ex.com", role: "Staff", password: STRONG });
    const project = await Project.create({ name: "Zeta", createdBy: manager._id });

    const task = await Task.create({
      title: "Reconcile invoices",
      assignedProject: project._id,
      assignedTeamMembers: [staff._id],
      status: "In Progress",
      createdBy: manager._id,
      priority: 6,
    });

    await request(app)
      .patch(`/api/tasks/${task._id}/priority`)
      .set("x-user-id", stranger._id.toString())
      .send({ priority: 2 })
      .expect(403);

    const after = await Task.findById(task._id).lean();
    expect(after.priority).toBe(6);
  });
});
