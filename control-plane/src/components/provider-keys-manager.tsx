"use client";

import { ExternalLinkIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { removeProviderKeyAction, saveProviderKeyAction } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtDateTime } from "@/lib/format";
import {
  KEY_PROVIDERS,
  type KeyProvider,
  PROVIDER_INFO,
  type ProviderKind,
} from "@/lib/providers";

export type ProviderKeyView = {
  provider: KeyProvider;
  hint: string;
  updatedAt: Date;
};

const KIND_BADGE: Record<ProviderKind, string> = {
  llm: "Model",
  stt: "Transcriber",
  tts: "Voice",
};

/**
 * One row per provider the workspace can bring a key for. A key can be set or
 * replaced but never read back: the server keeps it encrypted and the row only
 * shows its last characters.
 */
export function ProviderKeysManager({
  keys,
  canManage,
}: {
  keys: ProviderKeyView[];
  canManage: boolean;
}) {
  const byProvider = new Map(keys.map((k) => [k.provider, k]));
  return (
    <div className="divide-y rounded-lg border bg-card">
      {KEY_PROVIDERS.map((provider) => (
        <ProviderRow
          key={provider}
          provider={provider}
          stored={byProvider.get(provider)}
          canManage={canManage}
        />
      ))}
    </div>
  );
}

function ProviderRow({
  provider,
  stored,
  canManage,
}: {
  provider: KeyProvider;
  stored: ProviderKeyView | undefined;
  canManage: boolean;
}) {
  const router = useRouter();
  const info = PROVIDER_INFO[provider];
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();

  function close() {
    setEditing(false);
    setValue("");
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await saveProviderKeyAction({ provider, key: value });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${info.label} key saved`);
      close();
      router.refresh();
    });
  }

  function remove() {
    if (
      !window.confirm(
        `Remove the ${info.label} key? Assistants using ${info.label} can't take calls until you add one again.`,
      )
    )
      return;
    startTransition(async () => {
      const res = await removeProviderKeyAction(provider);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${info.label} key removed`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
      <div className="min-w-0 flex-1 basis-64 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{info.label}</span>
          {info.kinds.map((kind) => (
            <Badge key={kind} variant="secondary">
              {KIND_BADGE[kind]}
            </Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {info.description}
          {info.keysUrl && (
            <>
              {" "}
              <a
                href={info.keysUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 underline"
              >
                Get a key
                <ExternalLinkIcon className="size-3" />
              </a>
            </>
          )}
        </p>
      </div>

      {editing ? (
        <form onSubmit={save} className="flex flex-1 basis-80 gap-2">
          <Input
            type="password"
            autoComplete="off"
            autoFocus
            spellCheck={false}
            className="font-mono text-xs"
            placeholder={info.placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <Button type="submit" disabled={!value.trim() || pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="ghost" onClick={close}>
            Cancel
          </Button>
        </form>
      ) : (
        <div className="flex items-center gap-3">
          {stored ? (
            <div className="text-right text-xs">
              <div className="font-mono">••••{stored.hint}</div>
              <div className="text-muted-foreground">
                Updated {fmtDateTime(stored.updatedAt)}
              </div>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">
              {info.keyRequired ? "Not set" : "Not set (optional)"}
            </span>
          )}
          {canManage && (
            <>
              <Button
                variant="outline"
                onClick={() => setEditing(true)}
                disabled={pending}
              >
                {stored ? "Replace" : "Add key"}
              </Button>
              {stored && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={remove}
                  disabled={pending}
                  aria-label={`Remove ${info.label} key`}
                >
                  <Trash2Icon />
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
