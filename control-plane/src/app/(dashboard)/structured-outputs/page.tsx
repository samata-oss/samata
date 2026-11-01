import { and, desc, eq, isNotNull } from "drizzle-orm";
import Link from "next/link";
import { EmptyState, PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/db";
import { agent, callLog } from "@/db/schema";
import { agentConfigSchema } from "@/lib/agent-config";
import { fmtDateTime } from "@/lib/format";
import { requireWorkspaceSession } from "@/server/workspace";

function cell(value: unknown) {
  if (value === null || value === undefined) return "—";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export default async function StructuredOutputsPage() {
  const { organizationId } = await requireWorkspaceSession();
  const [agents, results] = await Promise.all([
    db
      .select()
      .from(agent)
      .where(eq(agent.organizationId, organizationId))
      .orderBy(agent.name),
    db
      .select({
        id: callLog.id,
        agentId: callLog.agentId,
        startedAt: callLog.startedAt,
        data: callLog.structuredData,
      })
      .from(callLog)
      .where(
        and(
          eq(callLog.organizationId, organizationId),
          isNotNull(callLog.structuredData),
          isNotNull(callLog.agentId),
        ),
      )
      .orderBy(desc(callLog.startedAt))
      .limit(500),
  ]);

  const sections = agents
    .map((row) => ({
      row,
      schema: agentConfigSchema.parse(row.config).analysisPlan
        .structuredDataSchema,
      rows: results.filter((r) => r.agentId === row.id).slice(0, 25),
    }))
    .filter((s) => s.schema || s.rows.length > 0);

  return (
    <PageShell
      title="Structured Outputs"
      description="Data extracted from each call by the assistant's analysis plan. Define the JSON Schema on an assistant's Advanced tab."
    >
      {sections.length === 0 && (
        <EmptyState title="No structured outputs yet">
          Add a structured data schema to an assistant and finish a call.
        </EmptyState>
      )}

      {sections.map(({ row, schema, rows }) => {
        const columns = [
          ...new Set(rows.flatMap((r) => Object.keys(r.data ?? {}))),
        ];
        return (
          <section key={row.id} className="space-y-3">
            <div className="flex items-center gap-2">
              <Link
                href={`/assistants/${row.slug}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {row.name}
              </Link>
              <Badge variant="secondary">
                {schema
                  ? `${Object.keys((schema.properties as object) ?? {}).length} fields`
                  : "No schema"}
              </Badge>
            </div>

            {schema && (
              <details className="rounded-lg border bg-card p-3 text-sm">
                <summary className="cursor-pointer text-muted-foreground">
                  Schema
                </summary>
                <pre className="mt-2 overflow-auto font-mono text-xs">
                  {JSON.stringify(schema, null, 2)}
                </pre>
              </details>
            )}

            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No extracted data yet.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Call</TableHead>
                      {columns.map((c) => (
                        <TableHead key={c} className="font-mono">
                          {c}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap">
                          <Link
                            href={`/logs/${r.id}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {fmtDateTime(r.startedAt)}
                          </Link>
                        </TableCell>
                        {columns.map((c) => (
                          <TableCell key={c} className="max-w-xs truncate">
                            {cell(r.data?.[c])}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        );
      })}
    </PageShell>
  );
}
