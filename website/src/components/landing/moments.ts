/**
 * The landing page is laid out like a call recording: every section is a
 * "moment" with a timestamp. The scrubber on the right edge and the gutter
 * labels both read from this list so they never drift apart.
 */
export const moments = [
  { id: "install", time: "00:00", label: "Install" },
  { id: "pipeline", time: "00:12", label: "Pipeline" },
  { id: "loop", time: "00:31", label: "Loop" },
  { id: "agents", time: "00:58", label: "Agents" },
  { id: "api", time: "01:20", label: "API" },
  { id: "tools", time: "01:41", label: "Tools" },
  { id: "latency", time: "02:05", label: "Latency" },
  { id: "architecture", time: "02:24", label: "Architecture" },
  { id: "self-host", time: "02:47", label: "Self-host" },
] as const;

export type MomentId = (typeof moments)[number]["id"];

export function getMoment(id: MomentId) {
  const moment = moments.find((m) => m.id === id);
  if (!moment) throw new Error(`Unknown moment: ${id}`);
  return moment;
}
