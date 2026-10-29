import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agent, callLog } from "@/db/schema";

export const dynamic = "force-dynamic";

function fmt(seconds: number | null | undefined) {
  return seconds == null ? "—" : `${Math.round(seconds * 1000)} ms`;
}

export default async function Home() {
  const [agents, calls] = await Promise.all([
    db.select().from(agent).orderBy(desc(agent.createdAt)),
    db
      .select({ call: callLog, agentName: agent.name })
      .from(callLog)
      .leftJoin(agent, eq(agent.id, callLog.agentId))
      .orderBy(desc(callLog.startedAt))
      .limit(25),
  ]);

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-4 py-10">
      <header>
        <h1 className="text-2xl font-semibold">Samata</h1>
        <p className="text-neutral-400">
          Declarative voice agents on LiveKit. Manage agents with{" "}
          <code>PUT /api/agents</code>.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Agents</h2>
        {agents.length === 0 ? (
          <p className="text-neutral-400">
            No agents yet. Run <code>pnpm db:seed</code>.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800">
            {agents.map((a) => (
              <li key={a.id} className="flex justify-between gap-4 p-4">
                <div>
                  <div className="font-medium">{a.name}</div>
                  <div className="text-sm text-neutral-400">
                    {a.slug} · {a.config.model.model} · {a.config.voice.model} ·{" "}
                    {a.config.tools.length} tools
                  </div>
                </div>
                <div className="text-sm text-neutral-400">
                  {a.phoneNumber ?? "web only"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Recent calls</h2>
        <div className="overflow-x-auto rounded-lg border border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="text-neutral-400">
              <tr>
                <th className="p-3 font-normal">Started</th>
                <th className="p-3 font-normal">Agent</th>
                <th className="p-3 font-normal">Status</th>
                <th className="p-3 font-normal">Duration</th>
                <th className="p-3 font-normal">Voice-to-voice</th>
                <th className="p-3 font-normal">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {calls.map(({ call, agentName }) => (
                <tr key={call.id}>
                  <td className="p-3 whitespace-nowrap">
                    {call.startedAt.toLocaleString()}
                  </td>
                  <td className="p-3">{agentName ?? "—"}</td>
                  <td className="p-3">
                    {call.status}
                    {call.endedReason && (
                      <span className="text-neutral-500">
                        {" "}
                        ({call.endedReason})
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    {call.durationSeconds == null
                      ? "—"
                      : `${Math.round(call.durationSeconds)}s`}
                  </td>
                  <td className="p-3">{fmt(call.latency?.voiceToVoiceAvg)}</td>
                  <td className="p-3 text-neutral-400">
                    {call.summary ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
