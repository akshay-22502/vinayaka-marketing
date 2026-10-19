/**
 * The "Published" checkbox every content form has. Unticked items stay in the admin but are
 * hidden from the website (the database only lets visitors read published rows). Posts
 * `published=on` when ticked and nothing when not.
 */
export function PublishedToggle({ defaultChecked = false, name = "published" }: { defaultChecked?: boolean; name?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-slate-300 bg-slate-50 p-4">
      <input
        id="published-toggle"
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        aria-describedby="published-hint"
        className="mt-0.5 size-5 shrink-0 accent-navy"
      />
      <div>
        <label htmlFor="published-toggle" className="block text-base font-semibold text-slate-900">
          Published
        </label>
        <p id="published-hint" className="text-sm text-slate-600">
          Visible on the website. Untick to keep it as a draft that only you can see here.
        </p>
      </div>
    </div>
  );
}
