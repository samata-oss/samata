"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

type Option = { value: string; label: string };

/**
 * A native <select> that writes its value to the URL (`?name=value`), so
 * filtered views are linkable and rendered on the server.
 */
export function UrlSelect({
  name,
  options,
  allLabel,
  className,
}: {
  name: string;
  options: Option[];
  allLabel: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <select
      aria-label={allLabel}
      value={params.get(name) ?? ""}
      onChange={(e) => {
        const next = new URLSearchParams(params);
        if (e.target.value) next.set(name, e.target.value);
        else next.delete(name);
        const qs = next.toString();
        router.push(qs ? `${pathname}?${qs}` : pathname);
      }}
      className={cn(
        "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30",
        className,
      )}
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
