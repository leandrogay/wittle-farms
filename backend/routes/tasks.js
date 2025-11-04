import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';

import Task, { DEFAULT_REMINDERS_MIN } from '../models/Task.js';
import Attachment from '../models/Attachment.js';
import { createUpdateNotifications, sendPendingEmails } from '../services/notification-service.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Populate helper - centralized task population logic
const populateTask = (query) =>
  query
    .populate('assignedTeamMembers', 'name email')
    .populate('createdBy', 'name email')
    .populate('assignedProject', 'name')
    .populate('attachments');

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

function coercePriority(input) {
  if (input == null || input === '') return undefined;
  const n = Number(input);
  if (!Number.isFinite(n)) return undefined;
  // clamp to 1..10
  return Math.max(1, Math.min(10, Math.trunc(n)));
}

/** Parse & normalize recurrence from body (object or JSON string). Returns {frequency, interval, ends, until} or null */
function coerceRecurrence(input) {
  console.log(" [coerceRecurrence] input:", input);

  if (!input) return null;
  if (typeof input === "string") {
    try { input = JSON.parse(input); } catch {
      console.log("JSON parse failed for:", input);
      return null;
    }
  }

  const freq = (input.frequency || "").toLowerCase();
  if (!["daily", "weekly", "monthly"].includes(freq)) {
    if (freq === "none") console.log(" Ignoring 'none' recurrence from client");
    return null;
  }

  const rec = {
    frequency: freq,
    interval: Math.max(1, Number(input.interval) || 1),
    ends: input.ends || "never",
    until: input.until ? new Date(input.until) : null,
  };
  console.log("[coerceRecurrence] output:", rec);
  return rec;
}



/** Compute the next deadline from a given deadline & recurrence rule. Returns Date or null if beyond `until`. */
function computeNextDeadline(currentDeadline, recurrence) {
  if (!currentDeadline || !recurrence) return null;
  const base = new Date(currentDeadline);
  const next = new Date(base);
  const { frequency, interval, ends, until } = recurrence;
  if (frequency === 'daily') {
    next.setDate(next.getDate() + interval);
  } else if (frequency === 'weekly') {
    next.setDate(next.getDate() + 7 * interval);
  } else if (frequency === 'monthly') {
    const day = next.getDate();
    const m = next.getMonth();
    next.setMonth(m + interval);
    // If date overflowed (e.g., Jan 31 -> Feb), JS auto-rolls. That’s OK for most cases.
    if (next.getDate() !== day) {
    }
  }
  if (ends === 'onDate' && until) {
    if (next > new Date(until)) return null; // stop series
  }
  return next;
}


/**
 * @openapi
 * /api/tasks:
 *   post:
 *     tags: [Tasks]
 *     summary: Create a task
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title: { type: string }
 *     responses:
 *       201:
 *         description: Created
 */

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
      reminderOffsets,
      recurrence,
      parentTask,
    } = req.body;

    // === DEBUG LOGS FOR RECURRENCE TESTING ===
    console.log("Raw req.body.recurrence:", req.body.recurrence);
    if (typeof req.body.recurrence === "string") {
      try {
        const parsed = JSON.parse(req.body.recurrence);
        console.log("Parsed recurrence:", parsed);
      } catch (err) {
        console.log("Failed to parse recurrence string:", req.body.recurrence);
      }
    } else if (req.body.recurrence && typeof req.body.recurrence === "object") {
      console.log("Recurrence already an object:", req.body.recurrence);
    } else {
      console.log(" No recurrence data received or null");
    }

    const coercedPriority = coercePriority(priority);

    // Required
    if (!title) return res.status(400).json({ error: 'Title is required' });
    if (!assignedProject) return res.status(400).json({ error: 'Assigned project is required' });
    if (!createdBy) return res.status(400).json({ error: 'Created by is required' });

    let parentDoc = null;
    let projectToUse = assignedProject || null;
    if (parentTask) {
      if (!mongoose.Types.ObjectId.isValid(parentTask)) {
        return res.status(400).json({ error: 'Invalid parentTask ID' });
      }
      parentDoc = await Task.findById(parentTask);
      if (!parentDoc) return res.status(404).json({ error: 'Parent task not found' });
      if (!projectToUse) projectToUse = parentDoc.assignedProject ?? null;
    }


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

    // Recurrence
    const rec = coerceRecurrence(recurrence);
    if (rec && !deadline) {
      return res.status(400).json({ error: 'A deadline is required when recurrence is enabled.' });
    }

    const task = await Task.create({
      title,
      description,
      notes,
      parentTask: parentTask || null, 
      assignedProject,
      assignedTeamMembers: teamMembers,
      status,
      priority: coercedPriority ?? undefined,
      deadline: deadline ? new Date(deadline) : null,
      createdBy,
      allDay: (allDay === true || allDay === 'true'),
      startAt: sAt,
      endAt: eAt,
      reminderOffsets: finalOffsets,
      recurrence: rec ?? null,
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

    const populatedTask = await populateTask(Task.findById(task._id));

    const io = req.app.get('io');
    io?.emit?.('calendar:task:created', { task: populatedTask });

    res.status(201).json(populatedTask);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});


