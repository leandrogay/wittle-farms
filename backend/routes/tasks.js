import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import Task from '../models/Task.js';
import Attachment from '../models/Attachment.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * CREATE Task
 * POST /api/tasks
 */
router.post('/', upload.array('attachments'), async (req, res) => {
  try {
    const { title, description, notes, assignedProject, assignedTeamMembers, status, priority, deadline, createdBy } = req.body;

    // Validate required fields
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (!assignedProject) {
      return res.status(400).json({ error: 'Assigned project is required' });
    }
    if (!createdBy) {
      return res.status(400).json({ error: 'Created by is required' });
    }

    // Validate ObjectIds
    if (!mongoose.Types.ObjectId.isValid(assignedProject)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    if (!mongoose.Types.ObjectId.isValid(createdBy)) {
      return res.status(400).json({ error: 'Invalid creator ID' });
    }

    // Process assignedTeamMembers
    let teamMembers = [];
    if (assignedTeamMembers) {
      if (typeof assignedTeamMembers === 'string') {
        // Single member or comma-separated string
        teamMembers = assignedTeamMembers.split(',').filter(id => id.trim());
      } else if (Array.isArray(assignedTeamMembers)) {
        teamMembers = assignedTeamMembers;
      }

      // Validate team member IDs
      for (const memberId of teamMembers) {
        if (!mongoose.Types.ObjectId.isValid(memberId)) {
          return res.status(400).json({ error: `Invalid team member ID: ${memberId}` });
        }
      }
    }
    
    const task = await Task.create({
      title,
      description,
      notes,
      assignedProject,
      assignedTeamMembers,
      status,
      priority,
      deadline,
      createdBy,
    });

    if (req.files && req.files.length > 0) {
      const attachments = await Promise.all(
        req.files.map((file) => Attachment.create({
          task: task._id,
          filename: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          data: file.buffer,
          uploadedBy: createdBy,
        }))
      );

      // Link attachments to IDs to task
      task.attachments = attachments.map((a) => a._id);
      await task.save();
    }

    const populatedTask = await Task.findById(task._id)
      .populate("assignedTeamMembers", "name email")
      .populate("createdBy", "name email")
      .populate("assignedProject", "name")
      .populate("attachments");

    res.status(201).json(populatedTask);
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
* READ Task by ProjectId
* GET /api/tasks?project=<projectId>
*/
// router.get('/:projectId', async (req, res) => {
//   try {
//     const { project } = req.query;
//     const filter = {};

//     if (project) {

//       const oid = mongoose.isValidObjectId(project)
//         ? new mongoose.Types.ObjectId(project)
//         : null;

//       filter.$or = [
//         { assignedProject: oid },
//         { 'assignedProject._id': oid },
//         { 'assignedProject._id': project }
//       ].filter(Boolean);
//     }

//     const tasks = await Task.find(filter)
//       .sort({ createdAt: -1 })
//       .populate('createdBy', 'name email')
//       .populate('assignedTeamMembers', 'name email')
//       .populate('assignedProject', 'name')
//       .lean();

//     res.json(tasks);
//   } catch (e) {
//     res.status(500).json({ error: e.message });
//   }
// });

/*
* READ/DOWNLOAD attachement by TaskId & AttachmentId
* GET /api/tasks/:taskId/attachments/:attachmentId
*/
router.get("/:taskId/attachments/:attachmentId", async (req, res) => {
  try {
    const attachment = await Attachment.findById(req.params.attachmentId);
    if (!attachment) return res.status(404).json({ error: "File not found" });

    res.set("Content-Type", attachment.mimetype);
    res.set("Content-Disposition", `attachment; filename="${attachment.filename}"`);
    res.send(attachment.data);
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

export default router;
