import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { manageUsers } from "../functions/manage-users/resource";
import { sendEmails } from "../functions/send-emails/resource";

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
 * Phase 4 also exposes Super-User-only custom operations backed by a
 * Lambda that talks to Cognito admin APIs:
 *   - listFamilyUsers, changeUserRole, inviteFamilyUser, removeFamilyUser
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
      // Snapshot of the requester's emoji avatar at approve time. Rendered
      // on the calendar so each reservation is recognizable at a glance.
      partyEmoji: a.string(),
      // Cottage Elder Sponsors (snapshot at approve time). At least one is
      // required at request time; copied to Reservation when approved.
      sponsors: a.string().array(),
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
      // Emoji snapshot from the requester's profile, captured at request time.
      requesterEmoji: a.string(),
      // Email/name snapshots so approve/deny can send notifications without
      // a Cognito lookup. Email is immutable in our pool, so these are stable.
      requesterEmail: a.string(),
      requesterName:  a.string(),
      // Cottage Elder Sponsors selected at request time (at least one required).
      sponsors: a.string().array(),
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
      // and viewers see their own pending requests on the calendar) and
      // submit new ones. (AppSync allows one rule per provider per model,
      // so read + create are combined here.)
      allow.authenticated().to(["read", "create"]),
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
      actorLabel: a.string(),
      action: a.string().required(),     // e.g. "ApproveRequest", "ChangeRole"
      targetType: a.string(),             // e.g. "Request", "User"
      targetId: a.id(),
      summary: a.string(),                // short human-readable description
      before: a.json(),
      after: a.json(),
      timestamp: a.datetime().required(),
    })
    .secondaryIndexes((index) => [index("timestamp")])
    .authorization((allow) => [
      allow.groups(["Admin", "SuperUser"]).to(["read", "create"]),
      // Append-only — no updates or deletes, ever.
    ]),

  // ----------------------------------------------------- BookableSlot
  // SuperUser-created paid slots that patrons can purchase via Stripe.
  // Public read via apiKey auth mode powers the unauthenticated /availability
  // landing page; userPool auth lets signed-in users read full details too.
  BookableSlot: a
    .model({
      startDate:   a.date().required(),
      endDate:     a.date(),
      title:       a.string().required(),
      description: a.string(),
      priceCents:  a.integer().required(),
      status:      a.enum(["Open", "Reserved", "Sold", "Cancelled"]),
      createdById: a.id().required(),
    })
    .secondaryIndexes((index) => [index("startDate"), index("status")])
    .authorization((allow) => [
      allow.publicApiKey().to(["read"]),
      allow.authenticated().to(["read"]),
      allow.group("SuperUser").to(["create", "update", "delete"]),
    ]),

  // -------------------------------------------------------- FamilyUser
  // Lightweight DTO returned by listFamilyUsers (the data lives in Cognito,
  // not in our DB).
  FamilyUser: a.customType({
    username:    a.string(),
    email:       a.string(),
    displayName: a.string(),
    role:        a.string(),
    status:      a.string(),
    createdAt:   a.string(),
    enabled:     a.boolean(),
  }),

  // ------------------------------------------- Custom Lambda operations
  listFamilyUsers: a
    .query()
    .returns(a.ref("FamilyUser").array())
    .authorization((allow) => [allow.groups(["Admin", "SuperUser"])])
    .handler(a.handler.function(manageUsers)),

  changeUserRole: a
    .mutation()
    .arguments({
      username: a.string().required(),
      newRole:  a.string().required(),
    })
    .returns(a.boolean())
    .authorization((allow) => [allow.group("SuperUser")])
    .handler(a.handler.function(manageUsers)),

  deleteFamilyUser: a
    .mutation()
    .arguments({ username: a.string().required() })
    .returns(a.boolean())
    .authorization((allow) => [allow.group("SuperUser")])
    .handler(a.handler.function(manageUsers)),

  resendInvite: a
    .mutation()
    .arguments({ username: a.string().required() })
    .returns(a.boolean())
    .authorization((allow) => [allow.group("SuperUser")])
    .handler(a.handler.function(manageUsers)),


  inviteFamilyUser: a
    .mutation()
    .arguments({
      email:       a.string().required(),
      displayName: a.string().required(),
      role:        a.string().required(),
    })
    .returns(a.boolean())
    .authorization((allow) => [allow.group("SuperUser")])
    .handler(a.handler.function(manageUsers)),

  removeFamilyUser: a
    .mutation()
    .arguments({ username: a.string().required() })
    .returns(a.boolean())
    .authorization((allow) => [allow.group("SuperUser")])
    .handler(a.handler.function(manageUsers)),

  resendVerificationEmail: a
    .mutation()
    .arguments({
      username: a.string().required(),
      resend:   a.boolean().required(),
    })
    .returns(a.boolean())
    .authorization((allow) => [allow.group("SuperUser")])
    .handler(a.handler.function(manageUsers)),

  // ---------------------------------------- Email-notification mutations
  // Fire-and-forget; failures don't roll back the action that triggered them.

  notifyRequestCreated: a
    .mutation()
    .arguments({
      requesterEmail: a.string().required(),
      requesterName:  a.string().required(),
      startDate:      a.string().required(),
      endDate:        a.string().required(),
      partyName:      a.string().required(),
      note:           a.string(),
    })
    .returns(a.boolean())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(sendEmails)),

  notifyRequestDecided: a
    .mutation()
    .arguments({
      requesterEmail: a.string().required(),
      requesterName:  a.string().required(),
      startDate:      a.string().required(),
      endDate:        a.string().required(),
      partyName:      a.string().required(),
      status:         a.string().required(),  // "Approved" | "Denied"
      reason:         a.string(),
    })
    .returns(a.boolean())
    .authorization((allow) => [allow.groups(["Admin", "SuperUser"])])
    .handler(a.handler.function(sendEmails)),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
    apiKeyAuthorizationMode: { expiresInDays: 365 },
  },
});
