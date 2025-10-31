// tests/daily-overdue-manager.test.js
import { describe, it, beforeAll, afterAll, beforeEach, expect, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import dayjs from "dayjs";

import { runDailyOverdueDigest } from "../jobs/dailyOverdueTaskEmails.js";
import User from "../models/User.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";

/* Mock outbound email */
const sendEmailMock = vi.fn().mockResolvedValue({ messageId: "mock" });
vi.mock("../utils/mailer.js", () => ({
  sendEmail: (...args) => sendEmailMock(...args),
}));

let mongo;
const STRONG = "Password123!";

describe("Daily Overdue Digest Job", () => {
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri(), { dbName: "test-digest" });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(async () => {
    sendEmailMock.mockClear();
    await Promise.all([
      User.deleteMany({}),
      Project.deleteMany({}),
      Task.deleteMany({}),
    ]);
  });

  it("sends digest email to managers with overdue tasks grouped by project", async () => {
    const manager = await User.create({
      name: "Manager A",
      email: "manager@example.com",
      role: "Manager",
      password: STRONG,
    });

    const proj1 = await Project.create({ name: "Project Alpha", createdBy: manager._id });
    const proj2 = await Project.create({ name: "Project Beta", createdBy: manager._id });

    const staff = await User.create({
      name: "Staff One",
      email: "staff1@example.com",
      role: "Staff",
      password: STRONG,
    });

    await Task.create([
      {
        title: "Alpha Task 1",
        assignedProject: proj1._id,
        assignedTeamMembers: [staff._id],
        deadline: dayjs().subtract(2, "day").toDate(),
        status: "In Progress",
        createdBy: manager._id,
      },
      {
        title: "Beta Task 1",
        assignedProject: proj2._id,
        assignedTeamMembers: [staff._id],
        deadline: dayjs().subtract(5, "day").toDate(),
        status: "To Do",
        createdBy: manager._id,
      },
    ]);

    await runDailyOverdueDigest();

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0][0];

    expect(call.to).toBe("manager@example.com");
    expect(call.subject).toContain("overdue item");
    expect(call.html).toContain("Project Alpha");
    const expectedAlphaDays = dayjs().diff(dayjs().subtract(2, "day"), "day") + 1;
    expect(call.html).toContain(`${expectedAlphaDays} day(s) overdue`);
    expect(call.html).toContain("Project Beta");
    const expectedBetaDays = dayjs().diff(dayjs().subtract(5, "day"), "day") + 1;
    expect(call.html).toContain(`${expectedBetaDays} day(s) overdue`);
  });

  it("skips managers without overdue tasks", async () => {
    await User.create({
      name: "Manager NoOverdue",
      email: "skip@example.com",
      role: "Manager",
      password: STRONG,
    });

    await runDailyOverdueDigest();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("skips manager with no email even if projects and overdue tasks exist", async () => {
    const mgr = await User.create({
      name: "NoEmail Manager",
      email: "temp@example.com",
      role: "Manager",
      password: STRONG,
    });
    await User.collection.updateOne({ _id: mgr._id }, { $unset: { email: "" } });

    const proj = await Project.create({ name: "Ops", createdBy: mgr._id });

    const staff = await User.create({
      name: "Staffer",
      email: "staff@example.com",
      role: "Staff",
      password: STRONG,
    });
    await Task.create({
      title: "Overdue Work",
      assignedProject: proj._id,
      assignedTeamMembers: [staff._id],
      status: "In Progress",
      deadline: dayjs().subtract(1, "day").toDate(),
      createdBy: mgr._id,
    });

    await runDailyOverdueDigest();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("assignee with no name falls back to their email in the list", async () => {
    const mgr = await User.create({
      name: "Manager A",
      email: "manager@example.com",
      role: "Manager",
      password: STRONG,
    });

    const proj = await Project.create({ name: "Alpha", createdBy: mgr._id });

    const staff = await User.create({
      name: "Temp Name",
      email: "no-name@example.com",
      role: "Staff",
      password: STRONG,
    });
    await User.collection.updateOne({ _id: staff._id }, { $unset: { name: "" } });

    await Task.create({
      title: "Overdue Item",
      assignedProject: proj._id,
      assignedTeamMembers: [staff._id],
      status: "In Progress",
      deadline: dayjs().subtract(2, "day").toDate(),
      createdBy: mgr._id,
    });

    await runDailyOverdueDigest();

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const { html } = sendEmailMock.mock.calls[0][0];
    expect(html).toContain("no-name@example.com"); // m.name || m.email fallback
  });

  it("manager with projects but no overdue tasks → no email (covers !overdueTasks.length)", async () => {
    const mgr = await User.create({
      name: "Manager Projects NoOverdue",
      email: "mpno@example.com",
      role: "Manager",
      password: STRONG,
    });

    const proj = await Project.create({ name: "Future Only", createdBy: mgr._id });

    const staff = await User.create({
      name: "Future Staff",
      email: "fstaff@example.com",
      role: "Staff",
      password: STRONG,
    });

    // Future task (NOT overdue)
    await Task.create({
      title: "Future Task",
      assignedProject: proj._id,
      assignedTeamMembers: [staff._id],
      status: "In Progress",
      deadline: dayjs().add(2, "day").toDate(),
      createdBy: mgr._id,
    });

    // Done (also should not count)
    await Task.create({
      title: "Done Past",
      assignedProject: proj._id,
      assignedTeamMembers: [staff._id],
      status: "Done",
      deadline: dayjs().subtract(2, "day").toDate(),
      createdBy: mgr._id,
    });

    await runDailyOverdueDigest();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('renders "Unassigned" when an overdue task has no assignees (empty array)', async () => {
    const mgr = await User.create({
      name: "Manager Unassigned",
      email: "munassigned@example.com",
      role: "Manager",
      password: STRONG,
    });

    const proj = await Project.create({ name: "Ops Unassigned", createdBy: mgr._id });

    await Task.create({
      title: "Overdue Unassigned",
      assignedProject: proj._id,
      assignedTeamMembers: [], // empty array path
      status: "In Progress",
      deadline: dayjs().subtract(1, "day").toDate(),
      createdBy: mgr._id,
    });

    await runDailyOverdueDigest();

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const { html } = sendEmailMock.mock.calls[0][0];
    expect(html).toContain("Unassigned");
  });

  // Covers: assignedTeamMembers omitted (undefined) → still "Unassigned"
  it('renders "Unassigned" when an overdue task has assignedTeamMembers omitted (undefined)', async () => {
    const mgr = await User.create({
      name: "Manager Unassigned 2",
      email: "munassigned2@example.com",
      role: "Manager",
      password: STRONG,
    });

    const proj = await Project.create({ name: "Ops Unassigned 2", createdBy: mgr._id });

    // omit assignedTeamMembers entirely
    await Task.collection.insertOne({
      title: "Overdue Unassigned Undefined",
      assignedProject: proj._id,
      status: "In Progress",
      deadline: dayjs().subtract(1, "day").toDate(),
      createdBy: mgr._id,
    });

    await runDailyOverdueDigest();

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const { html } = sendEmailMock.mock.calls[0][0];
    expect(html).toContain("Unassigned");
  });

  // Ensures byProject.has(key) sees both true and false paths: second insert to same key
  it("groups multiple overdue items under the same project (covers byProject existing-key branch)", async () => {
    const mgr = await User.create({
      name: "Manager SameProj",
      email: "sameproj@example.com",
      role: "Manager",
      password: STRONG,
    });

    const proj = await Project.create({ name: "Same Project", createdBy: mgr._id });

    const staff = await User.create({
      name: "Staff X",
      email: "x@example.com",
      role: "Staff",
      password: STRONG,
    });

    await Task.create([
      {
        title: "Overdue #1",
        assignedProject: proj._id,
        assignedTeamMembers: [staff._id],
        status: "In Progress",
        deadline: dayjs().subtract(1, "day").toDate(),
        createdBy: mgr._id,
      },
      {
        title: "Overdue #2",
        assignedProject: proj._id, // same project key → push into existing array
        assignedTeamMembers: [staff._id],
        status: "In Progress",
        deadline: dayjs().subtract(3, "day").toDate(),
        createdBy: mgr._id,
      },
    ]);

    await runDailyOverdueDigest();

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const { html } = sendEmailMock.mock.calls[0][0];
    expect(html).toContain("Same Project");
    expect(html).toContain("Overdue #1");
    expect(html).toContain("Overdue #2");
  });

  // Covers: mgr.name is missing so fallback to "Manager" in greeting
  it('falls back to "Manager" when manager has no name (covers mgr.name || "Manager")', async () => {
    const mgr = await User.create({
      name: "Temp",
      email: "noname@example.com",
      role: "Manager",
      password: STRONG,
    });
    await User.collection.updateOne({ _id: mgr._id }, { $unset: { name: "" } });

    const proj = await Project.create({ name: "AnonMgrProj", createdBy: mgr._id });

    const staff = await User.create({
      name: "Staff",
      email: "s@example.com",
      role: "Staff",
      password: STRONG,
    });

    await Task.create({
      title: "Anon Manager Overdue",
      assignedProject: proj._id,
      assignedTeamMembers: [staff._id],
      status: "In Progress",
      deadline: dayjs().subtract(1, "day").toDate(),
      createdBy: mgr._id,
    });

    await runDailyOverdueDigest();

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const { html } = sendEmailMock.mock.calls[0][0];
    // Greeting line should use "Manager" (fallback)
    expect(html).toMatch(/<p>\s*Hi Manager,\s*<\/p>/);
  });

  it("edge: task without deadline and assignees → renders 0 day(s) & Unassigned", async () => {
    // 1) Create a manager + a project normally (we won't stub these)
    const mgr = await User.create({
      name: "Mgr",
      email: "mgr@example.com",
      role: "Manager",
      password: "StrongPass123!",
    });
    const proj = await Project.create({ name: "EdgeProj", createdBy: mgr._id });

    // 2) Stub Task.find chain to bypass the DB filter (so we can return a task with no deadline)
    const findSpy = vi.spyOn(Task, "find").mockReturnValue({
      populate: () => ({
        lean: async () => ([
          {
            _id: new mongoose.Types.ObjectId(),
            title: "No Deadline & No Assignees",
            assignedProject: proj._id,
            // Note: intentionally no deadline field here
            assignedTeamMembers: [], // empty → should render "Unassigned"
            status: "In Progress",
            createdBy: mgr._id,
          }
        ]),
      }),
    });

    await runDailyOverdueDigest();
    findSpy.mockRestore();

    // 3) Assert: email went to the manager and HTML hit both branches
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const { to, html } = sendEmailMock.mock.calls[0][0];
    expect(to).toBe("mgr@example.com");

    // "Unassigned" branch (no team members)
    expect(html).toContain("Team Members: Unassigned");

    // "no deadline" branch: dlate is null → `${dlate ?? 0}` renders 0 day(s)
    expect(html).toContain("0 day(s) overdue");
  });


  it('uses "Untitled Project" when project.name is missing', async () => {
    const mgr = await User.create({
      name: "Manager No Project Name",
      email: "nopname@example.com",
      role: "Manager",
      password: STRONG,
    });

    const proj = await Project.create({ name: "TempName", createdBy: mgr._id });
    await Project.collection.updateOne({ _id: proj._id }, { $unset: { name: "" } });

    const staff = await User.create({
      name: "Staff",
      email: "staff@example.com",
      role: "Staff",
      password: STRONG,
    });

    await Task.create({
      title: "Overdue Nameless Project Task",
      assignedProject: proj._id,
      assignedTeamMembers: [staff._id],
      status: "In Progress",
      deadline: dayjs().subtract(1, "day").toDate(),
      createdBy: mgr._id,
    });

    await runDailyOverdueDigest();

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const { html } = sendEmailMock.mock.calls[0][0];
    expect(html).toContain("Untitled Project");
  });
});
