import { Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import Header from "./components/layout/Header.jsx";
import { getMe, getSession } from "./services/api.js";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx"

export default function App() {
  const { user, login, logout } = useAuth();
  const [bootLoading, setBootLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { session } = await getSession();
        console.log("[SESSION]", session);

        // Assuming your API returns { user: { _id, name, email, role, ... } }
        const { user: me } = await getMe();
        console.log("[USER]", me);

        if (me) login(me); else logout();
      } catch (err) {
        console.warn("No active session:", err?.message || err);
        logout();
      } finally {
        setBootLoading(false);
      }
    })();
  }, [login, logout]);

  if (bootLoading) {
    return (
      <div className="min-h-screen bg-zinc-200">
        <Header />
        <div className="p-6 text-gray-600">Loading…</div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-200 min-h-screen">
      <Header />
      <Outlet />
    </div>
  );
}
