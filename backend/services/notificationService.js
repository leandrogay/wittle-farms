import Task from '../models/Task.js';
import Notification from '../models/Notification.js';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import { sendEmail } from '../utils/mailer.js';

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
  .populate('assignedTeamMembers', 'name email')
  .lean();

  const notifications = [];

  for (const task of tasks) {
    if (!task.deadline || !task.reminderOffsets || !task.assignedTeamMembers?.length) continue;

    const deadline = dayjs(task.deadline);
    
    for (const offset of task.reminderOffsets) {
      const reminderTime = deadline.subtract(offset, 'minute');
      
      if (Math.abs(now.diff(reminderTime, 'minute')) <= 1) {
        for (const member of task.assignedTeamMembers) {
          const existingNotification = await Notification.findOne({
            userId: member._id,
            taskId: task._id,
            type: 'reminder',
            scheduledFor: new Date(reminderTime)
          });

            if (!existingNotification) {
              const notification = {
                userId: member._id,
                taskId: task._id,
                type: 'reminder',
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

    if (
      deadline.isBefore(now, 'minute') && 
      deadline.isAfter(now.subtract(1, 'minute'), 'minute')
    ) {
      for (const member of task.assignedTeamMembers) {
        const existingNotification = await Notification.findOne({
          userId: member._id,
          taskId: task._id,
          type: 'overdue',
          scheduledFor: new Date(deadline)
        });

        if (!existingNotification) {
          const notification = {
            userId: member._id,
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
    scheduledFor: { $lte: now },
  })
    .populate('userId', 'name email')
    .populate('taskId', 'title deadline')
    .lean();

  if (!due.length) return [];

  const sentIds = [];

  for (const n of due) {
    const to = n.userId?.email;
    if (!to) continue;

    const subject =
      n.type === 'overdue'
        ? `Overdue: ${n.taskId?.title ?? 'Task'}`
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
      { $set: { sent: true, sentAt: new Date() } }
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

/** Build a simple HTML email */
function buildEmailHtml({ notification }) {
  const taskTitle = notification.taskId?.title ?? 'Task';
  const deadline = notification.taskId?.deadline
    ? dayjs(notification.taskId.deadline).format('ddd, DD MMM YYYY HH:mm')
    : 'N/A';
  const heading = notification.type === 'overdue' ? 'Task Overdue' : 'Task Reminder';

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
