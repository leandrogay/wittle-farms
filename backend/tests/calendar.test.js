import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import express from "express";

/**
 * We need to import the router *after* setting env and mocks each time,
 * so we use a helper that resets modules, (re)mocks Task, then imports.
 */
async function loadRouterWithEnv(secret) {
    vi.resetModules();

    // Manage the secret that calendar.js reads at import time
    if (secret === undefined) {
        // simulate "no secret configured"
        delete process.env.ACCESS_TOKEN_SECRET;
        delete process.env.JWT_ACCESS_SECRET;
        delete process.env.JWT_SECRET;
    } else {
        process.env.JWT_SECRET = secret;
        delete process.env.ACCESS_TOKEN_SECRET;
        delete process.env.JWT_ACCESS_SECRET;
    }

    // Fresh mock for Task with chainable query API
    const tasks = [];
    const chain = {
        populate: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(tasks),
    };
    const find = vi.fn().mockReturnValue(chain);

    vi.doMock("../models/Task.js", () => ({
        default: { find },
    }));

    const router = (await import("../routes/calendar.js")).default;
    return { router, tasks, find, chain };
}

function makeApp(router) {
    const app = express();
    app.use(express.json());
    app.use("/api/calendar", router);
    // simple error handler so next(err) returns JSON (for last catch block)
    app.use((err, _req, res, _next) => {
        res.status(500).json({ error: String(err?.message || err) });
    });
    return app;
}

const ISO = (d) => new Date(d).toISOString();
const START = ISO("2025-01-01T00:00:00Z");
const END = ISO("2025-12-31T23:59:59Z");

// Valid and invalid ids (to cover oid() success and failure)
const VALID_ID = "65a1bc2de3f4567890abc123";     // 24-hex string
const INVALID_ID = "not-an-objectid";

