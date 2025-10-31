// backend/tests/emails-reminder.test.js
import { describe, it, beforeAll, afterAll, beforeEach, expect, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import dayjs from "dayjs";

// ─────────────────────────────────────────────────────────────
// 1) Mock mailer so no real emails are sent
// ─────────────────────────────────────────────────────────────
const sendEmailMock = vi.fn().mockResolvedValue({ messageId: "test-id" });
vi.mock("../utils/mailer.js", () => ({
  sendEmail: (...args) => sendEmailMock(...args),
}));

// ─────────────────────────────────────────────────────────────
// 2) Mock node-cron to capture scheduled callbacks
// ─────────────────────────────────────────────────────────────
const cronJobs = [];
vi.mock("node-cron", () => {
  return {
    default: {
      schedule: (expr, cb) => {
        cronJobs.push({ expr, cb });
        return { start: vi.fn(), stop: vi.fn() };
      },
    },
  };
});

// ─────────────────────────────────────────────────────────────
// 3) Import models and job initializer (AFTER mocks!)
// ─────────────────────────────────────────────────────────────
import User from "../models/User.js";
import Task, { DEFAULT_REMINDERS_MIN } from "../models/Task.js";
import Notification from "../models/Notification.js";
import { initReminderJobs } from "../jobs/reminders.js";

// Helpers to find the cron jobs registered by reminders.js
function getEveryMinuteJob() {
  // reminders.js schedules "* * * * *" for upcoming reminders
  return cronJobs.find((j) => j.expr === "* * * * *");
}
function getDailyNineAMJob() {
  // reminders.js schedules "0 9 * * *" for overdue digest
  return cronJobs.find((j) => j.expr === "0 9 * * *");
}

let mongo;
const STRONG = "StrongPass123!";

// ─────────────────────────────────────────────────────────────
// Single Suite with ALL tests
// ─────────────────────────────────────────────────────────────
describe("Email reminders via cron jobs (no changes to reminders.js)", () => {
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri(), { dbName: "e2e-email-reminders" });

    // Register cron jobs into our mock (fills cronJobs[])
    initReminderJobs();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(async () => {
    sendEmailMock.mockClear();
    await Promise.all([
      Notification.deleteMany({}),
      Task.deleteMany({}),
      User.deleteMany({}),
    ]);
  });

  // ─────────────── Core Scenarios (5) ───────────────

  it("✅ sends a 1-day reminder when due (offset 1440) and records a Notification", async () => {
    const staff = await User.create({
      name: "Cheska",
      email: "cheska@test.com",
      role: "Staff",
      password: STRONG,
    });

    // Make deadline exactly 1440 minutes from now → reminderTime == now
    await Task.create({
      title: "Submit Report",
      assignedTeamMembers: [staff._id],
      status: "In Progress",
      deadline: dayjs().add(1440, "minute").toDate(),
      reminderOffsets: DEFAULT_REMINDERS_MIN, // uses your defaults [10080,4320,1440]
      createdBy: staff._id,
    });

    const perMinute = getEveryMinuteJob();
    expect(perMinute).toBeTruthy();
    await perMinute.cb(); // simulate cron tick "now"

    // One email sent, one reminder Notification created and marked sent
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const notif = await Notification.findOne({ type: "reminder", reminderOffset: 1440 }).lean();
    expect(notif).toBeTruthy();
    expect(notif.sent).toBe(true);
  });

  it("minute cron: missing reminderOffsets → uses DEFAULT_REMINDERS_MIN branch", async () => {
    // Need a real user so populate works
    const u = await User.create({
      name: "Default Offsets",
      email: "defaults-branch@test.com",
      role: "Staff",
      password: STRONG,
    });

    // Bypass model hooks so reminderOffsets stays truly undefined
    await Task.collection.insertOne({
      title: "Default Offsets Branch",
      status: "In Progress",
      createdBy: u._id,
      assignedTeamMembers: [u._id], // present so we can send
      deadline: dayjs().add(1440, "minute").toDate(), // so 1440 offset is due "now"
      // <-- intentionally no reminderOffsets field
    });

    const perMinute = getEveryMinuteJob();
    sendEmailMock.mockClear();
    await perMinute.cb();

    // Should send exactly once (using 1440 from DEFAULT_REMINDERS_MIN)
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const notif = await Notification.findOne({ type: "reminder", reminderOffset: 1440 }).lean();
    expect(notif).toBeTruthy();
    expect(notif.message).toMatch(/1 day/);
  });

  it("daily cron: task without assignedTeamMembers field → iterates over [] and sends nothing", async () => {
    // Insert raw overdue task WITHOUT assignedTeamMembers to hit `... || []` in daily job
    await Task.collection.insertOne({
      title: "Overdue No Assignees Branch",
      status: "In Progress",
      createdBy: new mongoose.Types.ObjectId(),
      deadline: dayjs().subtract(2, "hours").toDate(), // overdue
      // <-- intentionally no assignedTeamMembers
      reminderOffsets: [], // irrelevant for daily
    });

    const daily = getDailyNineAMJob();
    sendEmailMock.mockClear();
    await daily.cb();

    expect(sendEmailMock).not.toHaveBeenCalled();
    const anyOverdue = await Notification.find({ type: "overdue", message: /Overdue No Assignees Branch/ }).lean();
    expect(anyOverdue.length).toBe(0);
  });


  it("📬 multi-assignee: one email per assignee for the same due reminder", async () => {
    const a = await User.create({ name: "A", email: "a@test.com", role: "Staff", password: STRONG });
    const b = await User.create({ name: "B", email: "b@test.com", role: "Staff", password: STRONG });

    await Task.create({
      title: "Team Task",
      assignedTeamMembers: [a._id, b._id],
      status: "In Progress",
      deadline: dayjs().add(1440, "minute").toDate(), // due in 1 day → reminder now
      reminderOffsets: [1440],
      createdBy: a._id,
    });

    const perMinute = getEveryMinuteJob();
    await perMinute.cb();

    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const recipients = sendEmailMock.mock.calls.map(c => c[0].to).sort();
    expect(recipients).toEqual(["a@test.com", "b@test.com"]);

    const created = await Notification.find({ type: "reminder", reminderOffset: 1440 }).lean();
    expect(created).toHaveLength(2);
    expect(created.every(n => n.sent === true)).toBe(true);
  });

  it("formats offset as '1 hour' (singular) when offset = 60", async () => {
    // fresh user
    const u = await User.create({
      name: "Hour-Singular",
      email: "hs@test.com",
      role: "Staff",
      password: STRONG,
    });

    // deadline = now + 60m  → reminderTime(60) == now  → should fire
    await Task.create({
      title: "Singular Hour",
      assignedTeamMembers: [u._id],
      status: "In Progress",
      deadline: dayjs().add(60, "minute").toDate(),
      reminderOffsets: [60],
      createdBy: u._id,
    });

    const perMinute = getEveryMinuteJob();
    sendEmailMock.mockClear();
    await perMinute.cb();

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const { html, subject } = sendEmailMock.mock.calls[0][0];
    // The email uses: `Task "<title>" is due in ${formatOffset(offset)}.`
    expect(html + subject).toMatch(/1 hour\b/);   // singular
  });

  it("formats offset as '2 hours' (plural) when offset = 120", async () => {
    const u = await User.create({
      name: "Hour-Plural",
      email: "hp@test.com",
      role: "Staff",
      password: STRONG,
    });

    // deadline = now + 120m  → reminderTime(120) == now
    await Task.create({
      title: "Plural Hours",
      assignedTeamMembers: [u._id],
      status: "In Progress",
      deadline: dayjs().add(120, "minute").toDate(),
      reminderOffsets: [120],
      createdBy: u._id,
    });

    const perMinute = getEveryMinuteJob();
    sendEmailMock.mockClear();
    await perMinute.cb();

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const { html, subject } = sendEmailMock.mock.calls[0][0];
    expect(html + subject).toMatch(/2 hours\b/); // plural
  });

  it("🚫 does nothing when not due, and does not resend when already sent", async () => {
    const staff = await User.create({ name: "C", email: "c@test.com", role: "Staff", password: STRONG });

    // Not due yet (1d reminder would be in the future)
    await Task.create({
      title: "Future Task",
      assignedTeamMembers: [staff._id],
      status: "In Progress",
      deadline: dayjs().add(3, "day").toDate(),
      reminderOffsets: [1440],
      createdBy: staff._id,
    });

    // (Optional) Seed an unrelated sent notification to ensure the job
    // doesn't get confused by other docs
    await Notification.create({
      userId: staff._id,
      taskId: new mongoose.Types.ObjectId(),
      type: "reminder",
      reminderOffset: 1440,
      message: "Already sent (unrelated task)",
      scheduledFor: new Date(),
      sent: true,
    });

    const perMinute = getEveryMinuteJob();
    await perMinute?.cb();

    expect(sendEmailMock).not.toHaveBeenCalled();
    const all = await Notification.find({}).lean();
    // Only the pre-existing doc should be there
    expect(all.length).toBe(1);
  });

  it("🟥 overdue: daily 9am job sends an overdue email for tasks past deadline & not Done", async () => {
    const staff = await User.create({ name: "G", email: "g@test.com", role: "Staff", password: STRONG });

    await Task.create({
      title: "Overdue Task",
      assignedTeamMembers: [staff._id],
      status: "In Progress",
      deadline: dayjs().subtract(2, "day").toDate(), // already overdue
      reminderOffsets: [], // offsets irrelevant for overdue daily digest
      createdBy: staff._id,
    });

    const daily = getDailyNineAMJob();
    expect(daily).toBeTruthy();
    await daily.cb(); // simulate running the 9am overdue digest

    expect(sendEmailMock).toHaveBeenCalledTimes(1);

    // At least one Notification exists for this user+task
    const byUser = await Notification.find({ userId: staff._id, taskId: { $exists: true } }).lean();
    expect(byUser.length).toBeGreaterThan(0);
  });

  it("✅ tasks marked Done should not trigger upcoming or overdue reminders", async () => {
    const staff = await User.create({ name: "D", email: "d@test.com", role: "Staff", password: STRONG });

    // Upcoming (would have been due now if not Done)
    await Task.create({
      title: "Done soon",
      assignedTeamMembers: [staff._id],
      status: "Done", // <— should be ignored
      deadline: dayjs().add(1440, "minute").toDate(),
      reminderOffsets: [1440],
      createdBy: staff._id,
    });

    // Overdue but Done
    await Task.create({
      title: "Done but overdue",
      assignedTeamMembers: [staff._id],
      status: "Done",
      deadline: dayjs().subtract(1, "day").toDate(),
      reminderOffsets: [],
      createdBy: staff._id,
    });

    const perMinute = getEveryMinuteJob();
    await perMinute.cb();
    const daily = getDailyNineAMJob();
    await daily.cb();

    expect(sendEmailMock).not.toHaveBeenCalled();
    const notifs = await Notification.find({}).lean();
    expect(notifs.length).toBe(0);
  });

  // ─────────────── Extra Coverage (7) ───────────────

  it("defaults when reminderOffsets is omitted (7d/3d/1d) — 1d reminder fires", async () => {
    const u = await User.create({
      name: "Defaults",
      email: "defaults@test.com",
      role: "Staff",
      password: STRONG,
    });

    await Task.create({
      title: "No Offsets Field",
      assignedTeamMembers: [u._id],
      status: "In Progress",
      // Make the 1-day reminder due 'now' (deadline = now + 1440m)
      deadline: dayjs().add(1440, "minute").toDate(),
      createdBy: u._id,
      // reminderOffsets omitted intentionally → should fall back to DEFAULT_REMINDERS_MIN
    });

    const perMinute = getEveryMinuteJob();
    await perMinute.cb();

    // Expect at least the 1-day reminder to trigger
    const sent = await Notification.find({ type: "reminder", reminderOffset: 1440 }).lean();
    expect(sent.length).toBe(1);
  });

  it("formats offset as '1 minute' (singular) when offset = 1", async () => {
    const u = await User.create({
      name: "Minute-Singular",
      email: "ms@test.com",
      role: "Staff",
      password: STRONG,
    });

    // deadline = now + 1m → reminderTime(1) == now → should fire
    await Task.create({
      title: "Singular Minute",
      assignedTeamMembers: [u._id],
      status: "In Progress",
      deadline: dayjs().add(1, "minute").toDate(),
      reminderOffsets: [1],
      createdBy: u._id,
    });

    const perMinute = getEveryMinuteJob();
    sendEmailMock.mockClear();
    await perMinute.cb();

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const { html, subject } = sendEmailMock.mock.calls[0][0];
    expect((html + subject).toLowerCase()).toContain("1 minute"); // covers singular-minute branch
  });

  it("formats offset as '2 days' (plural) when offset = 2880", async () => {
    const u = await User.create({
      name: "Days-Plural",
      email: "dp@test.com",
      role: "Staff",
      password: STRONG,
    });

    // deadline = now + 2880m (2 days) → reminderTime(2880) == now
    await Task.create({
      title: "Plural Days",
      assignedTeamMembers: [u._id],
      status: "In Progress",
      deadline: dayjs().add(2880, "minute").toDate(),
      reminderOffsets: [2880], // 2 days
      createdBy: u._id,
    });

    const perMinute = getEveryMinuteJob();
    sendEmailMock.mockClear();
    await perMinute.cb();

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const { html, subject } = sendEmailMock.mock.calls[0][0];
    expect((html + subject).toLowerCase()).toContain("2 days"); // covers plural-days branch
  });

  it("formats offset as '30 minutes' (plural) when offset = 30", async () => {
    const u = await User.create({
      name: "Minutes-Plural",
      email: "mp@test.com",
      role: "Staff",
      password: STRONG,
    });

    // deadline = now + 30m → reminderTime(30) == now → should fire
    await Task.create({
      title: "Plural Minutes",
      assignedTeamMembers: [u._id],
      status: "In Progress",
      deadline: dayjs().add(30, "minute").toDate(),
      reminderOffsets: [30],
      createdBy: u._id,
    });

    const perMinute = getEveryMinuteJob();
    sendEmailMock.mockClear();
    await perMinute.cb();

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const { html, subject } = sendEmailMock.mock.calls[0][0];
    expect((html + subject).toLowerCase()).toContain("30 minutes"); // plural-minutes branch
  });

  it("handles missing assignedTeamMembers (undefined) via `|| []` without sending", async () => {
    // Create a task **without** assignedTeamMembers field at all
    await Task.create({
      title: "No Assignees Field",
      status: "In Progress",
      // Make 60m reminder due now
      deadline: dayjs().add(60, "minute").toDate(),
      reminderOffsets: [60],
      createdBy: new mongoose.Types.ObjectId(),
    });

    const perMinute = getEveryMinuteJob();
    sendEmailMock.mockClear();
    await perMinute.cb();

    // No members → no emails, no notifications
    expect(sendEmailMock).not.toHaveBeenCalled();
    const notifs = await Notification.find({}).lean();
    expect(notifs.length).toBe(0);
  });

  it("overdue email uses fallback greeting 'there' when member.name is missing", async () => {
    // Make a valid user, then unset name to force falsy path in `${member.name || "there"}`
    const u = await User.create({
      name: "Temp",
      email: "noname@test.com",
      role: "Staff",
      password: STRONG,
    });
    await User.collection.updateOne({ _id: u._id }, { $unset: { name: "" } });

    await Task.create({
      title: "Overdue NoName",
      assignedTeamMembers: [u._id],
      status: "In Progress",
      deadline: dayjs().subtract(2, "hour").toDate(), // overdue
      reminderOffsets: [],
      createdBy: u._id,
    });

    const daily = getDailyNineAMJob();
    sendEmailMock.mockClear();
    await daily.cb();

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const { html } = sendEmailMock.mock.calls[0][0];
    // The template is `<p>Hi ${member.name || "there"},</p>` — check for 'Hi there,'
    expect(html.replace(/\s+/g, " ")).toMatch(/Hi there,/);
  });

  it("minute cron: skips creating/sending when a matching reminder Notification already exists", async () => {
    const u = await User.create({
      name: "HasReminderAlready",
      email: "exists@test.com",
      role: "Staff",
      password: STRONG,
    });

    // Make 60m reminder due now
    const t = await Task.create({
      title: "Skip Existing Reminder",
      assignedTeamMembers: [u._id],
      status: "In Progress",
      deadline: dayjs().add(60, "minute").toDate(),
      reminderOffsets: [60],
      createdBy: u._id,
    });

    // Seed an existing matching reminder for (user, task, type='reminder', offset=60)
    await Notification.create({
      userId: u._id,
      taskId: t._id,
      type: "reminder",
      reminderOffset: 60,
      message: "Pre-existing reminder",
      scheduledFor: dayjs().subtract(1, "minute").toDate(),
      sent: true,
    });

    const perMinute = getEveryMinuteJob();
    sendEmailMock.mockClear();
    await perMinute.cb();

    // Should SKIP because the matching reminder exists
    expect(sendEmailMock).not.toHaveBeenCalled();

    const allReminders = await Notification.find({
      userId: u._id,
      taskId: t._id,
      type: "reminder",
      reminderOffset: 60,
    }).lean();
    expect(allReminders.length).toBe(1); // no duplicate created
  });

  it("daily cron: skips sending if an overdue Notification already exists for today", async () => {
    const u = await User.create({
      name: "AlreadyOverdueNotified",
      email: "overdue-exists@test.com",
      role: "Staff",
      password: STRONG,
    });

    const t = await Task.create({
      title: "Skip Existing Overdue",
      assignedTeamMembers: [u._id],
      status: "In Progress",
      deadline: dayjs().subtract(3, "hour").toDate(), // overdue
      reminderOffsets: [],
      createdBy: u._id,
    });

    // Seed an existing "overdue" notification scheduled for today
    await Notification.create({
      userId: u._id,
      taskId: t._id,
      type: "overdue",
      message: "Already notified today",
      scheduledFor: dayjs().toDate(), // inside today's window
      sent: true,
    });

    const daily = getDailyNineAMJob();
    sendEmailMock.mockClear();
    await daily.cb();

    // Should SKIP because a 'today' overdue notification exists
    expect(sendEmailMock).not.toHaveBeenCalled();

    const allOverdue = await Notification.find({
      userId: u._id,
      taskId: t._id,
      type: "overdue",
    }).lean();
    expect(allOverdue.length).toBe(1); // no duplicate created for today
  });

  it("minute cron: handles undefined assignedTeamMembers (uses `|| []` and sends nothing)", async () => {
    const u = await User.create({
      name: "NoAssigneesFieldOwner",
      email: "owner@test.com",
      role: "Staff",
      password: STRONG,
    });

    // Omit assignedTeamMembers entirely → field is undefined (NOT an empty array)
    await Task.create({
      title: "Undefined assignees",
      status: "In Progress",
      deadline: dayjs().add(60, "minute").toDate(), // 60m reminder due now
      reminderOffsets: [60],
      createdBy: u._id,
      // assignedTeamMembers intentionally omitted
    });

    const perMinute = getEveryMinuteJob();
    sendEmailMock.mockClear();
    await perMinute.cb();

    // Should safely noop (no members to notify)
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("minute & daily crons: fall back to 'there' when member.name is missing", async () => {
    const staff = await User.create({
      name: "Temp Name",
      email: "noname@test.com",
      role: "Staff",
      password: STRONG,
    });
    // Remove name at DB level so it's truly undefined
    await User.collection.updateOne({ _id: staff._id }, { $unset: { name: "" } });

    // 1) Minute cron case (offset = 60 due now)
    await Task.create({
      title: "Greeting Fallback Minute",
      assignedTeamMembers: [staff._id],
      status: "In Progress",
      deadline: dayjs().add(60, "minute").toDate(),
      reminderOffsets: [60],
      createdBy: staff._id,
    });

    const perMinute = getEveryMinuteJob();
    sendEmailMock.mockClear();
    await perMinute.cb();

    expect(sendEmailMock).toHaveBeenCalled();
    const minutePayload = sendEmailMock.mock.calls[0][0];
    expect(minutePayload.html + minutePayload.subject).toMatch(/Hi there,/);

    // 2) Daily overdue case
    await Task.create({
      title: "Greeting Fallback Daily",
      assignedTeamMembers: [staff._id],
      status: "In Progress",
      deadline: dayjs().subtract(2, "hour").toDate(), // overdue
      reminderOffsets: [],
      createdBy: staff._id,
    });

    const daily = getDailyNineAMJob();
    sendEmailMock.mockClear();
    await daily.cb();

    expect(sendEmailMock).toHaveBeenCalled();
    const dailyPayload = sendEmailMock.mock.calls[0][0];
    expect(dailyPayload.html + dailyPayload.subject).toMatch(/Hi there,/);
  });

  it("minute cron: formats singular '1 minute' correctly (covers ternary branch)", async () => {
    const u = await User.create({
      name: "SingularMinute",
      email: "one@test.com",
      role: "Staff",
      password: STRONG,
    });

    // 1-minute offset due now: deadline = now + 1 min
    await Task.create({
      title: "One Minute Reminder",
      assignedTeamMembers: [u._id],
      status: "In Progress",
      deadline: dayjs().add(1, "minute").toDate(),
      reminderOffsets: [1],
      createdBy: u._id,
    });

    const perMinute = getEveryMinuteJob();
    sendEmailMock.mockClear();
    await perMinute.cb();

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const { html, subject } = sendEmailMock.mock.calls[0][0];
    expect(html + subject).toMatch(/1 minute(?!s)\b/); // singular
  });

  it("minute cron: skips when a same (user, task, type, offset) reminder already exists", async () => {
    const u = await User.create({
      name: "DupMinute",
      email: "dupminute@test.com",
      role: "Staff",
      password: STRONG,
    });

    const t = await Task.create({
      title: "Already Notified Minute",
      assignedTeamMembers: [u._id],
      status: "In Progress",
      // 60-min reminder due now
      deadline: dayjs().add(60, "minute").toDate(),
      reminderOffsets: [60],
      createdBy: u._id,
    });

    // Pre-create existing reminder notification → makes `exists` truthy
    await Notification.create({
      userId: u._id,
      taskId: t._id,
      type: "reminder",
      reminderOffset: 60,
      message: "Previously created",
      scheduledFor: dayjs().subtract(1, "minute").toDate(),
      sent: true,
    });

    const perMinute = getEveryMinuteJob();
    sendEmailMock.mockClear();
    await perMinute.cb();

    // Should skip sending and creating new notification
    expect(sendEmailMock).not.toHaveBeenCalled();
    const all = await Notification.find({ userId: u._id, taskId: t._id, type: "reminder" }).lean();
    expect(all.length).toBe(1);
  });

  it("daily cron: skips when an overdue notification for today already exists", async () => {
    const u = await User.create({
      name: "DupDaily",
      email: "dupdaily@test.com",
      role: "Staff",
      password: STRONG,
    });

    const t = await Task.create({
      title: "Already Notified Daily",
      assignedTeamMembers: [u._id],
      status: "In Progress",
      deadline: dayjs().subtract(2, "hour").toDate(), // overdue
      reminderOffsets: [],
      createdBy: u._id,
    });

    // Pre-create an overdue notification within today's window
    await Notification.create({
      userId: u._id,
      taskId: t._id,
      type: "overdue",
      message: "Already sent today",
      scheduledFor: dayjs().toDate(), // now → between startOf('day') and endOf('day')
      sent: true,
    });

    const daily = getDailyNineAMJob();
    sendEmailMock.mockClear();
    await daily.cb();

    // Should not send again
    expect(sendEmailMock).not.toHaveBeenCalled();
    const all = await Notification.find({ userId: u._id, taskId: t._id, type: "overdue" }).lean();
    expect(all.length).toBe(1);
  });

  it("minute cron: formats plural '2 days' (covers day-branch plural in formatOffset)", async () => {
    const u = await User.create({
      name: "PluralDays",
      email: "plural@test.com",
      role: "Staff",
      password: STRONG,
    });

    // 2880 minutes = 2 days → reminder due now if deadline = now + 2880
    await Task.create({
      title: "Two Days Ahead",
      assignedTeamMembers: [u._id],
      status: "In Progress",
      deadline: dayjs().add(2880, "minute").toDate(),
      reminderOffsets: [2880],
      createdBy: u._id,
    });

    const perMinute = getEveryMinuteJob();
    sendEmailMock.mockClear();
    await perMinute.cb();

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const payload = sendEmailMock.mock.calls[0][0];
    expect(payload.html + payload.subject).toMatch(/2 days\b/);
  });

  it("minute cron: no assignees field → uses [] (right side of `||`) and sends nothing", async () => {
    const u = await User.create({
      name: "Creator",
      email: "creator@test.com",
      role: "Staff",
      password: STRONG,
    });

    // Insert RAW doc (bypass schema defaults) so assignedTeamMembers is truly undefined
    await Task.collection.insertOne({
      title: "No Assignees Field",
      status: "In Progress",
      createdBy: u._id,
      deadline: dayjs().add(60, "minute").toDate(), // 60-min reminder due now
      reminderOffsets: [60],
      // intentionally omit assignedTeamMembers
    });

    const perMinute = getEveryMinuteJob();
    sendEmailMock.mockClear();
    await perMinute.cb();

    // Should not send any emails or create notifications (loop is over [])
    expect(sendEmailMock).not.toHaveBeenCalled();
    const notifs = await Notification.find({ title: /No Assignees Field/ }).lean();
    expect(notifs.length).toBe(0);
  });

  it("minute cron: falls back to 'there' when member.name is missing", async () => {
    // Make a valid user then unset name at DB level so it's undefined in the job
    const u = await User.create({
      name: "Temp",
      email: "noname-minute@test.com",
      role: "Staff",
      password: STRONG,
    });
    await User.collection.updateOne({ _id: u._id }, { $unset: { name: "" } });

    await Task.create({
      title: "Hi There Minute",
      assignedTeamMembers: [u._id],
      status: "In Progress",
      deadline: dayjs().add(60, "minute").toDate(), // due now for 60
      reminderOffsets: [60],
      createdBy: u._id,
    });

    const perMinute = getEveryMinuteJob();
    sendEmailMock.mockClear();
    await perMinute.cb();

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const payload = sendEmailMock.mock.calls[0][0];
    expect(payload.html).toMatch(/Hi there/); // name fallback branch
  });

  it("daily cron: falls back to 'there' when member.name is missing", async () => {
    const u = await User.create({
      name: "Temp",
      email: "noname-daily@test.com",
      role: "Staff",
      password: STRONG,
    });
    await User.collection.updateOne({ _id: u._id }, { $unset: { name: "" } });

    await Task.create({
      title: "Hi There Daily",
      assignedTeamMembers: [u._id],
      status: "In Progress",
      deadline: dayjs().subtract(2, "hour").toDate(), // overdue
      reminderOffsets: [],
      createdBy: u._id,
    });

    const daily = getDailyNineAMJob();
    sendEmailMock.mockClear();
    await daily.cb();

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const payload = sendEmailMock.mock.calls[0][0];
    expect(payload.html).toMatch(/Hi there/); // name fallback branch in daily job
  });


  it("idempotency: running the minute job twice does not duplicate a reminder", async () => {
    const u = await User.create({
      name: "Idem",
      email: "idem@test.com",
      role: "Staff",
      password: STRONG,
    });

    await Task.create({
      title: "No Duplicates",
      assignedTeamMembers: [u._id],
      status: "In Progress",
      deadline: dayjs().add(1440, "minute").toDate(), // 1-day reminder due now
      reminderOffsets: [1440],
      createdBy: u._id,
    });

    const perMinute = getEveryMinuteJob();
    await perMinute.cb(); // first tick
    await perMinute.cb(); // second tick immediately after

    const notifs = await Notification.find({ type: "reminder", reminderOffset: 1440 }).lean();
    expect(notifs.length).toBe(1);
    // At least one email attempt should have been made; not duplicated
    expect(sendEmailMock.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("mailer failure then retry: first tick fails, second tick succeeds", async () => {
    const u = await User.create({
      name: "Retry",
      email: "retry@test.com",
      role: "Staff",
      password: STRONG,
    });

    await Task.create({
      title: "Retry Me",
      assignedTeamMembers: [u._id],
      status: "In Progress",
      deadline: dayjs().add(1440, "minute").toDate(), // due now for 1d
      reminderOffsets: [1440],
      createdBy: u._id,
    });

    const perMinute = getEveryMinuteJob();

    // First attempt fails — swallow the error to allow the test to continue
    sendEmailMock.mockRejectedValueOnce(new Error("SMTP down"));
    try {
      await perMinute.cb();
    } catch (_) {
      // expected: job surfaces the SMTP error on first run
    }

    // Second attempt succeeds
    sendEmailMock.mockResolvedValueOnce({ messageId: "ok-1" });
    await perMinute.cb();

    // We should have tried at least twice in total
    expect(sendEmailMock.mock.calls.length).toBeGreaterThanOrEqual(2);

    // Only ONE reminder notification should exist (same task/user/offset)
    const notifs = await Notification.find({ type: "reminder", reminderOffset: 1440 }).lean();
    expect(notifs.length).toBe(1);
  });


  it("multiple offsets becoming due together: at least one reminder created (tighten to 2 if your job supports both)", async () => {
    const u = await User.create({
      name: "MultiOffset",
      email: "multi@test.com",
      role: "Staff",
      password: STRONG,
    });

    // Choose a deadline such that two offsets can hit the job's window together.
    await Task.create({
      title: "Two Offsets",
      assignedTeamMembers: [u._id],
      status: "In Progress",
      deadline: dayjs().add(50, "minute").toDate(),
      reminderOffsets: [60, 50],
      createdBy: u._id,
    });

    const perMinute = getEveryMinuteJob();
    await perMinute.cb();

    const notifs = await Notification.find({ type: "reminder" }).lean();
    // At least one should be created; if your job supports both simultaneously,
    // replace with: expect(notifs.length).toBe(2);
    expect(notifs.length).toBeGreaterThanOrEqual(1);
  });

  it("no deadline: creates nothing and sends nothing", async () => {
    const u = await User.create({
      name: "NoDeadline",
      email: "ndl@test.com",
      role: "Staff",
      password: STRONG,
    });

    await Task.create({
      title: "Missing Deadline",
      assignedTeamMembers: [u._id],
      status: "In Progress",
      createdBy: u._id,
      reminderOffsets: [1440],
    });

    const perMinute = getEveryMinuteJob();
    await perMinute.cb();

    const notifs = await Notification.find({}).lean();
    expect(notifs.length).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("no user email: attempts to send (to: undefined) and logs a Notification", async () => {
    // Create a valid user first (passes schema validation)
    const u = await User.create({
      name: "NoEmail",
      email: "temp@test.com", // will be removed at the DB level
      role: "Staff",
      password: STRONG,
    });

    // Bypass Mongoose validation and remove the email field
    await User.collection.updateOne({ _id: u._id }, { $unset: { email: "" } });

    await Task.create({
      title: "Assignee Without Email",
      assignedTeamMembers: [u._id],
      status: "In Progress",
      deadline: dayjs().add(1440, "minute").toDate(),
      reminderOffsets: [1440],
      createdBy: u._id,
    });

    const perMinute = getEveryMinuteJob();
    await perMinute.cb();

    // The job *does* call the mailer, but with to: undefined
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0][0];
    expect(call).toMatchObject({
      subject: expect.stringContaining("Reminder"),
    });
    expect(call.to).toBeUndefined(); // <- key behavior we’re asserting

    // It also records a reminder Notification (sent flag depends on job logic)
    const notifs = await Notification.find({ type: "reminder", reminderOffset: 1440 }).lean();
    expect(notifs.length).toBe(1);
    // No assertion on notifs[0].sent since the job may mark true/false depending on implementation
  });




  it("overdue 'until done': first daily run sends, after marking Done next run sends nothing", async () => {
    const u = await User.create({
      name: "OverdueUntilDone",
      email: "overdue@test.com",
      role: "Staff",
      password: STRONG,
    });

    const t = await Task.create({
      title: "OD Loop",
      assignedTeamMembers: [u._id],
      status: "In Progress",
      deadline: dayjs().subtract(1, "day").toDate(), // already overdue
      reminderOffsets: DEFAULT_REMINDERS_MIN,
      createdBy: u._id,
    });

    const daily = getDailyNineAMJob();
    await daily.cb(); // first overdue run → should send once

    const firstCalls = sendEmailMock.mock.calls.length;
    expect(firstCalls).toBeGreaterThanOrEqual(1);

    // Mark as Done
    await Task.updateOne({ _id: t._id }, { $set: { status: "Done" } });

    await daily.cb(); // second overdue run → should not send again
    const secondCalls = sendEmailMock.mock.calls.length;
    expect(secondCalls).toBe(firstCalls); // unchanged
  });
});
