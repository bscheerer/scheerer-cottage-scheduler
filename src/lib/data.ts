import { useEffect, useState } from "react";
import { client } from "./client";
import { writeAudit } from "./audit";
import { notifyRequestCreatedAsync, notifyRequestDecidedAsync } from "./notifications";
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
  startDate: string;       // ISO date YYYY-MM-DD
  endDate: string;         // ISO date
  partyName: string;
  note?: string;
  requesterId: string;     // current user sub
  /** Snapshot of the requester's chosen profile emoji. */
  requesterEmoji?: string;
  /** For email confirmation. */
  requesterEmail?: string;
  requesterName?: string;
}

/** Create a Pending request for the signed-in user. */
export async function createRequest(input: NewRequestInput) {
  const { errors, data } = await client.models.Request.create({
    startDate:      input.startDate,
    endDate:        input.endDate,
    partyName:      input.partyName,
    note:           input.note ?? null,
    requesterId:    input.requesterId,
    requesterEmoji: input.requesterEmoji ?? null,
    requesterEmail: input.requesterEmail ?? null,
    requesterName:  input.requesterName  ?? null,
    status: "Pending",
  });
  if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));

  // Fire emails (requester confirmation + admin queue alert).
  if (input.requesterEmail) {
    notifyRequestCreatedAsync({
      requesterEmail: input.requesterEmail,
      requesterName:  input.requesterName ?? input.partyName,
      startDate:      input.startDate,
      endDate:        input.endDate,
      partyName:      input.partyName,
      note:           input.note,
    });
  }

  return data;
}

/* -------------------------------------------------------------------------- */
/*  Reservation mutations (admin/super only — UI hides actions for viewers)    */
/* -------------------------------------------------------------------------- */

export interface ReservationPatch {
  startDate?: string;
  endDate?: string;
  partyName?: string;
  notes?: string | null;
}

/**
 * Admin edit of an existing reservation. Re-runs the conflict check against
 * other reservations (excluding the one being edited) so a date change can't
 * collide with something already approved.
 */
export async function updateReservation(
  reservation: Reservation,
  patch: ReservationPatch,
  actorId: string,
  actorLabel?: string
): Promise<void> {
  const newStart = patch.startDate ?? reservation.startDate ?? "";
  const newEnd   = patch.endDate   ?? reservation.endDate   ?? "";

  if (newStart && newEnd) {
    const { data: all } = await client.models.Reservation.list();
    const conflict = (all ?? []).find(
      (r) => r.id !== reservation.id &&
             r.startDate && r.endDate &&
             overlaps(newStart, newEnd, r.startDate, r.endDate)
    );
    if (conflict) {
      throw new Error(
        `Dates conflict with ${conflict.partyName ?? "another reservation"} ` +
        `(${conflict.startDate} → ${conflict.endDate}).`
      );
    }
  }

  const { errors } = await client.models.Reservation.update({
    id: reservation.id,
    ...(patch.startDate !== undefined && { startDate: patch.startDate }),
    ...(patch.endDate   !== undefined && { endDate:   patch.endDate }),
    ...(patch.partyName !== undefined && { partyName: patch.partyName }),
    ...(patch.notes     !== undefined && { notes:     patch.notes }),
  });
  if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));

  await writeAudit({
    actorId, actorLabel,
    action: "UpdateReservation",
    targetType: "Reservation",
    targetId: reservation.id,
    summary: `Edited ${reservation.partyName ?? "reservation"} ` +
             `(${reservation.startDate} → ${reservation.endDate} ⇒ ${newStart} → ${newEnd})`,
    before: { startDate: reservation.startDate, endDate: reservation.endDate, partyName: reservation.partyName },
    after:  { startDate: newStart, endDate: newEnd, partyName: patch.partyName ?? reservation.partyName },
  });
}

/** Delete (cancel) a reservation. Admin/super only. */
export async function deleteReservation(
  reservation: Reservation,
  actorId: string,
  actorLabel?: string
): Promise<void> {
  const { errors } = await client.models.Reservation.delete({ id: reservation.id });
  if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));

  await writeAudit({
    actorId, actorLabel,
    action: "CancelReservation",
    targetType: "Reservation",
    targetId: reservation.id,
    summary: `Cancelled ${reservation.partyName ?? "reservation"} for ${reservation.startDate} → ${reservation.endDate}`,
  });
}

/* -------------------------------------------------------------------------- */
/*  Request mutations                                                          */
/* -------------------------------------------------------------------------- */

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

/**
 * Deny a request with optional reason. Admin/SuperUser only (enforced by @auth).
 * Reads requesterEmail off the Request snapshot and emails the requester.
 */
export async function denyRequest(
  request: Request,
  decidedById: string,
  decidedByLabel?: string,
  reason?: string
) {
  const requesterEmail = request.requesterEmail ?? undefined;
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

  if (requesterEmail) {
    notifyRequestDecidedAsync({
      requesterEmail,
      requesterName: request.requesterName ?? request.partyName ?? "Family member",
      startDate:     request.startDate ?? "",
      endDate:       request.endDate ?? "",
      partyName:     request.partyName ?? "",
      status:        "Denied",
      reason,
    });
  }
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
  const requesterEmail = request.requesterEmail ?? undefined;
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
    partyEmoji:   request.requesterEmoji ?? null,
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

  // Email the requester
  if (requesterEmail) {
    notifyRequestDecidedAsync({
      requesterEmail,
      requesterName: request.requesterName ?? request.partyName ?? "Family member",
      startDate:     request.startDate,
      endDate:       request.endDate,
      partyName:     request.partyName ?? "",
      status:        "Approved",
    });
  }

  return { reservationId: reservation.id, autoDeniedRequestIds: autoDeniedIds };
}
