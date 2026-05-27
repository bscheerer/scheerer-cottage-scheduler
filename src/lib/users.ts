import { client } from "./client";
import { writeAudit } from "./audit";

export type Role = "SuperUser" | "Admin" | "Viewer";

export interface FamilyUser {
  username: string;
  email: string;
  displayName: string;
  role: Role | null;
  status: string;
  createdAt: string | null;
  enabled: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Custom GraphQL operations (backed by the manage-users Lambda)              */
/* -------------------------------------------------------------------------- */

export async function listFamilyUsers(): Promise<FamilyUser[]> {
  const { data, errors } = await client.queries.listFamilyUsers();
  if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
  return ((data ?? []) as FamilyUser[]).filter(Boolean);
}

export async function changeUserRole(
  username: string,
  newRole: Role,
  actorId: string,
  actorLabel?: string,
  previousRole?: Role | null
) {
  const { data, errors } = await client.mutations.changeUserRole({ username, newRole });
  if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
  await writeAudit({
    actorId,
    actorLabel,
    action: "ChangeUserRole",
    targetType: "User",
    targetId: username,
    summary: `${username}: ${previousRole ?? "none"} → ${newRole}`,
    before: { role: previousRole ?? null },
    after:  { role: newRole },
  });
  return Boolean(data);
}

export async function inviteFamilyUser(
  email: string,
  displayName: string,
  role: Role,
  actorId: string,
  actorLabel?: string
) {
  const { data, errors } = await client.mutations.inviteFamilyUser({ email, displayName, role });
  if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
  await writeAudit({
    actorId,
    actorLabel,
    action: "InviteUser",
    targetType: "User",
    targetId: email,
    summary: `Invited ${displayName} <${email}> as ${role}`,
  });
  return Boolean(data);
}

export async function removeFamilyUser(
  username: string,
  actorId: string,
  actorLabel?: string
) {
  const { data, errors } = await client.mutations.removeFamilyUser({ username });
  if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
  await writeAudit({
    actorId,
    actorLabel,
    action: "RemoveUser",
    targetType: "User",
    targetId: username,
    summary: `Deleted ${username}`,
  });
  return Boolean(data);
}

export async function resendVerificationEmail(
  username: string,
  actorId: string,
  actorLabel?: string
) {
  const { data, errors } = await client.mutations.resendVerificationEmail({ username, resend: true });
  if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
  await writeAudit({
    actorId,
    actorLabel,
    action: "ResendVerificationEmail",
    targetType: "User",
    targetId: username,
    summary: `Resent verification email to ${username}`,
  });
  return Boolean(data);
}

export async function deleteFamilyUser(
  username: string,
  actorId: string,
  actorLabel?: string
) {
  const { data, errors } = await client.mutations.deleteFamilyUser({ username });
  if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
  await writeAudit({
    actorId,
    actorLabel,
    action: "DeleteUser",
    targetType: "User",
    targetId: username,
    summary: `Deleted ${username}`,
  });
  return Boolean(data);
}

export async function resendInvite(
  username: string,
  actorId: string,
  actorLabel?: string
) {
  const { data, errors } = await client.mutations.resendInvite({ username });
  if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
  await writeAudit({
    actorId,
    actorLabel,
    action: "ResendInvite",
    targetType: "User",
    targetId: username,
    summary: `Resent invitation email to ${username}`,
  });
  return Boolean(data);
}
