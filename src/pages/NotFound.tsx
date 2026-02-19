import React from "react";
import { Link } from "react-router-dom";

const NotFound: React.FC = () => {
  return (
    <div className="vw-100 vh-100 bg-dark">
      {/* Left side empty or some background */}
      <div className="flex-fill"></div>

      {/* Right side content */}
      <div className="d-flex flex-column justify-content-center align-items-center flex-fill text-light p-5">
        <h1 className="display-1 text-danger">Sorry!</h1>
        <p className="lead mb-3">Your name is not lucky.</p>
        <Link to="/" className="btn btn-primary">
          Go Home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
