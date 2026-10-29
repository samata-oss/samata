"use client";

import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CreateAssistantDialog } from "@/components/assistants/create-assistant-dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type AssistantListItem = {
  slug: string;
  name: string;
  subtitle: string;
};

/** The second column of the Assistants page: search, create, and the list. */
export function AssistantList({ items }: { items: AssistantListItem[] }) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q
    ? items.filter((i) => `${i.name} ${i.slug}`.toLowerCase().includes(q))
    : items;

  return (
    <aside className="hidden w-64 shrink-0 flex-col gap-3 border-r p-3 md:flex">
      <CreateAssistantDialog />
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Assistants"
          className="pl-8"
        />
      </div>
      <nav className="-mx-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1">
        {shown.map((item) => {
          const active = pathname === `/assistants/${item.slug}`;
          return (
            <Link
              key={item.slug}
              href={`/assistants/${item.slug}`}
              className={cn(
                "rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent",
                active && "bg-accent",
              )}
            >
              <div className="truncate font-medium">{item.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {item.subtitle}
              </div>
            </Link>
          );
        })}
        {shown.length === 0 && (
          <p className="px-3 py-2 text-sm text-muted-foreground">
            {items.length === 0 ? "No assistants yet." : "No matches."}
          </p>
        )}
      </nav>
    </aside>
  );
}
