import { Router } from 'express';
import Task from '../models/Task.js';

const router = Router();

// POST /api/tasks
router.post('/', async (req, res) => {
  try {
    const doc = await Task.create(req.body);
    const task = await Task.findById(doc._id)
      .populate('assignedTeamMembers', 'name email')
      .populate('createdBy', 'name email')
      .populate('assignedProject', 'name'); res.status(201).json(task);
    
    res.status(201).json(task);

  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// // POST /api/tasks
// router.post('/', async (req, res) => {
//   try {
//     const doc = await Task.create(req.body);
//     const task = await Task.findById(doc._id)
//       .populate('assignedTeamMembers','name email')
//       .populate('createdBy','name email')
//       .populate('assignedProject','name');
//     res.status(201).json(task);
//   } catch (e) {
//     console.error(e);
//     res.status(400).json({ error: e.message });
//   }
// });

// GET /api/tasks
router.get('/', async (req, res) => {
  const { status, assignedProject, assignee, createdBy } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (assignedProject) filter.assignedProject = assignedProject;
  if (createdBy) filter.createdBy = createdBy;
  if (assignee) filter.assignedTeamMembers = assignee;

  const tasks = await Task.find(filter)
    .sort({ deadline: 1, createdAt: -1 })
    .populate('assignedTeamMembers','name email')
    .populate('createdBy','name email')
    .populate('assignedProject','name')
    .lean();
  res.json(tasks);
});

export default router;
