import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/require-admin";

export const metadata: Metadata = { title: "Dashboard" };

function StatCard({
  href,
  label,
  value,
  hint,
  testId,
}: {
  href: string;
  label: string;
  value: number;
  hint: string;
  testId: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-navy/40 hover:bg-slate-50"
    >
      <span className="block text-sm font-semibold text-slate-700">{label}</span>
      <span data-testid={testId} className="mt-2 block text-4xl font-bold tabular-nums text-navy">
        {value}
      </span>
      <span className="mt-1 block text-sm text-slate-600">{hint}</span>
    </Link>
  );
}

export default async function DashboardPage() {
  const { supabase } = await requireAdmin();

  // Counted with the admin's own session: row level security lets admins see every row.
  const [newQuotes, publishedProducts] = await Promise.all([
    supabase.from("quote_requests").select("id", { count: "exact", head: true }).eq("status", "new"),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("published", true),
  ]);
  if (newQuotes.error) throw new Error(`Could not count new quote requests: ${newQuotes.error.message}`);
  if (publishedProducts.error) throw new Error(`Could not count published products: ${publishedProducts.error.message}`);

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-navy sm:text-3xl">Dashboard</h1>
      <p className="mt-1 text-slate-600">What needs attention, and what is live on the site.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <StatCard
          href="/admin/quotes?status=new"
          label="New quote requests"
          value={newQuotes.count ?? 0}
          hint="Waiting for a first reply"
          testId="count-new-quotes"
        />
        <StatCard
          href="/admin/products"
          label="Published products"
          value={publishedProducts.count ?? 0}
          hint="Visible to visitors on the site"
          testId="count-published-products"
        />
      </div>
    </>
  );
}
