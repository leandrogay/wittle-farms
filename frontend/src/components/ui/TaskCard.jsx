import dayjs from "dayjs";
import TaskFormButton from "./TaskFormButton";
import DeleteTaskButton from "./DeleteTaskButton";
import { useState } from "react";
import TaskComments from "./TaskComments";

const priorityStyles = {
  Low: "bg-priority-low-bg dark:bg-priority-low-bg-dark text-priority-low-text dark:text-priority-low-text-dark ring-1 ring-priority-low-border dark:ring-priority-low-border-dark",
  Medium:
    "bg-priority-medium-bg dark:bg-priority-medium-bg-dark text-priority-medium-text dark:text-priority-medium-text-dark ring-1 ring-priority-medium-border dark:ring-priority-medium-border-dark",
  High: "bg-priority-high-bg dark:bg-priority-high-bg-dark text-priority-high-text dark:text-priority-high-text-dark ring-1 ring-priority-high-border dark:ring-priority-high-border-dark",
};

function getPriorityBucket(p) {
  const n = Math.trunc(Number(p));
  if (!Number.isFinite(n)) return null;
  if (n <= 3) return "Low";
  if (n <= 7) return "Medium";
  return "High";
}

const MINUTES = { minute: 1, hour: 60, day: 1440 };
// default system reminders: 7d, 3d, 1d (in minutes)
const DEFAULT_TRIPLET = [10080, 4320, 1440];

