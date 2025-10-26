import React from "react";
import dayjs from "dayjs";

const DEADLINE_FORMAT = "DD MMM YYYY";

const CARD_CLS =
  "border border-light-border dark:border-dark-border rounded-2xl shadow-sm bg-light-bg dark:bg-dark-bg overflow-hidden transition-all hover:shadow-md hover:border-brand-primary dark:hover:border-brand-secondary h-full group";
const ITEM_BTN_CLS = "w-full p-5 text-left h-full flex flex-col";
const TITLE_CLS =
  "text-base sm:text-lg font-bold line-clamp-2 text-light-text-primary dark:text-dark-text-primary group-hover:text-brand-primary dark:group-hover:text-brand-secondary transition-colors";
const DESC_CLS = "text-sm text-light-text-secondary dark:text-dark-text-secondary line-clamp-2";
const DEPT_LABEL_CLS = "font-medium text-light-text-secondary dark:text-dark-text-secondary";
const DEPT_VALUE_CLS = "text-base font-semibold text-brand-primary dark:text-brand-secondary";
const TEAM_ROW_CLS =
  "flex items-center gap-2 text-sm text-light-text-secondary dark:text-dark-text-secondary";

const CHIP_OVERDUE =
  "bg-priority-high-bg dark:bg-priority-high-bg-dark text-priority-high-text dark:text-priority-high-text-dark border border-priority-high-border dark:border-priority-high-border-dark";
const CHIP_SOON =
  "bg-priority-medium-bg dark:bg-priority-medium-bg-dark text-priority-medium-text dark:text-priority-medium-text-dark border border-priority-medium-border dark:border-priority-medium-border-dark";
const CHIP_OK =
  "bg-brand-primary/10 dark:bg-brand-secondary/10 text-brand-primary dark:text-brand-secondary border border-brand-primary/20 dark:border-brand-secondary/20";

const _getDepartmentDisplay = (dept) => {
  if (!dept) return null;
  if (Array.isArray(dept)) return dept.map((d) => d?.name || d).filter(Boolean).join(", ");
  return dept?.name || dept;
};

const ProjectCard = ({ project, onOpen }) => {
  const deadline = project?.deadline ? dayjs(project.deadline) : null;
  const now = dayjs();
  const isOverdue = Boolean(deadline && now.isAfter(deadline, "day"));
  const daysUntilDeadline = deadline ? deadline.diff(now, "day") : null;
  const deadlineText = deadline ? deadline.format(DEADLINE_FORMAT) : "No deadline";

  const teamSize = Array.isArray(project?.teamMembers) ? project.teamMembers.length : 0;
  const departmentDisplay = _getDepartmentDisplay(project?.department);

  const chipColor = isOverdue
    ? CHIP_OVERDUE
    : daysUntilDeadline !== null && daysUntilDeadline <= 7 && daysUntilDeadline >= 0
    ? CHIP_SOON
    : CHIP_OK;

  return (
    <article className={CARD_CLS}>
      <button onClick={() => onOpen(project)} className={ITEM_BTN_CLS} aria-label={`Open project: ${project?.name || "Untitled Project"}`}>
        <div className="space-y-3 flex-1">
          <div className={TITLE_CLS}>{project?.name || "Untitled Project"}</div>

          {project?.description ? <div className={DESC_CLS}>{project.description}</div> : null}

          {departmentDisplay ? (
            <div className="text-sm space-y-1">
              <div className={DEPT_LABEL_CLS}>Department:</div>
              <div className={DEPT_VALUE_CLS}>{departmentDisplay}</div>
            </div>
          ) : null}

          <div className={TEAM_ROW_CLS}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4" aria-hidden="true">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" strokeWidth="1.5" />
              <circle cx="9" cy="7" r="4" strokeWidth="1.5" />
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" strokeWidth="1.5" />
            </svg>
            <span className="font-medium">
              {teamSize} {teamSize === 1 ? "member" : "members"}
            </span>
          </div>
        </div>

        <div className={`mt-4 inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold ${chipColor}`}>
          {isOverdue ? "⚠️ " : "📅 "}Deadline: {deadlineText}
          {isOverdue && (
            <span className="ml-1">
              ({Math.abs(daysUntilDeadline)} {Math.abs(daysUntilDeadline) === 1 ? "day" : "days"} overdue)
            </span>
          )}
        </div>
      </button>
    </article>
  );
};

export { ProjectCard, DEADLINE_FORMAT };
