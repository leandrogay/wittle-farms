/** @vitest-environment happy-dom */
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

// --- Mock navigation & Link ---
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (orig) => {
  const actual = await orig();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    Link: ({ to, children }) => <a href={to}>{children}</a>,
  };
});

vi.mock("/src/services/api", () => ({
  loginUser: vi.fn(),
  verifyOtp: vi.fn(),
}));

import { loginUser, verifyOtp } from "/src/services/api";
import Login from "/src/pages/Login.jsx";


const renderLogin = () => render(
  <MemoryRouter>
    <Login />
  </MemoryRouter>
);

/* ---------- Tests ---------- */
describe("Login component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("renders email/password fields and instructions", () => {
    renderLogin();
    expect(screen.getByPlaceholderText(/name@example.com/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/password/i)).toBeInTheDocument();
    expect(screen.getByText(/after password/i)).toBeInTheDocument();
  });

  it("successful credential submit switches to OTP step", async () => {
    loginUser.mockResolvedValueOnce({});

    renderLogin();
    fireEvent.change(screen.getByPlaceholderText(/name@example.com/i), { target: { value: "test@x.com" } });
    fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: "pw123" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(loginUser).toHaveBeenCalledWith("test@x.com", "pw123"));
    expect(await screen.findByText(/we emailed you/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/enter 6-digit otp/i)).toBeInTheDocument();
  });

  it("shows unlock time error when login fails with lock info", async () => {
    const unlockTime = new Date().toISOString();
    loginUser.mockRejectedValueOnce({
      message: "Too many attempts.",
      unlockTime,
    });

    renderLogin();
    fireEvent.change(screen.getByPlaceholderText(/name@example.com/i), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument();
    expect(screen.getByText(/you can try again/i)).toBeInTheDocument();
  });

  it("shows generic error when login fails without unlockTime", async () => {
    loginUser.mockRejectedValueOnce({ message: "Invalid email or password" });
    renderLogin();
    fireEvent.change(screen.getByPlaceholderText(/name@example.com/i), { target: { value: "bad@x.com" } });
    fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: "pw" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument();
  });

  it("verifies OTP and navigates home", async () => {
    // move to OTP step
    loginUser.mockResolvedValue({});
    verifyOtp.mockResolvedValue({
      token: "abc123",
      user: { name: "Tester" },
    });

    renderLogin();
    fireEvent.change(screen.getByPlaceholderText(/name@example.com/i), { target: { value: "user@x.com" } });
    fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: "pw" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await screen.findByPlaceholderText(/enter 6-digit otp/i);

    // perform OTP verify
    fireEvent.change(screen.getByPlaceholderText(/enter 6-digit otp/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /verify otp/i }));

    await waitFor(() => {
      expect(verifyOtp).toHaveBeenCalledWith("user@x.com", "123456");
      expect(localStorage.getItem("auth_token")).toBe("abc123");
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });

  it("shows error if OTP verification fails", async () => {
    loginUser.mockResolvedValue({});
    verifyOtp.mockRejectedValue({ message: "OTP verification failed" });

    renderLogin();
    fireEvent.change(screen.getByPlaceholderText(/name@example.com/i), { target: { value: "a@x.com" } });
    fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: "pw" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await screen.findByPlaceholderText(/enter 6-digit otp/i);

    fireEvent.change(screen.getByPlaceholderText(/enter 6-digit otp/i), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: /verify otp/i }));

    expect(await screen.findByText(/otp verification failed/i)).toBeInTheDocument();
  });

  it("Back button redirects to /login", async () => {
    delete window.location;
    window.location = { href: "" };

    loginUser.mockResolvedValue({});
    renderLogin();
    fireEvent.change(screen.getByPlaceholderText(/name@example.com/i), { target: { value: "z@x.com" } });
    fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: "pw" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await screen.findByRole("button", { name: /back/i });
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(window.location.href).toBe("/login");
  });
});
