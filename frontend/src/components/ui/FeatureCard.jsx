import React from "react";
import { Link } from "react-router-dom";

const DEFAULT_CTA = "Open"; // avoids magic string (DoD: define constants)
const ARROW_GLYPH = "→";    // extracted for clarity and reuse

const CARD_BASE =
  "group rounded-2xl border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg p-6 shadow-sm transition hover:shadow-md hover:border-brand-primary dark:hover:border-brand-secondary";
const ICON_WRAPPER =
  "rounded-xl border border-light-border dark:border-dark-border p-3 bg-light-surface dark:bg-dark-surface group-hover:bg-brand-primary/10 dark:group-hover:bg-brand-secondary/10 transition-colors";
const TITLE_CLS = "text-lg font-semibold text-light-text-primary dark:text-dark-text-primary";
const DESC_CLS = "mt-1 text-sm text-light-text-secondary dark:text-dark-text-secondary";
const LINK_CLS =
  "inline-flex items-center gap-2 rounded-lg border border-brand-primary dark:border-brand-secondary px-3 py-2 text-sm font-semibold text-brand-primary dark:text-brand-secondary transition hover:bg-brand-primary/10 dark:hover:bg-brand-secondary/10";

const FeatureCard = ({ title, to, description, icon: Icon, cta = DEFAULT_CTA }) => {
  return (
    <div className={CARD_BASE}>
      <div className="flex items-start gap-4">
        <div className={ICON_WRAPPER}>
          {Icon ? (
            <Icon
              className="h-6 w-6 text-light-text-primary dark:text-dark-text-primary group-hover:text-brand-primary dark:group-hover:text-brand-secondary transition-colors"
              aria-hidden="true"
            />
          ) : null}
        </div>
        <div className="flex-1">
          <h3 className={TITLE_CLS}>{title}</h3>
          <p className={DESC_CLS}>{description}</p>
          <div className="mt-4">
            <Link
              to={to}
              aria-label={`${cta}: ${title}`}
              className={LINK_CLS}
            >
              {cta}
              <span aria-hidden="true">{ARROW_GLYPH}</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export { FeatureCard, DEFAULT_CTA, ARROW_GLYPH };
