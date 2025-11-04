/**
 * @openapi
 * components:
 *   schemas:
 *     MentionableUser:
 *       type: object
 *       description: User that can be @mentioned (shape only; not a DB model)
 *       properties:
 *         _id:   { type: string }
 *         name:  { type: string }
 *         email: { type: string, format: email }
 *         handle:{ type: string, description: "lowercased local-part or derived handle" }
 */

import { Router } from "express";
import mongoose, { isValidObjectId } from "mongoose";
import Comment from "../models/Comment.js";
import Task from "../models/Task.js";
import { createCommentNotifications, createMentionNotifications } from "../services/notification-service.js";
import { resolveMentionUserIds } from "../services/resolve-mention.js";

const router = Router();
const toLocal = (s = "") => String(s).split("@")[0]?.toLowerCase() || "";
const escapeRx = (s = "") => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * @openapi
 * /api/tasks/{taskId}/mentionable-users:
 *   get:
 *     tags: [Comments]
 *     summary: List users who can be @mentioned on a task
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema: { type: string }
 *         description: Task ID (Mongo ObjectId)
 *       - in: query
 *         name: q
 *         required: false
 *         schema: { type: string }
 *         description: Optional search prefix for handle or substring of name
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/MentionableUser'
 *       400:
 *         description: Invalid task id
 *       404:
 *         description: Task not found
 *       500:
 *         description: Failed to load users
 */
router.get("/:taskId/mentionable-users", async (req, res) => {
  try {
    const { taskId } = req.params;
    if (!isValidObjectId(taskId)) return res.status(400).json({ error: "Invalid task id" });

    let task = await Task.findById(taskId)
      .select("createdBy assignedTeamMembers")
      .populate("createdBy", "name email")
      .populate("assignedTeamMembers", "name email")
      .lean();

    if (!task) return res.status(404).json({ error: "Task not found" });

    const people = [];
    const pushUser = (u) => {
      if (!u) return;
      const _id = String(u._id || "");
      const name = u.name || "";
      const email = u.email || "";
      const handle = toLocal(email) || name.toLowerCase();
      if (!handle) return;
      people.push({ _id, name: name || handle, email, handle });
    };

    if (task.createdBy && typeof task.createdBy === "object") pushUser(task.createdBy);
    (task.assignedTeamMembers || []).forEach(pushUser);

    const needLookup = [];
    if (task.createdBy && typeof task.createdBy === "string") needLookup.push(task.createdBy);
    (task.assignedTeamMembers || []).forEach((m) => {
      if (typeof m === "string") needLookup.push(m);
    });
    if (needLookup.length) {
      const users = await User.find({ _id: { $in: needLookup } })
        .select("name email")
        .lean();
      users.forEach(pushUser);
    }

    const map = new Map();
    for (const u of people) {
      const key = u._id || u.handle;
      if (!map.has(key)) map.set(key, u);
    }
    let list = Array.from(map.values());

    const q = String(req.query.q || "").toLowerCase();
    if (q) {
      const rx = new RegExp("^" + escapeRx(q));
      list = list.filter((u) => rx.test(u.handle) || (u.name || "").toLowerCase().includes(q));
    }

    res.json(list);
  } catch (err) {
    console.error("mentionable-users error:", err);
    res.status(500).json({ error: "Failed to load users" });
  }
});

/**
 * @openapi
 * /api/tasks/{taskId}/comments:
 *   get:
 *     tags: [Comments]
 *     summary: List comments for a task (newest first, cursor-paginated)
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: cursor
 *         required: false
 *         schema: { type: string, format: date-time }
 *         description: Return comments created before this ISO timestamp
 *       - in: query
 *         name: limit
 *         required: false
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Comment'
 *                 nextCursor:
 *                   type: string
 *                   nullable: true
 *                   format: date-time
 *       400:
 *         description: Invalid task id
 *       500:
 *         description: Server error
 */
