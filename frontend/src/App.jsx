import { Outlet } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import Header from "./components/layout/Header.jsx";
import AnimatedBackground from "./components/layout/AnimatedBackground.jsx";
import { getMe, refreshAccessToken } from "./services/api.js";
import { useAuth } from "./context/AuthContext.jsx";

export default function App() {
  const { login, logout } = useAuth();
  const [bootLoading, setBootLoading] = useState(true);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        if (!localStorage.getItem("auth_token")) {
          try { await refreshAccessToken(); } catch {}
        }
        const { user: me } = await getMe();
        if (me) login(me);
        else logout();
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
      <AnimatedBackground>
        <Header />
        <div className="flex items-center justify-center h-screen text-gray-100">
          Loading…
        </div>
      </AnimatedBackground>
    );
  }

  return (
    <AnimatedBackground>
      <Header />
      <main className="page-container">
        <Outlet />
      </main>
    </AnimatedBackground>
  );
}
