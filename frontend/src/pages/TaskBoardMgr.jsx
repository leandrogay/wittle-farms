import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { getManagerProjects, getProjectTasks } from "../services/api.js";
import TaskCard from "../components/ui/TaskCard.jsx";
import TaskForm from "../components/ui/TaskForm.jsx";
import { useAuth } from "../context/AuthContext.jsx";

function ProjectPicker({ projects, valueId, onChange }) {
  const [open, setOpen] = useState(false);
  const current = projects.find((p) => p._id === valueId);

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">Project:</span>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl border-2 border-blue-600 px-3 py-2 text-sm font-semibold"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          disabled={projects.length === 0}
          title={projects.length === 0 ? "You haven't created any projects yet" : ""}
        >
          {current?.name ?? (projects.length ? "Choose project" : "No projects")}
          <span className={`transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
        </button>
      </div>

      {open && projects.length > 0 && (
        <div className="absolute right-0 z-40 mt-2 w-72 rounded-xl border bg-white p-1 shadow-xl">
          {projects.map((p) => (
            <button
              key={p._id}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100 ${p._id === valueId ? "bg-indigo-50 font-semibold" : ""
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
    status === "To Do" ? "text-gray-500"
      : status === "In Progress" ? "text-blue-500"
        : status === "Done" ? "text-green-500"
          : "";

  const deadlineChip = !hasDate ? (
    <span className="inline-flex items-center rounded-lg bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700">
      {hasDate ? "Deadline: " : ""}{deadlineStr}
    </span>
  ) : section === "overdue" ? (
    <span className="inline-flex items-center rounded-lg bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
      Deadline: {deadlineStr}
    </span>
  ) : section === "today" ? (
    <span className="inline-flex items-center rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
      Due Today: {deadlineStr}
    </span>
  ) : section === "completed" ? (
    <span className="inline-flex items-center rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
      Deadline: {deadlineStr}
    </span>
  ) : (
    <span className="inline-flex items-center rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
      Deadline: {deadlineStr}
    </span>
  );

  return (
    <article className="border rounded-2xl shadow-sm bg-white overflow-hidden transition hover:shadow-md h-full">
      <button
        type="button"
        onClick={() => onOpen(task)}
        className="w-full p-4 flex flex-col justify-between text-left h-full"
        aria-label={`Open task ${task?.title ?? ""}`}
      >
        <div className="space-y-2">
          <div className="text-base sm:text-lg font-semibold line-clamp-2 hover:underline">
            {task.title || "Untitled task"}
          </div>

          <div className="text-sm">
            <div className="font-medium">Status:</div>
            <div className={`text-base sm:text-lg font-semibold ${statusClass}`}>{task.status}</div>
          </div>

          <div className="text-sm">
            <div className="font-medium">Priority:</div>
            <div>
              {task.priority === "Low" && <span className="text-green-600 font-semibold">Low</span>}
              {task.priority === "Medium" && <span className="text-yellow-600 font-semibold">Medium</span>}
              {task.priority === "High" && <span className="text-red-600 font-semibold">High</span>}
              {!["Low", "Medium", "High"].includes(task.priority) && (
                <span className="text-gray-600 font-semibold">None</span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-2">{deadlineChip}</div>
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
        const data = await getManagerProjects();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]);

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const ad = a?.deadline ? new Date(a.deadline).getTime() : Infinity;
      const bd = b?.deadline ? new Date(b.deadline).getTime() : Infinity;
      return ad - bd;
    });
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const statusOK = (st) => statusFilter === "All" || normalizeStatus(st) === statusFilter;
    const priorityOK = (pr) => priorityFilter === "All" || (pr ?? "None") === priorityFilter;

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
    const set = new Set(["Low", "Medium", "High"]);
    tasks.forEach((t) => set.add(t.priority ?? "None"));
    tasks.forEach((t) => (t.subtasks ?? []).forEach((s) => set.add(s.priority ?? "None")));
    return ["All", ...Array.from(set)];
  }, [tasks]);

  if (authLoading || projLoading) return <p className="p-4 text-gray-600">Loading…</p>;
  if (projError) return <p className="p-4 text-red-600">{projError}</p>;

  const currentProjectName = projects.find((p) => p._id === selectedProjectId)?.name;

  return (
    <section className="p-4 space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Taskboard (Manager)</h1>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <ProjectPicker
            projects={projects}
            valueId={selectedProjectId}
            onChange={setSelectedProjectId}
          />

          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm text-gray-600">
              Status:
              <select
                className="ml-2 rounded-lg border px-2 py-1 text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                {statusOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </label>

            <label className="text-sm text-gray-600">
              Priority:
              <select
                className="ml-2 rounded-lg border px-2 py-1 text-sm"
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
              >
                {priorityOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </label>

            {(statusFilter !== "All" || priorityFilter !== "All") && (
              <button
                className="rounded-lg border px-2.5 py-1 text-sm hover:bg-gray-50"
                onClick={() => { setStatusFilter("All"); setPriorityFilter("All"); }}
              >
                Clear
              </button>
            )}
          </div>

          <button
            disabled={!selectedProjectId}
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white shadow hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="rounded-lg border bg-amber-50 text-amber-900 p-4">
          You currently don’t have any projects that you created. Create one to start adding tasks.
        </div>
      )}

      {tasksLoading && <p className="text-gray-600">Loading tasks…</p>}
      {tasksError && <p className="text-red-600">{tasksError}</p>}

      {!tasksLoading && !tasksError && projects.length > 0 && selectedProjectId && (
        <div className="space-y-8">
          {overdue.length > 0 && (
            <>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-red-700">Overdue</h2>
                <div className="h-px bg-red-200 flex-1" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {overdue.map((t) => (
                  <SquareTaskTile key={t._id} task={t} onOpen={setActiveTask} section="overdue" />
                ))}
              </div>
            </>
          )}

          {todayDue.length > 0 && (
            <>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-amber-700">Due Today</h2>
                <div className="h-px bg-amber-200 flex-1" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {todayDue.map((t) => (
                  <SquareTaskTile key={t._id} task={t} onOpen={setActiveTask} section="today" />
                ))}
              </div>
            </>
          )}

          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Upcoming</h2>
            <div className="h-px bg-gray-200 flex-1" />
          </div>
          {upcoming.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {upcoming.map((t) => (
                <SquareTaskTile key={t._id} task={t} onOpen={setActiveTask} section="upcoming" />
              ))}
            </div>
          ) : (
            overdue.length === 0 && todayDue.length === 0 && (
              <p className="text-gray-500">No tasks match the filters.</p>
            )
          )}

          {completed.length > 0 && (
            <>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-green-700">Completed</h2>
                <div className="h-px bg-gray-200 flex-1" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {completed.map((t) => (
                  <SquareTaskTile key={t._id} task={t} onOpen={setActiveTask} section="completed" />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {showCreate && (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-black/50"
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
          className="fixed inset-0 z-[70] grid place-items-center bg-black/50"
          onMouseDown={(e) => e.target === e.currentTarget && setActiveTask(null)}
          aria-modal="true"
          role="dialog"
        >
          <div className="w-[min(90vw,740px)] rounded-2xl bg-white shadow-2xl p-4">
            <h2 className="text-lg font-semibold mb-3">{activeTask?.title || "Task details"}</h2>
            <TaskCard
              task={activeTask}
              onTaskUpdated={async () => {
                await reloadTasks();
              }}
              onTaskDeleted={(deletedId) => {
                // Remove task immediately from state
                setTasks(prev => prev.filter(t => t._id !== deletedId));
                // Close the modal
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
