"use client";

import { CheckIcon, ChevronsUpDownIcon, LayoutGridIcon } from "lucide-react";
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

export type AssistantOption = { slug: string; name: string };

/** Jump between assistants without a permanent second column. */
export function AssistantSwitcher({
  assistants,
  currentSlug,
}: {
  assistants: AssistantOption[];
  currentSlug: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Switch assistant"
            className="text-muted-foreground"
          />
        }
      >
        <ChevronsUpDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Switch assistant</DropdownMenuLabel>
          {assistants.map((a) => (
            <DropdownMenuItem
              key={a.slug}
              render={<Link href={`/assistants/${a.slug}`} />}
            >
              <span className="flex-1 truncate">{a.name}</span>
              {a.slug === currentSlug && <CheckIcon className="text-primary" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/assistants" />}>
          <LayoutGridIcon />
          All assistants
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
