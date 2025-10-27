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
let agent;

const STRONG = "StrongPass123!";

// ---------- tiny helper: project row shape used in responses ----------
function projectRow(t) {
  return {
    _id: t._id,
    title: t.title,
    status: t.status,
    deadline: t.deadline ?? null,
    priority: typeof t.priority === "number" ? t.priority : null,
    project: t.assignedProject ? { _id: t.assignedProject._id, name: t.assignedProject.name } : null,
    assignees: (t.assignedTeamMembers || []).map((m) => ({ _id: m._id, name: m.name })),
  };
}

// ---------- inline router for tests (no server.js needed) ----------
function makeRouter() {
  const router = express.Router();

  // GET /api/manager/tasks?team=ID,ID[&priority=INT][&sort=deadline]
  router.get("/manager/tasks", async (req, res) => {
    try {
      const { team = "", priority, sort } = req.query;

      // Team filter (members in CSV)
      const teamIds = String(team)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (teamIds.length === 0) {
        return res.status(400).json({ error: "team query param (CSV of user IDs) is required" });
      }

      const filter = {
        assignedTeamMembers: { $in: teamIds },
      };

      // Optional: filter by exact priority bucket (1..10)
      if (priority !== undefined) {
        const p = Number(priority);
        if (!Number.isInteger(p) || p < 1 || p > 10) {
          return res.status(400).json({ error: "priority must be an integer 1..10" });
        }
        filter.priority = p;
      }

      // Build query (we'll sort in-memory to handle null-last, multi-key)
      let cursor = Task.find(filter)
        .populate("assignedProject", "name")
        .populate("assignedTeamMembers", "name")
        .lean();

      if (sort === "deadline") {
        const data = await cursor.exec();
        // Sort by earliest deadline first; nulls last
        data.sort((a, b) => {
          const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
          const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
          if (da !== db) return da - db;
          // tie-breaker: higher priority first, then title
          const pa = typeof a.priority === "number" ? a.priority : -Infinity;
          const pb = typeof b.priority === "number" ? b.priority : -Infinity;
          if (pb !== pa) return pb - pa;
          return String(a.title).localeCompare(String(b.title));
        });
        return res.json({ items: data.map(projectRow) });
      }

      // DEFAULT: sort by priority desc (most important → least), nulls last, then title asc
      const data = await cursor.exec();
      data.sort((a, b) => {
        const pa = typeof a.priority === "number" ? a.priority : -Infinity; // -Inf ⇒ goes last
        const pb = typeof b.priority === "number" ? b.priority : -Infinity;
        if (pb !== pa) return pb - pa;       // desc
        // tie-breaker (stable): title asc
        return String(a.title).localeCompare(String(b.title));
      });

      res.json({ items: data.map(projectRow) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  return router;
}

// ---------- seed data used in tests ----------
async function seedData() {
  const mgr = await User.create({ name: "Mgr", email: "m@ex.com", role: "Manager", password: STRONG });
  const alpha = await Project.create({ name: "Ops Alpha", createdBy: mgr._id });

  const a = await User.create({ name: "Alice", email: "a@ex.com", role: "Staff", password: STRONG });
  const b = await User.create({ name: "Bob", email: "b@ex.com", role: "Staff", password: STRONG });

  // Tasks use a spread of priorities / deadlines / statuses
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  await Task.create([
    {
      title: "Overdue A",
      assignedProject: alpha._id,
      assignedTeamMembers: [a._id],
      status: "In Progress",
      deadline: new Date(now - day), // yesterday
      priority: 7,
      createdBy: mgr._id,
    },
    {
      title: "Due Today",
      assignedProject: alpha._id,
      assignedTeamMembers: [a._id],
      status: "In Progress",
      deadline: new Date(now), // today
      priority: 6,
      createdBy: mgr._id,
    },
    {
      title: "No deadline",
      assignedProject: alpha._id,
      assignedTeamMembers: [a._id],
      status: "In Progress",
      // no deadline
      priority: 5,
      createdBy: mgr._id,
    },
    {
      title: "Beta Only",
      assignedProject: alpha._id,
      assignedTeamMembers: [b._id], // only Bob
      status: "In Progress",
      deadline: new Date(now + 2 * day),
      priority: 3,
      createdBy: mgr._id,
    },
    {
      title: "Upcoming Low",
      assignedProject: alpha._id,
      assignedTeamMembers: [a._id],
      status: "In Progress",
      deadline: new Date(now + 3 * day),
      priority: 2,
      createdBy: mgr._id,
    },
    {
      title: "Completed",
      assignedProject: alpha._id,
      assignedTeamMembers: [a._id],
      status: "Done",
      // priority not set (null)
      createdBy: mgr._id,
    },
  ]);

  return { mgr, project: alpha, team: [a, b] };
}

// ---------- test suite ----------
describe("Task Board (Manager) — Priority grouping & sorting", () => {
  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use("/api", makeRouter());
    agent = request(app);

    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri(), { dbName: "e2e-taskboard-priority" });
  });

  afterAll(async () => {
    try { await mongoose.connection.dropDatabase(); } catch {}
    try { await mongoose.connection.close(); } catch {}
    try { await mongo.stop(); } catch {}
  });

  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Project.deleteMany({}), Task.deleteMany({})]);
  });

  it("Staff can filter tasks by a priority bucket", async () => {
    const { team } = await seedData();
    const teamParam = team.map((u) => u._id.toString()).join(",");

    // Filter by priority=6 (should return only "Due Today" for Alice)
    const res = await agent
      .get("/api/manager/tasks")
      .query({ team: teamParam, priority: 6 });

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    const titles = res.body.items.map((i) => i.title);
    expect(titles).toEqual(["Due Today"]);
    expect(res.body.items[0].priority).toBe(6);
  });

  it("rejects invalid priority filter (non-integer / out of range)", async () => {
    const { team } = await seedData();
    const teamParam = team.map((u) => u._id.toString()).join(",");

    await agent.get("/api/manager/tasks").query({ team: teamParam, priority: 0 }).expect(400);
    await agent.get("/api/manager/tasks").query({ team: teamParam, priority: 11 }).expect(400);
    await agent.get("/api/manager/tasks").query({ team: teamParam, priority: "abc" }).expect(400);
  });

  it("By default, tasks are sorted by priority (most → least), null priorities last", async () => {
    const { team } = await seedData();
    const teamParam = team.map((u) => u._id.toString()).join(",");

    const res = await agent.get("/api/manager/tasks").query({ team: teamParam });
    expect(res.statusCode).toBe(200);

    const rows = res.body.items.map(({ title, priority }) => ({ title, priority }));
    // Expected order from seed:
    // Overdue A (7), Due Today (6), No deadline (5), Beta Only (3), Upcoming Low (2), Completed (null)
    expect(rows.map((r) => r.title)).toEqual([
      "Overdue A",
      "Due Today",
      "No deadline",
      "Beta Only",
      "Upcoming Low",
      "Completed",
    ]);
    expect(rows.map((r) => r.priority)).toEqual([7, 6, 5, 3, 2, null]);
  });

  it("ℹOptional: sort by deadline when `sort=deadline` (earliest → latest; null last; tie by priority desc)", async () => {
    const { team } = await seedData();
    const teamParam = team.map((u) => u._id.toString()).join(",");

    const res = await agent
      .get("/api/manager/tasks")
      .query({ team: teamParam, sort: "deadline" });

    expect(res.statusCode).toBe(200);
    const rows = res.body.items.map(({ title }) => title);

    // Overdue A (yesterday), Due Today (today), Beta Only (+2d), Upcoming Low (+3d), then nulls (No deadline, Completed)
    expect(rows).toEqual([
      "Overdue A",
      "Due Today",
      "Beta Only",
      "Upcoming Low",
      "No deadline",
      "Completed",
    ]);
  });
});
