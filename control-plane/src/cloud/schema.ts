import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
// Relative, not `@/`: drizzle-kit loads this file without the path aliases.
import { organization, user } from "../db/auth-schema";

/**
 * The workspace name someone typed at sign-up. The workspace itself is only
 * made once the address is confirmed, which is a later request, so the name
 * waits here and is deleted when the workspace is made.
 */
export const pendingWorkspace = pgTable("pending_workspace", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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

/**
 * A support ticket: a conversation between one person and the operator (the
 * superuser). Belongs to the person, not a workspace, so it survives a
 * workspace being deleted; the name, email and workspace are copied onto it
 * for the same reason (and so the operator sees who it was from even after the
 * account is gone).
 */
export const supportTicket = pgTable(
  "support_ticket",
  {
    id: text("id").primaryKey(),
    /** The short number people read out: "#12". */
    number: integer("number").generatedAlwaysAsIdentity().notNull(),
    userId: text("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    requesterName: text("requester_name").notNull(),
    requesterEmail: text("requester_email").notNull(),
    /** The workspace they had open when they wrote in. */
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "set null",
    }),
    workspaceName: text("workspace_name"),
    subject: text("subject").notNull(),
    category: text("category").notNull(),
    /** `sent`, `in_review`, `replied` or `resolved` (see `src/cloud/support/shared.ts`). */
    status: text("status").notNull().default("sent"),
    /** The operator replied and the requester hasn't looked yet. */
    requesterUnread: boolean("requester_unread").notNull().default(false),
    /** The requester wrote and the operator hasn't looked yet. */
    staffUnread: boolean("staff_unread").notNull().default(true),
    lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("support_ticket_user_idx").on(t.userId),
    index("support_ticket_last_message_idx").on(t.lastMessageAt),
  ],
);

export const supportMessage = pgTable(
  "support_message",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => supportTicket.id, { onDelete: "cascade" }),
    /** `user` (the requester) or `staff` (the operator). */
    author: text("author").notNull(),
    authorName: text("author_name").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("support_message_ticket_idx").on(t.ticketId, t.createdAt)],
);
