// routes/projects.js
import { Router } from "express";
import mongoose from "mongoose";
import Project from "../models/Project.js";

const router = Router();

/** Accept multiple client aliases and normalize to string[] of ObjectIds */
function normalizeDeptIds(body) {
  const raw =
    body.department ??
    body.departments ??
    body.departmentIds ??
    (body.departmentId ? [body.departmentId] : []);
  const arr = Array.isArray(raw) ? raw : [raw].filter(Boolean);
  return [...new Set(arr.map(String).filter(Boolean))];
}

/** Build a mongo filter from query (optional) */
function buildFilter(q) {
  const f = {};
  if (q.createdBy) f.createdBy = new mongoose.Types.ObjectId(q.createdBy);
  if (q.teamMember) f.teamMembers = new mongoose.Types.ObjectId(q.teamMember);
  if (q.department) f.department = { $in: [].concat(q.department) };
  return f;
}

/** CREATE */
router.post("/", async (req, res) => {
  try {
    const department = normalizeDeptIds(req.body);
    if (!department.length) {
      return res.status(400).json({ error: "At least one department is required." });
    }

    const doc = await Project.create({
      name: req.body.name,
      description: req.body.description ?? "",
      department, // save canonical field
      createdBy: req.user?._id || req.body.createdBy, // prefer auth, fallback to body
      teamMembers: req.body.teamMembers ?? [],
      priority: req.body.priority ?? "Medium",
      visibility: req.body.visibility ?? "Team",
      startDate: req.body.startDate || undefined,
      endDate: req.body.endDate || undefined,
      deadline: req.body.deadline || undefined,
      projectLead: req.body.projectLead || undefined,
    });

    const populated = await Project.findById(doc._id)
      .populate("createdBy", "name email")
      .populate("teamMembers", "name email")
      .populate("department", "name");

    res.status(201).json(populated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/** READ ALL (optionally filter; always populate) */
router.get("/", async (req, res) => {
  try {
    const filter = buildFilter(req.query);
    const projects = await Project.find(filter)
      .sort({ createdAt: -1 })
      .populate("createdBy", "name email")
      .populate("teamMembers", "name email")
      .populate("department", "name");
    res.json(projects);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** READ ONE (with populate) */
router.get("/:id", async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate("createdBy", "name email")
      .populate("teamMembers", "name email")
      .populate("department", "name");
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(project);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** UPDATE (normalize department aliases if provided) */
router.put("/:id", async (req, res) => {
  try {
    const update = { ...req.body };
    const deptIds = normalizeDeptIds(req.body);
    if (deptIds.length) update.department = deptIds;

    const project = await Project.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    })
      .populate("createdBy", "name email")
      .populate("teamMembers", "name email")
      .populate("department", "name");

    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(project);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/** DELETE */
router.delete("/:id", async (req, res) => {
  try {
    const project = await Project.findByIdAndDelete(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json({ message: "Project deleted successfully" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