router.get("/:taskId/comments", async (req, res) => {
  try {
    const { taskId } = req.params;
    const { cursor, limit = 20 } = req.query;
    if (!mongoose.Types.ObjectId.isValid(taskId)) return res.status(400).json({ error: "Invalid task id" });

    const filter = { task: taskId };
    if (cursor) filter.createdAt = { $lt: new Date(cursor) };

    const items = await Comment.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit) || 20, 100))
      .populate("author", "name email")
      .lean();

    res.json({ items, nextCursor: items.length ? items[items.length - 1].createdAt : null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * @openapi
 * /api/tasks/{taskId}/comments:
 *   post:
 *     tags: [Comments]
 *     summary: Create a comment on a task
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NewCommentRequest'
 *     responses:
 *       201:
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Comment'
 *       400:
 *         description: Validation error (invalid ids, missing body, etc.)
 */
router.post('/:taskId/comments', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { author, body, clientKey } = req.body;
    const mentions = await resolveMentionUserIds(taskId, body);
    const mentionsArr = Array.isArray(mentions)
      ? mentions
      : mentions
        ? [mentions]
        : [];

    const mentionIds = mentionsArr.map((id) => String(id));

    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({ error: 'Invalid taskId' });
    }
    if (!author || !mongoose.Types.ObjectId.isValid(author)) {
      return res.status(400).json({ error: 'Invalid author' });
    }
    if (!body || !body.trim()) {
      return res.status(400).json({ error: 'Comment body is required' });
    }

    const comment = await Comment.create({
      task: taskId,
      author,
      body: body.trim(),
      mentions: mentionIds,
      clientKey: clientKey || undefined,
    });


    const populated = await Comment.findById(comment._id)
      .populate('author', 'name email')
      .populate("mentions", "name email")
      .lean();

    const mentionSet = [...new Set([String(author), ...mentionIds])];

    const createdNotifs = await createCommentNotifications({
      taskId,
      commentId: populated._id,
      authorId: author,
      commentBody: body,
      excludeUserIds: mentionSet
    });

    const mentionNotifs = await createMentionNotifications({
      taskId,
      commentId: populated._id,
      authorId: author,
      commentBody: populated.body
    })

    const io = req.app.get('io');
    for (const n of [...createdNotifs, ...mentionNotifs]) {
      io?.emit?.(`notification:${n.userId}`, n);
    }
    io?.emit?.('task:comment:created', { taskId, comment: populated });

    res.status(201).json(populated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * @openapi
 * /api/tasks/{taskId}/comments/{commentId}:
 *   put:
 *     tags: [Comments]
 *     summary: Update an existing comment
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateCommentRequest'
 *     responses:
 *       200:
 *         description: Updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Comment'
 *       400:
 *         description: Invalid ids or missing body
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not allowed to edit this comment
 *       404:
 *         description: Comment not found
 *       500:
 *         description: Server error
 */
router.put('/:taskId/comments/:commentId', async (req, res) => {
  try {
    const { taskId, commentId } = req.params;
    const { body, author } = req.body;

    if (!isValidObjectId(taskId) || !isValidObjectId(commentId)) {
      return res.status(400).json({ error: 'Invalid task or comment id' });
    }
    if (!body || !body.trim()) {
      return res.status(400).json({ error: 'Comment body is required' });
    }

      const userId = req.user?._id || author;
      if (!userId || !isValidObjectId(userId)) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const existing = await Comment.findOne({ _id: commentId, task: taskId });
    if (!existing) return res.status(404).json({ error: 'Comment not found' });
      if (String(existing.author) !== String(userId)) {
        return res.status(403).json({ error: 'Not allowed to edit this comment' });
      }

    existing.body = body.trim();
    existing.mentions = await resolveMentionUserIds(taskId, body);
    existing.editedAt = new Date();
    await existing.save();

    await Comment.updateOne(
      { _id: commentId },
      { $set: { body, editedAt: new Date() } }
    );

    const updated = await Comment.findById(commentId)
      .populate('author', 'name email')
      .populate("mentions", "name email")
      .lean();

    await createMentionNotifications({
      taskId,
      commentId: updated._id,
      authorId: author,
      commentBody: updated.body
    })

    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * @openapi
 * /api/tasks/{taskId}/comments/{commentId}:
 *   delete:
 *     tags: [Comments]
 *     summary: Delete a comment
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Comment deleted" }
 *       400:
 *         description: Invalid ids
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not allowed to delete this comment
 *       404:
 *         description: Comment not found
 */
router.delete('/:taskId/comments/:commentId', async (req, res) => {
  try {
    const { taskId, commentId } = req.params;
    const { author } = req.body;

    if (!isValidObjectId(taskId) || !isValidObjectId(commentId)) {
      return res.status(400).json({ error: 'Invalid task or comment id' });
    }

    const userId = req.user?._id || author;
    if (!userId || !isValidObjectId(userId)) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

    const comment = await Comment.findOne({ _id: commentId, task: taskId });
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    if (String(comment.author) !== String(userId)) {
      return res.status(403).json({ error: 'Not allowed to delete this comment' });
    }

    await comment.deleteOne();

    const io = req.app.get('io');
    io?.emit?.('task:comment:deleted', { taskId, commentId });

    res.json({ message: 'Comment deleted' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
