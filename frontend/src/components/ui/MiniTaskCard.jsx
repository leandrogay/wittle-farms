import dayjs from "dayjs";
import React from "react";

const PRIORITY = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

const STATUS = {
  DONE: "Done",
  IN_PROGRESS: "In Progress",
  OTHER: "Other",
};

const DATE_FORMAT = "MMM D, YYYY h:mm A";

const PRIORITY_STYLES = {
  [PRIORITY.LOW]:
    "bg-priority-low-bg dark:bg-priority-low-bg-dark text-priority-low-text dark:text-priority-low-text-dark ring-1 ring-priority-low-border dark:ring-priority-low-border-dark",
  [PRIORITY.MEDIUM]:
    "bg-priority-medium-bg dark:bg-priority-medium-bg-dark text-priority-medium-text dark:text-priority-medium-text-dark ring-1 ring-priority-medium-border dark:ring-priority-medium-border-dark",
  [PRIORITY.HIGH]:
    "bg-priority-high-bg dark:bg-priority-high-bg-dark text-priority-high-text dark:text-priority-high-text-dark ring-1 ring-priority-high-border dark:ring-priority-high-border-dark",
};

const STATUS_CHIP = {
  [STATUS.DONE]: "bg-success/10 text-success ring-1 ring-success/20",
  [STATUS.IN_PROGRESS]: "bg-info/10 text-info ring-1 ring-info/20",
  [STATUS.OTHER]:
    "bg-light-surface dark:bg-dark-surface text-light-text-secondary dark:text-dark-text-secondary ring-1 ring-light-border dark:ring-dark-border",
};

const OVERDUE_CHIP =
  "bg-priority-high-bg dark:bg-priority-high-bg-dark text-priority-high-text dark:text-priority-high-text-dark ring-1 ring-priority-high-border dark:ring-priority-high-border-dark";
const ONTIME_CHIP =
  "bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary ring-1 ring-light-border dark:ring-dark-border";

const _getOverdueInfo = (now, deadline) => {
  if (!deadline) {
    return { isOverdue: false, daysOverdue: 0 };
  }
  const isOverdue = now.isAfter(deadline, "day");
  const daysOverdue = isOverdue ? now.diff(deadline, "day") : 0;
  return { isOverdue, daysOverdue };
};

const MiniTaskCard = ({ task = {} }) => {
  const priority = task.priority ?? PRIORITY.LOW;
  const priorityClass = PRIORITY_STYLES[priority] ?? PRIORITY_STYLES[PRIORITY.LOW];

  const now = dayjs();
  const deadline = task.deadline ? dayjs(task.deadline) : null;
  const { isOverdue, daysOverdue } = _getOverdueInfo(now, deadline);

  const statusKey =
    task.status === STATUS.DONE
      ? STATUS.DONE
      : task.status === STATUS.IN_PROGRESS
      ? STATUS.IN_PROGRESS
      : STATUS.OTHER;

  return (
    <div
      className={`shadow-md rounded-xl border m-5 p-5 bg-light-bg dark:bg-dark-bg transition-all hover:shadow-lg ${
        isOverdue ? "border-danger ring-2 ring-danger/20" : "border-light-border dark:border-dark-border"
      }`}
    >
      <h2 className="text-xl font-bold text-light-text-primary dark:text-dark-text-primary">{task.title}</h2>
      <p className="mt-2 text-light-text-secondary dark:text-dark-text-secondary">
        {task.description ?? "No description provided"}
      </p>

      <div className="flex flex-wrap gap-2 mt-3 items-center">
        <span className={`px-3 py-1 rounded-full font-semibold text-sm ${priorityClass}`}>{priority}</span>

        {deadline ? (
          <span className={`px-3 py-1 rounded-full font-medium text-sm ${isOverdue ? OVERDUE_CHIP : ONTIME_CHIP}`}>
            {isOverdue ? "⚠️ " : "📅 "}
            {dayjs(task.deadline).format(DATE_FORMAT)}
          </span>
        ) : null}

        {isOverdue ? (
          <span className="px-3 py-1 rounded-full bg-danger text-white font-bold text-xs">
            {daysOverdue} {daysOverdue === 1 ? "day" : "days"} overdue
          </span>
        ) : null}
      </div>

      {task.status ? (
        <div className="mt-3">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_CHIP[statusKey]}`}>
            {task.status}
          </span>
        </div>
      ) : null}
    </div>
  );
};

export { MiniTaskCard, PRIORITY, STATUS, DATE_FORMAT };