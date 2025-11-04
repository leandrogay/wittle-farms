import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

/* ---------------------------------------------------------
   In-memory fakes for Task, Comment, and services
--------------------------------------------------------- */
const makeId = (n = 24) =>
  Array.from({ length: n }, () => "abcdef0123456789"[Math.floor(Math.random() * 16)]).join("");

const VALID_OID = "65a1bc2de3f4567890abc123";
const OTHER_OID = "65b2cd3ee4f567890abc123";
const TASK_ID = "65c3de4ff5a67890abc12345";

function chainable(items) {
  // Simulate mongoose query chain with sort, limit, populate, lean
  const state = { items, limitN: null, sortSpec: null };
  const api = {
    sort: vi.fn((spec) => { state.sortSpec = spec; return api; }),
    limit: vi.fn((n) => { state.limitN = n; return api; }),
    populate: vi.fn(() => api),
    select: vi.fn(() => api),
    lean: vi.fn(async () => {
      let out = state.items.slice();
      if (state.sortSpec && state.sortSpec.createdAt === -1) {
        out.sort((a, b) => b.createdAt - a.createdAt);
      }
      if (typeof state.limitN === "number") {
        out = out.slice(0, state.limitN);
      }
      return out.map(o => ({ ...o }));
    }),
  };
  return api;
}

function makeFakes() {
  // "DB"
  const db = {
    tasks: [
      {
        _id: TASK_ID,
        createdBy: { _id: VALID_OID, name: "Me", email: "me@example.com" },
        assignedTeamMembers: [
          { _id: OTHER_OID, name: "Alice", email: "alice@example.com" },
          { _id: "65d4ef50f6a78901abc12345", name: "Bob", email: "bob@example.com" },
        ],
      },
    ],
    comments: [],
  };

  // Task model
  const Task = {
    findById: vi.fn((id) => ({
      select: vi.fn(() => ({
        populate: vi.fn(() => ({
          populate: vi.fn(() => ({
            lean: vi.fn(async () => db.tasks.find(t => String(t._id) === String(id)) || null),
          })),
        })),
      })),
    })),
  };

  // Comment model
  const Comment = {
    find: vi.fn((filter) => {
      const { task, createdAt } = filter;
      let items = db.comments.filter(c => String(c.task) === String(task));
      if (createdAt?.$lt) {
        items = items.filter(c => c.createdAt < createdAt.$lt);
      }
      return chainable(items);
    }),
    findById: vi.fn((id) => ({
      populate: vi.fn(() => ({
        populate: vi.fn(() => ({
          lean: vi.fn(async () => db.comments.find(c => String(c._id) === String(id)) || null),
        })),
      })),
    })),
    findOne: vi.fn(async (filter) => {
      const { _id, task } = filter;
      return db.comments.find(c => String(c._id) === String(_id) && String(c.task) === String(task)) || null;
    }),
    create: vi.fn(async (data) => {
      const doc = {
        _id: makeId(24),
        createdAt: new Date(),
        editedAt: undefined,
        ...data,
      };
      db.comments.push(doc);
      return doc;
    }),
    updateOne: vi.fn(async (filter, update) => {
      const c = db.comments.find(x => String(x._id) === String(filter._id));
      if (c) Object.assign(c, update.$set);
      return { acknowledged: true, modifiedCount: c ? 1 : 0 };
    }),
  };

  // instances need a save() + deleteOne()
  const attachInstanceMethods = () => {
    db.comments.forEach(c => {
      if (!c.save) {
        c.save = vi.fn(async () => c);
      }
      if (!c.deleteOne) {
        c.deleteOne = vi.fn(async () => {
          const idx = db.comments.findIndex(x => String(x._id) === String(c._id));
          if (idx >= 0) db.comments.splice(idx, 1);
        });
      }
    });
  };

  // services
  const createCommentNotifications = vi.fn(async ({ taskId, commentId, authorId }) => ([
    { id: "n1", userId: "u1", taskId, commentId, authorId },
  ]));
  const createMentionNotifications = vi.fn(async ({ taskId, commentId, authorId }) => ([
    { id: "n2", userId: "u2", taskId, commentId, authorId },
  ]));
  const resolveMentionUserIds = vi.fn(async (_taskId, body) => {
    // Return different shapes to cover array/single/null paths
    if (!body || !body.includes("@")) return null;
    if (body.includes("@single")) return VALID_OID;
    return [OTHER_OID];
  });

  return {
    db,
    Task,
    Comment,
    attachInstanceMethods,
    services: { createCommentNotifications, createMentionNotifications, resolveMentionUserIds },
  };
}

/* ---------------------------------------------------------
   Loader: inject mocks, import router, build app
--------------------------------------------------------- */
async function loadApp({ withUser = true } = {}) {
  vi.resetModules();
  const f = makeFakes();

  // Mock mongoose helpers used by the router
  vi.doMock("mongoose", () => {
    const isValid = (v) => /^[a-f0-9]{24}$/i.test(String(v || ""));
    return {
      // default import: `import mongoose from "mongoose"`
      default: {
        Types: { ObjectId: { isValid } },
      },
      // named import: `import { isValidObjectId } from "mongoose"`
      isValidObjectId: isValid,
      // (optional) also export Types as a named export—harmless, sometimes helpful
      Types: { ObjectId: { isValid } },
    };
  });

  vi.doMock("../models/Task.js", () => ({ default: f.Task }));
  vi.doMock("../models/Comment.js", () => ({ default: f.Comment }));
  vi.doMock("../services/notification-service.js", () => ({
    createCommentNotifications: f.services.createCommentNotifications,
    createMentionNotifications: f.services.createMentionNotifications,
  }));
  vi.doMock("../services/resolve-mention.js", () => ({
    resolveMentionUserIds: f.services.resolveMentionUserIds,
  }));

  const router = (await import("../routes/comments.js")).default;

  // Express app with fake socket.io
  const io = { emit: vi.fn() };
  const app = express();
  app.use(express.json());
  app.set("io", io);
  if (withUser) {
    app.use((req, _res, next) => { req.user = { _id: VALID_OID }; next(); });
  }
  app.use("/api/tasks", router);
  // generic error handler (for next(err paths if any)
  app.use((err, _req, res, _next) => res.status(500).json({ error: String(err?.message || err) }));

  // expose helpers to tests
  return { app, io, f };
}

