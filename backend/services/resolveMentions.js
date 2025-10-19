import Task from "../models/Task.js";
import User from "../models/User.js";
import { extractHandles, localPart } from "../utils/mentions.js";

export async function resolveMentionUserIds(taskId, text) {
  const handles = extractHandles(text);
  if (!handles.length) return [];

  const task = await Task.findById(taskId)
    .select("createdBy assignedTeamMembers")
    .lean();
  if (!task) return [];

  const memberIds = [
    task.createdBy,
    ...(task.assignedTeamMembers || []),
  ].filter(Boolean);

  if (!memberIds.length) return [];

  const members = await User.find({ _id: { $in: memberIds } })
    .select("_id email name")
    .lean();

  const set = new Set();
  for (const u of members) {
    const handle = localPart(u.email);
    if (handle && handles.includes(handle)) set.add(String(u._id));
  }
  return [...set];
}
