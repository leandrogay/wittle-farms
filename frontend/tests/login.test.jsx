/** @vitest-environment happy-dom */
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

/* ---------- Mock router ---------- */
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (orig) => {
  const actual = await orig();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    Link: ({ to, children }) => <a href={to}>{children}</a>,
  };
});

/* ---------- Mock API ---------- */
vi.mock("/src/services/api", () => ({
  loginUser: vi.fn(),
  verifyOtp: vi.fn(),
}));

import { loginUser, verifyOtp } from "/src/services/api";
import Login from "/src/pages/Login.jsx";

const renderLogin = () =>
  render(
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

  it("renders email and password fields", () => {
    renderLogin();
    expect(screen.getByPlaceholderText(/name@example.com/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeInTheDocument();
  });

  it("submits credentials and moves to OTP step", async () => {
    loginUser.mockResolvedValueOnce({});
    renderLogin();

    fireEvent.change(screen.getByPlaceholderText(/name@example.com/i), {
      target: { value: "a@b.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/password/i), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(loginUser).toHaveBeenCalledWith("a@b.com", "123456");
      expect(
        screen.getByText(/we emailed you a 6-digit code/i)
      ).toBeInTheDocument();
    });
  });

  it("shows error message when login fails normally", async () => {
    loginUser.mockRejectedValueOnce({ message: "Invalid credentials" });
    renderLogin();

    fireEvent.change(screen.getByPlaceholderText(/name@example.com/i), {
      target: { value: "wrong@x.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/password/i), {
      target: { value: "bad" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText(/invalid credentials/i)).toBeInTheDocument();
  });

  it("shows unlock time error when login fails with lock info", async () => {
    const unlockTime = Date.now() + 60_000;
    loginUser.mockRejectedValueOnce({
      message: "Too many attempts.",
      unlockTime,
    });

    renderLogin();

    fireEvent.change(screen.getByPlaceholderText(/name@example.com/i), {
      target: { value: "a@b.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/password/i), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      // use flexible matcher because message includes timestamp
      expect(
        screen.getByText((text) =>
          text.toLowerCase().includes("too many attempts")
        )
      ).toBeInTheDocument();
    });
  });

  it("verifies OTP and navigates to home", async () => {
    // First step: after credentials, moves to OTP
    loginUser.mockResolvedValueOnce({});
    verifyOtp.mockResolvedValueOnce({
      token: "abc123",
      user: { name: "Tester" },
    });

    renderLogin();

    // Step 1: Enter credentials
    fireEvent.change(screen.getByPlaceholderText(/name@example.com/i), {
      target: { value: "a@b.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/password/i), {
      target: { value: "goodpass" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    // Wait for OTP step
    await screen.findByText(/6-digit code/i);

    // Step 2: Enter OTP
    fireEvent.change(screen.getByPlaceholderText(/enter 6-digit otp/i), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: /verify otp/i }));

    await waitFor(() => {
      expect(verifyOtp).toHaveBeenCalledWith("a@b.com", "123456");
      expect(localStorage.getItem("auth_token")).toBe("abc123");
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });

  it("shows error if OTP verification fails", async () => {
    loginUser.mockResolvedValueOnce({});
    verifyOtp.mockRejectedValueOnce({ message: "OTP verification failed" });

    renderLogin();

    // Proceed to OTP step
    fireEvent.change(screen.getByPlaceholderText(/name@example.com/i), {
      target: { value: "user@x.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/password/i), {
      target: { value: "goodpass" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await screen.findByText(/6-digit code/i);

    // Enter OTP
    fireEvent.change(screen.getByPlaceholderText(/enter 6-digit otp/i), {
      target: { value: "000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /verify otp/i }));

    expect(await screen.findByText(/otp verification failed/i)).toBeInTheDocument();
  });

  it("shows loading text while verifying OTP", async () => {
    loginUser.mockResolvedValueOnce({});
    verifyOtp.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ token: "t", user: { name: "T" } }), 500))
    );

    renderLogin();

    fireEvent.change(screen.getByPlaceholderText(/name@example.com/i), {
      target: { value: "a@b.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/password/i), {
      target: { value: "pass" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await screen.findByText(/6-digit code/i);

    fireEvent.change(screen.getByPlaceholderText(/enter 6-digit otp/i), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: /verify otp/i }));

    expect(screen.getByRole("button", { name: /verifying/i })).toBeInTheDocument();
  });

  it("clicking 'Back' returns to login page", async () => {
    loginUser.mockResolvedValueOnce({});
    renderLogin();

    // Step to OTP
    fireEvent.change(screen.getByPlaceholderText(/name@example.com/i), {
      target: { value: "test@x.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/password/i), {
      target: { value: "okokok" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await screen.findByText(/6-digit code/i);

    const backButton = screen.getByRole("button", { name: /back/i });
    fireEvent.click(backButton);

    expect(window.location.href).toContain("/login");
  });
});
