import type { ReactNode } from "react";

/** Colours for the little bit of syntax highlighting the terminal needs. */
const c = {
  prompt: "text-fd-muted-foreground",
  cmd: "text-fd-foreground",
  flag: "text-fd-muted-foreground",
  str: "text-fd-primary",
  ok: "text-emerald-400",
  dim: "text-fd-muted-foreground",
};

function Line({
  children,
  i,
  className = "",
}: {
  children?: ReactNode;
  i: number;
  className?: string;
}) {
  return (
    <div
      className={`landing-fade whitespace-pre ${className}`}
      style={{ animationDelay: `${300 + i * 260}ms` }}
    >
      {children ?? " "}
    </div>
  );
}

/**
 * The hero: a terminal showing the whole loop with the real API. Define an
 * agent, start a call, read back what happened. Illustrative output.
 */
export function TerminalHero() {
  let i = 0;
  const n = () => i++;

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.09] bg-white/[0.02]">
      <div>
        <div className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-2.5">
          <div className="flex gap-1.5" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="size-2.5 rounded-full bg-white/15" />
          </div>
          <span className="font-mono text-xs text-fd-muted-foreground">
            ~/acme — zsh
          </span>
        </div>

        <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-[1.7]">
          <Line i={n()}>
            <span className={c.prompt}>$ </span>
            <span className={c.cmd}>curl</span>{" "}
            <span className={c.flag}>-X PUT</span> $SAMATA_URL/api/agents \
          </Line>
          <Line i={n()}>
            {"    "}
            <span className={c.flag}>-H</span>{" "}
            <span className={c.str}>"authorization: Bearer $KEY"</span> \
          </Line>
          <Line i={n()}>
            {"    "}
            <span className={c.flag}>-d</span> @agents/support.json
          </Line>
          <Line i={n()}>
            <span className={c.ok}>200</span>{" "}
            <span className={c.dim}>
              {'{"slug":"support","phoneNumber":"+14155550100"}'}
            </span>
          </Line>
          <Line i={n()} />
          <Line i={n()}>
            <span className={c.prompt}>$ </span>
            <span className={c.cmd}>curl</span>{" "}
            <span className={c.flag}>-X POST</span>{" "}
            $SAMATA_URL/api/session/start \
          </Line>
          <Line i={n()}>
            {"    "}
            <span className={c.flag}>-d</span>{" "}
            <span className={c.str}>{'\'{"assistantId":"support"}\''}</span>
          </Line>
          <Line i={n()}>
            <span className={c.ok}>200</span>{" "}
            <span className={c.dim}>
              {'{"roomName":"call_ab12cd34ef56","token":"eyJ…"}'}
            </span>
          </Line>
          <Line i={n()} />
          <Line i={n()} className={c.dim}>
            # caller joins, the worker answers, the call ends
          </Line>
          <Line i={n()} />
          <Line i={n()}>
            <span className={c.prompt}>$ </span>
            <span className={c.cmd}>curl</span> $SAMATA_URL/api/calls/
            <span className={c.str}>$ID</span>
          </Line>
          <Line i={n()}>
            <span className={c.ok}>200</span>
            {" {"}
          </Line>
          <Line i={n()}>
            {'  "status": '}
            <span className={c.str}>"ended"</span>,
          </Line>
          <Line i={n()}>
            {'  "durationSeconds": '}
            <span className={c.str}>42.1</span>,
          </Line>
          <Line i={n()}>
            {'  "summary": '}
            <span className={c.str}>"Caller asked about order A1234."</span>,
          </Line>
          <Line i={n()}>
            {'  "structuredData": { "intent": '}
            <span className={c.str}>"order-status"</span>
            {" }"}
          </Line>
          <Line i={n()}>{"}"}</Line>
          <Line i={n()}>
            <span className={c.prompt}>$ </span>
            <span className="caret inline-block h-[1.1em] w-[0.55em] translate-y-[0.2em] bg-fd-foreground/80" />
          </Line>
        </pre>
      </div>
    </div>
  );
}
