import { useState, useEffect, useMemo } from "react";
import dayjs from "dayjs";
import ProjectCard from "../components/ui/ProjectCard";
// import FilterSort from "../components/dashboard/FilterSort";
import { getProjects } from "../services/api.js";
import { useAuth } from "../context/AuthContext.jsx";

/* SVG Icons */
function ProjectIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" strokeWidth="1.5" />
      <path d="M12 22v-9M12 13L5 9M12 13l7-4" strokeWidth="1.5" />
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

function CheckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path d="M20 6L9 17l-5-5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeProject, setActiveProject] = useState(null);
  
  const [departmentFilter, setDepartmentFilter] = useState("All");
  const [sortBy, setSortBy] = useState("deadline-asc");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await getProjects();
        
        // Filter projects created by the director or in their department
        const myProjects = Array.isArray(data)
          ? data.filter(p => {
              // Directors can see all projects, or filter by their created projects
              return true; // Adjust based on your business logic
            })
          : [];
        
        setProjects(myProjects);
      } catch (err) {
        setError(err.message || "Failed to load projects");
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id]);

  // Extract unique departments from projects
  const departments = useMemo(() => {
    const depts = projects
      .map(p => (Array.isArray(p.department) ? p.department.map(d => d.name).join(", ") : ""))
      .filter(d => d && d.trim() !== "");
    return ["All", ...new Set(depts)].sort();
  }, [projects]);

  // Apply filters and sorting
  const filteredAndSortedProjects = useMemo(() => {
    let result = [...projects];

    // Apply department filter
    if (departmentFilter !== "All") {
      result = result.filter(p => p.department === departmentFilter);
    }

    // Apply sorting
    switch (sortBy) {
      case "deadline-asc":
        result.sort((a, b) => {
          const aDate = a.deadline ? dayjs(a.deadline).valueOf() : Infinity;
          const bDate = b.deadline ? dayjs(b.deadline).valueOf() : Infinity;
          return aDate - bDate;
        });
        break;
      case "deadline-desc":
        result.sort((a, b) => {
          const aDate = a.deadline ? dayjs(a.deadline).valueOf() : -Infinity;
          const bDate = b.deadline ? dayjs(b.deadline).valueOf() : -Infinity;
          return bDate - aDate;
        });
        break;
      case "department-asc":
        result.sort((a, b) => (a.department || "").localeCompare(b.department || ""));
        break;
      case "department-desc":
        result.sort((a, b) => (b.department || "").localeCompare(a.department || ""));
        break;
      case "title-asc":
        result.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        break;
      default:
        break;
    }

    return result;
  }, [projects, departmentFilter, sortBy]);

  // Calculate stats
  const totalProjects = projects.length;
  
  const activeProjects = projects.filter(p => {
    if (!p.deadline) return true;
    const deadline = dayjs(p.deadline);
    const now = dayjs();
    return !now.isAfter(deadline, "day");
  }).length;
  
  const upcomingDeadlines = projects.filter(p => {
    if (!p.deadline) return false;
    const deadline = dayjs(p.deadline);
    const now = dayjs();
    const daysUntil = deadline.diff(now, "day");
    return daysUntil >= 0 && daysUntil <= 7;
  }).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary dark:border-brand-secondary"></div>
          <p className="text-light-text-secondary dark:text-dark-text-secondary">Loading projects…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="rounded-lg bg-priority-high-bg dark:bg-priority-high-bg-dark border border-priority-high-border dark:border-priority-high-border-dark p-4">
          <p className="text-priority-high-text dark:text-priority-high-text-dark font-semibold">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <section className="p-4 space-y-6">
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight text-light-text-primary dark:text-dark-text-primary">
          Projects Dashboard
        </h1>
        <p className="mt-3 text-lg text-light-text-secondary dark:text-dark-text-secondary">
          Monitor and manage all projects across your departments
        </p>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div className="rounded-2xl border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-brand-primary/10 dark:bg-brand-secondary/10 p-3">
              <ProjectIcon className="h-6 w-6 text-brand-primary dark:text-brand-secondary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-light-text-primary dark:text-dark-text-primary">
                {totalProjects}
              </p>
              <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                Total Projects
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-success/10 p-3">
              <CheckIcon className="h-6 w-6 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold text-light-text-primary dark:text-dark-text-primary">
                {activeProjects}
              </p>
              <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                Active Projects
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-warning/10 p-3">
              <ClockIcon className="h-6 w-6 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold text-light-text-primary dark:text-dark-text-primary">
                {upcomingDeadlines}
              </p>
              <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
                Due This Week
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Sort */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-light-text-secondary dark:text-dark-text-secondary font-medium">
            Department:
            <select
              className="ml-2 rounded-lg border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg-secondary text-light-text-primary dark:text-dark-text-primary px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-secondary transition-all"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
            >
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-light-text-secondary dark:text-dark-text-secondary font-medium">
            Sort by:
            <select
              className="ml-2 rounded-lg border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg-secondary text-light-text-primary dark:text-dark-text-primary px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-secondary transition-all"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="deadline-asc">Deadline (Earliest First)</option>
              <option value="deadline-desc">Deadline (Latest First)</option>
              <option value="department-asc">Department (A-Z)</option>
              <option value="department-desc">Department (Z-A)</option>
              <option value="title-asc">Title (A-Z)</option>
            </select>
          </label>

          {departmentFilter !== "All" && (
            <button
              className="rounded-lg border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg-secondary text-light-text-primary dark:text-dark-text-primary px-3 py-1.5 text-sm hover:bg-light-surface dark:hover:bg-dark-surface transition-all font-medium"
              onClick={() => setDepartmentFilter("All")}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Empty State */}
      {projects.length === 0 && (
        <div className="rounded-lg border border-warning bg-priority-medium-bg dark:bg-priority-medium-bg-dark p-6 text-center">
          <p className="text-priority-medium-text dark:text-priority-medium-text-dark font-semibold">
            No projects available at the moment.
          </p>
        </div>
      )}

      {/* Projects Grid */}
      {filteredAndSortedProjects.length === 0 && projects.length > 0 ? (
        <div className="mt-8 rounded-2xl border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg p-12 text-center">
          <ProjectIcon className="mx-auto h-12 w-12 text-light-text-muted dark:text-dark-text-muted" />
          <h3 className="mt-4 text-lg font-semibold text-light-text-primary dark:text-dark-text-primary">
            No projects found
          </h3>
          <p className="mt-2 text-sm text-light-text-secondary dark:text-dark-text-secondary">
            Try adjusting your filters to see more projects.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredAndSortedProjects.map((project) => (
            <ProjectCard
              key={project._id}
              project={project}
              onOpen={setActiveProject}
            />
          ))}
        </div>
      )}

      {/* Project Detail Modal */}
      {activeProject && (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-black/50 dark:bg-black/70 backdrop-blur-sm"
          onMouseDown={(e) => e.target === e.currentTarget && setActiveProject(null)}
        >
          <div className="w-[min(90vw,740px)] rounded-2xl bg-light-bg dark:bg-dark-bg shadow-2xl p-6 border border-light-border dark:border-dark-border max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-light-text-primary dark:text-dark-text-primary">
                {activeProject?.name || "Project Details"}
              </h2>
              <button
                onClick={() => setActiveProject(null)}
                className="text-light-text-muted dark:text-dark-text-muted hover:text-danger transition-colors text-2xl font-bold"
              >
                ×
              </button>
            </div>
            <ProjectDetailView project={activeProject} />
          </div>
        </div>
      )}
    </section>
  );
}

