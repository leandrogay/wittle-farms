// backend/tests/routes-test/director.test.js
import { describe, it, beforeAll, afterAll, beforeEach, expect, vi } from "vitest";
import express from "express";
import supertest from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import directorRouter from "../routes/director.js";
import Department from "../models/Department.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import User from "../models/User.js";
import dayjs from "dayjs";


describe("routes/director.js - GET /api/director/report", () => {
  let mongo;
  let app;
  let request;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri(), { dbName: "director-report" });

    app = express();
    app.use(express.json());
    app.use("/api/director", directorRouter);
    request = supertest(app);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      Department.deleteMany({}),
      Project.deleteMany({}),
      Task.deleteMany({}),
      User.deleteMany({}),
    ]);
  });

  it("400 when departmentId is missing & 400 when departmentId is invalid", async () => {
    const r1 = await request.get("/api/director/report").expect(400);
    expect(r1.body?.error || r1.text).toMatch(/department id required/i);

    const r2 = await request
      .get("/api/director/report")
      .query({ departmentId: "not-an-objectid" })
      .expect(400);
    expect(r2.body?.error || r2.text).toMatch(/invalid department id/i);
  });

  it("covers NaN guards: avgTaskCompletionDays is NaN → coerced to 0, and project days NaN → coerced to 0", async () => {
    // ---- Arrange: real dept/users/project so departmentId is valid
    const dept = await Department.create({ name: "QA" });

    const mgr = await User.create({
      name: "Mgr",
      email: "mgr.qa@example.com",
      role: "Manager",
      password: "StrongPass123!",
      department: dept._id,
    });

    const staff = await User.create({
      name: "Staff",
      email: "staff.qa@example.com",
      role: "Staff",
      password: "StrongPass123!",
      department: dept._id,
    });

    const proj = await Project.create({
      name: "NaN Project",
      department: dept._id,
      createdBy: mgr._id,                      // required by your schema
      createdAt: new Date(Date.now() - 7 * 24 * 3600 * 1000),
    });

    // ---- Stub ONLY the first Task.find used for departmentTasks
    // It is called like:
    // Task.find({ assignedProject: { $in: projectIds } })
    //   .populate('assignedTeamMembers') ...
    //   .populate('assignedProject') ...
    //   .populate('createdBy') ...
    //   .lean();

    const mockedDepartmentTasks = [
      // 1) DONE task with "truthy but invalid" createdAt/completedAt
      //    => dayjs("bogus").isValid() === false → diff() = NaN
      {
        _id: new mongoose.Types.ObjectId(),
        title: "Bogus Done",
        assignedProject: { _id: proj._id, name: "NaN Project" },
        status: "Done",
        createdBy: { _id: mgr._id, name: "Mgr" },
        assignedTeamMembers: [{ _id: staff._id, name: "Staff", email: "staff.qa@example.com", role: "Staff" }],
        createdAt: "bogus-start",
        completedAt: "bogus-finish",
        deadline: null,
      },
      // 2) Another DONE task (valid) so the project still counts as completed
      {
        _id: new mongoose.Types.ObjectId(),
        title: "Valid Done",
        assignedProject: { _id: proj._id, name: "NaN Project" },
        status: "Done",
        createdBy: { _id: mgr._id, name: "Mgr" },
        assignedTeamMembers: [{ _id: staff._id, name: "Staff" }],
        createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000),
        completedAt: new Date(),
        deadline: null,
      },
    ];

    const findSpy = vi.spyOn(Task, "find").mockReturnValueOnce({
      populate() { return this; },   // keep chaining compatible
      lean: async () => mockedDepartmentTasks,
    });

    // ---- Act
    const res = await request
      .get("/api/director/report")
      .query({ departmentId: String(dept._id) })
      .expect(200);

    // Restore so later Task.find (e.g., milestones) use the real DB
    findSpy.mockRestore();

    // ---- Assert: your NaN guards kick in and coerce to numbers (0)
    // Lines 398–399 (isNaN guards)
    expect(typeof res.body.avgTaskCompletionDays).toBe("number");
    expect(res.body.avgTaskCompletionDays).toBe(0);

    expect(typeof res.body.avgProjectCompletionDays).toBe("number");
    // Coerced via isNaN(...) ? 0 : Number(...).toFixed(1)
    expect(res.body.avgProjectCompletionDays).toBe(0);

    // sanity: sections exist
    expect(res.body?.projectScope).toBeTruthy();
    expect(res.body?.taskScope).toBeTruthy();
    expect(res.body?.teamPerformance).toBeTruthy();
  });

  it("hits both 'To Do' branches when a project has no tasks", async () => {
    // Department + a valid creator to satisfy Project schema
    const dept = await Department.create({ name: "Engineering" });
    const creator = await User.create({
      name: "Director",
      email: "director@example.com",
      role: "Manager",
      password: "StrongPass123!",
      department: dept._id,
    });

    // Project A: *no tasks at all*  → should be 'To Do' in both loops
    const noTaskProject = await Project.create({
      name: "Greenfield (No Tasks)",
      department: dept._id,
      createdBy: creator._id, // REQUIRED
    });

    // Project B: include one 'To Do' task just to prove mixed data is handled
    const withTaskProject = await Project.create({
      name: "With One Task",
      department: dept._id,
      createdBy: creator._id, // REQUIRED
    });

    const user = await User.create({
      name: "Dev A",
      email: "dev.a@example.com",
      role: "Staff",
      password: "StrongPass123!",
      department: dept._id,
    });

    await Task.create({
      title: "Initial setup",
      assignedProject: withTaskProject._id,
      status: "To Do",
      createdBy: user._id,
      assignedTeamMembers: [user._id],
    });

    const res = await request
      .get("/api/director/report")
      .query({ departmentId: String(dept._id) })
      .expect(200);

    const counts = res.body?.projectScope?.projectStatusCounts;
    expect(counts).toBeTruthy();
    expect(counts["To Do"]).toBeGreaterThanOrEqual(1);

    const milestones = res.body?.projectScope?.milestones || [];
    const ms = milestones.find(
      (m) =>
        String(m.projectId) === String(noTaskProject._id) ||
        m.projectName === "Greenfield (No Tasks)"
    );
    expect(ms).toBeTruthy();
    expect(ms.status).toBe("To Do");
  });

  it("handles mixed tasks (Done / In Progress overdue) without throwing and returns sensible aggregates", async () => {
    const dept = await Department.create({ name: "Ops" });

    const mgr = await User.create({
      name: "Mgr",
      email: "mgr@example.com",
      role: "Manager",
      password: "StrongPass123!",
      department: dept._id,
    });

    const proj = await Project.create({
      name: "Mixed Project",
      department: dept._id,
      createdBy: mgr._id, // REQUIRED
    });

    const staff = await User.create({
      name: "Staff",
      email: "staff@example.com",
      role: "Staff",
      password: "StrongPass123!",
      department: dept._id,
    });

    // Done task with createdAt/completedAt (for avg completion)
    await Task.create({
      title: "Wrap up",
      assignedProject: proj._id,
      status: "Done",
      createdBy: mgr._id,
      assignedTeamMembers: [staff._id],
      createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000),
      completedAt: new Date(),
    });

    // In Progress overdue task (deadline in the past)
    await Task.create({
      title: "Overdue Work",
      assignedProject: proj._id,
      status: "In Progress",
      createdBy: mgr._id,
      assignedTeamMembers: [staff._id],
      deadline: new Date(Date.now() - 2 * 24 * 3600 * 1000),
    });

    const res = await request
      .get("/api/director/report")
      .query({ departmentId: String(dept._id) })
      .expect(200);

    expect(res.body?.taskScope).toBeTruthy();
    expect(res.body?.projectScope).toBeTruthy();
    expect(res.body?.teamPerformance).toBeTruthy();

    expect(typeof res.body.taskScope.totalTasks).toBe("number");
    expect(typeof res.body.taskScope.overdueCount).toBe("number");
    expect(typeof res.body.avgTaskCompletionDays).toBe("number");
  });
});

