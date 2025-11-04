import Task from '../models/Task.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import Project from '../models/Project.js';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import { sendEmail } from '../utils/mailer.js';
import Comment from '../models/Comment.js';

dayjs.extend(relativeTime);

/**
 * Check for tasks that need reminders and create notifications
 * This will be called by the cron job
 */
export async function checkAndCreateReminders() {
  const now = dayjs();

  const tasks = await Task.find({
    status: { $ne: 'Done' },
    deadline: { $exists: true, $ne: null }
  })
    .lean();

  const notifications = [];

  for (const task of tasks) {
    if (!task.deadline || !task.reminderOffsets || !task.assignedTeamMembers?.length) continue;

    const deadline = dayjs(task.deadline);

    for (const offset of task.reminderOffsets) {
      const reminderTime = deadline.subtract(offset, 'minute');

      // Check if reminder time has passed (is in the past or now) 
      // Allow up to 10 minutes grace period to catch missed reminders
      if (now.isAfter(reminderTime) && now.diff(reminderTime, 'minute') <= 10) {
        for (const memberId of task.assignedTeamMembers) {
          const existingNotification = await Notification.findOne({
            userId: memberId,
            taskId: task._id,
            type: 'reminder',
            reminderOffset: offset // Use offset to identify unique reminders
          });

          if (!existingNotification) {
            const notification = {
              userId: memberId,
              taskId: task._id,
              type: 'reminder',
              reminderOffset: offset, // Add offset to track which reminder this is
              message: `Task "${task.title}" is due in ${formatTimeRemaining(offset)}`,
              scheduledFor: new Date(reminderTime),
              read: false,
              sent: false
            };

            notifications.push(notification);
          }
        }
      }
    }

    // Check if task is overdue (deadline has passed)
    if (deadline.isBefore(now)) {
      for (const memberId of task.assignedTeamMembers) {
        // Check if we already have an overdue notification for this user+task
        const existingNotification = await Notification.findOne({
          userId: memberId,
          taskId: task._id,
          type: 'overdue'
        });

        // Only create if no overdue notification exists yet
        if (!existingNotification) {
          const notification = {
            userId: memberId,
            taskId: task._id,
            type: 'overdue',
            message: `Task "${task.title}" is now overdue!`,
            scheduledFor: new Date(deadline),
            read: false,
            sent: false
          };

          notifications.push(notification);
        }
      }
    }
  }

  if (notifications.length > 0) {
    await Notification.insertMany(notifications);
  }

  return notifications;
}

/**
 * Get all unread notifications for a user
 */
export async function getUnreadNotifications(userId) {
  return await Notification.find({
    userId,
    read: false
  })
    .populate('taskId', 'title deadline')
    .sort('-scheduledFor')
    .lean();
}

/**
 * Mark notifications as read
 */
export async function markNotificationsAsRead(notificationIds) {
  await Notification.updateMany(
    { _id: { $in: notificationIds } },
    { $set: { read: true } }
  );
}

/**
 * Mark notifications as sent (used for socket-only flows).
 * If you're using sendPendingEmails(), that function will mark sent + sentAt after emailing.
 */
export async function markNotificationsAsSent(notificationIds) {
  await Notification.updateMany(
    { _id: { $in: notificationIds } },
    { $set: { sent: true } }
  );
}

/**
 * Send emails for all due notifications (reminder + overdue) that haven't been sent yet.
 * Marks them { sent: true, sentAt: new Date() } after a successful email.
 */
export async function sendPendingEmails() {
  const now = new Date();

  // Find due & unsent notifications
  const due = await Notification.find({
    sent: false,
    read: false,
    type: { $in: ['reminder', 'overdue', 'update'] },
    scheduledFor: { $lte: now },
  })
    .populate('userId', 'name email')
    .populate('taskId', 'title deadline status')
    .lean();

  if (!due.length) return [];

  const sentIds = [];

  for (const n of due) {
    const to = n.userId?.email;
    if (!to) continue;
    if (n.taskId?.status === 'Done') continue;

    const subject =
      n.type === 'overdue'
        ? `Overdue: ${n.taskId?.title ?? 'Task'}`
        // : `Reminder: ${n.taskId?.title ?? 'Task'} due soon`;
      :n.type === 'update'
        ? `Update: ${n.taskId?.title ?? 'Task'}`
        : `Reminder: ${n.taskId?.title ?? 'Task'} due soon`;

    const html = buildEmailHtml({ notification: n });

    try {
      await sendEmail({ to, subject, html });
      sentIds.push(n._id);
    } catch (err) {
      console.error('[mailer] send failed for notification', n._id, err?.message || err);
    }
  }

  if (sentIds.length) {
    await Notification.updateMany(
      { _id: { $in: sentIds } },
      { $set: { sent: true } }
    );
  }

  return sentIds;
}

/**
 * Format time remaining in a human-readable format
 */
function formatTimeRemaining(minutes) {
  if (minutes >= 1440) { // 1 day or more
    const days = Math.floor(minutes / 1440);
    return `${days} ${days === 1 ? 'day' : 'days'}`;
  } else if (minutes >= 60) { // 1 hour or more
    const hours = Math.floor(minutes / 60);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  } else {
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }
}

