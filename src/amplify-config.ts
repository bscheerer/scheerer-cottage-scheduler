// IMPORTANT: side-effect import. Calling Amplify.configure() needs to happen
// before any other module pulls in `generateClient()` or any other Amplify
// SDK call site, because those evaluate at module load and call
// `Amplify.getConfig()` immediately. Putting configure in its own module and
// importing it as the *first* statement of main.tsx guarantees ordering.

import { Amplify } from "aws-amplify";
import outputs from "../amplify_outputs.json";

Amplify.configure(outputs);

// Lightweight runtime sanity log — visible in browser console.
// eslint-disable-next-line no-console
console.log("Amplify configured", {
  hasAuth: Boolean((outputs as Record<string, unknown>).auth),
  hasData: Boolean((outputs as Record<string, unknown>).data),
  version: (outputs as { version?: string }).version,
});
