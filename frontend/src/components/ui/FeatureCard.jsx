import { Link } from "react-router-dom";

/**
 * Reusable feature card component.
 *
 * @param {string} title 
 * @param {string} to 
 * @param {string} description 
 * @param {React.Component} icon
 * @param {string} cta 
 */
export default function FeatureCard({ title, to, description, icon: Icon, cta = "Open" }) {
  return (
    <div className="group rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:shadow-md">
      <div className="flex items-start gap-4">
        <div className="rounded-xl border border-gray-200 p-3 bg-gray-50">
          {Icon && <Icon className="h-6 w-6 text-gray-700" aria-hidden="true" />}
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-gray-600">{description}</p>
          <div className="mt-4">
            <Link
              to={to}
              className="inline-flex items-center gap-2 rounded-lg border border-blue-600 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
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
