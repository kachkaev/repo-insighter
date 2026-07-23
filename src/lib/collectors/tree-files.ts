import { Effect } from "effect";

import { getBlobCache } from "../blob-cache.ts";
import { runCommandBytes, runGit } from "../git.ts";

/**
 * Lockfiles and manifests can be large (multi-megabyte in big monorepos), so
 * this cap is far more generous than the source-scanner's 2 MiB.
 */
const maxBlobBytes = 32 * 1024 * 1024;

const decoder = new TextDecoder("utf-8", { fatal: false });
const newline = 10;

type TreeBlob = {
  readonly blobSha: string;
  readonly filePath: string;
};

/** Blobs in a commit's tree whose path satisfies `include`, with their ids. */
const listBlobs = (
  repoRoot: string,
  sha: string,
  include: (filePath: string) => boolean,
): Effect.Effect<TreeBlob[], Error> =>
  runGit(["-C", repoRoot, "ls-tree", "-r", sha]).pipe(
    Effect.map((stdout) => {
      const blobs: TreeBlob[] = [];
      for (const line of stdout.split("\n")) {
        const tabIndex = line.indexOf("\t");
        if (tabIndex === -1) {
          continue;
        }
        const filePath = line.slice(tabIndex + 1);
        const [, type = "", blobSha = ""] = line.slice(0, tabIndex).split(" ");
        if (type === "blob" && blobSha && include(filePath)) {
          blobs.push({ blobSha, filePath });
        }
      }
      return blobs;
    }),
  );

/**
 * Reads blob contents in one `git cat-file --batch` subprocess, keyed by blob
 * sha. Mirrors the framing parser in {@link ./tree-scan.ts} but with a larger
 * blob cap, since it targets whole lockfiles rather than source files.
 */
const fetchBlobContents = (
  repoRoot: string,
  blobShas: readonly string[],
): Effect.Effect<Map<string, string>, Error> =>
  blobShas.length === 0
    ? Effect.succeed(new Map())
    : runCommandBytes("git", ["-C", repoRoot, "cat-file", "--batch"], {
        input: `${blobShas.join("\n")}\n`,
      }).pipe(
        Effect.map((bytes) => {
          // Framing: "<sha> <type> <size>\n<size bytes>\n", or "<sha> missing\n".
          const contents = new Map<string, string>();
          let offset = 0;
          while (offset < bytes.length) {
            let headerEnd = offset;
            while (headerEnd < bytes.length && bytes[headerEnd] !== newline) {
              headerEnd += 1;
            }
            const header = decoder.decode(bytes.subarray(offset, headerEnd));
            offset = headerEnd + 1;
            const [sha = "", type = "", sizeRaw = ""] = header.split(" ");
            if (!sha || type === "missing") {
              continue;
            }
            const size = Number(sizeRaw);
            if (!Number.isInteger(size)) {
              continue;
            }
            if (type === "blob" && size <= maxBlobBytes) {
              contents.set(
                sha,
                decoder.decode(bytes.subarray(offset, offset + size)),
              );
            }
            offset += size + 1; // skip content and its trailing newline
          }
          return contents;
        }),
      );

/**
 * Parsed results memo shared across commits within one process (see the twin
 * in {@link ./tree-scan.ts}). Successive commits usually share their lockfiles
 * verbatim, so this keeps repeated scans off the hot path.
 */
const parsedMemo = new Map<string, unknown>();
const parsedMemoCapacity = 10_000;

/**
 * Computes a content-derived result for every tree file matching `include`,
 * caching per blob: a lockfile that never changed across a range of commits is
 * parsed once, not once per commit. Unlike {@link ./tree-scan.ts} this selects
 * files by path (lockfiles/manifests, not the whole source tree) and hands the
 * file path to `scanContent`.
 */
export const scanTreeFilesWithBlobCache = ({
  repoRoot,
  sha,
  collectorName,
  cacheKey,
  include,
  scanContent,
}: {
  readonly repoRoot: string;
  readonly sha: string;
  readonly collectorName: string;
  /** The collector's cache fingerprint (see {@link CollectContext.cacheKey}). */
  readonly cacheKey: string;
  readonly include: (filePath: string) => boolean;
  /** Pure per-file scan; its JSON-encoded result is what gets cached. */
  readonly scanContent: (content: string, filePath: string) => unknown;
}): Effect.Effect<Array<{ filePath: string; result: unknown }>, Error> =>
  Effect.gen(function* () {
    const blobs = yield* listBlobs(repoRoot, sha, include);
    const cache = getBlobCache(repoRoot);

    const memoKey = (blobSha: string) =>
      `${collectorName}:${cacheKey}:${blobSha}`;
    if (parsedMemo.size > parsedMemoCapacity) {
      parsedMemo.clear();
    }

    const unseenShas = [
      ...new Set(
        blobs
          .map((blob) => blob.blobSha)
          .filter((blobSha) => !parsedMemo.has(memoKey(blobSha))),
      ),
    ];

    // Second level: the on-disk cache survives across runs.
    const cachedRaw = cache.getMany(collectorName, cacheKey, unseenShas);
    for (const [blobSha, raw] of cachedRaw) {
      const parsed: unknown = JSON.parse(raw);
      parsedMemo.set(memoKey(blobSha), parsed);
    }

    // Third level: read and scan blobs nobody has ever seen. A blob's parse
    // depends only on its content, so the first path it appears under wins.
    const missing = unseenShas.filter((blobSha) => !cachedRaw.has(blobSha));
    if (missing.length > 0) {
      const firstPathOf = new Map<string, string>();
      for (const blob of blobs) {
        if (!firstPathOf.has(blob.blobSha)) {
          firstPathOf.set(blob.blobSha, blob.filePath);
        }
      }
      const contents = yield* fetchBlobContents(repoRoot, missing);
      const fresh = new Map<string, string>();
      for (const [blobSha, content] of contents) {
        const result = scanContent(content, firstPathOf.get(blobSha) ?? "");
        // `scanContent` returns undefined for a matched file it can't make sense
        // of (e.g. a package.json that isn't a JSON object). JSON.stringify of
        // undefined is undefined, which cannot be persisted — and would fail the
        // whole batch write — so store "null": the miss stays cached (not
        // re-scanned every run) and reads back as a skip downstream.
        fresh.set(blobSha, JSON.stringify(result) ?? "null");
        parsedMemo.set(memoKey(blobSha), result);
      }
      cache.setMany(collectorName, cacheKey, fresh);
    }

    const results: Array<{ filePath: string; result: unknown }> = [];
    for (const blob of blobs) {
      if (parsedMemo.has(memoKey(blob.blobSha))) {
        results.push({
          filePath: blob.filePath,
          result: parsedMemo.get(memoKey(blob.blobSha)),
        });
      }
    }
    return results;
  });
