import { Authenticator } from "@aws-amplify/ui-react";
import { Routes, Route, Navigate } from "react-router-dom";

import BrandBar from "./components/BrandBar";
import ProtectedRoute from "./components/ProtectedRoute";
import Calendar from "./pages/Calendar";
import MyRequests from "./pages/MyRequests";
import ApprovalQueue from "./pages/ApprovalQueue";
import UsersAndRoles from "./pages/UsersAndRoles";
import AdminDashboard from "./pages/AdminDashboard";
import PatronCalendar from "./pages/PatronCalendar";
import PaidSlots from "./pages/PaidSlots";
import Settings from "./pages/Settings";
import Availability from "./pages/Availability";
import PublicCalendar from "./pages/PublicCalendar";
import BookStart from "./pages/BookStart";
import BookSuccess from "./pages/BookSuccess";
import BookCancelled from "./pages/BookCancelled";
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
    <Routes>
      {/* Public availability landing — no sign-in required */}
      <Route path="/availability" element={<Availability />} />
      <Route path="/calendar-preview" element={<PublicCalendar />} />
      <Route path="/book/success" element={<BookSuccess />} />
      <Route path="/book/cancelled" element={<BookCancelled />} />
      {/* Everything else lives behind the Authenticator */}
      <Route path="/*" element={<AuthedApp />} />
    </Routes>
  );
}

function AuthedApp() {
  return (
    <Authenticator
      signUpAttributes={["email", "preferred_username"]}
      formFields={{
        signUp: {
          preferred_username: {
            label: "Name",
            placeholder: "First and last name (e.g. Aunt Karen)",
            isRequired: true,
            order: 1,
          },
        },
      }}
      services={{
        async validateCustomSignUp(formData) {
          const raw = (formData.preferred_username as string | undefined) ?? "";
          const parts = raw.trim().split(/\s+/).filter(Boolean);
          if (parts.length < 2) {
            return {
              preferred_username:
                "Please enter both your first and last name (e.g. Karen Patel).",
            };
          }
          return undefined;
        },
      }}
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
              <p className="text-sm text-muted mb-4">Lake Michigan family booking</p>
              
                href="/calendar-preview"
                className="inline-block text-sm font-semibold text-mid hover:text-deep transition border border-deep/20 rounded-lg px-4 py-2 hover:bg-foam"
              >
                Just browsing? View the calendar
              </a>
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
          <Route path="/" element={<Navigate to={role === "Patron" ? "/patron-calendar" : "/calendar"} replace />} />
          <Route path="/book/start" element={<BookStart />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/patron-calendar" element={<PatronCalendar />} />
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
          <Route
            path="/admin"
            element={
              <ProtectedRoute role={role} allow={["SuperUser"]}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/slots"
            element={
              <ProtectedRoute role={role} allow={["SuperUser"]}>
                <PaidSlots />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to={role === "Patron" ? "/patron-calendar" : "/calendar"} replace />} />
        </Routes>
      </main>
      <footer className="text-center text-xs text-muted py-6">
        Scheerer Cottage Scheduler  ©️2026 - All rights reserved
      </footer>
    </div>
  );
}
