import { PageShell } from "@/components/page-shell";
import { ProviderKeysManager } from "@/components/provider-keys-manager";
import { canManageTeam } from "@/lib/workspace";
import { listProviderKeys } from "@/server/provider-keys";
import { requireWorkspaceSession } from "@/server/workspace";

export default async function ProviderKeysPage() {
  const { organizationId, role } = await requireWorkspaceSession();
  const keys = await listProviderKeys(organizationId);

  return (
    <PageShell
      title="Provider Keys"
      description="Bring your own keys for the models your assistants run on. Each assistant picks its transcriber, model and voice, and calls use your key for whichever it chose."
    >
      <section className="space-y-3">
        {!canManageTeam(role) && (
          <p className="text-sm text-muted-foreground">
            Only workspace owners and admins can add or remove keys.
          </p>
        )}
        <ProviderKeysManager keys={keys} canManage={canManageTeam(role)} />
        <p className="text-xs text-muted-foreground">
          Keys are encrypted at rest and never shown again after you save them.
          They are sent only to the worker that takes the call, over the same
          shared-secret channel as the rest of the call config. One OpenAI key
          covers the model, transcriber and voice; OpenRouter and Vercel AI
          Gateway give one key for many models.
        </p>
      </section>
    </PageShell>
  );
}
