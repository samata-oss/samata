"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { openPortalAction, startCheckoutAction } from "./actions";

/** Subscribe (Stripe Checkout) or manage (Stripe portal), depending on the plan. */
export function BillingButtons({
  subscribed,
  hasCustomer,
  canManage,
}: {
  subscribed: boolean;
  hasCustomer: boolean;
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function go(action: typeof startCheckoutAction) {
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      window.location.assign(res.url);
    });
  }

  if (!canManage) {
    return (
      <p className="text-sm text-muted-foreground">
        Only workspace owners and admins can change billing.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {!subscribed && (
        <Button disabled={pending} onClick={() => go(startCheckoutAction)}>
          {pending ? "Opening Stripe…" : "Upgrade"}
        </Button>
      )}
      {hasCustomer && (
        <Button
          variant={subscribed ? "default" : "outline"}
          disabled={pending}
          onClick={() => go(openPortalAction)}
        >
          Manage billing
        </Button>
      )}
    </div>
  );
}
