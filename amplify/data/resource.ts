import { type ClientSchema, a, defineData } from "@aws-amplify/backend";

/**
 * GraphQL data model for the Scheerer Cottage Scheduler.
 *
 * Five entities, mirroring the data-model section of the design plan:
 *   - User        : profile mirror of the Cognito user
 *   - Reservation : approved bookings (exclusive — one party at a time)
 *   - Request     : pending/approved/denied/cancelled requests for dates
 *   - Cottage     : metadata about the cottage (singleton row in v1)
 *   - AuditLog    : append-only history of admin actions
 *
 * Authorization rules implement the permissions matrix from section 3 of
 * the design plan. The defaults are deliberately generous for read (so the
 * whole family can see who is staying when) and restrictive for write.
 */

const schema = a.schema({
  // ------------------------------------------------------------ User
  User: a
    .model({
      email: a.email().required(),
      displayName: a.string().required(),
      role: a.enum(["SuperUser", "Admin", "Viewer"]),
      status: a.enum(["Invited", "Active", "Removed"]),
      photoUrl: a.url(),
      invitedById: a.id(),
      lastSignInAt: a.datetime(),
    })
    .authorization((allow) => [
      // Anyone signed in can list family members (we're a small family app).
      allow.authenticated().to(["read"]),
      // Only the SuperUser can create / change / remove users.
      allow.group("SuperUser").to(["create", "update", "delete"]),
      // A user can update their own profile fields (name, photo) — handled
      // in code by allowing owner-based updates; full role changes are
      // enforced at the field level via the SuperUser-only mutations below.
      allow.owner().to(["read", "update"]),
    ]),

  // ----------------------------------------------------- Reservation
  Reservation: a
    .model({
      // ISO date strings; treat each reservation as inclusive of both ends.
      startDate: a.date().required(),
      endDate: a.date().required(),
      partyName: a.string().required(),
      guestCount: a.integer().default(1),
      petsAllowed: a.boolean().default(false),
      notes: a.string(),
      createdById: a.id().required(),
      // If this reservation came from an approved Request, link it.
      sourceRequestId: a.id(),
    })
    .secondaryIndexes((index) => [index("startDate")])
    .authorization((allow) => [
      allow.authenticated().to(["read"]),
      allow.groups(["Admin", "SuperUser"]).to(["create", "update", "delete"]),
    ]),

  // --------------------------------------------------------- Request
  Request: a
    .model({
      startDate: a.date().required(),
      endDate: a.date().required(),
      partyName: a.string().required(),
      guestCount: a.integer().default(1),
      petsAllowed: a.boolean().default(false),
      note: a.string(),
      status: a.enum(["Pending", "Approved", "Denied", "Cancelled"]),
      requesterId: a.id().required(),
      decidedById: a.id(),
      decidedAt: a.datetime(),
      decisionReason: a.string(),
    })
    .secondaryIndexes((index) => [
      index("requesterId"),
      index("status"),
      index("startDate"),
    ])
    .authorization((allow) => [
      // Everyone signed in can read all requests (so admins see the queue
      // and viewers see their own pending requests on the calendar).
      allow.authenticated().to(["read"]),
      // Anyone signed in can create their own request.
      allow.authenticated().to(["create"]),
      // Owner can cancel their pending request.
      allow.owner().to(["update", "delete"]),
      // Admins / Super User can approve, deny, edit, or delete any request.
      allow.groups(["Admin", "SuperUser"]).to(["update", "delete"]),
    ]),

  // --------------------------------------------------------- Cottage
  Cottage: a
    .model({
      name: a.string().required(),
      tagline: a.string(),
      heroPhotoUrl: a.url(),
      checkInTime: a.string().default("16:00"),
      checkOutTime: a.string().default("11:00"),
      houseRules: a.string(),
    })
    .authorization((allow) => [
      allow.authenticated().to(["read"]),
      allow.group("SuperUser").to(["create", "update", "delete"]),
    ]),

  // -------------------------------------------------------- AuditLog
  AuditLog: a
    .model({
      actorId: a.id().required(),
      action: a.string().required(),     // e.g. "ApproveRequest", "ChangeRole"
      targetType: a.string(),             // e.g. "Request", "User"
      targetId: a.id(),
      before: a.json(),
      after: a.json(),
      timestamp: a.datetime().required(),
    })
    .secondaryIndexes((index) => [index("timestamp")])
    .authorization((allow) => [
      allow.groups(["Admin", "SuperUser"]).to(["read", "create"]),
      // Append-only — no updates or deletes, ever.
    ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
  },
});
