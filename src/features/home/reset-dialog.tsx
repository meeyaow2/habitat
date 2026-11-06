"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Notice } from "@/components/ui/misc";
import { useAction } from "@/lib/client/use-action";
import { cn } from "@/lib/utils";
import { resetLayoutAction } from "./actions";
import { PlanPreview } from "./plan-preview";
import { instantiateFloor, suggestedTemplate, templatesFor, type TemplateKey } from "./templates";

export function ResetLayoutDialog({ open, onOpenChange, propertyType, hdbFlatType }: { open: boolean; onOpenChange: (o: boolean) => void; propertyType: string; hdbFlatType: string | null }) {
  const router = useRouter();
  const [key, setKey] = React.useState<TemplateKey>(suggestedTemplate(propertyType, hdbFlatType));
  const reset = useAction(resetLayoutAction, { success: "Layout reset" });
  const options = templatesFor(propertyType);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Reset to a template" description="Replace the whole floor plan with a starter layout." size="lg">
        <DialogBody className="flex flex-col gap-4">
          <Notice tone="warning">
            All rooms and furniture on every floor are replaced. Your appliances and their records are kept, but they’ll need to be placed on the plan again.
          </Notice>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Templates">
            {options.map((t) => {
              const doc = instantiateFloor(t.floors[0]);
              return (
                <label key={t.key} className={cn("cursor-pointer overflow-hidden rounded-md border has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring", key === t.key ? "border-accent ring-1 ring-accent" : "border-line")}>
                  <input type="radio" className="sr-only" name="reset-template" checked={key === t.key} onChange={() => setKey(t.key)} />
                  <div className="aspect-[4/3] bg-[var(--plan-bg)] p-2"><PlanPreview rooms={doc.rooms} objects={doc.objects} title={t.label} className="size-full" /></div>
                  <p className="border-t border-line px-2 py-1.5 text-xs font-medium">{t.label}</p>
                </label>
              );
            })}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="danger"
            loading={reset.pending}
            onClick={async () => {
              const ok = await reset.run({ templateKey: key });
              if (ok) {
                onOpenChange(false);
                router.replace("/home?edit=1");
              }
            }}
          >
            Replace floor plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
