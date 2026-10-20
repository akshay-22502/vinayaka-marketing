import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { resolveLoginState } from "@/lib/admin/login-state";
import { getServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  // This page needs no session, but an admin who is already signed in has no use for it.
  const supabase = await getServerClient();
  const { error } = await searchParams;
  const state = await resolveLoginState(supabase, error);
  if (state.redirectTo) redirect(state.redirectTo);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="bg-navy text-white">
        <div className="container-page flex h-16 items-center gap-3">
          <Image src="/brand/logo.png" alt="" width={382} height={314} unoptimized className="h-10 w-auto shrink-0" />
          <span className="text-lg font-bold tracking-tight">TerraTechBharat Admin</span>
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:py-16">
        <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight text-navy">Sign in</h1>
          <p className="mt-1 text-sm text-slate-600">For the TerraTechBharat team only.</p>
          <div className="mt-6">
            <LoginForm initialError={state.error} />
          </div>
        </div>
      </main>
    </div>
  );
}
