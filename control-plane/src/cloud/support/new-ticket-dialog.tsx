"use client";

import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createTicketAction } from "./actions";
import { LIMITS, TICKET_CATEGORIES } from "./shared";

/** The "New ticket" button and its form. Opens the ticket once it is made. */
export function NewTicketDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<string>(TICKET_CATEGORIES[0]);
  const [details, setDetails] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createTicketAction({ subject, category, details });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Ticket opened. We'll reply here.");
      setOpen(false);
      setSubject("");
      setDetails("");
      router.push(`/support?ticket=${res.id}`);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <PlusIcon />
        New ticket
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>New ticket</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="ticket-subject">Summary</Label>
            <Input
              id="ticket-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={LIMITS.subject}
              placeholder="Outbound calls drop after 30 seconds"
              autoComplete="off"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => v && setCategory(v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {TICKET_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ticket-details">Details</Label>
            <Textarea
              id="ticket-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={LIMITS.body}
              className="min-h-24"
              placeholder="What happened, what you expected, and any session or call ids."
              required
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending || !subject.trim() || !details.trim()}
            >
              {pending ? "Opening…" : "Open ticket"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
