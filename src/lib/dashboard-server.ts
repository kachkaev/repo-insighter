import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { NodeServices } from "@effect/platform-node";
import { Console, Effect } from "effect";
import { ChildProcess } from "effect/unstable/process";

import { catalogDirName } from "./catalog.ts";
import { resolveRepoRoot } from "./scan.ts";

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));

const mimeTypes: Record<string, string> = {
  ".css": "text/css",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
};

/** Bundled build: dist/cli.js + dist/dashboard/. Dev: src/lib/… + dist/dashboard/. */
const resolveAssetsDir = (): string | undefined => {
  const candidates = [
    fileURLToPath(new URL("dashboard", import.meta.url)),
    fileURLToPath(new URL("../../dist/dashboard", import.meta.url)),
  ];
  return candidates.find((candidate) =>
    existsSync(path.join(candidate, "index.html")),
  );
};

const openInBrowser = (url: string): Effect.Effect<void, Error> =>
  Effect.scoped(
    Effect.gen(function* () {
      const command =
        process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
            ? "start"
            : "xdg-open";
      const handle = yield* ChildProcess.make(command, [url], {
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
      });
      yield* handle.exitCode;
    }),
  ).pipe(
    Effect.mapError(toError),
    Effect.provide(NodeServices.layer),
    Effect.ignore,
  );

export const runDashboard = ({
  repoPath,
  port,
  open,
}: {
  readonly repoPath: string;
  readonly port: number;
  readonly open: boolean;
}): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    const repoRoot = yield* resolveRepoRoot(repoPath);
    const dataPath = path.join(
      repoRoot,
      catalogDirName,
      "index",
      "dashboard.json",
    );
    if (!existsSync(dataPath)) {
      return yield* Effect.fail(
        new Error(
          `No dashboard data at ${dataPath} — run \`repo-insighter scan\` and \`repo-insighter index\` first.`,
        ),
      );
    }

    const assetsDir = resolveAssetsDir();
    if (assetsDir === undefined) {
      return yield* Effect.fail(
        new Error(
          "Dashboard assets not found — run `pnpm build` first (dist/dashboard is missing).",
        ),
      );
    }

    const server = http.createServer((request, response) => {
      void (async () => {
        const requestPath = new URL(request.url ?? "/", "http://localhost")
          .pathname;

        try {
          if (requestPath === "/dashboard.json") {
            response.writeHead(200, {
              "content-type": "application/json",
              "cache-control": "no-store",
            });
            response.end(await readFile(dataPath));
            return;
          }

          const relativePath = requestPath === "/" ? "index.html" : requestPath;
          const filePath = path.join(assetsDir, relativePath);
          // Keep requests inside the assets dir; anything else gets the app shell.
          const safePath =
            filePath.startsWith(assetsDir) && existsSync(filePath)
              ? filePath
              : path.join(assetsDir, "index.html");

          response.writeHead(200, {
            "content-type":
              mimeTypes[path.extname(safePath)] ?? "application/octet-stream",
          });
          response.end(await readFile(safePath));
        } catch (error) {
          response.writeHead(500, { "content-type": "text/plain" });
          response.end(String(error));
        }
      })();
    });

    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- the callback effect genuinely succeeds with no value
    yield* Effect.callback<void, Error>((resume) => {
      server.on("error", (error) => {
        resume(Effect.fail(toError(error)));
      });
      server.listen(port, () => {
        resume(Effect.void);
      });
    });

    const url = `http://localhost:${port}`;
    yield* Console.log(
      `Dashboard for ${repoRoot}\nServing on ${url} — press Ctrl+C to stop.`,
    );

    if (open) {
      yield* openInBrowser(url);
    }

    // Keep the process alive until interrupted.
    yield* Effect.never;
  });
