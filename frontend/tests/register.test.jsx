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
  registerUser: vi.fn(),
}));

import { registerUser } from "/src/services/api";
import Register from "/src/pages/Register.jsx";

const renderRegister = () =>
  render(
    <MemoryRouter>
      <Register />
    </MemoryRouter>
  );

/* ---------- Tests ---------- */
describe("Register component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all form fields", () => {
    renderRegister();
    // Use placeholder instead of label for robustness
    expect(screen.getByPlaceholderText(/name@example.com/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/at least 8 characters/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/re-enter password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
  });

  it("updates password rules as user types", () => {
    renderRegister();
    const pwd = screen.getByPlaceholderText(/at least 8 characters/i);

    fireEvent.change(pwd, { target: { value: "Ab1!" } });
    // Not all requirements met
    expect(screen.getByText(/at least 8 characters/i).previousSibling).not.toHaveTextContent("✓");

    fireEvent.change(pwd, { target: { value: "Abcdef1!" } });
    // Now all 5 conditions should pass
    expect(screen.getByText(/at least 8 characters/i).previousSibling).toHaveTextContent("✓");
    expect(screen.getByText(/one uppercase letter/i).previousSibling).toHaveTextContent("✓");
    expect(screen.getByText(/one lowercase letter/i).previousSibling).toHaveTextContent("✓");
    expect(screen.getByText(/one number/i).previousSibling).toHaveTextContent("✓");
    expect(screen.getByText(/one special character/i).previousSibling).toHaveTextContent("✓");
  });

  it("shows mismatch message if passwords differ", () => {
    renderRegister();
    const pwd = screen.getByPlaceholderText(/at least 8 characters/i);
    const confirm = screen.getByPlaceholderText(/re-enter password/i);

    fireEvent.change(pwd, { target: { value: "Abcd1234!" } });
    fireEvent.change(confirm, { target: { value: "different" } });

    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
  });

  it("toggles password visibility for both fields", () => {
    renderRegister();

    const pwdInput = screen.getByPlaceholderText(/at least 8 characters/i);
    const buttons = screen.getAllByRole("button", { name: /show/i });

    // First "Show" for password
    fireEvent.click(buttons[0]);
    expect(pwdInput).toHaveAttribute("type", "text");

    // Second "Show" for confirm password
    const confirmInput = screen.getByPlaceholderText(/re-enter password/i);
    fireEvent.click(buttons[1]);
    expect(confirmInput).toHaveAttribute("type", "text");
  });

  it("disables submit button until form is valid", () => {
    renderRegister();
    const btn = screen.getByRole("button", { name: /create account/i });
    expect(btn).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/name@example.com/i), {
      target: { value: "user@x.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/at least 8 characters/i), {
      target: { value: "Abcd1234!" },
    });
    fireEvent.change(screen.getByPlaceholderText(/re-enter password/i), {
      target: { value: "Abcd1234!" },
    });
    expect(btn).not.toBeDisabled();
  });

  it("calls registerUser and navigates to login on success", async () => {
    registerUser.mockResolvedValueOnce({});
    renderRegister();

    fireEvent.change(screen.getByPlaceholderText(/name@example.com/i), {
      target: { value: "user@x.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/at least 8 characters/i), {
      target: { value: "Abcd1234!" },
    });
    fireEvent.change(screen.getByPlaceholderText(/re-enter password/i), {
      target: { value: "Abcd1234!" },
    });

    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(registerUser).toHaveBeenCalledWith({
        name: "user",
        email: "user@x.com",
        password: "Abcd1234!",
        role: "Staff",
      });
      expect(mockNavigate).toHaveBeenCalledWith("/login");
    });
  });

  it("shows error message when registration fails", async () => {
    registerUser.mockRejectedValueOnce({ message: "Email already used" });
    renderRegister();

    fireEvent.change(screen.getByPlaceholderText(/name@example.com/i), {
      target: { value: "used@x.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/at least 8 characters/i), {
      target: { value: "Abcd1234!" },
    });
    fireEvent.change(screen.getByPlaceholderText(/re-enter password/i), {
      target: { value: "Abcd1234!" },
    });

    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/email already used/i)).toBeInTheDocument();
  });

  it("shows loading text while submitting", async () => {
    registerUser.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 300)));
    renderRegister();

    fireEvent.change(screen.getByPlaceholderText(/name@example.com/i), {
      target: { value: "a@x.com" },
    });
    fireEvent.change(screen.getByPlaceholderText(/at least 8 characters/i), {
      target: { value: "Abcd1234!" },
    });
    fireEvent.change(screen.getByPlaceholderText(/re-enter password/i), {
      target: { value: "Abcd1234!" },
    });

    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    expect(screen.getByRole("button", { name: /creating/i })).toBeInTheDocument();
  });
});
