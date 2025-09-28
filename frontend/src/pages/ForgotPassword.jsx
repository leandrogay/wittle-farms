import { useState } from "react";
import { requestPasswordReset } from "../services/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);


  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");
    setLoading(true);
    
    try {
        const data = await requestPasswordReset(email);
        // If backend provided the hint, show explicit messages; else fall back.
        if (data.emailExists === true) {
        setMessage("Password reset link sent to email. Please check your email");
        } else if (data.emailExists === false) {
        setError("Email not found");
        } else {
        // Fallback for environments not exposing the header (keeps teammates unaffected)
        setMessage(data.message || "If this email is registered, a reset link will be sent.");
        }
        setEmail(""); // clear field
    } catch (err) {
        setError(err.message || "Something went wrong.");
    } finally {
        setLoading(false);
    }
    };


  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-4">
      <img src="/LF_logo.png" alt="Little Farms" className="w-20 mb-6" />
      <h1 className="text-2xl font-semibold mb-6">Reset Password</h1>
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
        <input
          type="email"
          placeholder="Enter your email"
          className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button
            type="submit"
            className="w-full bg-white text-black rounded py-2 font-medium disabled:opacity-50"
            disabled={loading}
        >
            {loading ? "Sending..." : "Send Reset Link"}
        </button>

      </form>

      <p className="mt-6 text-xs text-center">
        <a href="/login" className="text-blue-400">Back to login</a>
      </p>
    </div>
  );
}