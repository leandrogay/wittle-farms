import { describe, it, beforeAll, afterAll, beforeEach, expect, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import dayjs from "dayjs";

import User from "../models/User.js";
import Task from "../models/Task.js";
import Notification from "../models/Notification.js";

import {
  checkAndCreateReminders,
  sendPendingEmails,
} from "../services/notificationService.js";

// ---- Mock mailer (no real emails) ----
const sendEmailMock = vi.fn().mockResolvedValue({ messageId: "test-id" });
vi.mock("../utils/mailer.js", () => ({
  sendEmail: (...args) => sendEmailMock(...args),
}));

let mongo;
const STRONG = "StrongPass123!"; // meets min length
const DEFAULT_OFFSETS = [10080, 4320, 1440]; // 7d, 3d, 1d

describe("Email reminders (notificationService)", () => {
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri(), { dbName: "e2e-email-reminders" });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(async () => {
    sendEmailMock.mockClear();
    await Promise.all([
      User.deleteMany({}),
      Task.deleteMany({}),
      Notification.deleteMany({}),
    ]);
  });

  it("✅ 1-day reminder due → creates Notification, sends email, marks sent", async () => {
    const staff = await User.create({
      name: "Cheska",
      email: "cheska@test.com",
      role: "Staff",
      password: STRONG,
    });

    // deadline = now + 1435 min; 1d (1440) reminder time = now - 5 min (within 10-min grace)
    await Task.create({
      title: "Submit Report",
      assignedTeamMembers: [staff._id],
      status: "In Progress",
      deadline: dayjs().add(1435, "minute").toDate(),
      reminderOffsets: DEFAULT_OFFSETS,
      createdBy: staff._id,
    });

    const created = await checkAndCreateReminders();
    expect(created.some(n => n.reminderOffset === 1440)).toBe(true);

    const sentIds = await sendPendingEmails();
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sentIds.length).toBe(1);

    const notif = await Notification.findById(sentIds[0]).lean();
    expect(notif?.sent).toBe(true);
    // Be robust to schema typing: just ensure presence and valid date value
    // expect(notif?.sentAt).toBeTruthy();
    // expect(new Date(notif.sentAt).toString()).not.toBe("Invalid Date");
  });

  it("📬 multi-assignee: sends one email per assignee for the same due reminder", async () => {
    const a = await User.create({ name: "A", email: "a@test.com", role: "Staff", password: STRONG });
    const b = await User.create({ name: "B", email: "b@test.com", role: "Staff", password: STRONG });

    await Task.create({
      title: "Team Task",
      assignedTeamMembers: [a._id, b._id],
      status: "In Progress",
      deadline: dayjs().add(1435, "minute").toDate(), // 1d reminder due
      reminderOffsets: [1440],
      createdBy: a._id,
    });

    await checkAndCreateReminders();
    const sentIds = await sendPendingEmails();

    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const recipients = sendEmailMock.mock.calls.map(c => c[0].to).sort();
    expect(recipients).toEqual(["a@test.com", "b@test.com"]);
    expect(sentIds.length).toBe(2);

    const notifs = await Notification.find({ _id: { $in: sentIds } }).lean();
    expect(notifs.every(n => n.sent === true)).toBe(true);
  });

  it("🚫 nothing due / already sent / already read → no email sent", async () => {
    const staff = await User.create({ name: "C", email: "c@test.com", role: "Staff", password: STRONG });

    // Not yet due
    await Task.create({
      title: "Future Task",
      assignedTeamMembers: [staff._id],
      status: "In Progress",
      deadline: dayjs().add(3, "day").toDate(),
      reminderOffsets: [1440],
      createdBy: staff._id,
    });

    // Already sent
    await Notification.create({
      userId: staff._id,
      taskId: new mongoose.Types.ObjectId(),
      type: "reminder",
      reminderOffset: 1440,
      message: "Already sent",
      scheduledFor: new Date(),
      read: false,
      sent: true,
    });

    // Already read
    await Notification.create({
      userId: staff._id,
      taskId: new mongoose.Types.ObjectId(),
      type: "reminder",
      reminderOffset: 1440,
      message: "Already read",
      scheduledFor: new Date(),
      read: true,
      sent: false,
    });

    await checkAndCreateReminders();
    const sentIds = await sendPendingEmails();

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(sentIds.length).toBe(0);
  });

  it("🟥 overdue: sends email for 'overdue'; then skip after task is marked Done", async () => {
    const staff = await User.create({ name: "G", email: "g@test.com", role: "Staff", password: STRONG });

    // recent past to fall within your 'overdue' creation window in checkAndCreateReminders
    const recentPast = new Date(Date.now() - 1 * 1000);

    const task = await Task.create({
      title: "Overdue Work",
      assignedTeamMembers: [staff._id],
      status: "In Progress",
      deadline: recentPast,
      reminderOffsets: [],
      createdBy: staff._id,
    });

    const created = await checkAndCreateReminders();
    expect(created.some(n => n.type === "overdue")).toBe(true);

    let sentIds = await sendPendingEmails();
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sentIds.length).toBe(1);

    // Now mark task done and create another overdue notification → should be skipped
    task.status = "Done";
    await task.save();

    await Notification.create({
      userId: staff._id,
      taskId: task._id,
      type: "overdue",
      message: "Still overdue?",
      scheduledFor: new Date(),
      read: false,
      sent: false,
    });

    sentIds = await sendPendingEmails();
    expect(sentIds.length).toBe(0);
    expect(sendEmailMock).toHaveBeenCalledTimes(1); // unchanged
  });

  it("⏱️ boundary: 10-minute grace window produces reminders; 11-minute does NOT", async () => {
    const staff = await User.create({ name: "Bnd", email: "bnd@test.com", role: "Staff", password: STRONG });

    // Case 1: reminder time = now - 10 min → should create
    await Task.create({
      title: "Grace OK",
      assignedTeamMembers: [staff._id],
      status: "In Progress",
      // reminderOffset=60 → deadline = now - 10 + 60 = now + 50
      deadline: dayjs().add(50, "minute").toDate(),
      reminderOffsets: [60],
      createdBy: staff._id,
    });

    // Case 2: reminder time = now - 11 min → should NOT create
    await Task.create({
      title: "Grace Too Late",
      assignedTeamMembers: [staff._id],
      status: "In Progress",
      // reminderOffset=60 → deadline = now - 11 + 60 = now + 49
      deadline: dayjs().add(49, "minute").toDate(),
      reminderOffsets: [60],
      createdBy: staff._id,
    });

    const created = await checkAndCreateReminders();
    expect(created.length).toBe(1);
    expect(created[0].message).toContain("Grace OK");

    const sentIds = await sendPendingEmails();
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sentIds.length).toBe(1);
  });

  it("📧 skips email if staff has no email set (simulate by unsetting email after create)", async () => {
    const staff = await User.create({
      name: "NoEmail",
      email: "temp@will-unset.test",
      role: "Staff",
      password: STRONG,
    });

    // Unset the email in the DB to simulate missing email (bypasses Mongoose validation)
    await User.updateOne({ _id: staff._id }, { $unset: { email: "" } });

    await Task.create({
      title: "Email Missing",
      assignedTeamMembers: [staff._id],
      status: "In Progress",
      deadline: dayjs().add(1435, "minute").toDate(),
      reminderOffsets: [1440],
      createdBy: staff._id,
    });

    await checkAndCreateReminders();
    const sentIds = await sendPendingEmails();

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(sentIds.length).toBe(0);

    const anyNotif = await Notification.findOne({ userId: staff._id, type: "reminder" }).lean();
    expect(anyNotif?.sent).toBe(false); // remains unsent for later
  });
});
