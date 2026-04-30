import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Amplify } from "aws-amplify";
import "@aws-amplify/ui-react/styles.css";

import App from "./App";
import "./index.css";

// Static import: Vite bundles amplify_outputs.json at build time. If the file
// is missing (e.g. before the first `npx ampx sandbox`), the build fails with
// a clear error rather than silently leaving Amplify unconfigured at runtime.
//
// Amplify Hosting writes amplify_outputs.json at the project root during the
// backend phase of the build, so the frontend build always sees it.
import outputs from "../amplify_outputs.json";

Amplify.configure(outputs);
console.log("Amplify configured", {
  hasAuth: Boolean((outputs as Record<string, unknown>).auth),
  hasData: Boolean((outputs as Record<string, unknown>).data),
  version: (outputs as { version?: string }).version,
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
