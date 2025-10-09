import dayjs from "dayjs";
import TaskFormButton from "./TaskFormButton";
import DeleteTaskButton from "./DeleteTaskButton";

const priorityStyles = {
  Low: "bg-priority-low-bg dark:bg-priority-low-bg-dark text-priority-low-text dark:text-priority-low-text-dark ring-1 ring-priority-low-border dark:ring-priority-low-border-dark",
  Medium:
    "bg-priority-medium-bg dark:bg-priority-medium-bg-dark text-priority-medium-text dark:text-priority-medium-text-dark ring-1 ring-priority-medium-border dark:ring-priority-medium-border-dark",
  High: "bg-priority-high-bg dark:bg-priority-high-bg-dark text-priority-high-text dark:text-priority-high-text-dark ring-1 ring-priority-high-border dark:ring-priority-high-border-dark",
};

function Badge({ children, className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${className}`}
    >
      {children}
    </span>
  );
}

function FieldRow({ label, children }) {
  return (
    <p className="mt-1 leading-relaxed">
      <span className="font-medium text-light-text-secondary dark:text-dark-text-secondary">
        {label}:{" "}
      </span>
      <span className="text-light-text-primary dark:text-dark-text-primary">
        {children}
      </span>
    </p>
  );
}

export default function TaskCard({ task, onTaskUpdated, onTaskDeleted }) {
  const priority = task?.priority || "No priority";
  const pClass =
    priorityStyles[priority] ||
    "bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary ring-1 ring-light-border dark:ring-dark-border";

  const now = dayjs();
  const deadline = task?.deadline ? dayjs(task.deadline) : null;
  const isOverdue = deadline && now.isAfter(deadline, "day");
  const daysOverdue = isOverdue ? now.diff(deadline, "day") : 0;

  const deadlineText = deadline
    ? dayjs(task.deadline).format("dddd, MMMM D, YYYY h:mm A")
    : null;

  return (
    <article
      className={`rounded-2xl border p-6 shadow-sm bg-light-bg dark:bg-dark-bg ${
        isOverdue
          ? "border-danger ring-2 ring-danger/20"
          : "border-light-border dark:border-dark-border"
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
          <span className="sr-only">Priority:</span>
          <span className="text-sm font-bold">{priority}</span>
        </Badge>
        {deadlineText && (
          <Badge
            className={`${
              isOverdue
                ? "bg-priority-high-bg dark:bg-priority-high-bg-dark text-priority-high-text dark:text-priority-high-text-dark ring-1 ring-priority-high-border dark:ring-priority-high-border-dark"
                : "bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary ring-1 ring-light-border dark:ring-dark-border"
            }`}
          >
            {" "}
            <span className="font-semibold">Deadline:</span>{" "}
            <span className="font-medium">{deadlineText}</span>{" "}
            {isOverdue && (
              <span className="ml-2 text-sm font-bold text-danger">
                {" "}
                {daysOverdue} {daysOverdue === 1 ? "day" : "days"} overdue{" "}
              </span>
            )}{" "}
          </Badge>
        )}{" "}
      </div>{" "}
      {isOverdue && (
        <div className="mt-3 rounded-lg bg-priority-high-bg dark:bg-priority-high-bg-dark border border-priority-high-border dark:border-priority-high-border-dark px-4 py-2 text-sm text-priority-high-text dark:text-priority-high-text-dark font-semibold">
          Task overdue by {daysOverdue} {daysOverdue === 1 ? "day" : "days"}.
        </div>
      )}
      <div className="mt-5 rounded-xl bg-brand-primary/5 dark:bg-brand-secondary/5 ring-1 ring-brand-primary/10 dark:ring-brand-secondary/10">
        <div className="px-4 py-2 text-sm font-semibold text-light-text-primary dark:text-dark-text-primary">
          Team Members
        </div>
        <ul className="px-4 pb-3 text-light-text-primary dark:text-dark-text-primary">
          {(task?.assignedTeamMembers ?? []).length > 0 ? (
            (task.assignedTeamMembers ?? []).map((tm) => (
              <li key={tm?._id} className="py-1">
                {tm?.name ?? "Unknown"}
              </li>
            ))
          ) : (
            <li className="py-1 text-light-text-muted dark:text-dark-text-muted">
              —
            </li>
          )}
        </ul>
      </div>
      <div className="mt-5 space-y-1 text-sm text-light-text-secondary dark:text-dark-text-secondary">
        {task?.updatedAt && (
          <p>
            <span className="font-medium text-light-text-primary dark:text-dark-text-primary">
              Updated at:
            </span>{" "}
            {dayjs(task.updatedAt).format("dddd, MMMM D, YYYY h:mm A")}
          </p>
        )}
        {task?.createdAt && (
          <p>
            <span className="font-medium text-light-text-primary dark:text-dark-text-primary">
              Created at:
            </span>{" "}
            {dayjs(task.createdAt).format("dddd, MMMM D, YYYY h:mm A")}
          </p>
        )}
        <p>
          <span className="font-medium text-light-text-primary dark:text-dark-text-primary">
            Created by:
          </span>{" "}
          {task?.createdBy?.name ?? "—"}
        </p>
      </div>
      <div className="mt-4 flex flex-wrap gap-3 justify-end">
        <TaskFormButton task={task} onTaskUpdated={onTaskUpdated}>
          Edit Task
        </TaskFormButton>
        <DeleteTaskButton task={task} onTaskDeleted={onTaskDeleted}>
          Delete Task
        </DeleteTaskButton>
      </div>
    </article>
  );
}
