"use client";

import { CheckIcon, CopyIcon, MicIcon, SaveIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { updateAgentAction } from "@/app/actions";
import { AdvancedTab } from "@/components/assistants/advanced-tab";
import { AssistantTab } from "@/components/assistants/assistant-tab";
import {
  type AssistantOption,
  AssistantSwitcher,
} from "@/components/assistants/assistant-switcher";
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
import type { KeyProvider } from "@/lib/providers";
import { cn } from "@/lib/utils";
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
  assistants,
  calls,
  libraryTools,
  configuredKeys,
}: {
  agent: EditorAgent;
  /** Every assistant in the workspace, for the switcher. */
  assistants: AssistantOption[];
  calls: AssistantCall[];
  libraryTools: LibraryToolOption[];
  /** Providers the workspace has a key for. */
  configuredKeys: KeyProvider[];
}) {
  const router = useRouter();
  const keys = useMemo(() => new Set(configuredKeys), [configuredKeys]);
  const [draft, setDraft] = useState<Draft>(() => toDraft(agent));
  const [saved, setSaved] = useState(() => JSON.stringify(toDraft(agent)));
  const searchParams = useSearchParams();
  const [tab, setTabState] = useState<TabValue>(() =>
    parseTab(searchParams.get("tab")),
  );
  const [copied, setCopied] = useState(false);
  // The header sticks under the top bar. It only needs its own divider once
  // content is scrolling beneath it, so a 1px sentinel above it tells us when.
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) =>
      setStuck(!entry.isIntersecting),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
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

  // ⌘S / Ctrl+S saves. A ref-free effect is fine: `save` closes over the
  // latest draft because the listener is re-bound on every change.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && !pending) save();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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
      <div ref={sentinelRef} aria-hidden className="-mb-px h-px" />
      <header
        className={cn(
          "sticky top-0 z-10 border-b border-transparent bg-background/85 backdrop-blur-md transition-colors",
          stuck && "border-border",
        )}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 pt-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <h1 className="truncate text-xl font-semibold tracking-tight">
                {agent.name}
              </h1>
              <AssistantSwitcher
                assistants={assistants}
                currentSlug={agent.slug}
              />
            </div>
            <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
              <span>{agent.slug}</span>
              <span className="text-border">/</span>
              <button
                type="button"
                onClick={copyId}
                className="inline-flex items-center gap-1 hover:text-foreground"
                title="Copy assistant id"
              >
                {agent.id.slice(0, 8)}
                {copied ? (
                  <CheckIcon className="size-3 text-chart-4" />
                ) : (
                  <CopyIcon className="size-3" />
                )}
              </button>
              {agent.phoneNumber && (
                <Badge variant="secondary" className="font-mono">
                  {agent.phoneNumber}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {dirty && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-1.5 rounded-full bg-chart-3" />
                Unsaved
              </span>
            )}
            <Button variant="outline" onClick={() => setTab("test")}>
              <MicIcon />
              Talk
            </Button>
            <Button onClick={save} disabled={!dirty || pending}>
              <SaveIcon />
              {pending ? "Saving…" : "Save"}
              <kbd className="ml-1 rounded bg-primary-foreground/15 px-1 font-mono text-[10px]">
                ⌘S
              </kbd>
            </Button>
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-5">
          <TabsList variant="line" className="mt-2">
            {TABS.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="flex-none px-2.5"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-6 py-6">
        <TabsContent value="assistant" keepMounted>
          <AssistantTab
            draft={draft}
            updateConfig={updateConfig}
            calls={calls}
            configuredKeys={keys}
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
