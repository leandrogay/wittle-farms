const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

// Get all tasks
export async function getTasks() {
  const res = await fetch(`${API_BASE}/api/tasks`);
  if (!res.ok) {
    throw new Error("Failed to fetch tasks");
  }
  return res.json();
}