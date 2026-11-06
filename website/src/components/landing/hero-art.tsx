import { cn } from "@/lib/cn";
import { AsciiOrb } from "./ascii-orb";
import { LiveCaption } from "./live-caption";

type NodeProps = {
  side: "left" | "right";
  step?: string;
  label: string;
  meta: string;
  tone?: "default" | "tool";
  delay: number;
  className: string;
};

/** A stage of the call, tied to the orb by a short leader line. */
function Node({ side, step, label, meta, tone, delay, className }: NodeProps) {
  return (
    <div
      className={cn(
        "drift absolute z-10 hidden items-center lg:flex",
        side === "right" && "flex-row-reverse",
        className,
      )}
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="flex items-baseline gap-2 border border-white/20 bg-black/75 px-2.5 py-1.5 font-mono text-[10px] backdrop-blur">
        {step ? (
          <span className="text-fd-muted-foreground/70">{step}</span>
        ) : null}
        <span
          className={tone === "tool" ? "text-amber-300" : "text-fd-foreground"}
        >
          {label}
        </span>
        <span className="text-fd-muted-foreground">{meta}</span>
      </div>
      <span
        className={cn(
          "h-px w-12",
          side === "left"
            ? "bg-gradient-to-r from-white/40 to-transparent"
            : "bg-gradient-to-l from-white/40 to-transparent",
        )}
      />
    </div>
  );
}

/**
 * The hero art: a voice drawn as an ASCII orb, the stages of a call hanging
 * off it, and a line of the conversation typing out underneath.
 */
export function HeroArt({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="relative h-[610px] w-[547px]">
        <AsciiOrb className="absolute left-0 top-0" />
        <Node
          side="left"
          label="caller"
          meta="sip · webrtc"
          delay={0}
          className="left-0 top-[22%]"
        />
        <Node
          side="right"
          step="01"
          label="stt"
          meta="150ms"
          delay={0.8}
          className="right-0 top-[14%]"
        />
        <Node
          side="right"
          step="02"
          label="llm"
          meta="350ms"
          delay={1.6}
          className="right-0 top-[46%]"
        />
        <Node
          side="right"
          step="03"
          label="tts"
          meta="100ms"
          delay={2.4}
          className="right-0 top-[76%]"
        />
        <Node
          side="left"
          label="tool_call"
          meta="118ms"
          tone="tool"
          delay={3.2}
          className="left-0 top-[66%]"
        />
        <LiveCaption className="absolute inset-x-0 bottom-0 mx-auto max-w-md" />
      </div>
    </div>
  );
}
