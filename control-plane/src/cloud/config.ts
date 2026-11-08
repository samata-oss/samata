/**
 * Everything under `src/cloud/` is the managed-cloud product (billing today)
 * and is inert unless `SAMATA_CLOUD` is set. A self-hosted install never sets
 * it: no billing pages, no Stripe calls, no limits on calls.
 *
 * The rest of the app reaches this directory through one file,
 * `src/server/cloud.ts`, plus the few places that mount UI or routes behind
 * `cloudEnabled()`. Keep it that way, so the directory stays easy to move.
 */

/** Whether this deployment is the managed cloud. Off unless `SAMATA_CLOUD` is `1` or `true`. */
export function cloudEnabled() {
  const flag = process.env.SAMATA_CLOUD?.trim().toLowerCase();
  return flag === "1" || flag === "true";
}

/** Concurrent calls a workspace gets for free when `SAMATA_FREE_CONCURRENT_CALLS` is unset. */
const DEFAULT_FREE_CONCURRENT_CALLS = 5;

/**
 * How many calls a workspace may have running at once without a
 * subscription. Past this, it needs the flat plan.
 */
export function freeConcurrentCalls() {
  const n = Number(process.env.SAMATA_FREE_CONCURRENT_CALLS);
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_FREE_CONCURRENT_CALLS;
}

export type BillingConfig = {
  secretKey: string;
  webhookSecret: string | null;
  /** The flat recurring price a workspace subscribes to. Checkout needs it, nothing else does. */
  priceId: string | null;
};

/** Stripe settings from the environment, or null if there is no Stripe key. */
export function billingConfig(): BillingConfig | null {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) return null;
  return {
    secretKey,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() || null,
    priceId: process.env.SAMATA_STRIPE_PRICE_ID?.trim() || null,
  };
}
