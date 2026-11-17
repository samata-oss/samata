/**
 * What the demo may spend, and who may ask for more. Everything is a counter in
 * the store, in micro-dollars:
 *
 *   - one install: `installBudget` in total, over the life of its token;
 *   - the whole demo: `dailyBudget` per UTC day, so a bad day has a ceiling
 *     however many installs there are;
 *   - new tokens: `claimsPerIp` per address per day and `dailyClaims` overall.
 *
 * The providers' own balances are the last backstop behind these.
 */

const DAY_SECONDS = 24 * 3600 + 3600; // a bit over a day, so a counter outlives its day
const MONTH_SECONDS = 40 * 24 * 3600;

export function createBudget({ store, config, now = () => Date.now() }) {
  const day = () => new Date(now()).toISOString().slice(0, 10);
  const installKey = (id) => `demo:install:${id}:spent`;
  const daySpendKey = () => `demo:day:${day()}:spent`;

  const cost = {
    /** Seconds of a transcription connection: not rounded, the meter does that when it settles. */
    stt: (seconds) => (seconds / 60) * config.rates.sttPerMinute,
    tts: (chars) => Math.ceil((chars / 1000) * config.rates.ttsPer1kChars),
    llm: (tokensIn, tokensOut) =>
      Math.ceil(
        (tokensIn / 1e6) * config.rates.llmPerMillionIn +
          (tokensOut / 1e6) * config.rates.llmPerMillionOut,
      ),
  };

  return {
    cost,

    /** Whether this install may use the demo right now, and if not, why. */
    async check(installId) {
      if ((await store.get(daySpendKey())) >= config.dailyBudget)
        return { ok: false, reason: "day" };
      if ((await store.get(installKey(installId))) >= config.installBudget) {
        return { ok: false, reason: "install" };
      }
      return { ok: true };
    },

    /** What this install can still spend, counting today's ceiling too (0 when none). */
    async remaining(installId) {
      const day = config.dailyBudget - (await store.get(daySpendKey()));
      const mine =
        config.installBudget - (await store.get(installKey(installId)));
      return Math.max(0, Math.min(day, mine));
    },

    /** Count a cost against the install and today. May be negative to correct an estimate. */
    async charge(installId, micro) {
      if (!micro) return;
      await store.incr(installKey(installId), micro, MONTH_SECONDS);
      await store.incr(daySpendKey(), micro, DAY_SECONDS);
    },

    /** A request from this install this minute: false once it's over the limit. */
    async allowRequest(installId) {
      const minute = Math.floor(now() / 60000);
      const n = await store.incr(
        `demo:install:${installId}:req:${minute}`,
        1,
        120,
      );
      return n <= config.requestsPerMinute;
    },

    /** Permission to hand out a token to this address. */
    async allowClaim(ip) {
      if ((await store.get(daySpendKey())) >= config.dailyBudget)
        return { ok: false, reason: "full" };
      const perIp = await store.incr(
        `demo:day:${day()}:claims:${ip}`,
        1,
        DAY_SECONDS,
      );
      if (perIp > config.claimsPerIp) return { ok: false, reason: "ip" };
      const total = await store.incr(
        `demo:day:${day()}:claims`,
        1,
        DAY_SECONDS,
      );
      if (total > config.dailyClaims) return { ok: false, reason: "full" };
      return { ok: true };
    },
  };
}
