import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import Home from "./pages/Home.jsx";
import Tasks from "./pages/Tasks.jsx";
import TaskBoardMgr from "./pages/TaskBoardMgr.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Home />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="TaskBoardMgr" element={<TaskBoardMgr />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
