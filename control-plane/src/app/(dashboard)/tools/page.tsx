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
import { agent } from "@/db/schema";
import { agentConfigSchema } from "@/lib/agent-config";

type Usage = { slug: string; name: string };
type ToolEntry = {
  name: string;
  description: string;
  serverUrl: string | null;
  usedBy: Usage[];
};

export default async function ToolsPage() {
  const agents = await db.select().from(agent).orderBy(agent.name);

  // The same tool name can be configured differently per assistant, so key by
  // name + server and list every assistant that uses that exact tool.
  const tools = new Map<string, ToolEntry>();
  let endCallAgents = 0;
  for (const row of agents) {
    const config = agentConfigSchema.parse(row.config);
    if (config.endCallEnabled) endCallAgents++;
    for (const tool of config.tools) {
      const serverUrl = tool.server?.url ?? null;
      const key = `${tool.name}\n${serverUrl ?? ""}`;
      const entry = tools.get(key) ?? {
        name: tool.name,
        description: tool.description,
        serverUrl,
        usedBy: [],
      };
      entry.usedBy.push({ slug: row.slug, name: row.name });
      tools.set(key, entry);
    }
  }
  const entries = [...tools.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <PageShell
      title="Tools"
      description="Functions your assistants can call mid-conversation. Edit a tool from its assistant's Tools tab."
    >
      {entries.length === 0 ? (
        <EmptyState title="No tools configured">
          Add one from an assistant's Tools tab.
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Server</TableHead>
                <TableHead>Used by</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((t) => (
                <TableRow key={`${t.name}${t.serverUrl}`}>
                  <TableCell className="font-mono text-sm font-medium">
                    {t.name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {t.serverUrl ? "Webhook" : "Built-in"}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-sm truncate text-muted-foreground">
                    {t.description}
                  </TableCell>
                  <TableCell className="max-w-xs truncate font-mono text-xs text-muted-foreground">
                    {t.serverUrl ?? "Runs in the control plane"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {t.usedBy.map((u) => (
                        <Link key={u.slug} href={`/assistants/${u.slug}`}>
                          <Badge variant="outline">{u.name}</Badge>
                        </Link>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        {endCallAgents} of {agents.length} assistants can end calls themselves
        (the end call function).
      </p>
    </PageShell>
  );
}
