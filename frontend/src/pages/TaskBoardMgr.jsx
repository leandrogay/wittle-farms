import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { getManagerProjects, getProjectTasks, sendOverdueAlerts } from "../services/api.js";
import TaskCard from "../components/ui/TaskCard.jsx";
import TaskForm from "../components/ui/TaskForm.jsx";
import { useAuth } from "../context/useAuth";

function priorityBucket(p) {
  const n = Math.trunc(Number(p));
  if (!Number.isFinite(n)) return null;
  if (n <= 3) return "Low";
  if (n <= 7) return "Medium";
  return "High";
}

function ProjectPicker({ projects, valueId, onChange }) {
  const [open, setOpen] = useState(false);
  const current = projects.find((p) => p._id === valueId);

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary">
          Project:
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl border-2 border-brand-primary dark:border-brand-secondary bg-light-bg dark:bg-dark-bg px-4 py-2 text-sm font-semibold text-light-text-primary dark:text-dark-text-primary hover:bg-brand-primary/5 dark:hover:bg-brand-secondary/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          disabled={projects.length === 0}
          title={projects.length === 0 ? "You haven't created any projects yet" : ""}
        >
          <span className="truncate max-w-[200px]">
            {current?.name ?? (projects.length ? "Choose project" : "No projects")}
          </span>
          <span className={`transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
        </button>
      </div>

      {open && projects.length > 0 && (
        <div className="absolute right-0 z-40 mt-2 w-72 rounded-xl border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg p-1 shadow-2xl">
          {projects.map((p) => (
            <button
              key={p._id}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${p._id === valueId
                ? "bg-brand-primary dark:bg-brand-secondary text-white font-semibold"
                : "text-light-text-primary dark:text-dark-text-primary hover:bg-light-surface dark:hover:bg-dark-surface"
                }`}
              onClick={() => {
                onChange(p._id);
                setOpen(false);
              }}
            >
              {p.name || "Untitled Project"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SquareTaskTile({ task, onOpen, section }) {
  const hasDate = !!task?.deadline;
  const deadlineStr = hasDate ? dayjs(task.deadline).format("DD MMM YYYY") : "No deadline";

  const status = normalizeStatus(task.status);
  const statusClass =
    status === "To Do"
      ? "text-light-text-muted dark:text-dark-text-muted"
      : status === "In Progress"
        ? "text-info"
        : status === "Done"
          ? "text-success"
          : "";

  const priorityColors = {
    Low: "text-success",
    Medium: "text-warning",
    High: "text-danger",
  };

  const deadlineChip = !hasDate ? (
    <span className="inline-flex items-center rounded-lg bg-light-surface dark:bg-dark-surface px-3 py-1.5 text-xs font-semibold text-light-text-muted dark:text-dark-text-muted border border-light-border dark:border-dark-border">
      📅 {deadlineStr}
    </span>
  ) : section === "overdue" ? (
    <span className="inline-flex items-center rounded-lg bg-priority-high-bg dark:bg-priority-high-bg-dark px-3 py-1.5 text-xs font-semibold text-priority-high-text dark:text-priority-high-text-dark border border-priority-high-border dark:border-priority-high-border-dark">
      ⚠️ Deadline: {deadlineStr}
    </span>
  ) : section === "today" ? (
    <span className="inline-flex items-center rounded-lg bg-priority-medium-bg dark:bg-priority-medium-bg-dark px-3 py-1.5 text-xs font-semibold text-priority-medium-text dark:text-priority-medium-text-dark border border-priority-medium-border dark:border-priority-medium-border-dark">
      📅 Due Today: {deadlineStr}
    </span>
  ) : section === "completed" ? (
    <span className="inline-flex items-center rounded-lg bg-light-surface dark:bg-dark-surface px-3 py-1.5 text-xs font-semibold text-light-text-muted dark:text-dark-text-muted border border-light-border dark:border-dark-border">
      ✓ {deadlineStr}
    </span>
  ) : (
    <span className="inline-flex items-center rounded-lg bg-brand-primary/10 dark:bg-brand-secondary/10 px-3 py-1.5 text-xs font-semibold text-brand-primary dark:text-brand-secondary border border-brand-primary/20 dark:border-brand-secondary/20">
      📅 Deadline: {deadlineStr}
    </span>
  );

  return (
    <article className="border border-light-border dark:border-dark-border rounded-2xl shadow-sm bg-light-bg dark:bg-dark-bg overflow-hidden transition-all hover:shadow-md hover:border-brand-primary dark:hover:border-brand-secondary h-full group">
      <button
        type="button"
        onClick={() => onOpen(task)}
        className="w-full p-5 flex flex-col justify-between text-left h-full"
        aria-label={`Open task ${task?.title ?? ""}`}
      >
        <div className="space-y-3">
          <div className="text-base sm:text-lg font-bold line-clamp-2 text-light-text-primary dark:text-dark-text-primary group-hover:text-brand-primary dark:group-hover:text-brand-secondary transition-colors">
            {task.title || "Untitled task"}
          </div>

          <div className="text-sm space-y-1">
            <div className="font-medium text-light-text-secondary dark:text-dark-text-secondary">
              Status:
            </div>
            <div className={`text-base font-semibold ${statusClass}`}>{task.status}</div>
          </div>

          <div className="text-sm space-y-1">
            <div className="font-medium text-light-text-secondary dark:text-dark-text-secondary">
              Priority:
            </div>
            <div>
              {(() => {
                const bucket = priorityBucket(task.priority);
                const n = Number(task?.priority);
                if (!bucket || !Number.isFinite(n)) {
                  return (
                    <span className="text-light-text-muted dark:text-dark-text-muted font-semibold">
                      None
                    </span>
                  );
                }
                return (
                  <span className={`font-semibold ${priorityColors[bucket]}`}>
                    {n} · {bucket}
                  </span>
                );
              })()}
            </div>
          </div>
        </div>

        <div className="mt-4">{deadlineChip}</div>
      </button>
    </article>
  );
}

export default function TaskBoardMgr() {
  const { user, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState([]);
  const [projLoading, setProjLoading] = useState(true);
  const [projError, setProjError] = useState(null);

  const [selectedProjectId, setSelectedProjectId] = useState(null);

  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState(null);

  const [activeTask, setActiveTask] = useState(null);

  const [statusFilter, setStatusFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");

  const [showCreate, setShowCreate] = useState(false);

  const userId = user?._id ?? user?.id ?? null;

  useEffect(() => {
    if (authLoading) return;
    (async () => {
      try {
        const data = await getManagerProjects(user.id);
        const all = Array.isArray(data) ? data : [];

        const mine = all.filter((p) => {
          const createdBy = p?.createdBy;
          const createdById =
            (createdBy && (createdBy._id || createdBy.id)) || (typeof createdBy === "string" ? createdBy : null);
          return createdById && userId && createdById === userId;
        });

        setProjects(mine);

        if (mine.length > 0) {
          setSelectedProjectId((prev) => (mine.some((p) => p._id === prev) ? prev : mine[0]._id));
        } else {
          setSelectedProjectId(null);
        }
      } catch (err) {
        setProjError(err?.message || "Failed to load projects");
      } finally {
        setProjLoading(false);
      }
    })();
  }, [authLoading, userId]);

  const reloadTasks = async (projectId = selectedProjectId) => {
    if (!projectId) return;
    setTasksLoading(true);
    setTasksError(null);
    setActiveTask(null);
    try {
      const data = await getProjectTasks(projectId);
      setTasks(Array.isArray(data) ? data : []);
    } catch (err) {
      setTasksError(err?.message || "Failed to load tasks");
    } finally {
      setTasksLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedProjectId) return;
    reloadTasks(selectedProjectId);
  }, [selectedProjectId]);

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const pa = Number(a.priority) || 0;
      const pb = Number(b.priority) || 0;
      if (pb !== pa) return pb - pa;
      const ad = a?.deadline ? new Date(a.deadline).getTime() : Infinity;
      const bd = b?.deadline ? new Date(b.deadline).getTime() : Infinity;
      return ad - bd;
    });
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const statusOK = (st) => statusFilter === "All" || normalizeStatus(st) === statusFilter;
    const priorityOK = (pr) => {
      if (priorityFilter === "All") return true;
      const n = Number(pr);
      const f = Number(priorityFilter);
      return Number.isFinite(n) && n === f;
    };

    return sortedTasks.filter((t) => {
      const taskMatch = statusOK(t.status) && priorityOK(t.priority);
      const subMatch = (t.subtasks ?? []).some(
        (s) => statusOK(s.status) && priorityOK(s.priority)
      );
      return taskMatch || subMatch;
    });
  }, [sortedTasks, statusFilter, priorityFilter]);

  const today = dayjs().startOf("day");
  const isDone = (t) => normalizeStatus(t.status) === "Done";
  const hasDeadline = (t) => !!t?.deadline;
  const djs = (t) => dayjs(t.deadline);

  const sectionKey = (t) => {
    if (isDone(t)) return "completed";
    if (!hasDeadline(t)) return "upcoming";
    if (djs(t).isBefore(today)) return "overdue";
    if (djs(t).isSame(today, "day")) return "today";
    return "upcoming";
  };

  const cmpClosest = (a, b) => {
    const da = Math.abs(djs(a).diff(today, "millisecond"));
    const db = Math.abs(djs(b).diff(today, "millisecond"));
    return da - db;
  };

  const withNoDeadlineLast = (cmp) => (a, b) => {
    const ad = hasDeadline(a), bd = hasDeadline(b);
    if (ad && !bd) return -1;
    if (!ad && bd) return 1;
    if (!ad && !bd) return 0;
    return cmp(a, b);
  };

  const { overdue, todayDue, upcoming, completed } = useMemo(() => {
    const buckets = { overdue: [], today: [], upcoming: [], completed: [] };
    for (const t of filteredTasks) {
      buckets[sectionKey(t)].push(t);
    }
    buckets.overdue.sort(withNoDeadlineLast(cmpClosest));
    buckets.today.sort(withNoDeadlineLast(cmpClosest));
    buckets.upcoming.sort(withNoDeadlineLast(cmpClosest));
    buckets.completed.sort((a, b) => {
      const ad = hasDeadline(a) ? djs(a).valueOf() : -Infinity;
      const bd = hasDeadline(b) ? djs(b).valueOf() : -Infinity;
      return bd - ad;
    });
    return {
      overdue: buckets.overdue,
      todayDue: buckets.today,
      upcoming: buckets.upcoming,
      completed: buckets.completed,
    };
  }, [filteredTasks]);

  const statusOptions = useMemo(() => {
    const set = new Set(["To Do", "In Progress", "Done"]);
    tasks.forEach((t) => {
      set.add(normalizeStatus(t.status));
      (t.subtasks ?? []).forEach((s) => set.add(normalizeStatus(s.status)));
    });
    return ["All", ...Array.from(set).filter(Boolean)];
  }, [tasks]);

  const priorityOptions = useMemo(() => {
    const seen = new Set();
    const add = (v) => {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 1 && n <= 10) seen.add(String(n));
    };
    tasks.forEach((t) => add(t.priority));
    tasks.forEach((t) => (t.subtasks ?? []).forEach((s) => add(s.priority)));
    const ordered = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].filter((x) => seen.has(x));
    return ["All", ...ordered];
  }, [tasks]);

  if (authLoading || projLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary dark:border-brand-secondary"></div>
          <p className="text-light-text-secondary dark:text-dark-text-secondary">Loading…</p>
        </div>
      </div>
    );
  }

  if (projError) {
    return (
      <div className="p-4">
        <div className="rounded-lg bg-priority-high-bg dark:bg-priority-high-bg-dark border border-priority-high-border dark:border-priority-high-border-dark p-4">
          <p className="text-priority-high-text dark:text-priority-high-text-dark font-semibold">
            {projError}
          </p>
        </div>
      </div>
    );
  }

  const currentProjectName = projects.find((p) => p._id === selectedProjectId)?.name;

  return (
    <section className="p-4 space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-light-text-primary dark:text-dark-text-primary">
          Taskboard (Manager)
        </h1>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <ProjectPicker
            projects={projects}
            valueId={selectedProjectId}
            onChange={setSelectedProjectId}
          />

          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary">
              Status:
              <select
                className="ml-2 rounded-lg border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg-secondary text-light-text-primary dark:text-dark-text-primary px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-secondary transition-all"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                {statusOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary">
              Priority:
              <select
                className="ml-2 rounded-lg border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg-secondary text-light-text-primary dark:text-dark-text-primary px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-secondary transition-all"
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
              >
                {priorityOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>

            {(statusFilter !== "All" || priorityFilter !== "All") && (
              <button
                className="rounded-lg border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg-secondary text-light-text-primary dark:text-dark-text-primary px-3 py-1.5 text-sm hover:bg-light-surface dark:hover:bg-dark-surface transition-all font-medium"
                onClick={() => {
                  setStatusFilter("All");
                  setPriorityFilter("All");
                }}
              >
                Clear Filters
              </button>
            )}
          </div>

          <button
            disabled={!selectedProjectId}
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-brand-primary dark:bg-brand-secondary text-white shadow hover:bg-blue-700 dark:hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            title={
              selectedProjectId
                ? "Create a new task in this project"
                : projects.length === 0
                  ? "You have no projects you created"
                  : "Select a project first"
            }
          >
            + Create Task
          </button>
        </div>
      </header>

      {projects.length === 0 && (
        <div className="rounded-lg border border-warning bg-priority-medium-bg dark:bg-priority-medium-bg-dark p-6 text-center">
          <p className="text-priority-medium-text dark:text-priority-medium-text-dark font-semibold">
            You currently don't have any projects that you created. Create one to start adding tasks.
          </p>
        </div>
      )}

      {tasksLoading && (
        <div className="flex items-center justify-center py-8">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary dark:border-brand-secondary"></div>
            <p className="text-light-text-secondary dark:text-dark-text-secondary">Loading tasks…</p>
          </div>
        </div>
      )}

      {tasksError && (
        <div className="rounded-lg bg-priority-high-bg dark:bg-priority-high-bg-dark border border-priority-high-border dark:border-priority-high-border-dark p-4">
          <p className="text-priority-high-text dark:text-priority-high-text-dark font-semibold">
            {tasksError}
          </p>
        </div>
      )}

      {!tasksLoading && !tasksError && projects.length > 0 && selectedProjectId && (
        <div className="space-y-8">
          {overdue.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-1 h-6 bg-danger rounded-full"></div>
                <h2 className="text-lg font-bold text-danger">Overdue ({overdue.length})</h2>
                <div className="h-px bg-danger/20 flex-1" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {overdue.map((t) => (
                  <SquareTaskTile key={t._id} task={t} onOpen={setActiveTask} section="overdue" />
                ))}
              </div>
            </div>
          )}

          {todayDue.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-1 h-6 bg-warning rounded-full"></div>
                <h2 className="text-lg font-bold text-warning">Due Today ({todayDue.length})</h2>
                <div className="h-px bg-warning/20 flex-1" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {todayDue.map((t) => (
                  <SquareTaskTile key={t._id} task={t} onOpen={setActiveTask} section="today" />
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-1 h-6 bg-brand-primary dark:bg-brand-secondary rounded-full"></div>
              <h2 className="text-lg font-bold text-light-text-primary dark:text-dark-text-primary">
                Upcoming ({upcoming.length})
              </h2>
              <div className="h-px bg-light-border dark:bg-dark-border flex-1" />
            </div>
            {upcoming.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {upcoming.map((t) => (
                  <SquareTaskTile key={t._id} task={t} onOpen={setActiveTask} section="upcoming" />
                ))}
              </div>
            ) : (
              overdue.length === 0 &&
              todayDue.length === 0 && (
                <p className="text-light-text-muted dark:text-dark-text-muted">
                  No tasks match the filters.
                </p>
              )
            )}
          </div>

          {completed.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-1 h-6 bg-success rounded-full"></div>
                <h2 className="text-lg font-bold text-success">Completed ({completed.length})</h2>
                <div className="h-px bg-success/20 flex-1" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {completed.map((t) => (
                  <SquareTaskTile key={t._id} task={t} onOpen={setActiveTask} section="completed" />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-black/50 dark:bg-black/70 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowCreate(false);
          }}
          aria-modal="true"
          role="dialog"
        >
          <TaskForm
            projectId={selectedProjectId}
            projectName={currentProjectName}
            onCancel={() => setShowCreate(false)}
            onCreated={async () => {
              setShowCreate(false);
              await reloadTasks();
            }}
          />
        </div>
      )}

      {activeTask && (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-black/50 dark:bg-black/70 backdrop-blur-sm"
          onMouseDown={(e) => e.target === e.currentTarget && setActiveTask(null)}
          aria-modal="true"
          role="dialog"
        >
          <div className="w-[min(90vw,740px)] rounded-2xl bg-light-bg dark:bg-dark-bg shadow-2xl p-6 border border-light-border dark:border-dark-border max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-light-text-primary dark:text-dark-text-primary">
                {activeTask?.title || "Task Details"}
              </h2>
              <button
                onClick={() => setActiveTask(null)}
                className="text-light-text-muted dark:text-dark-text-muted hover:text-danger transition-colors text-2xl font-bold"
              >
                ×
              </button>
            </div>
            <TaskCard
              task={activeTask}
              onTaskUpdated={async () => {
                await reloadTasks();
              }}
              onTaskDeleted={(deletedId) => {
                setTasks((prev) => prev.filter((t) => t._id !== deletedId));
                setActiveTask(null);
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------------- helpers ---------------- */
function normalizeStatus(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "";
  if (s === "todo" || s === "to do") return "To Do";
  if (s === "inprogress" || s === "in progress") return "In Progress";
  if (s === "done" || s === "completed" || s === "complete") return "Done";
  return s
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}