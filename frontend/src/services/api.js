const API_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || "http://localhost:3000";
export const BASE = API_BASE;
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
    }
    else if (key === "reminderOffsets") {
      // Always send as JSON string so the server sees the whole array reliably.
      const arr = Array.isArray(value) ? value : [];
      fd.append("reminderOffsets", JSON.stringify(arr));
    }
    else if (Array.isArray(value)) {
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

export async function getProjects() {
  const res = await fetch(`${API_BASE}/api/projects`);
  if (!res.ok) {
    throw new Error("Failed to fetch projects");
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

// export async function getTeamMembersByProjectId(userId) {
//   const res = await fetch(`${API_BASE}/api/projects?teamMember=${userId}`);
//   if (!res.ok) {
//     throw new Error("Failed to fetch projects");
//   }
//   const projects = await res.json();

//   // Flatten all teamMembers
//   const allMembers = projects.flatMap(p => p.teamMembers || []);

//   // Deduplicate by _id and exclude the current userId
//   const uniqueMembers = [];
//   const seen = new Set();

//   for (const member of allMembers) {
//     if (!seen.has(member._id) && member._id !== userId) {
//       seen.add(member._id);
//       uniqueMembers.push(member);
//     }
//   }

//   return uniqueMembers;
// }

export async function getTeamMembersByProjectId(projectId) {
  if (!projectId) return [];

  // If your backend supports /api/projects/:id
  const res = await fetch(`${API_BASE}/api/projects/${projectId}`, {
    credentials: "include",
  });

  // Fallback (uncomment if your backend only supports a query param)
  // const res = await fetch(`${API_BASE}/api/projects?id=${encodeURIComponent(projectId)}`, {
  //   credentials: "include",
  // });

  if (!res.ok) {
    throw new Error("Failed to fetch project/team members");
  }

  const project = await res.json();
  // If your fallback returns an array, pick the first:
  // const project = Array.isArray(raw) ? raw[0] : raw;

  return Array.isArray(project?.teamMembers) ? project.teamMembers : [];
}


export async function updateTask(taskId, formData) {
  try {
    const body = toFormDataIfFiles(formData);
    const isFormData = body instanceof FormData;

    const res = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
      method: "PUT",
      headers: isFormData ? {} : { "Content-Type": "application/json" },
      body: isFormData ? body : body,
    });

    if (!res.ok) {
      throw new Error("Failed to update task");
    }

    return await res.json();

  } catch (err) {
    console.error(err);
    throw err;
  }
}

export async function deleteTask(taskId) {
  try {
    const res = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
      method: "DELETE"
    })

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || "Failed to delete task");
    }

    return data;

  } catch (err) {
    console.error(err);
    throw err;
  }
}


/*
*
* Auth APIs
*
*/

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function getTokenExp(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' ? payload.exp : 0;
  } catch { return 0; }
}

function isExpiringSoon(token, skewSeconds = 30) {
  const exp = getTokenExp(token);
  if (!exp) return true;
  const now = Math.floor(Date.now() / 1000);
  return exp - now <= skewSeconds;
}

export function scheduleLogoutWarning(token, onWarn, onLogout) {
  const exp = getTokenExp(token);
  if (!exp) return;

  const now = Math.floor(Date.now() / 1000); // seconds
  const msUntilExpiry = (exp - now) * 1000;

  // Fire warning 2 minutes before expiry
  const warnMs = msUntilExpiry - 2 * 60 * 1000;

  if (warnMs > 0) {
    setTimeout(onWarn, warnMs);
  }
  if (msUntilExpiry > 0) {
    setTimeout(onLogout, msUntilExpiry);
  }
}

export async function getSession() {
  const res = await authFetch(`/api/auth/session`)
  if (!res.ok) throw new Error("Not authenticated");
  return res.json();
}

export async function getMe() {
  const res = await authFetch(`/api/auth/me`);
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
    credentials: "include",
  });

  const data = await jsonOrText(res);

  if (!res.ok) throw new Error(data.message || "Login failed");

  if (data.accessToken) setToken(data.accessToken);

  return data;
}

