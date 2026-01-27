import React, { useState } from "react";
import { useDocumentMode } from "../../context/DocumentModeContext";
import { askComplianceQuestion } from "../../services/openaiService";
import AnswerBox from "../answers/AnswerBox";

export default function QuestionInput() {
  const { mode } = useDocumentMode();
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);

  const handleSubmit = async () => {
    setLoading(true);
    setResponse(null);

    try {
      const result = await askComplianceQuestion({ mode, question });
      setResponse(result);
    } catch (e) {
      setResponse({
        answer: `Request failed: ${e?.message || "Unknown error"}`,
        source: "Client",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="card bg-dark bg-opacity-75 text-white shadow-sm">
        <div className="card-body">
          <h6 className="mb-2">Ask a Compliance Question</h6>

          <textarea
            className="form-control mb-3"
            rows={3}
            placeholder="Type the agent or team leader question here..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />

          <button
            className="btn btn-primary w-100"
            disabled={!question.trim() || loading}
            onClick={handleSubmit}
          >
            {loading ? "Searching document..." : "Submit Question"}
          </button>

          {!mode && (
            <div className="alert alert-danger mt-3 mb-0">
              <strong>Must-Do:</strong> Select a document before submitting.
            </div>
          )}
        </div>
      </div>

      {response && <AnswerBox answer={response.answer} source={response.source} />}
    </>
  );
}
