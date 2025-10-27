/** @vitest-environment happy-dom */
import "@testing-library/jest-dom/vitest";
import React from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen } from "@testing-library/react";

// Mock the auth hook so we can control the user per test
vi.mock("/src/context/useAuth", () => ({
  useAuth: vi.fn(() => ({ user: null })), // default: unauthenticated
}));
import { useAuth } from "/src/context/useAuth";

// Import the component under test (default export)
import RoleRedirect from "/src/components/auth/RoleRedirect";

// Dummy pages
function Login() { return <div>Login Page</div>; }
function Home() { return <div>Home Page</div>; }

// Helper to render the redirection flow
function renderApp(initial = "/") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        {/* RoleRedirect decides where to go from "/" */}
        <Route path="/" element={<RoleRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/home" element={<Home />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("RoleRedirect", () => {
  afterEach(() => {
    // reset back to "unauthenticated" between tests
    const mocked = vi.mocked(useAuth);
    mocked.mockReset();
    mocked.mockReturnValue({ user: null });
  });

  it("redirects to /login when no user", () => {
    // default mock returns { user: null }
    renderApp("/");
    expect(screen.getByText(/login page/i)).toBeInTheDocument();
  });

  it("redirects Staff to /home", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "1", role: "Staff" } });
    renderApp("/");
    expect(screen.getByText(/home page/i)).toBeInTheDocument();
  });

  it("redirects Manager to /home", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "2", role: "Manager" } });
    renderApp("/");
    expect(screen.getByText(/home page/i)).toBeInTheDocument();
  });

  it("redirects Director to /home", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "3", role: "Director" } });
    renderApp("/");
    expect(screen.getByText(/home page/i)).toBeInTheDocument();
  });

  it("redirects HR to /home", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "4", role: "HR" } });
    renderApp("/");
    expect(screen.getByText(/home page/i)).toBeInTheDocument();
  });

  it("redirects Senior Manager to /home", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "5", role: "Senior Manager" } });
    renderApp("/");
    expect(screen.getByText(/home page/i)).toBeInTheDocument();
  });

  it("redirects unknown roles to /home (default case)", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "6", role: "Intern" } });
    renderApp("/");
    expect(screen.getByText(/home page/i)).toBeInTheDocument();
  });
});
