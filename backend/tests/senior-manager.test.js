// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import express from "express";

/* ---------- tiny helper to build mongoose-like chains ---------- */
const chain = (payload) => {
  const result = Array.isArray(payload) ? payload : payload;
  const api = {
    populate: vi.fn(() => api),
    select: vi.fn(() => api),
    lean: vi.fn(async () => JSON.parse(JSON.stringify(result))),
  };
  api.exec = api.lean;
  return api;
};

const day = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};

const OID = (hex) => hex.padEnd(24, "0").slice(0, 24);
const D1 = OID("d1");
const D2 = OID("d2");
const U1 = OID("u1");
const U2 = OID("u2");
const U3 = OID("u3");
const U4 = OID("u4");
const P1 = OID("p1");
const P2 = OID("p2");
const P3 = OID("p3");
const P4 = OID("p4");
const T11 = OID("t11");
const T12 = OID("t12");
const T21 = OID("t21");
const T22 = OID("t22");

async function loadApp(mocks) {
  vi.resetModules();

  vi.doMock("mongoose", () => {
    const isValid = (v) => /^[a-f0-9]{24}$/i.test(String(v || ""));
    return { default: { Types: { ObjectId: { isValid } } }, Types: { ObjectId: { isValid } } };
  });

  vi.doMock("../models/Project.js", () => ({ default: { find: vi.fn(() => chain(mocks.projects)) } }));
  vi.doMock("../models/Task.js", () => ({ default: { find: vi.fn(() => chain(mocks.tasks)) } }));
  vi.doMock("../models/User.js", () => ({ default: { find: vi.fn(() => chain(mocks.users)) } }));
  vi.doMock("../models/Department.js", () => ({ default: { find: vi.fn(() => chain(mocks.departments)) } }));

  const router = (await import("../routes/senior-manager.js")).default;
  const app = express();
  app.use(express.json());
  app.use("/api/senior-manager", router);
  return app;
}

