import Link from "next/link";
import type { ReactNode } from "react";

export type Column<T> = {
  header: string;
  cell: (row: T) => ReactNode;
  /** Left out on phones, where the table has to stay narrow. */
  hideOnMobile?: boolean;
};

type Props<T> = {
  rows: T[];
  columns: Column<T>[];
  /** Where a row's edit screen is. The first column links there. */
  editHref: (row: T) => string;
  /** Names the table for screen readers. */
  caption: string;
  emptyMessage?: string;
};

const cell = "px-3 py-3 align-top text-sm text-slate-700";

function StatusBadge({ published }: { published: boolean }) {
  return published ? (
    <span className="inline-block rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-900">Published</span>
  ) : (
    <span className="inline-block rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-800">Draft</span>
  );
}

/**
 * The list view every content section uses: the columns it is given (the first one links to the
 * edit screen), then the sort order and a Published / Draft badge. Rows come ordered by the caller
 * (sort order, then name).
 */
export function EntityTable<T extends { id: string; published: boolean; sort_order: number }>({
  rows,
  columns,
  editHref,
  caption,
  emptyMessage = "Nothing here yet.",
}: Props<T>) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-700">{emptyMessage}</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-0 border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-slate-100">
          <tr>
            {columns.map((column) => (
              <th
                key={column.header}
                scope="col"
                className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-700 ${column.hideOnMobile ? "hidden sm:table-cell" : ""}`}
              >
                {column.header}
              </th>
            ))}
            <th scope="col" className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
              Sort
            </th>
            <th scope="col" className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50">
              {columns.map((column, index) => (
                <td key={column.header} className={`${cell} min-w-0 break-words ${column.hideOnMobile ? "hidden sm:table-cell" : ""}`}>
                  {index === 0 ? (
                    <Link href={editHref(row)} className="font-semibold text-navy underline underline-offset-4 hover:text-navy/80">
                      {column.cell(row)}
                    </Link>
                  ) : (
                    column.cell(row)
                  )}
                </td>
              ))}
              <td className={`${cell} tabular-nums`}>{row.sort_order}</td>
              <td className={cell}>
                <StatusBadge published={row.published} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
