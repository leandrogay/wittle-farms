import { NavLink } from "react-router-dom"

export default function Header() {
  const linkStyle = ({ isActive }) => ({
    margin: "0 8px",
    textDecoration: "none",
    color: isActive ? "tomato" : "black",
    fontWeight: isActive ? "bold" : "normal",
  })

  return (
    <nav style={{ marginBottom: "1rem" }}>
      <NavLink to="/" style={linkStyle} end>Home</NavLink>
      <NavLink to="/tasks" style={linkStyle}>Tasks</NavLink>
      <NavLink to="/TaskBoardMgr" style={linkStyle}>TaskBoard (Mgr)</NavLink>
    </nav>
  )
}
