import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useTheme } from "../../context/ThemeContext.jsx";

export default function Header() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <nav className="mb-4 flex items-center bg-light-surface/80 dark:bg-dark-surface/80 backdrop-blur-md rounded-xl px-4 py-3 border border-light-border dark:border-dark-border shadow-sm">
      {/* Navigation Links */}
      <div className="flex items-center gap-1">
        <NavLink
          to="/home"
          end
          className={({ isActive }) =>
            `px-4 py-2 rounded-lg font-medium transition-all ${
              isActive
                ? "bg-brand-primary text-white dark:bg-brand-secondary shadow-sm"
                : "text-light-text-primary dark:text-dark-text-primary hover:bg-light-bg dark:hover:bg-dark-bg"
            }`
          }
        >
          Home
        </NavLink>

        {user?.role === "Staff" && (
          <>
            <NavLink
              to="/tasks"
              className={({ isActive }) =>
                `px-4 py-2 rounded-lg font-medium transition-all ${
                  isActive
                    ? "bg-brand-primary text-white dark:bg-brand-secondary shadow-sm"
                    : "text-light-text-primary dark:text-dark-text-primary hover:bg-light-bg dark:hover:bg-dark-bg"
                }`
              }
            >
              My Tasks
            </NavLink>
            <NavLink
              to="/calendar"
              className={({ isActive }) =>
                `px-4 py-2 rounded-lg font-medium transition-all ${
                  isActive
                    ? "bg-brand-primary text-white dark:bg-brand-secondary shadow-sm"
                    : "text-light-text-primary dark:text-dark-text-primary hover:bg-light-bg dark:hover:bg-dark-bg"
                }`
              }
            >
              Calendar
            </NavLink>
          </>
        )}

        {user?.role === "Manager" && (
          <>
            <NavLink
              to="/taskboard-mgr"
              className={({ isActive }) =>
                `px-4 py-2 rounded-lg font-medium transition-all ${
                  isActive
                    ? "bg-brand-primary text-white dark:bg-brand-secondary shadow-sm"
                    : "text-light-text-primary dark:text-dark-text-primary hover:bg-light-bg dark:hover:bg-dark-bg"
                }`
              }
            >
              TaskBoard
            </NavLink>
            <NavLink
              to="/create-project"
              className={({ isActive }) =>
                `px-4 py-2 rounded-lg font-medium transition-all ${
                  isActive
                    ? "bg-brand-primary text-white dark:bg-brand-secondary shadow-sm"
                    : "text-light-text-primary dark:text-dark-text-primary hover:bg-light-bg dark:hover:bg-dark-bg"
                }`
              }
            >
              Create Project
            </NavLink>
            <NavLink
              to="/calendar"
              className={({ isActive }) =>
                `px-4 py-2 rounded-lg font-medium transition-all ${
                  isActive
                    ? "bg-brand-primary text-white dark:bg-brand-secondary shadow-sm"
                    : "text-light-text-primary dark:text-dark-text-primary hover:bg-light-bg dark:hover:bg-dark-bg"
                }`
              }
            >
              Calendar
            </NavLink>
          </>
        )}
      </div>

      {/* Right Side Actions */}
      <div className="ml-auto flex items-center gap-2">
        {/* User Info */}
        {user && (
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border">
            <div className="w-7 h-7 rounded-full bg-brand-primary dark:bg-brand-secondary flex items-center justify-center text-white text-sm font-semibold">
              {user.name?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-light-text-primary dark:text-dark-text-primary leading-tight">
                {user.name}
              </span>
              <span className="text-[10px] text-light-text-muted dark:text-dark-text-muted">
                {user.role}
              </span>
            </div>
          </div>
        )}

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="px-3 py-2 rounded-lg bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border text-light-text-primary dark:text-dark-text-primary hover:bg-light-surface dark:hover:bg-dark-surface transition-all shadow-sm font-medium text-sm"
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
        </button>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="px-3 py-2 rounded-lg bg-danger text-white hover:bg-red-700 transition-all shadow-sm font-medium text-sm"
        >
          Logout
        </button>
      </div>
    </nav>
  );
}