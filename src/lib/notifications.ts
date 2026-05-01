import { client } from "./client";

/**
 * Fire-and-forget wrappers for the notification mutations. They return void
 * and never throw — email is best-effort. The caller's primary action
 * (createRequest, approveRequest, denyRequest) succeeds either way.
 */

interface CreatedInput {
  requesterEmail: string;
  requesterName:  string;
  startDate:      string;
  endDate:        string;
  partyName:      string;
  note?:          string;
}

interface DecidedInput {
  requesterEmail: string;
  requesterName:  string;
  startDate:      string;
  endDate:        string;
  partyName:      string;
  status:         "Approved" | "Denied";
  reason?:        string;
}

export function notifyRequestCreatedAsync(input: CreatedInput): void {
  client.mutations.notifyRequestCreated({
    requesterEmail: input.requesterEmail,
    requesterName:  input.requesterName,
    startDate:      input.startDate,
    endDate:        input.endDate,
    partyName:      input.partyName,
    note:           input.note ?? null,
  }).catch((err) => {
    console.warn("notifyRequestCreated failed (non-fatal)", err);
  });
}

export function notifyRequestDecidedAsync(input: DecidedInput): void {
  client.mutations.notifyRequestDecided({
    requesterEmail: input.requesterEmail,
    requesterName:  input.requesterName,
    startDate:      input.startDate,
    endDate:        input.endDate,
    partyName:      input.partyName,
    status:         input.status,
    reason:         input.reason ?? null,
  }).catch((err) => {
    console.warn("notifyRequestDecided failed (non-fatal)", err);
  });
}
