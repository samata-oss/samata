"use client";

import Link from "next/link";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { type KeyProvider, PROVIDER_INFO } from "@/lib/providers";

/**
 * Whether calls can use this provider: the workspace has a key for it, or it
 * runs without one (a custom endpoint).
 */
const isReady = (provider: KeyProvider, configured: ReadonlySet<KeyProvider>) =>
  configured.has(provider) || !PROVIDER_INFO[provider].keyRequired;

/** One option: the name, whether it has a key, and why on hover if not. */
function ProviderOption({
  provider,
  configured,
}: {
  provider: KeyProvider;
  configured: ReadonlySet<KeyProvider>;
}) {
  const info = PROVIDER_INFO[provider];
  const hasKey = configured.has(provider);
  const ready = isReady(provider, configured);

  const row = (
    <span className="flex w-full items-center justify-between gap-3">
      <span className={ready ? undefined : "text-muted-foreground"}>
        {info.label}
      </span>
      <span
        className={
          hasKey
            ? "inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-500"
            : ready
              ? "text-xs text-muted-foreground"
              : "inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-500"
        }
      >
        <span
          className={`size-1.5 rounded-full ${
            hasKey ? "bg-current" : ready ? "bg-transparent" : "bg-current"
          }`}
        />
        {hasKey ? "Key added" : ready ? "Key optional" : "No key yet"}
      </span>
    </span>
  );

  // Nothing to explain for a provider that is ready to use.
  if (hasKey) return row;
  return (
    <Tooltip>
      <TooltipTrigger render={row} />
      <TooltipContent side="right">
        {ready
          ? `${info.label} works without a key if your endpoint doesn't need one.`
          : `No ${info.label} key in this workspace yet. You can pick it, but calls will fail until you add one under Provider Keys.`}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * A dropdown of providers. Ones the workspace has a key for are listed first
 * and marked; the rest say they need one, and explain on hover. They stay
 * selectable so an assistant can be set up before the key is added.
 */
export function ProviderSelect<T extends KeyProvider>({
  id,
  value,
  options,
  configured,
  onChange,
}: {
  id?: string;
  value: T;
  options: readonly T[];
  /** Providers the workspace has a key for. */
  configured: ReadonlySet<KeyProvider>;
  onChange: (value: T) => void;
}) {
  // Plain labels for the trigger; the richer rows are only in the list.
  const items = options.map((o) => ({
    value: o,
    label: PROVIDER_INFO[o].label,
  }));
  const ready = options.filter((o) => isReady(o, configured));
  const needKey = options.filter((o) => !isReady(o, configured));
  const groups = [
    { label: "Ready to use", providers: ready },
    { label: "Needs an API key", providers: needKey },
  ].filter((g) => g.providers.length > 0);

  return (
    <Select
      value={value}
      items={items}
      onValueChange={(next) => next && onChange(next as T)}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {groups.map((group) => (
          <SelectGroup key={group.label}>
            {/* One group needs no heading. */}
            {groups.length > 1 && <SelectLabel>{group.label}</SelectLabel>}
            {group.providers.map((provider) => (
              <SelectItem key={provider} value={provider}>
                <ProviderOption provider={provider} configured={configured} />
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
        <div className="border-t px-2 py-1.5 text-xs text-muted-foreground">
          <Link href="/provider-keys" className="underline">
            Manage provider keys
          </Link>
        </div>
      </SelectContent>
    </Select>
  );
}

/**
 * Shown under a provider choice when the workspace has no key for it, because
 * calls would be refused. Nothing if the key is set or isn't needed.
 */
export function MissingKeyNotice({
  provider,
  configured,
}: {
  provider: KeyProvider;
  configured: ReadonlySet<KeyProvider>;
}) {
  const info = PROVIDER_INFO[provider];
  if (!info.keyRequired || configured.has(provider)) return null;
  return (
    <p className="text-xs text-amber-600 dark:text-amber-500">
      No {info.label} key in this workspace, so calls will fail.{" "}
      <Link href="/provider-keys" className="font-medium underline">
        Add it
      </Link>
    </p>
  );
}
