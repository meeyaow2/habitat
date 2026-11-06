import "server-only";
import type { Tx } from "@/lib/db";

export type ActivityInput = {
  householdId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
};

/** Append to the shared household activity history (same transaction as the change). */
export async function logActivity(tx: Tx, a: ActivityInput) {
  await tx`
    insert into activity_logs (household_id, actor_id, action, entity_type, entity_id, summary)
    values (${a.householdId}, ${a.actorId}, ${a.action}, ${a.entityType}, ${a.entityId ?? null}, ${a.summary.slice(0, 240)})
  `;
}
