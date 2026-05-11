import { defineAuth } from "@aws-amplify/backend";
import { postConfirmation } from "./post-confirmation/resource";

/**
 * Cognito user pool for the Scheerer Cottage Scheduler.
 *
 * Three groups model the role system from the design plan:
 *   - SuperUser  : Ben (and any successor). Full control, manages roles.
 *   - Admin      : Approves/denies requests, edits reservations.
 *   - Viewer     : Sees the calendar, submits date requests.
 *
 * Phase 4 wires up a post-confirmation trigger that auto-adds new sign-ups
 * to the Viewer group, so the only manual step ever needed is the very
 * first promotion to SuperUser (done once, via Cognito console).
 */
export const auth = defineAuth({
  loginWith: {
    email: {
      verificationEmailStyle: "CODE",
      verificationEmailSubject: "Your Scheerer Cottage verification code",
      verificationEmailBody: (createCode) => `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#FAF3E3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1F2A33;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;">
      <tr>
        <td style="background:linear-gradient(135deg,#0F2C40 0%,#1B4965 35%,#2C7DA0 65%,#F7B267 95%,#E76F51 100%);padding:32px 24px;border-radius:16px 16px 0 0;text-align:center;">
          <div style="display:inline-block;width:56px;height:56px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.35);border-radius:14px;margin-bottom:12px;line-height:56px;">
            <span style="font-size:30px;">🏖️</span>
          </div>
          <h1 style="color:#ffffff;font-family:Georgia,'Iowan Old Style',serif;font-size:26px;font-weight:700;margin:0;letter-spacing:-0.01em;">Scheerer Cottage Scheduler</h1>
          <p style="color:rgba(255,255,255,0.85);font-size:13px;margin:6px 0 0;">Lake Michigan family booking</p>
        </td>
      </tr>
      <tr>
        <td style="background:#ffffff;padding:32px 28px;border-radius:0 0 16px 16px;box-shadow:0 4px 14px rgba(28,55,75,0.10);">
          <p style="color:#1F2A33;font-size:16px;line-height:1.5;margin:0 0 12px;">Welcome to the cottage 🌊</p>
          <p style="color:#1F2A33;font-size:15px;line-height:1.6;margin:0 0 24px;">Thanks for signing up. Use the code below to verify your email and finish setting up your account:</p>
          <div style="background:#E8F4F8;border:2px solid #61A5C2;border-radius:12px;padding:22px 16px;margin:24px 0;text-align:center;">
            <div style="font-family:Georgia,serif;font-size:34px;font-weight:700;letter-spacing:8px;color:#1B4965;">${createCode()}</div>
          </div>
          <p style="color:#6B7C85;font-size:13px;line-height:1.5;margin:0 0 8px;">This code expires in 24 hours.</p>
          <p style="color:#6B7C85;font-size:13px;line-height:1.5;margin:0 0 24px;">If you didn't request this, you can safely ignore this message.</p>
          <hr style="border:none;border-top:1px solid #E8F4F8;margin:24px 0 18px;">
          <p style="color:#5C3A21;font-size:12px;text-align:center;margin:0;">Sent from <strong>Scheerer Cottage Scheduler</strong> · Lake Michigan</p>
        </td>
      </tr>
    </table>
  </body>
</html>`,
    },
  },
  userAttributes: {
    email: { required: true, mutable: false },
    preferredUsername: { required: false, mutable: true },
    profilePicture: { required: false, mutable: true },
    // NOTE: phone is stored as the custom attribute `custom:phone`, added to
    // the user pool via a one-time CLI command (see PHASE5.md). Cognito does
    // not allow adding *standard* attributes to an existing pool, but it does
    // allow adding custom ones. The custom attribute lives in the pool but is
    // intentionally not declared here — declaring it would trigger a Cognito
    // schema-update that's also disallowed for existing pools.
  },
  groups: ["SuperUser", "Admin", "Viewer"],
  triggers: {
    postConfirmation,
  },
});
