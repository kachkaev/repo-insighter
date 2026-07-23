import { formatCount } from "../format.ts";

/** Horizontal labeled bars for ranked categories (top rules, AI identities). */
export function BarList({
  items,
  color,
}: {
  items: Array<{
    /** Stable, unique React key; labels aren't guaranteed unique. */
    id: string;
    label: string;
    value: number;
    href?: string | undefined;
  }>;
  color?: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-(--text-muted)">Nothing to show.</p>;
  }

  // Resolved here rather than as a destructuring default: React Compiler bails
  // on a default value inside a typed destructured parameter (see editing-react
  // skill).
  const barColor = color ?? "var(--series-1)";
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item.id} className="group flex items-center gap-3 text-sm">
          <span
            className="w-56 truncate text-right font-mono text-xs text-(--text-secondary)"
            title={item.label}
          >
            {item.href ? (
              <a
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="hover:text-(--text-primary) hover:underline"
              >
                {item.label}
              </a>
            ) : (
              item.label
            )}
          </span>
          <span className="relative h-4 flex-1 rounded-xs bg-(--surface-2)">
            <span
              className="absolute inset-y-0 left-0 rounded-xs opacity-90 group-hover:opacity-100"
              style={{
                width: `${Math.max(0.5, (item.value / max) * 100)}%`,
                background: barColor,
              }}
            />
          </span>
          <span className="w-12 text-right text-xs font-medium tabular-nums">
            {formatCount(item.value)}
          </span>
        </li>
      ))}
    </ul>
  );
}
