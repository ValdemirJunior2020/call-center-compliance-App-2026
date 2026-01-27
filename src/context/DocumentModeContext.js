import React, { createContext, useContext, useState } from "react";

const DocumentModeContext = createContext();

export function DocumentModeProvider({ children }) {
  const [mode, setMode] = useState(null);

  return (
    <DocumentModeContext.Provider value={{ mode, setMode }}>
      {children}
    </DocumentModeContext.Provider>
  );
}

export function useDocumentMode() {
  return useContext(DocumentModeContext);
}
