"use client";

import * as React from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/server/action";

/**
 * Call a server action with pending state, field errors and toasts.
 * Resolves `{ data }` on success, or `null` on failure.
 */
export function useAction<I, T>(action: (input: I) => Promise<ActionResult<T>>, opts: { success?: string | ((data: T) => string); silent?: boolean } = {}) {
  const [pending, startTransition] = React.useTransition();
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);

  const run = React.useCallback(
    (input: I): Promise<{ data: T } | null> =>
      new Promise((resolve) => {
        startTransition(async () => {
          setError(null);
          let result: ActionResult<T>;
          try {
            result = await action(input);
          } catch {
            result = { ok: false, error: "We couldn’t reach Habitat. Check your connection and try again." };
          }
          if (result.ok) {
            setFieldErrors({});
            const msg = typeof opts.success === "function" ? opts.success(result.data) : opts.success;
            if (msg && !opts.silent) toast.success(msg);
            resolve({ data: result.data });
          } else {
            setFieldErrors(result.fieldErrors ?? {});
            setError(result.error);
            if (!opts.silent && !result.fieldErrors) toast.error(result.error);
            resolve(null);
          }
        });
      }),
    [action, opts],
  );

  return { run, pending, fieldErrors, error, setFieldErrors };
}
