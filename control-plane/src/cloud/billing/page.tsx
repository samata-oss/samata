import { CheckIcon } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { canManageTeam } from "@/lib/workspace";
import { requireWorkspaceSession } from "@/server/workspace";
import { ManageBillingButton, UpgradeButton } from "./billing-buttons";
import { type BillingState, getBillingState } from "./service";

/** Keep in step with the price shown on the marketing site's pricing page. */
const PLUS_PRICE = "$20";

function plan(state: BillingState) {
  if (state.subscribed) {
    return { label: "Plus", variant: "default" as const };
  }
  if (state.status === "past_due" || state.status === "unpaid") {
    return { label: "Payment failed", variant: "destructive" as const };
  }
  return { label: "Free", variant: "secondary" as const };
}

function planSummary(state: BillingState) {
  if (state.subscribed) {
    return state.cancelsAt
      ? `Ends on ${fmtDate(state.cancelsAt)}, then back to Free.`
      : `${PLUS_PRICE} per month, no limit on concurrent calls.`;
  }
  if (state.status === "past_due" || state.status === "unpaid") {
    return `Your last payment failed, so you're on the free limit of ${state.freeLimit} concurrent calls.`;
  }
  return `Free up to ${state.freeLimit} concurrent calls per workspace.`;
}

function Notice({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "warning" | "destructive";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4 text-sm",
        tone === "neutral" && "bg-card text-muted-foreground",
        tone === "warning" &&
          "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400",
        tone === "destructive" &&
          "border-destructive/40 bg-destructive/5 text-foreground",
      )}
    >
      {children}
    </div>
  );
}

function Panel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-lg border bg-card p-4">
      <div className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
        {label}
      </div>
      {children}
    </div>
  );
}

/** Concurrent calls against the free limit, or just the count once subscribed. */
function Usage({ state }: { state: BillingState }) {
  const { activeCalls, freeLimit, subscribed } = state;
  const ratio = freeLimit > 0 ? activeCalls / freeLimit : 1;
  const atLimit = !subscribed && activeCalls >= freeLimit;
  const nearLimit = !subscribed && ratio >= 0.8;

  return (
    <Panel label="Concurrent calls">
      <div className="mt-1.5 flex items-baseline gap-1.5 tabular-nums">
        <span className="text-2xl font-semibold tracking-tight">
          {activeCalls.toLocaleString()}
        </span>
        <span className="text-sm text-muted-foreground">
          {subscribed ? "running now" : `of ${freeLimit} running now`}
        </span>
      </div>

      {subscribed ? (
        <p className="mt-3 text-xs text-muted-foreground">
          No limit on your plan.
        </p>
      ) : (
        <>
          <div
            role="progressbar"
            aria-label="Concurrent calls used"
            aria-valuemin={0}
            aria-valuemax={freeLimit}
            aria-valuenow={Math.min(activeCalls, freeLimit)}
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div
              className={cn(
                "h-full rounded-full bg-primary transition-[width]",
                nearLimit && "bg-amber-500",
                atLimit && "bg-destructive",
              )}
              style={{ width: `${Math.min(100, ratio * 100)}%` }}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {atLimit
              ? "At the free limit. New calls are blocked until one ends or you upgrade."
              : `${freeLimit - activeCalls} more can start before you hit the free limit.`}
          </p>
        </>
      )}
    </Panel>
  );
}

function PlanCard({
  name,
  price,
  period,
  features,
  current,
  action,
}: {
  name: string;
  price: string;
  period: string;
  features: string[];
  current: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border bg-card p-5",
        current && "border-primary/60 ring-1 ring-primary/30",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">{name}</h3>
        {current && <Badge variant="outline">Current plan</Badge>}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold tracking-tight">{price}</span>
        <span className="text-sm text-muted-foreground">{period}</span>
      </div>
      <ul className="mt-4 flex-1 space-y-2 text-sm">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <CheckIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** The Billing page (`/billing`). Mounted by `app/(dashboard)/billing/page.tsx`. */
export async function BillingPage({
  checkoutReturned,
}: {
  checkoutReturned: boolean;
}) {
  const { organizationId, role } = await requireWorkspaceSession();
  const state = await getBillingState(organizationId);
  const current = plan(state);
  const canManage = canManageTeam(role);
  const paymentFailed = current.label === "Payment failed";

  return (
    <PageShell
      title="Billing"
      description="Your plan and how much of it you're using."
      actions={
        state.configured && canManage && state.hasCustomer ? (
          <ManageBillingButton />
        ) : undefined
      }
    >
      {!state.configured && (
        <Notice tone="destructive">
          Upgrades aren't set up on this deployment. Set{" "}
          <code>STRIPE_SECRET_KEY</code> and <code>SAMATA_STRIPE_PRICE_ID</code>
          .
        </Notice>
      )}

      {checkoutReturned && !state.subscribed && (
        <Notice>
          Thanks! Stripe is confirming your payment method. This page updates
          within a few seconds: refresh to check.
        </Notice>
      )}

      {paymentFailed && (
        <Notice tone="destructive">
          Your last payment didn't go through.{" "}
          {canManage
            ? "Update your payment method with Manage billing to restore unlimited calls."
            : "Ask a workspace owner or admin to update the payment method."}
        </Notice>
      )}

      {state.subscribed && state.cancelsAt && (
        <Notice tone="warning">
          Your Plus plan ends on {fmtDate(state.cancelsAt)}. After that the
          workspace goes back to {state.freeLimit} concurrent calls.
        </Notice>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Panel label="Plan">
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={current.variant}>{current.label}</Badge>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {planSummary(state)}
          </p>
        </Panel>
        <Usage state={state} />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Plans</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <PlanCard
            name="Free"
            price="$0"
            period="forever"
            current={!state.subscribed}
            features={[
              `Up to ${state.freeLimit} concurrent calls`,
              "No per-minute platform fee",
              "Teams, invitations and API keys",
            ]}
          />
          <PlanCard
            name="Plus"
            price={PLUS_PRICE}
            period="per month, per workspace"
            current={state.subscribed}
            features={[
              "No limit on concurrent calls",
              "No per-minute platform fee",
              "Everything in Free",
            ]}
            action={
              // A failed payment is fixed in the portal; a second checkout would add a duplicate subscription.
              !state.subscribed && state.configured && !paymentFailed ? (
                canManage ? (
                  <UpgradeButton className="w-full" />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Only workspace owners and admins can change billing.
                  </p>
                )
              ) : undefined
            }
          />
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        Model, transcription and voice providers bill you directly through your
        own keys. Samata adds no margin to them.
      </p>
    </PageShell>
  );
}
