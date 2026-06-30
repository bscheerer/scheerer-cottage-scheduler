import {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import type { PostConfirmationTriggerHandler } from "aws-lambda";

const cognito = new CognitoIdentityProviderClient({});

/**
 * Auto-assign new sign-ups to the Viewer group. Idempotent: if the user is
 * already in the group, Cognito returns success without changes.
 *
 * The handler must always return the event unchanged, even on failure —
 * Cognito treats a thrown error as a sign-up failure, which we don't want.
 */
export const handler: PostConfirmationTriggerHandler = async (event) => {
  try {
    await cognito.send(new AdminAddUserToGroupCommand({
      UserPoolId: event.userPoolId,
      Username:   event.userName,
      GroupName:  "Patron",
    }));
    console.log("Added", event.userName, "to Patron");
  } catch (err) {
    // Don't fail sign-up — log and let the Super User promote manually.
    console.error("Could not auto-add user to Patron group:", err);
  }
  return event;
};
