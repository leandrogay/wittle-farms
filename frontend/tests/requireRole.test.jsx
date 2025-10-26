/** @vitest-environment happy-dom */
import "@testing-library/jest-dom/vitest";
import React from "react";
import { Routes, Route, MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";

// Mock the auth hook as a mock function we can change per test
vi.mock("/src/context/useAuth", () => ({
  useAuth: vi.fn(() => ({ user: null })), // default: unauthenticated
}));
import { useAuth } from "/src/context/useAuth";

// Import the component (default export)
import RequireRole from "/src/components/auth/RequireRole";

// Tiny demo pages
function Secret() { return <div>Secret Area</div>; }
function Login() { return <div>Login Page</div>; }
function Unauthorized() { return <div>Unauthorized</div>; }

// Helper: render a route protected by RequireRole
function renderWithRoutes({ initial = "/admin", roles = ["Manager"] } = {}) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route element={<RequireRole roles={roles} />}>
          <Route path="/admin" element={<Secret />} />
        </Route>
        <Route path="/login" element={<Login />} />
        <Route path="/unauthorized" element={<Unauthorized />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("RequireRole", () => {
  afterEach(() => {
    // reset the mock to the unauthenticated default between tests
    const mocked = vi.mocked(useAuth);
    mocked.mockReset();
    mocked.mockReturnValue({ user: null });
  });

  it("redirects to /login when no user", () => {
    // default mock returns { user: null }
    renderWithRoutes({ roles: ["Manager"] });
    expect(screen.getByText(/login page/i)).toBeInTheDocument();
  });

  it("redirects to /unauthorized when user role is not allowed", () => {
    const mocked = vi.mocked(useAuth);
    mocked.mockReturnValue({ user: { id: "1", role: "Staff" } });

    renderWithRoutes({ roles: ["Manager", "Director"] });
    expect(screen.getByText(/unauthorized/i)).toBeInTheDocument();
  });

  it("renders the child route when user has an allowed role (single role)", () => {
    const mocked = vi.mocked(useAuth);
    mocked.mockReturnValue({ user: { id: "2", role: "Manager" } });

    renderWithRoutes({ roles: ["Manager"] });
    expect(screen.getByText(/secret area/i)).toBeInTheDocument();
  });

  it("renders the child route when user has an allowed role (any of multiple)", () => {
    const mocked = vi.mocked(useAuth);
    mocked.mockReturnValue({ user: { id: "3", role: "Director" } });

    renderWithRoutes({ roles: ["Manager", "Director", "HR"] });
    expect(screen.getByText(/secret area/i)).toBeInTheDocument();
  });

  // Optional: show that role comparison is case-sensitive by default
  it("blocks access if case does not match (case-sensitive includes)", () => {
    const mocked = vi.mocked(useAuth);
    mocked.mockReturnValue({ user: { id: "4", role: "manager" } }); // lower-case

    renderWithRoutes({ roles: ["Manager"] });
    expect(screen.getByText(/unauthorized/i)).toBeInTheDocument();
  });
});
