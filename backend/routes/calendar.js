import { Router } from "express";
import mongoose from "mongoose";
import Task from "../models/Task.js";

const r = Router();

/**
 * GET /api/calendar?start=ISO&end=ISO&userIds=...&projectId=...&status=...
 * Returns tasks that overlap [start,end) OR (no start/end & deadline in window)
 */
r.get("/", async (req, res, next) => {
  try {
    const { start, end, userIds, projectId, status } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: "start and end are required (ISO strings)" });
    }

    const startDate = new Date(start);
    const endDate   = new Date(end);

    // DEBUG
    console.log("[CAL] range", startDate.toISOString(), "->", endDate.toISOString());

    const where = {
      $or: [
        // event window overlaps query window
        { startAt: { $lt: endDate }, endAt: { $gt: startDate } },

        // tasks with no explicit start/end but a deadline in the window
        {
          $and: [
            { $or: [{ startAt: null }, { startAt: { $exists: false } }] },
            { $or: [{ endAt: null },   { endAt:   { $exists: false } }] },
            { deadline: { $gte: startDate, $lt: endDate } },
          ],
        },
      ],
    };

    if (userIds) {
      const ids = (Array.isArray(userIds) ? userIds : String(userIds).split(","))
        .map(s => s.trim()).filter(Boolean)
        .map(id => new mongoose.Types.ObjectId(id));
      where.assignedTeamMembers = { $in: ids };
    }

    if (projectId) where.assignedProject = new mongoose.Types.ObjectId(projectId);
    if (status)    where.status = status;

    const tasks = await Task.find(where)
      .populate({ path: "assignedTeamMembers", select: "name email avatarUrl role" })
      .populate({ path: "assignedProject", select: "name color" })
      .select("title notes allDay startAt endAt deadline status priority assignedTeamMembers assignedProject")
      .sort({ startAt: 1, deadline: 1 })
      .lean();

    // DEBUG
    console.log("[CAL] where", JSON.stringify(where));
    console.log("[CAL] tasks", tasks.length);

    res.json({ tasks });
  } catch (err) {
    next(err);
  }
});

export default r;
