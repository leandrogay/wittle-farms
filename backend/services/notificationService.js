import Task from '../models/Task.js';
import Notification from '../models/Notification.js';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime.js';

// Configure dayjs with plugins
dayjs.extend(relativeTime);

/**
 * Check for tasks that need reminders and create notifications
 * This will be called by the cron job
 */
export async function checkAndCreateReminders() {
  const now = dayjs();
  
  // Find all non-completed tasks with deadlines
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
    
    // For each reminder offset
    for (const offset of task.reminderOffsets) {
      const reminderTime = deadline.subtract(offset, 'minute');
      
      // If it's time for this reminder (within the last minute)
      if (Math.abs(now.diff(reminderTime, 'minute')) <= 1) {
        // Create a notification for each team member
        for (const member of task.assignedTeamMembers) {
          // Check if a similar notification already exists
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

    // Check for overdue (only once when it becomes overdue)
    if (deadline.isBefore(now, 'minute') && 
        deadline.isAfter(now.subtract(1, 'minute'), 'minute')) {
      for (const member of task.assignedTeamMembers) {
        // Check if overdue notification already exists
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

  // Bulk create all notifications
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
 * Mark notifications as sent (after successful Socket.IO emission)
 */
export async function markNotificationsAsSent(notificationIds) {
  await Notification.updateMany(
    { _id: { $in: notificationIds } },
    { $set: { sent: true } }
  );
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