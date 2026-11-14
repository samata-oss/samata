"use client";

import { CheckIcon, ChevronDownIcon, PhoneIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** An imported number, and the assistant that answers it now, if any. */
export type NumberOption = { number: string; heldBy: string | null };

/**
 * Choose which imported number this assistant answers. It edits the draft like
 * every other field, so the choice is saved with Save. Picking a number another
 * assistant has moves it here (saving frees it from the old holder).
 */
export function NumberPicker({
  numbers,
  value,
  agentName,
  onChange,
  className,
}: {
  className?: string;
  numbers: NumberOption[];
  /** E.164, or "" for none. */
  value: string;
  agentName: string;
  onChange: (number: string) => void;
}) {
  // A number typed into Advanced that isn't imported still routes calls, so
  // keep it selectable rather than making it vanish from the list.
  const known = numbers.some((n) => n.number === value);
  const options =
    value && !known ? [{ number: value, heldBy: null }, ...numbers] : numbers;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="xs"
            className={cn("font-mono", className)}
            aria-label="Assign phone number"
          />
        }
      >
        <PhoneIcon />
        {value || "Assign number"}
        <ChevronDownIcon className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Phone number</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => onChange("")}>
            <span className="flex-1">None (web only)</span>
            {!value && <CheckIcon className="text-primary" />}
          </DropdownMenuItem>
          {options.map((n) => {
            const other = n.heldBy && n.heldBy !== agentName ? n.heldBy : null;
            return (
              <DropdownMenuItem
                key={n.number}
                onClick={() => onChange(n.number)}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-mono">{n.number}</span>
                  {other && (
                    <span className="truncate text-xs text-muted-foreground">
                      replaces {other}
                    </span>
                  )}
                </span>
                {n.number === value && <CheckIcon className="text-primary" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/phone-numbers" />}>
          Manage phone numbers
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
