import { ShieldAlert, ShieldCheck, ShieldX, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { relativeDays, type ISODate } from "@/lib/domain/dates";
import { warrantyState } from "@/lib/domain/status";

export function WarrantyBadge({ expiresOn, today, reminderDays, verbose }: { expiresOn: ISODate | null; today: ISODate; reminderDays: number; verbose?: boolean }) {
  const state = warrantyState(expiresOn, today, reminderDays);
  if (state === "none") return <Badge tone="outline"><Shield aria-hidden />No warranty</Badge>;
  if (state === "expired") return <Badge tone="neutral"><ShieldX aria-hidden />Expired{verbose ? ` ${relativeDays(expiresOn!, today)}` : ""}</Badge>;
  if (state === "expiring") return <Badge tone="warning"><ShieldAlert aria-hidden />Ends {relativeDays(expiresOn!, today)}</Badge>;
  return <Badge tone="success"><ShieldCheck aria-hidden />{verbose ? `Until ${relativeDays(expiresOn!, today).replace("in ", "")}` : "Covered"}</Badge>;
}

export function AssetStatusBadge({ status }: { status: string }) {
  if (status === "needs_attention") return <Badge tone="danger">Needs attention</Badge>;
  if (status === "in_repair") return <Badge tone="warning">In repair</Badge>;
  if (status === "retired") return <Badge tone="neutral">Retired</Badge>;
  return null;
}
