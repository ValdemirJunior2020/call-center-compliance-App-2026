import React from "react";
import ReactDOM from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css";
import App from "./App";
import { DocumentModeProvider } from "./context/DocumentModeContext";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <DocumentModeProvider>
      <App />
    </DocumentModeProvider>
  </React.StrictMode>
);
