// backend/routes/calendar.js
import { Router } from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import Task from "../models/Task.js";

const r = Router();

// pick whatever your auth code uses to sign access tokens
const ACCESS_SECRET =
  process.env.ACCESS_TOKEN_SECRET ||
  process.env.JWT_ACCESS_SECRET ||
  process.env.JWT_SECRET;

function getTokenFromReq(req) {
  // Authorization: Bearer <token>
  const h = req.headers?.authorization || req.headers?.Authorization;
  if (h && h.startsWith("Bearer ")) return h.slice(7);

  // optional cookie fallback if you happen to set one
  const raw = req.headers?.cookie || "";
  const hit = raw
    .split(";")
    .map(s => s.trim())
    .find(s => /^access(Token)?=/.test(s) || /^jwt=/.test(s));
  if (hit) return hit.split("=")[1];
  return null;
}

function verifyJWT(req, res, next) {
  try {
    if (!ACCESS_SECRET) return res.status(500).json({ error: "Server misconfigured: no JWT secret" });
    const token = getTokenFromReq(req);
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    const dec = jwt.verify(token, ACCESS_SECRET);
    req.user = { id: dec.id ?? dec._id ?? dec.sub, role: dec.role };
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

const oid = v => {
  try { return new mongoose.Types.ObjectId(String(v)); } catch { return null; }
};

r.use(verifyJWT);

/* Only tasks that:
   - have a deadline in range, AND
   - were created by me OR assigned to me
*/
r.get("/", async (req, res, next) => {
  try {
    const { start, end, projectId, status } = req.query;
    if (!start || !end) return res.status(400).json({ error: "start and end are required (ISO strings)" });

    const startDate = new Date(start);
    const endDate   = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()))
      return res.status(400).json({ error: "Invalid start/end date" });

    const me = oid(req.user?.id);
    if (!me) return res.status(401).json({ error: "Unauthorized" });

    const and = [
      { deadline: { $gte: startDate, $lt: endDate } },                 // must have deadline in range
      { $or: [{ createdBy: me }, { assignedTeamMembers: { $in: [me] }}] } // created by me OR assigned to me
    ];
    if (projectId) { const p = oid(projectId); if (p) and.push({ assignedProject: p }); }
    if (status) and.push({ status });

    const tasks = await Task.find({ $and: and })
      .populate({ path: "assignedTeamMembers", select: "name email avatarUrl role" })
      .populate({ path: "assignedProject", select: "name color" })
      .populate({ path: "createdBy", select: "name email" })
      .select("title notes allDay startAt endAt deadline status priority assignedTeamMembers assignedProject createdBy")
      .sort({ deadline: 1 })
      .lean();

    res.json({ tasks });
  } catch (err) {
    next(err);
  }
});

export default r;
