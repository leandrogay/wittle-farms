import { Link } from "react-router-dom";

export default function FeatureCard({ title, to, description, icon: Icon, cta = "Open" }) {
  return (
    <div className="group rounded-2xl border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg p-6 shadow-sm transition hover:shadow-md hover:border-brand-primary dark:hover:border-brand-secondary">
      <div className="flex items-start gap-4">
        <div className="rounded-xl border border-light-border dark:border-dark-border p-3 bg-light-surface dark:bg-dark-surface group-hover:bg-brand-primary/10 dark:group-hover:bg-brand-secondary/10 transition-colors">
          {Icon && <Icon className="h-6 w-6 text-light-text-primary dark:text-dark-text-primary group-hover:text-brand-primary dark:group-hover:text-brand-secondary transition-colors" aria-hidden="true" />}
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary">{title}</h3>
          <p className="mt-1 text-sm text-light-text-secondary dark:text-dark-text-secondary">{description}</p>
          <div className="mt-4">
            <Link
              to={to}
              className="inline-flex items-center gap-2 rounded-lg border border-brand-primary dark:border-brand-secondary px-3 py-2 text-sm font-semibold text-brand-primary dark:text-brand-secondary transition hover:bg-brand-primary/10 dark:hover:bg-brand-secondary/10"
            >
              {cta}
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}