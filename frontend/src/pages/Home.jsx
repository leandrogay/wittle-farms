import { Link } from "react-router-dom";
import FeatureCard from "../components/ui/FeatureCard.jsx";

/* ====== Simple SVG Icons ====== */
function BoardIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" strokeWidth="1.5" />
      <path d="M9 4v16M15 4v16" strokeWidth="1.5" />
      <path d="M3 10h18" strokeWidth="1.5" />
    </svg>
  );
}

function ProjectIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" strokeWidth="1.5" />
      <path d="M12 22v-9M12 13L5 9M12 13l7-4" strokeWidth="1.5" />
    </svg>
  );
}

function CalendarIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <rect x="3" y="4" width="18" height="17" rx="2" strokeWidth="1.5" />
      <path d="M16 2v4M8 2v4M3 10h18" strokeWidth="1.5" />
      <path d="M7 14h4M13 14h4M7 18h4" strokeWidth="1.5" />
    </svg>
  );
}

function TaskIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path d="M9 11l3 3L22 4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" strokeWidth="1.5" />
    </svg>
  );
}

export default function Home() {
  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-6xl">
        {/* Hero Section */}
        <header className="mb-10">
          <h1 className="text-4xl font-bold tracking-tight text-light-text-primary dark:text-dark-text-primary">
            Welcome Back
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-light-text-secondary dark:text-dark-text-secondary">
            What would you like to do today?
          </p>
        </header>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            title="Taskboard"
            to="/taskboard-mgr"
            description="Manage and organize your team's tasks efficiently."
            icon={BoardIcon}
            cta="Open Taskboard"
          />
          
          <FeatureCard
            title="Team Calendar"
            to="/calendar"
            description="View and schedule team events and deadlines."
            icon={CalendarIcon}
            cta="View Calendar"
          />
          
          <FeatureCard
            title="Create Project"
            to="/create-project"
            description="Start a new project and assign team members."
            icon={ProjectIcon}
            cta="Create Project"
          />
        </div>

        {/* Quick Stats Section (Optional) */}
        <section className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div className="rounded-2xl border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-brand-primary/10 dark:bg-brand-secondary/10 p-3">
                <TaskIcon className="h-6 w-6 text-brand-primary dark:text-brand-secondary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-light-text-primary dark:text-dark-text-primary">—</p>
                <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">Active Tasks</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-success/10 p-3">
                <ProjectIcon className="h-6 w-6 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold text-light-text-primary dark:text-dark-text-primary">—</p>
                <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">Projects</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-warning/10 p-3">
                <CalendarIcon className="h-6 w-6 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold text-light-text-primary dark:text-dark-text-primary">—</p>
                <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">Due This Week</p>
              </div>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}