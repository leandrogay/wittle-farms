import { Navigate } from "react-router-dom";
import { useAuth } from "/src/context/useAuth";

export default function RoleRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  switch (user.role) {
    case "Staff":
      return <Navigate to="/home" replace />;
    case "Manager":
      return <Navigate to="/home" replace />;
    case "Director":
      return <Navigate to="/home" replace />;
    default:
      return <Navigate to="/home" replace />;
  }
}
