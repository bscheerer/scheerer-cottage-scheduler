import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Amplify } from "aws-amplify";
import "@aws-amplify/ui-react/styles.css";

import App from "./App";
import "./index.css";

// Amplify writes amplify_outputs.json at the project root after the first
// `npx ampx sandbox` run (locally) or after the first deploy (in CI).
// We import it dynamically so the app can be built before that file exists.
async function configureAmplify() {
  try {
    const outputs = (await import("../amplify_outputs.json")).default;
    Amplify.configure(outputs);
  } catch {
    // First-time setup: amplify_outputs.json hasn't been generated yet.
    // The app will render but auth will be unconfigured. Run `npm run sandbox`
    // (locally) or push to your Amplify-connected branch to generate it.
    console.warn(
      "amplify_outputs.json not found — run `npm run sandbox` or deploy first."
    );
  }
}

configureAmplify().then(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );
});
