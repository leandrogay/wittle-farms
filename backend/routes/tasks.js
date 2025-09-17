import { Router } from 'express';
import Task from '../models/Task.js';

const router = Router();

/**
 * CREATE Task
 * POST /api/tasks
 */
router.post('/', async (req, res) => {
  try {
    const doc = await Task.create(req.body);

    const task = await Task.findById(doc._id)
      .populate('assignedTeamMembers', 'name email')
      .populate('createdBy', 'name email')
      .populate('assignedProject', 'name');

    res.status(201).json(task);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * READ All Tasks (with optional filters)
 * GET /api/tasks
 */
router.get('/', async (req, res) => {
  try {
    const { status, assignedProject, assignee, createdBy } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (assignedProject) filter.assignedProject = assignedProject;
    if (createdBy) filter.createdBy = createdBy;
    if (assignee) filter.assignedTeamMembers = assignee;

    const tasks = await Task.find(filter)
      .sort({ deadline: 1, createdAt: -1 })
      .populate('assignedTeamMembers', 'name email')
      .populate('createdBy', 'name email')
      .populate('assignedProject', 'name')
      .lean();

    res.json(tasks);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * READ Single Task
 * GET /api/tasks/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('assignedTeamMembers', 'name email')
      .populate('createdBy', 'name email')
      .populate('assignedProject', 'name');

    if (!task) return res.status(404).json({ error: 'Task not found' });

    res.json(task);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * UPDATE Task
 * PUT /api/tasks/:id
 */
router.put('/:id', async (req, res) => {
  try {
    const task = await Task.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate('assignedTeamMembers', 'name email')
      .populate('createdBy', 'name email')
      .populate('assignedProject', 'name');

    if (!task) return res.status(404).json({ error: 'Task not found' });

    res.json(task);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * DELETE Task
 * DELETE /api/tasks/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);

    if (!task) return res.status(404).json({ error: 'Task not found' });

    res.json({ message: 'Task deleted successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
