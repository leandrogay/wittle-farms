import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dayjs from "dayjs";
import { getManagerProjects, getProjectTasks } from "../services/api.js";
import TaskCard from "../components/ui/TaskCard.jsx";

// Modal component
function Modal({ open, onClose, title, children }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.activeElement;
    dialogRef.current?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        className="w-[min(90vw,740px)] rounded-2xl bg-white shadow-2xl outline-none"
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 id="modal-title" className="text-lg font-semibold">
            {title}
          </h2>
          <button
            className="rounded p-1 hover:bg-gray-100"
            aria-label="Close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        <div className="flex justify-end gap-2 border-t px-5 py-4">
          <button className="rounded-lg border px-3 py-2 text-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

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
        >
          {current?.name ?? "Choose project"}
          <span className={`transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
        </button>
      </div>

      {open && (
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

function SquareTaskTile({ task, onOpen }) {
  const deadline = task?.deadline ? dayjs(task.deadline).format("DD MMM YYYY") : "No deadline";

  return (
    <article className="border rounded-2xl shadow-sm bg-white overflow-hidden transition hover:shadow-md">
      <button
        type="button"
        onClick={() => onOpen(task)}
        className="w-full aspect-square p-4 flex flex-col justify-between text-left"
        aria-label={`Open task ${task?.title ?? ""}`}
      >
        <div className="space-y-2">
          <div className="text-base sm:text-lg font-semibold line-clamp-2 hover:underline">
            {task.title || "Untitled task"}
          </div>
          
          Status: <div
            className={`text-base sm:text-lg font-semibold line-clamp-2
              ${task.status === 'To Do' ? 'text-gray-500'
                : task.status === 'In Progress' ? 'text-blue-500'
                  : task.status === 'Completed' ? 'text-green-500'
                    : ''}`}
          >
            {task.status}
          </div>

          Priority: <div>
            {task.priority === 'Low' && <span className="text-green-600 font-semibold">Low</span>}
            {task.priority === 'Medium' && <span className="text-yellow-600 font-semibold">Medium</span>}
            {task.priority === 'High' && <span className="text-red-600 font-semibold">High</span>}
            {!['Low', 'Medium', 'High'].includes(task.priority) && <span className="text-gray-600 font-semibold">None</span>}
          </div>
          
        </div>

        <div className="mt-2">
          <span className="inline-flex items-center rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
            Deadline: {deadline}
          </span>
        </div>
      </button>
    </article>
  );
}

export default function TaskBoardMgr() {
  const [projects, setProjects] = useState([]);
  const [projLoading, setProjLoading] = useState(true);
  const [projError, setProjError] = useState(null);

  const [selectedProjectId, setSelectedProjectId] = useState(null);

  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState(null);

  const [activeTask, setActiveTask] = useState(null);

  // Load projects
  useEffect(() => {
    (async () => {
      try {
        const data = await getManagerProjects();
        setProjects(Array.isArray(data) ? data : []);
        if (Array.isArray(data) && data.length > 0) {
          setSelectedProjectId(data[0]._id);
        }
      } catch (err) {
        setProjError(err?.message || "Failed to load projects");
      } finally {
        setProjLoading(false);
      }
    })();
  }, []);

  // Load tasks when project changes
  useEffect(() => {
    if (!selectedProjectId) return;
    setTasksLoading(true);
    setTasksError(null);
    setActiveTask(null);

    (async () => {
      try {
        const data = await getProjectTasks(selectedProjectId);
        setTasks(Array.isArray(data) ? data : []);
      } catch (err) {
        setTasksError(err?.message || "Failed to load tasks");
      } finally {
        setTasksLoading(false);
      }
    })();
  }, [selectedProjectId]);

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const ad = a?.deadline ? new Date(a.deadline).getTime() : Infinity;
      const bd = b?.deadline ? new Date(b.deadline).getTime() : Infinity;
      return ad - bd;
    });
  }, [tasks]);

  if (projLoading) return <p className="p-4 text-gray-600">Loading projects…</p>;
  if (projError) return <p className="p-4 text-red-600">{projError}</p>;

  return (
    <section className="p-4 space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-semibold">Taskboard (Manager)</h1>
        <ProjectPicker
          projects={projects}
          valueId={selectedProjectId}
          onChange={setSelectedProjectId}
        />
      </header>

      {/* Tasks area */}
      {tasksLoading && <p className="text-gray-600">Loading tasks…</p>}
      {tasksError && <p className="text-red-600">{tasksError}</p>}

      {!tasksLoading && !tasksError && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedTasks.map((task) => (
            <SquareTaskTile key={task._id} task={task} onOpen={setActiveTask} />
          ))}
          {sortedTasks.length === 0 && (
            <p className="col-span-full text-gray-500">No tasks for this project.</p>
          )}
        </div>
      )}

      {/* Modal for active task */}
      <Modal
        open={!!activeTask}
        onClose={() => setActiveTask(null)}
        title={activeTask?.title || "Task details"}
      >
        {activeTask && (
          <div className="space-y-3">
            <TaskCard task={activeTask} />
            <div className="pt-2 flex flex-wrap gap-2">
              <button className="rounded-lg border px-3 py-2 text-sm">Edit</button>
              <button className="rounded-lg border px-3 py-2 text-sm">Move</button>
              <button className="rounded-lg border px-3 py-2 text-sm text-red-700 border-red-200 bg-red-50">
                Delete
              </button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}


