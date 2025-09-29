import { Outlet } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import Header from "./components/layout/Header.jsx";
import { getMe, refreshAccessToken } from "./services/api.js";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx"

export default function App() {
  const { user, login, logout } = useAuth();
  const [bootLoading, setBootLoading] = useState(true);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        if (!localStorage.getItem("auth_token")){
          try { await refreshAccessToken(); } catch {}
        }

        const { user : me } = await getMe();
        console.log("[USER]", me);

        if (me) login(me); else logout();
      } catch (err) {
        console.warn("No active session:", err?.message || err);
        logout();
      } finally {
        setBootLoading(false);
      }
    })();
  }, []);


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
