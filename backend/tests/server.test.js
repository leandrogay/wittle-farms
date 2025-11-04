import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import http from "node:http";

/* ------------------- ENV before importing server.js ------------------- */
beforeEach(() => {
    process.env.PORT = "0"; // ephemeral port
    process.env.MONGO_URI = "mongodb://localhost:27017/test";
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
});

/* ----------------------- Mocks: app.js (isolate) ---------------------- */
vi.mock("../app.js", () => {
    const app = express();
    app.get("/health", (_req, res) => res.json({ ok: true }));
    return { default: app };
});

/* ----------------------- Mocks: node-cron capture --------------------- */
const scheduled = [];
vi.mock("node-cron", () => {
    return {
        default: {
            schedule: vi.fn((expr, fn, opts) => {
                const job = { expr, fn, opts, start: vi.fn(), stop: vi.fn() };
                scheduled.push(job);
                return job;
            }),
        },
    };
});

/* -------------------- Mocks: socket.io testable IO -------------------- */
let lastIO = null;
function makeFakeSocket(id = "s1") {
    const handlers = {};
    return {
        id,
        on: (event, cb) => {
            handlers[event] = cb;
        },
        emit: vi.fn(),
        _trigger: async (event, ...args) => {
            if (handlers[event]) return await handlers[event](...args);
        },
        _handlers: handlers,
    };
}
vi.mock("socket.io", () => {
    class FakeIOServer {
        constructor() {
            this._handlers = {};
            this._emits = [];
            lastIO = this;
        }
        on(event, cb) {
            this._handlers[event] = cb;
        }
        emit(...args) {
            this._emits.push(args);
        }
        _simulateConnect(id = "s1") {
            const sock = makeFakeSocket(id);
            this._handlers["connection"]?.(sock);
            return sock;
        }
        _emitted() {
            return this._emits.slice();
        }
    }
    return { Server: FakeIOServer };
});

/* --------------- Mocks: jobs & notification services ------------------ */
const runDailyOverdueDigestMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../jobs/daily-overdue-task-emails", () => ({
    runDailyOverdueDigest: runDailyOverdueDigestMock,
}));

const checkAndCreateRemindersMock = vi.fn().mockResolvedValue([]); // default empty
const getUnreadNotificationsMock = vi.fn().mockResolvedValue([{ id: "n1" }]);
const markNotificationsAsReadMock = vi.fn().mockResolvedValue(undefined);
const sendPendingEmailsMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../services/notification-service.js", () => ({
    checkAndCreateReminders: checkAndCreateRemindersMock,
    getUnreadNotifications: getUnreadNotificationsMock,
    markNotificationsAsRead: markNotificationsAsReadMock,
    sendPendingEmails: sendPendingEmailsMock,
}));

/* ---------------------- Mocks: mongoose.connect ----------------------- */
const connectSpy = vi.fn();

