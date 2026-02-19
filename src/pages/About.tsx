import React, { useState } from "react";
import { Link } from "react-router-dom";
import PaySection from "../components/PaySection";

const About: React.FC = () => {
  const [showConfirm, setShowConfirm] = useState(false);
  const [showResult, setShowResult] = useState(false);

  return (
    <div className="d-flex vh-100 justify-content-center align-items-center bg-dark text-light">
      <div className="text-center w-100" style={{ maxWidth: "600px" }}>
        {/* Top Title */}
        <h1 className="display-3 text-success mb-4 fw-bold">Lucky!</h1>

        {/* Card */}
        <div className="card bg-secondary text-light shadow-lg p-4 border-0 rounded-4">
          <h2 className="mb-3">Why?</h2>

          <p className="mb-4 text-light" style={{ opacity: 0.85 }}>
            Pay $1 to know why!
          </p>

          {/* <div className="d-flex justify-content-center">
        <Link to="/" className="btn btn-success px-4 rounded-pill">
         Pay
        </Link>
      </div> */}
          {/* <div className="d-flex justify-content-center">
            <button
              className="btn btn-success px-4 rounded-pill"
              onClick={() => setShowConfirm(true)}
            >
              Pay
            </button>
          </div> */}

            <PaySection />
        </div>
      </div>

      {/* {showConfirm && (<PaySection />)} */}
    </div>
  );
};

export default About;
