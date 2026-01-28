// server/lib/ragAnswer.js
export async function ragAnswer({ question, mode, hits, engine }) {
  // Placeholder for non-matrix modes.
  // Keep it safe: don’t invent policies.
  return {
    answer:
      "This mode is not wired yet. Please select Matrix-2026 for now.",
    source: `Mode: ${mode}`,
    citations: [],
  };
}
