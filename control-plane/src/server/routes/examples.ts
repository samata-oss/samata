import { Hono } from "hono";

/**
 * A stand-in for a *customer's* tool server, so the seeded agent can show a
 * forwarded tool call end to end. Real deployments point `tool.server.url`
 * at their own backend instead.
 */
export const exampleRoutes = new Hono().post("/order-status", async (c) => {
  const body = await c.req.json<{
    message: {
      toolCallList: { id: string; arguments: { orderNumber?: string } }[];
    };
  }>();
  return c.json({
    results: body.message.toolCallList.map((tc) => ({
      toolCallId: tc.id,
      result: tc.arguments.orderNumber
        ? `Order ${tc.arguments.orderNumber} shipped yesterday and arrives Friday.`
        : "Ask the caller for their order number.",
    })),
  });
});
