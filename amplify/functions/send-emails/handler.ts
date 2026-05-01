import {
  CognitoIdentityProviderClient,
  ListUsersInGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const cognito = new CognitoIdentityProviderClient({});
const ses     = new SESClient({});

const USER_POOL_ID = process.env.USER_POOL_ID!;
const FROM_EMAIL   = process.env.FROM_EMAIL!;
const APP_URL      = process.env.APP_URL ?? "";

interface CreatedArgs {
  requesterEmail: string;
  requesterName:  string;
  startDate:      string;
  endDate:        string;
  partyName:      string;
  note?:          string;
}

interface DecidedArgs {
  requesterEmail: string;
  requesterName:  string;
  startDate:      string;
  endDate:        string;
  partyName:      string;
  status:         "Approved" | "Denied" | string;
  reason?:        string;
}

/**
 * Single-Lambda dispatcher for two notification operations.
 * Routes by checking which arguments are present (Amplify Gen 2's
 * a.handler.function() doesn't expose info.fieldName reliably).
 */
export const handler = async (event: unknown): Promise<boolean> => {
  console.log("send-emails :: event ::", JSON.stringify(event));
  const e = event as Record<string, unknown>;
  const args = (e?.arguments ?? e ?? {}) as Record<string, unknown>;
  try {
    if (typeof args.status === "string") {
      return await notifyDecided(args as unknown as DecidedArgs);
    }
    return await notifyCreated(args as unknown as CreatedArgs);
  } catch (err) {
    console.error("send-emails :: failed", err);
    // Best-effort: don't fail the GraphQL call just because email failed.
    return false;
  }
};

/* -------------------------------------------------------------------------- */
/*  Operations                                                                 */
/* -------------------------------------------------------------------------- */

async function notifyCreated(args: CreatedArgs): Promise<boolean> {
  const dateRange = formatDateRange(args.startDate, args.endDate);
  const requesterPlain = displayLabel(args);

  // 1. Confirmation to the requester
  await sendEmail({
    to: args.requesterEmail,
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
      ${APP_URL ? `<p><a href="${APP_URL}">Open the calendar</a></p>` : ""}
    `,
    text: `Your request for ${args.partyName} (${dateRange}) has been submitted. An admin will review and let you know.`,
  });

  // 2. Notify all admins + super-users
  const admins = await getAdminEmails();
  for (const adminEmail of admins) {
    if (adminEmail === args.requesterEmail) continue; // don't double-mail self
    await sendEmail({
      to: adminEmail,
      subject: `New cottage request — ${args.partyName} (${dateRange})`,
      html: `
        <p>${escapeHtml(requesterPlain)} has requested the cottage:</p>
        <ul>
          <li><strong>Dates:</strong> ${escapeHtml(dateRange)}</li>
          <li><strong>Party:</strong> ${escapeHtml(args.partyName)}</li>
          ${args.note ? `<li><strong>Note:</strong> ${escapeHtml(args.note)}</li>` : ""}
        </ul>
        ${APP_URL ? `<p><a href="${APP_URL}/queue">Open the approval queue</a></p>` : ""}
      `,
      text: `${requesterPlain} requested the cottage for ${args.partyName} (${dateRange}). Open the approval queue to decide.`,
    });
  }
  return true;
}

async function notifyDecided(args: DecidedArgs): Promise<boolean> {
  const dateRange = formatDateRange(args.startDate, args.endDate);
  const requesterPlain = displayLabel(args);
  const isApproved = args.status === "Approved";

  await sendEmail({
    to: args.requesterEmail,
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
      ${APP_URL ? `<p><a href="${APP_URL}">See the calendar</a></p>` : ""}
    ` : `
      <p>Hi ${escapeHtml(requesterPlain)},</p>
      <p>Your request for ${escapeHtml(dateRange)} was unfortunately denied.</p>
      ${args.reason ? `<p><strong>Reason:</strong> ${escapeHtml(args.reason)}</p>` : ""}
      ${APP_URL ? `<p><a href="${APP_URL}">Pick different dates</a></p>` : ""}
    `,
    text: isApproved
      ? `Your request for ${args.partyName} (${dateRange}) has been approved.`
      : `Your request for ${args.partyName} (${dateRange}) was denied.${args.reason ? " Reason: " + args.reason : ""}`,
  });
  return true;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

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
        if (email && !out.includes(email)) out.push(email);
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

async function sendEmail(args: SendArgs): Promise<void> {
  if (!FROM_EMAIL) {
    console.warn("FROM_EMAIL env var not set; skipping email to", args.to);
    return;
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
    console.log("Sent email to", args.to, "subject:", args.subject);
  } catch (err) {
    // SES sandbox rejects unverified recipients; log and swallow so the
    // request action still succeeds.
    console.error("SES send failed for", args.to, err);
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
