import "server-only";
import type { Tx } from "@/lib/db";
import type { ISODate } from "@/lib/domain/dates";

export type DocRow = {
  id: string; title: string; kind: string; mime_type: string; size_bytes: number; created_at: string; document_date: ISODate | null;
  original_filename: string | null; notes: string | null; asset_id: string | null; asset_name: string | null; uploaded_by: string | null;
  uploaded_by_name: string | null;
};

export const DOC_KINDS: Record<string, string> = {
  receipt: "Receipt",
  manual: "Manual",
  warranty: "Warranty",
  invoice: "Service invoice",
  repair_report: "Repair report",
  renovation: "Renovation",
  other: "Other",
};

export async function listDocuments(tx: Tx, householdId: string, f: { q?: string; kind?: string; assetId?: string }) {
  const q = f.q?.trim() ? `%${f.q.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
  return [...(await tx<DocRow[]>`
    select d.id, d.title, d.kind, d.mime_type, d.size_bytes, d.created_at::text as created_at, d.document_date, d.original_filename, d.notes,
           d.asset_id, a.name as asset_name, d.uploaded_by, p.display_name as uploaded_by_name
    from documents d left join assets a on a.id = d.asset_id left join profiles p on p.id = d.uploaded_by
    where d.household_id = ${householdId}
      ${f.kind ? tx`and d.kind = ${f.kind}` : tx``}
      ${f.assetId ? tx`and d.asset_id = ${f.assetId}` : tx``}
      ${q ? tx`and (d.title ilike ${q} or d.original_filename ilike ${q} or a.name ilike ${q} or d.notes ilike ${q})` : tx``}
    order by d.created_at desc
  `)];
}
