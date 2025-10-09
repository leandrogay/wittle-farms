import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext.jsx";

import "./index.css";

import App from "./App.jsx";
import Home from "./pages/Home.jsx";
import Tasks from "./pages/Tasks.jsx";
import TaskBoardMgr from "./pages/TaskBoardMgr.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import ResetLinkExpired from "./pages/ResetLinkExpired";
import Calendar from "./pages/Calendar.jsx";
import CreateProject from "./pages/CreateProject.jsx";

import { AuthProvider } from "./context/AuthContext.jsx";
import RequireAuth from "./components/auth/RequireAuth.jsx";
import RequireRole from "./components/auth/RequireRole.jsx";
import RoleRedirect from "./components/auth/RoleRedirect.jsx";

function Unauthorized() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Unauthorized</h1>
      <p className="mt-2 text-gray-600">You don’t have access to this page.</p>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <ThemeProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/unauthorized" element={<Unauthorized />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/reset-link-expired" element={<ResetLinkExpired />} />

            <Route element={<App />}>
              {/* Auth-protected area */}
              <Route element={<RequireAuth />}>
                {/* Landing: send user to the correct page by role */}
                <Route index element={<RoleRedirect />} />

                <Route path="home" element={<Home />} />

                <Route element={<RequireRole roles={["Staff"]} />}>
                  <Route path="tasks" element={<Tasks />} />
                </Route>

                <Route element={<RequireRole roles={["Manager"]} />}>
                  <Route path="taskboard-mgr" element={<TaskBoardMgr />} />
                  <Route path="create-project" element={<CreateProject />} />
                </Route>

                <Route element={<RequireRole roles={["Staff", "Manager"]} />}>
                  <Route path="calendar" element={<Calendar />} />
                </Route>
              </Route>
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </AuthProvider>
  </StrictMode>
);
