import { Hono } from "hono";
import { cloudEnabled } from "../config";

/**
 * Mounted at `/api/billing` for every install, but answers 404 unless
 * `SAMATA_CLOUD` is set (checked per request, so it follows the environment
 * the server runs in rather than the one it was built in). The Stripe code is
 * only loaded once a request gets past that check.
 */
export const billingRoutes = new Hono()
  .use(async (c, next) => {
    if (!cloudEnabled()) return c.json({ error: "Not found" }, 404);
    return next();
  })

  /**
   * Stripe -> us. Authenticated by Stripe's signature, not a session, so it
   * must read the body as raw text.
   */
  .post("/webhook", async (c) => {
    const { handleStripeWebhook, WebhookError } = await import("./service");
    try {
      await handleStripeWebhook(
        await c.req.text(),
        c.req.header("stripe-signature"),
      );
      return c.json({ received: true });
    } catch (err) {
      if (err instanceof WebhookError) {
        return c.json({ error: err.message }, err.status);
      }
      // Anything else is ours to fix: a non-2xx makes Stripe retry later.
      console.error("[billing] webhook failed", err);
      return c.json({ error: "Webhook failed." }, 500);
    }
  });
