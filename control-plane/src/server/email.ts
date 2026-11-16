/**
 * Transactional email through Resend (https://resend.com): account
 * verification, password reset and invitations.
 *
 * Optional. Set `RESEND_API_KEY` and `SAMATA_EMAIL_FROM` (an address on a
 * domain verified in Resend, e.g. `Samata <noreply@example.com>`) to turn it
 * on. Without them, the message is written to the server log instead, so a
 * self-hosted install still works: the admin copies the link from the log.
 */

const RESEND_URL = "https://api.resend.com/emails";

/** Resend is set up, so email really is sent. */
export function emailConfigured() {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() && process.env.SAMATA_EMAIL_FROM?.trim(),
  );
}

/**
 * Email can reach people: Resend is set up, or this isn't production (where
 * messages are logged to the console, which is enough for development). A
 * production install without Resend can't deliver anything, so features that
 * depend on delivery stay off there.
 */
export function emailEnabled() {
  return emailConfigured() || process.env.NODE_ENV !== "production";
}

const escapeHtml = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

type Message = {
  to: string;
  subject: string;
  /** Short paragraphs, plain text. */
  paragraphs: string[];
  /** The one thing to click. */
  action?: { label: string; url: string };
  /** Small print under the button. */
  footnote?: string;
  /**
   * Shown as the sender's name in place of the configured one (the address
   * stays). Lets a thread of notifications say who each one is about.
   */
  fromName?: string;
  /** Extra mail headers, e.g. `In-Reply-To` and `References` to join a thread. */
  headers?: Record<string, string>;
};

