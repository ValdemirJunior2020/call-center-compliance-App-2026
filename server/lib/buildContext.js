export function buildContext(matches) {
  return matches
    .map(
      (r, i) => `
[ROW ${i + 1}]
Issue: ${r.issue}
Instructions: ${r.instructions}
Slack: ${r.slack}
Refund Queue: ${r.refundQueue}
Create Ticket: ${r.createTicket}
Supervisor: ${r.supervisor}
`
    )
    .join("\n");
}
