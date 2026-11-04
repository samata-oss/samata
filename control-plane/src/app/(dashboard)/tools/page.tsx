import { eq } from "drizzle-orm";
import Link from "next/link";
import { DeleteToolButton } from "@/components/delete-tool-button";
import { EmptyState, PageShell } from "@/components/page-shell";
import { ToolServerForm } from "@/components/tool-server-form";
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
import { agent, tool } from "@/db/schema";
import { agentConfigSchema } from "@/lib/agent-config";
import { getToolServer, publicServer } from "@/server/tool-library";
import { requireWorkspaceSession } from "@/server/workspace";

type Usage = { slug: string; name: string };
type ToolEntry = {
  name: string;
  description: string;
  serverUrl: string | null;
  usedBy: Usage[];
};

function UsedBy({ usedBy }: { usedBy: Usage[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {usedBy.map((u) => (
        <Link key={u.slug} href={`/assistants/${u.slug}?tab=tools`}>
          <Badge variant="outline">{u.name}</Badge>
        </Link>
      ))}
    </div>
  );
}

export default async function ToolsPage() {
  const { organizationId } = await requireWorkspaceSession();
  const [agents, library, toolServer] = await Promise.all([
    db
      .select()
      .from(agent)
      .where(eq(agent.organizationId, organizationId))
      .orderBy(agent.name),
    db
      .select()
      .from(tool)
      .where(eq(tool.organizationId, organizationId))
      .orderBy(tool.name),
    getToolServer(organizationId),
  ]);

  // The same inline tool name can be configured differently per assistant, so
  // key by name + server and list every assistant that uses that exact tool.
  const inline = new Map<string, ToolEntry>();
  const libraryUsers = new Map<string, Usage[]>();
  let endCallAgents = 0;
  for (const row of agents) {
    const config = agentConfigSchema.parse(row.config);
    if (config.endCallEnabled) endCallAgents++;
    for (const name of config.toolNames) {
      const users = libraryUsers.get(name) ?? [];
      users.push({ slug: row.slug, name: row.name });
      libraryUsers.set(name, users);
    }
    for (const t of config.tools) {
      const serverUrl = t.server?.url ?? null;
      const key = `${t.name}\n${serverUrl ?? ""}`;
      const entry = inline.get(key) ?? {
        name: t.name,
        description: t.description,
        serverUrl,
        usedBy: [],
      };
      entry.usedBy.push({ slug: row.slug, name: row.name });
      inline.set(key, entry);
    }
  }
  const inlineEntries = [...inline.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <PageShell
      title="Tools"
      description="Functions your assistants can call mid-conversation."
    >
      <ToolServerForm server={toolServer && publicServer(toolServer)} />

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium">Workspace tools</h2>
          <p className="text-xs text-muted-foreground">
            Defined once, usable by any assistant (turn them on from its Tools
            tab). Push them from your code with <code>PUT /api/tools</code>.
          </p>
        </div>
        {library.length === 0 ? (
          <EmptyState title="No workspace tools yet">
            Push your tools to <code>PUT /api/tools</code> and they appear here.
            See <code>examples/webhook-server</code>.
          </EmptyState>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Server</TableHead>
                  <TableHead>Used by</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {library.map((t) => {
                  const users = libraryUsers.get(t.name) ?? [];
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-sm font-medium">
                        {t.name}
                      </TableCell>
                      <TableCell className="max-w-sm truncate text-muted-foreground">
                        {t.description}
                      </TableCell>
                      <TableCell className="max-w-xs truncate font-mono text-xs text-muted-foreground">
                        {t.server ? (
                          t.server.url
                        ) : toolServer ? (
                          <Badge variant="secondary">Tool server</Badge>
                        ) : (
                          <Badge variant="destructive">No server</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <UsedBy usedBy={users} />
                      </TableCell>
                      <TableCell>
                        <DeleteToolButton
                          id={t.id}
                          name={t.name}
                          usedBy={users.length}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {inlineEntries.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-medium">Assistant tools</h2>
            <p className="text-xs text-muted-foreground">
              Defined on a single assistant. Edit one from its Tools tab.
            </p>
          </div>
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
                {inlineEntries.map((t) => (
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
                      <UsedBy usedBy={t.usedBy} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      <p className="text-sm text-muted-foreground">
        {endCallAgents} of {agents.length} assistants can end calls themselves
        (the end call function).
      </p>
    </PageShell>
  );
}
