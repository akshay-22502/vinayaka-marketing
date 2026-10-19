import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { isAdmin } from "@/lib/admin/require-admin";
import { getServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sign in" };

const NOT_ADMIN_MESSAGE = "This account does not have admin access";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  // This page needs no session, but an admin who is already signed in has no use for it.
  const supabase = await getServerClient();
  const { data } = await supabase.auth.getUser();
  if (data.user && (await isAdmin(supabase))) redirect("/admin");

  // Only the one known reason is shown; the query string is never echoed back.
  const { error } = await searchParams;
  const initialError = error === "not-admin" ? NOT_ADMIN_MESSAGE : undefined;

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
            <LoginForm initialError={initialError} />
          </div>
        </div>
      </main>
    </div>
  );
}
