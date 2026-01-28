export function composeAnswer(row) {
  return {
    quickAnswer: row.quickAnswer || row.description || "Follow the steps below.",
    steps: row.instructions
      ? row.instructions
          .split(/\d+\./)
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    routing: {
      slack: row.slack || "No",
      refundQueue: row.refundQueue || "No",
      ticket: row.ticket || "No",
      supervisor: row.supervisor || "No",
    },
  };
}
