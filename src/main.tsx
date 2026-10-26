import React from "react";
import ReactDOM from "react-dom/client";
import { captureLinkToken } from "./pages/Login";
import App from "./app/App";
import "./styles/index.css";
captureLinkToken();
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
