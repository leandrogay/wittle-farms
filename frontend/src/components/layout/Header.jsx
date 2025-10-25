import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "/src/context/useAuth";
import { useTheme } from "../../context/ThemeContext.jsx";
import { useState } from "react";
import NotificationBell from "../notifications/NotificationBell";
import NotificationPanel from "../notifications/NotificationPanel";

/* Navigation Link Component */
function NavigationLink({ to, children, end = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `px-4 py-2 rounded-lg font-medium transition-all ${
          isActive
            ? "bg-brand-primary text-white dark:bg-brand-secondary shadow-sm"
            : "text-light-text-primary dark:text-dark-text-primary hover:bg-light-bg dark:hover:bg-dark-bg"
        }`
      }
    >
      {children}
    </NavLink>
  );
}

/* Role-Based Navigation Configuration */
const navigationConfig = {
  Staff: [
    { to: "/tasks", label: "My Tasks" },
    { to: "/calendar", label: "Calendar" },
    { to: "/timeline", label: "Timeline" },
    { to: "/report", label: "Report" },
  ],
  Manager: [
    { to: "/taskboard-mgr", label: "Taskboard" },
    { to: "/create-project", label: "Create Project" },
    { to: "/calendar", label: "Calendar" },
    { to: "/timeline", label: "Timeline" },
    { to: "/report", label: "Report" },
  ],
  Director: [
    { to: "/calendar", label: "Calendar" },
    { to: "/dashboard", label: "Dashboard" },
    { to: "/report", label: "Report" },
  ],
  HR: [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/report", label: "Report" },
  ],
  "Senior Manager": [
    { to: "/calendar", label: "Calendar" },
    { to: "/dashboard", label: "Dashboard" },
    { to: "/report", label: "Report" },
  ],
};

/* User Info Display Component */
function UserInfo({ user }) {
  if (!user) return null;

  return (
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
  );
}

/* Theme Toggle Button Component */
function ThemeToggle({ theme, toggleTheme }) {
  return (
    <button
      onClick={toggleTheme}
      className="px-3 py-2 rounded-lg bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border text-light-text-primary dark:text-dark-text-primary hover:bg-light-surface dark:hover:bg-dark-surface transition-all shadow-sm font-medium text-sm"
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
    </button>
  );
}

/* Logout Button Component */
function LogoutButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-2 rounded-lg bg-danger text-white hover:bg-red-700 transition-all shadow-sm font-medium text-sm"
      aria-label="Logout"
    >
      Logout
    </button>
  );
}

/* Notification Component */
function NotificationDropdown({ user, showNotifications, setShowNotifications }) {
  if (!user) return null;

  return (
    <div className="relative">
      <NotificationBell onClick={() => setShowNotifications(!showNotifications)} />
      {showNotifications && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowNotifications(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 z-20">
            <NotificationPanel onClose={() => setShowNotifications(false)} />
          </div>
        </>
      )}
    </div>
  );
}

/* Main Header Component */
export default function Header() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [showNotifications, setShowNotifications] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    logout();
    navigate("/login", { replace: true });
  };

  // Get navigation items for current user role
  const navItems = user?.role ? navigationConfig[user.role] || [] : [];

  return (
    <nav className="mb-4 flex items-center bg-light-surface/80 dark:bg-dark-surface/80 backdrop-blur-md rounded-xl px-4 py-3 border border-light-border dark:border-dark-border shadow-sm">
      {/* Navigation Links */}
      <div className="flex items-center gap-1">
        {/* Home Link (available to all roles) */}
        <NavigationLink to="/home" end>
          Home
        </NavigationLink>

        {/* Role-based navigation */}
        {navItems.map((item) => (
          <NavigationLink key={item.to} to={item.to}>
            {item.label}
          </NavigationLink>
        ))}
      </div>

      {/* Right Side Actions */}
      <div className="ml-auto flex items-center gap-2">
        <UserInfo user={user} />
        
        <NotificationDropdown
          user={user}
          showNotifications={showNotifications}
          setShowNotifications={setShowNotifications}
        />
        
        <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
        
        <LogoutButton onClick={handleLogout} />
      </div>
    </nav>
  );
}