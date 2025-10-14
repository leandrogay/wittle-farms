import { Router } from "express";
import mongoose, {isValidObjectId} from "mongoose";
import Comment from "../models/Comment.js";
import Task from "../models/Task.js";

const router = Router();

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

router.post("/:taskId/comments", async (req, res) => {
  try {
    const { taskId } = req.params;
    const { body, mentions, attachments } = req.body;
    // const author = req.user?._id || req.body.author; 
    const author = req.user?._id || req.body.author;
    if (!author) {
    return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!mongoose.Types.ObjectId.isValid(author)) {
    return res.status(400).json({ error: 'Invalid author id' });
    }

    if (!mongoose.Types.ObjectId.isValid(taskId)) return res.status(400).json({ error: "Invalid task id" });
    // if (!author || !mongoose.Types.ObjectId.isValid(author)) return res.status(400).json({ error: "Invalid author id" });
    if (!body || !body.trim()) return res.status(400).json({ error: "Comment body is required" });

    const task = await Task.findById(taskId).lean();
    if (!task) return res.status(404).json({ error: "Task not found" });

    const doc = await Comment.create({
      task: taskId,
      author,
      body: body.trim(),
      mentions: Array.isArray(mentions) ? mentions : [],
      attachments: Array.isArray(attachments) ? attachments : [],
    });

    const populated = await Comment.findById(doc._id).populate("author", "name email").lean();
    const io = req.app.get("io");
    io?.emit?.("task:comment:created", { taskId, comment: populated });

    res.status(201).json(populated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// router.put('/:taskId/comments/:commentId', async (req, res) => {
//   try {
//     const { taskId, commentId } = req.params;
//     const { body, author } = req.body;

//   if (!isValidObjectId(taskId) || !isValidObjectId(commentId)) {
//     return res.status(400).json({ error: 'Invalid task or comment id' });
//   }
//   if (!body || !body.trim()) {
//     return res.status(400).json({ error: 'Comment body is required' });
//   }

//   const userId = req.user?._id;
//   if (!userId || !isValidObjectId(userId) ) return res.status(401).json({ error: 'Not authenticated' });

//     const comment = await Comment.findOne({ _id: commentId, task: taskId });
//     if (!comment) return res.status(404).json({ error: 'Comment not found' });

//   if (String(comment.author) !== String(userId)) {
//     return res.status(403).json({ error: 'Not allowed to edit this comment' });
//   }

//     comment.body = body.trim();
//     comment.editedAt = new Date();
//     await comment.save();

//     const populated = await Comment.findById(comment._id)
//       .populate('author', 'name email')
//       .lean();

//     const io = req.app.get('io');
//     io?.emit?.('task:comment:updated', { taskId, comment: populated });

//     res.json(populated);
//   } catch (e) {
//     res.status(400).json({ error: e.message });
//   }
// });
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

    await Comment.updateOne(
      { _id: commentId },
      { $set: { body, editedAt: new Date() } }
    );

    const updated = await Comment.findById(commentId)
      .populate('author', 'name email')
      .lean();

    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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