describe("routes/director.js - edge branches", () => {
  let mongo, app, request;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri(), { dbName: "director-edges" });
    app = express();
    app.use(express.json());
    app.use("/api/director", directorRouter);
    request = supertest(app);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      Department.deleteMany({}),
      Project.deleteMany({}),
      Task.deleteMany({}),
      User.deleteMany({}),
    ]);
  });

  it("hits the reducer early-return when projectTasks length becomes 0 (covers line 110)", async () => {
    // Real department so Department.findById(...).lean() works
    const dept = await Department.create({ name: "Eng" });

    // We'll mock the heavy queries; only Department stays real
    const projId = new mongoose.Types.ObjectId();
    const projectLeanRow = { _id: projId, name: "Toggle Project", createdAt: new Date() };

    // Mock Project.find(...).populate(...).populate(...).populate(...).lean() -> [project]
    const projectFindSpy = vi.spyOn(Project, "find").mockReturnValue({
      populate() { return this; },
      lean: async () => [projectLeanRow],
    });

    // Mock User.find(...).select().lean() -> empty (we don't need members for this branch)
    const userFindSpy = vi.spyOn(User, "find").mockReturnValue({
      select() { return { lean: async () => [] }; },
    });

    // Task list: make assignedProject._id.toString() return the real id once, then a different id.
    let firstPass = true;
    const trickyId = {
      toString() {
        if (firstPass) { firstPass = false; return String(projId); }
        // second time the reducer runs its filter: mismatch → projectTasks.length === 0
        return String(new mongoose.Types.ObjectId());
      }
    };

    const taskLeanRow = {
      title: "Done once, then vanishes",
      status: "Done",
      // assignedProject shaped like the populated doc the route expects
      assignedProject: { _id: trickyId, name: "Toggle Project" },
      createdAt: new Date(),
      completedAt: new Date(),
      assignedTeamMembers: [],
    };

    // Mock Task.find(...).populate(...).populate(...).populate(...).lean() -> [task]
    const taskFindSpy = vi.spyOn(Task, "find").mockReturnValue({
      populate() { return this; },
      lean: async () => [taskLeanRow],
    });

    const res = await request
      .get("/api/director/report")
      .query({ departmentId: String(dept._id) })
      .expect(200);

    // Sanity: route returned structured payload
    expect(res.body?.projectScope?.projectStatusCounts).toBeTruthy();

    // Clean up mocks
    projectFindSpy.mockRestore();
    userFindSpy.mockRestore();
    taskFindSpy.mockRestore();
  });

  it("coerces NaN avgProjectCompletionDays to 0 (covers line 399)", async () => {
    const dept = await Department.create({ name: "Ops" });
    const projId = new mongoose.Types.ObjectId();

    // Project with invalid createdAt to force NaN in the reducer fallback
    const projectLeanRow = { _id: projId, name: "NaN Project", createdAt: "bogus" };

    const projectFindSpy = vi.spyOn(Project, "find").mockReturnValue({
      populate() { return this; },
      lean: async () => [projectLeanRow],
    });

    // A "completed" project (all tasks Done) but tasks have NO completedAt,
    // so reducer uses fallback: diff(dayjs(now), dayjs(project.createdAt)).
    // With invalid createdAt, diff => NaN, so avgProjectCompletionDays must be coerced to 0.
    const taskLeanRow = {
      title: "Done but no completedAt",
      status: "Done",
      assignedProject: { _id: projId, name: "NaN Project" },
      createdAt: new Date(),     // present but not used by fallback
      // completedAt intentionally omitted
      assignedTeamMembers: [],
    };

    const taskFindSpy = vi.spyOn(Task, "find").mockReturnValue({
      populate() { return this; },
      lean: async () => [taskLeanRow],
    });

    // Users not needed for this check
    const userFindSpy = vi.spyOn(User, "find").mockReturnValue({
      select() { return { lean: async () => [] }; },
    });

    const res = await request
      .get("/api/director/report")
      .query({ departmentId: String(dept._id) })
      .expect(200);

    // Assert the NaN guard produced 0
    expect(res.body?.avgProjectCompletionDays).toBe(0);

    projectFindSpy.mockRestore();
    taskFindSpy.mockRestore();
    userFindSpy.mockRestore();
  });
});
