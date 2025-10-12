import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import User from "../models/User.js";
import { sendEmail } from "../utils/mailer.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export async function runDailyOverdueDigest() {
  const now = new Date();

  const managers = await User.find({ role: "Manager" }).lean(); 
  for (const mgr of managers) {
    if (!mgr?.email) continue;

    const projects = await Project.find({ createdBy: mgr._id }).lean(); 
    if (!projects.length) continue;

    const projectIds = projects.map(p => p._id);
    const projectById = Object.fromEntries(projects.map(p => [String(p._id), p]));

    const overdueTasks = await Task.find({
      assignedProject: { $in: projectIds },
      status: { $ne: "Done" },
      deadline: { $lt: now },
    })
      .populate("assignedTeamMembers", "name email") 
      .lean();

    if (!overdueTasks.length) continue;

    const byProject = new Map();
    for (const t of overdueTasks) {
      const key = String(t.assignedProject);
      if (!byProject.has(key)) byProject.set(key, []);
      byProject.get(key).push(t);
    }

    const daysOverdue = (d) => Math.max(0, Math.ceil((now - new Date(d)) / 86400000));

    const sections = [];
    for (const [pid, tasks] of byProject.entries()) {
      const project = projectById[pid];
      const projName = project?.name || "Untitled Project";

      const li = tasks.map(t => {
        const members = Array.isArray(t.assignedTeamMembers) && t.assignedTeamMembers.length
          ? t.assignedTeamMembers.map(m => m.name || m.email).join(", ")
          : "Unassigned";
        const dlate = t.deadline ? daysOverdue(t.deadline) : null;

        return `
          <li style="margin:6px 0;">
            <strong>${t.title}</strong>
            — <em>${dlate ?? 0} day(s) overdue</em><br/>
            <span style="color:#555">Team Members: ${members}</span>
          </li>
        `;
      }).join("");

      sections.push(`
        <section style="margin:16px 0;">
          <h3 style="margin:0 0 6px 0;">${projName}</h3>
          <ul style="margin:0 0 0 16px; padding:0;">${li}</ul>
        </section>
      `);
    }

    const totalCount = overdueTasks.length;
    const subject = `[Taskboard] ${totalCount} overdue item(s) — please follow up`;
    const todaySG = dayjs().tz("Asia/Singapore").format("DD MMM YYYY");

    const html = `
      <p>Hi ${mgr.name || "Manager"},</p>
      <p>Here’s your consolidated overdue summary for <strong>${todaySG}</strong>:</p>
      ${sections.join("")}
      <p>Please follow up with your team. This is an automated message.</p>
    `;

    await sendEmail({ to: mgr.email, subject, html });
  }
}
