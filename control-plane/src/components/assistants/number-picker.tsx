"use client";

import { ChevronDownIcon, PhoneIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * An imported number, and the other assistant that answers it now, if any.
 * `heldBy` is null when no one does, or when it is the assistant being edited.
 */
export type NumberOption = { number: string; heldBy: string | null };

/**
 * Choose which imported numbers this assistant answers: any number of them.
 * It edits the draft like every other field, so the choice is saved with Save.
 * Picking a number another assistant has moves it here (saving frees it from
 * the old holder).
 */
export function NumberPicker({
  numbers,
  value,
  onChange,
  className,
}: {
  className?: string;
  numbers: NumberOption[];
  /** The E.164 numbers this assistant answers. */
  value: string[];
  onChange: (numbers: string[]) => void;
}) {
  // A number typed into Advanced that isn't imported still routes calls, so
  // keep it selectable rather than making it vanish from the list.
  const imported = new Set(numbers.map((n) => n.number));
  const options = [
    ...value
      .filter((n) => !imported.has(n))
      .map((number) => ({ number, heldBy: null })),
    ...numbers,
  ];

  function toggle(number: string, on: boolean) {
    onChange(on ? [...value, number] : value.filter((n) => n !== number));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="xs"
            className={cn("font-mono", className)}
            aria-label="Assign phone numbers"
          />
        }
      >
        <PhoneIcon />
        {value.length === 0
          ? "Assign numbers"
          : value.length === 1
            ? value[0]
            : `${value.length} numbers`}
        <ChevronDownIcon className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Phone numbers</DropdownMenuLabel>
          {options.length === 0 && (
            <div className="px-1.5 py-1 text-sm text-muted-foreground">
              No imported numbers yet.
            </div>
          )}
          {options.map((n) => (
            <DropdownMenuCheckboxItem
              key={n.number}
              checked={value.includes(n.number)}
              onCheckedChange={(on) => toggle(n.number, on)}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-mono">{n.number}</span>
                {n.heldBy && !value.includes(n.number) && (
                  <span className="truncate text-xs text-muted-foreground">
                    moves from {n.heldBy}
                  </span>
                )}
              </span>
            </DropdownMenuCheckboxItem>
          ))}
          {value.length > 0 && (
            <DropdownMenuItem onClick={() => onChange([])}>
              <span className="text-muted-foreground">Clear (web only)</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/phone-numbers" />}>
          Manage phone numbers
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