export async function verifyOtp(email, otp) {
  const res = await fetch(`${API_BASE}/api/auth/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, otp }),
    credentials: "include",
  });

  const data = await jsonOrText(res);

  if (!res.ok) throw new Error(data.message || "OTP verification failed");

  if (data.accessToken) setToken(data.accessToken);

  return data;
}

export async function refreshAccessToken() {
  const res = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });

  if (!res.ok) throw new Error("Unable to refresh token");

  const data = await res.json();
  if (data.accessToken) setToken(data.accessToken);
  return data.accessToken;
}

export async function authFetch(path, options = {}) {
  let token = getToken();
  if (!token || isExpiringSoon(token)) {
    try { await refreshAccessToken(); }
    catch { /* noop: token refresh may legitimately fail before login */ }
    token = getToken();
  }
  // first refresh
  let res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: "include",
  });
  if (res.status !== 401) return res;
  // refresh again if 401 error 
  try {
    await refreshAccessToken();
    const refreshed = getToken();
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
        ...(refreshed ? { Authorization: `Bearer ${refreshed}` } : {}),
      },
      credentials: "include",
    });
    return res;
  } catch {
    throw new Error("Not authenticated");
  }
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

  clearToken();

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

  const data = await res.json().catch(() => ({}));

  const emailExistsHeader = res.headers?.get?.("X-Email-Exists");
  const emailExists =
    emailExistsHeader === "true" ? true :
      emailExistsHeader === "false" ? false :
        undefined;

  if (!res.ok) throw new Error(data.message || "Unable to request password reset");
  return { ...data, emailExists };
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

export async function getCalendarTasks({ start, end, userIds, projectId, status }) {
  const q = new URLSearchParams();
  q.set("start", start);
  q.set("end", end);
  if (Array.isArray(userIds) && userIds.length) q.set("userIds", userIds.join(","));
  if (projectId) q.set("projectId", projectId);
  if (status) q.set("status", status);

  const path = `/api/calendar?${q.toString()}`;
  const res = await authFetch(path, { method: "GET" });  // <— ensures Bearer token & refresh
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status} ${await res.text().catch(() => "")}`);
  return res.json();
}


export async function updateTaskDates(taskId, { startAt, endAt, allDay }) {
  const res = await fetch(`${BASE}/api/tasks/${taskId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ startAt, endAt, allDay }),
  });
  if (!res.ok) throw new Error(`PUT /api/tasks/${taskId} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/* ===================== Projects ===================== */
export async function getProjectById(id) {
  const res = await fetch(`${API_BASE}/api/projects/${id}?populate=1`, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text().catch(() => "Failed to fetch project"));
  return res.json();
}

/** Get selectable departments */
export async function getDepartments() {
  const res = await fetch(`${API_BASE}/api/departments`, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text().catch(() => "Failed to fetch departments"));
  return res.json();
}

/** Get selectable users */
export async function getAllTeamMembers() {
  const res = await fetch(`${API_BASE}/api/users`, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text().catch(() => "Failed to fetch team members"));
  const data = await res.json();
  return Array.isArray(data)
    ? data.map((u) => ({
        _id: u._id || u.id,
        name: u.name || u.fullName || u.email || "Unnamed",
        email: u.email,
      }))
    : [];
}

/** Create project; if server ignored department on POST, patch then refetch populated */
export async function createProject(formData) {
  // We send aliases so whichever key the server expects will be read.
  const body = JSON.stringify({
    ...formData,
    department: formData.department ?? formData.departments ?? formData.departmentIds ?? (formData.departmentId ? [formData.departmentId] : []),
  });

  const res = await fetch(`${API_BASE}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body,
  });

  if (!res.ok) throw new Error(await res.text().catch(() => "Failed to create project"));
  let created = await res.json();
  const id = created?._id || created?.id;

  // verify departments persisted; if not, update once
  const want =
    (Array.isArray(formData.department) && formData.department.length) ||
    (Array.isArray(formData.departments) && formData.departments.length) ||
    (Array.isArray(formData.departmentIds) && formData.departmentIds.length) ||
    !!formData.departmentId;

  const has =
    Array.isArray(created?.department) ? created.department.length > 0 : false;

  if (id && want && !has) {
    try {
      const deptIds =
        formData.department ?? formData.departments ?? formData.departmentIds ?? (formData.departmentId ? [formData.departmentId] : []);
      const upd = await fetch(`${API_BASE}/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ department: deptIds }),
      });
      if (upd.ok) created = await upd.json();
    } catch { /* ignore; we'll refetch below if needed */ }
  }

  // if not fully populated, refetch populated
  const isPopulated =
    created &&
    typeof created.createdBy === "object" &&
    Array.isArray(created.teamMembers) &&
    created.teamMembers.every((m) => typeof m === "object") &&
    Array.isArray(created.department) &&
    created.department.every((d) => typeof d === "object");

  return isPopulated ? created : (id ? await getProjectById(id) : created);
}

