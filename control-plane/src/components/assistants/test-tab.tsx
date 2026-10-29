"use client";

import { type RemoteTrack, Room, RoomEvent, Track } from "livekit-client";
import { MicIcon, MicOffIcon, PhoneIcon, PhoneOffIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { createTestTokenAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Phase = "idle" | "connecting" | "waiting" | "live";

type Line = { id: string; role: "user" | "assistant"; text: string };

const TRANSCRIPTION_TOPIC = "lk.transcription";
const SEGMENT_ATTR = "lk.segment_id";

/**
 * Talk to the saved assistant from the browser: mint a short-lived token,
 * join the LiveKit room (which dispatches the worker), publish the mic, play
 * the assistant's audio and show live transcripts.
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

  const hangUp = useCallback(() => {
    roomRef.current?.disconnect();
    roomRef.current = null;
    setPhase("idle");
    setMuted(false);
  }, []);

  // Leaving the page (or deleting the assistant) ends the call.
  useEffect(
    () => () => {
      void roomRef.current?.disconnect();
    },
    [],
  );

  async function start() {
    setPhase("connecting");
    setLines([]);
    try {
      const res = await createTestTokenAction(agentId);
      if (!res.ok) throw new Error(res.error);

      const room = new Room();
      roomRef.current = room;

      const syncPhase = () =>
        setPhase(room.remoteParticipants.size > 0 ? "live" : "waiting");

      room
        .on(RoomEvent.ParticipantConnected, syncPhase)
        .on(RoomEvent.ParticipantDisconnected, syncPhase)
        .on(RoomEvent.Disconnected, () => {
          roomRef.current = null;
          setPhase("idle");
        })
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          if (track.kind === Track.Kind.Audio) {
            audioHost.current?.appendChild(track.attach());
          }
        })
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
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

      await room.connect(res.url, res.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      await room.startAudio();
      syncPhase();
    } catch (err) {
      roomRef.current?.disconnect();
      roomRef.current = null;
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
