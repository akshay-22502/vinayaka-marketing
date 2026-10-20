import Head from "next/head";

// Friendly page for server errors that happen while a page is first generated
// (for example the database is unreachable), where the App Router's error.tsx
// cannot run. Pages that are already cached keep being served while the
// database is down; only a page nobody has opened yet ends up here.
// Plain markup: this page is built once and must not depend on the database.
export default function ServerErrorPage() {
  return (
    <>
      <Head>
        <title>Something went wrong | TerraTechBharat</title>
        <meta name="robots" content="noindex" />
      </Head>
      <header className="bg-navy text-white">
        <div className="container-page flex h-16 items-center">
          <span className="text-xl font-bold tracking-tight">TerraTechBharat</span>
        </div>
      </header>
      <main className="container-page py-20 sm:py-28">
        <p className="text-sm font-semibold uppercase tracking-wider text-orange-dark">Something went wrong</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy sm:text-4xl">
          We could not load this page
        </h1>
        <p className="mt-4 max-w-xl text-lg text-slate-600">
          This is a problem on our side, not yours. Please try again in a moment.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          {/* A plain link on purpose: it reloads the page, which is what "try again" needs. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className="btn btn-primary">
            Back to home
          </a>
        </div>
      </main>
    </>
  );
}
