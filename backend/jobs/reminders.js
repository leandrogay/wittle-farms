import cron from "node-cron";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

import Task from "../models/Task.js";
import Notification from "../models/Notification.js";
import { sendEmail } from "../utils/mailer.js";
import { DEFAULT_REMINDERS_MIN } from "../models/Task.js";

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Runs every minute: check for tasks due soon (7d, 3d, 1d)
 * Runs daily at 09:00: check for overdue tasks
 */
export function initReminderJobs() {
  // every minute for normal reminders
  cron.schedule("* * * * *", async () => {
    await sendUpcomingTaskReminders();
  });

  // every day at 09:00 (Singapore time) for overdue notifications
  cron.schedule("0 9 * * *", async () => {
    await sendDailyOverdueReminders();
  });
}

/**
 * Send reminders for tasks approaching deadlines.
 * Uses reminderOffsets from Task or default (7d, 3d, 1d).
 */
async function sendUpcomingTaskReminders() {
  const now = dayjs();
  const tasks = await Task.find({
    status: { $ne: "Done" },
    deadline: { $exists: true, $ne: null },
  })
    .populate("assignedTeamMembers", "name email")
    .lean();

  for (const task of tasks) {
    const offsets = Array.isArray(task.reminderOffsets) && task.reminderOffsets.length
      ? task.reminderOffsets
      : DEFAULT_REMINDERS_MIN;

    const deadline = dayjs(task.deadline);
    for (const offset of offsets) {
      const reminderTime = deadline.subtract(offset, "minute");

      // Send within ±1 minute of reminder time
      if (Math.abs(now.diff(reminderTime, "minute")) <= 1) {
        for (const member of task.assignedTeamMembers || []) {
          // Check if we've already sent a reminder for this specific task/user/offset combination
          const exists = await Notification.findOne({
            userId: member._id,
            taskId: task._id,
            type: "reminder",
            reminderOffset: offset, // Check by exact offset to prevent duplicates
          });
          if (!exists) {
            const offsetMessage = `Task "${task.title}" is due in ${formatOffset(offset)}.`;
            await sendEmail({
              to: member.email,
              subject: `Reminder: ${task.title} due soon`,
              html: `<p>Hi ${member.name || "there"},</p><p>${offsetMessage}</p><p>Deadline: ${deadline.format("DD MMM YYYY HH:mm")}</p>`,
            });
            await Notification.create({
              userId: member._id,
              taskId: task._id,
              type: "reminder",
              reminderOffset: offset,
              message: offsetMessage,
              scheduledFor: reminderTime.toDate(),
              sent: true,
            });
          }
        }
      }
    }
  }
}

/**
 * Send a daily digest of overdue tasks (9am SG) — modeled after dailyOverdueTaskEmails.js
 */
async function sendDailyOverdueReminders() {
  const now = dayjs();
  const overdueTasks = await Task.find({
    deadline: { $lt: now.toDate() },
    status: { $ne: "Done" },
  })
    .populate("assignedTeamMembers", "name email")
    .lean();

  for (const task of overdueTasks) {
    for (const member of task.assignedTeamMembers || []) {
      const exists = await Notification.findOne({
        userId: member._id,
        taskId: task._id,
        type: "overdue",
        scheduledFor: {
          $gte: now.startOf("day").toDate(),
          $lt: now.endOf("day").toDate(),
        },
      });
      if (!exists) {
        const subject = `Overdue: ${task.title}`;
        const html = `
          <p>Hi ${member.name || "there"},</p>
          <p>The following task is <strong>overdue</strong>:</p>
          <p><strong>${task.title}</strong><br/>Deadline: ${dayjs(task.deadline).format("DD MMM YYYY HH:mm")}</p>
          <p>Please complete it as soon as possible.</p>
        `;
        await sendEmail({ to: member.email, subject, html });
        await Notification.create({
          userId: member._id,
          taskId: task._id,
          type: "overdue",
          message: `Task "${task.title}" is overdue.`,
          scheduledFor: now.toDate(),
          sent: true,
        });
      }
    }
  }
}

function formatOffset(minutes) {
  if (minutes >= 1440) {
    const d = Math.floor(minutes / 1440);
    return `${d} day${d > 1 ? "s" : ""}`;
  } else if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    return `${h} hour${h > 1 ? "s" : ""}`;
  }
  return `${minutes} minute${minutes > 1 ? "s" : ""}`;
}
