import { asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { agent, user } from "@/db/schema";
import { agentConfigSchema } from "@/lib/agent-config";
import { DEFAULT_ORGANIZATION_ID } from "@/lib/workspace";
import { uniqueSlug } from "@/server/agents";
import { auth } from "@/server/auth";
import { isDemoKey } from "@/server/demo";
import { listProviderKeys, saveProviderKey } from "@/server/provider-keys";

/**
 * Zero-friction sign-in for the laptop quickstart (`npx @samata-oss/cli init`).
 *
 * When `SAMATA_LOCAL_LOGIN=true`, opening the dashboard signs you straight in
 * as a fixed local account instead of asking you to create one. The account is
 * made on first use, so it's the install's first account and owns the default
 * workspace like any other first sign-up.
 *
 * The password is public, so this is for machines only you can reach. Only
 * `deploy/docker-compose.local.yml` turns it on, and it publishes the
 * dashboard on 127.0.0.1 only. Never set it on a server.
 */
export const LOCAL_EMAIL = "admin@samata.local";
export const LOCAL_PASSWORD = "12345678";
const LOCAL_NAME = "Admin";

export const localLoginEnabled = () =>
  process.env.SAMATA_LOCAL_LOGIN === "true";

/**
 * Whether the local account is (or can become) the way into this install:
 * true on a fresh database or once the local account exists. If someone made
 * their own account instead, auto sign-in steps aside for the normal form.
 */
export async function localLoginAvailable() {
  if (!localLoginEnabled()) return false;
  const [{ users }] = await db.select({ users: count() }).from(user);
  if (users === 0) return true;
  const [local] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, LOCAL_EMAIL))
    .limit(1);
  return Boolean(local);
}

/**
 * The quickstart CLI passes in one key, `SAMATA_LOCAL_SPEKO_API_KEY`: either
 * the person's Speko key (it covers the model, the transcriber and the voice) or,
 * when they skipped it, a free-demo token (`sk_demo_...`) from Samata's demo
 * proxy. A demo token is saved as both the OpenRouter and the Deepgram key,
 * since the demo proxy stands in for those two accounts.
 *
 * Only into a workspace with no keys at all: after that the dashboard is the
 * source of truth, so a key you changed or added there isn't overwritten.
 * Never throws: a failure here shouldn't stop you getting in.
 */
async function seedLocalKeys() {
  const key = localKey();
  if (!key) return;
  try {
    if ((await listProviderKeys(DEFAULT_ORGANIZATION_ID)).length > 0) return;
    for (const provider of isDemoKey(key)
      ? (["openrouter", "deepgram"] as const)
      : (["speko"] as const)) {
      await saveProviderKey(DEFAULT_ORGANIZATION_ID, provider, key);
    }
  } catch (err) {
    console.error("[local-login] could not save the key", err);
  }
}

const localKey = () =>
  process.env.SAMATA_LOCAL_SPEKO_API_KEY?.trim() || undefined;

/**
 * A receptionist that's ready to talk to, so the quickstart doesn't open on an
 * empty list. With a Speko key it runs on Speko (Muse Voice Transcribe,
 * DeepSeek V4.1 Flash, Inworld TTS 2). Otherwise it runs on what the free demo
 * covers: Deepgram Nova-3 and Aura-2 for speech, DeepSeek V4.1 Flash through
 * OpenRouter for the model. Without any key the Test tab says what's missing.
 *
 * Called when the local account is first created, i.e. once per install, so
 * deleting the assistant doesn't bring it back. Never throws.
 */
async function seedLocalAgent() {
  try {
    const [{ agents }] = await db
      .select({ agents: count() })
      .from(agent)
      .where(eq(agent.organizationId, DEFAULT_ORGANIZATION_ID));
    if (agents > 0) return;

    const key = localKey();
    const onSpeko = Boolean(key) && !isDemoKey(key);
    const name = "Receptionist";
    await db.insert(agent).values({
      organizationId: DEFAULT_ORGANIZATION_ID,
      slug: await uniqueSlug(name),
      name,
      config: agentConfigSchema.parse({
        firstMessage: "Thanks for calling Acme. How can I help you today?",
        model: {
          provider: onSpeko ? "speko" : "openrouter",
          systemPrompt:
            "You are the receptionist for Acme, a small business. Greet callers warmly, find out why they're calling, and help with simple questions: opening hours (Monday to Friday, 9am to 5pm), where to find us, and booking or changing an appointment. For a booking, ask for their name, a phone number and a day and time that suits them, then read it back to confirm. If you don't know something, say so and offer to take a message instead of guessing. This is a phone call: keep replies to one or two short sentences, with no lists or markdown.",
        },
        transcriber: { provider: onSpeko ? "speko" : "deepgram" },
        voice: { provider: onSpeko ? "speko" : "deepgram" },
      }),
    });
  } catch (err) {
    console.error("[local-login] could not create the first assistant", err);
  }
}

/** The path of the install's first assistant, or null if it has none. */
export async function firstLocalAgentPath() {
  const [first] = await db
    .select({ slug: agent.slug })
    .from(agent)
    .where(eq(agent.organizationId, DEFAULT_ORGANIZATION_ID))
    .orderBy(asc(agent.createdAt))
    .limit(1);
  return first ? `/assistants/${first.slug}` : null;
}

/**
 * Sign in as the local account, creating it on a fresh install. Returns the
 * response headers (carrying the session cookies), or null if it can't: local
 * login is off, or the account's password was changed.
 */
export async function signInLocal(): Promise<Headers | null> {
  if (!(await localLoginAvailable())) return null;

  const signIn = () =>
    auth.api.signInEmail({
      body: { email: LOCAL_EMAIL, password: LOCAL_PASSWORD },
      returnHeaders: true,
    });

  try {
    const [existing] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, LOCAL_EMAIL))
      .limit(1);
    if (existing) {
      const { headers } = await signIn();
      await seedLocalKeys();
      return headers;
    }

    // Signing up also signs in, so this already carries the session cookies.
    const created = await auth.api
      .signUpEmail({
        body: {
          name: LOCAL_NAME,
          email: LOCAL_EMAIL,
          password: LOCAL_PASSWORD,
        },
        returnHeaders: true,
      })
      // Two tabs opened at once: the other request made the account first.
      .catch(() => null);
    const { headers } = created ?? (await signIn());
    await seedLocalKeys();
    if (created) await seedLocalAgent();
    return headers;
  } catch (err) {
    console.error("[local-login] could not sign in", err);
    return null;
  }
}
