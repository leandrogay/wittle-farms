import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { getTasks } from "../services/api.js";
import TaskCard from "../components/ui/TaskCard.jsx";
import TaskForm from "../components/ui/TaskForm.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function Tasks() {
  const { user } = useAuth();

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showCreate, setShowCreate] = useState(false);
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
      const ad = a?.deadline ? new Date(a.deadline).getTime() : Infinity;
      const bd = b?.deadline ? new Date(b.deadline).getTime() : Infinity;
      return ad - bd;
    });
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const statusOK = (st) => statusFilter === "All" || normalizeStatus(st) === statusFilter;
    const priorityOK = (pr) => priorityFilter === "All" || (pr ?? "None") === priorityFilter;
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
  }, [filteredTasks]);

  const statusOptions = ["All", "To Do", "In Progress", "Done"];
  const priorityOptions = ["All", "Low", "Medium", "High", "None"];

  if (loading) return <p className="p-4 text-gray-600">Loading tasks…</p>;
  if (error) return <p className="p-4 text-red-600">{error}</p>;

  return (
    <section className="p-4 space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">My Tasks</h1>

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
      </header>

      {tasks.length === 0 && (
        <div className="rounded-lg border bg-amber-50 text-amber-900 p-4">
          You currently have no tasks assigned.
        </div>
      )}

      <div className="space-y-8">
        {overdue.length > 0 && (
          <>
            <h2 className="text-lg font-semibold text-red-700">Overdue</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {overdue.map((t) => (
                <SquareTaskTile key={t._id} task={t} onOpen={setActiveTask} section="overdue" />
              ))}
            </div>
          </>
        )}

        {todayDue.length > 0 && (
          <>
            <h2 className="text-lg font-semibold text-amber-700">Due Today</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {todayDue.map((t) => (
                <SquareTaskTile key={t._id} task={t} onOpen={setActiveTask} section="today" />
              ))}
            </div>
          </>
        )}

        <h2 className="text-lg font-semibold">Upcoming</h2>
        {upcoming.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {upcoming.map((t) => (
              <SquareTaskTile key={t._id} task={t} onOpen={setActiveTask} section="upcoming" />
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No upcoming tasks.</p>
        )}

        {completed.length > 0 && (
          <>
            <h2 className="text-lg font-semibold text-green-700">Completed</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {completed.map((t) => (
                <SquareTaskTile key={t._id} task={t} onOpen={setActiveTask} section="completed" />
              ))}
            </div>
          </>
        )}
      </div>

      {activeTask && (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-black/50"
          onMouseDown={(e) => e.target === e.currentTarget && setActiveTask(null)}
        >
          <div className="w-[min(90vw,740px)] rounded-2xl bg-white shadow-2xl p-4">
            <h2 className="text-lg font-semibold mb-3">{activeTask?.title || "Task details"}</h2>
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
    status === "To Do" ? "text-gray-500"
      : status === "In Progress" ? "text-blue-500"
      : status === "Done" ? "text-green-500"
      : "";

  const chipColor =
    section === "overdue" ? "bg-red-50 text-red-700"
      : section === "today" ? "bg-amber-50 text-amber-700"
      : section === "completed" ? "bg-gray-100 text-gray-700"
      : "bg-blue-50 text-blue-700";

  return (
    <article className="border rounded-2xl shadow-sm bg-white overflow-hidden transition hover:shadow-md h-full">
      <button onClick={() => onOpen(task)} className="w-full p-4 text-left h-full">
        <div className="space-y-2">
          <div className="text-base sm:text-lg font-semibold line-clamp-2 hover:underline">
            {task.title || "Untitled Task"}
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

        <div className={`mt-2 inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium ${chipColor}`}>
          {section === "today" ? "Due Today" : "Deadline"}: {deadlineStr}
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
