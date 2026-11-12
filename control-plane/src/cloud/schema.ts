import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
// Relative, not `@/`: drizzle-kit loads this file without the path aliases.
import { organization } from "../db/auth-schema";

/**
 * A workspace's Stripe customer and subscription. Created the first time the
 * workspace opens Checkout. The table exists on every install (one migration
 * history) but only the managed cloud writes to it.
 */
export const billingAccount = pgTable("billing_account", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id").notNull().unique(),
  stripeSubscriptionId: text("stripe_subscription_id"),
  /** Stripe's subscription status; null until the workspace subscribes. */
  subscriptionStatus: text("subscription_status"),
  /**
   * When the subscription is set to end (cancelled at the end of the billing
   * period, or on a scheduled date); null while it will renew. The status
   * stays `active` until then.
   */
  cancelAt: timestamp("cancel_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
