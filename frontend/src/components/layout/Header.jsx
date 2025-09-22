import { NavLink, useNavigate } from "react-router-dom";

export default function Header() {
  const navigate = useNavigate();

  const linkStyle = ({ isActive }) => ({
    margin: "0 8px",
    textDecoration: "none",
    color: isActive ? "tomato" : "black",
    fontWeight: isActive ? "bold" : "normal",
  });

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    navigate("/login", { replace: true });
  };

  return (
    <nav
      style={{
        marginBottom: "1rem",
        display: "flex",
        alignItems: "center",
      }}
    >
      <div>
        <NavLink to="/" style={linkStyle} end>
          Home
        </NavLink>
        <NavLink to="/tasks" style={linkStyle}>
          Tasks
        </NavLink>
        <NavLink to="/TaskBoardMgr" style={linkStyle}>
          TaskBoard (Mgr)
        </NavLink>
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
