const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

// Get all tasks
export async function getTasks() {
  const res = await fetch(`${API_BASE}/api/tasks`);
  if (!res.ok) {
    throw new Error("Failed to fetch tasks");
  }
  return res.json();
}

// (Manager's Side) Get all projects and taskings
export async function getManagerProjects() {
  const res = await fetch(`${API_BASE}/api/projects`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
}

export async function getProjectTasks(projectId) {
  const url = `${API_BASE}/api/tasks?project=${encodeURIComponent(projectId)}`;
  console.log("GET", url);
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch tasks");
  return res.json();
}
