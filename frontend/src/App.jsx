import { Outlet } from "react-router-dom";
import Header from "./components/layout/Header.jsx";
import { useEffect } from "react";
import { getMe, getSession } from "./services/api";


function App() {
  useEffect(() => {
    (async () => {
      try {
        const { session } = await getSession();
        console.log("[SESSION]", session);

        const { user } = await getMe();
        console.log("[USER]", user);
      } catch (err) {
        console.warn("No active session:", err.message);
      }
    });
  }, []);

  return (
    <div className="bg-zinc-200">
      <Header />
      <Outlet />
    </div>
  );
}

export default App;