/**
 * @openapi
 * /api/tasks:
 *   get:
 *     tags: [Tasks]
 *     summary: List tasks
 *     responses:
 *       200:
 *         description: OK
 */

/**
 * READ all tasks
 * GET /api/tasks?assignedProject=<id>&status=<status>&assignee=<userId>&createdBy=<userId>
 */
router.get('/', async (req, res) => {
  try {
    const { status, assignedProject, assignee, createdBy, manager, parentTask, includeSubtasks } = req.query; // ← Add 'manager'
    const filter = {};

    if (status) filter.status = status;
    if (assignedProject) filter.assignedProject = new mongoose.Types.ObjectId(assignedProject);
    if (createdBy) filter.createdBy = new mongoose.Types.ObjectId(createdBy);
    if (assignee) filter.assignedTeamMembers = new mongoose.Types.ObjectId(assignee);

    // ✅ NEW: Filter tasks by manager (via their projects)
    if (manager) {
      const Project = mongoose.model('Project');
      const managerProjects = await Project.find({ createdBy: manager }).select('_id');
      const projectIds = managerProjects.map(p => p._id);
      filter.assignedProject = { $in: projectIds };
    }

    if (parentTask) {
      filter.parentTask = parentTask === 'null' ? null : new mongoose.Types.ObjectId(parentTask);
    } else if (includeSubtasks !== 'true') {
      filter.parentTask = null; // default to root tasks only
    }

    const tasks = await populateTask(
      Task.find(filter).sort({ deadline: 1, createdAt: -1 })
    ).lean();

    res.json(tasks);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** READ one task */
router.get('/:id', async (req, res) => {
  try {
    const task = await populateTask(Task.findById(req.params.id)).lean();

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
      reminderOffsets,
      recurrence,
      parentTask, 
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
    if (parentTask !== undefined && parentTask !== null) {
      if (!mongoose.Types.ObjectId.isValid(parentTask)) {
        return res.status(400).json({ error: 'Invalid parentTask ID' });
      }
      const p = await Task.findById(parentTask);
      if (!p) return res.status(404).json({ error: 'Parent task not found' });
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
    if (priority !== undefined) {
      const coerced = coercePriority(priority);
      if (coerced === undefined) {
        return res.status(400).json({ error: 'Invalid priority; must be an integer 1–10.' });
      }
      updateData.priority = coerced;
    }
    if (createdBy !== undefined) updateData.createdBy = createdBy;
    if (parentTask !== undefined) updateData.parentTask = parentTask || null;
    if (deadline !== undefined) updateData.deadline = deadline ? new Date(deadline) : null;
    if (allDay !== undefined) updateData.allDay = (allDay === true || allDay === 'true');
    if (startAt !== undefined) updateData.startAt = startAt ? new Date(startAt) : null;
    if (endAt !== undefined) updateData.endAt = endAt ? new Date(endAt) : null;

    // === INSERT THIS BLOCK HERE (right after updateData is computed) ===
    const prevStatus = existing.status;
    const nextStatus = (status !== undefined) ? status : prevStatus;

    // maintain completedAt automatically
    if (prevStatus !== 'Done' && nextStatus === 'Done') {
      updateData.completedAt = new Date();
    }
    if (prevStatus === 'Done' && nextStatus !== 'Done') {
      updateData.completedAt = null;
    }
    // === END INSERT ===

    // Determine what the deadline will be AFTER this update
    const nextDeadline = (deadline !== undefined)
      ? (deadline ? new Date(deadline) : null)
      : existing.deadline;

    // Reminders logic
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

    // Recurrence (allow update/clear)
    if (recurrence !== undefined) {
      const rec = coerceRecurrence(recurrence);
      if (rec && !(updateData.deadline ?? existing.deadline)) {
        return res.status(400).json({ error: 'A deadline is required when recurrence is enabled.' });
      }
      updateData.recurrence = rec ?? null;
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

    const populatedTask = await populateTask(Task.findById(task._id));

    const io = req.app.get('io');
    io?.emit?.('calendar:task:updated', { task: populatedTask });

    try {
      const hadDoneTransition = (prevStatus !== 'Done' && nextStatus === 'Done');
      const recurrenceToUse = (task.recurrence || existing.recurrence);
      const currentDeadline = (task.deadline || existing.deadline);
      if (hadDoneTransition && recurrenceToUse && currentDeadline) {
        const nextDl = computeNextDeadline(currentDeadline, recurrenceToUse);
        if (nextDl) {
          const clone = await Task.create({
            title: task.title,
            description: task.description,
            notes: task.notes,
            parentTask: task.parentTask || null, 
            assignedProject: task.assignedProject,
            assignedTeamMembers: task.assignedTeamMembers,
            status: 'To Do',
            priority: task.priority,
            deadline: nextDl,
            createdBy: task.createdBy,
            allDay: task.allDay,
            startAt: task.startAt ? new Date(task.startAt) : new Date(),
            endAt: task.endAt
              ? new Date(task.endAt)
              : new Date(nextDl.getTime()), 
            reminderOffsets: (Array.isArray(task.reminderOffsets) && task.reminderOffsets.length)
              ? task.reminderOffsets
              : DEFAULT_REMINDERS_MIN,
            recurrence: recurrenceToUse,
          });

          const clonePopulated = await populateTask(Task.findById(clone._id));
          const io = req.app.get('io');
          io?.emit?.('calendar:task:created', { task: clonePopulated });
        }
      }
    } catch (spawnErr) {
      console.error('[recurrence] spawn-next failed:', spawnErr);
    }


    const updateNotifs = await createUpdateNotifications({
      taskId: String(task._id),
      authorId: String(
          (req.user && req.user._id) ??
          req.body.updatedBy ??
          req.body.createdBy ??
          existing.createdBy
          )
    })

    // const io = req.app.get('io');
    for (const n of [...updateNotifs]) {
      io?.emit?.(`notification:${n.userId}`, n);
    }
    io?.emit?.('task:updated', { taskId: String(task._id) });

    if (updateNotifs.length) await sendPendingEmails();

    res.json(populatedTask);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/** LIST subtasks of a task */
router.get('/:id/subtasks', async (req, res) => {
  try {
    const children = await Task.find({ parentTask: req.params.id })
      .sort({ deadline: 1, createdAt: 1 })
      .populate('assignedTeamMembers', 'name email')
      .populate('createdBy', 'name email')
      .populate('assignedProject', 'name')
      .lean();
    res.json(children);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** CREATE subtasks */
router.post('/:id/subtasks', upload.array('attachments'), async (req, res) => {
  req.body.parentTask = req.params.id;
  return router.handle({ ...req, method: 'POST', url: '/' }, res);
});


/** DELETE task (cascade subtasks)*/
router.delete('/:id', async (req, res) => {
  try {
    await Task.deleteMany({ parentTask: req.params.id });
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