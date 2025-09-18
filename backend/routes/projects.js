import { Router } from 'express';
import mongoose from 'mongoose';
import Project from '../models/Project.js';

const router = Router();

/**
 * CREATE Project
 * POST /api/projects
 */
router.post('/', async (req, res) => {
  try {
    const doc = await Project.create(req.body);

    const project = await Project.findById(doc._id)
      .populate('createdBy', 'name email')
      .populate('teamMembers', 'name email');

    res.status(201).json(project);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * READ All Projects (with optional filters)
 * GET /api/projects?teamMember=USER_ID
 */
router.get('/', async (req, res) => {
  try {
    const { teamMember, createdBy } = req.query;
    const filter = {};

    if (createdBy) filter.createdBy = new mongoose.Types.ObjectId(createdBy);
    if (teamMember) filter.teamMembers = new mongoose.Types.ObjectId(teamMember);

    const projects = await Project.find(filter)
      .sort({ createdAt: -1 })
      .populate('createdBy', 'name email')
      .populate('teamMembers', 'name email')
      .lean();

    res.json(projects);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * READ Single Project
 * GET /api/projects/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('teamMembers', 'name email')
      .lean();

    if (!project) return res.status(404).json({ error: 'Project not found' });

    res.json(project);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * UPDATE Project
 * PUT /api/projects/:id
 */
router.put('/:id', async (req, res) => {
  try {
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate('createdBy', 'name email')
      .populate('teamMembers', 'name email');

    if (!project) return res.status(404).json({ error: 'Project not found' });

    res.json(project);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * DELETE Project
 * DELETE /api/projects/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const project = await Project.findByIdAndDelete(req.params.id);

    if (!project) return res.status(404).json({ error: 'Project not found' });

    res.json({ message: 'Project deleted successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