/* ---------------------- Tests for server.js wiring --------------------- */
describe("server.js – 100% coverage", () => {
    it("happy path: starts server, sets io, sockets work, cron jobs success", async () => {
        // Mock mongoose.connect to succeed
        vi.doMock("mongoose", async () => {
            const actual = await vi.importActual("mongoose");
            return {
                ...actual,
                default: { ...actual.default, connect: connectSpy.mockResolvedValue({}) },
            };
        });

        // Spy server.listen to avoid binding a real port
        const listenSpy = vi
            .spyOn(http.Server.prototype, "listen")
            .mockImplementation(function (_port, cb) {
                cb?.();
                return this;
            });

        // Import after mocks are in place
        const serverMod = await import("../server.js");
        expect(serverMod).toBeTruthy();

        // Exactly 2 cron schedules should have been registered
        const cron = (await import("node-cron")).default;
        expect(cron.schedule).toHaveBeenCalledTimes(2);
        expect(scheduled).toHaveLength(2);

        // --- COVER THE forEach EMIT BRANCH ---
        // Make the first minute-cron run return two new notifications
        const nA = { id: "A", userId: "user-42", msg: "hello" };
        const nB = { id: "B", userId: "user-99", msg: "world" };
        checkAndCreateRemindersMock.mockResolvedValueOnce([nA, nB]);

        // Run the minute cron; should emit two "notification:<userId>" events
        await scheduled[0].fn();
        expect(checkAndCreateRemindersMock).toHaveBeenCalledTimes(1);
        expect(sendPendingEmailsMock).toHaveBeenCalledTimes(1);

        // Assert emits
        const emitted = lastIO._emitted();
        expect(emitted).toEqual([
            [`notification:${nA.userId}`, nA],
            [`notification:${nB.userId}`, nB],
        ]);
        // --- END COVERAGE OF forEach EMIT BRANCH ---

        // Daily cron
        await scheduled[1].fn();
        expect(runDailyOverdueDigestMock).toHaveBeenCalledTimes(1);

        // Socket flows
        const { Server: FakeIO } = await import("socket.io");
        expect(lastIO).toBeInstanceOf(FakeIO);
        const sock = lastIO._simulateConnect("u-123");

        await sock._trigger("getUnreadNotifications", "user-1");
        expect(getUnreadNotificationsMock).toHaveBeenCalledWith("user-1");
        expect(sock.emit).toHaveBeenCalledWith("unreadNotifications", [{ id: "n1" }]);

        await sock._trigger("markNotificationsRead", ["nid-1", "nid-2"]);
        expect(markNotificationsAsReadMock).toHaveBeenCalledWith(["nid-1", "nid-2"]);

        await sock._trigger("disconnect");
        expect(typeof sock._handlers.disconnect).toBe("function");

        // DB connect called once
        const mongooseMod = await import("mongoose");
        expect(mongooseMod.default.connect).toHaveBeenCalledTimes(1);

        listenSpy.mockRestore();
    });

    it("uses default port 3000 when process.env.PORT is undefined", async () => {
        vi.restoreAllMocks();
        vi.resetModules();

        delete process.env.PORT;
        process.env.MONGO_URI = "mongodb://localhost:27017/test";

        // prevent .env from repopulating PORT
        vi.doMock("dotenv", () => ({ default: { config: vi.fn() } }));

        const connectSpy = vi.fn().mockResolvedValue({});
        vi.doMock("mongoose", async () => {
            const actual = await vi.importActual("mongoose");
            return { ...actual, default: { ...actual.default, connect: connectSpy } };
        });

        const listenSpy = vi
            .spyOn((await import("node:http")).Server.prototype, "listen")
            .mockImplementation(function (port, cb) { cb?.(); return this; });

        await import("../server.js");

        expect(listenSpy).toHaveBeenCalled();
        const [portArg] = listenSpy.mock.calls[0];
        expect(portArg).toBe(3000); // now it’s the numeric fallback

        listenSpy.mockRestore();
    });

    it("error paths: cron failures and DB connection failure", async () => {
        // Force cron handler errors to hit catch blocks
        checkAndCreateRemindersMock.mockRejectedValueOnce(new Error("reminder boom"));
        sendPendingEmailsMock.mockRejectedValueOnce(new Error("email boom"));
        runDailyOverdueDigestMock.mockRejectedValueOnce(new Error("digest boom"));

        const errSpy = vi.spyOn(console, "error").mockImplementation(() => { });
        vi.doMock("mongoose", async () => {
            const actual = await vi.importActual("mongoose");
            return {
                ...actual,
                default: { ...actual.default, connect: connectSpy.mockRejectedValue(new Error("db down")) },
            };
        });

        const listenSpy = vi
            .spyOn(http.Server.prototype, "listen")
            .mockImplementation(function (_port, cb) {
                cb?.();
                return this;
            });

        await import("../server.js");

        // Minute cron (two failures logged)
        await scheduled[0].fn();
        // Daily cron (one failure logged)
        await scheduled[1].fn();

        expect(errSpy).toHaveBeenCalled();

        listenSpy.mockRestore();
        errSpy.mockRestore();
    });
});
