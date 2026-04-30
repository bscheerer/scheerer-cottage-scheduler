import { useEffect, useState } from "react";
import { client } from "./client";
import type { Schema } from "../../amplify/data/resource";

export type Reservation = Schema["Reservation"]["type"];
export type Request     = Schema["Request"]["type"];

/**
 * Live list of all reservations, kept up to date via `observeQuery` —
 * Amplify Data's snapshot subscription. Whenever a reservation is created,
 * updated, or deleted anywhere, every connected client re-renders within
 * a second or two.
 *
 * For a family-scale app the entire reservation set is small (tens to low
 * hundreds of rows over years), so we list everything and filter client-side.
 * If the list ever balloons, swap to a date-range query against the
 * Reservation.startDate GSI defined in amplify/data/resource.ts.
 */
export function useReservations() {
  const [items, setItems] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sub = client.models.Reservation.observeQuery().subscribe({
      next: ({ items, isSynced }) => {
        setItems([...items]);
        if (isSynced) setLoading(false);
      },
      error: (err) => {
        console.error("Reservation subscription error", err);
        setLoading(false);
      },
    });
    return () => sub.unsubscribe();
  }, []);

  return { items, loading };
}

/**
 * Live list of *all* date requests. Admin-relevant view: the full queue.
 * Viewers only need their own (filter `requesterId === currentUserId` in the page).
 */
export function useRequests() {
  const [items, setItems] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sub = client.models.Request.observeQuery().subscribe({
      next: ({ items, isSynced }) => {
        setItems([...items]);
        if (isSynced) setLoading(false);
      },
      error: (err) => {
        console.error("Request subscription error", err);
        setLoading(false);
      },
    });
    return () => sub.unsubscribe();
  }, []);

  return { items, loading };
}
