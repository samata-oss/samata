import { and, count, eq, gte } from "drizzle-orm";
import Stripe from "stripe";
import { db } from "@/db";
import { callLog } from "@/db/schema";
import { CallBlockedError } from "@/server/cloud";
import {
  type BillingConfig,
  billingConfig,
  freeConcurrentCalls,
} from "../config";
import { billingAccount } from "../schema";

/**
 * Billing for the managed cloud. Samata is free up to a number of concurrent
 * calls per workspace (`SAMATA_FREE_CONCURRENT_CALLS`). Past that, the
 * workspace needs the flat plan: one Stripe subscription, no metering, and
 * no limit once it is subscribed.
 *
 *   start of call   -> `assertBillingAllows`  (under the free limit, or subscribed)
 *   Stripe webhooks -> `handleStripeWebhook`  (keeps the subscription status current)
 *
 * Model providers are bring-your-own-key, so the plan only covers Samata.
 */

/** Subscription statuses that lift the limit. `past_due` doesn't: the workspace drops back to the free limit. */
const ACTIVE_STATUSES = ["active", "trialing"];

/**
 * A call still marked in progress after this long is treated as dead (the
 * worker crashed before reporting), so it can't hold a slot forever.
 */
const MAX_CALL_AGE_MS = 2 * 60 * 60 * 1000;

export class BillingNotConfiguredError extends Error {
  constructor() {
    super(
      "Upgrades aren't set up on this deployment (STRIPE_SECRET_KEY and SAMATA_STRIPE_PRICE_ID).",
    );
  }
}

let cached: { key: string; client: Stripe } | undefined;

function stripeFor(config: BillingConfig) {
  if (cached?.key !== config.secretKey) {
    cached = { key: config.secretKey, client: new Stripe(config.secretKey) };
  }
  return cached.client;
}

function requireStripe() {
  const config = billingConfig();
  if (!config) throw new BillingNotConfiguredError();
  return { config, stripe: stripeFor(config) };
}

/** Checkout also needs the price to sell. */
function requireCheckout() {
  const { config, stripe } = requireStripe();
  if (!config.priceId) throw new BillingNotConfiguredError();
  return { priceId: config.priceId, stripe };
}

export type BillingState = {
  /** Stripe is set up, so the workspace can upgrade. */
  configured: boolean;
  status: string | null;
  /** Subscribed, so there is no concurrent-call limit. */
  subscribed: boolean;
  hasCustomer: boolean;
  freeLimit: number;
  /** Calls running right now. */
  activeCalls: number;
};

async function accountOf(organizationId: string) {
  const [row] = await db
    .select()
    .from(billingAccount)
    .where(eq(billingAccount.organizationId, organizationId))
    .limit(1);
  return row;
}

/** Calls this workspace has running right now. */
async function activeCallCount(organizationId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(callLog)
    .where(
      and(
        eq(callLog.organizationId, organizationId),
        eq(callLog.status, "in-progress"),
        gte(callLog.startedAt, new Date(Date.now() - MAX_CALL_AGE_MS)),
      ),
    );
  return row?.n ?? 0;
}

export async function getBillingState(
  organizationId: string,
): Promise<BillingState> {
  const [account, activeCalls] = await Promise.all([
    accountOf(organizationId),
    activeCallCount(organizationId),
  ]);
  return {
    configured: Boolean(billingConfig()?.priceId),
    status: account?.subscriptionStatus ?? null,
    subscribed: ACTIVE_STATUSES.includes(account?.subscriptionStatus ?? ""),
    hasCustomer: account !== undefined,
    freeLimit: freeConcurrentCalls(),
    activeCalls,
  };
}

/**
 * Throws `CallBlockedError` if starting one more call would put the workspace
 * over the free limit without a subscription.
 *
 * It is a soft limit: calls that start in the same instant can each see room
 * and all go through. That is fine for a plan boundary.
 */
