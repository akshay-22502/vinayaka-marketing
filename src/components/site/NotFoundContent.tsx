import Link from "next/link";

/** The "Page not found" message, shared by the site 404 (inside the site layout) and the global one. */
export function NotFoundContent() {
  return (
    <div className="container-page py-20 sm:py-28">
      <p className="text-sm font-semibold uppercase tracking-wider text-orange-dark">Error 404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy sm:text-4xl">Page not found</h1>
      <p className="mt-4 max-w-xl text-lg text-slate-600">
        The page you are looking for does not exist, or it is no longer available.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/" className="btn btn-primary">
          Back to home
        </Link>
        <Link href="/products" className="btn btn-secondary">
          Browse products
        </Link>
        <Link href="/quote" className="btn btn-secondary">
          Request a quote
        </Link>
      </div>
    </div>
  );
}
