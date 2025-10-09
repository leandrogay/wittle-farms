import dayjs from "dayjs";

const priorityStyles = {
  Low: "bg-priority-low-bg dark:bg-priority-low-bg-dark text-priority-low-text dark:text-priority-low-text-dark ring-1 ring-priority-low-border dark:ring-priority-low-border-dark",
  Medium: "bg-priority-medium-bg dark:bg-priority-medium-bg-dark text-priority-medium-text dark:text-priority-medium-text-dark ring-1 ring-priority-medium-border dark:ring-priority-medium-border-dark",
  High: "bg-priority-high-bg dark:bg-priority-high-bg-dark text-priority-high-text dark:text-priority-high-text-dark ring-1 ring-priority-high-border dark:ring-priority-high-border-dark",
};

export default function MiniTaskCard({ task }) {
  const priority = task?.priority || "Low";
  const priorityClass = priorityStyles[priority] || priorityStyles.Low;
  
  const now = dayjs();
  const deadline = task?.deadline ? dayjs(task.deadline) : null;
  const isOverdue = deadline && now.isAfter(deadline, "day");
  const daysOverdue = isOverdue ? now.diff(deadline, "day") : 0;

  return (
    <div className={`shadow-md rounded-xl border m-5 p-5 bg-light-bg dark:bg-dark-bg transition-all hover:shadow-lg ${
      isOverdue 
        ? "border-danger ring-2 ring-danger/20" 
        : "border-light-border dark:border-dark-border"
    }`}>
      <h2 className="text-xl font-bold text-light-text-primary dark:text-dark-text-primary">
        {task.title}
      </h2>
      <p className="mt-2 text-light-text-secondary dark:text-dark-text-secondary">
        {task.description || "No description provided"}
      </p>
      
      <div className="flex flex-wrap gap-2 mt-3 items-center">
        <span className={`px-3 py-1 rounded-full font-semibold text-sm ${priorityClass}`}>
          {priority}
        </span>
        
        {deadline && (
          <span className={`px-3 py-1 rounded-full font-medium text-sm ${
            isOverdue
              ? "bg-priority-high-bg dark:bg-priority-high-bg-dark text-priority-high-text dark:text-priority-high-text-dark ring-1 ring-priority-high-border dark:ring-priority-high-border-dark"
              : "bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary ring-1 ring-light-border dark:ring-dark-border"
          }`}>
            {isOverdue ? "⚠️ " : "📅 "}
            {dayjs(task.deadline).format('MMM D, YYYY h:mm A')}
          </span>
        )}
        
        {isOverdue && (
          <span className="px-3 py-1 rounded-full bg-danger text-white font-bold text-xs">
            {daysOverdue} {daysOverdue === 1 ? "day" : "days"} overdue
          </span>
        )}
      </div>
      
      {task.status && (
        <div className="mt-3">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            task.status === "Done" 
              ? "bg-success/10 text-success ring-1 ring-success/20" 
              : task.status === "In Progress"
              ? "bg-info/10 text-info ring-1 ring-info/20"
              : "bg-light-surface dark:bg-dark-surface text-light-text-secondary dark:text-dark-text-secondary ring-1 ring-light-border dark:ring-dark-border"
          }`}>
            {task.status}
          </span>
        </div>
      )}
    </div>
  );
}