function ProjectDetailView({ project }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary">
          Project Title
        </h3>
        <p className="mt-1 text-lg font-semibold text-light-text-primary dark:text-dark-text-primary">
          {project?.name || "Untitled Project"}
        </p>
      </div>

      <div>
        <h3 className="text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary">
          Description
        </h3>
        <p className="mt-1 text-light-text-primary dark:text-dark-text-primary">
          {project?.description || "—"}
        </p>
      </div>

      {project?.department && (
        <div>
          <h3 className="text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary">
            Department
          </h3>
          <p className="mt-1 text-light-text-primary dark:text-dark-text-primary">
            {project.department}
          </p>
        </div>
      )}

      {project?.deadline && (
        <div>
          <h3 className="text-sm font-medium text-light-text-secondary dark:text-dark-text-secondary">
            Deadline
          </h3>
          <p className="mt-1 text-light-text-primary dark:text-dark-text-primary">
            {dayjs(project.deadline).format("dddd, MMMM D, YYYY h:mm A")}
          </p>
        </div>
      )}

      <div className="rounded-xl bg-brand-primary/5 dark:bg-brand-secondary/5 ring-1 ring-brand-primary/10 dark:ring-brand-secondary/10">
        <div className="px-4 py-2 text-sm font-semibold text-light-text-primary dark:text-dark-text-primary">
          Team Members
        </div>
        <ul className="px-4 pb-3 text-light-text-primary dark:text-dark-text-primary">
          {(project?.teamMembers ?? []).length > 0 ? (
            (project.teamMembers ?? []).map((tm) => (
              <li key={tm?._id || tm} className="py-1">
                {tm?.name || tm || "Unknown"}
              </li>
            ))
          ) : (
            <li className="py-1 text-light-text-muted dark:text-dark-text-muted">
              No team members assigned
            </li>
          )}
        </ul>
      </div>

      <div className="space-y-1 text-sm text-light-text-secondary dark:text-dark-text-secondary pt-4 border-t border-light-border dark:border-dark-border">
        {project?.createdBy && (
          <p>
            <span className="font-medium text-light-text-primary dark:text-dark-text-primary">
              Created by:
            </span>{" "}
            {project.createdBy?.name || "Unknown"}
          </p>
        )}
        {project?.createdAt && (
          <p>
            <span className="font-medium text-light-text-primary dark:text-dark-text-primary">
              Created at:
            </span>{" "}
            {dayjs(project.createdAt).format("dddd, MMMM D, YYYY h:mm A")}
          </p>
        )}
        {project?.updatedAt && (
          <p>
            <span className="font-medium text-light-text-primary dark:text-dark-text-primary">
              Updated at:
            </span>{" "}
            {dayjs(project.updatedAt).format("dddd, MMMM D, YYYY h:mm A")}
          </p>
        )}
      </div>
    </div>
  );
}