import { describe, it, beforeAll, afterAll, beforeEach, expect, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import dayjs from "dayjs";

import { runDailyOverdueDigest } from "../jobs/dailyOverdueTaskEmails.js";
import User from "../models/User.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";

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
    await Promise.all([User.deleteMany({}), Project.deleteMany({}), Task.deleteMany({})]);
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
});
