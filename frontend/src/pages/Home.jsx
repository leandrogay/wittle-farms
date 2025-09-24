import { Link } from "react-router-dom";
import FeatureCard from "../components/ui/FeatureCard.jsx";



/* ====== Simple SVG Icons (no extra libraries needed) ====== */
function BoardIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" strokeWidth="1.5" />
      <path d="M9 4v16M15 4v16" strokeWidth="1.5" />
      <path d="M3 10h18" strokeWidth="1.5" />
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

function ReportIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" strokeWidth="1.5" />
      <path d="M14 3v5h5" strokeWidth="1.5" />
      <path d="M8 13h8M8 17h6M8 9h4" strokeWidth="1.5" />
    </svg>
  );
}
export default function Home() {
  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-6xl">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Welcome</h1>
          <p className="mt-2 max-w-2xl text-gray-600">
            What would you like to do today?
          </p>
        </header>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            title="Taskboard"
            to="/Taskboard" // TENTATIVE  
            description="View your taskboards."
            icon={BoardIcon}
            cta="Open Taskboard"
          />
          <FeatureCard
            title="Team Calendar"
            to="/team-calendar" //TENTATIVE
            description="View your team's shared calendar."
            icon={CalendarIcon}
            cta="View Calendar"
          />
          <FeatureCard
            title="Report Generation"
            to="/reports" // TENTATIVE
            description="Generate team reports."
            icon={ReportIcon}
            cta="Build Report"
          />
        </div>
      </section>
    </main>
  );
}
