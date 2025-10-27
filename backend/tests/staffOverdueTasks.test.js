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
const OVERDUE_ENDPOINT = (staffId) => `/api/staff/${staffId}/overdue`;

describe("API: Staff overdue tasks", () => {
  beforeAll(async () => {
    // Spin up isolated Express app (do not import server.js)
    app = express();
    app.use(express.json());

    // Minimal route: mirror your overdue behaviour
    app.get("/api/staff/:staffId/overdue", async (req, res) => {
      try {
        const { staffId } = req.params;
        const now = new Date();

        const items = await Task.find({
          assignedTeamMembers: staffId,
          status: { $ne: "Done" },
          deadline: { $lt: now },
        })
          .select("title deadline status assignedProject assignedTeamMembers")
          .lean();

        res.status(200).json({ items });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // In-memory DB
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri(), { dbName: "e2e-staff-overdue" });
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

  it("returns only overdue (deadline < now) and not-done tasks for the staff", async () => {
    const staff = await User.create({
      name: "Cheska",
      email: "cheska@ex.com",
      role: "Staff",
      password: "StrongPass123!",
    });
    const mgr = await User.create({
      name: "Zaieri",
      email: "z@ex.com",
      role: "Manager",
      password: "StrongPass123!",
    });

    const p = await Project.create({ name: "Aftersales Ops", createdBy: mgr._id });

    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const overdue = await Task.create({
      title: "Close ticket #778",
      status: "In Progress",
      assignedProject: p._id,
      assignedTeamMembers: [staff._id],
      deadline: past,
      createdBy: mgr._id,
    });

    await Task.create({
      title: "Prepare dashboard",
      status: "In Progress",
      assignedProject: p._id,
      assignedTeamMembers: [staff._id],
      deadline: future, 
      createdBy: mgr._id, 
    });

    await Task.create({
      title: "Draft SOP",
      status: "Done", 
      assignedProject: p._id,
      assignedTeamMembers: [staff._id],
      deadline: past,
      createdBy: mgr._id, 
    });

    const res = await request(app).get(OVERDUE_ENDPOINT(staff._id)).expect(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].title).toBe(overdue.title);
  });

  it("returns empty list if staff has no overdue items", async () => {
    const staff = await User.create({
      name: "Efren",
      email: "efren@ex.com",
      role: "Staff",
      password: "StrongPass123!",
    });

    const res = await request(app).get(OVERDUE_ENDPOINT(staff._id)).expect(200);
    expect(res.body.items).toEqual([]);
  });
});

