import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

/**
 * Encryption at rest for credentials the control plane has to hand back to a
 * provider later (e.g. a Telnyx API key). AES-256-GCM, keyed from
 * `SAMATA_ENCRYPTION_KEY`, falling back to `BETTER_AUTH_SECRET` so a default
 * install needs no extra setup. Changing the key makes stored credentials
 * unreadable: re-import the numbers.
 */
function key() {
  const secret =
    process.env.SAMATA_ENCRYPTION_KEY || process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "Set SAMATA_ENCRYPTION_KEY (or BETTER_AUTH_SECRET) to store provider credentials.",
    );
  }
  return createHash("sha256").update(`samata:secrets:${secret}`).digest();
}

/** `iv.tag.ciphertext`, base64url. */
export function encryptSecret(plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), data]
    .map((b) => b.toString("base64url"))
    .join(".");
}

export function decryptSecret(payload: string) {
  const [iv, tag, data] = payload
    .split(".")
    .map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}
