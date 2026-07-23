---
name: editing-react
description: Conventions for editing the dashboard's React code (dashboard/src). The Vite build runs React Compiler, so components must NOT add manual useMemo, useCallback, or React.memo. Use when editing or reviewing dashboard components, hooks, or the visx charts.
---

# Editing React code (the dashboard)

The dashboard (`dashboard/src`) is the only React in this repo.
Its Vite build runs **React Compiler** — wired in [`dashboard/vite.config.ts`](../../../dashboard/vite.config.ts) via `reactCompilerPreset()` — so the compiler auto-memoizes every component and hook at build time.

## Don't add manual memoization

**Do not write `useMemo`, `useCallback`, or `React.memo`.**
The compiler already memoizes derived values, callbacks, and JSX elements on their reactive inputs — manual memoization is redundant noise, and hand-written dependency arrays drift out of sync and can fight the compiler.

Write derived values as plain expressions or statements in the component body:

```tsx
// ✅ compiler memoizes this on `points` / `seriesKeys`
const rows = points.map((point) => shapeRow(point, seriesKeys));

// ❌ don't — the compiler already does exactly this
const rows = useMemo(() => points.map(...), [points, seriesKeys]);
```

For a value that needs a guard, use a ternary (a component body can't hold a bare early `return` mid-way), or lift the branch into the JSX:

```tsx
const chart = data.length === 0 ? undefined : buildChart(data);
```

`useState`, `useEffect`, `useRef`, and the custom hooks in [`dashboard/src/components`](../../../dashboard/src/components) are still used normally — only the _memoization_ hooks are unnecessary.

## Why this matters for the charts

The charts ([`time-stack-chart.tsx`](../../../dashboard/src/components/time-stack-chart.tsx), [`diverging-bars.tsx`](../../../dashboard/src/components/diverging-bars.tsx)) track hover state that updates on every `mousemove`.
Each update re-renders the component, and the compiler makes that re-render cheap by memoizing the derived data and scales on their inputs.
Adding a `useMemo` back doesn't help — the compiler already does it.
But memoizing the _data_ is not enough to stop the expensive area/bar shapes from reconciling on every hover; that needed a structural split (see the last section).
Both are load-bearing.

## Keep components compilable

The compiler only optimizes code that follows the Rules of React.
Keep render pure: no mutating props or state during render, no reading/writing refs during render, call hooks unconditionally at the top level.
If a specific component ever genuinely must opt out, add the `"use no memo"` directive as its first statement — but that should be rare and comes with a comment explaining why.

## Patterns that silently bail the compiler

`panicThreshold` defaults to `"none"`, so when the compiler can't handle a component it **skips it silently** — the build still passes, but that component gets no memoization at all (and with its `useMemo`s already removed, it ends up _slower_ than before).
React Compiler 1.0 bails on these; avoid them:

- **A default value inside a typed destructured parameter** — `function C({ color = "red" }: { color?: string })`. Destructure without the default and resolve it in the body: `const c = color ?? "red";`.
- **Logical-assignment operators** `??=`, `||=`, `&&=` — use a plain assignment: `obj[k] = obj[k] ?? {}` instead of `obj[k] ??= {}`.

The compiler runs in the **production build** (`vite build`, what the `repo-dive dashboard` CLI serves), **not** the Vite dev server.
To check what actually compiled, temporarily pass a logger and rebuild:

```ts
babel({
  presets: [
    reactCompilerPreset({
      logger: {
        logEvent(file, e) {
          console.log(e.kind, e.fnName);
        },
      },
    }),
  ],
});
```

Every component should log `CompileSuccess`; a `CompileError` marks a bail.

## Isolating a subtree that must not re-render on hover/interaction

Memoizing a component's _data_ does not stop its expensive DOM from re-rendering when the component re-renders for unrelated state.
The compiler skips re-rendering a child **element** only when that element's props don't depend on the changing state.
So when an expensive subtree (the stacked areas/bars) lives in the same parent as something that changes constantly (the hover crosshair), the whole parent — shapes included — rebuilds on every mouse move.

The fix is structural: pull the static marks into their own component whose props are all hover-independent.
The compiler then memoizes that element, and moving the cursor (which only touches the crosshair/tooltip) reuses it so React skips the shapes.
This is exactly what [`ChartMarks`](../../../dashboard/src/components/time-stack-chart.tsx) does — keep hover state (`hoverMs`, crosshair, tooltip) out of its props.
