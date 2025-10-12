// backend/routes/notifications.js
import express from "express";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import User from "../models/User.js";
import { sendEmail } from "../utils/mailer.js";

const router = express.Router();

/**
 * POST /api/notifications/overdue?project=:projectId
 * Sends one consolidated email to the project manager (project.createdBy)
 * listing all overdue tasks + team members + subtasks.
 */
router.post("/overdue", async (req, res) => {
  const { project: projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: "Missing ?project=" });

  // Fetch project and manager info
  const project = await Project.findById(projectId).lean();
  if (!project) return res.status(404).json({ error: "Project not found" });

  const manager = await User.findById(project.createdBy).lean();
  if (!manager?.email) {
    return res.status(400).json({ error: "Project manager email not found" });
  }

  const now = new Date();

  // Find overdue tasks
  const overdueTasks = await Task.find({
    assignedProject: projectId,
    status: { $ne: "Done" },
    deadline: { $lt: now },
  })
    .populate("assignedTeamMembers", "name email")
    .lean();

  // Overdue subtasks (if applicable)
  const overdueBySubtasks = await Task.find({
    assignedProject: projectId,
    "subtasks.deadline": { $lt: now },
    "subtasks.status": { $ne: "Done" },
  })
    .populate("assignedTeamMembers", "name email")
    .lean();

  // Merge + dedupe
  const map = new Map();
  for (const t of [...overdueTasks, ...overdueBySubtasks]) map.set(String(t._id), t);
  const overdue = Array.from(map.values());

  if (overdue.length === 0) {
    return res.json({ success: false, message: "No overdue items" });
  }

  const daysLate = (d) => Math.max(0, Math.ceil((now - new Date(d)) / 86400000));

  // Build HTML list
  const tasksHTML = overdue
    .map((t) => {
      const days = t.deadline ? daysLate(t.deadline) : null;

      // List all team members
      const members =
        t.assignedTeamMembers?.length > 0
          ? t.assignedTeamMembers.map((m) => `${m.name || m.email}`).join(", ")
          : "Unassigned";

      // Include subtasks (if any)
      const subHTML = Array.isArray(t.subtasks)
        ? t.subtasks
            .filter((s) => s?.deadline && s?.status !== "Done" && new Date(s.deadline) < now)
            .map(
              (s) =>
                `<li style="margin-top:4px;">
                  <strong>${s.title}</strong> — ${daysLate(s.deadline)} day(s) overdue
                </li>`
            )
            .join("")
        : "";

      return `
        <li style="margin-bottom:12px;">
          <strong>${t.title}</strong> — <em>${days} day(s) overdue</em><br/>
          <strong>Team Members:</strong> ${members}
          ${
            subHTML
              ? `<ul style="margin-top:6px; margin-left:16px;">${subHTML}</ul>`
              : ""
          }
        </li>
      `;
    })
    .join("");

  const subject = `[Taskboard] ${overdue.length} overdue item(s) — ${project.name ?? "Untitled Project"}`;
  const html = `
    <p>Hi ${manager.name || "Manager"},</p>
    <p>The following task(s) in <strong>${project.name || "Untitled Project"}</strong> are overdue:</p>
    <ul>${tasksHTML}</ul>
    <p>Please follow up with your team accordingly.</p>
    <p style="color:#888;">This is an automated message.</p>
  `;

  await sendEmail({ to: manager.email, subject, html });
  return res.json({ success: true, count: overdue.length });
});

export default router;
