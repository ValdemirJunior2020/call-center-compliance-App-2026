export async function askComplianceQuestion({ mode, question }) {
  const res = await fetch("http://localhost:5050/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, question }),
  });

  return res.json();
}
