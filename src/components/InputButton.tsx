import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const InputButton: React.FC<{ placeholder?: string }> = ({ placeholder }) => {
  const [input, setInput] = useState("");
  const navigate = useNavigate();

  const handleClick = () => {
    if (!input.trim()) return;

    const allowedRoutes = ["about"]; // add your routes here
    if (allowedRoutes.includes(input.toLowerCase())) {
      navigate(`/${input.toLowerCase()}`);
    } else {
      navigate("/404");
    }
  };

  return (
    <div className="d-flex flex-column gap-3">
      <input
        type="text"
        className="form-control"
        style={{
          backgroundColor: "#1e1e1e",
          color: "white",
          border: "1px solid #444",
        }}
        placeholder={placeholder || "Enter page name"}
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      <button
        className="btn btn-primary"
        style={{ backgroundColor: "#007bff", borderColor: "#007bff" }}
        onClick={handleClick}
      >
        Go
      </button>
    </div>
  );
};

export default InputButton;
