import type { ReactNode } from "react";

/** Title row for an admin page: the h1, a line of help, and an optional button on the right. */
export function PageHeader({ title, intro, action }: { title: string; intro?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-navy sm:text-3xl">{title}</h1>
        {intro ? <p className="mt-1 text-slate-600">{intro}</p> : null}
      </div>
      {action}
    </div>
  );
}
