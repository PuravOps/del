import React from "react";
import InputButton from "../components/InputButton";

const Home: React.FC = () => {
  return (
    <div
      className="d-flex justify-content-center align-items-center"
      style={{
        height: "100vh",
        width: "100vw",
        backgroundColor: "#121212", // dark background
      }}
    >
      <div
        className="card shadow-lg p-5"
        style={{
          minWidth: "350px",
          background: "linear-gradient(145deg, #1e1e1e, #2a2a2a)", // subtle gradient for SaaS feel
          borderRadius: "1rem",
          color: "white",
        }}
      >
        <h1 className="text-center mb-4">Welcome to SaaS SPA</h1>
        <InputButton placeholder="Enter page name (e.g., about)" />
      </div>
    </div>
  );
};

export default Home;
