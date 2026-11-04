"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { Field, JsonField, NumberField } from "@/components/assistants/fields";
import type { UpdateConfig } from "@/components/assistants/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { AgentConfig, ToolConfig } from "@/lib/agent-config";

const EMPTY_PARAMETERS = { type: "object", properties: {} };

/** Tools the control plane implements itself (server/tools.ts). */
const BUILTIN_TOOLS: ToolConfig[] = [
  {
    name: "get_current_time",
    description: "Get the current date and time.",
    parameters: {
      type: "object",
      properties: {
        timezone: { type: "string", description: "IANA timezone name." },
      },
    },
  },
];

let nextKey = 0;
const newKey = () => `tool-${nextKey++}`;

/** A tool from the workspace library, as the picker lists it. */
export type LibraryToolOption = { name: string; description: string };

export function ToolsTab({
  config,
  updateConfig,
  secretsSet,
  library,
}: {
  config: AgentConfig;
  updateConfig: UpdateConfig;
  secretsSet: string[];
  library: LibraryToolOption[];
}) {
  // Stable React keys, parallel to `config.tools`, so removing a tool in the
  // middle doesn't hand its editor state to its neighbour.
  const [keys, setKeys] = useState(() => config.tools.map(newKey));

  function add(tool: ToolConfig) {
    setKeys((k) => [...k, newKey()]);
    updateConfig((c) => ({ ...c, tools: [...c.tools, tool] }));
  }

  function change(index: number, patch: Partial<ToolConfig>) {
    updateConfig((c) => ({
      ...c,
      tools: c.tools.map((t, i) => (i === index ? { ...t, ...patch } : t)),
    }));
  }

  function remove(index: number) {
    setKeys((k) => k.filter((_, i) => i !== index));
    updateConfig((c) => ({
      ...c,
      tools: c.tools.filter((_, i) => i !== index),
    }));
  }

  function toggleLibraryTool(name: string, on: boolean) {
    updateConfig((c) => ({
      ...c,
      toolNames: on
        ? [...c.toolNames.filter((n) => n !== name), name]
        : c.toolNames.filter((n) => n !== name),
    }));
  }

  // Listed on the assistant but gone from the library (deleted, or renamed in
  // code and pushed under the new name). The assistant skips them.
  const known = new Set(library.map((t) => t.name));
  const dangling = config.toolNames.filter((n) => !known.has(n));

  const missing = BUILTIN_TOOLS.filter(
    (b) => !config.tools.some((t) => t.name === b.name),
  );

  return (
    <div className="space-y-6">
      <section className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4">
        <div>
          <h3 className="text-sm font-medium">End call function</h3>
          <p className="text-xs text-muted-foreground">
            Lets the model hang up when the caller is done.
          </p>
        </div>
        <Switch
          checked={config.endCallEnabled}
          onCheckedChange={(endCallEnabled) =>
            updateConfig((c) => ({ ...c, endCallEnabled }))
          }
        />
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <div>
          <h3 className="text-sm font-medium">Workspace tools</h3>
          <p className="text-xs text-muted-foreground">
            Tools shared by every assistant, served by your tool server. Push
            them from code with <code>PUT /api/tools</code>.
          </p>
        </div>
        {library.length === 0 && dangling.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No workspace tools yet.
          </p>
        )}
        <div className="divide-y">
          {library.map((t) => (
            <div
              key={t.name}
              className="flex items-center justify-between gap-4 py-2"
            >
              <span className="min-w-0">
                <span className="block font-mono text-sm">{t.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {t.description}
                </span>
              </span>
              <Switch
                checked={config.toolNames.includes(t.name)}
                onCheckedChange={(on) => toggleLibraryTool(t.name, on)}
                aria-label={`Use ${t.name}`}
              />
            </div>
          ))}
          {dangling.map((name) => (
            <div
              key={name}
              className="flex items-center justify-between gap-4 py-2"
            >
              <span className="font-mono text-sm">{name}</span>
              <span className="flex items-center gap-2">
                <Badge variant="destructive">Not in library</Badge>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => toggleLibraryTool(name, false)}
                  aria-label={`Remove ${name}`}
                >
                  <Trash2Icon />
                </Button>
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {config.tools.length} assistant-only tool
          {config.tools.length === 1 ? "" : "s"}. One with no server uses this
          assistant's server, then the workspace tool server, or runs inside the
          control plane if it is a built-in.
        </p>
        <div className="flex gap-2">
          {missing.map((b) => (
            <Button key={b.name} variant="outline" onClick={() => add(b)}>
              <PlusIcon />
              {b.name}
            </Button>
          ))}
          <Button
            onClick={() =>
              add({
                name: `tool_${config.tools.length + 1}`,
                description: "Describe when the model should call this tool.",
                parameters: EMPTY_PARAMETERS,
              })
            }
          >
            <PlusIcon />
            Add tool
          </Button>
        </div>
      </div>

      {config.tools.map((tool, index) => {
        const server = tool.server;
        return (
          <section
            key={keys[index]}
            className="grid gap-4 rounded-lg border bg-card p-4"
          >
            <div className="flex items-center gap-2">
              <h3 className="font-mono text-sm font-medium">{tool.name}</h3>
              <Badge variant="secondary">
                {tool.server ? "Webhook" : "Built-in"}
              </Badge>
              <Button
                variant="ghost"
                size="icon-sm"
                className="ml-auto"
                onClick={() => remove(index)}
                aria-label={`Remove ${tool.name}`}
              >
                <Trash2Icon />
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Name" hint="Letters, digits, - and _ (max 64).">
                <Input
                  value={tool.name}
                  onChange={(e) => change(index, { name: e.target.value })}
                />
              </Field>
              <Field
                label="Message on start"
                hint="Spoken while the tool runs, so there is no dead air."
              >
                <Input
                  value={tool.messageOnStart ?? ""}
                  onChange={(e) =>
                    change(index, {
                      messageOnStart: e.target.value || undefined,
                    })
                  }
                />
              </Field>
            </div>
            <Field label="Description">
              <Input
                value={tool.description}
                onChange={(e) => change(index, { description: e.target.value })}
              />
            </Field>
            <Field label="Parameters (JSON Schema)">
              <JsonField
                rows={6}
                value={tool.parameters}
                onValid={(parameters) =>
                  change(index, { parameters: parameters ?? EMPTY_PARAMETERS })
                }
              />
            </Field>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Forward to my server</div>
                <p className="text-xs text-muted-foreground">
                  POSTs the call to your URL. Off runs a built-in tool.
                </p>
              </div>
              <Switch
                checked={Boolean(tool.server)}
                onCheckedChange={(on) =>
                  change(index, {
                    server: on ? { url: "", timeoutSeconds: 10 } : undefined,
                  })
                }
              />
            </div>
            {server && (
              <div className="grid gap-4 md:grid-cols-[1fr_1fr_8rem]">
                <Field label="Server URL">
                  <Input
                    placeholder="https://example.com/tools"
                    value={server.url}
                    onChange={(e) =>
                      change(index, {
                        server: { ...server, url: e.target.value },
                      })
                    }
                  />
                </Field>
                <Field label="Secret (x-samata-secret)">
                  <Input
                    type="password"
                    autoComplete="off"
                    placeholder={
                      secretsSet.includes(tool.name) ? "Unchanged" : "Optional"
                    }
                    value={server.secret ?? ""}
                    onChange={(e) =>
                      change(index, {
                        server: {
                          ...server,
                          secret: e.target.value || undefined,
                        },
                      })
                    }
                  />
                </Field>
                <Field label="Timeout (s)">
                  <NumberField
                    min={1}
                    max={60}
                    value={server.timeoutSeconds}
                    onChange={(timeoutSeconds) =>
                      change(index, {
                        server: {
                          ...server,
                          timeoutSeconds: timeoutSeconds ?? 10,
                        },
                      })
                    }
                  />
                </Field>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
