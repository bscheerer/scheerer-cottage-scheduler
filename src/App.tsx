import { Authenticator } from "@aws-amplify/ui-react";
import { Routes, Route, Navigate } from "react-router-dom";

import BrandBar from "./components/BrandBar";
import ProtectedRoute from "./components/ProtectedRoute";
import Calendar from "./pages/Calendar";
import MyRequests from "./pages/MyRequests";
import ApprovalQueue from "./pages/ApprovalQueue";
import UsersAndRoles from "./pages/UsersAndRoles";
import Settings from "./pages/Settings";
import { useCurrentRole } from "./lib/auth";
import { IdentityProvider } from "./lib/identity";

/**
 * Top-level app: wraps everything in the Amplify Authenticator so unauthenticated
 * visitors see the sign-in / sign-up screen. Once signed in, IdentityProvider
 * shares the Cognito user attributes with every consumer (BrandBar, Settings,
 * RequestModal, etc.) so a Settings save instantly updates the brand bar.
 */
export default function App() {
  return (
    <Authenticator
      // Sign-up is disabled at the Cognito level (see amplify/backend.ts —
      // adminCreateUserConfig.allowAdminCreateUserOnly = true). The pool
      // rejects self-registration; admins invite family members from the
      // Users & Roles page instead. Hiding the Sign Up tab here keeps the
      // UI honest.
      hideSignUp={true}
      components={{
        Header() {
          return (
            <div className="text-center pt-8 pb-2">
              <div className="inline-flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-deep flex items-center justify-center text-white shadow-soft">
                  <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
                    <path d="M14 3 L25 24 H3 Z" stroke="#A9D6E5" strokeWidth="2"
                      strokeLinejoin="round" fill="rgba(169,214,229,.18)" />
                    <path d="M11 24 V14 H17 V24" stroke="#F7B267" strokeWidth="1.6" fill="none" />
                  </svg>
                </div>
              </div>
              <h1 className="font-display text-2xl text-deep">Scheerer Cottage Scheduler</h1>
              <p className="text-sm text-muted">Lake Michigan family booking</p>
            </div>
          );
        },
      }}
    >
      <IdentityProvider>
        <SignedInApp />
      </IdentityProvider>
    </Authenticator>
  );
}

function SignedInApp() {
  const role = useCurrentRole();

  return (
    <div className="min-h-screen flex flex-col">
      <BrandBar role={role} />
      <main className="max-w-6xl w-full mx-auto px-6 py-8 flex-1">
        <Routes>
          <Route path="/" element={<Navigate to="/calendar" replace />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/my-requests" element={<MyRequests />} />
          <Route path="/settings" element={<Settings />} />

          {/* Admin & SuperUser only */}
          <Route
            path="/queue"
            element={
              <ProtectedRoute role={role} allow={["Admin", "SuperUser"]}>
                <ApprovalQueue />
              </ProtectedRoute>
            }
          />
          {/* SuperUser only */}
          <Route
            path="/users"
            element={
              <ProtectedRoute role={role} allow={["SuperUser"]}>
                <UsersAndRoles />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/calendar" replace />} />
        </Routes>
      </main>
      <footer className="text-center text-xs text-muted py-6">
        Scheerer Cottage Scheduler · v0.5
      </footer>
    </div>
  );
}
