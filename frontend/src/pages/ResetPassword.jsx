import { useState, useMemo } from "react";   // ⬅️ added useMemo here
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { resetPassword } from "../services/api";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  // 🔹 NEW: password strength rules (same as Register.jsx)
  const rules = useMemo(() => {
    const hasLen = password.length >= 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNum = /\d/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);
    return { hasLen, hasUpper, hasLower, hasNum, hasSpecial };
  }, [password]);

  const metCount = Object.values(rules).filter(Boolean).length;
  const progressPct = (metCount / 5) * 100;
  const progressColor =
    metCount <= 2
      ? "bg-red-500"
      : metCount === 3
      ? "bg-yellow-500"
      : metCount === 4
      ? "bg-amber-400"
      : "bg-emerald-500";

  const passwordsMatch = confirm.length > 0 && password === confirm;

  // 🔹 NEW: Bullet component for rule display
  const Bullet = ({ ok, children }) => (
    <div className="flex items-center gap-2 text-sm">
      <span
        className={`inline-flex h-4 w-4 items-center justify-center rounded-full border ${
          ok
            ? "border-emerald-500 text-emerald-500"
            : "border-neutral-600 text-neutral-500"
        }`}
      >
        {ok ? "✓" : ""}
      </span>
      <span className={ok ? "text-emerald-300" : "text-neutral-300"}>
        {children}
      </span>
    </div>
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!token) {
      return setError("Invalid or missing token.");
    }
    if (metCount < 5) {   // ⬅️ updated: enforce strong password, not just length
      return setError("Password must meet all requirements");
    }
    if (!passwordsMatch) {
      return setError("Passwords do not match");
    }

    setLoading(true);
    try {
      await resetPassword(token, password);
      setMessage("Password updated successfully. Redirecting to login...");
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      setError(err.message || "Reset failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-4">
      <img src="/LF_logo.png" alt="Little Farms" className="w-20 mb-6" />
      <h1 className="text-2xl font-semibold mb-6">Create a New Password</h1>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 px-3 py-2 text-sm">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 px-3 py-2 text-sm">
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4">
        {/* 🔹 NEW PASSWORD with progress bar + rules */}
        <div>
          <input
            type="password"
            placeholder="New password"
            className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {/* progress bar */}
          <div className="mt-2 h-2 w-full bg-neutral-800 rounded">
            <div
              className={`h-2 rounded ${progressColor} transition-all`}
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {/* bullet rules */}
          <div className="mt-3 space-y-2">
            <Bullet ok={rules.hasLen}>At least 8 characters</Bullet>
            <Bullet ok={rules.hasUpper}>One uppercase letter</Bullet>
            <Bullet ok={rules.hasLower}>One lowercase letter</Bullet>
            <Bullet ok={rules.hasNum}>One number</Bullet>
            <Bullet ok={rules.hasSpecial}>One special character</Bullet>
          </div>
        </div>

        {/* CONFIRM PASSWORD */}
        <div>
          <input
            type="password"
            placeholder="Confirm new password"
            className={`w-full bg-neutral-900 border rounded px-3 py-2 ${
              confirm.length === 0
                ? "border-neutral-700"
                : passwordsMatch
                ? "border-emerald-500"
                : "border-red-500"
            }`}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
          {confirm.length > 0 && !passwordsMatch && (
            <p className="mt-2 text-xs text-red-400">Passwords do not match</p>
          )}
        </div>

        <button
          type="submit"
          className="w-full bg-white text-black rounded py-2 font-medium disabled:opacity-50"
          disabled={loading}
        >
          {loading ? "Updating..." : "Update Password"}
        </button>
      </form>

      <p className="mt-6 text-xs text-center">
        <Link to="/login" className="text-blue-400">
          Back to login
        </Link>
      </p>
    </div>
  );
}
