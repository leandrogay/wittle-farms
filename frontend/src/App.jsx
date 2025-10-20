import { Outlet } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import Header from "./components/layout/Header.jsx";
import AnimatedBackground from "./components/layout/AnimatedBackground.jsx";
import { getMe, refreshAccessToken } from "./services/api.js";
import { useAuth } from "./context/AuthContext.jsx";
import { initializeSocket } from "./services/socket.js";

export default function App() {
  const { login, logout } = useAuth();
  const [bootLoading, setBootLoading] = useState(true);
  const ran = useRef(false);

  useEffect(() => {
    // Prevent double execution in Strict Mode
    if (ran.current) return;
    ran.current = true;

    const bootstrap = async () => {
      try {
        const token = localStorage.getItem("auth_token");
        if (!token) {
          try {
            await refreshAccessToken();
          } catch (err) {
            console.warn("Failed to refresh token:", err);
          }
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
    };

    bootstrap();
  }, [login, logout]);

  useEffect(() => {
    if (!bootLoading) {
      const socket = initializeSocket();
      return () => socket?.disconnect?.();
    }
  }, [bootLoading]);

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
