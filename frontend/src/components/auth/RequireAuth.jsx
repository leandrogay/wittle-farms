import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "/src/context/useAuth";

export default function RequireAuth() {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace state={{ from: loc }} />;
  return <Outlet />;
}