function Badge({ children, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${className}`}>
      {children}
    </span>
  );
}

function FieldRow({ label, children }) {
  return (
    <p className="mt-1 leading-relaxed">
      <span className="font-medium text-light-text-secondary dark:text-dark-text-secondary">{label}: </span>
      <span className="text-light-text-primary dark:text-dark-text-primary">{children}</span>
    </p>
  );
}

function labelFromMinutes(m) {
  if (m % MINUTES.day === 0) return `${m / MINUTES.day} day(s) before`;
  if (m % MINUTES.hour === 0) return `${m / MINUTES.hour} hour(s) before`;
  return `${m} minute(s) before`;
}

export default function TaskCard({ task, onTaskUpdated, onTaskDeleted, currentUser }) {
  const priorityValue = Number(task?.priority);
  const priorityBucket = getPriorityBucket(priorityValue);
  const pClass = priorityBucket
    ? priorityStyles[priorityBucket]
    : "bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary ring-1 ring-light-border dark:ring-dark-border";

  const now = dayjs();
  const deadline = task?.deadline ? dayjs(task.deadline) : null;
  const isOverdue = deadline && now.isAfter(deadline, "day");
  const daysOverdue = isOverdue ? now.diff(deadline, "day") : 0;

  const deadlineText = deadline ? deadline.format("dddd, MMMM D, YYYY h:mm A") : null;

  // Normalize what came from the API
  const rawOffsets = Array.isArray(task?.reminderOffsets)
    ? task.reminderOffsets
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => b - a)
    : [];

  // If there IS a deadline and NO custom reminders, show the system defaults (7/3/1)
  const effectiveOffsets = deadline ? (rawOffsets.length ? rawOffsets : DEFAULT_TRIPLET) : rawOffsets;

  const computedReminders =
    deadline && effectiveOffsets.length > 0
      ? effectiveOffsets.map((m) => ({
        minutes: m,
        label: labelFromMinutes(m),
        when: deadline.subtract(m, "minute"),
      }))
      : [];

  // const { currentUser } = useAuth();
  const [showComments, setShowComments] = useState(false);

  return (
    <article
      className={`rounded-2xl border p-6 shadow-sm bg-light-bg dark:bg-dark-bg ${isOverdue ? "border-danger ring-2 ring-danger/20" : "border-light-border dark:border-dark-border"
        }`}
    >
      <p className="text-sm font-medium text-light-text-muted dark:text-dark-text-muted">
        Project: {task?.assignedProject?.name ?? "—"}
      </p>
      <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-light-text-primary dark:text-dark-text-primary">
        Title: {task?.title ?? "Untitled"}
      </h2>

      <FieldRow label="Description">{task?.description ?? "—"}</FieldRow>
      <FieldRow label="Notes">{task?.notes ?? "—"}</FieldRow>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Badge className={pClass}> 
          {Number.isFinite(priorityValue) ? (
            <>
             <span className="text-sm font-bold">{priorityValue}</span>
              <span className="text-sm font-medium"> · {priorityBucket}</span>
            </>
          ) : (
            <span className="text-sm font-medium">No priority</span>
          )}
        </Badge>

        {deadlineText && (
          <Badge
            className={`${isOverdue
              ? "bg-priority-high-bg dark:bg-priority-high-bg-dark text-priority-high-text dark:text-priority-high-text-dark ring-1 ring-priority-high-border dark:ring-priority-high-border-dark"
              : "bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary ring-1 ring-light-border dark:ring-dark-border"
              }`}
          >
            <span className="font-semibold">Deadline:</span>{" "}
            <span className="font-medium">{deadlineText}</span>
            {isOverdue && (
              <span className="ml-2 text-sm font-bold text-danger">
                {daysOverdue} {daysOverdue === 1 ? "day" : "days"} overdue
              </span>
            )}
          </Badge>
        )}
      </div>

      {/* Reminders */}
      <div className="mt-4 rounded-xl bg-light-surface dark:bg-dark-surface ring-1 ring-light-border dark:ring-dark-border">
        <div className="px-4 py-2 text-sm font-semibold text-light-text-primary dark:text-dark-text-primary">Reminders</div>
        <div className="px-4 pb-3">
          {!deadline ? (
            rawOffsets.length > 0 ? (
              <ul className="space-y-1 text-light-text-primary dark:text-dark-text-primary">
                {rawOffsets.map((m, i) => (
                  <li key={`${m}-${i}`} className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs ring-1 ring-light-border dark:ring-dark-border bg-brand-primary/10 dark:bg-brand-secondary/10 text-brand-primary dark:text-brand-secondary">
                      {labelFromMinutes(m)}
                    </span>
                    <span className="text-xs text-light-text-muted dark:text-dark-text-muted">
                      (inactive until a deadline is set)
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-light-text-muted dark:text-dark-text-muted">— (No deadline)</p>
            )
          ) : computedReminders.length > 0 ? (
            <ul className="space-y-1 text-light-text-primary dark:text-dark-text-primary">
              {computedReminders.map(({ minutes, label, when }) => (
                <li key={minutes} className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs ring-1 ring-light-border dark:ring-dark-border bg-brand-primary/10 dark:bg-brand-secondary/10 text-brand-primary dark:text-brand-secondary">
                    {label}
                  </span>
                  <span className="text-sm">→ {when.format("ddd, MMM D, YYYY h:mm A")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-light-text-muted dark:text-dark-text-muted">— (No reminders)</p>
          )}
        </div>
      </div>

      {/* Team members */}
      <div className="mt-5 rounded-xl bg-brand-primary/5 dark:bg-brand-secondary/5 ring-1 ring-brand-primary/10 dark:ring-brand-secondary/10">
        <div className="px-4 py-2 text-sm font-semibold text-light-text-primary dark:text-dark-text-primary">Team Members</div>
        <ul className="px-4 pb-3 text-light-text-primary dark:text-dark-text-primary">
          {(task?.assignedTeamMembers ?? []).length > 0 ? (
            (task.assignedTeamMembers ?? []).map((tm) => (
              <li key={tm?._id} className="py-1">
                {tm?.name ?? "Unknown"}
              </li>
            ))
          ) : (
            <li className="py-1 text-light-text-muted dark:text-dark-text-muted">—</li>
          )}
        </ul>
      </div>

      {/* Meta */}
      <div className="mt-5 space-y-1 text-sm text-light-text-secondary dark:text-dark-text-secondary">
        {task?.updatedAt && (
          <p>
            <span className="font-medium text-light-text-primary dark:text-dark-text-primary">Updated at:</span>{" "}
            {dayjs(task.updatedAt).format("dddd, MMMM D, YYYY h:mm A")}
          </p>
        )}
        {task?.createdAt && (
          <p>
            <span className="font-medium text-light-text-primary dark:text-dark-text-primary">Created at:</span>{" "}
            {dayjs(task.createdAt).format("dddd, MMMM D, YYYY h:mm A")}
          </p>
        )}
        <p>
          <span className="font-medium text-light-text-primary dark:text-dark-text-primary">Created by:</span>{" "}
          {task?.createdBy?.name ?? "—"}
        </p>
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-3 justify-end">
        {/* Toggle comments */}
        <button
          type="button"
          onClick={() => setShowComments((v) => !v)}
          className="rounded-xl border px-3 py-2 text-sm font-semibold
                     bg-light-bg dark:bg-dark-bg
                     text-light-text-primary dark:text-dark-text-primary
                     ring-1 ring-light-border dark:ring-dark-border hover:opacity-90"
          aria-expanded={showComments}
        >
          {showComments ? "Hide comments" : "Show comments"}
        </button>
        <TaskFormButton task={task} onTaskUpdated={onTaskUpdated}>
          Edit Task
        </TaskFormButton>
        <DeleteTaskButton task={task} onTaskDeleted={onTaskDeleted}>
          Delete Task
        </DeleteTaskButton>
      </div>

      {/* Comments */}
      {showComments && (
        <section className="mt-6">
          <h3 className="mb-2 text-lg font-semibold text-light-text-primary dark:text-dark-text-primary">
            Comments
          </h3>
          <div className="rounded-2xl border p-3 bg-light-surface dark:bg-dark-surface ring-1 ring-light-border dark:ring-dark-border">
            <TaskComments taskId={task?._id} currentUser={currentUser} />
          </div>
        </section>
      )}
    </article>
  );
}
