import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

export default function Header() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const linkStyle = ({ isActive }) => ({
    margin: "0 8px",
    textDecoration: "none",
    color: isActive ? "tomato" : "black",
    fontWeight: isActive ? "bold" : "normal",
  });

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <nav style={{ marginBottom: "1rem", display: "flex", alignItems: "center" }}>
      <div>
        <NavLink to="/home" style={linkStyle} end>Home</NavLink>

        {user?.role === "Staff" && (
          <NavLink to="/tasks" style={linkStyle}>My Tasks</NavLink>
        )}

        {user?.role === "Manager" && (
          <>
            <NavLink to="/taskboard-mgr" style={linkStyle}>
              TaskBoard (Mgr)
            </NavLink>
            <NavLink to="/createProject" style={linkStyle}>
              Create Project (Mgr)
            </NavLink>
            <NavLink to="/calendar" style={linkStyle}>
              Calendar
            </NavLink>
          </>
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
