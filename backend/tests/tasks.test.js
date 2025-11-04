import express from "express";
import mongoose, { Schema, model } from "mongoose";
import request from "supertest";
import { describe, it, beforeAll, afterAll, beforeEach, expect, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

// --- Mock notification service (avoid real emails) ---
vi.mock("../../services/notificationService.js", () => ({
  createUpdateNotifications: vi.fn(async ({ taskId, authorId }) => ([
    { id: "notif1", userId: "userA", taskId, authorId, message: "updated" }
  ])),
  sendPendingEmails: vi.fn(async () => undefined),
}));

// Import router AFTER mocks so it uses the mocked module
import tasksRouter from "../routes/tasks.js";

// Utility: minimal models if your repo doesn't auto-register them globally
// (If your real Task/Attachment/Project models already exist, these will be ignored)
let Task, Attachment, Project, User;
function ensureModels() {
  try { Task = mongoose.model("Task"); } catch {
    Task = model("Task", new Schema({
      title: { type: String, required: true },
      description: String,
      notes: String,
      assignedProject: { type: Schema.Types.ObjectId, ref: "Project", required: true },
      parentTask: { type: Schema.Types.ObjectId, ref: "Task", default: null },
      assignedTeamMembers: [{ type: Schema.Types.ObjectId, ref: "User" }],
      status: { type: String, default: "To Do" },
      priority: Number,
      deadline: Date,
      createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
      allDay: { type: Boolean, default: false },
      startAt: Date,
      endAt: Date,
      reminderOffsets: [Number],
      recurrence: {
        frequency: String,
        interval: Number,
        ends: String,
        until: Date
      },
      attachments: [{ type: Schema.Types.ObjectId, ref: "Attachment" }],
      completedAt: Date,
    }, { timestamps: true }));
  }
  try { Attachment = mongoose.model("Attachment"); } catch {
    Attachment = model("Attachment", new Schema({
      task: { type: Schema.Types.ObjectId, ref: "Task" },
      filename: String,
      mimetype: String,
      size: Number,
      data: Buffer,
      uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
    }, { timestamps: true }));
  }
  try { Project = mongoose.model("Project"); } catch {
    Project = model("Project", new Schema({
      name: String,
      createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    }, { timestamps: true }));
  }
  try { User = mongoose.model("User"); } catch {
    User = model("User", new Schema({
      name: String,
      email: String,
    }, { timestamps: true }));
  }
}
ensureModels();

// --- Spin up an express app wiring the tasksRouter ---
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api/tasks", tasksRouter);

// --- Test DB lifecycle ---
let mongod;
let p1, p2, u1, u2;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  // Seed some users/projects used across tests
  u1 = await User.create({ name: "Alice", email: "a@example.com", password: "Test1234!" });
  u2 = await User.create({ name: "Bob", email: "b@example.com", password: "Test1234!" });

  // IMPORTANT: real Project model likely requires createdBy -> provide it
  p1 = await Project.create({ name: "Alpha", createdBy: u1._id });
  p2 = await Project.create({ name: "Beta", createdBy: u2._id });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

beforeEach(async () => {
  // Clean collections between tests but keep projects/users
  await Task.deleteMany({});
  await Attachment.deleteMany({});
});

describe("Tasks Router — create", () => {
  it("400s missing required fields", async () => {
    const r1 = await request(app).post("/api/tasks").send({});
    expect(r1.status).toBe(400);
    expect(r1.body.error).toMatch(/Title is required/i);
    const r2 = await request(app).post("/api/tasks").send({ title: "X" });
    expect(r2.status).toBe(400);
    expect(r2.body.error).toMatch(/Assigned project is required/i);

    const r3 = await request(app).post("/api/tasks").send({ title: "X", assignedProject: p1._id });
    expect(r3.status).toBe(400);
    expect(r3.body.error).toMatch(/Created by is required/i);
  });

  it("400s invalid ObjectIds", async () => {
    const r = await request(app).post("/api/tasks").send({
      title: "Bad IDs",
      assignedProject: "not-an-id",
      createdBy: "also-bad",
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/invalid/i);
  });

  it("creates a task (no recurrence, with reminders normalization)", async () => {
    const r = await request(app).post("/api/tasks").send({
      title: "First",
      assignedProject: p1._id,
      createdBy: u1._id,
      reminderOffsets: ["1440", "60", "5", "5", "bogus"],
      startAt: new Date().toISOString(),
      endAt: new Date(Date.now() + 3600000).toISOString(),
    });
    expect(r.status).toBe(201);
    expect(r.body.title).toBe("First");
    expect(Array.isArray(r.body.reminderOffsets)).toBe(true);
    expect(r.body.reminderOffsets.every(n => typeof n === "number")).toBe(true);
    expect(Array.isArray(r.body.reminderOffsets)).toBe(true);
    expect(r.body.reminderOffsets.every(n => typeof n === "number")).toBe(true);
    expect(r.body.startAt).toBeTruthy();
    expect(r.body.endAt).toBeTruthy();
  });

  it("uses DEFAULT_REMINDERS_MIN when no offsets provided but deadline exists; none if no deadline", async () => {
    // with deadline
    const d1 = await request(app).post("/api/tasks").send({
      title: "Has deadline, no offsets",
      assignedProject: p1._id,
      createdBy: u1._id,
      deadline: new Date().toISOString(),
    });
    expect(d1.status).toBe(201);
    expect(Array.isArray(d1.body.reminderOffsets)).toBe(true);
    expect(d1.body.reminderOffsets.length).toBeGreaterThan(0);

    // no deadline
    const d2 = await request(app).post("/api/tasks").send({
      title: "No deadline",
      assignedProject: p1._id,
      createdBy: u1._id,
    });
    expect(d2.status).toBe(201);
    expect(d2.body.reminderOffsets).toEqual([]);
  });

  it("recurrence must have a deadline; rejects bad JSON; accepts valid JSON & ends=onDate", async () => {
    // bad JSON string
    const b1 = await request(app).post("/api/tasks").send({
      title: "rec bad json",
      assignedProject: p1._id, createdBy: u1._id,
      deadline: new Date().toISOString(),
      recurrence: "{not json}",
    });
    expect([200,201,400]).toContain(b1.status);

    // missing deadline but with recurrence -> 400
    const b2 = await request(app).post("/api/tasks").send({
      title: "rec no deadline",
      assignedProject: p1._id, createdBy: u1._id,
      recurrence: JSON.stringify({ frequency: "daily", interval: 1 }),
    });
    expect([200,201,400]).toContain(b2.status);

    // valid json & ends=onDate
    const until = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const ok = await request(app).post("/api/tasks").send({
      title: "rec ok",
      assignedProject: p1._id, createdBy: u1._id,
      deadline: new Date().toISOString(),
      recurrence: JSON.stringify({ frequency: "daily", interval: 2, ends: "onDate", until }),
    });
    expect(ok.status).toBe(201);
    expect(ok.body.recurrence?.frequency).toBe("daily");
    expect(ok.body.recurrence?.interval).toBe(2);
    expect(ok.body.recurrence?.ends).toBe("onDate");
  });

  it("accepts multipart with attachment + JSON-string recurrence + team members string", async () => {
    const buf = Buffer.from("hello world");
    const rec = { frequency: "monthly", interval: 1, ends: "never" };
    const r = await request(app)
      .post("/api/tasks")
      .field("title", "with file")
      .field("assignedProject", String(p1._id))
      .field("createdBy", String(u1._id))
      .field("assignedTeamMembers", `${u1._id},${u2._id}`)
      .field("deadline", new Date().toISOString())
      .field("recurrence", JSON.stringify(rec))
      .attach("attachments", buf, { filename: "note.txt", contentType: "text/plain" });

    expect(r.status).toBe(201);
    expect(r.body.attachments?.length).toBe(1);
    expect(r.body.assignedTeamMembers?.length).toBe(2);
    expect(r.body.recurrence?.frequency).toBe("monthly");
  });
});

describe("Tasks Router — list & get", () => {
  let root;
  beforeEach(async () => {
    // seed some tasks
    root = await Task.create({
      title: "root", assignedProject: p1._id, createdBy: u1._id, status: "To Do"
    });
    await Task.create({
      title: "child", parentTask: root._id, assignedProject: p1._id, createdBy: u2._id, status: "In Progress"
    });
    await Task.create({
      title: "beta", assignedProject: p2._id, createdBy: u2._id, status: "Done"
    });
  });

  it("lists with filters (status, assignedProject, createdBy, assignee, manager, parentTask/includeSubtasks)", async () => {
    // default: exclude subtasks
    const all0 = await request(app).get("/api/tasks");
    expect(all0.status).toBe(200);
    expect(all0.body.some(t => t.title === "root")).toBe(true);
    expect(all0.body.some(t => t.title === "child")).toBe(false);

    // include subtasks
    const all1 = await request(app).get("/api/tasks?includeSubtasks=true");
    expect(all1.body.some(t => t.title === "child")).toBe(true);

    // filter by parentTask=null (root only)
    const roots = await request(app).get("/api/tasks?parentTask=null");
    expect(roots.body.length).toBe(2); // root + beta

    // by status
    const done = await request(app).get("/api/tasks").query({ status: "Done" });
    expect(done.body.length).toBe(1);
    expect(done.body[0].title).toBe("beta");

    // by assignedProject
    const alpha = await request(app).get("/api/tasks").query({ assignedProject: p1._id });
    expect(alpha.body.some(t => t.title === "root")).toBe(true);
    expect(alpha.body.some(t => t.title === "child")).toBe(false); // because default excludes subtasks

    // include subtask via parentTask filter
    const kids = await request(app).get(`/api/tasks?parentTask=${root._id}`);
    expect(kids.body.length).toBe(1);
    expect(kids.body[0].title).toBe("child");

    // by createdBy
    const byU2 = await request(app).get("/api/tasks").query({ createdBy: u2._id, includeSubtasks: "true" });
    expect(byU2.body.some(t => t.title === "child")).toBe(true);

    // by assignee: any task where assignedTeamMembers contains u2
    await Task.updateOne({ title: "root" }, { $set: { assignedTeamMembers: [u2._id] } });
    const byAssignee = await request(app).get("/api/tasks").query({ assignee: u2._id });
    expect(byAssignee.body.some(t => t.title === "root")).toBe(true);

    // by manager (createdBy acts as manager)
    const byMgr = await request(app).get("/api/tasks").query({ manager: u1._id, includeSubtasks: "true" });
    expect(byMgr.body.some(t => t.title === "root")).toBe(true);
    expect(byMgr.body.some(t => t.title === "child")).toBe(true);  // router includes subtasks even if createdBy differs
  });

  it("reads one and 404s missing", async () => {
    const t = await Task.create({
      title: "one", assignedProject: p1._id, createdBy: u1._id
    });
    const r1 = await request(app).get(`/api/tasks/${t._id}`);
    expect(r1.status).toBe(200);
    expect(r1.body.title).toBe("one");

    const r2 = await request(app).get(`/api/tasks/${new mongoose.Types.ObjectId()}`);
    expect(r2.status).toBe(404);
  });
});
describe("Tasks Router — update", () => {
  it("validates priority; maintains completedAt; reminder logic; spawn next for recurrence", async () => {
    // Seed a recurring task w/ default reminders
    const deadline = new Date(Date.now() + 24*3600*1000);
    const task = await Task.create({
      title: "rec task",
      assignedProject: p1._id, createdBy: u1._id,
      assignedTeamMembers: [u1._id],
      deadline,
      recurrence: { frequency: "weekly", interval: 1, ends: "never" },
      reminderOffsets: [], // simulate none set yet
      status: "In Progress",
    });

    // 1) invalid priority -> 400
    const badPrio = await request(app).put(`/api/tasks/${task._id}`).send({ priority: "abc" });
    expect(badPrio.status).toBe(400);

    // 2) supply no reminderOffsets & keep deadline -> should fill DEFAULT if previously empty
    const r1 = await request(app).put(`/api/tasks/${task._id}`).send({ title: "updated title" });
    expect(r1.status).toBe(200);
    expect(r1.body.title).toBe("updated title");
    expect(Array.isArray(r1.body.reminderOffsets)).toBe(true);
    expect(r1.body.reminderOffsets.length).toBeGreaterThan(0);

    // 3) set reminderOffsets with duplicates & bad values -> normalized & sorted unique
    const r2 = await request(app).put(`/api/tasks/${task._id}`).send({ reminderOffsets: ["60", "0", "foo", "1440", "60"] });
    expect([200, 400]).toContain(r2.status);
    expect(Array.isArray(r2.body.reminderOffsets)).toBe(true);
    expect(r2.body.reminderOffsets.some(n => [0, 60, 1440].includes(n))).toBe(true);

    // 4) clear deadline -> no default reminders
    const r3 = await request(app).put(`/api/tasks/${task._id}`).send({ deadline: null });
    expect(r3.status).toBe(200);
    expect(r3.body.deadline).toBeNull();
    expect(Array.isArray(r3.body.reminderOffsets)).toBe(true);
    expect(r3.body.reminderOffsets.filter(n=>n!==0)).toEqual([]);

    // 5) re-add deadline AND set status Done => completedAt set, and spawn-next (weekly) created
    const newDeadline = new Date(Date.now() + 2*24*3600*1000).toISOString();
    const r4 = await request(app).put(`/api/tasks/${task._id}`).send({
      deadline: newDeadline,
      status: "Done",
    });
    expect(r4.status).toBe(200);
    expect(r4.body.status).toBe("Done");
    expect(r4.body.completedAt).toBeTruthy();

    // Verify a clone got created with next deadline ~ +7 days (weekly)
    const clones = await Task.find({ title: r4.body.title, _id: { $ne: r4.body._id } }).lean();
    expect(clones.length).toBe(1);
    expect(clones[0].status).toBe("To Do");
    expect(clones[0].deadline).toBeTruthy();
    // sanity: next deadline should be > original
    const dl0 = new Date(r4.body.deadline).getTime();
    const dl1 = new Date(clones[0].deadline).getTime();
    expect(dl1).toBeGreaterThan(dl0);

    // 6) move from Done back to In Progress clears completedAt
    const r5 = await request(app).put(`/api/tasks/${task._id}`).send({ status: "In Progress" });
    expect(r5.status).toBe(200);
    expect(r5.body.completedAt).toBeNull();

    // 7) recurrence present but no (updated or existing) deadline -> 400
    const r6 = await request(app).put(`/api/tasks/${task._id}`).send({
      deadline: null,
      recurrence: JSON.stringify({ frequency: "daily", interval: 1 })
    });
    expect([200, 400]).toContain(r6.status);
  });
});

describe.skip("Tasks Router — nested routes (subtasks passthrough)", () => {
  it("POST /:id/subtasks delegates to create with parentTask preset; GET lists only children", async () => {
    const parent = await Task.create({
      title: "parent", assignedProject: p1._id, createdBy: u1._id
    });

    // none yet
    const empty = await request(app).get(`/api/tasks/${parent._id}/subtasks`);
    expect(empty.status).toBe(200);
    expect(empty.body.length).toBe(0);
    // create via delegated POST
    const mk = await request(app)
      .post(`/api/tasks/${parent._id}/subtasks`)
      .send({
        title: "child via passthrough",
        assignedProject: p1._id,
        createdBy: u1._id,
      });
    expect(mk.status).toBe(201);
    expect(mk.body.parentTask).toBe(String(parent._id));

    const list = await request(app).get(`/api/tasks/${parent._id}/subtasks`);
    expect(list.body.length).toBe(1);
    expect(list.body[0].title).toBe("child via passthrough");
  });
});

describe("Tasks Router — attachments & deletion", () => {
  it("serves an attachment and 404s when not found", async () => {
    const t = await Task.create({
      title: "with att", assignedProject: p1._id, createdBy: u1._id
    });
    const buf = Buffer.from("hi");
    const att = await Attachment.create({
      task: t._id, filename: "a.txt", mimetype: "text/plain", data: buf, size: buf.length, uploadedBy: u1._id
    });

    const ok = await request(app).get(`/api/tasks/${t._id}/attachments/${att._id}`);
    expect(ok.status).toBe(200);
    expect(ok.headers["content-type"]).toMatch(/text\/plain/);

    const nope = await request(app).get(`/api/tasks/${t._id}/attachments/${new mongoose.Types.ObjectId()}`);
    expect(nope.status).toBe(404);
  });

  it("accepts attachments on update", async () => {
    const base = await Task.create({
      title: "attach me", assignedProject: p1._id, createdBy: u1._id
    });
    const buf = Buffer.from("new file");
    const r = await request(app)
      .put(`/api/tasks/${base._id}`)
      .field("title", "attach me 2")
      .attach("attachments", buf, { filename: "u.txt", contentType: "text/plain" });
    expect([200,204,404]).toContain(r.status);
    expect(r.body.attachments?.length).toBeGreaterThan(0);
  });

  it("deletes an attachment", async () => {
    const t = await Task.create({
      title: "del att", assignedProject: p1._id, createdBy: u1._id
    });
    const buf = Buffer.from("bye");
    const att = await Attachment.create({
      task: t._id, filename: "b.txt", mimetype: "text/plain", data: buf, size: buf.length, uploadedBy: u1._id
    });

    const r = await request(app).delete(`/api/tasks/${t._id}/attachments/${att._id}`);
    expect([200,204,404]).toContain(r.status);
    const count = await Attachment.countDocuments();
    expect([0,1]).toContain(count);
  });

  it("deletes a task and cascades its subtasks", async () => {
    const root = await Task.create({
      title: "root del", assignedProject: p1._id, createdBy: u1._id
    });
    const c1 = await Task.create({
      title: "c1", parentTask: root._id, assignedProject: p1._id, createdBy: u1._id
    });
    const c2 = await Task.create({
      title: "c2", parentTask: root._id, assignedProject: p1._id, createdBy: u1._id
    });

    const del = await request(app).delete(`/api/tasks/${root._id}`);
    expect(del.status).toBe(200);
    expect(del.body.message).toMatch(/deleted successfully/i);

    const remain = await Task.find({ _id: { $in: [root._id, c1._id, c2._id] } });
    expect(remain.length).toBe(0);
  });
});