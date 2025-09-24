import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

export default function Header() {
  const navigate = useNavigate();
  const { user, logout } = useAuth(); // { name, role } set by AuthProvider

  const linkStyle = ({ isActive }) => ({
    margin: "0 8px",
    textDecoration: "none",
    color: isActive ? "tomato" : "black",
    fontWeight: isActive ? "bold" : "normal",
  });

  const handleLogout = () => {
    // clear any legacy token if you still use it
    localStorage.removeItem("auth_token");
    logout();                         // clear user in context/localStorage
    navigate("/login", { replace: true });
  };

  return (
    <nav style={{ marginBottom: "1rem", display: "flex", alignItems: "center" }}>
      <div>
        <NavLink to="/" style={linkStyle} end>Home</NavLink>

        {/* Only show links allowed by role */}
        {user?.role === "Staff" && (
          <NavLink to="/tasks" style={linkStyle}>Tasks</NavLink>
        )}

        {user?.role === "Manager" && (
          <NavLink to="/taskboard-mgr" style={linkStyle}>
            TaskBoard (Mgr)
          </NavLink>
        )}
      </div>

      <button
        onClick={handleLogout}
        style={{
          marginLeft: "auto",
          padding: "6px 12px",
          color: "black",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
        }}
      >
        Logout
      </button>
    </nav>
  );
}
