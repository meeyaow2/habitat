"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/misc";
import { acceptInvitationAction } from "@/features/household/actions";

export function AcceptInviteButton({ token }: { token: string }) {
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      {error && <Notice tone="danger">{error}</Notice>}
      <Button variant="primary" size="lg" loading={pending} onClick={() => start(async () => {
        const res = await acceptInvitationAction(token);
        if (res && !res.ok) setError(res.error);
      })}>
        Join household
      </Button>
    </div>
  );
}
