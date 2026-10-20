import { AdminNav } from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin/require-admin";

/**
 * Frame for every admin page except the login page: sidebar (a menu on small screens)
 * and the page. It checks the session once for the whole subtree, but pages and actions
 * must call requireAdmin() themselves too: this layout is not rendered again when you
 * move between its pages.
 */
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="min-h-screen bg-white lg:flex">
      <a href="#admin-main" className="skip-link">
        Skip to main content
      </a>
      <AdminNav />
      <main id="admin-main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 focus:outline-none sm:px-6 lg:px-10 lg:py-10">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
