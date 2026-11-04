import { Badge } from "@/components/ui/badge";
import type { CallStatus } from "@/db/schema";

export function StatusBadge({ status }: { status: CallStatus }) {
  const variant =
    status === "failed"
      ? "destructive"
      : status === "in-progress"
        ? "default"
        : "secondary";
  return <Badge variant={variant}>{status}</Badge>;
}
