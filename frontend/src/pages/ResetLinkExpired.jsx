import { Link } from "react-router-dom";

export default function ResetLinkExpired() {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-4">
      <img src="/LF_logo.png" alt="Little Farms" className="w-20 mb-6" />
      <h1 className="text-2xl font-semibold mb-4">Reset link expired</h1>
      <p className="text-red-400 mb-6">Your reset link has expired. Please request a new one.</p>

      <Link
        to="/forgot-password"
        className="bg-white text-black rounded-full px-6 py-2 font-medium hover:bg-neutral-200"
      >
        Request New Link
      </Link>
    </div>
  );
}