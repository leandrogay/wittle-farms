/** @vitest-environment happy-dom */
import "@testing-library/jest-dom/vitest";
import React from "react";
import { Routes, Route, MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";

// Make the hook a mock function that we can overwrite later
vi.mock("/src/context/useAuth", () => ({
  useAuth: vi.fn(() => ({ user: null, isLoading: false })),
}));

// Now import after the mock so we get the mocked version
import { useAuth } from "/src/context/useAuth";

// Import your component (adjust to named vs default export)
import RequireAuth from "/src/components/auth/RequireAuth";

function Login() { return <div>Login Page</div>; }
function Private() { return <div>Secret</div>; }

const renderRoutes = (initial = "/secret") =>
  render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route element={<RequireAuth />}>
          <Route path="/secret" element={<Private />} />
        </Route>
        <Route path="/login" element={<Login />} />
      </Routes>
    </MemoryRouter>
  );

it("redirects anonymous users to /login", () => {
  // default mock: user null
  renderRoutes("/secret");
  expect(screen.getByText(/login page/i)).toBeInTheDocument();
});

it("renders children when user is present", () => {
  // make the mocked hook return an authenticated user for THIS test
  const mockedUseAuth = vi.mocked(useAuth);
  mockedUseAuth.mockReturnValue({ user: { id: "1", role: "Staff" }, isLoading: false });

  renderRoutes("/secret");
  expect(screen.getByText(/secret/i)).toBeInTheDocument();

  // (optional) reset for safety between tests
  mockedUseAuth.mockReset();
  mockedUseAuth.mockReturnValue({ user: null, isLoading: false });
});
