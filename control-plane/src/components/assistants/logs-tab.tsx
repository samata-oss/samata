import { CallsTable } from "@/components/calls-table";
import type { AssistantCall } from "@/components/assistants/types";
import { EmptyState } from "@/components/page-shell";

export function LogsTab({ calls }: { calls: AssistantCall[] }) {
  if (calls.length === 0) {
    return (
      <EmptyState title="No calls yet">
        Calls to this assistant, from the browser or a phone number, show up
        here.
      </EmptyState>
    );
  }
  return <CallsTable calls={calls} />;
}
