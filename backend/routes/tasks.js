import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';

import Task, { DEFAULT_REMINDERS_MIN } from '../models/Task.js';
import Attachment from '../models/Attachment.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

/** Convert incoming reminderOffsets (array | string | CSV) to a clean number[] (minutes, >0) */
function coerceReminderOffsets(input) {
  if (input == null) return [];
  if (typeof input === 'string') {
    // If multipart we send JSON string, try parse first
    try {
      input = JSON.parse(input);
    } catch {
      // Fallback for CSV like "7200,1440"
      input = String(input).split(',').map(s => s.trim());
    }
  }
  const arr = Array.isArray(input) ? input : [input];
  return [...new Set(arr.map(Number))]
    .filter(n => Number.isFinite(n) && n > 0)
    .sort((a, b) => b - a);
}

/**
 * CREATE Task
 * POST /api/tasks
 */
router.post('/', upload.array('attachments'), async (req, res) => {
  try {
    const {
      title,
      description,
      notes,
      assignedProject,
      assignedTeamMembers,
      status,
      priority,
      deadline,
      createdBy,
      allDay,
      startAt,
      endAt,
      reminderOffsets, // optional
    } = req.body;

    // Required
    if (!title) return res.status(400).json({ error: 'Title is required' });
    if (!assignedProject) return res.status(400).json({ error: 'Assigned project is required' });
    if (!createdBy) return res.status(400).json({ error: 'Created by is required' });

    // Validate IDs
    if (!mongoose.Types.ObjectId.isValid(assignedProject)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    if (!mongoose.Types.ObjectId.isValid(createdBy)) {
      return res.status(400).json({ error: 'Invalid creator ID' });
    }

    // Team members
    let teamMembers = [];
    if (assignedTeamMembers) {
      if (typeof assignedTeamMembers === 'string') {
        teamMembers = assignedTeamMembers.split(',').map(s => s.trim()).filter(Boolean);
      } else if (Array.isArray(assignedTeamMembers)) {
        teamMembers = assignedTeamMembers;
      }
      for (const memberId of teamMembers) {
        if (!mongoose.Types.ObjectId.isValid(memberId)) {
          return res.status(400).json({ error: `Invalid team member ID: ${memberId}` });
        }
      }
    }

    // Times
    const now = new Date();
    const sAt = startAt ? new Date(startAt) : now;
    let eAt = endAt
      ? new Date(endAt)
      : (deadline ? new Date(deadline) : new Date(sAt.getTime() + 60 * 60 * 1000));
    if (eAt < sAt) eAt = new Date(sAt.getTime() + 60 * 60 * 1000);

    // Reminders
    const cleanOffsets = coerceReminderOffsets(reminderOffsets);
    const finalOffsets = deadline
      ? (cleanOffsets.length ? cleanOffsets : DEFAULT_REMINDERS_MIN)
      : [];

    const task = await Task.create({
      title,
      description,
      notes,
      assignedProject,
      assignedTeamMembers: teamMembers,
      status,
      priority,
      deadline: deadline ? new Date(deadline) : null,
      createdBy,
      allDay: (allDay === true || allDay === 'true'),
      startAt: sAt,
      endAt: eAt,
      reminderOffsets: finalOffsets,
    });

    // Attachments (optional)
    if (req.files && req.files.length > 0) {
      const attachments = await Promise.all(
        req.files.map(file =>
          Attachment.create({
            task: task._id,
            filename: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            data: file.buffer,
            uploadedBy: createdBy,
          })
        )
      );
      task.attachments = attachments.map(a => a._id);
      await task.save();
    }

    const populatedTask = await Task.findById(task._id)
      .populate('assignedTeamMembers', 'name email')
      .populate('createdBy', 'name email')
      .populate('assignedProject', 'name')
      .populate('attachments');

    const io = req.app.get('io');
    io?.emit?.('calendar:task:created', { task: populatedTask });

    res.status(201).json(populatedTask);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * READ all tasks
 * GET /api/tasks?assignedProject=<id>&status=<status>&assignee=<userId>&createdBy=<userId>
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

/** READ one task */
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

/**
 * UPDATE Task
 * PUT /api/tasks/:id
 */
router.put('/:id', upload.array('attachments'), async (req, res) => {
  try {
    const {
      title,
      description,
      notes,
      assignedProject,
      assignedTeamMembers,
      status,
      priority,
      deadline,
      createdBy,
      allDay,
      startAt,
      endAt,
      reminderOffsets, // optional
    } = req.body;

    const existing = await Task.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    // Validate IDs only if provided
    if (assignedProject !== undefined && !mongoose.Types.ObjectId.isValid(assignedProject)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    if (createdBy !== undefined && !mongoose.Types.ObjectId.isValid(createdBy)) {
      return res.status(400).json({ error: 'Invalid creator ID' });
    }

    // Team members (optional)
    let teamMembers;
    if (assignedTeamMembers !== undefined) {
      if (typeof assignedTeamMembers === 'string') {
        teamMembers = assignedTeamMembers.split(',').map(s => s.trim()).filter(Boolean);
      } else if (Array.isArray(assignedTeamMembers)) {
        teamMembers = assignedTeamMembers;
      }
      for (const id of teamMembers) {
        if (!mongoose.Types.ObjectId.isValid(id)) {
          return res.status(400).json({ error: `Invalid team member ID: ${id}` });
        }
      }
    }

    // Build partial update object
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (notes !== undefined) updateData.notes = notes;
    if (assignedProject !== undefined) updateData.assignedProject = assignedProject;
    if (teamMembers !== undefined) updateData.assignedTeamMembers = teamMembers;
    if (status !== undefined) updateData.status = status;
    if (priority !== undefined) updateData.priority = priority;
    if (createdBy !== undefined) updateData.createdBy = createdBy;
    if (deadline !== undefined) updateData.deadline = deadline ? new Date(deadline) : null;
    if (allDay !== undefined) updateData.allDay = (allDay === true || allDay === 'true');
    if (startAt !== undefined) updateData.startAt = startAt ? new Date(startAt) : null;
    if (endAt !== undefined) updateData.endAt = endAt ? new Date(endAt) : null;

    // Determine what the deadline will be AFTER this update
    const nextDeadline = (deadline !== undefined)
      ? (deadline ? new Date(deadline) : null)
      : existing.deadline;

    // Reminders:
    // - If client provided reminderOffsets:
    //     * if nextDeadline and cleaned is empty => default to 7/3/1
    //     * if nextDeadline and cleaned not empty => use cleaned
    //     * if no nextDeadline => []
    // - If client did NOT provide reminderOffsets:
    //     * if nextDeadline is null => clear reminders []
    //     * else if nextDeadline exists and existing has no reminders => default to 7/3/1
    if (reminderOffsets !== undefined) {
      const cleaned = coerceReminderOffsets(reminderOffsets);
      updateData.reminderOffsets = nextDeadline
        ? (cleaned.length ? cleaned : DEFAULT_REMINDERS_MIN)
        : [];
    } else {
      if (!nextDeadline) {
        updateData.reminderOffsets = [];
      } else {
        const hadNone = !Array.isArray(existing.reminderOffsets) || existing.reminderOffsets.length === 0;
        if (hadNone) {
          updateData.reminderOffsets = DEFAULT_REMINDERS_MIN;
        }
      }
    }

    // Normalize times
    let sAt = updateData.startAt ?? existing.startAt ?? existing.createdAt ?? new Date();
    let eAt =
      updateData.endAt ??
      existing.endAt ??
      (updateData.deadline ?? existing.deadline) ??
      new Date(sAt.getTime() + 60 * 60 * 1000);

    if (eAt < sAt) eAt = new Date(sAt.getTime() + 60 * 60 * 1000);
    updateData.startAt = sAt;
    updateData.endAt = eAt;

    const task = await Task.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    });

    // New attachments (optional)
    if (req.files && req.files.length > 0) {
      const newAttachments = await Promise.all(
        req.files.map(file =>
          Attachment.create({
            task: task._id,
            filename: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            data: file.buffer,
            uploadedBy: createdBy || task.createdBy,
          })
        )
      );
      const existingAttachmentIds = task.attachments || [];
      task.attachments = [...existingAttachmentIds, ...newAttachments.map(a => a._id)];
      await task.save();
    }

    const populatedTask = await Task.findById(task._id)
      .populate('assignedTeamMembers', 'name email')
      .populate('createdBy', 'name email')
      .populate('assignedProject', 'name')
      .populate('attachments');

    const io = req.app.get('io');
    io?.emit?.('calendar:task:updated', { task: populatedTask });

    res.json(populatedTask);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/** DELETE task */
router.delete('/:id', async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const io = req.app.get('io');
    io?.emit?.('calendar:task:deleted', { id: req.params.id });

    res.json({ message: 'Task deleted successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Download an attachment for a task */
router.get('/:taskId/attachments/:attachmentId', async (req, res) => {
  try {
    const attachment = await Attachment.findById(req.params.attachmentId);
    if (!attachment) return res.status(404).json({ error: 'File not found' });

    res.set('Content-Type', attachment.mimetype);
    res.set('Content-Disposition', `attachment; filename="${attachment.filename}"`);
    res.send(attachment.data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Danger: drop all attachments (dev) */
router.delete('/attachments/drop', async (req, res) => {
  try {
    await Attachment.deleteMany({});
    res.json({ message: 'All attachments deleted successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
