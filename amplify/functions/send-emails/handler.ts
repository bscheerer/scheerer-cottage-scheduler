import {
  CognitoIdentityProviderClient,
  ListUsersInGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const lambdaRegion = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "";
/** Optional override when your SES identity is in another region (rare). */
const sesRegion = process.env.SES_REGION?.trim() || lambdaRegion;

const cognito = new CognitoIdentityProviderClient({
  region: lambdaRegion || undefined,
});
const ses = new SESClient({ region: sesRegion || undefined });

const USER_POOL_ID = process.env.USER_POOL_ID!;
const FROM_EMAIL = process.env.FROM_EMAIL ?? "";
const APP_URL = process.env.APP_URL ?? "";

let didLogConfig: boolean = false;
function logRuntimeEmailConfigOnce(): void {
  if (didLogConfig) return;
  didLogConfig = true;
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "";
  console.log("[send-emails] runtime config", {
    hasFromEmail: Boolean(FROM_EMAIL),
    fromDomain: FROM_EMAIL.includes("@")
      ? FROM_EMAIL.split("@")[1]
      : "(invalid — need user@domain)",
    appUrlLength: APP_URL.length,
    lambdaRegion: region,
    sesClientRegion: sesRegion,
  });
}

interface AppSyncResolverEvent<T = Record<string, unknown>> {
  arguments: T;
  info?: {
    fieldName?: string;
    selectionSetList?: unknown;
    parentTypeName?: string;
  };
  identity?: Record<string, unknown>;
  source?: unknown;
}

interface CreatedArgs {
  requesterEmail: string;
  requesterName: string;
  startDate: string;
  endDate: string;
  partyName: string;
  note?: string;
}

interface DecidedArgs {
  requesterEmail: string;
  requesterName: string;
  startDate: string;
  endDate: string;
  partyName: string;
  status: "Approved" | "Denied" | string;
  reason?: string;
}

function looksLikeEmail(s: unknown): s is string {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

/**
 * Prefer AppSync's field name so routing never collides when extra keys appear
 * on one of the argument shapes during schema evolution.
 */
function pickOperation(event: unknown): "created" | "decided" | null {
  const evt = event as AppSyncResolverEvent<Record<string, unknown>> & {
    fieldName?: string;
  };
  // AppSync often puts fieldName at the ROOT; Amplify docs also mention info.fieldName.
  const field = evt.fieldName ?? evt.info?.fieldName;
  if (field === "notifyRequestCreated") return "created";
  if (field === "notifyRequestDecided") return "decided";
  // Legacy fallback (older payloads / tooling without `info`).
  const args = (evt.arguments ?? (event as Record<string, unknown>) ?? {}) as Record<
    string,
    unknown
  >;
  if (
    typeof args.status === "string" &&
    (args.status === "Approved" || args.status === "Denied")
  ) {
    return "decided";
  }
  if ("partyName" in args && typeof args.requesterEmail === "string") {
    return "created";
  }
  return null;
}

/**
 * Single-Lambda dispatcher for two notification operations.
 */
export const handler = async (event: unknown): Promise<boolean> => {
  logRuntimeEmailConfigOnce();
  console.log("send-emails :: event ::", JSON.stringify(event));
  const e = event as Record<string, unknown>;
  const args = (e?.arguments ?? e ?? {}) as Record<string, unknown>;
  try {
    const op = pickOperation(event);

    if (op === "decided") {
      return await notifyDecided(args as unknown as DecidedArgs);
    }
    if (op === "created") {
      return await notifyCreated(args as unknown as CreatedArgs);
    }

    console.error(
      "send-emails :: could not classify operation — expected notifyRequestCreated " +
        "or notifyRequestDecided. fieldName:",
      (event as { fieldName?: string }).fieldName,
      "info.fieldName:",
      ((event as { info?: { fieldName?: string } }).info)?.fieldName,
    );
    return false;
  } catch (err) {
    console.error("send-emails :: failed", err);
    return false;
  }
};

async function notifyCreated(args: CreatedArgs): Promise<boolean> {
  if (!FROM_EMAIL) {
    console.error(
      "send-emails :: notifyCreated — FROM_EMAIL is not configured; no messages sent",
    );
    return false;
  }

  const dateRange = formatDateRange(args.startDate, args.endDate);
  const requesterPlain = displayLabel(args);

  const requesterRecipient = looksLikeEmail(args.requesterEmail)
    ? args.requesterEmail.trim()
    : undefined;
  if (!requesterRecipient) {
    console.warn(
      "send-emails :: notifyCreated — invalid or missing requesterEmail;",
      JSON.stringify(args.requesterEmail),
    );
  }

  let allSendsOk = true;

  // 1. Confirmation to the requester
  if (requesterRecipient) {
    const ok = await sendEmail({
      to: requesterRecipient,
      subject: `Cottage request submitted — ${dateRange}`,
      html: `
      <p>Hi ${escapeHtml(requesterPlain)},</p>
      <p>Your request for the Scheerer cottage has been submitted:</p>
      <ul>
        <li><strong>Dates:</strong> ${escapeHtml(dateRange)}</li>
        <li><strong>Party name:</strong> ${escapeHtml(args.partyName)}</li>
        ${args.note ? `<li><strong>Note:</strong> ${escapeHtml(args.note)}</li>` : ""}
      </ul>
      <p>An admin will review and let you know.</p>
      ${APP_URL ? `<p><a href="${escapeHtmlHref(APP_URL)}">Open the calendar</a></p>` : ""}
    `,
      text: `Your request for ${args.partyName} (${dateRange}) has been submitted. An admin will review and let you know.`,
    });
    if (!ok) allSendsOk = false;
  }

  let admins: string[] = [];
  try {
    admins = await getAdminEmails();
  } catch (adminErr) {
    console.error("send-emails :: getAdminEmails failed — admin alerts skipped:", adminErr);
  }

  // 2. Notify all admins + super-users
  for (const adminEmail of admins) {
    if (!looksLikeEmail(adminEmail)) continue;
    if (adminEmail === requesterRecipient) continue;
    const ok = await sendEmail({
      to: adminEmail,
      subject: `New cottage request — ${args.partyName} (${dateRange})`,
      html: `
        <p>${escapeHtml(requesterPlain)} has requested the cottage:</p>
        <ul>
          <li><strong>Dates:</strong> ${escapeHtml(dateRange)}</li>
          <li><strong>Party:</strong> ${escapeHtml(args.partyName)}</li>
          ${args.note ? `<li><strong>Note:</strong> ${escapeHtml(args.note)}</li>` : ""}
        </ul>
        ${APP_URL ? `<p><a href="${escapeHtmlHref(`${APP_URL}/queue`)}">Open the approval queue</a></p>` : ""}
      `,
      text: `${requesterPlain} requested the cottage for ${args.partyName} (${dateRange}). Open the approval queue to decide.`,
    });
    if (!ok) allSendsOk = false;
  }
  return allSendsOk;
}

async function notifyDecided(args: DecidedArgs): Promise<boolean> {
  if (!FROM_EMAIL) {
    console.error(
      "send-emails :: notifyDecided — FROM_EMAIL is not configured; no messages sent",
    );
    return false;
  }

  const dateRange = formatDateRange(args.startDate, args.endDate);
  const requesterPlain = displayLabel(args);
  const isApproved = args.status === "Approved";

  const to = looksLikeEmail(args.requesterEmail) ? args.requesterEmail.trim() : undefined;
  if (!to) {
    console.warn(
      "send-emails :: notifyDecided — invalid or missing requesterEmail;",
      JSON.stringify(args.requesterEmail),
    );
    return false;
  }

  return sendEmail({
    to,
    subject: isApproved
      ? `Cottage request approved — ${dateRange}`
      : `Cottage request denied — ${dateRange}`,
    html: isApproved ? `
      <p>Hi ${escapeHtml(requesterPlain)},</p>
      <p><strong>Your request has been approved!</strong></p>
      <ul>
        <li><strong>Dates:</strong> ${escapeHtml(dateRange)}</li>
        <li><strong>Party name:</strong> ${escapeHtml(args.partyName)}</li>
      </ul>
      ${APP_URL ? `<p><a href="${escapeHtmlHref(APP_URL)}">See the calendar</a></p>` : ""}
    ` : `
      <p>Hi ${escapeHtml(requesterPlain)},</p>
      <p>Your request for ${escapeHtml(dateRange)} was unfortunately denied.</p>
      ${args.reason ? `<p><strong>Reason:</strong> ${escapeHtml(args.reason)}</p>` : ""}
      ${APP_URL ? `<p><a href="${escapeHtmlHref(APP_URL)}">Pick different dates</a></p>` : ""}
    `,
    text: isApproved
      ? `Your request for ${args.partyName} (${dateRange}) has been approved.`
      : `Your request for ${args.partyName} (${dateRange}) was denied.${args.reason ? " Reason: " + args.reason : ""}`,
  });
}

async function getAdminEmails(): Promise<string[]> {
  const out: string[] = [];
  for (const groupName of ["Admin", "SuperUser"]) {
    let token: string | undefined;
    do {
      const res = await cognito.send(new ListUsersInGroupCommand({
        UserPoolId: USER_POOL_ID,
        GroupName: groupName,
        NextToken: token,
        Limit: 50,
      }));
      for (const user of res.Users ?? []) {
        const email = user.Attributes?.find((a) => a.Name === "email")?.Value;
        if (email && looksLikeEmail(email) && !out.includes(email)) out.push(email);
      }
      token = res.NextToken;
    } while (token);
  }
  return out;
}

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** @returns true if SES accepted the message */
async function sendEmail(args: SendArgs): Promise<boolean> {
  if (!FROM_EMAIL) {
    console.warn("FROM_EMAIL env var not set; skipping email to", args.to);
    return false;
  }
  try {
    await ses.send(new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: { ToAddresses: [args.to] },
      Message: {
        Subject: { Data: args.subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: args.html, Charset: "UTF-8" },
          Text: { Data: args.text, Charset: "UTF-8" },
        },
      },
    }));
    console.log("SES ok →", args.to, "subject:", args.subject);
    return true;
  } catch (err: unknown) {
    const e = err as {
      name?: string;
      message?: string;
      Code?: string;
      $metadata?: { httpStatusCode?: number; requestId?: string };
    };
    console.error("SES send failed", {
      to: args.to,
      name: e.name,
      code: e.Code,
      message: e.message,
      httpStatus: e.$metadata?.httpStatusCode,
      requestId: e.$metadata?.requestId,
    });
    return false;
  }
}

function displayLabel(args: { requesterName?: string; requesterEmail?: string }): string {
  return (args.requesterName?.trim() || args.requesterEmail || "Family member").trim();
}

function formatDateRange(start: string, end: string): string {
  if (!start || !end) return "—";
  if (start === end) return start;
  return `${start} → ${end}`;
}

/** Escapes text for HTML body */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escapes a URL for insertion into HTML href="..." — avoid attribute injection */
function escapeHtmlHref(url: string): string {
  return escapeHtml(url);
}
