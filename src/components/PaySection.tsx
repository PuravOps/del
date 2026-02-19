import React, { useState } from "react";
import { Link } from "react-router-dom";

const PaySection: React.FC = () => {
  const [showConfirm, setShowConfirm] = useState(false);
  const [showResult, setShowResult] = useState(false);

    const [message, setMessage] = useState("Are you sure?");


  const handlePayClick = () => {
    setShowConfirm(true);
  };

  const handleNo = () => {
    setShowConfirm(false);
    setMessage("Are you sure?");
  };

  const handleYes = () => {
    // setShowConfirm(false);
    // setShowResult(true);
    setMessage( e => "Really! " + message);
  };

  const closeResult = () => {
    setShowResult(false);
  };

  return (
    <>
      {/* Pay Button */}
      <div className="d-flex justify-content-center">
        <button
          className="btn btn-success px-4 rounded-pill"
          onClick={handlePayClick}
        >
          Pay
        </button>
      </div>

      {/* Confirm Modal */}
      {showConfirm && (
        <div className="modal d-block" tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content bg-dark text-light border-secondary">
              <div className="modal-header border-secondary">
                <h5 className="modal-title">Confirm Payment</h5>
                <button
                  className="btn-close btn-close-white"
                  onClick={handleNo}
                ></button>
              </div>

              <div className="modal-body text-center">
                <p>{message}</p>
              </div>

              <div className="modal-footer border-secondary">
                <button className="btn btn-outline-light" onClick={handleNo}>
                  No
                </button>
                <button className="btn btn-success" onClick={handleYes}>
                  Yes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Backdrop */}
      {(showConfirm || showResult) && (
        <div className="modal-backdrop show"></div>
      )}
    </>
  );
};

export default PaySection;
