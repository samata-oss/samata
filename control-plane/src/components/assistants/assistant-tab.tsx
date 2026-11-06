"use client";

import {
  AudioLinesIcon,
  BrainIcon,
  ChevronDownIcon,
  CircleHelpIcon,
  EarIcon,
  ScrollTextIcon,
} from "lucide-react";
import { useState } from "react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { fmtDuration, fmtMs, mean } from "@/lib/format";
import {
  costPerMinute,
  estimateCosts,
  fmtCostPerMinute,
  type LegEstimate,
  PRICES_AS_OF,
} from "@/lib/pricing";
import { STACKED_STAGES as STAGES, stageValue } from "@/lib/latency-stages";
import {
  type KeyProvider,
  LLM_PRESETS,
  LLM_PROVIDERS,
  PROVIDER_INFO,
  STT_PRESETS,
  STT_PROVIDERS,
  TTS_PRESETS,
  TTS_PROVIDERS,
} from "@/lib/providers";

/** A provider that needs a key the workspace doesn't have yet. */
function lacksKey(provider: KeyProvider, configured: ReadonlySet<KeyProvider>) {
  return PROVIDER_INFO[provider].keyRequired && !configured.has(provider);
}

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
  // The model and voice cards show each provider's own time. The bars above
  // show only what each stage added to the caller's wait (see latency-stages).
  const llmTtft = mean(calls.map((c) => c.latency?.llmTtftAvg));
  const ttsTtfb = mean(calls.map((c) => c.latency?.ttsTtfbAvg));
  const estimate = estimateCosts(config);
  const recent = costPerMinute(calls);
  const voiceToVoice = mean(calls.map((c) => c.latency?.voiceToVoiceAvg));
  const total = STAGES.reduce((sum, s) => sum + (latency[s.key] ?? 0), 0);
  const measured = calls.filter((c) => c.latency).length;
  // Where each stage starts on the trace: the sum of the stages before it.
  const offsets = Object.fromEntries(
    STAGES.map((s, i) => [
      s.key,
      STAGES.slice(0, i).reduce((sum, p) => sum + (latency[p.key] ?? 0), 0),
    ]),
  ) as Record<(typeof STAGES)[number]["key"], number>;

  return (
    <div className="space-y-6">
      <section className="grid rounded-lg border bg-card lg:grid-cols-[17rem_minmax(0,1fr)]">
        <div className="flex flex-col justify-between gap-4 border-b p-4 lg:border-r lg:border-b-0">
          <div>
            <div className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
              Voice-to-voice latency
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-4xl font-semibold tracking-tight tabular-nums">
                {voiceToVoice == null
                  ? "—"
                  : Math.round(voiceToVoice * 1000).toLocaleString()}
              </span>
              <span className="font-mono text-sm text-muted-foreground">
                ms
              </span>
            </div>
          </div>
          <div className="flex gap-8">
            <div>
              <div className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                Calls
              </div>
              <div className="font-mono text-lg tabular-nums">
                {calls.length}
              </div>
            </div>
            <div>
              <div className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                Avg duration
              </div>
              <div className="font-mono text-lg tabular-nums">
                {fmtDuration(mean(calls.map((c) => c.durationSeconds)))}
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col justify-between gap-3 p-4">
          <div className="space-y-2">
            {STAGES.map((s) => {
              const value = latency[s.key] ?? 0;
              const start = total > 0 ? (offsets[s.key] / total) * 100 : 0;
              const width = total > 0 ? (value / total) * 100 : 0;
              return (
                <div
                  key={s.key}
                  className="grid grid-cols-[10rem_minmax(0,1fr)_5.5rem] items-center gap-3 text-xs"
                >
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span className={`size-2 shrink-0 rounded-sm ${s.color}`} />
                    {s.label}
                    <Tooltip>
                      <TooltipTrigger
                        aria-label={`What is ${s.label}?`}
                        className="rounded-full text-muted-foreground/60 transition-colors outline-none hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <CircleHelpIcon className="size-3.5" />
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {s.description}
                      </TooltipContent>
                    </Tooltip>
                  </span>
                  <div className="relative h-4 rounded-sm bg-muted/60">
                    {width > 0 && (
                      <Tooltip>
                        <TooltipTrigger
                          aria-label={`${s.label}: ${fmtMs(latency[s.key])}`}
                          className={cn(
                            "absolute inset-y-0 rounded-sm outline-none transition-[filter] hover:brightness-125 focus-visible:ring-2 focus-visible:ring-ring",
                            // Widen the hover target past the drawn bar so
                            // thin bars are still easy to hit.
                            "before:absolute before:inset-y-0 before:-inset-x-2 before:content-['']",
                            s.color,
                          )}
                          style={{
                            left: `${start}%`,
                            width: `max(${width}%, 3px)`,
                          }}
                        />
                        <TooltipContent
                          side="top"
                          className="flex-col items-start gap-0.5"
                        >
                          <span className="font-medium">{s.label}</span>
                          <span className="font-mono tabular-nums">
                            {fmtMs(latency[s.key])}
                            <span className="opacity-60">
                              {" "}
                              · {Math.round((value / total) * 100)}% of total
                            </span>
                          </span>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  <span className="text-right font-mono tabular-nums">
                    {fmtMs(latency[s.key])}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="font-mono text-[11px] text-muted-foreground">
            {measured
              ? `avg of last ${measured} call${measured === 1 ? "" : "s"} with latency data`
              : "no call data yet · make a test call to see latency"}
          </p>
        </div>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_27rem]">
        <section className="rounded-lg border bg-card">
          <div className="flex items-center gap-3 border-b px-4 py-3">
            <ScrollTextIcon className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">Script</h2>
            <p className="truncate text-xs text-muted-foreground">
              How the assistant opens the call and how it behaves.
            </p>
          </div>
          <div className="grid gap-5 p-4">
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
                rows={28}
                className="min-h-[32rem] font-mono text-xs leading-relaxed"
                value={config.model.systemPrompt}
                onChange={(e) =>
                  updateConfig((c) => ({
                    ...c,
                    model: { ...c.model, systemPrompt: e.target.value },
                  }))
                }
              />
              <p className="text-right font-mono text-[11px] text-muted-foreground tabular-nums">
                {config.model.systemPrompt.length.toLocaleString()} characters
              </p>
            </Field>
          </div>
        </section>

        <div className="space-y-3 xl:sticky xl:top-32 xl:max-h-[calc(100svh-10rem)] xl:overflow-y-auto xl:pr-1">
          <div className="px-0.5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold whitespace-nowrap">
                Voice stack
              </h2>
              <Tooltip>
                <TooltipTrigger
                  render={<span />}
                  className="flex cursor-default items-baseline gap-1.5 rounded-md border bg-muted/50 px-2 py-0.5 font-mono text-xs"
                >
                  <span className="text-muted-foreground">est.</span>
                  <span className="font-medium tabular-nums">
                    {estimate.total === null
                      ? "—"
                      : `${fmtCostPerMinute(estimate.total)}`}
                  </span>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  align="end"
                  className="flex-col items-start gap-1"
                >
                  <p className="font-medium">
                    Estimated cost per minute of call
                  </p>
                  <p>
                    {estimate.total === null
                      ? "At least one step has no public list price, so there is no total."
                      : "Listen, think and speak added together for the models selected below."}
                  </p>
                  <p className="opacity-80">
                    List prices as of {PRICES_AS_OF}. Your bill may differ.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
          <ol className="space-y-3">
            <PipelineStage
              icon={<EarIcon className="size-4" />}
              title="Listen"
              summary={[
                STT_PRESETS[config.transcriber.provider].label,
                config.transcriber.model,
                config.transcriber.language,
              ]
                .filter(Boolean)
                .join(" · ")}
              missingKey={lacksKey(config.transcriber.provider, configuredKeys)}
              measured={fmtMs(transcription)}
              measuredLabel="Transcription delay"
              cost={stageCost(estimate.listen, recent.listen)}
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
                      transcriber: {
                        ...c.transcriber,
                        language: e.target.value,
                      },
                    }))
                  }
                />
              </Field>
              <Field
                className="@md:col-span-2"
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
              summary={[
                LLM_PRESETS[config.model.provider].label,
                config.model.model,
              ]
                .filter(Boolean)
                .join(" · ")}
              missingKey={lacksKey(config.model.provider, configuredKeys)}
              measured={fmtMs(llmTtft)}
              measuredLabel="Time to first token"
              cost={stageCost(estimate.think, recent.think)}
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
                  placeholder={
                    LLM_PRESETS[config.model.provider].modelPlaceholder
                  }
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
                  className="@md:col-span-2"
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
                        model: {
                          ...c.model,
                          baseUrl: e.target.value || undefined,
                        },
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
              last
              icon={<AudioLinesIcon className="size-4" />}
              title="Speak"
              summary={[
                TTS_PRESETS[config.voice.provider].label,
                config.voice.model,
                config.voice.voiceId && config.voice.voiceId.length <= 24
                  ? config.voice.voiceId
                  : undefined,
              ]
                .filter(Boolean)
                .join(" · ")}
              missingKey={lacksKey(config.voice.provider, configuredKeys)}
              measured={fmtMs(ttsTtfb)}
              measuredLabel="Time to first byte"
              cost={stageCost(estimate.speak, recent.speak)}
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
                  placeholder={
                    TTS_PRESETS[config.voice.provider].modelPlaceholder
                  }
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
                  <p className="text-xs text-muted-foreground @md:col-span-2">
                    {voice.voiceHint}
                  </p>
                )
              )}
              <div className="grid grid-cols-2 gap-4 @md:col-span-2">
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
          </ol>
        </div>
      </div>
    </div>
  );
}

