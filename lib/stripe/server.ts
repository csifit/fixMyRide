import "server-only";

import Stripe from "stripe";
import { z } from "zod";

const secretSchema = z.string().regex(/^sk_(?:test|live)_[A-Za-z0-9]+$/);
const priceSchema = z.string().regex(/^price_[A-Za-z0-9]+$/);
const webhookSchema = z.string().regex(/^whsec_[A-Za-z0-9]+$/);

let stripeClient: Stripe | undefined;

export function getStripe() {
  if (!stripeClient) stripeClient = new Stripe(secretSchema.parse(process.env.STRIPE_SECRET_KEY));
  return stripeClient;
}

export function getStripeStandardPriceId() {
  return priceSchema.parse(process.env.STRIPE_STANDARD_MONTHLY_PRICE_ID);
}

export function getStripeWebhookSecret() {
  return webhookSchema.parse(process.env.STRIPE_WEBHOOK_SECRET);
}

export function isStripeConfigured() {
  return secretSchema.safeParse(process.env.STRIPE_SECRET_KEY).success
    && priceSchema.safeParse(process.env.STRIPE_STANDARD_MONTHLY_PRICE_ID).success;
}
