"use client";

import { DownloadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { importPhoneNumberAction } from "@/app/actions";
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

export function ImportNumberDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [number, setNumber] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await importPhoneNumberAction({
        provider: "telnyx",
        apiKey,
        number,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.routingError) {
        // Imported, but calls can't reach it yet. It can be connected later.
        toast.warning(`Imported ${res.number}, but it isn't connected yet`, {
          description: res.routingError,
          duration: 15_000,
        });
      } else {
        toast.success(`Imported and connected ${res.number}`);
      }
      setOpen(false);
      setApiKey("");
      setNumber("");
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Don't leave a pasted API key sitting in state behind a closed dialog.
        if (!next) setApiKey("");
      }}
    >
      <DialogTrigger render={<Button />}>
        <DownloadIcon />
        Import number
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4" autoComplete="off">
          <DialogHeader>
            <DialogTitle>Import from Telnyx</DialogTitle>
            <DialogDescription>
              Enter the number you set up in Telnyx and an API key from the same
              account. Samata checks the key owns the number, stores the key
              encrypted, and points the number at your SIP server so calls to it
              reach your assistants.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="telnyx-api-key">Telnyx API key</Label>
            <Input
              id="telnyx-api-key"
              type="password"
              autoFocus
              required
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="KEY0123…"
              className="font-mono"
              spellCheck={false}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="telnyx-number">Phone number</Label>
            <Input
              id="telnyx-number"
              type="tel"
              required
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="+14155550123"
              className="font-mono"
            />
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={pending || !apiKey.trim() || !number.trim()}
            >
              {pending ? "Verifying…" : "Import"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
