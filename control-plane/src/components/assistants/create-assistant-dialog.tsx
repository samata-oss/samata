"use client";

import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createAgentAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LLM_PRESETS, STT_PRESETS, TTS_PRESETS } from "@/lib/providers";

/** What a new assistant starts with. Keep in sync with the defaults in `agentConfigSchema`. */
const DEFAULT_PIPELINE = [
  STT_PRESETS.deepgram.label,
  LLM_PRESETS.openai.label,
  TTS_PRESETS.cartesia.label,
];

export function CreateAssistantDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createAgentAction(name);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setOpen(false);
      setName("");
      router.push(`/assistants/${res.slug}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <PlusIcon />
        New assistant
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              New assistant
            </DialogTitle>
            <DialogDescription>
              Name it now. Everything else can change later.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="new-assistant-name" className="sr-only">
              Name
            </Label>
            <Input
              id="new-assistant-name"
              autoFocus
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Grand Horizon Concierge"
              maxLength={120}
              className="h-9"
            />
          </div>
          <DialogFooter className="items-center sm:justify-between">
            <span className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
              {DEFAULT_PIPELINE.map((label, i) => (
                <span key={label} className="contents">
                  {i > 0 && <span className="text-primary">→</span>}
                  {label}
                </span>
              ))}
            </span>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "Creating…" : "Create"}
              {!pending && (
                <kbd className="ml-1 rounded bg-primary-foreground/15 px-1 font-mono text-[10px]">
                  ↵
                </kbd>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
