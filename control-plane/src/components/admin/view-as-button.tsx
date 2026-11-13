"use client";

import { EyeIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { startViewAsAction } from "@/app/(dashboard)/admin/actions";
import { Button } from "@/components/ui/button";

/** Open Samata as another account. They see nothing of this; the banner says whose it is. */
export function ViewAsButton({
  userId,
  disabled,
}: {
  userId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function start() {
    setPending(true);
    const result = await startViewAsAction(userId);
    if (!result.ok) {
      toast.error(result.error);
      setPending(false);
      return;
    }
    router.push("/assistants");
    router.refresh();
  }

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={disabled || pending}
      onClick={start}
    >
      <EyeIcon />
      View as
    </Button>
  );
}
