import { ReactNode, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { socketService } from "../services/socket";

interface Props {
  children: ReactNode;
}

const Layout = ({ children }: Props) => {
  const token = localStorage.getItem("token");
  const userPhone = localStorage.getItem("userPhone") || "";
  const userName = localStorage.getItem("userName") || "";

  const location = useLocation();

  useEffect(() => {
    if (!token || !userPhone) return;

    socketService.connect(userPhone);

    return () => {
      socketService.disconnect();
    };
  }, [token, userPhone]);

  const logout = () => {
    socketService.disconnect();
    localStorage.clear();
    window.location.href = "/login";
  };

  return !token ? (
    <>{children}</>
  ) : (
    <div className="d-flex" style={{ height: "100vh" }}>
      {/* Side Drawer */}
      <div className="bg-dark text-white p-3" style={{ width: "240px" }}>
        <h4 className="mb-3">My App</h4>

        <button className="btn btn-danger w-100" onClick={logout}>
          Logout
        </button>
        <div className="mt-2 small text-white-50">
          {userName ? userName : userPhone}
        </div>

        <ul className="nav flex-column mt-4">
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
