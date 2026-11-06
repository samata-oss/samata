import { getMoment, type MomentId } from "./moments";

/**
 * One section of the page. A sticky timestamp gutter sits on the left, like
 * the timecode column of a call transcript; the content sits on the right.
 */
export function Moment({
  id,
  title,
  children,
}: {
  id: MomentId;
  title: string;
  children: React.ReactNode;
}) {
  const { time, label } = getMoment(id);
  return (
    <section id={id} className="scroll-mt-12 border-t border-white/[0.08]">
      <div className="mx-auto grid max-w-5xl gap-6 px-6 py-16 md:grid-cols-[9rem_minmax(0,1fr)] md:gap-10 md:py-20">
        <div className="md:sticky md:top-24 md:self-start">
          <p className="font-mono text-xs tabular-nums text-fd-primary">
            {time}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-fd-muted-foreground">
            {label}
          </p>
        </div>
        <div className="min-w-0 space-y-8">
          <h2 className="max-w-xl text-balance text-2xl font-medium leading-snug tracking-tight sm:text-[1.7rem]">
            {title}
          </h2>
          {children}
        </div>
      </div>
    </section>
  );
}

export function Lede({ children }: { children: React.ReactNode }) {
  return (
    <p className="-mt-3 max-w-2xl text-[15px] leading-relaxed text-fd-muted-foreground">
      {children}
    </p>
  );
}
