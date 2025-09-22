import { useMemo, useState } from "react";
import { registerUser } from "../services/api";
import { useNavigate, Link } from "react-router-dom";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const navigate = useNavigate();

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

  const formValid =
    email &&
    metCount === 5 &&
    passwordsMatch &&
    !loading;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg("");
    if (!formValid) return;

    setLoading(true);
    try {
      await registerUser({
        name: email.split("@")[0],
        email,
        password,
        role: "Staff",
      });
      setMsg("Account created! Please sign in.");
      navigate("/login");
    } catch (err) {
      setMsg(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

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

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-4">
      <img src="/LF_logo.png" alt="Little Farms" className="w-20 mb-6" />
      <h1 className="text-2xl font-semibold mb-6">Create your account</h1>

      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-5">
        <div>
          <label className="block text-sm mb-1 text-neutral-300">Email</label>
          <input
            type="email"
            placeholder="name@example.com"
            className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="block text-sm mb-1 text-neutral-300">
              Password
            </label>
            <button
              type="button"
              onClick={() => setShowPwd((s) => !s)}
              className="text-sm text-neutral-300 hover:text-white"
            >
              {showPwd ? "Hide" : "Show"}
            </button>
          </div>
          <input
            type={showPwd ? "text" : "password"}
            placeholder="At least 8 characters"
            className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <div className="mt-2 h-2 w-full bg-neutral-800 rounded">
            <div
              className={`h-2 rounded ${progressColor} transition-all`}
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div className="mt-3 space-y-2">
            <Bullet ok={rules.hasLen}>At least 8 characters</Bullet>
            <Bullet ok={rules.hasUpper}>One uppercase letter</Bullet>
            <Bullet ok={rules.hasLower}>One lowercase letter</Bullet>
            <Bullet ok={rules.hasNum}>One number</Bullet>
            <Bullet ok={rules.hasSpecial}>One special character</Bullet>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="block text-sm mb-1 text-neutral-300">
              Confirm password
            </label>
            <button
              type="button"
              onClick={() => setShowConfirm((s) => !s)}
              className="text-sm text-neutral-300 hover:text-white"
            >
              {showConfirm ? "Hide" : "Show"}
            </button>
          </div>
          <input
            type={showConfirm ? "text" : "password"}
            placeholder="Re-enter password"
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
            <p className="mt-2 text-xs text-red-400">Passwords do not match.</p>
          )}
        </div>

        <button
          className="w-full bg-white text-black rounded-full py-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!formValid}
        >
          {loading ? "Creating..." : "Create account"}
        </button>
      </form>

      {msg && (
        <p className="mt-4 text-sm text-center text-neutral-200">{msg}</p>
      )}

      <p className="mt-4 text-xs">
        Already have an account?{" "}
        <Link to="/login" className="text-blue-400">
          Sign in
        </Link>
      </p>

      <footer className="absolute bottom-4 text-xs text-gray-500">
        © 2025 Wittle Farms. All rights reserved.
      </footer>
    </div>
  );
}
