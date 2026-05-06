import { useState } from "react";
import { addMonths, addWeeks, toISODate } from "../lib/dates";
import { useReservations, useRequests, type Reservation } from "../lib/data";
import { useCurrentRole } from "../lib/auth";
import { useIdentity } from "../lib/identity";
import CalendarToolbar, { type ViewMode } from "../components/calendar/CalendarToolbar";
import MonthView from "../components/calendar/MonthView";
import WeekView from "../components/calendar/WeekView";
import RequestModal from "../components/RequestModal";
import ReservationModal from "../components/ReservationModal";
import MyReservationsGlance from "../components/MyReservationsGlance";

/**
 * Default landing page once signed in. Composes the calendar toolbar with
 * either the monthly or weekly view, both reading live data from AppSync.
 *
 * Click handling:
 *   - "+ Request dates" in the toolbar opens RequestModal for a fresh request.
 *   - Clicking a reserved cell opens ReservationModal — admins can edit or
 *     cancel; the original requester can submit a "request a change" which
 *     re-opens RequestModal pre-filled with the existing dates and a note.
 */
export default function Calendar() {
  const role = useCurrentRole();
  const { userId, label, picture, loading: identityLoading } = useIdentity();

  const [cursor, setCursor] = useState(() => new Date());
  const [view, setView]     = useState<ViewMode>("month");

  // Modal state — only one open at a time.
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestPrefill, setRequestPrefill]     = useState<{
    start?: string; end?: string; partyName?: string; note?: string; title?: string;
  } | null>(null);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);

  const { items: reservations, loading: loadingReservations } = useReservations();
  const { items: requests,     loading: loadingRequests }     = useRequests();

  const loading = loadingReservations || loadingRequests || identityLoading;

  function step(direction: -1 | 1) {
    setCursor((c) => (view === "month" ? addMonths(c, direction) : addWeeks(c, direction)));
  }

  function openFreshRequestModal() {
    setRequestPrefill(null);
    setRequestModalOpen(true);
  }

  /** Click on an open day cell — pre-fill RequestModal with that single day. */
  function openRequestForDay(day: Date) {
    const iso = toISODate(day);
    setRequestPrefill({ start: iso, end: iso });
    setRequestModalOpen(true);
  }

  /**
   * Owner clicked "Request a change" inside ReservationModal. Close the
   * details modal and open RequestModal pre-filled with the reservation's
   * dates plus a note explaining what's being modified. Admin sees the new
   * request in the queue; if approved, admin should manually cancel the old
   * reservation (a future polish would automate this).
   */
  function openModificationRequest(r: Reservation) {
    setSelectedReservation(null);
    setRequestPrefill({
      start: r.startDate ?? undefined,
      end:   r.endDate ?? undefined,
      partyName: r.partyName ?? undefined,
      note:  `Modification of my approved stay (${r.startDate} → ${r.endDate}). Please change to: `,
      title: "Request a change",
    });
    setRequestModalOpen(true);
  }

  return (
    <div className="flex flex-col md:flex-row gap-6 items-stretch md:items-start">
      <MyReservationsGlance
        reservations={reservations}
        requests={requests}
        userId={userId}
        displayName={label}
        picture={picture}
        loading={loading}
        onSelectReservation={setSelectedReservation}
      />

      <section className="bg-white rounded-2xl shadow-soft border border-deep/10 overflow-hidden flex-1 min-w-0">
      <CalendarToolbar
        cursor={cursor}
        view={view}
        onPrev ={() => step(-1)}
        onNext ={() => step(1)}
        onToday={() => setCursor(new Date())}
        onView ={setView}
        onRequest={openFreshRequestModal}
      />

      {loading ? (
        <div className="text-center py-20 text-muted">
          <div className="inline-block w-6 h-6 border-2 border-aqua border-t-transparent rounded-full animate-spin mb-3" />
          <div>Loading the calendar…</div>
        </div>
      ) : view === "month" ? (
        <MonthView
          cursor={cursor}
          reservations={reservations}
          requests={requests}
          onReservationClick={setSelectedReservation}
          onOpenDayClick={openRequestForDay}
        />
      ) : (
        <WeekView
          cursor={cursor}
          reservations={reservations}
          requests={requests}
          onReservationClick={setSelectedReservation}
          onOpenDayClick={openRequestForDay}
        />
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
        open={requestModalOpen}
        onClose={() => { setRequestModalOpen(false); setRequestPrefill(null); }}
        reservations={reservations}
        initialStart={requestPrefill?.start}
        initialEnd={requestPrefill?.end}
        initialPartyName={requestPrefill?.partyName}
        initialNote={requestPrefill?.note}
        title={requestPrefill?.title}
      />

      <ReservationModal
        reservation={selectedReservation}
        open={!!selectedReservation}
        onClose={() => setSelectedReservation(null)}
        requests={requests}
        role={role}
        onRequestChange={openModificationRequest}
      />
      </section>
    </div>
  );
}
