"use client";

import {
  AudioLinesIcon,
  BrainIcon,
  EarIcon,
  ScrollTextIcon,
} from "lucide-react";
import { Field, NumberField } from "@/components/assistants/fields";
import type {
  AssistantCall,
  Draft,
  UpdateConfig,
} from "@/components/assistants/types";
import {
  MissingKeyNotice,
  ModelSelect,
  ProviderSelect,
} from "@/components/assistants/provider-select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { fmtDuration, fmtMs, mean } from "@/lib/format";
import { STACKED_STAGES as STAGES, stageValue } from "@/lib/latency-stages";
import {
  type KeyProvider,
  LLM_PRESETS,
  LLM_PROVIDERS,
  STT_PRESETS,
  STT_PROVIDERS,
  TTS_PRESETS,
  TTS_PROVIDERS,
} from "@/lib/providers";

export function AssistantTab({
  draft,
  updateConfig,
  calls,
  configuredKeys,
}: {
  draft: Draft;
  updateConfig: UpdateConfig;
  calls: AssistantCall[];
  /** Providers this workspace has a key for. */
  configuredKeys: ReadonlySet<KeyProvider>;
}) {
  const { config } = draft;
  const voice = TTS_PRESETS[config.voice.provider];
  const latency = Object.fromEntries(
    STAGES.map((s) => [
      s.key,
      mean(calls.map((c) => stageValue(c.latency, s.key))),
    ]),
  ) as Record<(typeof STAGES)[number]["key"], number | null>;
  const transcription = latency.transcriptionDelayAvg;
  const voiceToVoice = mean(calls.map((c) => c.latency?.voiceToVoiceAvg));
  const total = STAGES.reduce((sum, s) => sum + (latency[s.key] ?? 0), 0);
  const measured = calls.filter((c) => c.latency).length;

  return (
    <div className="space-y-8">
      <section className="rounded-xl border bg-card p-5">
        <div className="flex items-end justify-between gap-6">
          <div>
            <div className="text-xs font-medium text-muted-foreground">
              Latency (voice to voice)
            </div>
            <div className="font-serif text-6xl leading-none font-normal tabular-nums">
              {voiceToVoice == null ? "—" : `~${fmtMs(voiceToVoice)}`}
            </div>
          </div>
          <div className="flex gap-8 text-right">
            <div>
              <div className="text-xs text-muted-foreground">Calls</div>
              <div className="font-serif text-3xl font-normal tabular-nums">
                {calls.length}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Avg duration</div>
              <div className="font-serif text-3xl font-normal tabular-nums">
                {fmtDuration(mean(calls.map((c) => c.durationSeconds)))}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted">
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

      <ol className="space-y-6">
        <PipelineStage
          icon={<EarIcon className="size-4" />}
          title="Listen"
          role="Transcriber"
          provider={STT_PRESETS[config.transcriber.provider].label}
          measured={fmtMs(transcription)}
          measuredLabel="Transcription delay"
        >
          <Field label="Provider" htmlFor="stt-provider">
            <ProviderSelect
              id="stt-provider"
              value={config.transcriber.provider}
              options={STT_PROVIDERS}
              configured={configuredKeys}
              onChange={(provider) =>
                updateConfig((c) => ({
                  ...c,
                  transcriber: {
                    ...c.transcriber,
                    provider,
                    model: STT_PRESETS[provider].model,
                    language: STT_PRESETS[provider].language,
                  },
                }))
              }
            />
            <MissingKeyNotice
              provider={config.transcriber.provider}
              configured={configuredKeys}
            />
          </Field>
          <Field label="Model" htmlFor="stt-model">
            <ModelSelect
              key={config.transcriber.provider}
              id="stt-model"
              models={STT_PRESETS[config.transcriber.provider].models}
              placeholder={
                STT_PRESETS[config.transcriber.provider].modelPlaceholder
              }
              value={config.transcriber.model}
              onChange={(model) =>
                updateConfig((c) => ({
                  ...c,
                  transcriber: { ...c.transcriber, model },
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
            className="md:col-span-2"
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
        </PipelineStage>

        <PipelineStage
          icon={<BrainIcon className="size-4" />}
          title="Think"
          role="Model"
          provider={LLM_PRESETS[config.model.provider].label}
          measured={fmtMs(latency.llmTtftAvg)}
          measuredLabel="Time to first token"
        >
          <Field
            label="Provider"
            htmlFor="llm-provider"
            hint={
              config.model.provider === "openrouter" ||
              config.model.provider === "vercel-ai-gateway"
                ? "A gateway: one key for many models. Name models as vendor/model."
                : undefined
            }
          >
            <ProviderSelect
              id="llm-provider"
              value={config.model.provider}
              options={LLM_PROVIDERS}
              configured={configuredKeys}
              onChange={(provider) =>
                updateConfig((c) => ({
                  ...c,
                  model: {
                    ...c.model,
                    provider,
                    model: LLM_PRESETS[provider].model,
                    baseUrl:
                      provider === "custom" ? c.model.baseUrl : undefined,
                  },
                }))
              }
            />
            <MissingKeyNotice
              provider={config.model.provider}
              configured={configuredKeys}
            />
          </Field>
          <Field label="Model" htmlFor="llm-model">
            <ModelSelect
              key={config.model.provider}
              id="llm-model"
              models={LLM_PRESETS[config.model.provider].models}
              placeholder={LLM_PRESETS[config.model.provider].modelPlaceholder}
              value={config.model.model}
              onChange={(model) =>
                updateConfig((c) => ({
                  ...c,
                  model: { ...c.model, model },
                }))
              }
            />
          </Field>
          {config.model.provider === "custom" && (
            <Field
              className="md:col-span-2"
              label="Base URL"
              htmlFor="llm-base-url"
              hint="Any OpenAI-compatible endpoint: vLLM, Together, your own proxy."
            >
              <Input
                id="llm-base-url"
                placeholder="https://example.com/v1"
                value={config.model.baseUrl ?? ""}
                onChange={(e) =>
                  updateConfig((c) => ({
                    ...c,
                    model: { ...c.model, baseUrl: e.target.value || undefined },
                  }))
                }
              />
            </Field>
          )}
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
        </PipelineStage>

        <PipelineStage
          icon={<AudioLinesIcon className="size-4" />}
          title="Speak"
          role="Voice"
          provider={TTS_PRESETS[config.voice.provider].label}
          measured={fmtMs(latency.ttsTtfbAvg)}
          measuredLabel="Time to first byte"
        >
          <Field label="Provider" htmlFor="tts-provider">
            <ProviderSelect
              id="tts-provider"
              value={config.voice.provider}
              options={TTS_PROVIDERS}
              configured={configuredKeys}
              onChange={(provider) => {
                const preset = TTS_PRESETS[provider];
                updateConfig((c) => ({
                  ...c,
                  voice: {
                    ...c.voice,
                    provider,
                    model: preset.model,
                    voiceId: preset.voiceId,
                    language: preset.language,
                    // Speed ranges differ per provider; start from its default.
                    speed: undefined,
                  },
                }));
              }}
            />
            <MissingKeyNotice
              provider={config.voice.provider}
              configured={configuredKeys}
            />
          </Field>
          <Field label="Model" htmlFor="tts-model">
            <ModelSelect
              key={config.voice.provider}
              id="tts-model"
              models={TTS_PRESETS[config.voice.provider].models}
              placeholder={TTS_PRESETS[config.voice.provider].modelPlaceholder}
              value={config.voice.model}
              onChange={(model) =>
                updateConfig((c) => ({
                  ...c,
                  voice: { ...c.voice, model },
                }))
              }
            />
          </Field>
          {voice.voiceLabel ? (
            <Field label={voice.voiceLabel} htmlFor="tts-voice">
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
          ) : (
            voice.voiceHint && (
              <p className="text-xs text-muted-foreground md:col-span-2">
                {voice.voiceHint}
              </p>
            )
          )}
          <div className="grid grid-cols-2 gap-4 md:col-span-2">
            {voice.hasLanguage && (
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
            )}
            {voice.speed && (
              <Field label="Speed" htmlFor="tts-speed">
                <NumberField
                  id="tts-speed"
                  min={voice.speed.min}
                  max={voice.speed.max}
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
            )}
          </div>
        </PipelineStage>

        <PipelineStage
          last
          icon={<ScrollTextIcon className="size-4" />}
          title="Script"
          role="Instructions"
        >
          <Field
            className="md:col-span-2"
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
          <Field
            className="md:col-span-2"
            label="System prompt"
            htmlFor="system-prompt"
          >
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
        </PipelineStage>
      </ol>
    </div>
  );
}

/**
 * One step of the call pipeline, on a vertical rail: what the caller says is
 * heard, thought about, then spoken back.
 */
function PipelineStage({
  icon,
  title,
  role,
  provider,
  measured,
  measuredLabel,
  last,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  role: string;
  provider?: string;
  measured?: string;
  measuredLabel?: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="relative pl-14">
      <span className="absolute top-3 left-0 flex size-10 items-center justify-center rounded-full border bg-card text-primary shadow-xs">
        {icon}
      </span>
      {!last && (
        <span className="absolute top-14 -bottom-6 left-5 w-px bg-gradient-to-b from-border to-transparent" />
      )}
      <section className="rounded-2xl border bg-card">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-6 pt-5">
          <h2 className="font-serif text-3xl leading-none font-normal">
            {title}
          </h2>
          <span className="text-sm text-muted-foreground">
            {role}
            {provider && <> · {provider}</>}
          </span>
          {measured && (
            <span
              className={cn(
                "ml-auto flex items-baseline gap-2 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground",
              )}
            >
              {measuredLabel}
              <span className="font-medium text-foreground tabular-nums">
                {measured}
              </span>
            </span>
          )}
        </div>
        <div className="grid content-start gap-4 p-6 md:grid-cols-2">
          {children}
        </div>
      </section>
    </li>
  );
}
