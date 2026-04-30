import { useState } from "react";
import { addMonths, addWeeks } from "../lib/dates";
import { useReservations, useRequests } from "../lib/data";
import CalendarToolbar, { type ViewMode } from "../components/calendar/CalendarToolbar";
import MonthView from "../components/calendar/MonthView";
import WeekView from "../components/calendar/WeekView";
import RequestModal from "../components/RequestModal";

/**
 * Default landing page once signed in. Composes the calendar toolbar with
 * either the monthly or weekly view, both reading live data from AppSync
 * via observeQuery (any other browser approving a request shows up here
 * within a couple seconds).
 *
 * The "Request dates" button is wired to a placeholder for now; the actual
 * request modal arrives in Phase 3.
 */
export default function Calendar() {
  const [cursor, setCursor] = useState(() => new Date());
  const [view, setView]     = useState<ViewMode>("month");
  const [modalOpen, setModalOpen] = useState(false);

  const { items: reservations, loading: loadingReservations } = useReservations();
  const { items: requests,     loading: loadingRequests }     = useRequests();

  const loading = loadingReservations || loadingRequests;

  function step(direction: -1 | 1) {
    setCursor((c) => (view === "month" ? addMonths(c, direction) : addWeeks(c, direction)));
  }

  return (
    <section className="bg-white rounded-2xl shadow-soft border border-deep/10 overflow-hidden">
      <CalendarToolbar
        cursor={cursor}
        view={view}
        onPrev ={() => step(-1)}
        onNext ={() => step(1)}
        onToday={() => setCursor(new Date())}
        onView ={setView}
        onRequest={() => setModalOpen(true)}
      />

      {loading ? (
        <div className="text-center py-20 text-muted">
          <div className="inline-block w-6 h-6 border-2 border-aqua border-t-transparent rounded-full animate-spin mb-3" />
          <div>Loading the calendar…</div>
        </div>
      ) : view === "month" ? (
        <MonthView cursor={cursor} reservations={reservations} requests={requests} />
      ) : (
        <WeekView  cursor={cursor} reservations={reservations} requests={requests} />
      )}

      {!loading && reservations.length === 0 && requests.length === 0 && (
        <div className="px-5 pb-5 -mt-2">
          <div className="rounded-xl border border-aqua/30 bg-foam px-4 py-3 text-sm text-deep">
            <strong>The calendar is empty.</strong> Click <em>Request dates</em> to submit
            the first stay — admins will review and approve from the queue.
          </div>
        </div>
      )}

      <RequestModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        reservations={reservations}
      />
    </section>
  );
}
