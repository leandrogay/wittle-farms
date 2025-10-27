import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { getTasks } from "../services/api.js";
import { TaskCard } from "../components/ui/TaskCard.jsx";
import { TaskForm }from "../components/ui/TaskForm.jsx";
import { useAuth } from "../context/useAuth.js";

function priorityBucket(p) {
  const n = Math.trunc(Number(p));
  if (!Number.isFinite(n)) return null;
  if (n <= 3) return "Low";
  if (n <= 7) return "Medium";
  return "High";
}

export default function Tasks() {
  const { user } = useAuth();

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // const [showCreate, setShowCreate] = useState(false);
  const [activeTask, setActiveTask] = useState(null);

  const [statusFilter, setStatusFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await getTasks();

        const myTasks = Array.isArray(data)
          ? data.filter(
            (t) =>
              Array.isArray(t.assignedTeamMembers) &&
              t.assignedTeamMembers.some(
                (m) =>
                  (typeof m === "string" && m === user.id) ||
                  (m && m._id === user.id)
              )
          )
          : [];

        setTasks(myTasks);
      } catch (err) {
        setError(err.message || "Failed to load tasks");
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id]);

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
    return sortedTasks.filter((t) => statusOK(t.status) && priorityOK(t.priority));
  }, [sortedTasks, statusFilter, priorityFilter]);

  const today = dayjs().startOf("day");
  const sectionKey = (t) => {
    if (normalizeStatus(t.status) === "Done") return "completed";
    if (!t.deadline) return "upcoming";
    const d = dayjs(t.deadline);
    if (d.isBefore(today)) return "overdue";
    if (d.isSame(today, "day")) return "today";
    return "upcoming";
  };

  const { overdue, todayDue, upcoming, completed } = useMemo(() => {
    const buckets = { overdue: [], today: [], upcoming: [], completed: [] };
    for (const t of filteredTasks) buckets[sectionKey(t)].push(t);
    return {
      overdue: buckets.overdue,
      todayDue: buckets.today,
      upcoming: buckets.upcoming,
      completed: buckets.completed,
    };
  }, [filteredTasks, sectionKey]);

  const statusOptions = ["All", "To Do", "In Progress", "Done"];
  const priorityOptions = ["All", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary dark:border-brand-secondary"></div>
          <p className="text-light-text-secondary dark:text-dark-text-secondary">Loading tasks…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="rounded-lg bg-priority-high-bg dark:bg-priority-high-bg-dark border border-priority-high-border dark:border-priority-high-border-dark p-4">
          <p className="text-priority-high-text dark:text-priority-high-text-dark font-semibold">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <section className="p-4 space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-light-text-primary dark:text-dark-text-primary">My Tasks</h1>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-light-text-secondary dark:text-dark-text-secondary font-medium">
            Status:
            <select
              className="ml-2 rounded-lg border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg-secondary text-light-text-primary dark:text-dark-text-primary px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-secondary transition-all"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {statusOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </label>

          <label className="text-sm text-light-text-secondary dark:text-dark-text-secondary font-medium">
            Priority:
            <select
              className="ml-2 rounded-lg border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg-secondary text-light-text-primary dark:text-dark-text-primary px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-secondary transition-all"
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
              className="rounded-lg border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg-secondary text-light-text-primary dark:text-dark-text-primary px-3 py-1.5 text-sm hover:bg-light-surface dark:hover:bg-dark-surface transition-all font-medium"
              onClick={() => { setStatusFilter("All"); setPriorityFilter("All"); }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </header>

      {tasks.length === 0 && (
        <div className="rounded-lg border border-warning bg-priority-medium-bg dark:bg-priority-medium-bg-dark p-6 text-center">
          <p className="text-priority-medium-text dark:text-priority-medium-text-dark font-semibold">
            You currently have no tasks assigned.
          </p>
        </div>
      )}

      <div className="space-y-8">
        {overdue.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-6 bg-danger rounded-full"></div>
              <h2 className="text-lg font-bold text-danger">Overdue ({overdue.length})</h2>
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
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-6 bg-warning rounded-full"></div>
              <h2 className="text-lg font-bold text-warning">Due Today ({todayDue.length})</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {todayDue.map((t) => (
                <SquareTaskTile key={t._id} task={t} onOpen={setActiveTask} section="today" />
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-6 bg-brand-primary dark:bg-brand-secondary rounded-full"></div>
            <h2 className="text-lg font-bold text-light-text-primary dark:text-dark-text-primary">
              Upcoming ({upcoming.length})
            </h2>
          </div>
          {upcoming.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {upcoming.map((t) => (
                <SquareTaskTile key={t._id} task={t} onOpen={setActiveTask} section="upcoming" />
              ))}
            </div>
          ) : (
            <p className="text-light-text-muted dark:text-dark-text-muted">No upcoming tasks.</p>
          )}
        </div>

        {completed.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-6 bg-success rounded-full"></div>
              <h2 className="text-lg font-bold text-success">Completed ({completed.length})</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {completed.map((t) => (
                <SquareTaskTile key={t._id} task={t} onOpen={setActiveTask} section="completed" />
              ))}
            </div>
          </div>
        )}
      </div>

      {activeTask && (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-black/50 dark:bg-black/70 backdrop-blur-sm"
          onMouseDown={(e) => e.target === e.currentTarget && setActiveTask(null)}
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
              onTaskUpdated={(updated) => {
                setTasks((prev) => prev.map((t) => (t._id === updated._id ? updated : t)));
                setActiveTask(null);
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

  const chipColor =
    section === "overdue"
      ? "bg-priority-high-bg dark:bg-priority-high-bg-dark text-priority-high-text dark:text-priority-high-text-dark border border-priority-high-border dark:border-priority-high-border-dark"
      : section === "today"
        ? "bg-priority-medium-bg dark:bg-priority-medium-bg-dark text-priority-medium-text dark:text-priority-medium-text-dark border border-priority-medium-border dark:border-priority-medium-border-dark"
        : section === "completed"
          ? "bg-light-surface dark:bg-dark-surface text-light-text-muted dark:text-dark-text-muted border border-light-border dark:border-dark-border"
          : "bg-brand-primary/10 dark:bg-brand-secondary/10 text-brand-primary dark:text-brand-secondary border border-brand-primary/20 dark:border-brand-secondary/20";

  return (
    <article className="border border-light-border dark:border-dark-border rounded-2xl shadow-sm bg-light-bg dark:bg-dark-bg overflow-hidden transition-all hover:shadow-md hover:border-brand-primary dark:hover:border-brand-secondary h-full group">
      <button
        onClick={() => onOpen(task)}
        className="w-full p-5 text-left h-full flex flex-col"
      >
        <div className="space-y-3 flex-1">
          <div className="text-base sm:text-lg font-bold line-clamp-2 text-light-text-primary dark:text-dark-text-primary group-hover:text-brand-primary dark:group-hover:text-brand-secondary transition-colors">
            {task.title || "Untitled Task"}
          </div>

          <div className="text-sm space-y-1">
            <div className="font-medium text-light-text-secondary dark:text-dark-text-secondary">Status:</div>
            <div className={`text-base font-semibold ${statusClass}`}>{task.status}</div>
          </div>

          <div className="text-sm space-y-1">
            <div className="font-medium text-light-text-secondary dark:text-dark-text-secondary">Priority:</div>
            <div>
              {(() => {
                const n = Number(task?.priority);
                const b = priorityBucket(n);
                if (!Number.isFinite(n) || !b) {
                  return (
                    <span className="text-light-text-muted dark:text-dark-text-muted font-semibold">
                      None
                    </span>
                  );
                }
                const color =
                  b === "Low" ? priorityColors.Low :
                    b === "Medium" ? priorityColors.Medium :
                      priorityColors.High;
                return <span className={`font-semibold ${color}`}>{n} · {b}</span>;
              })()}
            </div>
          </div>
        </div>

        <div className={`mt-4 inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold ${chipColor}`}>
          {section === "today" ? "📅 Due Today" : "📅 Deadline"}: {deadlineStr}
        </div>
      </button>
    </article>
  );
}

function normalizeStatus(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "";
  if (s === "todo" || s === "to do") return "To Do";
  if (s === "inprogress" || s === "in progress") return "In Progress";
  if (s === "done" || s === "completed" || s === "complete") return "Done";
  return s.charAt(0).toUpperCase() + s.slice(1);
}