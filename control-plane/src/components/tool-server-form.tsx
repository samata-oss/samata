"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { removeToolServerAction, saveToolServerAction } from "@/app/actions";
import { Field, NumberField } from "@/components/assistants/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type ToolServerView = {
  url: string;
  secretSet: boolean;
  timeoutSeconds: number;
};

/**
 * The workspace's one tool server: where calls to every tool without its own
 * server go. Developers can also set it from code (`PUT /api/tools` with a
 * `server`), which is how a server registers itself.
 */
export function ToolServerForm({ server }: { server: ToolServerView | null }) {
  const router = useRouter();
  const [url, setUrl] = useState(server?.url ?? "");
  const [secret, setSecret] = useState("");
  const [timeout, setTimeoutSeconds] = useState(server?.timeoutSeconds ?? 10);
  const [pending, startTransition] = useTransition();

  const dirty =
    url !== (server?.url ?? "") ||
    secret !== "" ||
    timeout !== (server?.timeoutSeconds ?? 10);

  function save() {
    startTransition(async () => {
      const res = await saveToolServerAction({
        url: url.trim(),
        secret: secret || undefined,
        timeoutSeconds: timeout,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setSecret("");
      toast.success("Tool server saved");
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await removeToolServerAction();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setUrl("");
      setSecret("");
      setTimeoutSeconds(10);
      toast.success("Tool server removed");
      router.refresh();
    });
  }

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4">
      <div>
        <h2 className="text-sm font-medium">Tool server</h2>
        <p className="text-xs text-muted-foreground">
          Samata POSTs a <code>tool-calls</code> message here whenever an
          assistant calls a tool that has no server of its own. One URL for all
          your tools.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-[2fr_1fr_8rem]">
        <Field label="Server URL">
          <Input
            placeholder="https://example.com/samata"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </Field>
        <Field label="Secret (x-samata-secret)">
          <Input
            type="password"
            autoComplete="off"
            placeholder={server?.secretSet ? "Unchanged" : "Optional"}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
        </Field>
        <Field label="Timeout (s)">
          <NumberField
            min={1}
            max={60}
            value={timeout}
            onChange={(n) => setTimeoutSeconds(n ?? 10)}
          />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button onClick={save} disabled={!url.trim() || !dirty || pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {server && (
          <Button variant="outline" onClick={remove} disabled={pending}>
            Remove
          </Button>
        )}
      </div>
    </section>
  );
}
