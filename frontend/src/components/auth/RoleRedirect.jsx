import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";

export default function RoleRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return user.role === "Manager"
    ? <Navigate to="/taskboard-mgr" replace />
    : <Navigate to="/tasks" replace />;
}
