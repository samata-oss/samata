"use client";

import { AudioLinesIcon, BrainIcon, MicIcon } from "lucide-react";
import { Field, NumberField } from "@/components/assistants/fields";
import type {
  AssistantCall,
  Draft,
  UpdateConfig,
} from "@/components/assistants/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fmtDuration, fmtMs, mean } from "@/lib/format";

/** Stage colours, shared by the latency bar and its legend. */
const STAGES = [
  { key: "endOfTurnDelayAvg", label: "End of turn", color: "bg-primary" },
  {
    key: "transcriptionDelayAvg",
    label: "Transcription",
    color: "bg-amber-400",
  },
  { key: "llmTtftAvg", label: "LLM first token", color: "bg-sky-400" },
  { key: "ttsTtfbAvg", label: "TTS first byte", color: "bg-neutral-300" },
] as const;

export function AssistantTab({
  draft,
  updateConfig,
  calls,
}: {
  draft: Draft;
  updateConfig: UpdateConfig;
  calls: AssistantCall[];
}) {
  const { config } = draft;
  const latency = Object.fromEntries(
    STAGES.map((s) => [s.key, mean(calls.map((c) => c.latency?.[s.key]))]),
  ) as Record<(typeof STAGES)[number]["key"], number | null>;
  const voiceToVoice = mean(calls.map((c) => c.latency?.voiceToVoiceAvg));
  const total = STAGES.reduce((sum, s) => sum + (latency[s.key] ?? 0), 0);
  const measured = calls.filter((c) => c.latency).length;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-card p-4">
        <div className="flex items-end justify-between gap-6">
          <div>
            <div className="text-xs text-muted-foreground">
              Latency (voice to voice)
            </div>
            <div className="text-2xl font-semibold tabular-nums">
              {voiceToVoice == null ? "—" : `~${fmtMs(voiceToVoice)}`}
            </div>
          </div>
          <div className="flex gap-8 text-right">
            <div>
              <div className="text-xs text-muted-foreground">Calls</div>
              <div className="text-lg font-medium tabular-nums">
                {calls.length}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Avg duration</div>
              <div className="text-lg font-medium tabular-nums">
                {fmtDuration(mean(calls.map((c) => c.durationSeconds)))}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-muted">
          {total > 0 &&
            STAGES.map((s) => (
              <div
                key={s.key}
                className={s.color}
                style={{ width: `${((latency[s.key] ?? 0) / total) * 100}%` }}
              />
            ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {STAGES.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${s.color}`} />
              {s.label} {fmtMs(latency[s.key])}
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {measured
            ? `Averaged over the last ${measured} call${measured === 1 ? "" : "s"} with latency data.`
            : "No call data yet. Make a test call to see latency."}
        </p>
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <ProviderCard
          icon={<MicIcon className="size-3.5" />}
          label="Transcriber"
          provider="Deepgram"
          measured={fmtMs(latency.transcriptionDelayAvg)}
          measuredLabel="Transcription delay"
        >
          <Field label="Model" htmlFor="stt-model">
            <Input
              id="stt-model"
              value={config.transcriber.model}
              onChange={(e) =>
                updateConfig((c) => ({
                  ...c,
                  transcriber: { ...c.transcriber, model: e.target.value },
                }))
              }
            />
          </Field>
          <Field label="Language" htmlFor="stt-language">
            <Input
              id="stt-language"
              value={config.transcriber.language}
              onChange={(e) =>
                updateConfig((c) => ({
                  ...c,
                  transcriber: { ...c.transcriber, language: e.target.value },
                }))
              }
            />
          </Field>
          <Field
            label="Keyterms"
            htmlFor="stt-keyterms"
            hint="Comma-separated words to bias recognition toward."
          >
            <Input
              id="stt-keyterms"
              defaultValue={config.transcriber.keyterms.join(", ")}
              onChange={(e) =>
                updateConfig((c) => ({
                  ...c,
                  transcriber: {
                    ...c.transcriber,
                    keyterms: e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean),
                  },
                }))
              }
            />
          </Field>
        </ProviderCard>

        <ProviderCard
          icon={<BrainIcon className="size-3.5" />}
          label="Model"
          provider="OpenAI-compatible"
          measured={fmtMs(latency.llmTtftAvg)}
          measuredLabel="Time to first token"
        >
          <Field label="Model" htmlFor="llm-model">
            <Input
              id="llm-model"
              value={config.model.model}
              onChange={(e) =>
                updateConfig((c) => ({
                  ...c,
                  model: { ...c.model, model: e.target.value },
                }))
              }
            />
          </Field>
          <Field label="Temperature" htmlFor="llm-temperature">
            <NumberField
              id="llm-temperature"
              min={0}
              max={2}
              step={0.1}
              placeholder="Provider default"
              value={config.model.temperature}
              onChange={(temperature) =>
                updateConfig((c) => ({
                  ...c,
                  model: { ...c.model, temperature },
                }))
              }
            />
          </Field>
          <Field
            label="Base URL"
            htmlFor="llm-base-url"
            hint="Groq, Together, vLLM… any OpenAI-compatible endpoint."
          >
            <Input
              id="llm-base-url"
              placeholder="https://api.openai.com/v1"
              value={config.model.baseUrl ?? ""}
              onChange={(e) =>
                updateConfig((c) => ({
                  ...c,
                  model: { ...c.model, baseUrl: e.target.value || undefined },
                }))
              }
            />
          </Field>
        </ProviderCard>

        <ProviderCard
          icon={<AudioLinesIcon className="size-3.5" />}
          label="Voice"
          provider="Cartesia"
          measured={fmtMs(latency.ttsTtfbAvg)}
          measuredLabel="Time to first byte"
        >
          <Field label="Voice ID" htmlFor="tts-voice">
            <Input
              id="tts-voice"
              className="font-mono text-xs"
              value={config.voice.voiceId}
              onChange={(e) =>
                updateConfig((c) => ({
                  ...c,
                  voice: { ...c.voice, voiceId: e.target.value },
                }))
              }
            />
          </Field>
          <Field label="Model" htmlFor="tts-model">
            <Input
              id="tts-model"
              value={config.voice.model}
              onChange={(e) =>
                updateConfig((c) => ({
                  ...c,
                  voice: { ...c.voice, model: e.target.value },
                }))
              }
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Language" htmlFor="tts-language">
              <Input
                id="tts-language"
                value={config.voice.language}
                onChange={(e) =>
                  updateConfig((c) => ({
                    ...c,
                    voice: { ...c.voice, language: e.target.value },
                  }))
                }
              />
            </Field>
            <Field label="Speed" htmlFor="tts-speed">
              <NumberField
                id="tts-speed"
                min={0.5}
                max={2}
                step={0.1}
                placeholder="1.0"
                value={config.voice.speed}
                onChange={(speed) =>
                  updateConfig((c) => ({
                    ...c,
                    voice: { ...c.voice, speed },
                  }))
                }
              />
            </Field>
          </div>
        </ProviderCard>
      </div>

      <section className="grid gap-4 rounded-lg border bg-card p-4">
        <Field
          label="First message"
          htmlFor="first-message"
          hint="Spoken as soon as the caller joins. Leave empty to wait for the caller to speak first."
        >
          <Input
            id="first-message"
            value={config.firstMessage ?? ""}
            onChange={(e) =>
              updateConfig((c) => ({
                ...c,
                firstMessage: e.target.value || undefined,
              }))
            }
          />
        </Field>
        <Field label="System prompt" htmlFor="system-prompt">
          <Textarea
            id="system-prompt"
            rows={18}
            className="min-h-64 font-mono text-xs leading-relaxed"
            value={config.model.systemPrompt}
            onChange={(e) =>
              updateConfig((c) => ({
                ...c,
                model: { ...c.model, systemPrompt: e.target.value },
              }))
            }
          />
        </Field>
      </section>
    </div>
  );
}

function ProviderCard({
  icon,
  label,
  provider,
  measured,
  measuredLabel,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  provider: string;
  measured: string;
  measuredLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {icon}
        {label}
        <span className="ml-auto font-normal tracking-normal normal-case">
          {provider}
        </span>
      </div>
      <div className="grid flex-1 content-start gap-3 p-4">{children}</div>
      <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
        <span>{measuredLabel}</span>
        <span className="tabular-nums">{measured}</span>
      </div>
    </section>
  );
}
