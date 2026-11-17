/**
 * How many speech connections are open at once, in this process.
 *
 * Deepgram caps simultaneous connections per account and can't raise it, so
 * the proxy holds its own, lower cap and turns the rest away with a plain
 * "busy": better than a call that starts and then dies when Deepgram refuses
 * the next leg. There are two caps, one per kind, and each install also has
 * its own, so one person can't take every slot.
 *
 * Counted in memory on purpose: a restart drops every connection too, so the
 * count can never be left wrong by a crash. It also means one proxy process.
 */
export function createSlots({ stt, tts }) {
  const kinds = {
    stt: {
      total: stt.total,
      perInstall: stt.perInstall,
      open: 0,
      by: new Map(),
    },
    tts: {
      total: tts.total,
      perInstall: tts.perInstall,
      open: 0,
      by: new Map(),
    },
  };

  return {
    /**
     * Take a slot of `kind` for an install: `{ ok: true, release }`, or
     * `{ ok: false, reason }` where reason is "install" (this install already
     * has its share) or "busy" (everyone's slots are taken).
     */
    acquire(kind, installId) {
      const k = kinds[kind];
      const mine = k.by.get(installId) ?? 0;
      if (mine >= k.perInstall) return { ok: false, reason: "install" };
      if (k.open >= k.total) return { ok: false, reason: "busy" };
      k.open += 1;
      k.by.set(installId, mine + 1);
      let released = false;
      return {
        ok: true,
        release() {
          if (released) return;
          released = true;
          k.open -= 1;
          const left = (k.by.get(installId) ?? 1) - 1;
          if (left > 0) k.by.set(installId, left);
          else k.by.delete(installId);
        },
      };
    },
    counts: () => ({ stt: kinds.stt.open, tts: kinds.tts.open }),
  };
}
