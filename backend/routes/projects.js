// routes/projects.js
import { Router } from 'express';
import mongoose from 'mongoose';
import Project from '../models/Project.js';

const router = Router();

// populate helper (always return rich objects)
const populateProject = (query) =>
  query.populate('createdBy', 'name email')
    .populate('teamMembers', 'name email')
    .populate('department', 'name');

// normalize department aliases from client -> string[] of ids
function normalizeDeptIds(body) {
  const raw =
    body.department ??
    body.departments ??
    body.departmentIds ??
    (body.departmentId ? [body.departmentId] : []);
  const arr = Array.isArray(raw) ? raw : [raw].filter(Boolean);
  return [...new Set(arr.map(String).filter(Boolean))];
}

// optional list filters
function buildFilter(q) {
  const f = {};
  if (q.createdBy && mongoose.isValidObjectId(q.createdBy)) {
    f.createdBy = new mongoose.Types.ObjectId(q.createdBy);
  }
  if (q.teamMember && mongoose.isValidObjectId(q.teamMember)) {
    f.teamMembers = new mongoose.Types.ObjectId(q.teamMember);
  }
  if (q.department && mongoose.isValidObjectId(q.department)) {
    f.department = new mongoose.Types.ObjectId(q.department);
  }
  return f;
}

/** CREATE */
router.post('/', async (req, res) => {
  try {
    const department = normalizeDeptIds(req.body);
    if (!department.length) {
      return res.status(400).json({ error: 'At least one department is required.' });
    }

    const doc = await Project.create({
      name: req.body.name,
      description: req.body.description ?? '',
      department,                                  // ✅ store canonical field
      createdBy: req.user?._id || req.body.createdBy,
      teamMembers: req.body.teamMembers ?? [],
      projectLead: req.body.projectLead || undefined,
      priority: req.body.priority ?? 'Medium',
      visibility: req.body.visibility ?? 'Team',
      startDate: req.body.startDate || undefined,
      endDate: req.body.endDate || undefined,
      deadline: req.body.deadline || undefined,
    });

    const project = await populateProject(Project.findById(doc._id));
    res.status(201).json(await project);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/** LIST */
router.get('/', async (req, res) => {
  try {
    const filter = buildFilter(req.query);
    const projects = await populateProject(
      Project.find(filter).sort({ createdAt: -1 })
    ).lean();
    res.json(projects);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** READ ONE (always populated) */
router.get('/:id', async (req, res) => {
  try {
    const project = await populateProject(
      Project.findById(req.params.id)
    ).lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** READ by user (createdBy or team member) */
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }
    const projects = await populateProject(
      Project.find({ $or: [{ createdBy: userId }, { teamMembers: userId }] })
        .sort({ createdAt: -1 })
    ).lean();

    // return empty array (200) rather than 404 for easier clients
    res.json(projects || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** UPDATE (accept aliases again) */
router.put('/:id', async (req, res) => {
  try {
    const update = { ...req.body };
    const dep = normalizeDeptIds(req.body);
    if (dep.length) update.department = dep;

    const project = await populateProject(
      Project.findByIdAndUpdate(req.params.id, update, {
        new: true,
        runValidators: true,
      })
    );
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(await project);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/** DELETE */
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Project.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Project not found' });
    res.json({ message: 'Project deleted successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
