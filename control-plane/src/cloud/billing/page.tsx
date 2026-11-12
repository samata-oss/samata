import { PageShell, Stat } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/format";
import { canManageTeam } from "@/lib/workspace";
import { requireWorkspaceSession } from "@/server/workspace";
import { BillingButtons } from "./billing-buttons";
import { type BillingState, getBillingState } from "./service";

function plan(state: BillingState) {
  if (state.subscribed) {
    return { label: "Unlimited", variant: "default" as const };
  }
  if (state.status === "past_due" || state.status === "unpaid") {
    return { label: "Payment failed", variant: "destructive" as const };
  }
  return { label: "Free", variant: "secondary" as const };
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

  return (
    <PageShell
      title="Billing"
      description={`Free for up to ${state.freeLimit} concurrent calls. A flat monthly plan removes the limit. Model, transcription and voice providers bill you directly through your own keys.`}
    >
      {!state.configured && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          Upgrades aren't set up on this deployment. Set{" "}
          <code>STRIPE_SECRET_KEY</code> and <code>SAMATA_STRIPE_PRICE_ID</code>
          .
        </div>
      )}

      {checkoutReturned && !state.subscribed && (
        <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Thanks! Stripe is confirming your payment method. This page updates
          within a few seconds: refresh to check.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Plan"
          value={<Badge variant={current.variant}>{current.label}</Badge>}
          hint={
            state.cancelsAt
              ? `Cancels on ${fmtDate(state.cancelsAt)}, then back to Free`
              : undefined
          }
        />
        <Stat
          label="Calls running now"
          value={state.activeCalls.toLocaleString()}
          hint={
            state.subscribed
              ? "No limit on your plan"
              : `Limit is ${state.freeLimit} on the free plan`
          }
        />
      </div>

      {state.configured && (
        <BillingButtons
          subscribed={state.subscribed}
          hasCustomer={state.hasCustomer}
          canManage={canManageTeam(role)}
        />
      )}
    </PageShell>
  );
}
