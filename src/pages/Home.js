import React from "react";
import QuestionInput from "../components/forms/QuestionInput";

export default function Home() {
  return (
    <div className="row justify-content-center">
      <div className="col-12 col-lg-8">

        {/* Intro */}
        <div className="card bg-dark bg-opacity-75 text-white shadow-sm mb-4">
          <div className="card-body">
            <h5 className="card-title mb-2">
              Closed-Book Compliance Assistant
            </h5>
            <p className="mb-0 text-white-50">
              This tool answers questions using only the selected document mode.
            </p>
          </div>
        </div>

        {/* Question Box */}
        <QuestionInput />

      </div>
    </div>
  );
}
