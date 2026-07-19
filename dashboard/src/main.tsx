import "./styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app.tsx";
import { loadDashboardData } from "./data.ts";

const rootElement = document.querySelector("#root");
if (!rootElement) {
  throw new Error("Missing #root element");
}
const root = createRoot(rootElement);

loadDashboardData().then(
  (data) => {
    document.title = `${data.repo.name} · repo-insighter`;
    root.render(
      <StrictMode>
        <App data={data} />
      </StrictMode>,
    );
  },
  (error: unknown) => {
    root.render(
      <main className="mx-auto max-w-xl px-6 py-16 text-center">
        <h1 className="text-lg font-semibold">Could not load dashboard data</h1>
        <p className="mt-2 text-sm text-(--text-secondary)">
          {error instanceof Error ? error.message : String(error)}
        </p>
      </main>,
    );
  },
);
