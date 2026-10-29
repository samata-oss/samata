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
      <DialogTrigger
        render={
          <Button
            variant="outline"
            className="w-full border-primary/50 text-primary hover:bg-primary/10 hover:text-primary"
          />
        }
      >
        <PlusIcon />
        Create Assistant
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Create assistant</DialogTitle>
            <DialogDescription>
              Starts with the default Deepgram → OpenAI → Cartesia pipeline. You
              can change everything afterwards.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="new-assistant-name">Name</Label>
            <Input
              id="new-assistant-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Grand Horizon Concierge"
              maxLength={120}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
