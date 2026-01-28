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
  const [proof, setProof] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [engine, setEngine] = useState("openai"); // openai | claude

  const API_BASE =
    process.env.REACT_APP_API_BASE_URL || "http://localhost:5050";

  const ask = async (e, forcedEngine) => {
    if (e) e.preventDefault();

    const pickedEngine = forcedEngine || engine;
    setEngine(pickedEngine);

    setErrorMsg("");
    setAnswer("");
    setSource("");
    setProof([]);

    const q = question.trim();
    if (!q) {
      setErrorMsg("Please type a question.");
      return;
    }

    try {
      setIsLoading(true);

      const res = await fetch(`${API_BASE}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, question: q, engine: pickedEngine }),
      });

      const data = await res.json();
      setAnswer(data.answer || "");
      setSource(data.source || "");
      setProof(Array.isArray(data.proof) ? data.proof : []);
    } catch (err) {
      setErrorMsg(
        `Could not reach the server. Make sure it is running on ${API_BASE}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  // -------------------------
  // Parsing helpers (from answer text)
  // -------------------------
  const pickLineValue = (text, label) => {
    const re = new RegExp(`^\\s*${label}\\s*:\\s*(.+)\\s*$`, "im");
    const m = String(text || "").match(re);
    return m ? String(m[1]).trim() : "";
  };

  const normalizeDecision = (raw) => {
    const v = String(raw || "").trim();
    if (!v) return { text: "not specified", tone: "neutral" };

    const upper = v.toUpperCase();

    if (upper.includes("YES")) return { text: v, tone: "good" };
    if (upper.includes("NO") || upper.includes("NONE"))
      return { text: v, tone: "bad" };

    if (upper.startsWith("YES")) return { text: v, tone: "good" };
    if (upper.startsWith("NO") || upper.startsWith("NONE"))
      return { text: v, tone: "bad" };

    return { text: v, tone: "neutral" };
  };

  const extractSections = (text) => {
    const t = String(text || "");

    const getBlock = (start, endOptions) => {
      const startRe = new RegExp(`\\n\\s*${start}\\s*\\n`, "i");
      const startIdx = t.search(startRe);
      if (startIdx === -1) return "";

      const afterStart = t.slice(startIdx + t.match(startRe)[0].length);

      let endIdx = afterStart.length;
      for (const end of endOptions) {
        const endRe = new RegExp(`\\n\\s*${end}\\s*\\n`, "i");
        const i = afterStart.search(endRe);
        if (i !== -1 && i < endIdx) endIdx = i;
      }

      return afterStart.slice(0, endIdx).trim();
    };

    const escalation = getBlock("escalation / what to do first", [
      "quick answer",
      "steps to follow",
      "routing",
      "source rows",
    ]);

    const quickAnswer = getBlock("quick answer", [
      "steps to follow",
      "routing",
      "source rows",
    ]);

    const steps = getBlock("steps to follow", ["routing", "source rows"]);

    const slackRaw = pickLineValue(t, "slack");
    const refundRaw = pickLineValue(t, "refund queue");
    const ticketRaw = pickLineValue(t, "create a ticket");
    const supervisorRaw = pickLineValue(t, "supervisor");

    return {
      escalation,
      quickAnswer,
      steps,
      routing: {
        slack: normalizeDecision(slackRaw),
        refundQueue: normalizeDecision(refundRaw),
        createTicket: normalizeDecision(ticketRaw),
        supervisor: normalizeDecision(supervisorRaw),
      },
    };
  };

  const sections = extractSections(answer);

  return (
    <div className="app-shell">
      {/* NAVBAR */}
      <header className="navbar">
        <div className="navbar-side navbar-left">
          <span className="navbar-title">Call-Center Compliance Assistant</span>
        </div>

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

        <div className="navbar-side navbar-right">
          <select
            className="mode-select"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            disabled={isLoading}
          >
            <option value="Matrix-2026">Matrix-2026</option>
            <option value="Training Guide-2025" disabled>
              Training Guide-2025 (next)
            </option>
          </select>
        </div>
      </header>

      {/* HERO */}
      <div className="hero-container">
        <img className="hero-img" src="/background/hero.png" alt="Background" />

        <div className="hero-overlay">
          <div className="card minimal-card">
            <div className="card-body minimal-body">
              <div className="header-row">
                <div className="muted">
                  Mode: <strong>{mode}</strong> <span className="dot">•</span>{" "}
                  Engine:{" "}
                  <strong>{engine === "claude" ? "Claude" : "ChatGPT"}</strong>
                </div>
              </div>

              <form onSubmit={(e) => ask(e, engine)}>
                <textarea
                  className="form-control minimal-input"
                  rows={3}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder='Example: "Reservation not found at check-in"'
                  disabled={isLoading}
                />

                {/* Skeuo 3D button row */}
                <div className="btn-row skeuo-row">
                  <button
                    type="button"
                    className={`skeuo-btn ${
                      engine === "openai" ? "is-active" : ""
                    }`}
                    disabled={isLoading}
                    onClick={(e) => ask(e, "openai")}
                    aria-pressed={engine === "openai"}
                  >
                    <span className="skeuo-btn__shine" />
                    <span className="skeuo-btn__label">ChatGPT Help</span>
                    <span className="skeuo-btn__dot" />
                  </button>

                  <button
                    type="button"
                    className={`skeuo-btn skeuo-btn--alt ${
                      engine === "claude" ? "is-active" : ""
                    }`}
                    disabled={isLoading}
                    onClick={(e) => ask(e, "claude")}
                    aria-pressed={engine === "claude"}
                  >
                    <span className="skeuo-btn__shine" />
                    <span className="skeuo-btn__label">Claude Help</span>
                    <span className="skeuo-btn__dot" />
                  </button>
                </div>
              </form>

              {errorMsg ? (
                <div className="alert alert-warning mt-3 mb-0">{errorMsg}</div>
              ) : null}

              {answer ? (
                <div className="answer-wrap">
                  {/* ROUTING STRIP (top row) */}
                  <div className="routing-strip">
                    <div className="routing-item">
                      <div className="routing-label">Slack</div>
                      <div
                        className={`routing-value tone-${sections.routing.slack.tone}`}
                      >
                        {sections.routing.slack.text}
                      </div>
                    </div>

                    <div className="routing-item">
                      <div className="routing-label">Refund Queue</div>
                      <div
                        className={`routing-value tone-${sections.routing.refundQueue.tone}`}
                      >
                        {sections.routing.refundQueue.text}
                      </div>
                    </div>

                    <div className="routing-item">
                      <div className="routing-label">Create a Ticket</div>
                      <div
                        className={`routing-value tone-${sections.routing.createTicket.tone}`}
                      >
                        {sections.routing.createTicket.text}
                      </div>
                    </div>

                    <div className="routing-item">
                      <div className="routing-label">Supervisor</div>
                      <div
                        className={`routing-value tone-${sections.routing.supervisor.tone}`}
                      >
                        {sections.routing.supervisor.text}
                      </div>
                    </div>
                  </div>

                  {/* MAIN ANSWER */}
                  <div className="answer-card left-align">
                    {sections.escalation ? (
                      <>
                        <div className="section-title">
                          escalation / what to do first
                        </div>
                        <div className="section-text">
                          <ReactMarkdown>{sections.escalation}</ReactMarkdown>
                        </div>
                      </>
                    ) : null}

                    {sections.quickAnswer ? (
                      <>
                        <div className="section-title">Quick Answer</div>
                        <div className="section-text">
                          <ReactMarkdown>{sections.quickAnswer}</ReactMarkdown>
                        </div>
                      </>
                    ) : null}

                    {sections.steps ? (
                      <>
                        <div className="section-title">Steps to follow</div>
                        <div className="section-text">
                          <ReactMarkdown>{sections.steps}</ReactMarkdown>
                        </div>
                      </>
                    ) : null}

                    {source ? (
                      <div className="answer-meta">
                        <span className="meta-label">Source:</span> {source}
                      </div>
                    ) : null}
                  </div>

                  {/* PROOF */}
                  {proof.length ? (
                    <div className="proof-mini">
                      <div className="proof-title">Matched rows (proof)</div>
                      <ul className="proof-list">
                        {proof.slice(0, 5).map((p, idx) => (
                          <li key={idx} className="proof-item">
                            <span className="proof-main">
                              {p.tab} • Row {p.row ?? "?"}
                            </span>
                            <span className="proof-score">{p.score ?? ""}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {isLoading ? (
                <div className="loading-hint">Searching documentation…</div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