export async function createCommentNotifications({ taskId, commentId, authorId, commentBody, excludeUserIds = [] }) {
  // Fetch task for assignees, project & title
  const task = await Task.findById(taskId)
    .select('assignedTeamMembers title assignedProject')
    .lean();
  if (!task) return [];

  // Get author name (for message)
  const author = await User.findById(authorId).select('name').lean();
  const authorName = author?.name ?? 'Someone';

  // Recipients: only staff assigned to the task, excluding the author
  // --- Staff assignees: notify, excluding author
  const assigneeIds = (task.assignedTeamMembers || [])
    .map(String)
    .filter((uid) => uid !== String(authorId));

  // --- Project managers: notify, excluding author
  let managerIds = [];
  if (task.assignedProject) {
    // NOTE: adjust these field names to match your Project schema.
    // We try several common possibilities and merge what exists.
    const proj = await Project.findById(task.assignedProject)
      .select('managers manager owners owner lead projectManagers createdBy')
      .lean();
    if (proj) {
      const possibles = [
        ...(proj.managers || []),
        ...(proj.projectManagers || []),
        ...(proj.owners || []),
        proj.manager,
        proj.owner,
        proj.lead,
        proj.createdBy,
      ].filter(Boolean);
      managerIds = possibles.map(String).filter((uid) => uid !== String(authorId));
    }
  }
  const excludeList = Array.isArray(excludeUserIds)
    ? excludeUserIds
    : excludeUserIds
      ? Array.from(excludeUserIds) // handles Set
      : [];
  const exclude = new Set([String(authorId), ...excludeList.map(String)]);

  // Final recipients: assignees ∪ managers, then apply exclusion
  const uniq = new Set([...assigneeIds, ...managerIds]);
  const recipients = Array.from(uniq).map(String);
  const finalRecipients = recipients.filter(uid => !exclude.has(uid));
  if (finalRecipients.length === 0) return [];

  const message = `${authorName} commented on "${task.title}": ${commentBody.slice(0, 140)}`;

  const docs = recipients.map(userId => ({
    userId,
    taskId,
    type: 'comment',
    commentId,
    message,
    scheduledFor: new Date(), // immediate
  }));

  const created = await Notification.insertMany(docs, { ordered: false });
  return created;
}

/** Build a simple HTML email */
function buildEmailHtml({ notification }) {
  const taskTitle = notification.taskId?.title ?? 'Task';
  const deadline = notification.taskId?.deadline
    ? dayjs(notification.taskId.deadline).format('ddd, DD MMM YYYY HH:mm')
    : 'N/A';
   const heading =
   notification.type === 'overdue'
     ? 'Task Overdue'
     : notification.type === 'update'
       ? 'Task Updated'
       : 'Task Reminder';

  return `
    <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;">
      <h2>${heading}</h2>
      <p><strong>${taskTitle}</strong></p>
      <p>${notification.message || ''}</p>
      <p><strong>Deadline:</strong> ${deadline}</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0" />
      <p style="font-size:12px;color:#6b7280">You are receiving this because you are assigned to this task.</p>
    </div>
  `;
}

export async function createMentionNotifications({ taskId, commentId, authorId, commentBody }) {
  const [comment, task, author] = await Promise.all([
    Comment.findById(commentId)
      .select("mentions")
      .lean(),
    Task.findById(taskId)
      .select('title')
      .lean(),
    User.findById(authorId)
      .select('name')
      .lean()
  ]);
  if (!comment || !task) return [];

  const authorName = author?.name ?? 'Someone';

  const mentionIds = (comment.mentions || [])
    .map((id) => String(id))
    .filter((id) => (id) !== String(authorId));

  if (mentionIds.length == 0) return [];

  const recipients = [...new Set(mentionIds.filter(id => id !== String(authorId)))];
  if (recipients.length === 0) return [];

  const message = `${authorName} mentioned you on "${task.title}": ${commentBody.slice(0, 140)}`;

  const docs = recipients.map(userId => ({
    userId,
    taskId,
    type: 'mention',
    commentId,
    message,
    scheduledFor: new Date()
  }));

  const created = await Notification.insertMany(docs, { ordered: false });
  return created;

}


export async function createUpdateNotifications({ taskId, authorId }) {
  const [task, author] = await Promise.all([
    Task.findById(taskId)
      .select('assignedTeamMembers title')
      .lean(),
    User.findById(authorId)
      .select('name')
      .lean()
  ]);

  if (!task) return [];

  const authorName = author?.name ?? 'Someone';

  const assigneeIds = (task.assignedTeamMembers || []).map(String);
  const recipients = [...new Set(assigneeIds.filter(uid => uid !== String(authorId)))];
  if (!recipients.length) return [];

  const message = `${authorName} updated "${task.title}".`;

  const docs = recipients.map(userId => ({
    userId,
    taskId,
    type: 'update',
    message,
    scheduledFor: new Date(), 
    read: false,
    sent: false
  }));

  const created = await Notification.insertMany(docs, { ordered: false });
  return created;
}

