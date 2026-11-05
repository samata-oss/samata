/**
 * What a talking character needs to know about the agent, read from the live
 * LiveKit call in the browser: how loud the agent is right now (drives the
 * mouth) and what it is doing (drives the pose).
 *
 * Loudness comes from the same audio track that is playing through the
 * speakers, so the mouth stays in sync with what you hear, and nothing here
 * needs the worker or the server.
 */

export type AgentState =
  | "idle"
  | "initializing"
  | "listening"
  | "thinking"
  | "speaking";

/** livekit-agents publishes the agent's state on its participant attributes. */
export const AGENT_STATE_ATTRIBUTE = "lk.agent.state";

const KNOWN_STATES: readonly AgentState[] = [
  "initializing",
  "listening",
  "thinking",
  "speaking",
];

/** Anything below this RMS is treated as silence (line noise, codec hiss). */
const NOISE_FLOOR = 0.015;
/** RMS at which the mouth is fully open. Speech sits well below 0.3. */
const FULL_OPEN = 0.2;

export class AgentSignals {
  /** Last state the agent reported, or "idle" before it joins / after it leaves. */
  state: AgentState = "idle";

  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private samples: Uint8Array<ArrayBuffer> | null = null;
  private listeners = new Set<() => void>();

  /** Call `listener` whenever `state` changes. Returns an unsubscribe. */
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Accepts the raw attribute value; unknown values fall back to "idle". */
  setState(raw: string | undefined) {
    const next = KNOWN_STATES.find((s) => s === raw) ?? "idle";
    if (next === this.state) return;
    this.state = next;
    for (const listener of this.listeners) listener();
  }

  /**
   * Start measuring an audio track. The track must also be playing somewhere
   * (the Test tab attaches it to an <audio> element): browsers only feed
   * remote WebRTC audio to the analyser while it is being played.
   */
  attachAudio(track: MediaStreamTrack) {
    this.detachAudio();
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    // The analyser is deliberately not connected to the destination: the
    // audio element already plays it, and connecting would double it.
    const source = context.createMediaStreamSource(new MediaStream([track]));
    source.connect(analyser);
    void context.resume();
    this.context = context;
    this.source = source;
    this.analyser = analyser;
    this.samples = new Uint8Array(analyser.fftSize);
  }

  detachAudio() {
    this.source?.disconnect();
    this.source = null;
    this.analyser = null;
    this.samples = null;
    void this.context?.close();
    this.context = null;
  }

  /** Back to the starting point, for hang up or disconnect. */
  reset() {
    this.detachAudio();
    this.setState(undefined);
  }

  /**
   * How loud the agent is right now, 0 (silent) to 1 (loud). Cheap enough to
   * call every frame.
   */
  readLevel(): number {
    const { analyser, samples } = this;
    if (!analyser || !samples) return 0;
    analyser.getByteTimeDomainData(samples);
    let sum = 0;
    for (const v of samples) {
      const x = (v - 128) / 128;
      sum += x * x;
    }
    const rms = Math.sqrt(sum / samples.length);
    const level = Math.min(
      Math.max((rms - NOISE_FLOOR) / (FULL_OPEN - NOISE_FLOOR), 0),
      1,
    );
    // Ease the curve so quiet syllables still move the mouth.
    return level ** 0.7;
  }
}
