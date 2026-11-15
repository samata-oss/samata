"use client";

import { CheckIcon, DownloadIcon, KeyRoundIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  importPhoneNumberAction,
  listTwilioNumbersAction,
} from "@/app/actions";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SavedHints } from "@/server/saved-credentials";

type Provider = "telnyx" | "twilio";

type TwilioNumber = { number: string; name: string | null; imported: boolean };

/** Report one import: connected, or imported but not yet connected. */
function reportImport(res: { number: string; routingError?: string }) {
  if (res.routingError) {
    // Imported, but calls can't reach it yet. It can be connected later.
    toast.warning(`Imported ${res.number}, but it isn't connected yet`, {
      description: res.routingError,
      duration: 15_000,
    });
  } else {
    toast.success(`Imported and connected ${res.number}`);
  }
}

/** A saved credential: shown by its hint, with a way to enter another. */
function SavedCredential({
  label,
  hint,
  action,
  onChange,
}: {
  label: string;
  hint: string;
  action: string;
  onChange: () => void;
}) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-2">
      <Label>{label}</Label>
      <div className="flex h-10 min-w-0 items-center gap-2.5 overflow-hidden rounded-md border border-input bg-muted/30 pr-1 pl-2.5">
        <KeyRoundIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-mono text-sm tracking-tight">
          {hint}
        </span>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500">
          <CheckIcon className="size-3" />
          Saved
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground"
          onClick={onChange}
        >
          {action}
        </Button>
      </div>
    </div>
  );
}

