"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { deleteAgentAction } from "@/app/actions";
import {
  Field,
  JsonField,
  NumberField,
  Section,
} from "@/components/assistants/fields";
import type { Draft, UpdateConfig } from "@/components/assistants/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MIN_VAD_SILENCE } from "@/lib/agent-config";

export function AdvancedTab({
  agentId,
  draft,
  setDraft,
  updateConfig,
  serverSecretSet,
}: {
  agentId: string;
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  updateConfig: UpdateConfig;
  serverSecretSet: boolean;
}) {
  const router = useRouter();
  const [deleting, startDelete] = useTransition();
  const { config } = draft;

  function remove() {
    if (!confirm(`Delete "${draft.name}"? Its call logs are kept.`)) return;
    startDelete(async () => {
      const res = await deleteAgentAction(agentId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Assistant deleted");
      router.push("/assistants");
    });
  }

  return (
    <div className="grid max-w-3xl gap-6">
      <Section title="Identity">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Name" htmlFor="agent-name">
            <Input
              id="agent-name"
              value={draft.name}
              onChange={(e) =>
                setDraft((d) => ({ ...d, name: e.target.value }))
              }
            />
          </Field>
          <Field
            label="Slug"
            htmlFor="agent-slug"
            hint="Use it instead of the id when dispatching calls."
          >
            <Input
              id="agent-slug"
              className="font-mono"
              value={draft.slug}
              onChange={(e) =>
                setDraft((d) => ({ ...d, slug: e.target.value }))
              }
            />
          </Field>
        </div>
        <Field
          label="Phone number"
          htmlFor="agent-phone"
          hint="E.164. Inbound SIP calls to this number are answered by this assistant. Leave empty for web only."
        >
          <Input
            id="agent-phone"
            placeholder="+14155550123"
            value={draft.phoneNumber}
            onChange={(e) =>
              setDraft((d) => ({ ...d, phoneNumber: e.target.value }))
            }
          />
        </Field>
      </Section>

      <Section title="Call limits">
        <Field
          label="Max duration (seconds)"
          htmlFor="max-duration"
          hint="The call is ended after this long."
        >
          <NumberField
            id="max-duration"
            min={1}
            value={config.maxDurationSeconds}
            onChange={(maxDurationSeconds) =>
              updateConfig((c) => ({
                ...c,
                maxDurationSeconds: maxDurationSeconds ?? 600,
              }))
            }
          />
        </Field>
      </Section>

      <Section
        title="Voice activity detection"
        description="Silero VAD. Min silence defaults to 0.3 s (livekit-plugins-silero uses 0.55 s) to keep end-of-turn latency low. The lowest it can go is 0.25 s; anything below is raised to that."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Activation threshold (0–1)">
            <NumberField
              min={0}
              max={1}
              step={0.05}
              value={config.vad.activationThreshold}
              onChange={(activationThreshold) =>
                updateConfig((c) => ({
                  ...c,
                  vad: {
                    ...c.vad,
                    activationThreshold: activationThreshold ?? 0.5,
                  },
                }))
              }
            />
          </Field>
          <Field label="Min speech (s)">
            <NumberField
              min={0}
              step={0.05}
              value={config.vad.minSpeechDuration}
              onChange={(minSpeechDuration) =>
                updateConfig((c) => ({
                  ...c,
                  vad: {
                    ...c.vad,
                    minSpeechDuration: minSpeechDuration ?? 0.05,
                  },
                }))
              }
            />
          </Field>
          <Field label="Min silence (s)">
            <NumberField
              min={MIN_VAD_SILENCE}
              step={0.05}
              value={config.vad.minSilenceDuration}
              onChange={(minSilenceDuration) =>
                updateConfig((c) => ({
                  ...c,
                  vad: {
                    ...c.vad,
                    minSilenceDuration: minSilenceDuration ?? 0.3,
                  },
                }))
              }
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Interruption"
        description="Barge-in: whether the caller can talk over the assistant."
      >
        <div className="flex items-center justify-between">
          <span className="text-sm">Allow interruptions</span>
          <Switch
            checked={config.interruption.enabled}
            onCheckedChange={(enabled) =>
              updateConfig((c) => ({
                ...c,
                interruption: { ...c.interruption, enabled },
              }))
            }
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Min duration (s)">
            <NumberField
              min={0}
              step={0.1}
              value={config.interruption.minDuration}
              onChange={(minDuration) =>
                updateConfig((c) => ({
                  ...c,
                  interruption: {
                    ...c.interruption,
                    minDuration: minDuration ?? 0.5,
                  },
                }))
              }
            />
          </Field>
          <Field label="Min words">
            <NumberField
              min={0}
              step={1}
              value={config.interruption.minWords}
              onChange={(minWords) =>
                updateConfig((c) => ({
                  ...c,
                  interruption: { ...c.interruption, minWords: minWords ?? 0 },
                }))
              }
            />
          </Field>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm">Resume after false interruption</div>
            <p className="text-xs text-muted-foreground">
              Carry on speaking if the interruption turns out to be noise.
            </p>
          </div>
          <Switch
            checked={config.interruption.resumeFalseInterruption}
            onCheckedChange={(resumeFalseInterruption) =>
              updateConfig((c) => ({
                ...c,
                interruption: { ...c.interruption, resumeFalseInterruption },
              }))
            }
          />
        </div>
      </Section>

      <Section
        title="Endpointing"
        description="How long to wait after the caller stops speaking before replying."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Min delay (s)">
            <NumberField
              min={0}
              step={0.1}
              value={config.endpointing.minDelay}
              onChange={(minDelay) =>
                updateConfig((c) => ({
                  ...c,
                  endpointing: { ...c.endpointing, minDelay: minDelay ?? 0.3 },
                }))
              }
            />
          </Field>
          <Field label="Max delay (s)">
            <NumberField
              min={0}
              step={0.1}
              value={config.endpointing.maxDelay}
              onChange={(maxDelay) =>
                updateConfig((c) => ({
                  ...c,
                  endpointing: { ...c.endpointing, maxDelay: maxDelay ?? 1 },
                }))
              }
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Preemptive generation"
        description="Start replying on the final transcript before the turn is confirmed, so the endpointing delay overlaps with the LLM instead of adding to it."
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm">Start the LLM early</div>
            <p className="text-xs text-muted-foreground">
              The draft reply is discarded if the caller keeps talking.
            </p>
          </div>
          <Switch
            checked={config.preemptiveGeneration.enabled}
            onCheckedChange={(enabled) =>
              updateConfig((c) => ({
                ...c,
                preemptiveGeneration: { ...c.preemptiveGeneration, enabled },
              }))
            }
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm">Start speech synthesis early</div>
            <p className="text-xs text-muted-foreground">
              Lowest latency, but synthesizes audio that is thrown away when the
              caller continues, which costs more TTS.
            </p>
          </div>
          <Switch
            checked={config.preemptiveGeneration.tts}
            disabled={!config.preemptiveGeneration.enabled}
            onCheckedChange={(tts) =>
              updateConfig((c) => ({
                ...c,
                preemptiveGeneration: { ...c.preemptiveGeneration, tts },
              }))
            }
          />
        </div>
      </Section>

      <Section
        title="Analysis plan"
        description="Runs after each call. Needs OPENAI_API_KEY on the control plane."
      >
        <Field
          label="Summary prompt"
          htmlFor="summary-prompt"
          hint="Leave empty for the default summary."
        >
          <Textarea
            id="summary-prompt"
            rows={4}
            value={config.analysisPlan.summaryPrompt ?? ""}
            onChange={(e) =>
              updateConfig((c) => ({
                ...c,
                analysisPlan: {
                  ...c.analysisPlan,
                  summaryPrompt: e.target.value || undefined,
                },
              }))
            }
          />
        </Field>
        <Field
          label="Structured data schema (JSON Schema)"
          hint="The extracted object is stored on each call and listed under Structured Outputs."
        >
          <JsonField
            rows={10}
            value={config.analysisPlan.structuredDataSchema}
            onValid={(structuredDataSchema) =>
              updateConfig((c) => ({
                ...c,
                analysisPlan: { ...c.analysisPlan, structuredDataSchema },
              }))
            }
          />
        </Field>
      </Section>

      <Section
        title="Server"
        description="Your server receives call lifecycle events (end-of-call report, with the transcript and analysis). Never sent to the worker."
      >
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_8rem]">
          <Field label="URL">
            <Input
              placeholder="https://example.com/samata-events"
              value={config.server?.url ?? ""}
              onChange={(e) =>
                updateConfig((c) => ({
                  ...c,
                  server: e.target.value
                    ? {
                        timeoutSeconds: 10,
                        ...c.server,
                        url: e.target.value,
                      }
                    : undefined,
                }))
              }
            />
          </Field>
          <Field label="Secret (x-samata-secret)">
            <Input
              type="password"
              autoComplete="off"
              disabled={!config.server}
              placeholder={serverSecretSet ? "Unchanged" : "Optional"}
              value={config.server?.secret ?? ""}
              onChange={(e) =>
                updateConfig((c) =>
                  c.server
                    ? {
                        ...c,
                        server: {
                          ...c.server,
                          secret: e.target.value || undefined,
                        },
                      }
                    : c,
                )
              }
            />
          </Field>
          <Field label="Timeout (s)">
            <NumberField
              min={1}
              max={60}
              value={config.server?.timeoutSeconds}
              onChange={(timeoutSeconds) =>
                updateConfig((c) =>
                  c.server
                    ? {
                        ...c,
                        server: {
                          ...c.server,
                          timeoutSeconds: timeoutSeconds ?? 10,
                        },
                      }
                    : c,
                )
              }
            />
          </Field>
        </div>
      </Section>

      <Section title="Danger zone">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Deleting an assistant frees its slug and phone number. Past calls
            stay in Logs.
          </p>
          <Button variant="destructive" onClick={remove} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete assistant"}
          </Button>
        </div>
      </Section>
    </div>
  );
}
