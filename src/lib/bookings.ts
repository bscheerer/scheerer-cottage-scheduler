import { useEffect, useState } from "react";
import { client } from "./client";
import { overlaps } from "./data";
import type { Schema } from "../../amplify/data/resource";

export type BookableSlot = Schema["BookableSlot"]["type"];
export type SlotStatus   = "Open" | "Reserved" | "Sold" | "Cancelled";

/**
 * Live list of every BookableSlot. SuperUser sees this page; the auth
 * rules on the model itself reject reads/writes from other roles, so
 * subscribers in other roles would just get nothing.
 */
export function useBookableSlots() {
  const [items, setItems]     = useState<BookableSlot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sub = client.models.BookableSlot.observeQuery().subscribe({
      next: ({ items, isSynced }) => {
        const sorted = [...items].sort((a, b) =>
          (a.startDate ?? "").localeCompare(b.startDate ?? "")
        );
        setItems(sorted);
        if (isSynced) setLoading(false);
      },
      error: (err) => {
        console.error("BookableSlot subscription error", err);
        setLoading(false);
      },
    });
    return () => sub.unsubscribe();
  }, []);

  return { items, loading };
}

export interface NewSlotInput {
  startDate:    string;       // ISO yyyy-mm-dd
  endDate?:     string;       // ISO yyyy-mm-dd; defaults to startDate
  title:        string;
  description?: string;
  priceCents:   number;
  createdById:  string;
}

export async function createBookableSlot(input: NewSlotInput) {
  const start = input.startDate;
  const end   = input.endDate ?? input.startDate;
  if (end < start) throw new Error("End date can't be before start date.");

  // Reject overlap with an already-approved Reservation.
  const { data: reservations } = await client.models.Reservation.list();
  const resHit = (reservations ?? []).find(
    (r) => r && r.startDate && r.endDate && overlaps(start, end, r.startDate, r.endDate)
  );
  if (resHit) {
    throw new Error(
      `Dates conflict with reservation "${resHit.partyName ?? "family reservation"}" ` +
      `(${resHit.startDate} → ${resHit.endDate}).`
    );
  }

  // Reject overlap with another active (non-cancelled) BookableSlot.
  const { data: slots } = await client.models.BookableSlot.list();
  const slotHit = (slots ?? []).find(
    (s) => s && s.status !== "Cancelled" &&
           s.startDate && s.endDate &&
           overlaps(start, end, s.startDate, s.endDate)
  );
  if (slotHit) {
    throw new Error(
      `Dates conflict with block "${slotHit.title}" ` +
      `(${slotHit.startDate} → ${slotHit.endDate}).`
    );
  }

  const { data, errors } = await client.models.BookableSlot.create({
    startDate:   start,
    endDate:     end,
    title:       input.title,
    description: input.description ?? null,
    priceCents:  input.priceCents,
    status:      "Open",
    createdById: input.createdById,
  });
  if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
  return data;
}

export async function cancelBookableSlot(id: string) {
  const { errors } = await client.models.BookableSlot.update({
    id, status: "Cancelled",
  });
  if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
}

export async function deleteBookableSlot(id: string) {
  const { errors } = await client.models.BookableSlot.delete({ id });
  if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
}
