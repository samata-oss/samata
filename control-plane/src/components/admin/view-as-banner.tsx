"use client";

import { EyeIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { stopViewAsAction } from "@/app/(dashboard)/admin/actions";
import { Button } from "@/components/ui/button";

/**
 * Shown on every page while the superuser is viewing as someone else, so it
 * is never unclear whose account is on screen.
 */
export function ViewAsBanner({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function exit() {
    setPending(true);
    await stopViewAsAction();
    router.push("/admin/users");
    router.refresh();
  }

  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-3 bg-amber-500 px-4 py-1.5 text-sm font-medium text-amber-950"
    >
      <EyeIcon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        You are viewing as {name} ({email}): this is their account, not yours.
      </span>
      <Button
        size="xs"
        variant="secondary"
        className="border-transparent bg-amber-950 text-amber-50 hover:bg-amber-900"
        disabled={pending}
        onClick={exit}
      >
        Exit
      </Button>
    </div>
  );
}
