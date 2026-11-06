"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/misc";
import { signInAction, signUpAction, type AuthFormState } from "./actions";

export function AuthForm({ mode, next }: { mode: "sign-in" | "sign-up"; next?: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    mode === "sign-in" ? signInAction : signUpAction,
    {},
  );
  const fe = state.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      {state.error && !Object.keys(fe).length && (
        <Notice tone="danger" icon={<AlertCircle />}>
          {state.error}
        </Notice>
      )}
      {mode === "sign-up" && (
        <Field label="Your name" htmlFor="displayName" error={fe.displayName}>
          <Input name="displayName" autoComplete="name" defaultValue={state.values?.displayName} required />
        </Field>
      )}
      <Field label="Email" htmlFor="email" error={fe.email}>
        <Input name="email" type="email" autoComplete="email" inputMode="email" defaultValue={state.values?.email} required />
      </Field>
      <Field
        label="Password"
        htmlFor="password"
        error={fe.password}
        hint={mode === "sign-up" ? "At least 10 characters." : undefined}
      >
        <Input
          name="password"
          type="password"
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          required
        />
      </Field>
      <Button type="submit" variant="primary" size="lg" loading={pending} className="mt-1 w-full">
        {mode === "sign-in" ? "Sign in" : "Create account"}
      </Button>
      <p className="text-center text-sm text-fg-muted">
        {mode === "sign-in" ? (
          <>
            New to Habitat?{" "}
            <Link href={next ? `/sign-up?next=${encodeURIComponent(next)}` : "/sign-up"} className="font-medium text-accent hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href={next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in"} className="font-medium text-accent hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
