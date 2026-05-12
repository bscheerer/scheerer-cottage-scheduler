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
    html: brandedEmail({
      emoji: "🌊",
      heading: "Request submitted",
      intro: `Thanks ${escapeHtml(requesterPlain)} — your stay at the Scheerer cottage has been recorded and is now pending admin approval.`,
      details: [
        ["Dates", escapeHtml(dateRange)],
        ["Party name", escapeHtml(args.partyName)],
        ...(args.note ? [["Description", escapeHtml(args.note)]] as [string, string][] : []),
      ],
      ctaLabel: "Open the calendar",
      ctaUrl: APP_URL,
      footerNote: "An admin will review and let you know.",
    }),
    text: `Your request for ${args.partyName} (${dateRange}) has been submitted. An admin will review and let you know.`,
  });

  // 2. Notify all admins + super-users
  const admins = await getAdminEmails();
  for (const adminEmail of admins) {
    if (adminEmail === args.requesterEmail) continue; // don't double-mail self
    await sendEmail({
      to: adminEmail,
      subject: `New cottage request — ${args.partyName} (${dateRange})`,
      html: brandedEmail({
        emoji: "📨",
        heading: "New request awaiting approval",
        intro: `<strong>${escapeHtml(requesterPlain)}</strong> just submitted a request for the cottage.`,
        details: [
          ["Dates", escapeHtml(dateRange)],
          ["Party name", escapeHtml(args.partyName)],
          ...(args.note ? [["Description", escapeHtml(args.note)]] as [string, string][] : []),
        ],
        ctaLabel: "Open the approval queue",
        ctaUrl: APP_URL ? `${APP_URL}/queue` : "",
        footerNote: "Approve or deny from the queue. You'll see this request alongside any others awaiting review.",
      }),
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
    html: isApproved
      ? brandedEmail({
          emoji: "🌅",
          heading: "Your request was approved!",
          intro: `Great news, ${escapeHtml(requesterPlain)} — the cottage is yours for the dates below. Pack the bug spray.`,
          details: [
            ["Dates", escapeHtml(dateRange)],
            ["Party name", escapeHtml(args.partyName)],
          ],
          ctaLabel: "See the calendar",
          ctaUrl: APP_URL,
          footerNote: "Need to make a change? Click the reservation on the calendar and choose 'Request a change'.",
        })
      : brandedEmail({
          emoji: "🛶",
          heading: "Request denied",
          intro: `Hi ${escapeHtml(requesterPlain)} — your request for ${escapeHtml(dateRange)} was not approved this time.`,
          details: args.reason
            ? [["Reason", escapeHtml(args.reason)]]
            : [],
          ctaLabel: "Pick different dates",
          ctaUrl: APP_URL,
          footerNote: "Open the calendar to find open dates and submit a new request.",
        }),
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

/**
 * Brand-themed HTML email wrapper — sunset gradient header, white card body,
 * a key-value details table, optional CTA button, and a Lake Michigan footer.
 * Matches the Cognito verification and admin-invite emails.
 *
 * Inline styles only so the layout survives Gmail, Outlook, and Apple Mail.
 */
interface BrandedEmailOpts {
  emoji: string;
  heading: string;
  intro: string;                          // may include inline HTML (already escaped)
  details?: [string, string][];           // [label, value] rows
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
}

function brandedEmail(opts: BrandedEmailOpts): string {
  const detailsRows = (opts.details ?? [])
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding:10px 20px;border-bottom:1px solid rgba(97,165,194,0.18);vertical-align:top;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#2C7DA0;margin-bottom:2px;">${escapeHtml(label)}</div>
          <div style="font-family:Georgia,serif;font-size:15px;color:#1B4965;">${value}</div>
        </td>
      </tr>`
    )
    .join("");

  const detailsBlock = detailsRows
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#E8F4F8;border:2px solid #61A5C2;border-radius:12px;margin:20px 0;">${detailsRows}</table>`
    : "";

  const ctaButton =
    opts.ctaLabel && opts.ctaUrl
      ? `<div style="text-align:center;margin:24px 0 12px;">
           <a href="${opts.ctaUrl}" style="display:inline-block;background:linear-gradient(180deg,#F7B267,#E76F51);color:#ffffff;font-weight:600;font-size:15px;text-decoration:none;padding:12px 28px;border-radius:12px;box-shadow:0 6px 14px rgba(231,111,81,0.25);">${escapeHtml(opts.ctaLabel)}</a>
         </div>`
      : "";

  const footerNote = opts.footerNote
    ? `<p style="color:#6B7C85;font-size:13px;line-height:1.6;margin:18px 0 0;">${opts.footerNote}</p>`
    : "";

  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#FAF3E3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1F2A33;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;">
      <tr>
        <td style="background:linear-gradient(135deg,#0F2C40 0%,#1B4965 35%,#2C7DA0 65%,#F7B267 95%,#E76F51 100%);padding:32px 24px;border-radius:16px 16px 0 0;text-align:center;">
          <div style="display:inline-block;width:56px;height:56px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.35);border-radius:14px;margin-bottom:12px;line-height:56px;">
            <span style="font-size:30px;">${opts.emoji}</span>
          </div>
          <h1 style="color:#ffffff;font-family:Georgia,'Iowan Old Style',serif;font-size:26px;font-weight:700;margin:0;letter-spacing:-0.01em;">Scheerer Cottage Scheduler</h1>
          <p style="color:rgba(255,255,255,0.85);font-size:13px;margin:6px 0 0;">Lake Michigan family booking</p>
        </td>
      </tr>
      <tr>
        <td style="background:#ffffff;padding:32px 28px;border-radius:0 0 16px 16px;box-shadow:0 4px 14px rgba(28,55,75,0.10);">
          <h2 style="color:#1B4965;font-family:Georgia,serif;font-size:20px;font-weight:700;margin:0 0 12px;">${escapeHtml(opts.heading)}</h2>
          <p style="color:#1F2A33;font-size:15px;line-height:1.6;margin:0 0 8px;">${opts.intro}</p>
          ${detailsBlock}
          ${ctaButton}
          ${footerNote}
          <hr style="border:none;border-top:1px solid #E8F4F8;margin:24px 0 18px;">
          <p style="color:#5C3A21;font-size:12px;text-align:center;margin:0;">Sent from <strong>Scheerer Cottage Scheduler</strong> · Lake Michigan</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
