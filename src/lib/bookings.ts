import { useEffect, useState } from "react";
import { client } from "./client";
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
  title:        string;
  description?: string;
  priceCents:   number;
  createdById:  string;
}

export async function createBookableSlot(input: NewSlotInput) {
  const { data, errors } = await client.models.BookableSlot.create({
    startDate:   input.startDate,
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
