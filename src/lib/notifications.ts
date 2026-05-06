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
  void client.mutations
    .notifyRequestCreated({
      requesterEmail: input.requesterEmail,
      requesterName: input.requesterName,
      startDate: input.startDate,
      endDate: input.endDate,
      partyName: input.partyName,
      note: input.note ?? null,
    })
    .then((res) => {
      const r = res as { data?: unknown; errors?: unknown[] };
      if (r.errors?.length) {
        console.error("[email] notifyRequestCreated GraphQL errors", r.errors);
      }
      if (r.data === false) {
        console.error(
          "[email] notifyRequestCreated returned false — check CloudWatch for Lambda send-emails (FROM_EMAIL, SES errors, IAM, or invalid requester email)",
        );
      }
    })
    .catch((err) => {
      console.error("[email] notifyRequestCreated failed (mutation or network)", err);
    });
}

export function notifyRequestDecidedAsync(input: DecidedInput): void {
  void client.mutations
    .notifyRequestDecided({
      requesterEmail: input.requesterEmail,
      requesterName: input.requesterName,
      startDate: input.startDate,
      endDate: input.endDate,
      partyName: input.partyName,
      status: input.status,
      reason: input.reason ?? null,
    })
    .then((res) => {
      const r = res as { data?: unknown; errors?: unknown[] };
      if (r.errors?.length) {
        console.error("[email] notifyRequestDecided GraphQL errors", r.errors);
      }
      if (r.data === false) {
        console.error(
          "[email] notifyRequestDecided returned false — check CloudWatch for Lambda send-emails (FROM_EMAIL, SES, requester email)",
        );
      }
    })
    .catch((err) => {
      console.error("[email] notifyRequestDecided failed (mutation or network)", err);
    });
}
