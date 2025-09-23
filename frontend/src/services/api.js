const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

const TOKEN_KEY = "auth_token";

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
}
function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}
function authHeaders() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function getSession() {
  const res = await fetch(`${API_BASE}/api/auth/session`, {
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error("Not authenticated");
  return res.json();
}

export async function getMe() {
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    headers: { ...authHeaders() },
  });
  if (!res.ok) throw new Error("Not authenticated");
  return res.json();
}

export async function getTasks() {
  const res = await fetch(`${API_BASE}/api/tasks`);
  if (!res.ok) {
    throw new Error("Failed to fetch tasks");
  }
  return res.json();
}

export async function getProjectNamesByUserId(userId) {
  const res = await fetch(`${API_BASE}/api/projects/user/${userId}`);
  if (!res.ok) {
    throw new Error("Failed to fetch projects");
  }
  const projects = await res.json();
  return projects.map(p => p.name);
}

export async function getManagerProjects() {
  const res = await fetch(`${API_BASE}/api/projects`, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text().catch(() => "Failed to fetch projects"));
  const projects = await res.json();
  return Array.isArray(projects)
    ? projects.map(p => ({ ...p, name: p?.name ?? "Untitled Project" }))
    : [];
}

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

async function jsonOrText(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export async function registerUser(payload) {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await jsonOrText(res);

  if (!res.ok) throw new Error(data.message || "Registration failed");
  return data;
}


export async function loginUser(email, password) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const data = await jsonOrText(res);

  if (!res.ok) throw new Error(data.message || "Login failed");
  return data;
}

export async function verifyOtp(email, otp) {
  const res = await fetch(`${API_BASE}/api/auth/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, otp }),
  });

  const data = await jsonOrText(res);

  if (!res.ok) throw new Error(data.message || "OTP verification failed");
  return data;
}

export async function logoutUser() {
  const token = localStorage.getItem("auth_token");
  const res = await fetch(`${API_BASE}/api/auth/logout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
    },
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error(await res.text().catch(() => "Logout failed"));
  }
  return res.json();
}

