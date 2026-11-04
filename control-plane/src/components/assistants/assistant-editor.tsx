"use client";

import { CheckIcon, CopyIcon, MicIcon, SaveIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateAgentAction } from "@/app/actions";
import { AdvancedTab } from "@/components/assistants/advanced-tab";
import { AssistantTab } from "@/components/assistants/assistant-tab";
import { LogsTab } from "@/components/assistants/logs-tab";
import { TestTab } from "@/components/assistants/test-tab";
import {
  type LibraryToolOption,
  ToolsTab,
} from "@/components/assistants/tools-tab";
import type {
  AssistantCall,
  Draft,
  UpdateConfig,
} from "@/components/assistants/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EditorAgent } from "@/server/agents";

const TABS = [
  { value: "assistant", label: "Assistant" },
  { value: "logs", label: "Logs" },
  { value: "tools", label: "Tools" },
  { value: "test", label: "Test" },
  { value: "advanced", label: "Advanced" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

function parseTab(value: string | null): TabValue {
  return TABS.find((t) => t.value === value)?.value ?? "assistant";
}

function toDraft(agent: EditorAgent): Draft {
  return {
    name: agent.name,
    slug: agent.slug,
    phoneNumber: agent.phoneNumber ?? "",
    config: agent.config,
  };
}

/**
 * Everything about one assistant on one page, laid out like Vapi's: header
 * with Talk/Save, then Assistant / Logs / Tools / Test / Advanced tabs. All
 * tabs edit the same draft, and Save writes it in one go.
 */
export function AssistantEditor({
  agent,
  calls,
  libraryTools,
}: {
  agent: EditorAgent;
  calls: AssistantCall[];
  libraryTools: LibraryToolOption[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => toDraft(agent));
  const [saved, setSaved] = useState(() => JSON.stringify(toDraft(agent)));
  const searchParams = useSearchParams();
  const [tab, setTabState] = useState<TabValue>(() =>
    parseTab(searchParams.get("tab")),
  );
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty = JSON.stringify(draft) !== saved;

  // Keep the active tab in the URL (?tab=logs) so it survives refreshes.
  // replaceState avoids a server round trip and extra history entries.
  function setTab(next: TabValue) {
    setTabState(next);
    const params = new URLSearchParams(window.location.search);
    if (next === "assistant") params.delete("tab");
    else params.set("tab", next);
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}`,
    );
  }

  const updateConfig: UpdateConfig = (fn) =>
    setDraft((d) => ({ ...d, config: fn(d.config) }));

  function save() {
    startTransition(async () => {
      const res = await updateAgentAction(agent.id, {
        name: draft.name,
        slug: draft.slug,
        phoneNumber: draft.phoneNumber.trim() || null,
        config: draft.config,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setSaved(JSON.stringify(draft));
      toast.success("Assistant saved");
      if (res.slug !== agent.slug)
        router.replace(
          `/assistants/${res.slug}${tab === "assistant" ? "" : `?tab=${tab}`}`,
        );
      else router.refresh();
    });
  }

  async function copyId() {
    await navigator.clipboard.writeText(agent.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as TabValue)}
      className="gap-0"
    >
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="flex items-center justify-between gap-4 px-6 pt-4">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">{agent.name}</h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">{agent.slug}</span>
              <span>·</span>
              <button
                type="button"
                onClick={copyId}
                className="inline-flex items-center gap-1 font-mono hover:text-foreground"
                title="Copy assistant id"
              >
                {agent.id.slice(0, 8)}…
                {copied ? (
                  <CheckIcon className="size-3" />
                ) : (
                  <CopyIcon className="size-3" />
                )}
              </button>
              {agent.phoneNumber && (
                <Badge variant="secondary">{agent.phoneNumber}</Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {dirty && (
              <span className="text-xs text-muted-foreground">
                Unsaved changes
              </span>
            )}
            <Button variant="outline" onClick={() => setTab("test")}>
              <MicIcon />
              Talk
            </Button>
            <Button onClick={save} disabled={!dirty || pending}>
              <SaveIcon />
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
        <TabsList variant="line" className="mt-2 px-4">
          {TABS.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="flex-none px-3"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </header>

      <div className="p-6">
        <TabsContent value="assistant" keepMounted>
          <AssistantTab
            draft={draft}
            updateConfig={updateConfig}
            calls={calls}
          />
        </TabsContent>
        <TabsContent value="logs">
          <LogsTab calls={calls} />
        </TabsContent>
        <TabsContent value="tools" keepMounted>
          <ToolsTab
            config={draft.config}
            updateConfig={updateConfig}
            secretsSet={agent.secretsSet.tools}
            library={libraryTools}
          />
        </TabsContent>
        <TabsContent value="test" keepMounted>
          <TestTab agentId={agent.id} dirty={dirty} />
        </TabsContent>
        <TabsContent value="advanced" keepMounted>
          <AdvancedTab
            agentId={agent.id}
            draft={draft}
            setDraft={setDraft}
            updateConfig={updateConfig}
            serverSecretSet={agent.secretsSet.server}
          />
        </TabsContent>
      </div>
    </Tabs>
  );
}
