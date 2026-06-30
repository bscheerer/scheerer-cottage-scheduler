import { defineFunction } from "@aws-amplify/backend";

/**
 * Creates Stripe Checkout Sessions for BookableSlot purchases.
 * Lives in the data stack so it can be the @function handler for the
 * createCheckoutSession custom mutation without a circular dependency.
 */
export const stripeCheckout = defineFunction({
  name: "stripe-checkout",
  entry: "./handler.ts",
  timeoutSeconds: 30,
  resourceGroupName: "data",
});
