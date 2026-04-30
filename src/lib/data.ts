import { useEffect, useState } from "react";
import { client } from "./client";
import { writeAudit } from "./audit";
import type { Schema } from "../../amplify/data/resource";

export type Reservation = Schema["Reservation"]["type"];
export type Request     = Schema["Request"]["type"];

/* -------------------------------------------------------------------------- */
/*  Live queries (observeQuery → real-time updates)                            */
/* -------------------------------------------------------------------------- */

/**
 * Live list of all reservations. Updated within ~1s of any insert/update/delete.
 * Family-scale data is small, so we list everything and filter client-side.
 */
export function useReservations() {
  const [items, setItems]       = useState<Reservation[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    const sub = client.models.Reservation.observeQuery().subscribe({
      next: ({ items, isSynced }) => { setItems([...items]); if (isSynced) setLoading(false); },
      error: (err) => { console.error("Reservation subscription error", err); setLoading(false); },
    });
    return () => sub.unsubscribe();
  }, []);

  return { items, loading };
}

/** Live list of every Request (used by admins for the queue + by viewers for their own). */
export function useRequests() {
  const [items, setItems]     = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sub = client.models.Request.observeQuery().subscribe({
      next: ({ items, isSynced }) => { setItems([...items]); if (isSynced) setLoading(false); },
      error: (err) => { console.error("Request subscription error", err); setLoading(false); },
    });
    return () => sub.unsubscribe();
  }, []);

  return { items, loading };
}

/* -------------------------------------------------------------------------- */
/*  Mutations                                                                  */
/* -------------------------------------------------------------------------- */

export interface NewRequestInput {
  startDate: string;     // ISO date YYYY-MM-DD
  endDate: string;       // ISO date
  partyName: string;
  guestCount: number;
  petsAllowed: boolean;
  note?: string;
  requesterId: string;   // current user sub
}

/** Create a Pending request for the signed-in user. */
export async function createRequest(input: NewRequestInput) {
  const { errors, data } = await client.models.Request.create({
    ...input,
    note: input.note ?? null,
    status: "Pending",
  });
  if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
  return data;
}

/** Cancel an own pending request. */
export async function cancelRequest(requestId: string, actorId: string, actorLabel?: string) {
  const { errors } = await client.models.Request.update({
    id: requestId,
    status: "Cancelled",
  });
  if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
  await writeAudit({
    actorId,
    actorLabel,
    action: "CancelRequest",
    targetType: "Request",
    targetId: requestId,
    summary: "Cancelled own pending request",
  });
}

/** Deny a request with optional reason. Admin/SuperUser only (enforced by @auth). */
export async function denyRequest(
  request: Request,
  decidedById: string,
  decidedByLabel?: string,
  reason?: string
) {
  const { errors } = await client.models.Request.update({
    id: request.id,
    status: "Denied",
    decidedById,
    decidedAt: new Date().toISOString(),
    decisionReason: reason ?? null,
  });
  if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
  await writeAudit({
    actorId:    decidedById,
    actorLabel: decidedByLabel,
    action:     "DenyRequest",
    targetType: "Request",
    targetId:   request.id,
    summary:    `Denied ${request.partyName ?? "request"} for ${request.startDate} → ${request.endDate}${reason ? ` (${reason})` : ""}`,
  });
}

/** True if [aStart,aEnd] overlaps [bStart,bEnd] inclusively (ISO date strings). */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export interface ApproveResult {
  reservationId: string;
  autoDeniedRequestIds: string[];
}

/**
 * Approve a Request. Three things happen, in order:
 *   1. Conflict check — refuse if any existing Reservation overlaps.
 *   2. Create the Reservation row, mark the Request Approved.
 *   3. Auto-deny any *other* pending Request that overlaps these dates.
 *
 * The reservation creation, request update, and auto-deny are issued
 * sequentially. They are not atomic — if step 2 succeeds but step 3 fails,
 * an admin can re-run the auto-deny manually. For a family scheduler this
 * tradeoff is fine; a future Phase can move this to a Lambda transaction.
 *
 * Throws if conflict-check fails so the caller can surface a clear error.
 */
export async function approveRequest(
  request: Request,
  decidedById: string,
  decidedByLabel?: string
): Promise<ApproveResult> {
  if (!request.startDate || !request.endDate) {
    throw new Error("Request is missing startDate or endDate.");
  }

  // 1. Conflict check
  const { data: existing, errors: listErrors } = await client.models.Reservation.list();
  if (listErrors?.length) throw new Error(listErrors.map((e) => e.message).join("; "));

  const conflict = (existing ?? []).find(
    (r) => r.startDate && r.endDate &&
           overlaps(request.startDate!, request.endDate!, r.startDate, r.endDate)
  );
  if (conflict) {
    throw new Error(
      `Cannot approve — dates conflict with ${conflict.partyName ?? "an existing reservation"} ` +
      `(${conflict.startDate} → ${conflict.endDate}).`
    );
  }

  // 2a. Create the reservation
  const { data: reservation, errors: createErrors } = await client.models.Reservation.create({
    startDate:    request.startDate,
    endDate:      request.endDate,
    partyName:    request.partyName ?? "Reserved",
    guestCount:   request.guestCount ?? 1,
    petsAllowed:  request.petsAllowed ?? false,
    notes:        request.note ?? null,
    createdById:  decidedById,
    sourceRequestId: request.id,
  });
  if (createErrors?.length) throw new Error(createErrors.map((e) => e.message).join("; "));
  if (!reservation) throw new Error("Reservation creation returned no data.");

  // 2b. Mark this request approved
  const { errors: updateErrors } = await client.models.Request.update({
    id: request.id,
    status: "Approved",
    decidedById,
    decidedAt: new Date().toISOString(),
  });
  if (updateErrors?.length) throw new Error(updateErrors.map((e) => e.message).join("; "));

  // 3. Auto-deny overlapping pending requests
  const { data: allRequests } = await client.models.Request.list();
  const overlappingPendings = (allRequests ?? []).filter(
    (r) =>
      r.id !== request.id &&
      r.status === "Pending" &&
      r.startDate && r.endDate &&
      overlaps(request.startDate!, request.endDate!, r.startDate, r.endDate)
  );

  const autoDeniedIds: string[] = [];
  for (const pending of overlappingPendings) {
    try {
      await client.models.Request.update({
        id: pending.id,
        status: "Denied",
        decidedById,
        decidedAt: new Date().toISOString(),
        decisionReason: "Date taken by an approved reservation.",
      });
      autoDeniedIds.push(pending.id);
    } catch (err) {
      console.warn("Auto-deny failed for request", pending.id, err);
    }
  }

  // Audit trail
  await writeAudit({
    actorId:    decidedById,
    actorLabel: decidedByLabel,
    action:     "ApproveRequest",
    targetType: "Request",
    targetId:   request.id,
    summary:
      `Approved ${request.partyName ?? "request"} for ${request.startDate} → ${request.endDate}` +
      (autoDeniedIds.length ? ` · auto-denied ${autoDeniedIds.length} overlap(s)` : ""),
  });

  return { reservationId: reservation.id, autoDeniedRequestIds: autoDeniedIds };
}
