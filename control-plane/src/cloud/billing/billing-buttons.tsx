"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { openPortalAction, startCheckoutAction } from "./actions";

/** Runs a billing action, then sends the person to the Stripe URL it returns. */
function useStripeRedirect(action: typeof startCheckoutAction) {
  const [pending, startTransition] = useTransition();

  function go() {
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      window.location.assign(res.url);
    });
  }

  return { pending, go };
}

/** Opens Stripe Checkout to subscribe the workspace to the flat plan. */
export function UpgradeButton({
  className,
  disabled,
}: {
  className?: string;
  disabled?: boolean;
}) {
  const { pending, go } = useStripeRedirect(startCheckoutAction);
  return (
    <Button className={className} disabled={pending || disabled} onClick={go}>
      {pending ? "Opening Stripe…" : "Upgrade to Plus"}
    </Button>
  );
}

/** Opens the Stripe customer portal (payment method, invoices, cancel). */
export function ManageBillingButton({
  variant = "outline",
}: {
  variant?: "default" | "outline";
}) {
  const { pending, go } = useStripeRedirect(openPortalAction);
  return (
    <Button variant={variant} disabled={pending} onClick={go}>
      {pending ? "Opening Stripe…" : "Manage billing"}
    </Button>
  );
}
