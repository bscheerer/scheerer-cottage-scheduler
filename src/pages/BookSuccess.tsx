import { Link } from "react-router-dom";

export default function BookSuccess() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#FAF3E3" }}>
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-md w-full bg-white rounded-2xl border border-deep/10 shadow-soft p-10 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-approved/20 text-approved font-bold text-3xl mb-4">
            \u2713
          </div>
          <h1 className="font-display text-2xl text-deep mb-2">Payment received</h1>
          <p className="text-muted text-sm mb-6">
            Thank you for booking. We'll confirm your reservation by email shortly.
            Your date is reserved while we process the payment.
          </p>
          <Link
            to="/availability"
            className="inline-block text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-soft"
            style={{ background: "#E76F51" }}
          >
            Back to available dates
          </Link>
        </div>
      </main>
      <footer className="text-center text-xs text-muted py-6">
        Scheerer Cottage Scheduler  \u00a9\ufe0f2026 - All rights reserved
      </footer>
    </div>
  );
}
