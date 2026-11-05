"use client";

import Link from "next/link";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type KeyProvider, PROVIDER_INFO } from "@/lib/providers";

/**
 * A dropdown of providers, labelled from `PROVIDER_INFO`. With `configured`,
 * providers that need a key the workspace hasn't added are marked "(no key)".
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
  configured?: ReadonlySet<KeyProvider>;
  onChange: (value: T) => void;
}) {
  const items = options.map((o) => ({
    value: o,
    label:
      configured && PROVIDER_INFO[o].keyRequired && !configured.has(o)
        ? `${PROVIDER_INFO[o].label} (no key)`
        : PROVIDER_INFO[o].label,
  }));
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
        {items.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
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

const OTHER = "__other__";

/**
 * A model picker: a dropdown of the provider's common models plus "Other…",
 * which reveals a text box for any id the provider accepts (new releases, a
 * gateway's long tail). With no list (a custom endpoint) it is just the text
 * box. Key it by provider so the "Other" state resets when the provider
 * changes.
 */
export function ModelSelect({
  id,
  value,
  models,
  placeholder,
  onChange,
}: {
  id?: string;
  value: string;
  models: readonly string[];
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const [typing, setTyping] = useState(false);
  const input = (
    <Input
      id={models.length ? undefined : id}
      className={models.length ? "font-mono text-xs" : undefined}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
  if (!models.length) return input;

  // A saved id that isn't in the list is shown as "Other", not hidden.
  const showInput = typing || !models.includes(value);
  const items = [
    ...models.map((m) => ({ value: m, label: m })),
    { value: OTHER, label: "Other…" },
  ];
  return (
    <div className="grid gap-2">
      <Select
        value={showInput ? OTHER : value}
        items={items}
        onValueChange={(next) => {
          if (!next) return;
          if (next === OTHER) {
            setTyping(true);
            return;
          }
          setTyping(false);
          onChange(next);
        }}
      >
        <SelectTrigger id={id} className="w-full font-mono text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {showInput && input}
    </div>
  );
}