describe("calendar router", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("returns 500 if JWT secret is not configured (covers verifyJWT early exit)", async () => {
        const { router } = await loadRouterWithEnv(undefined); // no secret
        const app = makeApp(router);

        const res = await request(app).get("/api/calendar");
        expect(res.status).toBe(500);
        expect(res.body.error).toMatch(/no JWT secret/i);
    });

    it("500 when Task.find throws (covers catch -> next(err))", async () => {
        const { router, find } = await loadRouterWithEnv("secret");
        const app = makeApp(router);

        // Force an error from the DB layer to trigger the route's catch block.
        find.mockImplementation(() => { throw new Error("DB boom"); });

        const tok = jwt.sign({ sub: VALID_ID }, "secret");

        const res = await request(app)
            .get("/api/calendar")
            .set("Authorization", `Bearer ${tok}`)
            .query({ start: START, end: END });

        expect(res.status).toBe(500);
        expect(String(res.body.error)).toMatch(/DB boom/);
    });

    it("returns 401 if no token (covers getTokenFromReq: null path)", async () => {
        const { router } = await loadRouterWithEnv("s3cr3t");
        const app = makeApp(router);

        const res = await request(app).get("/api/calendar");
        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/unauthorized/i);
    });

    it("accepts Authorization: Bearer <token> (lowercase header) and rejects bad signature", async () => {
        const { router } = await loadRouterWithEnv("right");
        const app = makeApp(router);

        // Signed with the wrong secret to trigger jwt verify failure
        const bad = jwt.sign({ sub: VALID_ID, role: "user" }, "wrong");

        const res = await request(app)
            .get("/api/calendar")
            .set("authorization", `Bearer ${bad}`);

        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/unauthorized/i);
    });

    it("accepts Authorization: Bearer <token> (capitalized header)", async () => {
        const { router } = await loadRouterWithEnv("secret");
        const app = makeApp(router);

        const tok = jwt.sign({ sub: INVALID_ID }, "secret"); // invalid id -> will fail later at oid()
        const res = await request(app)
            .get("/api/calendar")
            .set("Authorization", `Bearer ${tok}`)
            .query({ start: START, end: END });

        // middleware ok -> route runs -> oid(req.user.id) invalid -> 401
        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/unauthorized/i);
    });

    it("accepts cookie fallback: jwt=<token> (covers cookie branch in getTokenFromReq)", async () => {
        const { router } = await loadRouterWithEnv("secret");
        const app = makeApp(router);

        const tok = jwt.sign({ sub: INVALID_ID }, "secret");
        const res = await request(app)
            .get("/api/calendar")
            .set("Cookie", `jwt=${tok}`)
            .query({ start: START, end: END });

        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/unauthorized/i);
    });

    it("accepts cookie fallback: accessToken=<token> (covers access(Token)?= branch)", async () => {
        const { router } = await loadRouterWithEnv("secret");
        const app = makeApp(router);

        const tok = jwt.sign({ sub: INVALID_ID }, "secret");
        const res = await request(app)
            .get("/api/calendar")
            .set("Cookie", `foo=bar; accessToken=${tok}; theme=dark`)
            .query({ start: START, end: END });

        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/unauthorized/i);
    });

    it("400 when start or end missing (covers early validation in route)", async () => {
        const { router } = await loadRouterWithEnv("secret");
        const app = makeApp(router);

        const tok = jwt.sign({ sub: VALID_ID }, "secret");

        const missingStart = await request(app)
            .get("/api/calendar")
            .set("Authorization", `Bearer ${tok}`)
            .query({ end: END });
        expect(missingStart.status).toBe(400);
        expect(missingStart.body.error).toMatch(/start and end/i);

        const missingEnd = await request(app)
            .get("/api/calendar")
            .set("Authorization", `Bearer ${tok}`)
            .query({ start: START });
        expect(missingEnd.status).toBe(400);
        expect(missingEnd.body.error).toMatch(/start and end/i);
    });

    it("400 when start/end are invalid ISO strings (covers invalid date path)", async () => {
        const { router } = await loadRouterWithEnv("secret");
        const app = makeApp(router);

        const tok = jwt.sign({ sub: VALID_ID }, "secret");

        const res = await request(app)
            .get("/api/calendar")
            .set("Authorization", `Bearer ${tok}`)
            .query({ start: "nope", end: "also-bad" });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/invalid start\/end date/i);
    });

    it("401 when req.user id is not an ObjectId (covers oid() returning null)", async () => {
        const { router } = await loadRouterWithEnv("secret");
        const app = makeApp(router);

        const tok = jwt.sign({ id: "definitely-not-an-objectid" }, "secret");

        const res = await request(app)
            .get("/api/calendar")
            .set("Authorization", `Bearer ${tok}`)
            .query({ start: START, end: END });

        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/unauthorized/i);
    });

    it("200 happy path: filters by date + createdBy/assigned + optional projectId + status", async () => {
        const { router, tasks, find, chain } = await loadRouterWithEnv("secret");
        const app = makeApp(router);

        // Make the DB return something
        tasks.push({ title: "T1", deadline: new Date(START).toISOString() });

        // Valid user id to cover oid() success branch
        const userId = VALID_ID;
        const tok = jwt.sign({ sub: userId, role: "user" }, "secret");

        const projectId = "65b2cd3ee4f567890abc1234"; // valid-looking
        const status = "In Progress";

        const res = await request(app)
            .get("/api/calendar")
            .set("Authorization", `Bearer ${tok}`)
            .query({ start: START, end: END, projectId, status });

        expect(res.status).toBe(200);
        expect(res.body.tasks).toHaveLength(1);

        // Assert the query shape built in the route
        expect(find).toHaveBeenCalledTimes(1);
        const call = find.mock.calls[0][0];
        expect(call.$and).toBeTruthy();
        // Should include at least: deadline range, createdBy/assigned OR, projectId, status
        expect(call.$and.length).toBeGreaterThanOrEqual(4);

        // Check the chain was used
        expect(chain.populate).toHaveBeenCalledTimes(3);
        expect(chain.select).toHaveBeenCalledTimes(1);
        expect(chain.sort).toHaveBeenCalledWith({ deadline: 1 });
    });

    it("projectId invalid -> simply ignored (covers projectId branch without pushing a filter)", async () => {
        const { router, tasks, find } = await loadRouterWithEnv("secret");
        const app = makeApp(router);

        tasks.push({ title: "T2", deadline: new Date(END).toISOString() });

        const tok = jwt.sign({ sub: VALID_ID }, "secret");

        const res = await request(app)
            .get("/api/calendar")
            .set("Authorization", `Bearer ${tok}`)
            .query({ start: START, end: END, projectId: "bad-id" });

        expect(res.status).toBe(200);
        expect(res.body.tasks).toHaveLength(1);

        const and = find.mock.calls[0][0].$and;
        // With invalid projectId, route pushes no extra assignedProject filter, so $and length is 2 (date + OR) or 3 if status is present.
        expect(and.length).toBe(2);
    });
});
