// Build a Purchase event from a Stripe PaymentIntent.
// Since Stripe API version 2022-11-15 the PaymentIntent has no `charges` list.
// Use `latest_charge` instead, and expand it if you need the Charge object.

import Stripe from 'stripe';
import { buildCapiEvent, sendCapi } from './capi-payload';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Stripe amounts are in the smallest unit. Zero-decimal currencies are already whole units.
// Partial list; see Stripe's currency docs for the full set.
const ZERO_DECIMAL = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']);
const toMajorUnits = (amount: number, currency: string) =>
  ZERO_DECIMAL.has(currency.toLowerCase()) ? amount : amount / 100;

export async function sendPurchaseForPaymentIntent(
  paymentIntentId: string,
  ctx: { eventId: string; sourceUrl: string; ip?: string; userAgent?: string; fbc?: string; fbp?: string },
) {
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ['latest_charge'],
  });

  // OLD (breaks on newer API versions): pi.charges.data[0]
  // NEW:
  const charge = pi.latest_charge as Stripe.Charge | null;
  if (!charge || !charge.paid) return; // no money taken, no Purchase

  const email = charge.billing_details?.email ?? pi.receipt_email ?? undefined;
  const phone = charge.billing_details?.phone ?? undefined;

  const event = buildCapiEvent({
    eventName: 'Purchase',
    eventId: ctx.eventId, // must equal the eventID your browser Purchase used
    sourceUrl: ctx.sourceUrl,
    email,
    phone: phone ?? undefined,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    fbc: ctx.fbc,
    fbp: ctx.fbp,
    value: toMajorUnits(pi.amount_received, pi.currency),
    currency: pi.currency.toUpperCase(),
  });
  return sendCapi([event]);
}

// Tip: store fbc, fbp, ip, user agent and the event ID in the PaymentIntent
// metadata when you create it. Webhooks have no browser, so you need them later.