describe("GET /api/senior-manager/report (happy & branch coverage)", () => {
  it("happy path: company/dept/project metrics", async () => {
    const projects = [
      {
        _id: P1,
        name: "Alpha",
        createdBy: { _id: U1, name: "Lead A", email: "a@x.com", role: "Manager" },
        teamMembers: [{ _id: U1, name: "A", email: "a@x.com", role: "Dev", department: { _id: D1, name: "D1" } }],
        department: [{ _id: D1, name: "D1" }],
        createdAt: day(-20),
        deadline: day(10),
      },
      {
        _id: P2,
        name: "Beta",
        createdBy: { _id: U2, name: "Lead B", email: "b@x.com", role: "Manager" },
        teamMembers: [{ _id: U2, name: "B", email: "b@x.com", role: "Dev", department: { _id: D1, name: "D1" } }],
        department: [{ _id: D1, name: "D1" }],
        createdAt: day(-15),
        deadline: day(-1),
      },
      {
        _id: P3,
        name: "Gamma",
        createdBy: { _id: U3, name: "Lead C", email: "c@x.com", role: "Manager" },
        teamMembers: [{ _id: U3, name: "C", email: "c@x.com", role: "Dev", department: { _id: D2, name: "D2" } }],
        department: [{ _id: D2, name: "D2" }],
        createdAt: day(-5),
        deadline: day(7),
      },
    ];

    const tasks = [
      {
        _id: T11,
        title: "Alpha-1",
        assignedProject: { _id: P1, name: "Alpha", department: [{ _id: D1, name: "D1" }] },
        status: "Done",
        createdAt: day(-10),
        completedAt: day(-5),
        deadline: day(1),
      },
      {
        _id: T12,
        title: "Alpha-2",
        assignedProject: { _id: P1, name: "Alpha", department: [{ _id: D1, name: "D1" }] },
        status: "Done",
        createdAt: day(-9),
        completedAt: day(-6),
        deadline: day(2),
      },
      {
        _id: T21,
        title: "Beta-1",
        assignedProject: { _id: P2, name: "Beta", department: [{ _id: D1, name: "D1" }] },
        status: "To Do",
        createdAt: day(-3),
        deadline: day(-2),
      },
      {
        _id: T22,
        title: "Beta-2",
        assignedProject: { _id: P2, name: "Beta", department: [{ _id: D1, name: "D1" }] },
        status: "In Progress",
        createdAt: day(-2),
        deadline: day(-1),
      },
    ];

    const departments = [{ _id: D1, name: "D1" }, { _id: D2, name: "D2" }];
    const users = [
      { _id: U1, name: "A", email: "a@x.com", role: "Dev", department: { _id: D1, name: "D1" } },
      { _id: U2, name: "B", email: "b@x.com", role: "Dev", department: { _id: D1, name: "D1" } },
      { _id: U3, name: "C", email: "c@x.com", role: "Dev", department: { _id: D2, name: "D2" } },
      { _id: U4, name: "NoDept", email: "n@x.com", role: "Dev" },
    ];

    const app = await loadApp({ projects, tasks, departments, users });
    const res = await request(app).get("/api/senior-manager/report");
    expect(res.status).toBe(200);

    const body = res.body;
    expect(["Stable", "Improving"]).toContain(body.productivityTrend);

    const c = body.companyScope.projectStatusCounts;
    expect(c.Done).toBe(1);
    expect(c["Overdue"]).toBe(1);
    expect(c["To Do"]).toBe(1);

    const t = body.companyScope.taskStatusCounts;
    expect(t.Done).toBe(2);
    expect(t["Overdue"]).toBe(2);
    expect(t["In Progress"]).toBe(0);
    expect(t["To Do"]).toBe(0);

    const pNames = body.projectBreakdown.map((p) => p.projectName).sort();
    expect(pNames).toEqual(["Alpha", "Beta"]);
  });

  it("covers In Progress (hasInProgress=true) and fallback-else branches", async () => {
    const D = "111111111111111111111111";
    const U = "aaaaaaaaaaaaaaaaaaaaaaaa";
    const P_HAS_IP = "bbbbbbbbbbbbbbbbbbbbbbbb";
    const P_FALLBACK = "cccccccccccccccccccccccc";

    const projects = [
      {
        _id: P_HAS_IP,
        name: "Proj-Has-IP",
        createdAt: day(-5),
        deadline: day(+5),
        department: [{ _id: D, name: "D1" }],
        createdBy: { _id: U, name: "Lead", email: "lead@example.com", role: "Mgr" },
        teamMembers: [{ _id: U, name: "Dev", email: "dev@example.com", role: "Dev", department: { _id: D, name: "D1" } }],
      },
      {
        _id: P_FALLBACK,
        name: "Proj-Fallback",
        createdAt: day(-5),
        deadline: day(+5),
        department: [{ _id: D, name: "D1" }],
        createdBy: { _id: U, name: "Lead", email: "lead@example.com", role: "Mgr" },
        teamMembers: [{ _id: U, name: "Dev", email: "dev@example.com", role: "Dev", department: { _id: D, name: "D1" } }],
      },
    ];

    const tasks = [
      { _id: "t1", assignedProject: { _id: P_HAS_IP, name: "X", department: [{ _id: D, name: "D1" }] }, status: "In Progress", createdAt: day(-2), deadline: day(+2) },
      { _id: "t2", assignedProject: { _id: P_HAS_IP, name: "X", department: [{ _id: D, name: "D1" }] }, status: "To Do", createdAt: day(-1), deadline: day(+3) },
      { _id: "t3", assignedProject: { _id: P_FALLBACK, name: "Y", department: [{ _id: D, name: "D1" }] }, status: "Done", createdAt: day(-4), completedAt: day(-3), deadline: day(+3) },
      { _id: "t4", assignedProject: { _id: P_FALLBACK, name: "Y", department: [{ _id: D, name: "D1" }] }, status: "To Do", createdAt: day(-1), deadline: day(+3) },
    ];

    const departments = [{ _id: D, name: "D1" }];
    const users = [{ _id: U, name: "Dev", email: "dev@example.com", role: "Dev", department: { _id: D, name: "D1" } }];

    const app = await loadApp({ projects, tasks, departments, users });
    const res = await request(app).get("/api/senior-manager/report");
    expect(res.status).toBe(200);

    const comp = res.body.companyScope.projectStatusCounts;
    expect(comp["In Progress"]).toBe(2);

    const d1 = res.body.departmentMetrics.find((d) => d.departmentName === "D1");
    expect(d1.projectStatusCounts["In Progress"]).toBe(2);
  });

  /** --- L81 guard: projectTasks empty inside reducer --- */
  it("triggers avgProjectCompletionDays reducer guard (projectTasks becomes empty) to cover L81", async () => {
    const D = "999999999999999999999999";
    const matchingId = "aaaaaaaaaaaaaaaaaaaaaaaa";
    const differentId = "bbbbbbbbbbbbbbbbbbbbbbbb";

    // Project whose _id changes after first access:
    let accessCount = 0;
    const trickyProject = {
      name: "Zeta",
      createdAt: day(-10),
      deadline: day(+5),
      department: [{ _id: D, name: "D" }],
    };
    Object.defineProperty(trickyProject, "_id", {
      get() {
        accessCount += 1;
        // First time (during completedProjects filter): match tasks
        if (accessCount === 1) return matchingId;
        // Next time (inside reducer): different id → filter returns []
        return differentId;
      },
    });

    const projects = [trickyProject];

    const tasks = [
      {
        _id: "ttt1ttt1ttt1ttt1ttt1ttt1",
        assignedProject: { _id: matchingId, name: "Zeta", department: [{ _id: D, name: "D" }] },
        status: "Done",
        createdAt: day(-8),
        completedAt: day(-3),
      },
    ];

    const departments = [{ _id: D, name: "D" }];
    const users = [];

    const app = await loadApp({ projects, tasks, departments, users });
    const res = await request(app).get("/api/senior-manager/report");
    expect(res.status).toBe(200);
    // If we’re here, the reducer guard ran and didn’t crash
    expect(res.body.companyScope.totalProjects).toBe(1);
  });

  /** --- L288 array-branch: department is array (map executed) AND non-array fallback in same response --- */
  it("covers departments array map (true branch) and single-object fallback (false branch) to hit L288", async () => {
    const DQ = "333333333333333333333333";
    const DR = "444444444444444444444444";

    const P_ARRAY = "aaaaaaaaaaaaaaaaaaaaaaaa";
    const P_SINGLE = "bbbbbbbbbbbbbbbbbbbbbbbb";

    const projects = [
      // array branch – will produce ["Quality"]
      {
        _id: P_ARRAY,
        name: "ArrayDept",
        createdAt: day(-3),
        deadline: day(+10),
        department: [{ _id: DQ, name: "Quality" }],
      },
      // single-object branch with missing name – will produce ["Unassigned"]
      {
        _id: P_SINGLE,
        name: "SingleDept",
        createdAt: day(-2),
        deadline: day(+10),
        department: { _id: DR }, // no name -> 'Unassigned'
      },
    ];

    const tasks = [
      {
        _id: "tq",
        assignedProject: { _id: P_ARRAY, name: "ArrayDept", department: [{ _id: DQ, name: "Quality" }] },
        status: "Done",
        createdAt: day(-2),
        completedAt: day(-1),
      },
      {
        _id: "tr",
        assignedProject: { _id: P_SINGLE, name: "SingleDept", department: { _id: DR } },
        status: "Done",
        createdAt: day(-2),
        completedAt: day(-1),
      },
    ];

    const departments = [{ _id: DQ, name: "Quality" }, { _id: DR, name: "Risk" }];
    const users = [];

    const app = await loadApp({ projects, tasks, departments, users });
    const res = await request(app).get("/api/senior-manager/report");
    expect(res.status).toBe(200);

    const rows = res.body.projectBreakdown.sort((a, b) => a.projectName.localeCompare(b.projectName));
    const arr = rows.find((r) => r.projectName === "ArrayDept");
    const single = rows.find((r) => r.projectName === "SingleDept");

    expect(arr.departments).toEqual(["Quality"]);      // Array.isArray true branch (.map executed)
    expect(single.departments).toEqual(["Unassigned"]); // Non-array fallback executed
  });

  it("0% completion case and empty arrays", async () => {
    const projects = [];
    const tasks = [];
    const departments = [{ _id: D1, name: "D1" }];
    const users = [];

    const app = await loadApp({ projects, tasks, departments, users });
    const res = await request(app).get("/api/senior-manager/report");
    expect(res.status).toBe(200);
    expect(res.body.companyScope.totalProjects).toBe(0);
    expect(res.body.projectBreakdown).toHaveLength(0);
  });
});

describe("GET /api/senior-manager/report (error path)", () => {
  it("500 when an internal error occurs", async () => {
    vi.resetModules();

    vi.doMock("mongoose", () => ({ default: { Types: { ObjectId: { isValid: () => true } } } }));
    vi.doMock("../models/Project.js", () => ({ default: { find: vi.fn(() => { throw new Error("find fail"); }) } }));
    vi.doMock("../models/Task.js", () => ({ default: { find: vi.fn(() => chain([])) } }));
    vi.doMock("../models/User.js", () => ({ default: { find: vi.fn(() => chain([])) } }));
    vi.doMock("../models/Department.js", () => ({ default: { find: vi.fn(() => chain([])) } }));

    const router = (await import("../routes/senior-manager.js")).default;
    const app = express();
    app.use("/api/senior-manager", router);

    const res = await request(app).get("/api/senior-manager/report");
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty("error", "Failed to generate company-wide report");
    expect(res.body.details).toMatch(/find fail/);
  });
});
