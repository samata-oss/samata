import type { AssistantCall } from "@/components/assistants/types";
import { CallsTable } from "@/components/calls-table";
import { EmptyState } from "@/components/page-shell";
import { RefreshButton } from "@/components/refresh-button";

export function LogsTab({ calls }: { calls: AssistantCall[] }) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <RefreshButton />
      </div>
      {calls.length === 0 ? (
        <EmptyState title="No calls yet">
          Calls to this assistant, from the browser or a phone number, show up
          here.
        </EmptyState>
      ) : (
        <CallsTable calls={calls} />
      )}
    </div>
  );
}
