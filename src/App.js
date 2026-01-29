// src/App.js
import React, { useMemo, useState } from "react";
import "./App.css";

const API_BASE = process.env.REACT_APP_API_BASE_URL || "http://localhost:5050";

// public assets
const HERO_IMG_SRC = "/background/hero.png";
const NAV_LOGO_VIDEO_SRC = "/logo-animation-video.mp4";

const HEADINGS = ["Acknowledge", "Matrix Reference", "Step-by-step Guidance", "Source"];

function parseAnswerSections(answerText) {
  const text = String(answerText || "");
  const sections = {};

  for (let i = 0; i < HEADINGS.length; i++) {
    const h = HEADINGS[i];
    const start = text.indexOf(h + "\n");
    if (start === -1) continue;

    const next = HEADINGS[i + 1];
    const nextStart = next ? text.indexOf("\n\n" + next + "\n", start) : -1;

    const block = nextStart !== -1 ? text.slice(start, nextStart) : text.slice(start);
    sections[h] = block.slice((h + "\n").length).trim();
  }

  return sections;
}

function extractNumberedSteps(stepSectionText) {
  const lines = String(stepSectionText || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const steps = [];
  for (const line of lines) {
    const m = line.match(/^(\d+)\.\s*(.+)$/);
    if (m) steps.push(m[2].trim());
  }
  return steps;
}

// ✅ Determines if routing should be green/red/neutral
function getSignal(value) {
  const v = String(value || "").trim();
  if (!v) return "neutral";

  const up = v.toUpperCase();
  if (up.includes("NONE")) return "no";
  if (up === "NO" || up.startsWith("NO")) return "no";
  if (up === "YES" || up.startsWith("YES")) return "yes";
  return "neutral";
}

function getBadgeText(value) {
  const v = String(value || "").trim();
  if (!v) return "—";
  const up = v.toUpperCase();
  if (up.includes("NONE")) return "NO";
  if (up.startsWith("YES")) return "YES";
  if (up.startsWith("NO")) return "NO";
  return "INFO";
}

export default function App() {
  const [mode, setMode] = useState("Matrix-2026");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);

  const [apiResult, setApiResult] = useState(null);
  const [apiError, setApiError] = useState("");

  const sections = useMemo(() => parseAnswerSections(apiResult?.answer || ""), [apiResult]);
  const steps = useMemo(
    () => extractNumberedSteps(sections["Step-by-step Guidance"]),
    [sections]
  );

  // ✅ routing now comes from backend JSON (not from answer text)
  const routing = apiResult?.routing || null;

  const showRouting = Boolean(routing); // only show pills when routing exists

  async function onAsk(e) {
    e.preventDefault();
    setApiError("");
    setApiResult(null);

    const q = question.trim();
    if (!q) {
      setApiError("Type a scenario first.");
      return;
    }

    try {
      setLoading(true);

      const resp = await fetch(`${API_BASE}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, question: q }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        setApiError(data?.error || "Request failed.");
        return;
      }

      setApiResult(data);
    } catch (err) {
      setApiError("Could not reach backend. Make sure server is running on http://localhost:5050");
    } finally {
      setLoading(false);
    }
  }

  const slackSig = getSignal(routing?.slack);
  const rqSig = getSignal(routing?.refundQueue);
  const ticketSig = getSignal(routing?.ticket);
  const supSig = getSignal(routing?.supervisor);

  return (
    <div className="app-shell">
      {/* NAVBAR */}
      <div className="navbar">
        <div className="navbar-side navbar-left">
          <div className="navbar-title">Call Center Compliance Guide</div>
        </div>

        <div className="navbar-side navbar-center">
          <video
            className={`navbar-logo-video ${loading ? "loading" : ""}`}
            src={NAV_LOGO_VIDEO_SRC}
            autoPlay
            muted
            loop
            playsInline
          />
        </div>

        <div className="navbar-side navbar-right">
          <select className="mode-select" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="Matrix-2026">Matrix-2026</option>
          </select>
        </div>
      </div>

      {/* HERO */}
      <div className="hero-container">
        <img className="hero-img" src={HERO_IMG_SRC} alt="Hero background" />

        <div className="hero-overlay">
          <div className={`minimal-card ${loading ? "loading-glow" : ""}`}>
            <div className="minimal-body">
              <div className="header-row">
                <div className="muted">
                  Ask a scenario <span className="dot">•</span> Get matrix steps
                </div>
              </div>

              <form onSubmit={onAsk}>
                <textarea
                  className="minimal-input"
                  rows={4}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder='Example: "hotel sold out"'
                  style={{ width: "100%", padding: 12 }}
                />

                <div className="btn-row">
                  <button className="btn-skeuo" type="submit" disabled={loading}>
                    {loading ? "Checking..." : "Get Guidance"}
                  </button>
                </div>

                {apiError ? (
                  <div className="loading-hint" style={{ color: "#ff5a6a" }}>
                    {apiError}
                  </div>
                ) : null}
              </form>

              {/* ANSWER */}
              {apiResult?.answer ? (
                <div className="answer-wrap">
                  {/* ROUTING STRIP (ONLY when routing exists) */}
                  {showRouting && (
                    <div className="routing-strip">
                      <div className="routing-item">
                        <div className="routing-label">Slack</div>
                        <button type="button" className={`route-pill ${slackSig}`} title={routing?.slack || ""}>
                          <span className="route-icon">💬</span>
                          {getBadgeText(routing?.slack)}
                        </button>
                        <div className="routing-value tone-neutral">{routing?.slack || "—"}</div>
                      </div>

                      <div className="routing-item">
                        <div className="routing-label">Refund Queue</div>
                        <button type="button" className={`route-pill ${rqSig}`} title={routing?.refundQueue || ""}>
                          <span className="route-icon">💳</span>
                          {getBadgeText(routing?.refundQueue)}
                        </button>
                        <div className="routing-value tone-neutral">{routing?.refundQueue || "—"}</div>
                      </div>

                      <div className="routing-item">
                        <div className="routing-label">Create a Ticket</div>
                        <button type="button" className={`route-pill ${ticketSig}`} title={routing?.ticket || ""}>
                          <span className="route-icon">🎫</span>
                          {getBadgeText(routing?.ticket)}
                        </button>
                        <div className="routing-value tone-neutral">{routing?.ticket || "—"}</div>
                      </div>

                      <div className="routing-item">
                        <div className="routing-label">Supervisor</div>
                        <button type="button" className={`route-pill ${supSig}`} title={routing?.supervisor || ""}>
                          <span className="route-icon">👤</span>
                          {getBadgeText(routing?.supervisor)}
                        </button>
                        <div className="routing-value tone-neutral">{routing?.supervisor || "—"}</div>
                      </div>
                    </div>
                  )}

                  {/* MAIN ANSWER CARD */}
                  <div className="answer-card left-align">
                    <div className="section-title">Acknowledge</div>
                    <div className="section-text">{sections["Acknowledge"] || "—"}</div>

                    <div className="section-title">Matrix Reference</div>
                    <div className="section-text">{sections["Matrix Reference"] || "—"}</div>

                    <div className="section-title">Step-by-step Guidance</div>
                    {steps.length ? (
                      <ol className="steps-list">
                        {steps.map((s, idx) => (
                          <li key={idx} className="steps-item">
                            {s}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <div className="section-text">{sections["Step-by-step Guidance"] || "—"}</div>
                    )}

                    <div className="answer-meta">
                      <span className="meta-label">Engine:</span> {apiResult?.source || "Matrix-only"}
                    </div>
                  </div>
                </div>
              ) : null}

              {loading ? (
                <div className="loading-hint subtle">Loading… matching the closest matrix procedure.</div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
