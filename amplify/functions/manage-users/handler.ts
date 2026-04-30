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

interface AppSyncEvent<T = Record<string, unknown>> {
  arguments: T;
  identity?: { sub?: string; username?: string };
  info: { fieldName: string };
}

export interface FamilyUser {
  username: string;
  email: string;
  displayName: string;
  role: Role | null;
  status: string;
  createdAt: string | null;
  enabled: boolean;
}

export const handler = async (event: AppSyncEvent) => {
  const op = event.info.fieldName;

  try {
    switch (op) {
      case "listFamilyUsers":
        return await listFamilyUsers();
      case "changeUserRole":
        return await changeUserRole(event.arguments as { username: string; newRole: Role });
      case "inviteFamilyUser":
        return await inviteFamilyUser(event.arguments as { email: string; displayName: string; role: Role });
      case "removeFamilyUser":
        return await removeFamilyUser(event.arguments as { username: string });
      default:
        throw new Error(`Unknown operation: ${op}`);
    }
  } catch (err) {
    console.error(`manage-users :: ${op} failed`, err);
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

async function changeUserRole(args: { username: string; newRole: Role }): Promise<boolean> {
  if (!ROLE_GROUPS.includes(args.newRole)) {
    throw new Error(`Invalid role: ${args.newRole}`);
  }
  // Remove from every other role group, add to the target. Idempotent.
  for (const g of ROLE_GROUPS) {
    if (g === args.newRole) continue;
    try {
      await cognito.send(new AdminRemoveUserFromGroupCommand({
        UserPoolId: USER_POOL_ID,
        Username: args.username,
        GroupName: g,
      }));
    } catch (err: unknown) {
      // Ignore "user wasn't in this group" — it's the no-op case.
      if (!(err instanceof Error && err.name === "InvalidParameterException")) {
        // Soft-log other errors so we don't fail the whole op for a stray group.
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

async function inviteFamilyUser(args: { email: string; displayName: string; role: Role }): Promise<boolean> {
  if (!ROLE_GROUPS.includes(args.role)) {
    throw new Error(`Invalid role: ${args.role}`);
  }
  // Cognito's AdminCreateUser auto-emails a one-time password to the address.
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

async function removeFamilyUser(args: { username: string }): Promise<boolean> {
  // Disable rather than delete — preserves audit history and lets us re-enable.
  await cognito.send(new AdminDisableUserCommand({
    UserPoolId: USER_POOL_ID,
    Username: args.username,
  }));
  return true;
}

// Re-enable helper — surfaced via a future query if needed.
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

  // Prefer the strongest group as the "role"
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
