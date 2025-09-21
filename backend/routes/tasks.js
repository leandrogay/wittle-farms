import { Router } from 'express';
import mongoose from 'mongoose';
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

/*
 * READ All Tasks (with optional filters)
 * GET /api/tasks?assignee=USER_ID
 */
router.get('/', async (req, res) => {
  try {
    const { status, assignedProject, assignee, createdBy } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (assignedProject) filter.assignedProject = new mongoose.Types.ObjectId(assignedProject);
    if (createdBy) filter.createdBy = new mongoose.Types.ObjectId(createdBy);
    if (assignee) filter.assignedTeamMembers = new mongoose.Types.ObjectId(assignee);

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

/*
 * READ Single Task
 * GET /api/tasks/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('assignedTeamMembers', 'name email')
      .populate('createdBy', 'name email')
      .populate('assignedProject', 'name')
      .lean();

    if (!task) return res.status(404).json({ error: 'Task not found' });

    res.json(task);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/*
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

/*
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

/*
* GET /api/tasks?project=<projectId>
*/
router.get('/', async (req, res) => {
  try {
    const { project } = req.query;
    const filter = {};

    if (project) {

      const oid = mongoose.isValidObjectId(project)
        ? new mongoose.Types.ObjectId(project)
        : null;

      filter.$or = [
        { assignedProject: oid },                
        { 'assignedProject._id': oid },         
        { 'assignedProject._id': project }        
      ].filter(Boolean);
    }

    const tasks = await Task.find(filter)
      .sort({ createdAt: -1 })
      .populate('createdBy', 'name email')
      .populate('assignedTeamMembers', 'name email')
      .populate('assignedProject', 'name')
      .lean();

    res.json(tasks);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


export default router;