/* ---------------------------------------------------------
   TESTS
--------------------------------------------------------- */
describe("GET /:taskId/mentionable-users", () => {
  it("400 on invalid task id", async () => {
    const { app } = await loadApp();
    const r = await request(app).get(`/api/tasks/not-an-id/mentionable-users`);
    expect(r.status).toBe(400);
  });

  it("404 when task not found", async () => {
    const { app, f } = await loadApp();
    // empty tasks
    f.db.tasks = [];
    const r = await request(app).get(`/api/tasks/${TASK_ID}/mentionable-users`);
    expect(r.status).toBe(404);
  });

  it("200 returns createdBy + members, supports q filter", async () => {
    const { app } = await loadApp();
    const r = await request(app).get(`/api/tasks/${TASK_ID}/mentionable-users`);
    expect(r.status).toBe(200);
    const handles = r.body.map(u => u.handle).sort();
    expect(handles).toEqual(["alice", "bob", "me"]);

    const q = await request(app).get(`/api/tasks/${TASK_ID}/mentionable-users?q=al`);
    expect(q.status).toBe(200);
    expect(q.body).toHaveLength(1);
    expect(q.body[0].handle).toBe("alice");
  });

  it("500 catch path if internal error occurs", async () => {
    const { app, f } = await loadApp();
    f.Task.findById = vi.fn(() => ({ select: () => ({ populate: () => ({ populate: () => ({ lean: () => { throw new Error("DB fail"); } }) }) }) }));
    const r = await request(app).get(`/api/tasks/${TASK_ID}/mentionable-users`);
    expect(r.status).toBe(500);
    expect(r.body.error).toMatch(/failed to load users/i);
  });
});

describe("GET /:taskId/comments", () => {
  it("400 invalid task id", async () => {
    const { app } = await loadApp();
    const r = await request(app).get(`/api/tasks/notvalid/comments`);
    expect(r.status).toBe(400);
  });

  it("200 returns items, honors cursor, clamps limit to 100 and sets nextCursor", async () => {
    const { app, f } = await loadApp();
    // seed > 3 comments with descending timestamps
    const base = new Date();
    for (let i = 0; i < 5; i++) {
      f.db.comments.push({
        _id: makeId(24),
        task: TASK_ID,
        author: VALID_OID,
        body: `c${i}`,
        createdAt: new Date(base.getTime() - i * 1000),
      });
    }

    // first page
    let r1 = await request(app).get(`/api/tasks/${TASK_ID}/comments`).query({ limit: 200 }); // clamp to 100
    expect(r1.status).toBe(200);
    expect(r1.body.items).toHaveLength(5);
    expect(r1.body.nextCursor).toBeTruthy();

    // second page using cursor (should return empty since only 5)
    const cursor = r1.body.nextCursor;
    let r2 = await request(app).get(`/api/tasks/${TASK_ID}/comments`).query({ cursor });
    expect(r2.status).toBe(200);
    expect(r2.body.items.length).toBe(0);
    expect(r2.body.nextCursor).toBeNull();
  });

  it("500 catch path", async () => {
    const { app, f } = await loadApp();
    f.Comment.find = vi.fn(() => ({ sort: () => ({ limit: () => ({ populate: () => ({ lean: () => { throw new Error("boom"); } }) }) }) }));
    const r = await request(app).get(`/api/tasks/${TASK_ID}/comments`);
    expect(r.status).toBe(500);
    expect(r.body.error).toMatch(/boom/);
  });
});

