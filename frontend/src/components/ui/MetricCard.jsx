import React from "react";

const COLOR = {
  BRAND: "brand",
  SUCCESS: "success",
  WARNING: "warning",
  DANGER: "danger",
  INFO: "info",
};

const COLOR_CLASSES = {
  [COLOR.BRAND]:
    "bg-brand-primary/10 dark:bg-brand-secondary/10 text-brand-primary dark:text-brand-secondary",
  [COLOR.SUCCESS]: "bg-success/10 text-success",
  [COLOR.WARNING]: "bg-warning/10 text-warning",
  [COLOR.DANGER]: "bg-danger/10 text-danger",
  [COLOR.INFO]: "bg-info/10 text-info",
};

const _getColorClass = (colorKey) => COLOR_CLASSES[colorKey] ?? COLOR_CLASSES[COLOR.BRAND];

const MetricCard = ({ icon: Icon, label, value, color = COLOR.BRAND }) => {
  const colorClass = _getColorClass(color);

  return (
    <div className="rounded-2xl border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-3 ${colorClass}`}>
          {Icon ? <Icon className="h-6 w-6" /> : null}
        </div>
        <div>
          <p className="text-2xl font-bold text-light-text-primary dark:text-dark-text-primary">{value}</p>
          <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary">{label}</p>
        </div>
      </div>
    </div>
  );
};

export { MetricCard, COLOR };
