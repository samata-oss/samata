"use client";

import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { createContext, useContext, useEffect, useState } from "react";
import {
  AnalysisError,
  CallMeta,
  type CallDetailData,
  CallSidebarSections,
  CallStats,
  Transcript,
} from "@/components/call-detail";
import { LatencySummary } from "@/components/latency-summary";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TableRow } from "@/components/ui/table";

/** `/api/calls/:id`: the call row plus its assistant. */
type CallResponse = CallDetailData & {
  agentName: string | null;
  agentSlug: string | null;
};

const OpenCallContext = createContext<(id: string) => void>(() => {});

/**
 * Wrap a list of calls. Rows built with `CallSheetRow` open that call in a side
 * sheet, the way Vapi does, without leaving the list.
 */
export function CallSheetProvider({ children }: { children: React.ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <OpenCallContext.Provider value={setOpenId}>
      {children}
      <Sheet
        open={openId !== null}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
      >
        <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:w-[70vw] data-[side=right]:sm:max-w-none">
          {openId && <CallSheetBody key={openId} id={openId} />}
        </SheetContent>
      </Sheet>
    </OpenCallContext.Provider>
  );
}

/** A table row that opens its call in the sheet on click or Enter. */
export function CallSheetRow({
  callId,
  children,
}: {
  callId: string;
  children: React.ReactNode;
}) {
  const open = useContext(OpenCallContext);
  return (
    <TableRow
      tabIndex={0}
      className="cursor-pointer outline-none focus-visible:bg-muted/50"
      onClick={() => open(callId)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open(callId);
        }
      }}
    >
      {children}
    </TableRow>
  );
}

function CallSheetBody({ id }: { id: string }) {
  const [call, setCall] = useState<CallResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inProgress = call?.status === "in-progress";

  // Load once; keep polling while the call is live so the transcript fills in.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/calls/${id}`);
        if (!res.ok)
          throw new Error(
            res.status === 404 ? "Call not found." : "Could not load the call.",
          );
        const data = (await res.json()) as CallResponse;
        if (!cancelled) {
          setCall(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Could not load the call.");
      }
    };
    load();
    if (!inProgress)
      return () => {
        cancelled = true;
      };
    const timer = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id, inProgress]);

  if (error && !call) {
    return (
      <SheetHeader>
        <SheetTitle>Call</SheetTitle>
        <SheetDescription>{error}</SheetDescription>
      </SheetHeader>
    );
  }

  if (!call) {
    return (
      <>
        <SheetHeader>
          <SheetTitle>Call</SheetTitle>
          <SheetDescription>Loading…</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 p-4 pt-0">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </>
    );
  }

  return (
    <>
      <SheetHeader className="border-b pr-12">
        <SheetTitle>{call.agentName ?? "Deleted assistant"}</SheetTitle>
        <SheetDescription render={<div />}>
          <CallMeta call={call} />
        </SheetDescription>
        <Link
          href={`/logs/${call.id}`}
          className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ExternalLinkIcon className="size-3" />
          Open full page
        </Link>
      </SheetHeader>

      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        {call.latency ? (
          <LatencySummary
            latency={call.latency}
            durationSeconds={call.durationSeconds}
            toolCallCount={call.toolCallCount}
          />
        ) : (
          <CallStats call={call} />
        )}
        <AnalysisError call={call} />
        <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
          <section className="space-y-3">
            <h2 className="text-sm font-medium">Transcript</h2>
            <Transcript messages={call.messages} fallback={call.transcript} />
          </section>
          <aside className="min-w-0 space-y-6">
            <CallSidebarSections call={call} hideLatency />
          </aside>
        </div>
      </div>
    </>
  );
}