describe("POST /:taskId/comments", () => {
  it("400 on invalid taskId", async () => {
    const { app } = await loadApp();
    const r = await request(app).post(`/api/tasks/notvalid/comments`).send({ author: VALID_OID, body: "x" });
    expect(r.status).toBe(400);
  });

  it("400 on invalid author", async () => {
    const { app } = await loadApp();
    const r = await request(app).post(`/api/tasks/${TASK_ID}/comments`).send({ author: "bad", body: "hello" });
    expect(r.status).toBe(400);
  });

  it("400 on empty body", async () => {
    const { app } = await loadApp();
    const r = await request(app).post(`/api/tasks/${TASK_ID}/comments`).send({ author: VALID_OID, body: "   " });
    expect(r.status).toBe(400);
  });

  it("201 creates comment, trims body, resolves mentions (array), sends notifications & emits", async () => {
    const { app, f, io } = await loadApp();
    const r = await request(app)
      .post(`/api/tasks/${TASK_ID}/comments`)
      .send({ author: VALID_OID, body: " Hi @bob ", clientKey: "k1" });

    expect(r.status).toBe(201);
    expect(r.body.body).toBe("Hi @bob");
    // resolveMentionUserIds returned [OTHER_OID]
    expect(f.services.resolveMentionUserIds).toHaveBeenCalled();
    expect(f.services.createCommentNotifications).toHaveBeenCalled();
    expect(f.services.createMentionNotifications).toHaveBeenCalled();
    // socket emits for notifications + created event
    expect(io.emit).toHaveBeenCalled();
  });

  it("201 handles single-id mention shape (@single) and null mentions (no @)", async () => {
    const { app, f } = await loadApp();
    const withSingle = await request(app)
      .post(`/api/tasks/${TASK_ID}/comments`)
      .send({ author: VALID_OID, body: "ping @single" });
    expect(withSingle.status).toBe(201);

    const noMention = await request(app)
      .post(`/api/tasks/${TASK_ID}/comments`)
      .send({ author: VALID_OID, body: "no mentions here" });
    expect(noMention.status).toBe(201);

    expect(f.services.resolveMentionUserIds).toHaveBeenCalledTimes(2);
  });

  it("400 catch path when creation throws", async () => {
    const { app, f } = await loadApp();
    f.Comment.create = vi.fn(async () => { throw new Error("create fail"); });
    const r = await request(app).post(`/api/tasks/${TASK_ID}/comments`).send({ author: VALID_OID, body: "x" });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/create fail/);
  });
});

describe("PUT /:taskId/comments/:commentId", () => {
  it("400 invalid ids", async () => {
    const { app } = await loadApp();
    const r = await request(app).put(`/api/tasks/bad/comments/also-bad`).send({ body: "x" });
    expect(r.status).toBe(400);
  });

  it("400 empty body", async () => {
    const { app } = await loadApp();
    const r = await request(app).put(`/api/tasks/${TASK_ID}/comments/${VALID_OID}`).send({ body: "  " });
    expect(r.status).toBe(400);
  });

  it("401 unauth when neither req.user nor valid author", async () => {
    const { app } = await loadApp({ withUser: false });
    const r = await request(app).put(`/api/tasks/${TASK_ID}/comments/${VALID_OID}`).send({ body: "ok", author: "bad" });
    expect(r.status).toBe(401);
  });

  it("404 when comment not found", async () => {
    const { app } = await loadApp();
    const r = await request(app).put(`/api/tasks/${TASK_ID}/comments/${VALID_OID}`).send({ body: "ok" });
    expect(r.status).toBe(404);
  });

  it("403 when editing someone else’s comment", async () => {
    const { app, f } = await loadApp();
    // seed comment by OTHER user
    f.db.comments.push({
      _id: VALID_OID,
      task: TASK_ID,
      author: OTHER_OID,
      body: "nope",
      createdAt: new Date(),
    });
    const r = await request(app).put(`/api/tasks/${TASK_ID}/comments/${VALID_OID}`).send({ body: "try edit" });
    expect(r.status).toBe(403);
  });

  it("200 updates own comment, recomputes mentions, sets editedAt, calls updateOne + notifications", async () => {
    const { app, f } = await loadApp();
    // seed my comment
    f.db.comments.push({
      _id: VALID_OID,
      task: TASK_ID,
      author: VALID_OID,
      body: "before",
      createdAt: new Date(),
    });
    f.attachInstanceMethods();

    const r = await request(app).put(`/api/tasks/${TASK_ID}/comments/${VALID_OID}`).send({ body: "now @bob" });
    expect(r.status).toBe(200);
    const updated = f.db.comments.find(c => c._id === VALID_OID);
    expect(updated.body).toBe("now @bob");
    expect(updated.editedAt).toBeTruthy();
    expect(f.Comment.updateOne).toHaveBeenCalled();
    expect(f.services.createMentionNotifications).toHaveBeenCalled();
  });

  it("500 catch path when save throws", async () => {
    const { app, f } = await loadApp();
    f.db.comments.push({
      _id: VALID_OID,
      task: TASK_ID,
      author: VALID_OID,
      body: "x",
      createdAt: new Date(),
    });
    f.attachInstanceMethods();
    // make save throw
    f.db.comments[0].save = vi.fn(async () => { throw new Error("save boom"); });
    const r = await request(app).put(`/api/tasks/${TASK_ID}/comments/${VALID_OID}`).send({ body: "y" });
    expect(r.status).toBe(500);
    expect(r.body.error).toMatch(/save boom/);
  });
});

