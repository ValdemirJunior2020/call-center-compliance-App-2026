import React from "react";

export default function AnswerBox({ answer, source }) {
  return (
    <div className="card bg-dark bg-opacity-75 text-white shadow-sm mt-4">
      <div className="card-body">
        <h6 className="mb-2">Answer</h6>
        <p className="mb-3">{answer}</p>
        <span className="badge bg-secondary">Source: {source}</span>
      </div>
    </div>
  );
}
