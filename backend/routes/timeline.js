import { Router } from "express";
import mongoose from "mongoose";
import Task from "../models/Task.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { user: userId, from, to } = req.query;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid or missing user id" });
    }

    const filter = {
      assignedTeamMembers: new mongoose.Types.ObjectId(userId),
    };

    const range = {};
    if (from) range.$gte = new Date(from + "T00:00:00.000Z");
    if (to)   range.$lte = new Date(to   + "T23:59:59.999Z");
    if (Object.keys(range).length) {
      filter.$or = [
        { createdAt: range },
        { deadline: range },
      ];
    }

    // SELECT ALL NEEDED FIELDS!
    const tasks = await Task.find(filter)
      .select("title status createdAt startAt endAt deadline completedAt assignedProject")
      .populate("assignedProject", "name")
      .sort({ createdAt: -1 })
      .lean();

    const items = tasks.map(t => ({
      id: String(t._id),
      title: t.title,
      status: t.status,
      project: t.assignedProject?.name || "",

      createdAt: t.createdAt ?? null,
      startAt: t.startAt ?? t.createdAt ?? null,
      endAt: t.endAt ?? null,
      deadline: t.deadline ?? null,
      completedAt: t.completedAt ?? null,
    }));

    res.json({ items });
  } catch (e) {
    console.error("[dashboard/timeline] failed:", e);
    res.status(500).json({ error: "Failed to load timeline" });
  }
});

export default router;