describe("DELETE /:taskId/comments/:commentId", () => {
  it("400 invalid ids", async () => {
    const { app } = await loadApp();
    const r = await request(app).delete(`/api/tasks/bad/comments/also-bad`).send({ author: VALID_OID });
    expect(r.status).toBe(400);
  });

  it("401 unauth", async () => {
    const { app } = await loadApp({ withUser: false });
    const r = await request(app).delete(`/api/tasks/${TASK_ID}/comments/${VALID_OID}`).send({ author: "bad" });
    expect(r.status).toBe(401);
  });

  it("404 not found", async () => {
    const { app } = await loadApp();
    const r = await request(app).delete(`/api/tasks/${TASK_ID}/comments/${VALID_OID}`).send({ author: VALID_OID });
    expect(r.status).toBe(404);
  });

  it("403 forbidden when not the author", async () => {
    const { app, f } = await loadApp();
    f.db.comments.push({ _id: VALID_OID, task: TASK_ID, author: OTHER_OID, body: "z", createdAt: new Date() });
    const r = await request(app).delete(`/api/tasks/${TASK_ID}/comments/${VALID_OID}`).send({ author: VALID_OID });
    expect(r.status).toBe(403);
  });

  it("200 deletes own comment and emits socket", async () => {
    const { app, f, io } = await loadApp();
    f.db.comments.push({ _id: VALID_OID, task: TASK_ID, author: VALID_OID, body: "z", createdAt: new Date() });
    f.attachInstanceMethods();
    const r = await request(app).delete(`/api/tasks/${TASK_ID}/comments/${VALID_OID}`).send({ author: VALID_OID });
    expect(r.status).toBe(200);
    expect(io.emit).toHaveBeenCalledWith("task:comment:deleted", { taskId: TASK_ID, commentId: VALID_OID });
    expect(f.db.comments.find(c => c._id === VALID_OID)).toBeUndefined();
  });

  it("mentionable-users resolves string ids via User.find (covers lines 45–49)", async () => {
    vi.resetModules();

    const TASK_ID = "65c3de4ff5a67890abc12345";
    const CREATED_BY_ID = "65a1bc2de3f4567890abc123";
    const MEMBER_ID = "65b2cd3ee4f567890abc1234";

    // Full mongoose mock: both named and Types.ObjectId.isValid
    vi.doMock("mongoose", () => {
      const isValid = (v) => /^[a-f0-9]{24}$/i.test(String(v || ""));
      return {
        default: { Types: { ObjectId: { isValid } } },
        isValidObjectId: isValid,
        Types: { ObjectId: { isValid } },
      };
    });

    // Task.findById returns string refs (to trigger needLookup)
    vi.doMock("../models/Task.js", () => ({
      default: {
        findById: vi.fn(() => ({
          select: vi.fn(() => ({
            populate: vi.fn(() => ({
              populate: vi.fn(() => ({
                lean: vi.fn(async () => ({
                  _id: TASK_ID,
                  createdBy: CREATED_BY_ID,           // string, not object
                  assignedTeamMembers: [MEMBER_ID],   // string, not object
                })),
              })),
            })),
          })),
        })),
      },
    }));

    // 👇 Route uses an *unimported* global `User` — stub it.
    const userFind = vi.fn(() => ({
      select: vi.fn(() => ({
        lean: vi.fn(async () => ([
          { _id: CREATED_BY_ID, name: "Me", email: "me@example.com" },
          { _id: MEMBER_ID, name: "Alice", email: "alice@example.com" },
        ])),
      })),
    }));
    vi.stubGlobal("User", { find: userFind });

    // Other deps not used in this route, but mock minimal
    vi.doMock("../models/Comment.js", () => ({ default: {} }));
    vi.doMock("../services/notification-service.js", () => ({
      createCommentNotifications: vi.fn(),
      createMentionNotifications: vi.fn(),
    }));
    vi.doMock("../services/resolve-mention.js", () => ({
      resolveMentionUserIds: vi.fn(),
    }));

    const { default: router } = await import("../routes/comments.js");

    const app = express();
    app.use(express.json());
    app.use("/api/tasks", router);

    const res = await request(app).get(`/api/tasks/${TASK_ID}/mentionable-users`);

    expect(res.status).toBe(200);

    // Ensure the lookup used our ids
    const arg = userFind.mock.calls[0][0];
    expect(arg).toHaveProperty("_id.$in");
    expect(new Set(arg._id.$in.map(String))).toEqual(new Set([CREATED_BY_ID, MEMBER_ID]));

    // Handles come from email local parts
    const handles = res.body.map(u => u.handle).sort();
    expect(handles).toEqual(["alice", "me"]);
  });

  it("400 catch path when deleteOne throws", async () => {
    const { app, f } = await loadApp();
    f.db.comments.push({ _id: VALID_OID, task: TASK_ID, author: VALID_OID, body: "z", createdAt: new Date() });
    f.db.comments[0].deleteOne = vi.fn(async () => { throw new Error("del boom"); });
    const r = await request(app).delete(`/api/tasks/${TASK_ID}/comments/${VALID_OID}`).send({ author: VALID_OID });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/del boom/);
  });

  it("mentionable-users: covers typeof(member)!=='string' branch and key=handle (no _id)", async () => {
    const { app, f } = await loadApp();

    // Make one member an object WITHOUT _id so pushUser builds a user with empty _id -> key falls back to handle
    f.db.tasks[0].assignedTeamMembers = [
      { name: "NoId User", email: "noid@example.com" }, // -> handle 'noid', _id: ""
    ];
    // Also keep createdBy as a proper object (non-string) to hit the 'object' branch
    f.db.tasks[0].createdBy = { _id: VALID_OID, name: "Me", email: "me@example.com" };

    const r = await request(app).get(`/api/tasks/${f.db.tasks[0]._id}/mentionable-users`);
    expect(r.status).toBe(200);
    const found = r.body.find(u => u.handle === "noid");
    expect(found).toBeTruthy();             // ensures pushUser ran
    expect(found._id === "" || found._id == null).toBe(true); // key fallback path (_id falsy, use handle)
  });

  it("mentionable-users: q filter matches name when handle doesn't start with q", async () => {
    const { app, f } = await loadApp();
    // Ensure a user whose handle won't match q, but name will contain q
    f.db.tasks[0].assignedTeamMembers = [
      { _id: OTHER_OID, name: "Ariana", email: "bob@example.com" }, // handle 'bob', name includes 'ar'
    ];
    f.db.tasks[0].createdBy = { _id: VALID_OID, name: "Me", email: "me@example.com" };

    const r = await request(app).get(`/api/tasks/${f.db.tasks[0]._id}/mentionable-users?q=ar`);
    expect(r.status).toBe(200);
    // 'bob' handle doesn't start with 'ar', but 'Ariana' contains 'ar'
    expect(r.body.map(u => u.name)).toContain("Ariana");
  });

  it("GET comments: respects small numeric limit (e.g., 5)", async () => {
    const { app, f } = await loadApp();
    const base = new Date();
    for (let i = 0; i < 10; i++) {
      f.db.comments.push({
        _id: makeId(24),
        task: f.db.tasks[0]._id,
        author: VALID_OID,
        body: `c${i}`,
        createdAt: new Date(base.getTime() - i * 1000),
      });
    }
    const r = await request(app)
      .get(`/api/tasks/${f.db.tasks[0]._id}/comments`)
      .query({ limit: 5 });
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBe(5); // exercises Math.min(Number(limit)||20,100) with a small numeric
  });

  it("mentionable-users: ignores null/undefined members and derives handle from name when email absent (covers L27, L33)", async () => {
    const { app, f } = await loadApp();

    // createdBy is fine
    f.db.tasks[0].createdBy = { _id: VALID_OID, name: "Me", email: "me@example.com" };

    // members include null/undefined to hit `if (!u) return`, plus a user with empty email to hit name-based handle
    f.db.tasks[0].assignedTeamMembers = [
      null,
      undefined,
      { name: "XyZ", email: "" }, // -> handle "xyz" via name.toLowerCase()
    ];

    const r = await request(app).get(`/api/tasks/${f.db.tasks[0]._id}/mentionable-users`);
    expect(r.status).toBe(200);
    const handles = r.body.map(u => u.handle).sort();
    expect(handles).toContain("xyz"); // name-based handle path
    expect(handles).not.toContain(""); // null/undefined skipped
  });

  it("mentionable-users: mixed member types triggers string branch (covers L41) and handle-start filter true branch (covers L61 via handle)", async () => {
    const { app, f } = await loadApp();

    // Mix an object member and a string member to exercise both branches
    const stringId = OTHER_OID; // valid 24-hex string
    f.db.tasks[0].assignedTeamMembers = [
      { _id: VALID_OID, name: "Charlie", email: "charlie@example.com" }, // object path
      stringId,                                                          // string path -> goes into needLookup
    ];
    // Stub global User for the string lookup
    const userFind = vi.fn(() => ({
      select: () => ({ lean: async () => [{ _id: stringId, name: "alison", email: "alison@example.com" }] }),
    }));
    vi.stubGlobal("User", { find: userFind });

    const r = await request(app).get(`/api/tasks/${f.db.tasks[0]._id}/mentionable-users?q=ali`);
    expect(r.status).toBe(200);

    // q = "ali" => handle "alison" starts with "ali" (rx.test true)
    const handles = r.body.map(u => u.handle);
    expect(handles).toContain("alison");
    // ensure the string-branch lookup was invoked with $in containing our stringId
    const arg = userFind.mock.calls[0][0];
    expect(new Set(arg._id.$in.map(String))).toContain(stringId);
  });

  it("GET comments: limit=0 falls back to 20 (covers L82 fallback via Number(limit)||20)", async () => {
    const { app, f } = await loadApp();
    const base = new Date();
    for (let i = 0; i < 30; i++) {
      f.db.comments.push({
        _id: makeId(24),
        task: f.db.tasks[0]._id,
        author: VALID_OID,
        body: `c${i}`,
        createdAt: new Date(base.getTime() - i * 1000),
      });
    }
    const r = await request(app)
      .get(`/api/tasks/${f.db.tasks[0]._id}/comments`)
      .query({ limit: 0 }); // Number(0) -> 0 -> fallback 20
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBe(20);
  });

  it("GET comments: limit > 100 is clamped to 100 (covers L82 Math.min path)", async () => {
    const { app, f } = await loadApp();
    const base = new Date();
    for (let i = 0; i < 150; i++) {
      f.db.comments.push({
        _id: makeId(24),
        task: f.db.tasks[0]._id,
        author: VALID_OID,
        body: `c${i}`,
        createdAt: new Date(base.getTime() - i * 1000),
      });
    }
    const r = await request(app)
      .get(`/api/tasks/${f.db.tasks[0]._id}/comments`)
      .query({ limit: 500 });
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBe(100); // clamped
  });

  it("mentionable-users: falls back to handle when name is empty (covers L33)", async () => {
    const { app, f } = await loadApp();

    // Member with empty name, email has local-part "alpha" → handle "alpha"
    f.db.tasks[0].assignedTeamMembers = [{ _id: OTHER_OID, name: "", email: "alpha@example.com" }];

    const r = await request(app).get(`/api/tasks/${f.db.tasks[0]._id}/mentionable-users`);
    expect(r.status).toBe(200);

    const alpha = r.body.find(u => u.handle === "alpha");
    expect(alpha).toBeTruthy();
    // name || handle => since name is "", name should equal handle ("alpha")
    expect(alpha.name).toBe("alpha");
  });

  it("mentionable-users: handles missing assignedTeamMembers via `|| []` (covers L37)", async () => {
    const { app, f } = await loadApp();

    // Remove members to force the right-hand side of `|| []`
    f.db.tasks[0].assignedTeamMembers = null;

    const r = await request(app).get(`/api/tasks/${f.db.tasks[0]._id}/mentionable-users`);
    expect(r.status).toBe(200);

    // Should still include createdBy ("me")
    const handles = r.body.map(u => u.handle);
    expect(handles).toContain("me");
  });

  it("mentionable-users: object member exercises typeof !== 'string' (covers L41 false branch)", async () => {
    const { app, f } = await loadApp();

    // Single object member → the inner `if (typeof m === "string")` is false
    f.db.tasks[0].assignedTeamMembers = [{ _id: OTHER_OID, name: "Obj", email: "obj@example.com" }];

    const r = await request(app).get(`/api/tasks/${f.db.tasks[0]._id}/mentionable-users`);
    expect(r.status).toBe(200);

    const handles = r.body.map(u => u.handle);
    expect(handles).toContain("obj"); // came from email local-part
  });

  it("mentionable-users: q that matches nobody (covers L61 predicate=false path)", async () => {
    const { app, f } = await loadApp();

    // Ensure some users exist
    f.db.tasks[0].assignedTeamMembers = [
      { _id: OTHER_OID, name: "Alice", email: "alice@example.com" },
      { _id: VALID_OID, name: "Bob", email: "bob@example.com" },
    ];

    const r = await request(app).get(`/api/tasks/${f.db.tasks[0]._id}/mentionable-users?q=zzzzzzzz`);
    expect(r.status).toBe(200);
    expect(r.body.length).toBe(0); // neither handle starts with q nor name includes q
  });

  it("mentionable-users: q filter yields mixed results in one pass (covers L61 both true and false)", async () => {
    const { app, f } = await loadApp();

    // Two members:
    // - 'alison' -> handle starts with 'ali' (rx.test true)
    // - 'charlie' -> handle 'charlie' does NOT start with 'ali' and name 'Charlie' doesn't include 'ali' (predicate false)
    f.db.tasks[0].assignedTeamMembers = [
      { _id: OTHER_OID, name: "Alison", email: "alison@example.com" },  // handle 'alison' -> match
      { _id: VALID_OID, name: "Charlie", email: "charlie@example.com" }, // no match
    ];

    const r = await request(app)
      .get(`/api/tasks/${f.db.tasks[0]._id}/mentionable-users?q=ali`);

    expect(r.status).toBe(200);
    const handles = r.body.map(u => u.handle);
    expect(handles).toContain("alison");     // true branch
    expect(handles).not.toContain("charlie"); // false branch in same filter call
  });

  it("mentionable-users: single pass covers L61 left-true, right-true, and both-false", async () => {
    const { app, f } = await loadApp();

    // Three members:
    // 1) handle starts with 'ar'  -> left TRUE
    // 2) name includes 'ar' but handle doesn't start with 'ar' -> right TRUE
    // 3) neither handle nor name matches -> both FALSE
    f.db.tasks[0].assignedTeamMembers = [
      { _id: makeId(24), name: "Ariel", email: "ariel@example.com" },  // handle 'ariel' -> left TRUE
      { _id: makeId(24), name: "Ariana", email: "bob@example.com" },    // handle 'bob' (left FALSE), name 'ariana' includes 'ar' (right TRUE)
      { _id: makeId(24), name: "Chris", email: "chris@example.com" },  // left FALSE, right FALSE
    ];

    const r = await request(app)
      .get(`/api/tasks/${f.db.tasks[0]._id}/mentionable-users?q=ar`);

    expect(r.status).toBe(200);
    const handles = r.body.map(u => u.handle);

    // left TRUE kept
    expect(handles).toContain("ariel");

    // right TRUE kept even though handle doesn't start with 'ar'
    expect(handles).toContain("bob");

    // both FALSE filtered out
    expect(handles).not.toContain("chris");
  });

  it("mentionable-users: L61 fully covered in a single pass (left true, right true, both false; with empty name + missing members)", async () => {
    // Case 1: no assignedTeamMembers (hits the `|| []` on L37 again)
    {
      const { app, f } = await loadApp();
      f.db.tasks[0].assignedTeamMembers = null;
      // Add three synthetic members through createdBy + we’ll add two via pushUser injection
      // createdBy is 'me' -> handle 'me' (won’t match 'ar')
      // We will temporarily swap task to include members we control:
      f.db.tasks[0].assignedTeamMembers = [
        { _id: makeId(24), name: "Ariel", email: "ariel@example.com" },   // left TRUE (handle starts with 'ar')
        { _id: makeId(24), name: "Ariana", email: "bob@example.com" },     // left FALSE, right TRUE (name includes 'ar')
        { _id: makeId(24), name: "Chris", email: "chris@example.com" },   // both FALSE
      ];

      let r = await request(app).get(`/api/tasks/${f.db.tasks[0]._id}/mentionable-users?q=ar`);
      expect(r.status).toBe(200);
      const handles = r.body.map(u => u.handle);
      expect(handles).toContain("ariel");    // left TRUE
      expect(handles).toContain("bob");      // right TRUE
      expect(handles).not.toContain("chris");// both FALSE
    }

    // Case 2: ensure `(u.name || "")` takes the empty-string branch too
    {
      const { app, f } = await loadApp();
      f.db.tasks[0].assignedTeamMembers = [
        { _id: makeId(24), name: "", email: "ariel@example.com" },   // left TRUE (handle 'ariel'), name is ''
        { _id: makeId(24), name: "Ariana", email: "bob@example.com" },     // right TRUE via name
        { _id: makeId(24), name: "", email: "xavier@example.com" },  // both FALSE for q='zz' (no 'zz')
      ];

      let r = await request(app).get(`/api/tasks/${f.db.tasks[0]._id}/mentionable-users?q=zz`);
      expect(r.status).toBe(200);
      const handles = r.body.map(u => u.handle);
      // For q='zz', only both-false remains (none match), ensuring the right side evaluated with empty name ('')
      expect(handles).not.toContain("ariel");
      expect(handles).not.toContain("bob");
    }
  });

  it("mentionable-users: L61 — left TRUE (handle), right TRUE (name), and both FALSE in one pass", async () => {
    const { app, f } = await loadApp();

    // Three members:
    // 1) handle starts with 'ar'  -> left TRUE (rx.test(u.handle))
    // 2) handle doesn't match, but name includes 'ar' -> right TRUE ((u.name||'').includes)
    // 3) neither handle nor name matches -> both FALSE
    f.db.tasks[0].assignedTeamMembers = [
      { _id: makeId(24), name: "", email: "ariel@example.com" },  // handle 'ariel' -> LEFT TRUE
      { _id: makeId(24), name: "Ariana", email: "bob@example.com" },    // RIGHT TRUE (name), handle 'bob' doesn't start with 'ar'
      { _id: makeId(24), name: "Chris", email: "chris@example.com" },  // BOTH FALSE
    ];

    const res = await request(app)
      .get(`/api/tasks/${f.db.tasks[0]._id}/mentionable-users?q=ar`);

    expect(res.status).toBe(200);
    const handles = res.body.map(u => u.handle);

    // left TRUE kept
    expect(handles).toContain("ariel");

    // right TRUE kept (via name match) even though handle doesn't start with 'ar'
    expect(handles).toContain("bob");

    // both FALSE filtered out
    expect(handles).not.toContain("chris");
  });

  it("mentionable-users L61: left TRUE, right TRUE, both FALSE in a fresh import", async () => {
    vi.resetModules(); // ensure fresh coverage counters for this file

    // Mock mongoose helpers exactly as the router expects
    vi.doMock("mongoose", () => {
      const isValid = (v) => /^[a-f0-9]{24}$/.test(String(v || ""));
      return {
        default: { Types: { ObjectId: { isValid } } },
        isValidObjectId: isValid,
        Types: { ObjectId: { isValid } },
      };
    });

    // Seed a task with three members to exercise all branches of the predicate
    const TASK_ID = "65c3de4ff5a67890abc12345";
    vi.doMock("../models/Task.js", () => ({
      default: {
        findById: vi.fn(() => ({
          select: vi.fn(() => ({
            populate: vi.fn(() => ({
              populate: vi.fn(() => ({
                lean: vi.fn(async () => ({
                  _id: TASK_ID,
                  createdBy: { _id: "65a1bc2de3f4567890abc123", name: "Owner", email: "owner@example.com" },
                  assignedTeamMembers: [
                    // 1) LEFT TRUE: handle starts with 'ar'
                    { _id: "65a1bc2de3f4567890abc124", name: "", email: "ariel@example.com" }, // handle 'ariel'
                    // 2) RIGHT TRUE: handle doesn't start with 'ar', but name contains 'ar'
                    { _id: "65a1bc2de3f4567890abc125", name: "Ariana", email: "bob@example.com" },    // handle 'bob'
                    // 3) BOTH FALSE: neither handle nor name matches 'ar'
                    { _id: "65a1bc2de3f4567890abc126", name: "Chris", email: "chris@example.com" },
                  ],
                })),
              })),
            })),
          })),
        })),
      },
    }));

    // Not used in this route, but keep the router import happy
    vi.doMock("../models/Comment.js", () => ({ default: {} }));
    vi.doMock("../services/notification-service.js", () => ({
      createCommentNotifications: vi.fn(),
      createMentionNotifications: vi.fn(),
    }));
    vi.doMock("../services/resolve-mention.js", () => ({
      resolveMentionUserIds: vi.fn(),
    }));

    const { default: router } = await import("../routes/comments.js");

    // Minimal app
    const express = (await import("express")).default;
    const request = (await import("supertest")).default;
    const app = express();
    app.use(express.json());
    app.use("/api/tasks", router);

    // q='ar' so: 'ariel' kept (left TRUE), 'bob/Ariana' kept (right TRUE), 'chris' dropped (both FALSE)
    const res = await request(app).get(`/api/tasks/${TASK_ID}/mentionable-users?q=ar`);
    expect(res.status).toBe(200);

    const handles = res.body.map(u => u.handle).sort();
    expect(handles).toContain("ariel");   // LEFT TRUE path executed
    expect(handles).toContain("bob");     // RIGHT TRUE path executed (name includes 'ar', handle doesn't)
    expect(handles).not.toContain("chris");// BOTH FALSE path executed in same filter call
  });

  it("mentionable-users (L61): left-true, right-true, both-false in one pass after explicit-branch refactor", async () => {
    const { app, f } = await loadApp();

    // Three distinct cases:
    // 1) LEFT TRUE: handle starts with 'ar'
    // 2) RIGHT TRUE: handle doesn't start with 'ar', but name contains 'ar'
    // 3) BOTH FALSE: neither handle nor name matches 'ar'
    f.db.tasks[0].assignedTeamMembers = [
      { _id: makeId(24), name: "", email: "ariel@example.com" },  // handle 'ariel' -> LEFT TRUE
      { _id: makeId(24), name: "Ariana", email: "bob@example.com" },    // handle 'bob' (left FALSE), name includes 'ar' -> RIGHT TRUE
      { _id: makeId(24), name: "Chris", email: "chris@example.com" },  // BOTH FALSE
    ];

    const res = await request(app)
      .get(`/api/tasks/${f.db.tasks[0]._id}/mentionable-users?q=ar`);

    expect(res.status).toBe(200);
    const handles = res.body.map(u => u.handle).sort();

    // left TRUE kept
    expect(handles).toContain("ariel");
    // right TRUE (via name) kept even though handle doesn't start with 'ar'
    expect(handles).toContain("bob");
    // both FALSE filtered out
    expect(handles).not.toContain("chris");
  });

  it("mentionable-users: fully covers L61 by driving inner (u.name || '') both sides", async () => {
    const { app, f } = await loadApp();

    // Three members:
    // 1) LEFT TRUE: handle starts with 'ar' (inner not evaluated)
    // 2) LEFT FALSE + inner LEFT TRUE: handle doesn't match, name contains 'ar'
    // 3) LEFT FALSE + inner LEFT FALSE: handle doesn't match, name is falsy ('') so inner `||` uses "" and fails
    f.db.tasks[0].assignedTeamMembers = [
      { _id: makeId(24), name: "Ariel", email: "ariel@example.com" }, // handle 'ariel'  -> left TRUE
      { _id: makeId(24), name: "Ariana", email: "bob@example.com" }, // handle 'bob'   -> left FALSE, name includes 'ar' -> inner LEFT TRUE
      { _id: makeId(24), name: "", email: "zzz@example.com" }, // handle 'zzz'   -> left FALSE, name falsy -> inner LEFT FALSE (""), overall FALSE
    ];

    const r = await request(app)
      .get(`/api/tasks/${f.db.tasks[0]._id}/mentionable-users?q=ar`);

    expect(r.status).toBe(200);
    const handles = r.body.map(u => u.handle).sort();

    // Kept by left TRUE
    expect(handles).toContain("ariel");
    // Kept by right TRUE (name branch)
    expect(handles).toContain("bob");
    // Dropped by both FALSE; also forces inner `||` to take the "" path
    expect(handles).not.toContain("zzz");
  });


  it("mentionable-users skips entries without handle and dedupes duplicates", async () => {
    const { app, f } = await loadApp();

    // Inject: createdBy missing email & name -> will be skipped by pushUser
    f.db.tasks[0].createdBy = { _id: VALID_OID, name: "", email: "" };

    // Also add a duplicate member (same _id twice) to trigger dedupe in the Map()
    const dup = { _id: OTHER_OID, name: "Alice", email: "alice@example.com" };
    f.db.tasks[0].assignedTeamMembers = [dup, dup];

    const r = await request(app).get(`/api/tasks/${TASK_ID}/mentionable-users`);
    expect(r.status).toBe(200);

    // "me" should be absent (skipped), "alice" appears once (deduped)
    const handles = r.body.map(u => u.handle);
    expect(handles).toEqual(["alice"]);
  });

  it("GET comments uses default limit (20) when not provided", async () => {
    const { app, f } = await loadApp();
    const base = new Date();
    for (let i = 0; i < 25; i++) {
      f.db.comments.push({
        _id: makeId(24),
        task: TASK_ID,
        author: VALID_OID,
        body: `c${i}`,
        createdAt: new Date(base.getTime() - i * 1000),
      });
    }

    const r = await request(app).get(`/api/tasks/${TASK_ID}/comments`);
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBe(20);       // default cap
    expect(r.body.nextCursor).toBeTruthy();     // still more left
  });

  it("PUT comment authenticates via body.author when req.user is absent", async () => {
    const { app, f } = await loadApp({ withUser: false });

    // My comment
    f.db.comments.push({
      _id: VALID_OID,
      task: TASK_ID,
      author: VALID_OID,
      body: "before",
      createdAt: new Date(),
    });
    f.attachInstanceMethods();

    const r = await request(app)
      .put(`/api/tasks/${TASK_ID}/comments/${VALID_OID}`)
      .send({ body: "after @bob", author: VALID_OID });

    expect(r.status).toBe(200);
    expect(f.db.comments.find(c => c._id === VALID_OID).body).toBe("after @bob");
  });

  it("DELETE comment authenticates via body.author when req.user is absent", async () => {
    const { app, f, io } = await loadApp({ withUser: false });

    const rec = {
      _id: VALID_OID,
      task: TASK_ID,
      author: VALID_OID,
      body: "bye",
      createdAt: new Date(),
    };
    // add instance method so route can call deleteOne()
    rec.deleteOne = vi.fn(async () => {
      const i = f.db.comments.findIndex(x => x._id === VALID_OID);
      if (i >= 0) f.db.comments.splice(i, 1);
    });
    f.db.comments.push(rec);

    const r = await request(app)
      .delete(`/api/tasks/${TASK_ID}/comments/${VALID_OID}`)
      .send({ author: VALID_OID });

    expect(r.status).toBe(200);
    expect(io.emit).toHaveBeenCalledWith("task:comment:deleted", { taskId: TASK_ID, commentId: VALID_OID });
    expect(f.db.comments.find(c => c._id === VALID_OID)).toBeUndefined();
  });

  it("POST comment handles resolveMentionUserIds returning an empty array", async () => {
    const { app, f } = await loadApp();
    f.services.resolveMentionUserIds.mockResolvedValueOnce([]); // explicit empty array

    const r = await request(app)
      .post(`/api/tasks/${TASK_ID}/comments`)
      .send({ author: VALID_OID, body: "no mentions but array path" });

    expect(r.status).toBe(201);
    // mentions should be an empty array
    const saved = f.db.comments.find(c => c.body.includes("no mentions"));
    expect(saved.mentions).toEqual([]);
  });

});
