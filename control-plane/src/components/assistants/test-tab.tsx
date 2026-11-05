"use client";

import {
  type Participant,
  type RemoteTrack,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import { MicIcon, MicOffIcon, PhoneIcon, PhoneOffIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Character } from "@/components/assistants/talking-avatar";
import { Button } from "@/components/ui/button";
import {
  AGENT_STATE_ATTRIBUTE,
  AgentSignals,
  type AgentState,
} from "@/lib/agent-signals";
import { cn } from "@/lib/utils";

// three.js is heavy and needs the browser, so it loads only when this tab
// does and never on the server.
const TalkingAvatar = dynamic(
  () =>
    import("@/components/assistants/talking-avatar").then(
      (m) => m.TalkingAvatar,
    ),
  { ssr: false },
);

const CHARACTERS: { value: Character; label: string }[] = [
  { value: "pig", label: "Pig" },
  { value: "cow", label: "Cow" },
];

const STATE_LABEL: Record<AgentState, string> = {
  idle: "Idle",
  initializing: "Waking up",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
};

type Phase = "idle" | "connecting" | "waiting" | "live";

type Line = { id: string; role: "user" | "assistant"; text: string };

const TRANSCRIPTION_TOPIC = "lk.transcription";
const SEGMENT_ATTR = "lk.segment_id";

/**
 * Talk to the saved assistant from the browser: ask the control plane to
 * start a session (room + worker dispatch + room-scoped token), join the
 * room, publish the mic, play the assistant's audio and show live transcripts.
 */
export function TestTab({
  agentId,
  dirty,
}: {
  agentId: string;
  dirty: boolean;
}) {
  const roomRef = useRef<Room | null>(null);
  const audioHost = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [muted, setMuted] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [character, setCharacter] = useState<Character>("pig");
  // Mutable on purpose: the avatar reads it every frame, outside React.
  const [signals] = useState(() => new AgentSignals());
  const [agentState, setAgentState] = useState<AgentState>("idle");

  useEffect(
    () => signals.subscribe(() => setAgentState(signals.state)),
    [signals],
  );

  const hangUp = useCallback(() => {
    roomRef.current?.disconnect();
    roomRef.current = null;
    signals.reset();
    setPhase("idle");
    setMuted(false);
  }, [signals]);

  // Leaving the page (or deleting the assistant) ends the call.
  useEffect(
    () => () => {
      void roomRef.current?.disconnect();
      signals.reset();
    },
    [signals],
  );

  async function start() {
    setPhase("connecting");
    setLines([]);
    try {
      // The control plane creates the room, dispatches the worker and mints
      // a token that can only join that room.
      const res = await fetch("/api/session/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assistantId: agentId }),
      });
      const session = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          session?.error ?? `Could not start call (${res.status})`,
        );
      }

      const room = new Room();
      roomRef.current = room;

      const syncPhase = () =>
        setPhase(room.remoteParticipants.size > 0 ? "live" : "waiting");

      room
        .on(RoomEvent.ParticipantConnected, (participant: Participant) => {
          signals.setState(participant.attributes[AGENT_STATE_ATTRIBUTE]);
          syncPhase();
        })
        .on(RoomEvent.ParticipantDisconnected, () => {
          signals.setState(undefined);
          syncPhase();
        })
        .on(
          RoomEvent.ParticipantAttributesChanged,
          (changed, participant: Participant) => {
            if (
              participant !== room.localParticipant &&
              AGENT_STATE_ATTRIBUTE in changed
            ) {
              signals.setState(participant.attributes[AGENT_STATE_ATTRIBUTE]);
            }
          },
        )
        .on(RoomEvent.Disconnected, () => {
          roomRef.current = null;
          signals.reset();
          setPhase("idle");
        })
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          if (track.kind === Track.Kind.Audio) {
            audioHost.current?.appendChild(track.attach());
            // Measure the same audio that is playing, to move the mouth.
            signals.attachAudio(track.mediaStreamTrack);
          }
        })
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          if (track.kind === Track.Kind.Audio) signals.detachAudio();
          track.detach().forEach((el) => {
            el.remove();
          });
        });

      room.registerTextStreamHandler(
        TRANSCRIPTION_TOPIC,
        async (reader, participant) => {
          const id = reader.info.attributes?.[SEGMENT_ATTR] ?? reader.info.id;
          const role =
            participant.identity === room.localParticipant.identity
              ? "user"
              : "assistant";
          let text = "";
          for await (const delta of reader) {
            text += delta;
            setLines((prev) => {
              const i = prev.findIndex((l) => l.id === id);
              const line = { id, role, text } as Line;
              return i === -1
                ? [...prev, line]
                : prev.map((l, j) => (j === i ? line : l));
            });
          }
        },
      );

      await room.connect(session.url, session.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      await room.startAudio();
      syncPhase();
    } catch (err) {
      roomRef.current?.disconnect();
      roomRef.current = null;
      signals.reset();
      setPhase("idle");
      toast.error(err instanceof Error ? err.message : "Could not start call");
    }
  }

  async function toggleMute() {
    const room = roomRef.current;
    if (!room) return;
    await room.localParticipant.setMicrophoneEnabled(muted);
    setMuted(!muted);
  }

  const active = phase !== "idle";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <section className="relative overflow-hidden rounded-lg border bg-card">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_35%,color-mix(in_oklch,var(--primary)_16%,transparent),transparent)]"
        />
        <div className="relative h-72">
          <TalkingAvatar signals={signals} character={character} />
        </div>
        <div className="absolute top-3 right-3 flex rounded-md border bg-background/70 p-0.5 backdrop-blur">
          {CHARACTERS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCharacter(c.value)}
              aria-pressed={character === c.value}
              className={cn(
                "rounded-[5px] px-2 py-0.5 text-xs transition-colors",
                character === c.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div
          className={cn(
            "absolute bottom-3 left-3 flex items-center gap-1.5 rounded-md border bg-background/70 px-2 py-1 text-xs backdrop-blur transition-opacity",
            phase !== "live" && "opacity-0",
          )}
          aria-live="polite"
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              agentState === "speaking" && "bg-primary",
              agentState === "listening" && "bg-emerald-500",
              agentState === "thinking" && "animate-pulse bg-amber-500",
              (agentState === "idle" || agentState === "initializing") &&
                "bg-muted-foreground/50",
            )}
          />
          {STATE_LABEL[agentState]}
        </div>
      </section>

      <section className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "size-2.5 rounded-full",
              phase === "live" && "bg-emerald-500",
              (phase === "connecting" || phase === "waiting") &&
                "animate-pulse bg-amber-500",
              phase === "idle" && "bg-muted-foreground/40",
            )}
          />
          <div>
            <div className="text-sm font-medium">
              {phase === "idle" && "Ready"}
              {phase === "connecting" && "Connecting…"}
              {phase === "waiting" && "Waiting for the assistant to join…"}
              {phase === "live" && "In call"}
            </div>
            <div className="text-xs text-muted-foreground">
              {phase === "waiting"
                ? "If this doesn't resolve, check that the worker is running."
                : "Uses your browser microphone."}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {active && (
            <Button
              variant="outline"
              size="icon"
              onClick={toggleMute}
              disabled={phase === "connecting"}
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted ? <MicOffIcon /> : <MicIcon />}
            </Button>
          )}
          {active ? (
            <Button variant="destructive" onClick={hangUp}>
              <PhoneOffIcon />
              End call
            </Button>
          ) : (
            <Button onClick={start}>
              <PhoneIcon />
              Start call
            </Button>
          )}
        </div>
      </section>

      {dirty && (
        <p className="text-xs text-amber-500">
          You have unsaved changes. Calls use the saved assistant, so save first
          to test them.
        </p>
      )}

      <section className="min-h-64 space-y-3 rounded-lg border bg-card p-4">
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            The live transcript appears here.
          </p>
        ) : (
          lines.map((line) => (
            <div
              key={line.id}
              className={cn(
                "flex",
                line.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                  line.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted",
                )}
              >
                {line.text}
              </div>
            </div>
          ))
        )}
      </section>
      <div ref={audioHost} className="hidden" />
    </div>
  );
}
