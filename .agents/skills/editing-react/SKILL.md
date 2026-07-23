---
name: editing-react
description: Conventions for editing the dashboard's React code (dashboard/src). The Vite build runs React Compiler, so components must NOT add manual useMemo, useCallback, or React.memo. Use when editing or reviewing dashboard components, hooks, or the visx charts.
---

# Editing React code (the dashboard)

The dashboard (`dashboard/src`) is the only React in this repo. Its Vite build
runs **React Compiler** — wired in [`dashboard/vite.config.ts`](../../../dashboard/vite.config.ts)
via `reactCompilerPreset()` — so the compiler auto-memoizes every component and
hook at build time.

## Don't add manual memoization

**Do not write `useMemo`, `useCallback`, or `React.memo`.** The compiler already
memoizes derived values, callbacks, and JSX elements on their reactive inputs —
manual memoization is redundant noise, and hand-written dependency arrays drift
out of sync and can fight the compiler.

Write derived values as plain expressions or statements in the component body:

```tsx
// ✅ compiler memoizes this on `points` / `seriesKeys`
const rows = points.map((point) => shapeRow(point, seriesKeys));

// ❌ don't — the compiler already does exactly this
const rows = useMemo(() => points.map(...), [points, seriesKeys]);
```

For a value that needs a guard, use a ternary (a component body can't hold a
bare early `return` mid-way), or lift the branch into the JSX:

```tsx
const chart = data.length === 0 ? undefined : buildChart(data);
```

`useState`, `useEffect`, `useRef`, and the custom hooks in
[`dashboard/src/components`](../../../dashboard/src/components) are still used
normally — only the _memoization_ hooks are unnecessary.

## Why this matters for the charts

The charts ([`time-stack-chart.tsx`](../../../dashboard/src/components/time-stack-chart.tsx),
[`diverging-bars.tsx`](../../../dashboard/src/components/diverging-bars.tsx))
track hover state that updates on every `mousemove`. Each update re-renders the
whole component, but the compiler keeps the stacked-area/bar/line JSX stable when
its inputs (rows, scales, colors) haven't changed, so React skips reconciling the
shapes and only the crosshair and tooltip update. Adding a `useMemo` back doesn't
help — the win is the compiler memoizing the _elements_, which it does for free.

## Keep components compilable

The compiler only optimizes code that follows the Rules of React. Keep render
pure: no mutating props or state during render, no reading/writing refs during
render, call hooks unconditionally at the top level. If a specific component ever
genuinely must opt out, add the `"use no memo"` directive as its first statement
— but that should be rare and comes with a comment explaining why.
