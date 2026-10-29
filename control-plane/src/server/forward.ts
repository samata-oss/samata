import { SECRET_HEADER } from "@/server/webhook-auth";

type Server = { url: string; secret?: string; timeoutSeconds: number };

/** POST a Vapi-style `{ message }` envelope to a customer server. */
export async function forward<T = unknown>(
  server: Server,
  message: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(server.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(server.secret && { [SECRET_HEADER]: server.secret }),
    },
    body: JSON.stringify({ message }),
    signal: AbortSignal.timeout(server.timeoutSeconds * 1000),
  });
  if (!res.ok) {
    throw new Error(`${server.url} responded ${res.status}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}
