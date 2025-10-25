export default function MetricCard({ icon: Icon, label, value, color = "brand" }) {
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