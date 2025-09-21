const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

// Get all tasks
export async function getTasks() {
  const res = await fetch(`${API_BASE}/api/tasks`);
  if (!res.ok) {
    throw new Error("Failed to fetch tasks");
  }
  return res.json();
}
// Get all projects (show the project titles in picker)
export async function getManagerProjects() {
  const res = await fetch(`${API_BASE}/api/projects`, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text().catch(() => "Failed to fetch projects"));
  const projects = await res.json();
  return Array.isArray(projects)
    ? projects.map(p => ({ ...p, name: p?.name ?? "Untitled Project" }))
    : [];
}

// (Manager) Get tasks for a specific project ID
export async function getProjectTasks(projectId) {
  if (!projectId) return [];

  const url = `${API_BASE}/api/tasks?project=${encodeURIComponent(projectId)}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch tasks");

  const tasks = await res.json();
  const pid = String(projectId);
  return (Array.isArray(tasks) ? tasks : []).filter(t => {
    const ap = t.assignedProject;
    const id = typeof ap === 'string' ? ap : ap?._id;
    return String(id) === pid;
  });
}
