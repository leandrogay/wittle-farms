import { useEffect, useRef, useState, useCallback } from "react";
import AuthCtx from "./auth-core";
import { clearToken, getToken, scheduleLogoutWarning } from "../services/api";

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


  return (
    <AuthCtx.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export { AuthCtx };

