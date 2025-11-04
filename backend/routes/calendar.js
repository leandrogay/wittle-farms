// backend/routes/calendar.js
import { Router } from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import Task from "../models/Task.js";

const r = Router();

/**
 * @openapi
 * tags:
 *   - name: Calendar
 *     description: Calendar-friendly task feed (deadline-based, per user)
 */

const ACCESS_SECRET =
  process.env.ACCESS_TOKEN_SECRET ||
  process.env.JWT_ACCESS_SECRET ||
  process.env.JWT_SECRET;

function getTokenFromReq(req) {
  // Authorization: Bearer <token>
  const h = req.headers?.authorization || req.headers?.Authorization;
  if (h && h.startsWith("Bearer ")) return h.slice(7);

  // optional cookie fallback
  const raw = req.headers?.cookie || "";
  const hit = raw
    .split(";")
    .map((s) => s.trim())
    .find((s) => /^access(Token)?=/.test(s) || /^jwt=/.test(s));
  if (hit) return hit.split("=")[1];
  return null;
}

function verifyJWT(req, res, next) {
  try {
    if (!ACCESS_SECRET)
      return res.status(500).json({ error: "Server misconfigured: no JWT secret" });
    const token = getTokenFromReq(req);
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    const dec = jwt.verify(token, ACCESS_SECRET);
    req.user = { id: dec.id ?? dec._id ?? dec.sub, role: dec.role };
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

const oid = (v) => {
  try {
    return new mongoose.Types.ObjectId(String(v));
  } catch {
    return null;
  }
};

r.use(verifyJWT);

/**
 * @openapi
 * /api/calendar:
 *   get:
 *     summary: List calendar tasks for the authenticated user
 *     description: >
 *       Returns tasks that **have a deadline within the provided time range** and are either
 *       **created by the user** or **assigned to the user**. Intended for calendar views.
 *     tags: [Calendar]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: start
 *         required: true
 *         description: Start of window (inclusive). ISO datetime string.
 *         schema: { type: string, format: date-time, example: "2025-11-01T00:00:00.000Z" }
 *       - in: query
 *         name: end
 *         required: true
 *         description: End of window (exclusive). ISO datetime string.
 *         schema: { type: string, format: date-time, example: "2025-12-01T00:00:00.000Z" }
 *       - in: query
 *         name: projectId
 *         required: false
 *         description: Filter by project (MongoDB ObjectId)
 *         schema: { type: string, example: "66a1e9d5f4b5f2a5c1d3b9e0" }
 *       - in: query
 *         name: status
 *         required: false
 *         description: Filter by task status
 *         schema:
 *           type: string
 *           enum: [ "To Do", "In Progress", "Done", "Overdue" ]
 *     responses:
 *       200:
 *         description: Tasks in range for this user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CalendarTasksResponse'
 *       400:
 *         description: Missing/invalid parameters
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: Missing or invalid access token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *
 *     examples:
 *       success:
 *         summary: Sample payload
 *         value:
 *           tasks:
 *             - _id: "77aa..."
 *               title: "Prepare slides"
 *               notes: "Focus on KPIs"
 *               allDay: false
 *               startAt: "2025-11-10T01:00:00.000Z"
 *               endAt: "2025-11-10T03:00:00.000Z"
 *               deadline: "2025-11-12T00:00:00.000Z"
 *               status: "In Progress"
 *               priority: "High"
 *               assignedProject: { _id: "66ab...", name: "Q4 Review", color: "#7e57c2" }
 *               assignedTeamMembers:
 *                 - { _id: "55ab...", name: "Alice", email: "alice@ex.com", avatarUrl: "", role: "analyst" }
 *               createdBy: { _id: "55cd...", name: "Bob", email: "bob@ex.com" }
 */
r.get("/", async (req, res, next) => {
  try {
    const { start, end, projectId, status } = req.query;
    if (!start || !end)
      return res.status(400).json({ error: "start and end are required (ISO strings)" });

    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()))
      return res.status(400).json({ error: "Invalid start/end date" });

    const me = oid(req.user?.id);
    if (!me) return res.status(401).json({ error: "Unauthorized" });

    const and = [
      { deadline: { $gte: startDate, $lt: endDate } }, // deadline in range
      { $or: [{ createdBy: me }, { assignedTeamMembers: { $in: [me] } }] }, // mine or assigned to me
    ];
    if (projectId) {
      const p = oid(projectId);
      if (p) and.push({ assignedProject: p });
    }
    if (status) and.push({ status });

    const tasks = await Task.find({ $and: and })
      .populate({ path: "assignedTeamMembers", select: "name email avatarUrl role" })
      .populate({ path: "assignedProject", select: "name color" })
      .populate({ path: "createdBy", select: "name email" })
      .select(
        "title notes allDay startAt endAt deadline status priority assignedTeamMembers assignedProject createdBy"
      )
      .sort({ deadline: 1 })
      .lean();

    res.json({ tasks });
  } catch (err) {
    next(err);
  }
});

export default r;

/**
 * @openapi
 * components:
 *   schemas:
 *     Error:
 *       type: object
 *       properties:
 *         error: { type: string, example: "Invalid start/end date" }
 *         message: { type: string, example: "Unauthorized" }
 *
 *     CalendarTasksResponse:
 *       type: object
 *       properties:
 *         tasks:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/CalendarTask'
 *
 *     CalendarTask:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         title: { type: string }
 *         notes: { type: string }
 *         allDay: { type: boolean }
 *         startAt: { type: string, format: date-time, nullable: true }
 *         endAt: { type: string, format: date-time, nullable: true }
 *         deadline: { type: string, format: date-time }
 *         status:
 *           type: string
 *           enum: [ "To Do", "In Progress", "Done", "Overdue" ]
 *         priority:
 *           type: string
 *           nullable: true
 *         assignedProject:
 *           type: object
 *           nullable: true
 *           properties:
 *             _id: { type: string }
 *             name: { type: string }
 *             color: { type: string, example: "#7e57c2" }
 *         assignedTeamMembers:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               _id: { type: string }
 *               name: { type: string }
 *               email: { type: string, format: email }
 *               avatarUrl: { type: string, nullable: true }
 *               role: { type: string }
 *         createdBy:
 *           type: object
 *           properties:
 *             _id: { type: string }
 *             name: { type: string }
 *             email: { type: string, format: email }
 */
