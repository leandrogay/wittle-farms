import dayjs from "dayjs";

export default function ProjectCard({ project, onOpen }) {
  const deadline = project?.deadline ? dayjs(project.deadline) : null;
  const now = dayjs();
  const isOverdue = deadline && now.isAfter(deadline, "day");
  const daysUntilDeadline = deadline ? deadline.diff(now, "day") : null;
  
  const deadlineText = deadline
    ? deadline.format("DD MMM YYYY")
    : "No deadline";

  const teamSize = Array.isArray(project?.teamMembers) ? project.teamMembers.length : 0;

  const chipColor = isOverdue
    ? "bg-priority-high-bg dark:bg-priority-high-bg-dark text-priority-high-text dark:text-priority-high-text-dark border border-priority-high-border dark:border-priority-high-border-dark"
    : daysUntilDeadline !== null && daysUntilDeadline <= 7 && daysUntilDeadline >= 0
    ? "bg-priority-medium-bg dark:bg-priority-medium-bg-dark text-priority-medium-text dark:text-priority-medium-text-dark border border-priority-medium-border dark:border-priority-medium-border-dark"
    : "bg-brand-primary/10 dark:bg-brand-secondary/10 text-brand-primary dark:text-brand-secondary border border-brand-primary/20 dark:border-brand-secondary/20";

  return (
    <article className="border border-light-border dark:border-dark-border rounded-2xl shadow-sm bg-light-bg dark:bg-dark-bg overflow-hidden transition-all hover:shadow-md hover:border-brand-primary dark:hover:border-brand-secondary h-full group">
      <button 
        onClick={() => onOpen(project)} 
        className="w-full p-5 text-left h-full flex flex-col"
      >
        <div className="space-y-3 flex-1">
          {/* Project Title */}
          <div className="text-base sm:text-lg font-bold line-clamp-2 text-light-text-primary dark:text-dark-text-primary group-hover:text-brand-primary dark:group-hover:text-brand-secondary transition-colors">
            {project?.name || "Untitled Project"}
          </div>

          {/* Description */}
          {project?.description && (
            <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary line-clamp-2">
              {project.description}
            </div>
          )}

          {/* Department */}
          {project?.department && (
            <div className="text-sm space-y-1">
              <div className="font-medium text-light-text-secondary dark:text-dark-text-secondary">
                Department:
              </div>
              <div className="text-base font-semibold text-brand-primary dark:text-brand-secondary">
                {project.department}
              </div>
            </div>
          )}

          {/* Team Size */}
          <div className="flex items-center gap-2 text-sm text-light-text-secondary dark:text-dark-text-secondary">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              className="h-4 w-4"
            >
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" strokeWidth="1.5" />
              <circle cx="9" cy="7" r="4" strokeWidth="1.5" />
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" strokeWidth="1.5" />
            </svg>
            <span className="font-medium">
              {teamSize} {teamSize === 1 ? "member" : "members"}
            </span>
          </div>
        </div>

        {/* Deadline Chip */}
        <div className={`mt-4 inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold ${chipColor}`}>
          {isOverdue && "⚠️ "}
          {daysUntilDeadline !== null && daysUntilDeadline >= 0 && daysUntilDeadline <= 7 && "📅 "}
          {!isOverdue && (daysUntilDeadline === null || daysUntilDeadline > 7) && "📅 "}
          Deadline: {deadlineText}
          {isOverdue && (
            <span className="ml-1">
              ({Math.abs(daysUntilDeadline)} {Math.abs(daysUntilDeadline) === 1 ? "day" : "days"} overdue)
            </span>
          )}
        </div>
      </button>
    </article>
  );
}