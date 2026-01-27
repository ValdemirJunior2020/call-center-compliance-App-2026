import React from "react";
import { useDocumentMode } from "../../context/DocumentModeContext";

export default function DocumentSelector() {
  const { mode, setMode } = useDocumentMode();

  return (
    <select
      className="form-select form-select-sm"
      style={{ maxWidth: 220 }}
      value={mode || ""}
      onChange={(e) => setMode(e.target.value)}
    >
      <option value="" disabled>
        Select Document
      </option>
      <option value="Matrix-2026">Matrix-2026</option>
      <option value="Training Guide-2025">Training Guide-2025</option>
      <option value="QA Form-2023">QA Form-2023</option>
    </select>
  );
}
