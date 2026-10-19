"use client";

import Link from "next/link";
import { useEffect } from "react";

// Friendly page for unexpected errors, such as the database being unreachable.
// Next logs the error on the server; the digest lets support find that log line.
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="container-page py-20 sm:py-28">
      <p className="text-sm font-semibold uppercase tracking-wider text-orange-dark">Something went wrong</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy sm:text-4xl">
        We could not load this page
      </h1>
      <p className="mt-4 max-w-xl text-lg text-slate-600">
        This is a problem on our side, not yours. Please try again in a moment.
      </p>
      {error.digest ? <p className="mt-2 text-sm text-slate-600">Reference: {error.digest}</p> : null}
      <div className="mt-8 flex flex-wrap gap-3">
        <button type="button" onClick={reset} className="btn btn-primary">
          Try again
        </button>
        <Link href="/" className="btn btn-secondary">
          Back to home
        </Link>
      </div>
    </main>
  );
}
