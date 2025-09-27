const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";
const TOKEN_KEY = "auth_token";

/*
*
* Helper functions
*
*/

async function jsonOrText(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function toFormDataIfFiles(obj) {
  if (!obj.attachments || obj.attachments.length === 0) {
    return JSON.stringify(obj); // fallback to JSON
  }

  const fd = new FormData();
  Object.entries(obj).forEach(([key, value]) => {
    if (key === "attachments") {
      Array.from(value).forEach(file => fd.append("attachments", file));
    } else if (Array.isArray(value)) {
      value.forEach(v => fd.append(key, v));
    } else {
      fd.append(key, value);
    }
  });
  return fd;
}


/*
*
* Data CRUD API functions
*
*/

export async function createTask(formData) {
  try {
    const body = toFormDataIfFiles(formData);
    const isFormData = body instanceof FormData;

    const res = await fetch(`${API_BASE}/api/tasks`, {
      method: "POST",
      headers: isFormData ? {} : { "Content-Type": "application/json" },
      body: isFormData ? body : body,
    });

    // const data = await jsonOrText(res);

    if (!res.ok) {
      // console.log("[Create Task Error]", res.status, data);
      throw new Error("Failed to create task");
    }
    return await res.json();

  } catch (err) {
    console.error(err);
    throw err;
  }
}

export async function getTasks() {
  const res = await fetch(`${API_BASE}/api/tasks`);
  if (!res.ok) {
    throw new Error("Failed to fetch tasks");
  }
  return res.json();
}

export async function getProjectsByUserId(userId) {
  const res = await fetch(`${API_BASE}/api/projects/user/${userId}`);
  if (!res.ok) {
    throw new Error("Failed to fetch projects");
  }
  const projects = await res.json();
  return projects.map(p => ({
    _id: p._id,
    name: p.name
  }));
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

export async function getManagerProjects() {
  const res = await fetch(`${API_BASE}/api/projects`, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text().catch(() => "Failed to fetch projects"));
  const projects = await res.json();
  return Array.isArray(projects)
    ? projects.map(p => ({ ...p, name: p?.name ?? "Untitled Project" }))
    : [];
}

export async function getTeamMembersByProjectId(userId) {
  const res = await fetch(`${API_BASE}/api/projects?teamMember=${userId}`);
  if (!res.ok) {
    throw new Error("Failed to fetch projects");
  }
  const projects = await res.json();

  // Flatten all teamMembers
  const allMembers = projects.flatMap(p => p.teamMembers || []);

  // Deduplicate by _id and exclude the current userId
  const uniqueMembers = [];
  const seen = new Set();

  for (const member of allMembers) {
    if (!seen.has(member._id) && member._id !== userId) {
      seen.add(member._id);
      uniqueMembers.push(member);
    }
  }

  return uniqueMembers;
}


/*
*
* Auth APIs
*
*/

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

export async function requestPasswordReset(email) {
  const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  const data = await jsonOrText(res);

  if (!res.ok) throw new Error(data.message || "Unable to request password reset");
  return data;
}

export async function resetPassword(token, password) {
  const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });

  const data = await jsonOrText(res);

  if (!res.ok) throw new Error(data.message || "Unable to reset password");
  return data;
}