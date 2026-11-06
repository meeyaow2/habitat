import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { PageHeader } from "@/components/ui/misc";
import { withUser } from "@/lib/db";
import { requireHouseholdContext } from "@/lib/server/context";
import { listAssetOptions, listRooms } from "@/features/assets/queries";
import { aiConfigured } from "@/lib/ai/config";
import { DocumentLibrary } from "@/features/documents/documents-ui";
import { DOC_KINDS, listDocuments } from "@/features/documents/queries";

export const metadata: Metadata = { title: "Documents" };

type SP = { q?: string; kind?: string; asset?: string; upload?: string; doc?: string };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await requireHouseholdContext();
  const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
  const kind = sp.kind && DOC_KINDS[sp.kind] ? sp.kind : undefined;
  const { docs, assets, rooms } = await withUser(ctx.user.id, async (tx) => ({
    docs: await listDocuments(tx, ctx.household.id, { q: sp.q?.slice(0, 100), kind, assetId: sp.upload ? undefined : uuid(sp.asset) }),
    assets: await listAssetOptions(tx, ctx.household.id),
    rooms: await listRooms(tx, ctx.household.id),
  }));
  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        title="Documents"
        description={<span className="inline-flex items-center gap-1.5"><Lock className="size-3.5" aria-hidden /> Private to your household. Links to files expire after five minutes.</span>}
      />
      <DocumentLibrary
        docs={docs}
        assets={assets}
        rooms={rooms}
        currency={ctx.household.currency}
        ai={{ configured: aiConfigured(), consented: !!ctx.profile.ai_consent_at }}
        canDeleteAll={ctx.role === "owner"}
        userId={ctx.user.id}
        initialUpload={sp.upload ? (DOC_KINDS[sp.upload] ? sp.upload : "1") : null}
        initialAssetId={uuid(sp.asset) ?? null}
        initialDoc={uuid(sp.doc) ?? null}
      />
    </div>
  );
}
