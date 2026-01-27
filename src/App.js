// src/App.js
import React, { useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import "./App.css";
import ReactMarkdown from "react-markdown";

export default function App() {
  const [mode, setMode] = useState("Matrix-2026");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [source, setSource] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const ask = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setAnswer("");
    setSource("");

    const q = question.trim();
    if (!q) {
      setErrorMsg("Please type a question.");
      return;
    }

    try {
      setIsLoading(true);

      const res = await fetch("http://localhost:5050/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, question: q }),
      });

      const data = await res.json();

      setAnswer(data.answer || "");
      setSource(data.source || "");
    } catch (err) {
      setErrorMsg("Could not reach the server. Make sure it is running on port 5050.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-shell">
      {/* NAVBAR */}
      <nav className="navbar navbar-expand-lg navbar-dark bg-dark sticky-top">
        <div className="container-fluid">
          <span className="navbar-brand fw-bold">Compliance Assistant</span>

          {/* Center video loader (only while loading) */}
          <div className="navbar-center">
            {isLoading ? (
              <video
                className="navbar-logo-video"
                src="/logo-animation-video.mp4"
                autoPlay
                loop
                muted
                playsInline
              />
            ) : null}
          </div>

          <div className="d-flex align-items-center gap-2">
            <select
              className="form-select form-select-sm"
              style={{ width: 170 }}
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              disabled={isLoading}
            >
              <option value="Matrix-2026">Matrix-2026</option>
              <option value="Training Guide-2025" disabled>
                Training Guide-2025 (soon)
              </option>
              <option value="QA Form-2023" disabled>
                QA Form-2023 (soon)
              </option>
            </select>
          </div>
        </div>
      </nav>

      {/* HERO (your full screen bg image already handled in CSS) */}
      <main className="container-fluid">
        <div className="hero-container">
          {/* Overlay question card */}
          <div className="hero-overlay">
            <div className="card shadow-lg border-0">
              <div className="card-body">
                <h5 className="mb-2">Ask a policy question</h5>
                <p className="text-secondary small mb-3">
                  Mode: <strong>{mode}</strong>
                </p>

                <form onSubmit={ask}>
                  <textarea
                    className="form-control mb-3"
                    rows={3}
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder='Example: "When do I submit a refund?"'
                    disabled={isLoading}
                  />

                  <button className="btn btn-primary w-100" disabled={isLoading}>
                    {isLoading ? "Searching..." : "Submit Question"}
                  </button>
                </form>

                {/* Error */}
                {errorMsg ? (
                  <div className="alert alert-warning mt-3 mb-0">{errorMsg}</div>
                ) : null}

                {/* Answer */}
                {answer ? (
                  <div className="answer-card mt-3">
                    <ReactMarkdown>{answer}</ReactMarkdown>

                    {source ? (
                      <div className="answer-source mt-3">
                        <strong>Source:</strong> {source}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* Optional: nice inline loader message */}
                {isLoading ? (
                  <div className="loading-hint mt-3 small text-secondary">
                    Please wait… retrieving official documentation.
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* If you still have the tablet/hero image element, keep it here.
              If your background is full screen now, you can remove the img completely. */}
          {/* <img className="hero-img" src="/YOUR_TABLET_IMAGE.png" alt="Hero" /> */}
        </div>
      </main>
    </div>
  );
}
