import type { SpecGrid } from "@/lib/content/types";

type Props = {
  grid: SpecGrid;
  /** Names the table for screen readers, e.g. "PP Biaxial Geogrid specifications". */
  caption: string;
};

/** A cell with no value shows a dash and is announced as "No value". */
function Cell({
  value,
  tone = "text-slate-900",
  className = "",
}: {
  value: string | null;
  /** Text colour for a cell that has a value. */
  tone?: string;
  className?: string;
}) {
  return value === null ? (
    <td aria-label="No value" className={`${className} text-slate-500`}>
      –
    </td>
  ) : (
    <td className={`${className} ${tone}`}>{value}</td>
  );
}

const CELL = "border-b border-slate-200 px-3 py-2.5 align-top";
const HEAD =
  "border-b border-slate-300 px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-700";
// First column: pinned while scrolling sideways, narrow on phones so models stay in reach.
const PINNED = "sticky left-0 z-10 w-36 min-w-36 max-w-36 bg-inherit sm:w-64 sm:min-w-64 sm:max-w-64";

/**
 * Spec table: columns are Property, Unit, Test method, then one per model.
 * It scrolls sideways inside its own container (so the page never does), with
 * the Property column pinned while you scroll across the models. The container
 * can take keyboard focus, so arrow keys scroll it.
 */
export function SpecTable({ grid, caption }: Props) {
  if (grid.rows.length === 0) return null;

  return (
    <div>
      {grid.models.length > 0 ? (
        <p className="mb-2 text-sm text-slate-600 sm:hidden">Swipe sideways to see every model.</p>
      ) : null}
      <div
        data-testid="spec-table-scroll"
        role="region"
        aria-label={`${caption} (scrolls sideways)`}
        tabIndex={0}
        className="overflow-x-auto rounded-lg border border-slate-200 bg-white"
      >
        <table className="w-full border-separate border-spacing-0 text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-slate-100">
            <tr>
              <th scope="col" className={`${HEAD} ${PINNED} shadow-[1px_0_0_0_var(--color-slate-300)]`}>
                Property
              </th>
              <th scope="col" className={`${HEAD} whitespace-nowrap`}>
                Unit
              </th>
              <th scope="col" className={`${HEAD} whitespace-nowrap`}>
                Test method
              </th>
              {grid.models.map((model, column) => (
                <th key={`${column}-${model}`} scope="col" className={`${HEAD} min-w-24 whitespace-nowrap text-center`}>
                  {model}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row, index) => (
              <tr key={`${index}-${row.name}`} className="bg-white even:bg-slate-50">
                <th
                  scope="row"
                  className={`${CELL} ${PINNED} text-left font-medium text-slate-900 shadow-[1px_0_0_0_var(--color-slate-200)]`}
                >
                  {row.name}
                </th>
                <Cell value={row.unit} tone="text-slate-600" className={`${CELL} whitespace-nowrap`} />
                <Cell value={row.testMethod} tone="text-slate-600" className={`${CELL} whitespace-nowrap`} />
                {grid.models.map((model, column) => (
                  <Cell
                    key={`${column}-${model}`}
                    value={row.values[column] ?? null}
                    className={`${CELL} whitespace-nowrap text-center tabular-nums`}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