export async function assertBillingAllows(organizationId: string) {
  const [account, active] = await Promise.all([
    accountOf(organizationId),
    activeCallCount(organizationId),
  ]);
  if (ACTIVE_STATUSES.includes(account?.subscriptionStatus ?? "")) return;

  const limit = freeConcurrentCalls();
  if (active < limit) return;

  throw new CallBlockedError(
    "concurrency-limit",
    `This workspace is at the free limit of ${limit} concurrent ${
      limit === 1 ? "call" : "calls"
    }. Upgrade on the Billing page to run more.`,
  );
}

// --- Checkout and portal -----------------------------------------------------

async function ensureCustomer(
  stripe: Stripe,
  who: { organizationId: string; workspaceName: string; email: string },
) {
  const existing = await accountOf(who.organizationId);
  if (existing) return existing.stripeCustomerId;

  const customer = await stripe.customers.create(
    {
      name: who.workspaceName,
      email: who.email,
      metadata: { organization_id: who.organizationId },
    },
    // A double click must not create two customers.
    { idempotencyKey: `samata-customer-${who.organizationId}` },
  );
  await db
    .insert(billingAccount)
    .values({
      organizationId: who.organizationId,
      stripeCustomerId: customer.id,
    })
    .onConflictDoNothing();
  return (await accountOf(who.organizationId))?.stripeCustomerId ?? customer.id;
}

/** A Stripe Checkout URL to subscribe the workspace to the flat plan. */
export async function createCheckoutUrl(who: {
  organizationId: string;
  workspaceName: string;
  email: string;
  baseUrl: string;
}) {
  const { priceId, stripe } = requireCheckout();
  const customer = await ensureCustomer(stripe, who);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: who.organizationId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: { metadata: { organization_id: who.organizationId } },
    success_url: `${who.baseUrl}/billing?checkout=success`,
    cancel_url: `${who.baseUrl}/billing`,
  });
  if (!session.url) throw new Error("Stripe did not return a Checkout URL.");
  return session.url;
}

/** A Stripe customer portal URL (payment method, invoices, cancel). */
export async function createPortalUrl(who: {
  organizationId: string;
  baseUrl: string;
}) {
  const { stripe } = requireStripe();
  const account = await accountOf(who.organizationId);
  if (!account) throw new Error("This workspace has no billing account yet.");

  const session = await stripe.billingPortal.sessions.create({
    customer: account.stripeCustomerId,
    return_url: `${who.baseUrl}/billing`,
  });
  return session.url;
}

// --- Stripe webhooks ---------------------------------------------------------

const SUBSCRIPTION_EVENTS = [
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
];

export class WebhookError extends Error {
  constructor(
    readonly status: 400 | 503,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Verify a Stripe webhook and apply it. The signature is the only auth, so it
 * is checked against the raw body before anything is read from it.
 */
export async function handleStripeWebhook(
  rawBody: string,
  signature: string | undefined,
) {
  const config = billingConfig();
  if (!config?.webhookSecret) {
    throw new WebhookError(503, "STRIPE_WEBHOOK_SECRET is not set.");
  }
  if (!signature) throw new WebhookError(400, "Missing stripe-signature.");

  const stripe = stripeFor(config);
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      config.webhookSecret,
    );
  } catch {
    throw new WebhookError(400, "Invalid signature.");
  }

  if (!SUBSCRIPTION_EVENTS.includes(event.type)) return;

  // Re-read the subscription instead of trusting this event's snapshot:
  // Stripe doesn't deliver events in order, and the API is always current.
  const sent = event.data.object as Stripe.Subscription;
  const subscription = await stripe.subscriptions.retrieve(sent.id);
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const updated = await db
    .update(billingAccount)
    .set({
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
    })
    .where(eq(billingAccount.stripeCustomerId, customerId))
    .returning({ organizationId: billingAccount.organizationId });

  if (updated.length === 0) {
    console.warn("[billing] subscription for an unknown customer", customerId);
  }
}