export function ImportNumberDialog({ saved }: { saved: SavedHints }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<Provider>("telnyx");
  const [pending, startTransition] = useTransition();

  // Credentials from an earlier import are used unless the user opts to enter
  // different ones. They stay on the server; only a hint reaches here.
  const [replaceTelnyx, setReplaceTelnyx] = useState(false);
  const [replaceTwilio, setReplaceTwilio] = useState(false);
  const useSavedTelnyx = saved.telnyx !== null && !replaceTelnyx;
  const useSavedTwilio = saved.twilio !== null && !replaceTwilio;

  // Telnyx
  const [apiKey, setApiKey] = useState("");
  const [number, setNumber] = useState("");

  // Twilio: credentials first, then the numbers on the account to pick from.
  const [accountSid, setAccountSid] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [available, setAvailable] = useState<TwilioNumber[] | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  /** Don't leave pasted secrets sitting in state behind a closed dialog. */
  function reset() {
    setApiKey("");
    setNumber("");
    setAccountSid("");
    setAuthToken("");
    setReplaceTelnyx(false);
    setReplaceTwilio(false);
    setAvailable(null);
    setSelected(new Set());
  }

  function submitTelnyx(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await importPhoneNumberAction(
        useSavedTelnyx
          ? { provider: "telnyx", useSaved: true, number }
          : { provider: "telnyx", apiKey, number },
      );
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      reportImport(res);
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  function findTwilioNumbers(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await listTwilioNumbersAction(
        useSavedTwilio ? { useSaved: true } : { accountSid, authToken },
      );
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (!res.numbers.length) {
        toast.error("That Twilio account has no voice phone numbers.");
        return;
      }
      setAvailable(res.numbers);
      // A lone number is the obvious choice.
      const importable = res.numbers.filter((n) => !n.imported);
      setSelected(
        new Set(importable.length === 1 ? [importable[0].number] : []),
      );
    });
  }

  function importTwilioNumbers(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      // One at a time: each sets up its own trunks, and a failure on one
      // shouldn't hide the others.
      const failed: string[] = [];
      let imported = 0;
      for (const n of selected) {
        const res = await importPhoneNumberAction(
          useSavedTwilio
            ? { provider: "twilio", useSaved: true, number: n }
            : { provider: "twilio", accountSid, authToken, number: n },
        );
        if (!res.ok) {
          failed.push(n);
          toast.error(`Couldn't import ${n}`, { description: res.error });
          continue;
        }
        imported++;
        reportImport(res);
      }
      if (imported) router.refresh();
      if (failed.length) {
        // Stay open, with only the failures left selected, to retry.
        setAvailable(
          (list) =>
            list?.map((a) =>
              selected.has(a.number) && !failed.includes(a.number)
                ? { ...a, imported: true }
                : a,
            ) ?? null,
        );
        setSelected(new Set(failed));
        return;
      }
      setOpen(false);
      reset();
    });
  }

  function toggle(n: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(n);
      else next.delete(n);
      return next;
    });
  }

  const importable = available?.filter((n) => !n.imported) ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button />}>
        <DownloadIcon />
        Import number
      </DialogTrigger>
      {/* grid-cols-1: a long value (a Twilio SID) must not widen the dialog. */}
      <DialogContent className="grid-cols-1">
        <DialogHeader>
          <DialogTitle>Import a number</DialogTitle>
          <DialogDescription>
            Samata checks your credentials own the number, stores them
            encrypted, and points the number at your SIP server so calls to it
            reach your assistants.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={provider}
          onValueChange={(v) => {
            setProvider(v as Provider);
            reset();
          }}
        >
          <TabsList>
            <TabsTrigger value="telnyx">Telnyx</TabsTrigger>
            <TabsTrigger value="twilio">Twilio</TabsTrigger>
          </TabsList>
        </Tabs>

        {provider === "telnyx" && (
          <form
            onSubmit={submitTelnyx}
            className="grid grid-cols-1 gap-4"
            autoComplete="off"
          >
            {useSavedTelnyx ? (
              <SavedCredential
                label="Telnyx API key"
                hint={`••••••••••${saved.telnyx ?? ""}`}
                action="Change"
                onChange={() => setReplaceTelnyx(true)}
              />
            ) : (
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
            )}
            <div className="grid gap-2">
              <Label htmlFor="telnyx-number">Phone number</Label>
              <Input
                id="telnyx-number"
                type="tel"
                autoFocus={useSavedTelnyx}
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
                disabled={
                  pending ||
                  (!useSavedTelnyx && !apiKey.trim()) ||
                  !number.trim()
                }
              >
                {pending ? "Verifying…" : "Import"}
              </Button>
            </DialogFooter>
          </form>
        )}

        {provider === "twilio" && !available && (
          <form
            onSubmit={findTwilioNumbers}
            className="grid grid-cols-1 gap-4"
            autoComplete="off"
          >
            {useSavedTwilio ? (
              <SavedCredential
                label="Twilio account"
                hint={saved.twilio ?? ""}
                action="Change"
                onChange={() => setReplaceTwilio(true)}
              />
            ) : (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="twilio-account-sid">Account SID</Label>
                  <Input
                    id="twilio-account-sid"
                    autoFocus
                    required
                    value={accountSid}
                    onChange={(e) => setAccountSid(e.target.value)}
                    placeholder="AC0123…"
                    className="font-mono"
                    spellCheck={false}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="twilio-auth-token">Auth Token</Label>
                  <Input
                    id="twilio-auth-token"
                    type="password"
                    required
                    value={authToken}
                    onChange={(e) => setAuthToken(e.target.value)}
                    className="font-mono"
                    spellCheck={false}
                  />
                  <p className="text-xs text-muted-foreground">
                    Both are on the home page of the Twilio Console.
                  </p>
                </div>
              </>
            )}
            <DialogFooter>
              <Button
                type="submit"
                disabled={
                  pending ||
                  (!useSavedTwilio && (!accountSid.trim() || !authToken.trim()))
                }
              >
                {pending ? "Checking…" : "Find numbers"}
              </Button>
            </DialogFooter>
          </form>
        )}

        {provider === "twilio" && available && (
          <form
            onSubmit={importTwilioNumbers}
            className="grid grid-cols-1 gap-4"
          >
            <fieldset className="grid max-h-64 gap-1 overflow-y-auto">
              <legend className="mb-2 text-sm font-medium">
                Numbers on this account
              </legend>
              {available.map((n) => (
                <label
                  key={n.number}
                  className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted has-disabled:cursor-not-allowed has-disabled:opacity-50"
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    disabled={n.imported || pending}
                    checked={selected.has(n.number)}
                    onChange={(e) => toggle(n.number, e.target.checked)}
                  />
                  <span className="font-mono">{n.number}</span>
                  {n.name && (
                    <span className="truncate text-muted-foreground">
                      {n.name}
                    </span>
                  )}
                  {n.imported && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      Already imported
                    </span>
                  )}
                </label>
              ))}
            </fieldset>
            {importable.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Every number on this account is already imported.
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setAvailable(null);
                  setSelected(new Set());
                }}
              >
                Back
              </Button>
              <Button type="submit" disabled={pending || selected.size === 0}>
                {pending
                  ? "Importing…"
                  : selected.size > 1
                    ? `Import ${selected.size} numbers`
                    : "Import"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
