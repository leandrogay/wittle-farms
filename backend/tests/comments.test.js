// tests/comments.test.js
// @vitest-environment node
import { describe, it, beforeAll, afterAll, beforeEach, expect } from "vitest";
import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

// ⬇️ Adjust paths if different in your repo
import Task from "../../backend/models/Task.js";
import User from "../../backend/models/User.js";
import Comment from "../../backend/models/Comment.js";
import commentsRouter from "../../backend/routes/comments.js";

let mongod;

// -------------------------
// In-memory Mongo
// -------------------------
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: "comments_testdb" });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

// -------------------------
// Tiny Express app with fake auth
// -------------------------
function makeApp(meId) {
  const app = express();
  app.use(express.json());
  // Provide req.user for routes that rely on it
  app.use((req, _res, next) => { req.user = { _id: meId }; next(); });
  app.use("/api/tasks", commentsRouter); // all comment/mention routes
  return app;
}

// -------------------------
// Helpers: create users with required fields
// -------------------------
let uid = 0;
async function mkUser(overrides = {}) {
  uid += 1;
  const base = {
    email: `user${uid}@example.com`,
    name: overrides.name ?? `User ${uid}`,
    // Your User schema requires password — provide a valid one
    password: overrides.password ?? "Pa$$w0rd123!",
  };
  return User.create({ ...base, ...overrides });
}

let app, seeded;

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Task.deleteMany({}),
    Comment.deleteMany({}),
  ]);

  const me    = await mkUser({ email: "me@example.com",    name: "Me" });
  const alice = await mkUser({ email: "alice@example.com", name: "Alice" });
  const bob   = await mkUser({ email: "bob@example.com",   name: "Bob" });

  // ⬇️ Adjust field to whatever your Task uses for members
  const task = await Task.create({
    title: "Test Task",
    createdBy: me._id,
    assignedTeamMembers: [alice._id, bob._id],
  });

  app = makeApp(me._id);
  seeded = { me, alice, bob, task };
});

describe("GET /:taskId/mentionable-users", () => {
  it("returns task members (including me) and filters by q", async () => {
    const res = await request(app)
      .get(`/api/tasks/${seeded.task._id}/mentionable-users`)
      .expect(200);

    // Your endpoint includes the requester ("me")
    const handles = res.body.map((u) => u.handle).sort();
    expect(handles).toEqual(["alice", "bob", "me"]);

    const res2 = await request(app)
      .get(`/api/tasks/${seeded.task._id}/mentionable-users?q=al`)
      .expect(200);

    expect(res2.body).toHaveLength(1);
    expect(res2.body[0].handle).toBe("alice");
  });
});

describe("comments + mentions", () => {
  it("creates a comment and stores mention userIds parsed from @handle", async () => {
    const payload = {
      body: "Ping @alice please check",
      author: String(seeded.me._id),   // some routes read this, others use req.user
      clientKey: "key-1",
    };

    const res = await request(app)
      .post(`/api/tasks/${seeded.task._id}/comments`)
      .send(payload)
      .expect(201);

    const saved = await Comment.findById(res.body._id).lean();
    expect(saved).toBeTruthy();
    expect(saved.body).toContain("@alice");
    expect(saved.mentions.map(String)).toContain(String(seeded.alice._id));
  });

  it("creates a new comment even when clientKey is reused (no idempotency)", async () => {
    const body = "hello @bob";
    const payload = { body, author: String(seeded.me._id), clientKey: "dup-11" };

    const r1 = await request(app)
      .post(`/api/tasks/${seeded.task._id}/comments`)
      .send(payload)
      .expect(201);

    const r2 = await request(app)
      .post(`/api/tasks/${seeded.task._id}/comments`)
      .send(payload)
      .expect(201);

    // Your API issues a *new* _id (no idempotency)
    expect(r2.body._id).not.toBe(r1.body._id);

    // And we indeed have 2 persisted rows with that clientKey
    const cnt = await Comment.countDocuments({ clientKey: "dup-11" });
    expect(cnt).toBe(2);
  });

  it("updates a comment and recomputes mentions", async () => {
    const created = await request(app)
      .post(`/api/tasks/${seeded.task._id}/comments`)
      .send({ body: "first @alice", author: String(seeded.me._id), clientKey: "k2" })
      .expect(201);

    const id = created.body._id;

    const up = await request(app)
      .put(`/api/tasks/${seeded.task._id}/comments/${id}`)
      .send({ body: "now @bob", author: String(seeded.me._id) })
      .expect(200);

    const saved = await Comment.findById(up.body._id).lean();
    expect(saved.body).toContain("@bob");
    expect(saved.mentions.map(String)).toEqual([String(seeded.bob._id)]);
  });

  it("deletes a comment", async () => {
    const created = await request(app)
      .post(`/api/tasks/${seeded.task._id}/comments`)
      .send({ body: "to delete", author: String(seeded.me._id), clientKey: "k3" })
      .expect(201);

    const id = created.body._id;

    // Your DELETE route validates author; send it in the body
    const del = await request(app)
      .delete(`/api/tasks/${seeded.task._id}/comments/${id}`)
      .send({ author: String(seeded.me._id) })
      .expect((res) => {
        // accept 204 No Content or 200 OK depending on implementation
        if (![200, 204].includes(res.status)) {
          throw new Error(`Unexpected status ${res.status}`);
        }
      });

    const exists = await Comment.exists({ _id: id });
    expect(Boolean(exists)).toBe(false);
  });
});
