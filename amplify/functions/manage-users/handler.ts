import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminListGroupsForUserCommand,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  AdminCreateUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  type AttributeType,
  type UserType,
} from "@aws-sdk/client-cognito-identity-provider";

const cognito = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID!;

const ROLE_GROUPS = ["SuperUser", "Admin", "Viewer"] as const;
type Role = (typeof ROLE_GROUPS)[number];

export interface FamilyUser {
  username: string;
  email: string;
  displayName: string;
  role: Role | null;
  status: string;
  createdAt: string | null;
  enabled: boolean;
}

interface ChangeRoleArgs  { username: string; newRole: Role }
interface InviteArgs      { email: string; displayName: string; role: Role }
interface RemoveArgs      { username: string }

/**
 * Single-Lambda dispatcher for four GraphQL operations:
 *   - listFamilyUsers (no arguments)
 *   - changeUserRole  ({ username, newRole })
 *   - inviteFamilyUser({ email, displayName, role })
 *   - removeFamilyUser({ username })
 *
 * Amplify Gen 2's `a.handler.function()` invocation shape doesn't expose
 * `info.fieldName`, so we route by inspecting which arguments are present.
 * Each operation's argument schema is distinct enough to disambiguate.
 *
 * The full event is logged at the start so any future routing surprises
 * are obvious from CloudWatch.
 */
export const handler = async (event: unknown): Promise<unknown> => {
  console.log("manage-users :: event ::", JSON.stringify(event));

  // Defensive arg extraction — Amplify Gen 2 may wrap or unwrap the args
  // depending on how the resolver is configured. Try both.
  const e = event as Record<string, unknown>;
  const args = (e?.arguments ?? e ?? {}) as Record<string, unknown>;
  const fieldNameHint =
    ((e?.info as Record<string, unknown> | undefined)?.fieldName as string | undefined) ??
    ((e?.fieldName as string | undefined) ?? undefined);

  const has = (k: string) => Object.prototype.hasOwnProperty.call(args, k);

  try {
    // Prefer fieldName when available (forward-compatible if Amplify changes shape)
    if (fieldNameHint) {
      switch (fieldNameHint) {
        case "listFamilyUsers":  return await listFamilyUsers();
        case "changeUserRole":   return await changeUserRole(args as unknown as ChangeRoleArgs);
        case "inviteFamilyUser": return await inviteFamilyUser(args as unknown as InviteArgs);
        case "removeFamilyUser": return await removeFamilyUser(args as unknown as RemoveArgs);
      }
    }

    // Argument-shape dispatch (current Amplify Gen 2 behaviour)
    if (has("newRole"))                                    return await changeUserRole(args as unknown as ChangeRoleArgs);
    if (has("email") && has("displayName") && has("role")) return await inviteFamilyUser(args as unknown as InviteArgs);
    if (has("username"))                                   return await removeFamilyUser(args as unknown as RemoveArgs);
    // No identifying argument → it's the list query.
    return await listFamilyUsers();
  } catch (err) {
    console.error("manage-users :: failed", err);
    throw err;
  }
};

/* -------------------------------------------------------------------------- */
/*  Operations                                                                 */
/* -------------------------------------------------------------------------- */

async function listFamilyUsers(): Promise<FamilyUser[]> {
  const out: FamilyUser[] = [];
  let token: string | undefined;
  do {
    const res = await cognito.send(new ListUsersCommand({
      UserPoolId: USER_POOL_ID,
      Limit: 60,
      PaginationToken: token,
    }));
    for (const u of res.Users ?? []) {
      out.push(await toFamilyUser(u));
    }
    token = res.PaginationToken;
  } while (token);
  return out.sort((a, b) => a.email.localeCompare(b.email));
}

async function changeUserRole(args: ChangeRoleArgs): Promise<boolean> {
  if (!ROLE_GROUPS.includes(args.newRole)) {
    throw new Error(`Invalid role: ${args.newRole}`);
  }
  for (const g of ROLE_GROUPS) {
    if (g === args.newRole) continue;
    try {
      await cognito.send(new AdminRemoveUserFromGroupCommand({
        UserPoolId: USER_POOL_ID,
        Username: args.username,
        GroupName: g,
      }));
    } catch (err: unknown) {
      if (!(err instanceof Error && err.name === "InvalidParameterException")) {
        console.warn(`Could not remove from ${g}:`, err);
      }
    }
  }
  await cognito.send(new AdminAddUserToGroupCommand({
    UserPoolId: USER_POOL_ID,
    Username: args.username,
    GroupName: args.newRole,
  }));
  return true;
}

async function inviteFamilyUser(args: InviteArgs): Promise<boolean> {
  if (!ROLE_GROUPS.includes(args.role)) {
    throw new Error(`Invalid role: ${args.role}`);
  }
  await cognito.send(new AdminCreateUserCommand({
    UserPoolId: USER_POOL_ID,
    Username: args.email,
    UserAttributes: [
      { Name: "email", Value: args.email },
      { Name: "email_verified", Value: "true" },
      { Name: "preferred_username", Value: args.displayName },
    ],
    DesiredDeliveryMediums: ["EMAIL"],
  }));
  await cognito.send(new AdminAddUserToGroupCommand({
    UserPoolId: USER_POOL_ID,
    Username: args.email,
    GroupName: args.role,
  }));
  return true;
}

async function removeFamilyUser(args: RemoveArgs): Promise<boolean> {
  await cognito.send(new AdminDisableUserCommand({
    UserPoolId: USER_POOL_ID,
    Username: args.username,
  }));
  return true;
}

// Helper retained for a future re-enable button.
export async function reenableFamilyUser(username: string): Promise<boolean> {
  await cognito.send(new AdminEnableUserCommand({
    UserPoolId: USER_POOL_ID,
    Username: username,
  }));
  return true;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

async function toFamilyUser(u: UserType): Promise<FamilyUser> {
  const username = u.Username ?? "";
  const attrs    = attrsToMap(u.Attributes);
  const groups   = await listGroupsFor(username);

  const role: Role | null =
    groups.includes("SuperUser") ? "SuperUser" :
    groups.includes("Admin")     ? "Admin" :
    groups.includes("Viewer")    ? "Viewer" :
    null;

  return {
    username,
    email:       attrs["email"] ?? "",
    displayName: attrs["preferred_username"] ?? attrs["email"] ?? username,
    role,
    status:      u.UserStatus ?? "UNKNOWN",
    createdAt:   u.UserCreateDate ? u.UserCreateDate.toISOString() : null,
    enabled:     u.Enabled ?? true,
  };
}

function attrsToMap(attrs: AttributeType[] | undefined): Record<string, string> {
  const m: Record<string, string> = {};
  for (const a of attrs ?? []) {
    if (a.Name && a.Value !== undefined) m[a.Name] = a.Value;
  }
  return m;
}

async function listGroupsFor(username: string): Promise<string[]> {
  const res = await cognito.send(new AdminListGroupsForUserCommand({
    UserPoolId: USER_POOL_ID,
    Username: username,
  }));
  return (res.Groups ?? []).map((g) => g.GroupName ?? "").filter(Boolean);
}
