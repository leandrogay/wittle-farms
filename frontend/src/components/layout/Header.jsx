import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useTheme } from "../../context/ThemeContext.jsx";

export default function Header() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const linkStyle = ({ isActive }) => ({
    margin: "0 8px",
    textDecoration: "none",
    color: isActive ? (theme === "dark" ? "#ff7b7b" : "tomato") : (theme === "dark" ? "white" : "black"),
    fontWeight: isActive ? "bold" : "normal",
  });

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <nav style={{
      marginBottom: "1rem",
      display: "flex",
      alignItems: "center",
      backgroundColor: theme === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
      backdropFilter: "blur(10px)",
      borderRadius: "12px",
      padding: "0.5rem 1rem",
    }}>
      <div>
        <NavLink to="/home" style={linkStyle} end>Home</NavLink>

        {user?.role === "Staff" && (
          <>
            <NavLink to="/tasks" style={linkStyle}>My Tasks</NavLink>
            <NavLink to="/calendar" style={linkStyle}>Calendar</NavLink>
          </>
        )}

        {user?.role === "Manager" && (
          <>
            <NavLink to="/taskboard-mgr" style={linkStyle}>TaskBoard</NavLink>
            <NavLink to="/createProject" style={linkStyle}>Create Project</NavLink>
            <NavLink to="/calendar" style={linkStyle}>Calendar</NavLink>
          </>
        )}
      </div>

      <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
        <button
          onClick={toggleTheme}
          style={{
            padding: "6px 12px",
            borderRadius: "6px",
            border: "none",
            backgroundColor: theme === "dark" ? "#444" : "#ddd",
            color: theme === "dark" ? "white" : "black",
            cursor: "pointer",
            transition: "all 0.3s",
          }}
        >
          {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
        </button>

        <button
          onClick={handleLogout}
          style={{
            padding: "6px 12px",
            color: theme === "dark" ? "white" : "black",
            background: "none",
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          Logout
        </button>
      </div>
    </nav>
  );
}