/**
 * A small readout in a stage's header with a hover tooltip. The trigger is a
 * span, not a button, because the header is already one.
 */
function StagePill({
  label,
  heading,
  details,
}: {
  label: string;
  heading?: string;
  details: string[];
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span />}
        className="hidden shrink-0 cursor-default items-baseline gap-1.5 rounded border bg-muted/50 px-2 py-0.5 font-mono text-[11px] sm:flex"
      >
        <span className="font-medium tabular-nums">{label}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="flex-col items-start gap-1">
        {heading && <p className="font-medium">{heading}</p>}
        {details.map((d) => (
          <p key={d}>{d}</p>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}

type StageCost = { label: string; details: string[] };

/** The cost pill for one leg: the selected model's estimate, plus what recent calls cost. */
function stageCost(
  estimate: LegEstimate | null,
  recent: number | null,
): StageCost {
  if (!estimate) {
    return {
      label: "—",
      details: ["No public list price for this model, so no estimate."],
    };
  }
  const details = [
    estimate.basis,
    `${estimate.source ? `Source: ${estimate.source}. ` : ""}List prices as of ${PRICES_AS_OF}; your bill may differ.`,
  ];
  if (recent !== null) {
    details.push(`Recent calls averaged ${fmtCostPerMinute(recent)}.`);
  }
  return {
    label: `~${fmtCostPerMinute(estimate.usdPerMinute)}`,
    details,
  };
}

/**
 * One step of the call pipeline, on a vertical rail: what the caller says is
 * heard, thought about, then spoken back. Collapsed it is a one-line summary
 * (provider, model, latency); the fields stay mounted so edits survive.
 */
function PipelineStage({
  icon,
  title,
  summary,
  measured,
  measuredLabel,
  cost,
  missingKey,
  defaultOpen,
  last,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  summary: string;
  measured?: string;
  measuredLabel?: string;
  /** Estimated spend per minute of call for the selected model. */
  cost?: StageCost;
  /** The chosen provider has no key: start open so the notice is seen. */
  missingKey?: boolean;
  defaultOpen?: boolean;
  last?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen || missingKey));
  const bodyId = `stage-${title.toLowerCase()}`;

  return (
    <li className="relative pl-10">
      <span className="absolute top-2.5 left-0 flex size-7 items-center justify-center rounded-md border bg-card text-primary [&_svg]:size-3.5">
        {icon}
        {missingKey && (
          <span
            title="Missing provider key"
            className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-card bg-chart-3"
          />
        )}
      </span>
      {!last && (
        <span className="absolute top-10 -bottom-3 left-3.5 w-px bg-border" />
      )}
      <section className="@container rounded-lg border bg-card">
        <h2>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen((o) => !o)}
            className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="text-sm font-semibold">{title}</span>
            <Tooltip>
              <TooltipTrigger
                render={<span />}
                className="min-w-0 flex-1 cursor-default truncate text-left font-mono text-xs text-muted-foreground"
              >
                {summary}
              </TooltipTrigger>
              <TooltipContent side="top" className="break-all font-mono">
                {summary}
              </TooltipContent>
            </Tooltip>
            {measured && (
              <StagePill
                label={measured}
                heading={measuredLabel}
                details={[
                  "Averaged over this assistant's recent calls. Shows — until a call has been measured.",
                ]}
              />
            )}
            {cost && (
              <StagePill
                label={cost.label}
                heading="Estimated cost per minute of call"
                details={cost.details}
              />
            )}
            <ChevronDownIcon
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
                open && "rotate-180",
              )}
            />
          </button>
        </h2>
        {/* 0fr -> 1fr animates to the content's natural height. `inert` keeps
            the collapsed fields out of the tab order and the a11y tree. */}
        <div
          id={bodyId}
          inert={!open}
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
            open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="grid content-start gap-4 border-t p-4 @md:grid-cols-2">
              {children}
            </div>
          </div>
        </div>
      </section>
    </li>
  );
}
