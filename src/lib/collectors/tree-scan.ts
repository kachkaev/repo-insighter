import { Effect } from "effect";

import { getBlobCache } from "../blob-cache.ts";
import { runCommandBytes, runGit } from "../git.ts";
import { isScannableSourceFile } from "./types.ts";

const maxBlobBytes = 2 * 1024 * 1024;

type TreeBlob = {
  readonly blobSha: string;
  readonly filePath: string;
};

/** Source files (per {@link isScannableSourceFile}) in a commit's tree with their blob ids. */
const listSourceBlobs = (
  repoRoot: string,
  sha: string,
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
        if (type === "blob" && blobSha && isScannableSourceFile(filePath)) {
          blobs.push({ blobSha, filePath });
        }
      }
      return blobs;
    }),
  );

const decoder = new TextDecoder("utf-8", { fatal: false });
const newline = 10;

/** Reads blob contents in one `git cat-file --batch` subprocess, keyed by blob sha. */
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
 * Parsed results memo shared across commits within one process. Successive
 * commits share almost their whole tree, so this keeps the per-commit work
 * proportional to what changed rather than to the tree size.
 */
const parsedMemo = new Map<string, unknown>();
const parsedMemoCapacity = 400_000;

/**
 * Computes a content-derived result for every source file in a commit's tree,
 * caching per blob: only blobs never seen before are read and scanned.
 */
export const scanTreeWithBlobCache = ({
  repoRoot,
  sha,
  collectorName,
  cacheKey,
  scanContent,
}: {
  readonly repoRoot: string;
  readonly sha: string;
  readonly collectorName: string;
  /** The collector's cache fingerprint (see {@link CollectContext.cacheKey}). */
  readonly cacheKey: string;
  /** Pure per-file scan; its JSON-encoded result is what gets cached. */
  readonly scanContent: (content: string) => unknown;
}): Effect.Effect<Array<{ filePath: string; result: unknown }>, Error> =>
  Effect.gen(function* () {
    const blobs = yield* listSourceBlobs(repoRoot, sha);
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

    // Third level: read and scan blobs nobody has ever seen.
    const missing = unseenShas.filter((blobSha) => !cachedRaw.has(blobSha));
    if (missing.length > 0) {
      const contents = yield* fetchBlobContents(repoRoot, missing);
      const fresh = new Map<string, string>();
      for (const [blobSha, content] of contents) {
        const result = scanContent(content);
        fresh.set(blobSha, JSON.stringify(result));
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
