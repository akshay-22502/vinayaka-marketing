import { Logo } from "@/components/site/Logo";
import { NotFoundContent } from "@/components/site/NotFoundContent";

// Global 404, for addresses that match no page at all. It does not read the
// database (it is built once), so it carries a plain header and no footer.
export default function NotFound() {
  return (
    <>
      <header className="bg-navy text-white">
        <div className="container-page flex h-16 items-center">
          <Logo />
        </div>
      </header>
      <main>
        <NotFoundContent />
      </main>
    </>
  );
}
