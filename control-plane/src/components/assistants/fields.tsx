"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** A labelled form row with optional helper text. */
export function Field({
  label,
  hint,
  htmlFor,
  className,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Numeric input where an empty box means "unset" (the server default applies). */
export function NumberField({
  value,
  onChange,
  min,
  max,
  step,
  placeholder,
  id,
}: {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  id?: string;
}) {
  return (
    <Input
      id={id}
      type="number"
      inputMode="decimal"
      value={value ?? ""}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      onChange={(e) =>
        onChange(e.target.value === "" ? undefined : Number(e.target.value))
      }
    />
  );
}

/**
 * A textarea that edits a JSON value. Invalid JSON is shown as an error and
 * is not committed, so the parent only ever sees parseable values.
 */
export function JsonField({
  value,
  onValid,
  rows = 8,
  id,
}: {
  value: unknown;
  onValid: (value: Record<string, unknown> | undefined) => void;
  rows?: number;
  id?: string;
}) {
  const [text, setText] = useState(() =>
    value === undefined ? "" : JSON.stringify(value, null, 2),
  );
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid gap-1.5">
      <Textarea
        id={id}
        value={text}
        rows={rows}
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        className="font-mono text-xs"
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          if (!next.trim()) {
            setError(null);
            onValid(undefined);
            return;
          }
          try {
            const parsed: unknown = JSON.parse(next);
            if (
              !parsed ||
              typeof parsed !== "object" ||
              Array.isArray(parsed)
            ) {
              throw new Error("Expected a JSON object");
            }
            setError(null);
            onValid(parsed as Record<string, unknown>);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Invalid JSON");
          }
        }}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** A bordered section with a small uppercase title, like Vapi's cards. */
export function Section({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border bg-card p-4", className)}>
      <h3 className="text-sm font-medium">{title}</h3>
      {description && (
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      )}
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}