function render({ paragraphs, action, footnote }: Message) {
  const text = [
    ...paragraphs,
    ...(action ? [`${action.label}: ${action.url}`] : []),
    ...(footnote ? [footnote] : []),
    "Samata",
  ].join("\n\n");

  const p = (s: string) =>
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#18181b">${escapeHtml(s)}</p>`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;padding:32px">
<div style="font-size:18px;font-weight:600;margin:0 0 24px;color:#18181b">Samata</div>
${paragraphs.map(p).join("")}
${
  action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;font-size:15px;font-weight:500;padding:10px 18px;border-radius:6px">${escapeHtml(action.label)}</a></p>
<p style="margin:0 0 16px;font-size:12px;line-height:1.5;color:#71717a">Or paste this link into your browser:<br><span style="word-break:break-all">${escapeHtml(action.url)}</span></p>`
    : ""
}
${footnote ? `<p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#71717a">${escapeHtml(footnote)}</p>` : ""}
</div></body></html>`;
  return { text, html };
}

/** The address part of `SAMATA_EMAIL_FROM` (`Name <a@b.c>` or just `a@b.c`). */
function fromAddress() {
  const from = process.env.SAMATA_EMAIL_FROM?.trim() ?? "";
  return from.match(/<([^>]+)>\s*$/)?.[1] ?? from;
}

/** The `from` for a message: the configured one, or the configured address under another name. */
function fromHeader(name?: string) {
  // Letters, digits and a little punctuation only: this goes into a header.
  const safe = name
    ?.replace(/[^\p{L}\p{N} .'_-]/gu, "")
    .trim()
    .slice(0, 60);
  return safe
    ? `${safe} via Samata <${fromAddress()}>`
    : process.env.SAMATA_EMAIL_FROM?.trim();
}

/**
 * Send one email. Never throws: a mail outage must not break sign-up or
 * crash a request, and the auth endpoints that call this answer the same
 * whether or not the address exists, so a failure here must not show.
 */
async function send(message: Message) {
  const { text, html } = render(message);

  if (!emailConfigured()) {
    console.log(
      `[email] to ${message.to}: ${message.subject}\n${text}\n(set RESEND_API_KEY and SAMATA_EMAIL_FROM to send email)`,
    );
    return;
  }

  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY?.trim()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: fromHeader(message.fromName),
        to: message.to,
        ...(message.headers ? { headers: message.headers } : {}),
        subject: message.subject,
        text,
        html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(
        "[email] Resend refused",
        res.status,
        await res.text().catch(() => ""),
      );
    }
  } catch (err) {
    console.error("[email] could not reach Resend", err);
  }
}

export function sendVerificationEmail(to: string, name: string, url: string) {
  return send({
    to,
    subject: "Confirm your email for Samata",
    paragraphs: [
      `Hi ${name},`,
      "Confirm your email address to finish creating your Samata account.",
    ],
    action: { label: "Confirm email", url },
    footnote:
      "The link expires in an hour. If you didn't sign up, you can ignore this email.",
  });
}

export function sendPasswordResetEmail(to: string, name: string, url: string) {
  return send({
    to,
    subject: "Reset your Samata password",
    paragraphs: [
      `Hi ${name},`,
      "Someone asked to reset the password for your Samata account. If that was you, choose a new one below.",
    ],
    action: { label: "Reset password", url },
    footnote:
      "The link expires in an hour. If you didn't ask for this, you can ignore this email: your password hasn't changed.",
  });
}

export function sendInvitationEmail(
  to: string,
  workspaceName: string,
  inviterName: string,
  url: string,
) {
  return send({
    to,
    subject: `${inviterName} invited you to ${workspaceName} on Samata`,
    paragraphs: [
      `${inviterName} invited you to join ${workspaceName} on Samata.`,
    ],
    action: { label: "Accept invitation", url },
  });
}

/** Tells the superuser that someone created a cloud account. */
export function sendSignupNotification(
  to: string,
  newUser: { name: string; email: string; emailVerified: boolean },
  url: string | null,
) {
  return send({
    to,
    subject: `New Samata sign-up: ${newUser.email}`,
    paragraphs: [
      `${newUser.name} just signed up for Samata cloud.`,
      `Email: ${newUser.email}`,
      newUser.emailVerified
        ? "Email confirmed: yes"
        : "Email confirmed: not yet (their workspace is created once they confirm)",
      `Signed up: ${new Date().toUTCString()}`,
    ],
    action: url ? { label: "View in Admin", url } : undefined,
  });
}

/** Someone tried to sign up with an address that already has an account. */
export function sendExistingAccountEmail(
  to: string,
  name: string,
  url: string,
) {
  return send({
    to,
    subject: "Someone tried to sign up with your email",
    paragraphs: [
      `Hi ${name},`,
      "Someone just tried to create a Samata account with your email address, but you already have one.",
      "If that was you, sign in instead. If you've forgotten your password, you can reset it.",
    ],
    action: { label: "Sign in", url },
    footnote: "If it wasn't you, you can ignore this email.",
  });
}

/**
 * Every "someone wrote to support" alert goes to the operator on one thread,
 * across every ticket and every person. Mail clients group by subject plus the
 * `References` header, and the provider picks its own `Message-ID`, so we
 * can't point at a real earlier message. Instead every alert carries the same
 * subject and refers to the same made-up root id, which is what ties them
 * together.
 */
const SUPPORT_THREAD_SUBJECT = "Samata support";

/** A made-up but stable `Message-ID` on our own domain, for threading. */
function threadId(name: string) {
  const domain = fromAddress()
    .split("@")[1]
    ?.replace(/[^a-z0-9.-]/gi, "");
  return `<${name}@${domain || "samata.dev"}>`;
}

const clip = (s: string, max: number) =>
  s.length > max ? `${s.slice(0, max).trimEnd()}…` : s;

/**
 * Tells the operator about a new ticket or a new message on one, in the single
 * support thread. `body` is what the person wrote.
 */
export function sendSupportAlert(
  to: string,
  alert: {
    kind: "ticket" | "message";
    number: number;
    subject: string;
    category: string;
    from: { name: string; email: string };
    workspaceName: string | null;
    body: string;
  },
  url: string | null,
) {
  const root = threadId("samata-support-inbox");
  const who = `${alert.from.name} <${alert.from.email}>`;
  return send({
    to,
    subject: SUPPORT_THREAD_SUBJECT,
    fromName: alert.from.name,
    headers: { "In-Reply-To": root, References: root },
    paragraphs: [
      alert.kind === "ticket"
        ? `New ticket #${alert.number} from ${who}: ${alert.subject}`
        : `New message on ticket #${alert.number} from ${who}: ${alert.subject}`,
      `Category: ${alert.category}${alert.workspaceName ? ` · Workspace: ${alert.workspaceName}` : ""}`,
      ...clip(alert.body.trim(), 1500).split(/\n+/),
    ],
    action: url ? { label: "Open ticket", url } : undefined,
  });
}

/** Tells someone the operator replied to their ticket. One thread per ticket. */
export function sendSupportReply(
  to: string,
  reply: { number: number; subject: string; body: string },
  url: string | null,
) {
  const root = threadId(`samata-support-ticket-${reply.number}`);
  return send({
    to,
    subject: `Re: ${reply.subject} (#${reply.number})`,
    headers: { "In-Reply-To": root, References: root },
    paragraphs: [
      "Samata support replied to your ticket:",
      ...clip(reply.body.trim(), 1500).split(/\n+/),
    ],
    action: url ? { label: "View ticket", url } : undefined,
    footnote:
      "Reply from the Support page in Samata. Replying to this email won't reach us.",
  });
}
