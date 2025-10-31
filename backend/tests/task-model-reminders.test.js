import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import Task, { DEFAULT_REMINDERS_MIN } from "../models/Task.js";
import User from "../models/User.js";

let mongod;

beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri(), { dbName: "task-model-reminders" });
});

afterAll(async () => {
    try { await mongoose.disconnect(); } finally {
        if (mongod) await mongod.stop();
    }
});

beforeEach(async () => {
    const cols = await mongoose.connection.db.listCollections().toArray();
    await Promise.all(cols.map(c => mongoose.connection.db.collection(c.name).deleteMany({})));
});

describe("Task model reminder hooks", () => {
    it("pre('save'): no deadline → leaves reminderOffsets as [] (false branch)", async () => {
        const u = await User.create({ name: "U", email: "u@example.com", password: "StrongP@ss1" });
        const t = await Task.create({ title: "No deadline", createdBy: u._id });
        expect(Array.isArray(t.reminderOffsets)).toBe(true);
        expect(t.reminderOffsets).toEqual([]);
    });

    it("pre('save'): with deadline & empty reminderOffsets → fills defaults (true branch)", async () => {
        const u = await User.create({ name: "U2", email: "u2@example.com", password: "StrongP@ss1" });
        const t = await Task.create({
            title: "Has deadline",
            createdBy: u._id,
            deadline: new Date("2025-10-20T10:00:00.000Z"),
            reminderOffsets: [],
        });
        expect(t.reminderOffsets).toEqual(DEFAULT_REMINDERS_MIN);
    });

    it("pre('findOneAndUpdate'): with reminderOffsets → normalizes (true branch)", async () => {
        const u = await User.create({ name: "U3", email: "u3@example.com", password: "StrongP@ss1" });
        const t = await Task.create({
            title: "Normalize me",
            createdBy: u._id,
            deadline: new Date("2025-10-20T10:00:00.000Z"),
            reminderOffsets: [1440],
        });

        const updated = await Task.findOneAndUpdate(
            { _id: t._id },
            { reminderOffsets: [0, "1440", "1440", -5, "7200"] },
            { new: true, runValidators: true }
        );
        expect(updated.reminderOffsets).toEqual([7200, 1440]);
    });

    it("pre('findOneAndUpdate'): without reminderOffsets → leaves as-is (false branch)", async () => {
        const u = await User.create({ name: "U4", email: "u4@example.com", password: "StrongP@ss1" });
        const t = await Task.create({
            title: "Keep my offsets",
            createdBy: u._id,
            deadline: new Date("2025-10-20T10:00:00.000Z"),
            reminderOffsets: [4320],
        });

        const updated = await Task.findOneAndUpdate(
            { _id: t._id },
            { title: "Changed title only" },
            { new: true, runValidators: true }
        );

        expect(updated.title).toBe("Changed title only");
        expect(updated.reminderOffsets).toEqual([4320]);
    });

    // Covers line 70: Array.isArray(val) ? val : []  (non-array path)
    it("pre('findOneAndUpdate'): reminderOffsets as a single number (non-array) → normalized to []", async () => {
        const u = await User.create({ name: "U5", email: "u5@example.com", password: "StrongP@ss1" });
        const t = await Task.create({
            title: "Single number offsets",
            createdBy: u._id,
            deadline: new Date("2025-10-20T10:00:00.000Z"),
            reminderOffsets: [60],
        });

        const updated = await Task.findOneAndUpdate(
            { _id: t._id },
            // NOT an array on purpose to hit the false branch of Array.isArray
            { reminderOffsets: 30 },
            { new: true, runValidators: true }
        );

        expect(updated.reminderOffsets).toEqual([]);
    });

    // Covers line 86: const u = this.getUpdate() || {} (|| {} arm)
    it("pre('findOneAndUpdate'): missing update object triggers getUpdate() falsy path (no-op, resolves)", async () => {
        const u = await User.create({ name: "U6", email: "u6@example.com", password: "StrongP@ss1" });
        const t = await Task.create({
            title: "No update supplied",
            createdBy: u._id,
            deadline: new Date("2025-10-20T10:00:00.000Z"),
            reminderOffsets: [1440],
        });

        // Intentionally pass `undefined` to hit `this.getUpdate() || {}` in the pre hook.
        // This should RESOLVE (no-op), not reject.
        // @ts-ignore — pass undefined on purpose
        const updated = await Task.findOneAndUpdate({ _id: t._id }, undefined, { new: true, runValidators: true });

        expect(updated).toBeTruthy();
        expect(updated.title).toBe("No update supplied");
        // Offsets should remain unchanged because we didn't provide reminderOffsets
        expect(updated.reminderOffsets).toEqual([1440]);
    });
});
