import { Router } from "express";
import mongoose from "mongoose";
import Task from "../models/Task.js";

const router = Router();

// Strict YYYY-MM-DD validator
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isValidDay = (s) => DAY_RE.test(s) && !Number.isNaN(new Date(`${s}T00:00:00.000Z`).getTime());
const dayStartUtc = (s) => new Date(`${s}T00:00:00.000Z`);
const dayEndUtc   = (s) => new Date(`${s}T23:59:59.999Z`);

router.get("/", async (req, res) => {
  try {
    const { user: userId, from, to } = req.query;

    // user id required and must be ObjectId
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid or missing user id" });
    }

    // validate 'from'
    let gte = null;
    if (from !== undefined) {
      if (!isValidDay(String(from))) {
        return res
          .status(400)
          .json({ error: "Invalid 'from' date format; expected YYYY-MM-DD" });
      }
      gte = dayStartUtc(String(from));
    }

    // validate 'to'
    let lte = null;
    if (to !== undefined) {
      if (!isValidDay(String(to))) {
        return res
          .status(400)
          .json({ error: "Invalid 'to' date format; expected YYYY-MM-DD" });
      }
      lte = dayEndUtc(String(to));
    }

    // range inversion
    if (gte && lte && gte > lte) {
      return res
        .status(400)
        .json({ error: "'from' cannot be after 'to'" });
    }

    // base filter: tasks where the user is an assignee
    const filter = {
      assignedTeamMembers: new mongoose.Types.ObjectId(userId),
    };

    // optional date window over createdAt OR deadline (inclusive)
    if (gte || lte) {
      const range = {};
      if (gte) range.$gte = gte;
      if (lte) range.$lte = lte;
      filter.$or = [{ createdAt: range }, { deadline: range }];
    }

    const tasks = await Task.find(filter)
      .select("title status createdAt startAt endAt deadline completedAt assignedProject")
      .populate("assignedProject", "name")
      .sort({ createdAt: -1 })
      .lean();

    const items = tasks.map((t) => ({
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
