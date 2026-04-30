import PhaseStub from "../components/PhaseStub";

export default function UsersAndRoles() {
  return (
    <PhaseStub
      phase="Phase 4"
      title="Users & roles"
      blurb="Super User only. Phase 4 brings invite-by-email, role changes (Viewer ↔ Admin), and removal — all via Cognito group membership. Until then, manage users from the AWS Cognito console (the user pool created by this deploy)."
    />
  );
}
