import Link from "next/link";

export type Crumb = { label: string; href?: string };

/** Trail of pages above the current one. The last item (no href) is the current page. */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
        {items.map((item, index) => (
          <li key={`${index}-${item.label}`} className="flex items-center gap-2">
            {index > 0 ? (
              <span aria-hidden="true" className="text-slate-400">
                /
              </span>
            ) : null}
            {item.href ? (
              <Link
                href={item.href}
                className="rounded-sm font-medium text-navy underline-offset-2 hover:underline"
              >
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="font-medium text-slate-900">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
