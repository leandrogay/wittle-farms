import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { getTasks, getProjects, getManagerProjects } from "../services/api.js";
import dayjs from "dayjs";

/* SVG Icons */
function ReportIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path d="M9 17h6M9 13h6M9 9h1M4 5h16a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V7a2 2 0 012-2z" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function DownloadIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path d="M20 6L9 17l-5-5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClockIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
      <path d="M12 6v6l4 2" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/* Reusable Components */
// eslint-disable-next-line no-unused-vars
function MetricCard({ icon: Icon, label, value, color = "brand" }) {
  const colorClasses = {
    brand: "bg-brand-primary/10 dark:bg-brand-secondary/10 text-brand-primary dark:text-brand-secondary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    danger: "bg-danger/10 text-danger",
    info: "bg-info/10 text-info"
  };

  return (
    <div className="rounded-2xl border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-3 ${colorClasses[color]}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <p className="text-2xl font-bold text-light-text-primary dark:text-dark-text-primary">
            {value}
          </p>
          <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
            {label}
          </p>
        </div>
      </div>
    </div>
  );
}
// eslint-disable-next-line no-unused-vars
function StaffReport({ userId, reportData, reportRef }) {
  // eslint-disable-next-line no-unused-vars
  const { tasks, projects } = reportData;

  const metrics = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === "Done").length;
    const inProgress = tasks.filter(t => t.status === "In Progress").length;
    const todo = tasks.filter(t => t.status === "To Do").length;

    const now = dayjs();
    const overdue = tasks.filter(t => {
      if (!t.deadline || t.status === "Done") return false;
      return now.isAfter(dayjs(t.deadline), "day");
    }).length;

    const completedOnTime = tasks.filter(t => {
      if (t.status !== "Done" || !t.deadline || !t.completedAt) return false;
      return dayjs(t.completedAt).isBefore(dayjs(t.deadline)) ||
        dayjs(t.completedAt).isSame(dayjs(t.deadline), "day");
    }).length;

    const avgCompletionTime = tasks
      .filter(t => t.status === "Done" && t.completedAt && t.createdAt)
      .reduce((acc, t) => {
        const days = dayjs(t.completedAt).diff(dayjs(t.createdAt), "day");
        return acc + days;
      }, 0) / (completed || 1);

    return {
      total,
      completed,
      inProgress,
      todo,
      overdue,
      completedOnTime,
      completionRate: total ? ((completed / total) * 100).toFixed(1) : 0,
      onTimeRate: completed ? ((completedOnTime / completed) * 100).toFixed(1) : 0,
      avgCompletionTime: avgCompletionTime.toFixed(1)
    };
  }, [tasks]);

  const tasksByPriority = useMemo(() => {
    const buckets = { Low: 0, Medium: 0, High: 0 };
    tasks.forEach(t => {
      const p = Number(t.priority);
      if (p <= 3) buckets.Low++;
      else if (p <= 7) buckets.Medium++;
      else buckets.High++;
    });
    return buckets;
  }, [tasks]);

  const tasksByProject = useMemo(() => {
    const map = {};
    tasks.forEach(t => {
      const pName = t.assignedProject?.name || "Unassigned";
      if (!map[pName]) map[pName] = { total: 0, completed: 0 };
      map[pName].total++;
      if (t.status === "Done") map[pName].completed++;
    });
    return Object.entries(map).map(([name, data]) => ({
      name,
      ...data,
      rate: ((data.completed / data.total) * 100).toFixed(1)
    }));
  }, [tasks]);

  return (
    <div ref={reportRef} className="space-y-6 p-6 bg-light-bg dark:bg-dark-bg">
      {/* Header */}
      <div className="text-center border-b border-light-border dark:border-dark-border pb-4">
        <h1 className="text-3xl font-bold text-light-text-primary dark:text-dark-text-primary">
          Personal Task Report
        </h1>
        <p className="text-light-text-secondary dark:text-dark-text-secondary mt-2">
          Generated on {dayjs().format("MMMM D, YYYY")}
        </p>
      </div>

      {/* Overview Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={ReportIcon} label="Total Tasks" value={metrics.total} color="brand" />
        <MetricCard icon={CheckIcon} label="Completed" value={metrics.completed} color="success" />
        <MetricCard icon={ClockIcon} label="In Progress" value={metrics.inProgress} color="info" />
        <MetricCard icon={ReportIcon} label="Overdue" value={metrics.overdue} color="danger" />
      </div>

      {/* Performance Metrics */}
      <div className="rounded-2xl border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg p-6">
        <h2 className="text-xl font-bold text-light-text-primary dark:text-dark-text-primary mb-4">
          Performance Metrics
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-1">
              Completion Rate
            </p>
            <p className="text-3xl font-bold text-success">{metrics.completionRate}%</p>
            <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-1">
              {metrics.completed} of {metrics.total} tasks completed
            </p>
          </div>
          <div>
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-1">
              On-Time Delivery Rate
            </p>
            <p className="text-3xl font-bold text-brand-primary dark:text-brand-secondary">
              {metrics.onTimeRate}%
            </p>
            <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-1">
              {metrics.completedOnTime} of {metrics.completed} completed on time
            </p>
          </div>
          <div>
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-1">
              Avg. Completion Time
            </p>
            <p className="text-3xl font-bold text-info">{metrics.avgCompletionTime}</p>
            <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-1">days per task</p>
          </div>
        </div>
      </div>

      {/* Task Status Breakdown */}
      <div className="rounded-2xl border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg p-6">
        <h2 className="text-xl font-bold text-light-text-primary dark:text-dark-text-primary mb-4">
          Task Status Distribution
        </h2>
        <div className="space-y-3">
          {[
            { label: "To Do", count: metrics.todo, color: "bg-light-text-muted dark:bg-dark-text-muted" },
            { label: "In Progress", count: metrics.inProgress, color: "bg-info" },
            { label: "Completed", count: metrics.completed, color: "bg-success" },
            { label: "Overdue", count: metrics.overdue, color: "bg-danger" }
          ].map(({ label, count, color }) => (
            <div key={label}>
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium text-light-text-primary dark:text-dark-text-primary">
                  {label}
                </span>
                <span className="text-sm font-bold text-light-text-primary dark:text-dark-text-primary">
                  {count}
                </span>
              </div>
              <div className="w-full bg-light-surface dark:bg-dark-surface rounded-full h-2">
                <div
                  className={`${color} h-2 rounded-full transition-all`}
                  style={{ width: `${metrics.total ? (count / metrics.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tasks by Priority */}
      <div className="rounded-2xl border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg p-6">
        <h2 className="text-xl font-bold text-light-text-primary dark:text-dark-text-primary mb-4">
          Tasks by Priority
        </h2>
        <div className="grid grid-cols-3 gap-4">
          {Object.entries(tasksByPriority).map(([priority, count]) => (
            <div key={priority} className="text-center">
              <p className="text-2xl font-bold text-light-text-primary dark:text-dark-text-primary">
                {count}
              </p>
              <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                {priority} Priority
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Tasks by Project */}
      <div className="rounded-2xl border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg p-6">
        <h2 className="text-xl font-bold text-light-text-primary dark:text-dark-text-primary mb-4">
          Performance by Project
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-light-border dark:border-dark-border">
              <tr>
                <th className="text-left py-3 px-4 text-sm font-semibold text-light-text-primary dark:text-dark-text-primary">
                  Project
                </th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-light-text-primary dark:text-dark-text-primary">
                  Total Tasks
                </th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-light-text-primary dark:text-dark-text-primary">
                  Completed
                </th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-light-text-primary dark:text-dark-text-primary">
                  Completion Rate
                </th>
              </tr>
            </thead>
            <tbody>
              {tasksByProject.map((proj) => (
                <tr
                  key={proj._id}
                  className="border-b border-light-border dark:border-dark-border"
                >
                  <td className="py-3 px-4 text-sm text-light-text-primary dark:text-dark-text-primary">
                    {proj.name}
                  </td>
                  <td className="py-3 px-4 text-sm text-right text-light-text-primary dark:text-dark-text-primary">
                    {proj.total}
                  </td>
                  <td className="py-3 px-4 text-sm text-right text-light-text-primary dark:text-dark-text-primary">
                    {proj.completed}
                  </td>
                  <td className="py-3 px-4 text-sm text-right font-semibold text-success">
                    {proj.rate}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// eslint-disable-next-line no-unused-vars
function ManagerReport({ userId, reportData, reportRef }) {
  const { tasks, projects } = reportData;

  const metrics = useMemo(() => {
    const totalProjects = projects.length;
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === "Done").length;
    const inProgressTasks = tasks.filter(t => t.status === "In Progress").length;

    const now = dayjs();
    const overdueTasks = tasks.filter(t => {
      if (!t.deadline || t.status === "Done") return false;
      return now.isAfter(dayjs(t.deadline), "day");
    }).length;

    const teamMembers = new Set();
    tasks.forEach(t => {
      (t.assignedTeamMembers || []).forEach(m => {
        teamMembers.add(typeof m === "string" ? m : m._id);
      });
    });

    return {
      totalProjects,
      totalTasks,
      completedTasks,
      inProgressTasks,
      overdueTasks,
      teamSize: teamMembers.size
    };
  }, [tasks, projects]);

  const projectMetrics = useMemo(() => {
    return projects.map(project => {
      const projectTasks = tasks.filter(t => {
        const pid = typeof t.assignedProject === "string"
          ? t.assignedProject
          : t.assignedProject?._id;
        return pid === project._id;
      });

      const completed = projectTasks.filter(t => t.status === "Done").length;
      const inProgress = projectTasks.filter(t => t.status === "In Progress").length;
      const todo = projectTasks.filter(t => t.status === "To Do").length;

      const now = dayjs();
      const overdue = projectTasks.filter(t => {
        if (!t.deadline || t.status === "Done") return false;
        return now.isAfter(dayjs(t.deadline), "day");
      }).length;

      const avgTime = projectTasks
        .filter(t => t.status === "Done" && t.completedAt && t.createdAt)
        .reduce((acc, t) => {
          return acc + dayjs(t.completedAt).diff(dayjs(t.createdAt), "day");
        }, 0) / (completed || 1);

      const teamMembers = new Set();
      projectTasks.forEach(t => {
        (t.assignedTeamMembers || []).forEach(m => {
          const memberId = typeof m === "string" ? m : m._id;
          const memberName = typeof m === "string" ? "Unknown" : (m.name || "Unknown");
          teamMembers.add(JSON.stringify({ id: memberId, name: memberName }));
        });
      });

      return {
        projectId: project._id,
        projectName: project.name,
        totalTasks: projectTasks.length,
        completed,
        inProgress,
        todo,
        overdue,
        completionRate: projectTasks.length ? ((completed / projectTasks.length) * 100).toFixed(1) : 0,
        avgCompletionTime: avgTime.toFixed(1),
        teamMembers: Array.from(teamMembers).map(s => JSON.parse(s))
      };
    });
  }, [projects, tasks]);

  const statusBreakdown = useMemo(() => {
    const statusCounts = { "To Do": 0, "In Progress": 0, "Done": 0 };
    tasks.forEach(t => {
      if (Object.hasOwn(statusCounts, t.status)) {
        statusCounts[t.status]++;
      }
    });
    return statusCounts;
  }, [tasks]);

  return (
    <div ref={reportRef} className="space-y-6 p-6 bg-light-bg dark:bg-dark-bg">
      {/* Header */}
      <div className="text-center border-b border-light-border dark:border-dark-border pb-4">
        <h1 className="text-3xl font-bold text-light-text-primary dark:text-dark-text-primary">
          Project Consolidation Report
        </h1>
        <p className="text-light-text-secondary dark:text-dark-text-secondary mt-2">
          Generated on {dayjs().format("MMMM D, YYYY")}
        </p>
      </div>

      {/* Overview Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={ReportIcon} label="Total Projects" value={metrics.totalProjects} color="brand" />
        <MetricCard icon={ReportIcon} label="Total Tasks" value={metrics.totalTasks} color="info" />
        <MetricCard icon={CheckIcon} label="Completed Tasks" value={metrics.completedTasks} color="success" />
        <MetricCard icon={ClockIcon} label="Team Members" value={metrics.teamSize} color="brand" />
      </div>

      {/* Team Status Overview */}
      <div className="rounded-2xl border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg p-6">
        <h2 className="text-xl font-bold text-light-text-primary dark:text-dark-text-primary mb-4">
          Consolidated Team Metrics
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-1">To Do</p>
            <p className="text-3xl font-bold text-light-text-muted dark:text-dark-text-muted">
              {statusBreakdown["To Do"]}
            </p>
          </div>
          <div>
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-1">In Progress</p>
            <p className="text-3xl font-bold text-info">{statusBreakdown["In Progress"]}</p>
          </div>
          <div>
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-1">Completed</p>
            <p className="text-3xl font-bold text-success">{statusBreakdown["Done"]}</p>
          </div>
          <div>
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mb-1">Overdue</p>
            <p className="text-3xl font-bold text-danger">{metrics.overdueTasks}</p>
          </div>
        </div>
      </div>

      {/* Project Details */}
      <div className="rounded-2xl border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg p-6">
        <h2 className="text-xl font-bold text-light-text-primary dark:text-dark-text-primary mb-4">
          Project Performance Details
        </h2>
        <div className="space-y-6">
          {projectMetrics.map((proj) => (
            <div key={proj.projectId} className="border border-light-border dark:border-dark-border rounded-xl p-4">
              <h3 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary mb-3">
                {proj.projectName}
              </h3>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">Total Tasks</p>
                  <p className="text-xl font-bold text-light-text-primary dark:text-dark-text-primary">
                    {proj.totalTasks}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">Completed</p>
                  <p className="text-xl font-bold text-success">{proj.completed}</p>
                </div>
                <div>
                  <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">In Progress</p>
                  <p className="text-xl font-bold text-info">{proj.inProgress}</p>
                </div>
                <div>
                  <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">Overdue</p>
                  <p className="text-xl font-bold text-danger">{proj.overdue}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mb-1">
                    Completion Rate
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-light-surface dark:bg-dark-surface rounded-full h-2">
                      <div
                        className="bg-success h-2 rounded-full transition-all"
                        style={{ width: `${proj.completionRate}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold text-success">{proj.completionRate}%</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">
                    Avg. Completion Time
                  </p>
                  <p className="text-lg font-bold text-light-text-primary dark:text-dark-text-primary">
                    {proj.avgCompletionTime} days
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mb-2">
                  Team Members ({proj.teamMembers.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {proj.teamMembers.map((member, mIdx) => (
                    <span
                      key={mIdx}
                      className="inline-flex items-center bg-brand-primary/10 dark:bg-brand-secondary/10 text-brand-primary dark:text-brand-secondary px-3 py-1 rounded-full text-xs font-medium"
                    >
                      {member.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Report() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reportData, setReportData] = useState({ tasks: [], projects: [] });
  const [isExporting, setIsExporting] = useState(false);
  const reportRef = useRef(null);

  useEffect(() => {
    async function loadReportData() {
      try {
        setLoading(true);
        setError(null);

        if (user.role === "Staff") {
          // Staff: Get only their assigned tasks and involved projects
          const allTasks = await getTasks();
          const myTasks = allTasks.filter(t =>
            Array.isArray(t.assignedTeamMembers) &&
            t.assignedTeamMembers.some(m =>
              (typeof m === "string" && m === user.id) || (m?._id === user.id)
            )
          );

          const allProjects = await getProjects();
          const myProjects = allProjects.filter(p =>
            Array.isArray(p.teamMembers) &&
            p.teamMembers.some(m =>
              (typeof m === "string" && m === user.id) || (m?._id === user.id)
            )
          );

          setReportData({ tasks: myTasks, projects: myProjects });
        } else if (user.role === "Manager") {
          // Manager: Get all projects they created and all related tasks
          const myProjects = await getManagerProjects();
          const projectIds = myProjects.map(p => p._id);

          const allTasks = await getTasks();
          const projectTasks = allTasks.filter(t => {
            const pid = typeof t.assignedProject === "string"
              ? t.assignedProject
              : t.assignedProject?._id;
            return projectIds.includes(pid);
          });

          setReportData({ tasks: projectTasks, projects: myProjects });
        }
      } catch (err) {
        setError(err.message || "Failed to load report data");
      } finally {
        setLoading(false);
      }
    }

    if (user?.id) {
      loadReportData();
    }
  }, [user]);

  const handleExportPDF = async () => {
    if (!reportRef.current) return;

    try {
      setIsExporting(true);

      // Simple print-based PDF export (works better with modern CSS)
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        throw new Error('Popup blocked. Please allow popups for this site.');
      }

      // Clone the report content
      const reportClone = reportRef.current.cloneNode(true);

      // Create a complete HTML document for printing
      const printDocument = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>${user.role} Report - ${dayjs().format("YYYY-MM-DD")}</title>
            <style>
              * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
              }
              body {
                font-family: system-ui, -apple-system, sans-serif;
                line-height: 1.5;
                color: #1f2937;
                background: white;
                padding: 20px;
              }
              .space-y-6 > * + * {
                margin-top: 1.5rem;
              }
              .space-y-4 > * + * {
                margin-top: 1rem;
              }
              .space-y-3 > * + * {
                margin-top: 0.75rem;
              }
              .grid {
                display: grid;
                gap: 1rem;
              }
              .grid-cols-1 {
                grid-template-columns: repeat(1, minmax(0, 1fr));
              }
              .grid-cols-2 {
                grid-template-columns: repeat(2, minmax(0, 1fr));
              }
              .grid-cols-3 {
                grid-template-columns: repeat(3, minmax(0, 1fr));
              }
              .grid-cols-4 {
                grid-template-columns: repeat(4, minmax(0, 1fr));
              }
              @media (min-width: 640px) {
                .sm\\:grid-cols-2 {
                  grid-template-columns: repeat(2, minmax(0, 1fr));
                }
              }
              @media (min-width: 768px) {
                .md\\:grid-cols-3 {
                  grid-template-columns: repeat(3, minmax(0, 1fr));
                }
                .md\\:grid-cols-4 {
                  grid-template-columns: repeat(4, minmax(0, 1fr));
                }
              }
              @media (min-width: 1024px) {
                .lg\\:grid-cols-4 {
                  grid-template-columns: repeat(4, minmax(0, 1fr));
                }
              }
              .rounded-2xl {
                border-radius: 1rem;
              }
              .rounded-xl {
                border-radius: 0.75rem;
              }
              .rounded-lg {
                border-radius: 0.5rem;
              }
              .rounded-full {
                border-radius: 9999px;
              }
              .border {
                border: 1px solid #e5e7eb;
              }
              .p-6 {
                padding: 1.5rem;
              }
              .p-4 {
                padding: 1rem;
              }
              .p-3 {
                padding: 0.75rem;
              }
              .px-3 {
                padding-left: 0.75rem;
                padding-right: 0.75rem;
              }
              .py-1 {
                padding-top: 0.25rem;
                padding-bottom: 0.25rem;
              }
              .pb-4 {
                padding-bottom: 1rem;
              }
              .mb-4 {
                margin-bottom: 1rem;
              }
              .mb-3 {
                margin-bottom: 0.75rem;
              }
              .mb-2 {
                margin-bottom: 0.5rem;
              }
              .mb-1 {
                margin-bottom: 0.25rem;
              }
              .mt-1 {
                margin-top: 0.25rem;
              }
              .mt-2 {
                margin-top: 0.5rem;
              }
              .mt-4 {
                margin-top: 1rem;
              }
              .text-center {
                text-align: center;
              }
              .text-left {
                text-align: left;
              }
              .text-right {
                text-align: right;
              }
              .font-bold {
                font-weight: 700;
              }
              .font-semibold {
                font-weight: 600;
              }
              .font-medium {
                font-weight: 500;
              }
              .text-3xl {
                font-size: 1.875rem;
              }
              .text-2xl {
                font-size: 1.5rem;
              }
              .text-xl {
                font-size: 1.25rem;
              }
              .text-lg {
                font-size: 1.125rem;
              }
              .text-sm {
                font-size: 0.875rem;
              }
              .text-xs {
                font-size: 0.75rem;
              }
              .flex {
                display: flex;
              }
              .items-center {
                align-items: center;
              }
              .justify-between {
                justify-content: space-between;
              }
              .gap-2 {
                gap: 0.5rem;
              }
              .gap-3 {
                gap: 0.75rem;
              }
              .gap-4 {
                gap: 1rem;
              }
              .gap-6 {
                gap: 1.5rem;
              }
              .flex-wrap {
                flex-wrap: wrap;
              }
              .inline-flex {
                display: inline-flex;
              }
              .overflow-x-auto {
                overflow-x: auto;
              }
              .w-full {
                width: 100%;
              }
              .h-2 {
                height: 0.5rem;
              }
              table {
                width: 100%;
                border-collapse: collapse;
              }
              thead {
                border-bottom: 2px solid #e5e7eb;
              }
              tbody tr {
                border-bottom: 1px solid #e5e7eb;
              }
              th, td {
                padding: 0.75rem 1rem;
              }
              th {
                font-weight: 600;
                text-align: left;
              }
              .shadow-sm {
                box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
              }
              @media print {
                body {
                  padding: 0;
                }
                .page-break {
                  page-break-before: always;
                }
              }
            </style>
          </head>
          <body>
            ${reportClone.outerHTML}
          </body>
        </html>
      `;

      printWindow.document.write(printDocument);
      printWindow.document.close();

      // Wait for content to load, then trigger print
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();

        // Close after printing (or if user cancels)
        setTimeout(() => {
          printWindow.close();
        }, 100);
      }, 500);

    } catch (err) {
      console.error("Export failed:", err);
      alert(err.message || "Failed to export PDF. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary dark:border-brand-secondary"></div>
          <p className="text-light-text-secondary dark:text-dark-text-secondary">
            Loading report data…
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="rounded-lg bg-priority-high-bg dark:bg-priority-high-bg-dark border border-priority-high-border dark:border-priority-high-border-dark p-4">
          <p className="text-priority-high-text dark:text-priority-high-text-dark font-semibold">
            {error}
          </p>
        </div>
      </div>
    );
  }

  return (
    <section className="p-4 space-y-6">
      {/* Page Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-light-text-primary dark:text-dark-text-primary">
            {user.role === "Staff" ? "My Task Report" : "Project Consolidation Report"}
          </h1>
          <p className="mt-3 text-lg text-light-text-secondary dark:text-dark-text-secondary">
            {user.role === "Staff"
              ? "Review your task performance and contributions"
              : "Consolidated view of all project metrics and team performance"}
          </p>
        </div>

        <button
          onClick={handleExportPDF}
          disabled={isExporting}
          className="inline-flex items-center gap-2 px-6 py-3 bg-brand-primary hover:bg-blue-700 text-white font-semibold rounded-xl shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <DownloadIcon className="h-5 w-5" />
          {isExporting ? "Exporting..." : "Export as PDF"}
        </button>
      </header>

      {/* Report Content */}
      {user.role === "Staff" ? (
        <StaffReport userId={user.id} reportData={reportData} reportRef={reportRef} />
      ) : (
        <ManagerReport userId={user.id} reportData={reportData} reportRef={reportRef} />
      )}
    </section>
  );
}