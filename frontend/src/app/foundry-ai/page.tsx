import AppShell from "@/components/app/AppShell";
import { requireApprovedUser } from "@/lib/auth/guard";

export default async function FoundryAiPage() {
  const { isAdmin, displayName } = await requireApprovedUser();

  return (
    <AppShell active="foundryAi" name={displayName} isAdmin={isAdmin}>
      <div className="px-6 sm:px-8 py-12">
        <div className="max-w-[820px] mx-auto">
          <div className="mb-8 rule-draw pt-4">
            <p className="label-wide text-text-muted mb-6">Foundry AI</p>
            <h1 className="font-display text-text-primary leading-[1.1] tracking-tight text-[clamp(1.75rem,3vw,2.5rem)]">
              Coming soon
            </h1>
            <p className="text-[0.875rem] text-text-muted mt-3 leading-relaxed">
              We&apos;re building this. Check back soon.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
