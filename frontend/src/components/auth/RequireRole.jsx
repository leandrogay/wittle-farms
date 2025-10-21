import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "/src/context/useAuth";

export default function RequireRole({ roles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/unauthorized" replace />;
  return <Outlet />;
}
