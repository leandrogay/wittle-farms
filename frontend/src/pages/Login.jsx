import { useRef, useState, useEffect } from "react";
import { loginUser, verifyOtp } from "../services/api";
import { useNavigate, Link } from "react-router-dom";

export default function Login() {
    const [step, setStep] = useState("creds");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [otp, setOtp] = useState("");
    const [error, setError] = useState("");
    const [info, setInfo] = useState("");
    const [loading, setLoading] = useState(false);

    const navigate = useNavigate();

    const loginReqId = useRef(0);

    useEffect(() => {
        return () => {
            loginReqId.current += 1;
        };
    }, []);

    const handleCreds = async (e) => {
        e.preventDefault();
        setError(""); setInfo(""); setLoading(true);

        try {
            await loginUser(email, password);
            setStep("otp");
            setInfo("We emailed you a 6-digit code. Check your inbox.");
        } catch (err) {
            if (err.unlockTime) {
                const until = new Date(err.unlockTime).toLocaleTimeString();
                setError(`${err.message} You can try again at ${until}.`);
            } else {
                setError(err.message || "Invalid email or password");
            }
        } finally {
            setLoading(false);
        }
    };

    const handleOtp = async (e) => {
        e.preventDefault();
        setError("");
        setInfo("");
        setLoading(true);

        try {
            const { token, user } = await verifyOtp(email, otp);
            localStorage.setItem("auth_token", token);
            setInfo(`Welcome, ${user.name}!`);
            navigate("/");
        } catch (err) {
            setError(err.message || "OTP verification failed");
        } finally {
            setLoading(false);
        }
    };

    const handleBack = () => {
        window.location.href = "/login";
    };



    return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-4">
            <img src="/LF_logo.png" alt="Little Farms" className="w-20 mb-6" />
            <h1 className="text-2xl font-semibold mb-6">Sign in</h1>

            <div className="w-full max-w-md">
                {error && (
                    <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 px-3 py-2 text-sm">
                        {error}
                    </div>
                )}
                {info && (
                    <div className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 px-3 py-2 text-sm">
                        {info}
                    </div>
                )}

                {step === "creds" ? (
                    <form onSubmit={handleCreds} className="space-y-4">
                        <input
                            type="email"
                            placeholder="name@example.com"
                            className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            autoFocus
                        />
                        <input
                            type="password"
                            placeholder="Password"
                            className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                        <button
                            className="w-full bg-white text-black rounded py-2 font-medium disabled:opacity-50"
                            disabled={loading}
                        >
                            {loading ? "Sending code..." : "Continue"}
                        </button>
                        <p className="text-xs text-gray-400 text-center">
                            After password, we'll send a 6-digit code to your email.
                        </p>
                        <p className="text-xs text-center mt-2">Forgot email or password?</p>
                        <p className="text-xs text-center">
                            Don’t have an account?{" "}
                            <Link to="/register" className="text-blue-400">
                                Sign up
                            </Link>
                        </p>
                    </form>
                ) : (
                    <form onSubmit={handleOtp} className="space-y-4">
                        <input
                            type="text"
                            placeholder="Enter 6-digit OTP"
                            inputMode="numeric"
                            maxLength={6}
                            className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 tracking-widest text-center"
                            value={otp}
                            onChange={(e) => setOtp(e.target.value)}
                            required
                            autoFocus
                        />
                        <button
                            className="w-full bg-white text-black rounded py-2 font-medium disabled:opacity-50"
                            disabled={loading}
                        >
                            {loading ? "Verifying..." : "Verify OTP"}
                        </button>
                        <button
                            type="button"
                            onClick={handleBack}
                            className="w-full border border-neutral-700 rounded py-2"
                        >
                            Back
                        </button>
                    </form>
                )}
            </div>

            <footer className="absolute bottom-4 text-xs text-gray-500">
                © 2025 Wittle Farms. All rights reserved.
            </footer>
        </div>
    );
}
