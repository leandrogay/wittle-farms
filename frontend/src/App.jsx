import {Outlet} from "react-router-dom";
import Header from "./components/layout/Header.jsx";


function App() {
  return (
    <>
      <Header />
      <Outlet />
    </>
  );
}

export default App;
