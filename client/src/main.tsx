import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initSentry } from "./lib/sentry";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/plus-jakarta-sans";
import "./index.css";

initSentry();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
