"use client";

import { BotIcon, CornerDownLeftIcon, SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { NAV_GROUPS } from "@/components/nav-items";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Entry = {
  id: string;
  label: string;
  hint: string;
  href: string;
  icon: React.ReactNode;
};

/** Search-and-jump palette: pages and assistants, opened with ⌘K or Ctrl+K. */
export function CommandPalette({
  assistants,
}: {
  assistants: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const entries = useMemo<Entry[]>(
    () => [
      ...assistants.map((a) => ({
        id: `assistant:${a.slug}`,
        label: a.name,
        hint: "Assistant",
        href: `/assistants/${a.slug}`,
        icon: <BotIcon />,
      })),
      ...NAV_GROUPS.flatMap((g) =>
        g.items.map((i) => ({
          id: `page:${i.url}`,
          label: i.title,
          hint: g.label,
          href: i.url,
          icon: i.icon,
        })),
      ),
    ],
    [assistants],
  );

  const q = query.trim().toLowerCase();
  const shown = q
    ? entries.filter((e) => `${e.label} ${e.hint}`.toLowerCase().includes(q))
    : entries;
  const current = Math.min(active, Math.max(shown.length - 1, 0));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${current}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [current]);

  function go(entry: Entry | undefined) {
    if (!entry) return;
    setOpen(false);
    router.push(entry.href);
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery("");
      setActive(0);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-8 w-56 justify-start gap-2 bg-transparent px-2.5 font-normal text-muted-foreground"
      >
        <SearchIcon />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="rounded border bg-muted px-1.5 py-px font-mono text-[10px] text-muted-foreground">
          ⌘K
        </kbd>
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="top-[20%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg"
        >
          <DialogTitle className="sr-only">Command palette</DialogTitle>
          <DialogDescription className="sr-only">
            Search pages and assistants.
          </DialogDescription>
          <div className="flex items-center gap-2 border-b px-3">
            <SearchIcon className="size-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive(Math.min(current + 1, shown.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive(Math.max(current - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  go(shown[current]);
                }
              }}
              placeholder="Jump to a page or assistant…"
              className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div ref={listRef} className="max-h-80 overflow-y-auto p-1.5">
            {shown.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                No results for “{query}”.
              </p>
            )}
            {shown.map((e, i) => (
              <button
                key={e.id}
                type="button"
                data-index={i}
                onMouseMove={() => setActive(i)}
                onClick={() => go(e)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
                  i === current && "bg-accent text-accent-foreground",
                )}
              >
                {e.icon}
                <span className="flex-1 truncate">{e.label}</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {e.hint}
                </span>
                {i === current && <CornerDownLeftIcon />}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
