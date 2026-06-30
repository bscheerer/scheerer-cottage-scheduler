import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import Stripe from "stripe";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

interface Args { slotId: string }

interface Identity {
  sub?: string;
  username?: string;
  claims?: { email?: string; preferred_username?: string };
}

interface Result { checkoutUrl: string }

/**
 * Creates a Stripe Checkout Session for a single BookableSlot. Returns the
 * Stripe-hosted URL; the frontend redirects there. Stripe handles cards,
 * Apple Pay, 3DS, etc. After payment (or cancel) Stripe redirects to
 * APP_URL/book/success or /book/cancelled. The webhook (Phase C.2) flips
 * the slot to Sold when payment lands.
 *
 * Pulls the slot from DynamoDB so price + title can't be tampered with by
 * the client.
 */
export const handler = async (event: unknown): Promise<Result> => {
  console.log("stripe-checkout :: event ::", JSON.stringify(event));

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY not configured");

  const table = process.env.BOOKABLE_SLOT_TABLE;
  if (!table) throw new Error("BOOKABLE_SLOT_TABLE not configured");

  const stripe = new Stripe(secretKey);

  const e = event as Record<string, unknown>;
  const args = (e?.arguments ?? e ?? {}) as Args;
  const identity = (e?.identity ?? {}) as Identity;
  const slotId = args.slotId;
  if (!slotId) throw new Error("slotId is required");

  const { Item } = await ddb.send(new GetCommand({
    TableName: table,
    Key: { id: slotId },
  }));

  if (!Item) throw new Error("Slot not found");
  if (Item.status !== "Open") {
    throw new Error(`This slot is no longer available (status: ${Item.status})`);
  }

  const appUrl = process.env.APP_URL || "https://www.morben.net";
  const buyerEmail = identity.claims?.email;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: buyerEmail,
    line_items: [{
      price_data: {
        currency: "usd",
        product_data: {
          name: String(Item.title || "Scheerer Cottage stay"),
          description: Item.description ? String(Item.description) : undefined,
        },
        unit_amount: Number(Item.priceCents),
      },
      quantity: 1,
    }],
    metadata: {
      slotId,
      buyerId: identity.sub || "unknown",
      buyerEmail: buyerEmail || "",
      buyerName: identity.claims?.preferred_username || "",
      slotTitle: String(Item.title || ""),
      slotStartDate: String(Item.startDate || ""),
    },
    success_url: `${appUrl}/book/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${appUrl}/book/cancelled`,
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL");

  return { checkoutUrl: session.url };
};
