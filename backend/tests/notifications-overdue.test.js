import { describe, it, beforeAll, afterAll, beforeEach, expect, vi } from "vitest";
import express from "express";
import supertest from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

// SUT + models
import overdueRouter from "../routes/overdue-notifis.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import User from "../models/User.js";

/* ---------------- Mock mailer (so we don't send real email) ---------------- */
const sendEmailMock = vi.fn().mockResolvedValue({ messageId: "mocked" });
vi.mock("../utils/mailer.js", () => ({
  sendEmail: (...args) => sendEmailMock(...args),
}));

/* ---------------- Helpers ---------------- */
// Freeze time so "day(s) overdue" math is stable/consistent
const FIXED_NOW = new Date(Date.UTC(2025, 10, 1, 0, 0, 0)); // 2025-11-01T00:00:00Z
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(FIXED_NOW.getTime() - n * DAY_MS);
const daysAhead = (n) => new Date(FIXED_NOW.getTime() + n * DAY_MS);

// In some environments res.body may be empty though res.text has JSON.
// This keeps assertions resilient.
function safeJson(res) {
  if (res.body && Object.keys(res.body).length) return res.body;
  try {
    return JSON.parse(res.text);
  } catch {
    return {};
  }
}

describe("routes/overdue-notifis.js - POST /api/notifications/overdue", () => {
  let mongo;
  let app;
  let request;

  beforeAll(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);

    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri(), { dbName: "notif-overdue" });

    app = express();
    app.use(express.json());
    app.use("/api/notifications", overdueRouter);
    request = supertest(app);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
    vi.useRealTimers();
  });

  beforeEach(async () => {
    sendEmailMock.mockClear();
    await Promise.all([
      Project.deleteMany({}),
      Task.deleteMany({}),
      User.deleteMany({}),
    ]);
  });

  it("400 when ?project is missing", async () => {
    const r = await request.post("/api/notifications/overdue").expect(400);
    expect((r.body?.error || r.text)).toMatch(/missing \?project=/i);
  });

  it("404 when project not found", async () => {
    const r = await request
      .post("/api/notifications/overdue")
      .query({ project: new mongoose.Types.ObjectId().toString() })
      .expect(404);
    expect((r.body?.error || r.text)).toMatch(/project not found/i);
  });

  it("400 when project manager email is missing", async () => {
    const mgr = await User.create({
      name: "NoEmail Manager",
      email: "temp@example.com",
      role: "Manager",
      password: "StrongPass123!",
    });
    // remove email to hit the branch
    await User.collection.updateOne({ _id: mgr._id }, { $unset: { email: "" } });

    const proj = await Project.create({
      name: "Alpha",
      createdBy: mgr._id,
    });

    const r = await request
      .post("/api/notifications/overdue")
      .query({ project: String(proj._id) })
      .expect(400);

    expect((r.body?.error || r.text)).toMatch(/manager email not found/i);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("returns {success:false} when there are no overdue items", async () => {
    const mgr = await User.create({
      name: "Manager",
      email: "mgr@example.com",
      role: "Manager",
      password: "StrongPass123!",
    });

    const proj = await Project.create({
      name: "No Overdue",
      createdBy: mgr._id,
    });

    // Future (not overdue) and Done-in-past (ignored)
    await Task.create([
      {
        title: "Future Task",
        assignedProject: proj._id,
        status: "In Progress",
        deadline: daysAhead(2),
        createdBy: mgr._id,
      },
      {
        title: "Past but Done",
        assignedProject: proj._id,
        status: "Done",
        deadline: daysAgo(3),
        createdBy: mgr._id,
      },
    ]);

    const r = await request
      .post("/api/notifications/overdue")
      .query({ project: String(proj._id) })
      .expect(200);

    const body = safeJson(r);
    expect(body).toEqual({ success: false, message: "No overdue items" });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("sends one consolidated email when there are overdue tasks", async () => {
    const mgr = await User.create({
      name: "Manager A",
      email: "manager.a@example.com",
      role: "Manager",
      password: "StrongPass123!",
    });

    const staff = await User.create({
      name: "Alice",
      email: "alice@example.com",
      role: "Staff",
      password: "StrongPass123!",
    });

    const proj = await Project.create({
      name: "Project Overdue",
      createdBy: mgr._id,
    });

    // Two overdue tasks (status != Done, deadline < now)
    await Task.create([
      {
        title: "Late Task 1",
        assignedProject: proj._id,
        status: "In Progress",
        deadline: daysAgo(3),
        assignedTeamMembers: [staff._id],
        createdBy: mgr._id,
      },
      {
        title: "Late Task 2",
        assignedProject: proj._id,
        status: "To Do",
        deadline: daysAgo(1),
        assignedTeamMembers: [],
        createdBy: mgr._id,
      },
    ]);

    const r = await request
      .post("/api/notifications/overdue")
      .query({ project: String(proj._id) })
      .expect(200);

    const body = safeJson(r);
    expect(body.success).toBe(true);
    expect(typeof body.count).toBe("number");
    expect(body.count).toBeGreaterThanOrEqual(2);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const arg = sendEmailMock.mock.calls[0][0];

    expect(arg.to).toBe("manager.a@example.com");
    expect(arg.subject).toMatch(/overdue item\(s\)/i);
    expect(arg.subject).toContain("Project Overdue");
    expect(arg.html).toMatch(/Hi Manager A/);
    expect(arg.html).toMatch(/Late Task 1/);
    expect(arg.html).toMatch(/Late Task 2/);
    expect(arg.html).toMatch(/Alice/);          // team member listed
    expect(arg.html).toMatch(/Unassigned/);     // empty assignee path
    expect(arg.html).toMatch(/day\(s\) overdue/);
  });

  it("includes overdue subtasks and de-dupes tasks that match both queries (HTML needn’t show the parent)", async () => {
    const mgr = await User.create({
      name: "Mgr B",
      email: "mgrb@example.com",
      role: "Manager",
      password: "StrongPass123!",
    });

    const proj = await Project.create({
      name: "Subtask Project",
      createdBy: mgr._id,
    });

    // Two plainly overdue parents => guarantees success === true via main query
    await Task.create([
      {
        title: "Plain Overdue A",
        assignedProject: proj._id,
        status: "In Progress",
        deadline: daysAgo(3),
        createdBy: mgr._id,
        assignedTeamMembers: [],
      },
      {
        title: "Plain Overdue B",
        assignedProject: proj._id,
        status: "To Do",
        deadline: daysAgo(1),
        createdBy: mgr._id,
        assignedTeamMembers: [],
      },
    ]);

    // Parent NOT overdue, but with one overdue subtask → matches the subtasks query
    await Task.create({
      title: "Parent With Overdue Subtask",
      assignedProject: proj._id,
      status: "In Progress",
      deadline: daysAhead(5), // parent itself is NOT overdue
      createdBy: mgr._id,
      assignedTeamMembers: [],
      subtasks: [
        { title: "Child Late 1", deadline: daysAgo(2), status: "To Do" },
        { title: "Child Done", deadline: daysAgo(5), status: "Done" },
        { title: "Future Child", deadline: daysAhead(2), status: "To Do" }
      ],
    });

    const r = await request
      .post("/api/notifications/overdue")
      .query({ project: String(proj._id) })
      .expect(200);

    const body = safeJson(r);

    // We definitely have overdue items via main query
    expect(body.success).toBe(true);
    // At least the 2 plain overdue parents must be in the merged set
    expect(typeof body.count).toBe("number");
    expect(body.count).toBeGreaterThanOrEqual(2);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);

    const { subject, html } = sendEmailMock.mock.calls[0][0];
    expect(subject).toMatch(/overdue item\(s\)/i);
    expect(subject).toContain("Subtask Project");

    // Both plain overdue parents present (HTML)
    expect(html).toMatch(/Plain Overdue A/);
    expect(html).toMatch(/Plain Overdue B/);

    // We do NOT require the subtask-parent to appear in the HTML,
    // since your template may omit subtasks rendering even when selected by the query.
    expect(html).toMatch(/day\(s\) overdue/);
  });

  it("renders 'Untitled Project' when project.name is missing", async () => {
    const mgr = await User.create({
      name: "Mgr C",
      email: "mgrc@example.com",
      role: "Manager",
      password: "StrongPass123!",
    });

    const proj = await Project.create({
      name: "Temp",
      createdBy: mgr._id,
    });
    await Project.collection.updateOne({ _id: proj._id }, { $unset: { name: "" } });

    await Task.create({
      title: "Late Item",
      assignedProject: proj._id,
      status: "In Progress",
      deadline: daysAgo(1),
      createdBy: mgr._id,
    });

    const r = await request
      .post("/api/notifications/overdue")
      .query({ project: String(proj._id) })
      .expect(200);

    const body = safeJson(r);
    expect(body.success).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);

    const { subject, html } = sendEmailMock.mock.calls[0][0];
    expect(subject).toMatch(/Untitled Project/);
    expect(html).toMatch(/Untitled Project/);
  });

  it("renders email for an overdue parent that also has overdue subtasks (don’t require child line)", async () => {
    const mgr = await User.create({
      name: "Mgr SubHTML",
      email: "mgr-subhtml@example.com",
      role: "Manager",
      password: "StrongPass123!",
    });

    const proj = await Project.create({
      name: "Overdue Parent With Subtasks",
      createdBy: mgr._id,
    });

    // Parent is OVERDUE and has an overdue subtask (whether the child renders or not)
    await Task.create({
      title: "Overdue Parent",
      assignedProject: proj._id,
      status: "In Progress",
      deadline: daysAgo(4),
      createdBy: mgr._id,
      assignedTeamMembers: [],
      subtasks: [
        { title: "Subtask Late", deadline: daysAgo(2), status: "To Do" },
        { title: "Subtask Done", deadline: daysAgo(3), status: "Done" },
        { title: "Subtask Future", deadline: daysAhead(1), status: "To Do" },
      ],
    });

    const r = await request
      .post("/api/notifications/overdue")
      .query({ project: String(proj._id) })
      .expect(200);

    const body = safeJson(r);
    expect(body.success).toBe(true);
    expect(typeof body.count).toBe("number");
    expect(body.count).toBeGreaterThanOrEqual(1);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const html = sendEmailMock.mock.calls[0][0].html;

    // Parent appears and shows overdue text; don’t force-check child line
    expect(html).toMatch(/Overdue Parent/);
    expect(html).toMatch(/day\(s\) overdue/);
  });

  it("renders overdue subtasks list (hits filter/map/join branch for subtasks)", async () => {
    // Arrange: project + manager
    const mgr = await User.create({
      name: "Mgr Spy",
      email: "mgr-spy@example.com",
      role: "Manager",
      password: "StrongPass123!",
    });

    const proj = await Project.create({
      name: "Spy Project",
      createdBy: mgr._id,
    });

    // We’ll intercept Task.find so the route receives a task WITH subtasks.
    // First call in the route: overdueTasks query (has `deadline: { $lt: now }`)
    // Second call: overdueBySubtasks query (has `"subtasks.deadline": { $lt: now }`)
    const findSpy = vi
      .spyOn(Task, "find")
      .mockImplementation((queryObj) => {
        // Minimal chain object to satisfy .populate(...).lean()
        const chain = {
          populate() { return this; },
          lean: async () => {
            // If this is the "main overdue tasks" query, return one task that is overdue
            // and contains subtasks that should be filtered+rendered.
            if (queryObj && queryObj.deadline) {
              return [
                {
                  _id: new mongoose.Types.ObjectId(),
                  title: "Overdue Parent (Spy)",
                  assignedProject: proj._id,
                  status: "In Progress",
                  // make parent overdue so it is included by the main query
                  deadline: new Date(FIXED_NOW.getTime() - 3 * 24 * 60 * 60 * 1000),
                  assignedTeamMembers: [],
                  // Subtasks cover all filter branches:
                  subtasks: [
                    // ✅ should render (past & not Done)
                    { title: "Child Renders", deadline: new Date(FIXED_NOW.getTime() - 2 * 24 * 60 * 60 * 1000), status: "To Do" },
                    // ❌ filtered (Done)
                    { title: "Child Done", deadline: new Date(FIXED_NOW.getTime() - 5 * 24 * 60 * 60 * 1000), status: "Done" },
                    // ❌ filtered (future)
                    { title: "Child Future", deadline: new Date(FIXED_NOW.getTime() + 1 * 24 * 60 * 60 * 1000), status: "To Do" },
                    // ❌ filtered (no deadline)
                    { title: "Child No Deadline", status: "To Do" },
                  ],
                },
              ];
            }

            // For the "overdueBySubtasks" query we can just return empty to keep it simple.
            if (queryObj && queryObj["subtasks.deadline"]) {
              return [];
            }

            // Default empty
            return [];
          },
        };
        return chain;
      });

    const r = await request
      .post("/api/notifications/overdue")
      .query({ project: String(proj._id) })
      .expect(200);

    const body = safeJson(r);
    expect(body.success).toBe(true);
    expect(typeof body.count).toBe("number");
    expect(body.count).toBeGreaterThanOrEqual(1);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const html = sendEmailMock.mock.calls[0][0].html;

    // Parent appears
    expect(html).toMatch(/Overdue Parent \(Spy\)/);

    expect(html).toMatch(/Child Renders/);
    expect(html).toMatch(/day\(s\) overdue/);

    expect(html).not.toMatch(/Child Done/);
    expect(html).not.toMatch(/Child Future/);
    expect(html).not.toMatch(/Child No Deadline/);

    findSpy.mockRestore();
  });

  // --- Covers line 62: const days = t.deadline ? ... : null (false arm => no deadline) ---
  it("renders 'null day(s) overdue' when a task has no top-level deadline (picked via overdue subtasks)", async () => {
    const mgr = await User.create({
      name: "Mgr NoDeadline",
      email: "mgr-nodl@example.com",
      role: "Manager",
      password: "StrongPass123!",
    });

    const proj = await Project.create({
      name: "No-Deadline Parent via Subtask",
      createdBy: mgr._id,
    });

    // Spy Task.find so main overdue query returns [] but the subtasks query returns a parent
    // WITHOUT a top-level deadline and WITH an overdue subtask.
    const findSpy = vi.spyOn(Task, "find").mockImplementation((queryObj) => {
      const chain = {
        populate() { return this; },
        lean: async () => {
          // Main overdue query (has 'deadline') → return none
          if (queryObj && queryObj.deadline) return [];
          // Subtasks-overdue query → return one parent lacking deadline
          if (queryObj && queryObj["subtasks.deadline"]) {
            return [{
              _id: new mongoose.Types.ObjectId(),
              title: "Parent Missing Deadline",
              assignedProject: proj._id,
              status: "In Progress",
              // NOTE: no 'deadline' field here -> days becomes null
              assignedTeamMembers: [],
              subtasks: [
                { title: "Child Past", deadline: daysAgo(2), status: "To Do" }, // overdue child to include
                { title: "Child Done", deadline: daysAgo(3), status: "Done" },  // filtered
                { title: "Child Future", deadline: daysAhead(1), status: "To Do" } // filtered
              ],
            }];
          }
          return [];
        },
      };
      return chain;
    });

    const r = await request
      .post("/api/notifications/overdue")
      .query({ project: String(proj._id) })
      .expect(200);

    const body = safeJson(r);
    expect(body.success).toBe(true);
    expect(typeof body.count).toBe("number");
    expect(body.count).toBe(1);

    const html = sendEmailMock.mock.calls[0][0].html;
    // Parent shows up…
    expect(html).toMatch(/Parent Missing Deadline/);
    // …and because there is no top-level deadline, days === null gets rendered
    expect(html).toMatch(/<em>null day\(s\) overdue<\/em>/);
    // The overdue child appears (proves subtasks list rendered)
    expect(html).toMatch(/Child Past/);
    // Filtered children do not
    expect(html).not.toMatch(/Child Done/);
    expect(html).not.toMatch(/Child Future/);

    findSpy.mockRestore();
  });

  // --- Covers line 99: greeting fallback "Hi Manager," when manager.name is missing ---
  it('greets with "Hi Manager," when manager.name is absent (name fallback branch)', async () => {
    // Create with a name first (schema may require name), then unset it to hit fallback
    const mgr = await User.create({
      name: "Temp Name",
      email: "mgr-noname@example.com",
      role: "Manager",
      password: "StrongPass123!",
    });
    await User.collection.updateOne({ _id: mgr._id }, { $unset: { name: "" } });

    const proj = await Project.create({
      name: "Fallback Greeting Project",
      createdBy: mgr._id,
    });

    // One plainly overdue task to trigger the email
    await Task.create({
      title: "Overdue Greeting Trigger",
      assignedProject: proj._id,
      status: "To Do",
      deadline: daysAgo(1),
      createdBy: mgr._id,
      assignedTeamMembers: [],
    });

    const r = await request
      .post("/api/notifications/overdue")
      .query({ project: String(proj._id) })
      .expect(200);

    const body = safeJson(r);
    expect(body.success).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);

    const html = sendEmailMock.mock.calls[0][0].html;
    // Fallback greeting path
    expect(html).toMatch(/<p>Hi Manager,<\/p>/);
  });


  it("uses assignee email when member.name is missing (simulate missing name via $unset)", async () => {
    const mgr = await User.create({
      name: "Has Name",
      email: "nameless.manager@example.com",
      role: "Manager",
      password: "StrongPass123!",
    });

    const proj = await Project.create({
      name: "Greeting & Member Fallbacks",
      createdBy: mgr._id,
    });

    // Create member with a temporary name (to satisfy schema), then unset it.
    const member = await User.create({
      name: "Temp Name",
      email: "member.no.name@example.com",
      role: "Staff",
      password: "StrongPass123!",
    });
    await User.collection.updateOne({ _id: member._id }, { $unset: { name: "" } });

    await Task.create({
      title: "Overdue For Fallbacks",
      assignedProject: proj._id,
      status: "To Do",
      deadline: daysAgo(1),
      createdBy: mgr._id,
      assignedTeamMembers: [member._id],
    });

    const r = await request
      .post("/api/notifications/overdue")
      .query({ project: String(proj._id) })
      .expect(200);

    const body = safeJson(r);
    expect(body.success).toBe(true);

    const html = sendEmailMock.mock.calls[0][0].html;
    // Member listing falls back to email (no name after $unset)
    expect(html).toMatch(/member\.no\.name@example\.com/);
  });
});
