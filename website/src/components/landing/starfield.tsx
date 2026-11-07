import type { CSSProperties } from "react";

/**
 * A field of stars behind the hero pane. Positions come from a seeded
 * generator, so the server and client render the same sky and there is no
 * JavaScript at runtime. The stars stay in place, and a third of them twinkle
 * in CSS.
 */

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Star = {
  x: number;
  y: number;
  r: number;
  o: number;
  bright: boolean;
  tint: boolean;
  twinkle?: { delay: number; duration: number };
};

function makeStars(): Star[] {
  const rand = mulberry32(20261106);
  const stars: Star[] = [];
  const add = (
    count: number,
    r: [number, number],
    o: [number, number],
    bright = false,
  ) => {
    for (let i = 0; i < count; i++) {
      stars.push({
        x: rand() * 100,
        y: rand() * 100,
        r: r[0] + rand() * (r[1] - r[0]),
        o: o[0] + rand() * (o[1] - o[0]),
        bright,
        tint: stars.length % 12 === 0,
        twinkle:
          rand() < 0.35 || bright
            ? { delay: rand() * 8, duration: 3 + rand() * 5 }
            : undefined,
      });
    }
  };
  add(208, [0.6, 1.0], [0.3, 0.7]);
  add(56, [1.0, 1.5], [0.55, 0.9]);
  add(10, [1.6, 2.2], [0.9, 1], true);
  return stars;
}

const stars = makeStars();

function Sky({ stars }: { stars: Star[] }) {
  return (
    <svg
      aria-hidden="true"
      className="block h-full w-full"
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
    >
      {stars.map((star) => (
        <circle
          key={`${star.x}-${star.y}`}
          cx={`${star.x.toFixed(2)}%`}
          cy={`${star.y.toFixed(2)}%`}
          r={star.r.toFixed(2)}
          fill={star.tint ? "#a5b4fc" : "#fff"}
          opacity={star.o.toFixed(2)}
          className={
            star.bright
              ? "star star-bright star-twinkle"
              : star.twinkle
                ? "star star-twinkle"
                : "star"
          }
          style={
            {
              "--o": star.o.toFixed(2),
              ...(star.twinkle
                ? {
                    animationDelay: `${star.twinkle.delay.toFixed(2)}s`,
                    animationDuration: `${star.twinkle.duration.toFixed(2)}s`,
                  }
                : {}),
            } as CSSProperties
          }
        />
      ))}
    </svg>
  );
}

export function Starfield({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`overflow-hidden ${className ?? ""}`}>
      <div className="absolute inset-0">
        <Sky stars={stars} />
      </div>
    </div>
  );
}
