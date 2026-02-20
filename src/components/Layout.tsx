import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

interface Props {
  children: ReactNode;
}

const Layout = ({ children }: Props) => {
  const token = localStorage.getItem("token");

  const location = useLocation();

  const logout = () => {
    localStorage.clear();
    window.location.href = "/login";
  };

  return !token ? (
    <>{children}</>
  ) : (
    <div className="d-flex" style={{ height: "100vh" }}>
      {/* Side Drawer */}
      <div className="bg-dark text-white p-3" style={{ width: "240px" }}>
        <h4 className="mb-4">
          My App{" "}
          <button className="btn btn-danger mt-4 w-100" onClick={logout}>
            Logout
          </button>
        </h4>

        <ul className="nav flex-column">
          <li className="nav-item mb-2">
            <Link
              to="/users"
              className={`nav-link ${
                location.pathname === "/users"
                  ? "active bg-secondary text-white"
                  : "text-white"
              }`}
            >
              Users
            </Link>
          </li>

          <li className="nav-item">
            <Link
              to="/chat"
              className={`nav-link ${
                location.pathname === "/chat"
                  ? "active bg-secondary text-white"
                  : "text-white"
              }`}
            >
              Chat
            </Link>
          </li>
        </ul>
      </div>

      {/* Main Content */}
      <div className="flex-grow-1 bg-light p-4">{children}</div>
    </div>
  );
};

export default Layout;
