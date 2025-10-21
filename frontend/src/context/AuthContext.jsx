import { useEffect, useRef, useState, useCallback } from "react";
import AuthCtx from "./AuthCore";
import { clearToken, getToken, scheduleLogoutWarning, refreshAccessToken } from "../services/api";

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showWarn, setShowWarn] = useState(false);
  const warnTimerRef = useRef(null);
  const logoutTimerRef = useRef(null);

  const clearTimers = useCallback(() => {
    if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    warnTimerRef.current = null;
    logoutTimerRef.current = null;
  }, []);

  const armTimersForToken = useCallback((token) => {
    clearTimers();
    if (!token) return;

    scheduleLogoutWarning(
      token,
      () => setShowWarn(true),   
      () => logout()              
    );
  }, [clearTimers]);

  useEffect(() => {
    const raw = localStorage.getItem("user");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        setUser(parsed ?? null);
      } catch (e) {
        console.warn("[Auth] Failed to parse user from localStorage:", e);
        localStorage.removeItem("user");
        setUser(null);
      }
    }
    setLoading(false);

    const t = getToken();
    if (t) armTimersForToken(t);
  }, [armTimersForToken]);

  const login = useCallback((userObj, tokenArg) => {
    setUser(userObj);
    try {
      localStorage.setItem("user", JSON.stringify(userObj));
    } catch (e) {
      console.warn("[Auth] Failed to persist user:", e);
    }
    const t = tokenArg ?? getToken();
    if (t) {
      setShowWarn(false);      
      armTimersForToken(t);    
    }
  }, [armTimersForToken]);

  const logout = useCallback(() => {
    clearTimers();
    setShowWarn(false);
    setUser(null);
    try {
      localStorage.removeItem("user");
    } catch (err) {
      console.warn("[Auth] Failed to remove user from localStorage", err)
    }
    clearToken(); 
  }, [clearTimers]);

  async function handleStayLoggedIn() {
    try {
      await refreshAccessToken();
      const fresh = getToken();
      setShowWarn(false);
      armTimersForToken(fresh);
    } catch {
      logout();
    }
  }

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout }}>
      {children}
      {showWarn && (
        <div className="fixed bottom-4 right-4 max-w-sm rounded-xl bg-yellow-100 shadow p-4 text-yellow-900">
          <div className="font-medium mb-2">You’ll be logged out soon</div>
          <p className="text-sm mb-3">
            Your session will expire in about <b>2 minutes</b>.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleStayLoggedIn}
              className="px-3 py-1.5 rounded-md bg-yellow-600 text-white"
            >
              Stay logged in
            </button>
            <button
              onClick={logout}
              className="px-3 py-1.5 rounded-md border border-yellow-700 text-yellow-800"
            >
              Log out now
            </button>
          </div>
        </div>
      )}
    </AuthCtx.Provider>
  );
}

export { AuthCtx };
