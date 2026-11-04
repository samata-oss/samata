"use client";

import { Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { deleteToolAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function DeleteToolButton({
  id,
  name,
  usedBy,
}: {
  id: string;
  name: string;
  usedBy: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function remove() {
    const used = usedBy
      ? ` ${usedBy} assistant${usedBy === 1 ? " uses" : "s use"} it and will lose it.`
      : "";
    if (!window.confirm(`Delete ${name}?${used}`)) return;
    startTransition(async () => {
      const res = await deleteToolAction(id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Deleted ${name}`);
      router.refresh();
    });
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={remove}
      disabled={pending}
      aria-label={`Delete ${name}`}
    >
      <Trash2Icon />
    </Button>
  );
}
