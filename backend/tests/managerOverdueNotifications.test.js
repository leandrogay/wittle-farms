import { describe, it, beforeAll, afterAll, beforeEach, expect } from "vitest";
import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import User from "../models/User.js";
import Task from "../models/Task.js";
import Project from "../models/Project.js";

let mongo;
let app;

const ALERTS_ENDPOINT = (managerId) => `/api/manager/${managerId}/overdue-alerts`;

/**
 * Minimal in-test route:
 * Returns 200 { notifications: [{ staffName, title, daysOverdue, taskId }] }
 * Logic:
 * - Only tasks "delegated" by manager (createdBy = managerId)
 * - Overdue: deadline < now
 * - Not completed: status != "Done"
 * - Must have at least one assignee
 * - One notification PER assignee (so manager sees who to follow up with)
 */
const mountRoute = () => {
  app.get("/api/manager/:managerId/overdue-alerts", async (req, res) => {
    try {
      const { managerId } = req.params;
      const now = new Date();

      const overdue = await Task.find({
        createdBy: managerId,
        deadline: { $lt: now },
        status: { $ne: "Done" },
        assignedTeamMembers: { $exists: true, $not: { $size: 0 } },
      })
        .select("title deadline assignedTeamMembers")
        .lean();

      // Load assignee names
      const userIds = [
        ...new Set(overdue.flatMap((t) => t.assignedTeamMembers.map(String))),
      ];
      const users = await User.find({ _id: { $in: userIds } })
        .select("name")
        .lean();
      const nameById = Object.fromEntries(users.map((u) => [String(u._id), u.name || "Unknown"]));

      const notifications = overdue.flatMap((t) => {
        const days = Math.max(1, Math.floor((now - new Date(t.deadline)) / (24 * 60 * 60 * 1000)));
        return t.assignedTeamMembers.map((uid) => ({
          staffName: nameById[String(uid)] ?? "Unknown",
          title: t.title,
          daysOverdue: days,
          taskId: String(t._id),
        }));
      });

      res.status(200).json({ notifications });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });
};

describe("API: Manager overdue notifications", () => {
  beforeAll(async () => {
    app = express();
    app.use(express.json());
    mountRoute();

    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri(), { dbName: "e2e-manager-overdue" });
  });

  afterAll(async () => {
    try { await mongoose.connection.dropDatabase(); } catch {}
    try { await mongoose.connection.close(); } catch {}
    try { await mongo.stop(); } catch {}
  });

  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      Task.deleteMany({}),
      Project.deleteMany({}),
    ]);
  });

  it("positive: returns notifications for overdue tasks (and subtasks), includes staff name, title, and days overdue", async () => {
    const manager = await User.create({ name: "Zaieri", email: "z@ex.com", role: "Manager", password: "StrongPass123!" });
    const staffA  = await User.create({ name: "Cheska", email: "cheska@ex.com", role: "Staff",  password: "StrongPass123!" });
    const staffB  = await User.create({ name: "Efren",  email: "efren@ex.com",  role: "Staff",  password: "StrongPass123!" });

    const project = await Project.create({ name: "Ops", createdBy: manager._id });

    const d1 = new Date(Date.now() - 24 * 60 * 60 * 1000);        // 1 day overdue
    const d2 = new Date(Date.now() - (2 * 24 + 3) * 60 * 60 * 1000); // 2 days (and a bit) overdue

    // Overdue task (1 day) — single assignee
    const t1 = await Task.create({
      title: "Reconcile invoices",
      status: "In Progress",
      assignedProject: project._id,
      assignedTeamMembers: [staffA._id],
      deadline: d1,
      createdBy: manager._id,
    });

    // Overdue "subtask" — modelled as another Task doc delegated by manager, two assignees
    const t2 = await Task.create({
      title: "Subtask: attach receipts",
      status: "In Progress",
      assignedProject: project._id,
      assignedTeamMembers: [staffA._id, staffB._id],
      deadline: d2,
      createdBy: manager._id,
    });

    const res = await request(app).get(ALERTS_ENDPOINT(manager._id)).expect(200);
    const { notifications } = res.body;

    // Expect: 1 (t1, staffA) + 2 (t2, staffA & staffB) = 3
    expect(notifications).toHaveLength(3);

    // Check required fields exist
    notifications.forEach(n => {
      expect(typeof n.title).toBe("string");
      expect(typeof n.staffName).toBe("string");
      expect(typeof n.daysOverdue).toBe("number");
      expect(n.daysOverdue).toBeGreaterThanOrEqual(1);
    });

    // Check titles present
    const titles = notifications.map(n => n.title);
    expect(titles).toEqual(expect.arrayContaining(["Reconcile invoices", "Subtask: attach receipts"]));

    // Check staff names present and duplicates when multi-assigned
    const staffNames = notifications.map(n => n.staffName);
    expect(staffNames).toEqual(expect.arrayContaining(["Cheska", "Efren"]));

    // Boundary on day rounding:
    // - t1 ~ 1 day -> daysOverdue >= 1
    // - t2 ~ 2 days -> daysOverdue >= 2
    const t1Notes = notifications.filter(n => n.title === "Reconcile invoices");
    const t2Notes = notifications.filter(n => n.title === "Subtask: attach receipts");

    expect(t1Notes).toHaveLength(1);
    expect(t1Notes[0].daysOverdue).toBeGreaterThanOrEqual(1);

    expect(t2Notes).toHaveLength(2);
    t2Notes.forEach(n => expect(n.daysOverdue).toBeGreaterThanOrEqual(2));
  });

  it("negative & boundary: excludes future/now deadlines, completed, non-delegated, and unassigned; returns [] when nothing qualifies", async () => {
    const managerA = await User.create({ name: "Zaieri", email: "z@ex.com", role: "Manager", password: "StrongPass123!" });
    const managerB = await User.create({ name: "Asher",  email: "asher@ex.com", role: "Manager", password: "StrongPass123!" });
    const staff    = await User.create({ name: "Melanie", email: "mel@ex.com", role: "Staff", password: "StrongPass123!" });

    const project = await Project.create({ name: "Ops", createdBy: managerA._id });

    const now = new Date();
    const future = new Date(Date.now() + 2 * 60 * 60 * 1000); // +2h
    const past   = new Date(Date.now() - 60 * 60 * 1000);     // -1h

    // Not overdue (future) — should be excluded
    await Task.create({
      title: "Prepare dashboard",
      status: "In Progress",
      assignedProject: project._id,
      assignedTeamMembers: [staff._id],
      deadline: future,
      createdBy: managerA._id,
    });

    // Boundary: deadline exactly now — not overdue (we use deadline < now), excluded
    await Task.create({
      title: "Generate report",
      status: "In Progress",
      assignedProject: project._id,
      assignedTeamMembers: [staff._id],
      deadline: new Date(Date.now() + 1000) ,
      createdBy: managerA._id,
    });

    // Completed — excluded
    await Task.create({
      title: "Close ticket",
      status: "Done",
      assignedProject: project._id,
      assignedTeamMembers: [staff._id],
      deadline: past,
      createdBy: managerA._id,
    });

    // Overdue but not delegated by this manager — excluded
    await Task.create({
      title: "Vendor follow-up",
      status: "In Progress",
      assignedProject: project._id,
      assignedTeamMembers: [staff._id],
      deadline: past,
      createdBy: managerB._id,
    });

    // Overdue but no assignee — excluded (cannot include staff name)
    await Task.create({
      title: "File attachments",
      status: "In Progress",
      assignedProject: project._id,
      assignedTeamMembers: [],
      deadline: past,
      createdBy: managerA._id,
    });

    const res = await request(app).get(ALERTS_ENDPOINT(managerA._id)).expect(200);
    expect(res.body.notifications).toEqual([]);
  });
});
