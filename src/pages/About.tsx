import React from "react";
import { Link } from "react-router-dom";

const About: React.FC = () => {
  return (
    <div className="d-flex vh-100 justify-content-center align-items-center bg-dark text-light">
      <div className="card bg-secondary text-light shadow-lg p-4" style={{ maxWidth: "500px", width: "100%" }}>
        <h1 className="mb-3 text-center">About</h1>

        <p className="text-center mb-4">
          This is a sample About page. You can describe your app, features,
          tech stack, or purpose here.
        </p>

        <div className="d-flex justify-content-center">
          <Link to="/" className="btn btn-primary">
            Go to Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default About;
