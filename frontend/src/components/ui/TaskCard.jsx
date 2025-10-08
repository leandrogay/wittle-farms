import dayjs from "dayjs";
import TaskFormButton from "./TaskFormButton";
import DeleteTaskButton from "./DeleteTaskButton";

const priorityStyles = {
  Low: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
  Medium: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  High: "bg-red-50 text-red-800 ring-1 ring-red-200",
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
      <span className="font-medium text-gray-700">{label}: </span>
      <span className="text-gray-800">{children}</span>
    </p>
  );
}

export default function TaskCard({ task, onTaskUpdated, onTaskDeleted }) {
  const priority = task?.priority || "No priority";
  const pClass = priorityStyles[priority] || "bg-gray-50 text-gray-700 ring-1 ring-gray-200";

  const now = dayjs();
  const deadline = task?.deadline ? dayjs(task.deadline) : null;
  const isOverdue = deadline && now.isAfter(deadline, "day");
  const daysOverdue = isOverdue ? now.diff(deadline, "day") : 0;

  const deadlineText = deadline
    ? dayjs(task.deadline).format("dddd, MMMM D, YYYY h:mm A")
    : null;

  return (
    <article
      className={`rounded-2xl border p-6 shadow-sm bg-white ${
        isOverdue ? "border-red-400 ring-2 ring-red-200" : "border-gray-200"
      }`}
    >
      <p className="text-sm font-medium text-gray-400">
        Project: {task?.assignedProject?.name ?? "—"}
      </p>
      <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-gray-900">
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
                ? "bg-red-100 text-red-800 ring-1 ring-red-200"
                : "bg-gray-100 text-gray-700 ring-1 ring-gray-200"
            }`}
          >
            <span className="font-semibold">Deadline:</span>
            <span className="font-medium">{deadlineText}</span>
            {isOverdue && (
              <span className="ml-2 text-sm font-bold text-red-700">
                {daysOverdue} {daysOverdue === 1 ? "day" : "days"} overdue
              </span>
            )}
          </Badge>
        )}
      </div>

      {isOverdue && (
        <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-800 font-semibold">
          Task overdue by {daysOverdue} {daysOverdue === 1 ? "day" : "days"}.
        </div>
      )}

      <div className="mt-5 rounded-xl bg-blue-50 ring-1 ring-blue-100">
        <div className="px-4 py-2 text-sm font-semibold text-blue-900/80">
          Team Members
        </div>
        <ul className="px-4 pb-3 text-gray-800">
          {(task?.assignedTeamMembers ?? []).length > 0 ? (
            (task.assignedTeamMembers ?? []).map((tm) => (
              <li key={tm?._id} className="py-1">
                {tm?.name ?? "Unknown"}
              </li>
            ))
          ) : (
            <li className="py-1 text-gray-500">—</li>
          )}
        </ul>
      </div>

      <div className="mt-5 space-y-1 text-sm text-gray-600">
        {task?.updatedAt && (
          <p>
            <span className="font-medium text-gray-700">Updated at:</span>{" "}
            {dayjs(task.updatedAt).format("dddd, MMMM D, YYYY h:mm A")}
          </p>
        )}
        {task?.createdAt && (
          <p>
            <span className="font-medium text-gray-700">Created at:</span>{" "}
            {dayjs(task.createdAt).format("dddd, MMMM D, YYYY h:mm A")}
          </p>
        )}
        <p>
          <span className="font-medium text-gray-700">Created by:</span>{" "}
          {task?.createdBy?.name ?? "—"}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
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
