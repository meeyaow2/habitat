import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AuthForm } from "@/features/auth/auth-form";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const user = await getSessionUser();
  if (user && !user.isAnonymous) redirect("/overview");
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mb-6 mt-1 text-fg-muted">It takes about two minutes to set up your home.</p>
      <AuthForm mode="sign-up" next={next} />
      <p className="mt-6 text-center text-xs text-fg-subtle">
        Your home data is private to your household. We don’t store your address.
      </p>
    </>
  );
}