/** Update project and return populated */
export async function updateProject(projectId, formData) {
  const body = JSON.stringify({
    ...formData,
    ...(formData.department || formData.departments || formData.departmentIds || formData.departmentId
      ? {
          department:
            formData.department ??
            formData.departments ??
            formData.departmentIds ??
            (formData.departmentId ? [formData.departmentId] : []),
        }
      : {}),
  });

  const res = await fetch(`${API_BASE}/api/projects/${projectId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body,
  });

  if (!res.ok) throw new Error(await res.text().catch(() => "Failed to update project"));
  const updated = await res.json();

  const isPopulated =
    updated &&
    typeof updated.createdBy === "object" &&
    Array.isArray(updated.teamMembers) &&
    updated.teamMembers.every((m) => typeof m === "object") &&
    Array.isArray(updated.department) &&
    updated.department.every((d) => typeof d === "object");

  if (isPopulated) return updated;

  const id = updated?._id || updated?.id;
  return id ? await getProjectById(id) : updated;
}

// (Manager) Send Overdue Task Alerts via Gmail
export async function sendOverdueAlerts(projectId) {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || "http://localhost:3000";
  const res = await fetch(`${API_BASE}/api/notifications/overdue?project=${encodeURIComponent(projectId)}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(await res.text().catch(() => "Failed to send overdue alerts"));
  }
  return res.json();
}

/*
*
* Comment API functions
*
*/

export async function listTaskComments(taskId, { cursor, limit = 20 } = {}) {
  if (!taskId) throw new Error("taskId is required");
  const qs = new URLSearchParams();
  if (cursor) qs.set("cursor", cursor);
  if (limit) qs.set("limit", String(limit));
  const res = await fetch(`${API_BASE}/api/tasks/${taskId}/comments?${qs.toString()}`, {
     credentials: "include",
  });
  if (!res.ok) throw new Error(await res.text().catch(() => "Failed to fetch comments"));
  return res.json(); 
}

export async function searchMentionableUsers(taskId, q = "") {
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);          // when q === "", server returns all task members
  const res = await fetch(`${API}/api/tasks/${taskId}/mentionable-users?${qs}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(await res.text().catch(() => "Failed to fetch mention users"));
  return res.json();              // [{ _id, handle, name, email }]
}

export async function createTaskComment(taskId, payload, clientKey) {
  if (!taskId) throw new Error("taskId is required");
  if (!payload?.body || !payload.body.trim()) throw new Error("Comment body is required");

  const hasFiles = Array.isArray(payload.attachments) &&
                  payload.attachments.some(f => typeof File !== "undefined" && f instanceof File);

  let headers, reqBody;

  if (hasFiles) {
    const fd = new FormData();
    fd.append("body", payload.body);
    if (payload.authorId) fd.append("author", payload.authorId); 
    (payload.mentions ?? []).forEach(m => fd.append("mentions", m));
    (payload.attachments ?? []).forEach(f => fd.append("attachments", f));
    reqBody = fd; 
  } else {
    headers = { "Content-Type": "application/json" };
    reqBody = JSON.stringify({
      body: payload.body,
      author: payload.authorId,   
      mentions: payload.mentions ?? [],
      attachments: [],
      clientKey,
    });
  }

  const res = await authFetch(`/api/tasks/${taskId}/comments`, {
    method: "POST",
  
    ...(headers ? { headers } : {}),
    body: reqBody,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "Failed to create comment");
  }
  return res.json();
}

export async function updateTaskComment(taskId, commentId, { body, authorId }) {
  const res = await authFetch(`/api/tasks/${taskId}/comments/${commentId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body, ...(authorId ? { author: authorId } : {}) }),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => "Failed to update comment"));
  return res.json(); 
}

export async function deleteTaskComment(taskId, commentId, { authorId } = {}) {
  if (!taskId || !commentId) throw new Error("taskId and commentId are required");
  const res = await authFetch(`/api/tasks/${taskId}/comments/${commentId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(authorId ? { author: authorId } : {}),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => "Failed to delete comment"));
  return res.json(); 
}
