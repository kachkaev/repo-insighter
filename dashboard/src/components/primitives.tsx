import type { ReactNode } from "react";

export function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string | undefined;
  children: ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="text-base font-semibold">{title}</h2>
      {subtitle ? (
        <p className="mt-0.5 mb-3 text-sm text-(--text-secondary)">
          {subtitle}
        </p>
      ) : (
        <div className="mb-3" />
      )}
      <div className="rounded-lg border border-(--grid-line) bg-(--surface-1) p-4">
        {children}
      </div>
    </section>
  );
}

export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
}) {
  return (
    <div className="rounded-lg border border-(--grid-line) bg-(--surface-1) px-4 py-3">
      <div className="text-xs font-medium tracking-wide text-(--text-muted) uppercase">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint ? (
        <div className="mt-0.5 text-xs text-(--text-secondary)">{hint}</div>
      ) : undefined}
    </div>
  );
}

export function Legend({
  items,
}: {
  items: Array<{ label: string; color: string }>;
}) {
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-(--text-secondary)">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block size-2.5 rounded-xs"
            style={{ background: item.color }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function DataTable({
  caption,
  header,
  rows,
}: {
  caption: string;
  header: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <details className="mt-3 text-xs text-(--text-secondary)">
      <summary className="cursor-pointer select-none">{caption}</summary>
      <div className="mt-2 max-h-64 overflow-auto">
        <table className="w-full text-left tabular-nums">
          <thead>
            <tr>
              {header.map((cell) => (
                <th key={cell} className="pr-4 pb-1 font-medium">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-(--grid-line)">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="py-0.5 pr-4">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
