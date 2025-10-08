import { Router } from "express";
import mongoose from "mongoose";
import Task from "../models/Task.js";

const r = Router();

r.get("/", async (req, res, next) => {
  try {
    const { start, end, userIds, projectId, status } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: "start and end are required (ISO strings)" });
    }

    const startDate = new Date(start);
    const endDate   = new Date(end);

    const where = {
      deadline: { $gte: startDate, $lt: endDate }
    };

    if (userIds) {
      const ids = (Array.isArray(userIds) ? userIds : String(userIds).split(","))
        .map(s => s.trim())
        .filter(Boolean)
        .map(id => new mongoose.Types.ObjectId(id));
      where.assignedTeamMembers = { $in: ids };
    }

    if (projectId) where.assignedProject = new mongoose.Types.ObjectId(projectId);
    if (status)    where.status = status;

    const tasks = await Task.find(where)
      .populate({ path: "assignedTeamMembers", select: "name email avatarUrl role" })
      .populate({ path: "assignedProject", select: "name color" })
      .select("title notes allDay startAt endAt deadline status priority assignedTeamMembers assignedProject")
      .sort({ deadline: 1 })
      .lean();

    res.json({ tasks });
  } catch (err) {
    next(err);
  }
});


export default r;
