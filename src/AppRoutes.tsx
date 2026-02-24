import { Navigate, Route, Routes } from "react-router-dom";
import Chat from "./pages/Chat";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import Register from "./pages/Register";
import Users from "./pages/Users";
import PrivateRoute from "./components/PrivateRoutes";

const AppRoutes = () => {
  const token = localStorage.getItem("token");

  return (
    <Routes>
      <Route
        path="/"
        element={<Navigate to={token ? "/users" : "/login"} replace />}
      />

      {/* Public Routes */}
      <Route
        path="/login"
        element={token ? <Navigate to="/users" replace /> : <Login />}
      />
      <Route
        path="/register"
        element={token ? <Navigate to="/users" replace /> : <Register />}
      />

      {/* Protected Routes */}
      <Route
        path="/users/create"
        element={
          <PrivateRoute>
            <Register />
          </PrivateRoute>
        }
      />

      <Route
        path="/users"
        element={
          <PrivateRoute>
            <Users />
          </PrivateRoute>
        }
      />

      <Route
        path="/chat"
        element={
          <PrivateRoute>
            <Chat />
          </PrivateRoute>
        }
      />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default AppRoutes;
