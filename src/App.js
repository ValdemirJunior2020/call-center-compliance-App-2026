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

      const API_BASE = process.env.REACT_APP_API_BASE_URL || "http://localhost:5050";

const res = await fetch(`${API_BASE}/api/ask`, {

        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, question: q }),
      });

      const data = await res.json();
      setAnswer(data.answer || "");
      setSource(data.source || "");
    } catch (err) {
      setErrorMsg(
        "Could not reach the server. Make sure it is running on http://localhost:5050"
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-shell">
      {/* NAVBAR (center logo always, bigger) */}
      <header className="navbar">
        {/* left column (optional brand/title) */}
        <div className="navbar-side navbar-left">
          <span className="navbar-title">Compliance Assistant</span>
        </div>

        {/* center column (logo always centered) */}
        <div className="navbar-center">
        <video
  className={`navbar-logo-video ${isLoading ? "loading" : ""}`}
  src={`${process.env.PUBLIC_URL}/logo-animation-video.mp4`}
  autoPlay
  loop
  muted
  playsInline
/>

        </div>

        {/* right column (mode selector) */}
        <div className="navbar-side navbar-right">
          <select
            className="mode-select"
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
      </header>

      {/* HERO FULL SCREEN */}
      <div className="hero-container">
        {/* Background image */}
        <img className="hero-img" src="/background/hero.png" alt="Background" />

        {/* Overlay */}
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

              {errorMsg ? (
                <div className="alert alert-warning mt-3 mb-0">{errorMsg}</div>
              ) : null}

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

              {isLoading ? (
                <div className="loading-hint mt-3 small text-secondary">
                  Please wait… retrieving official documentation.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
