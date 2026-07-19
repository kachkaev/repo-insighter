import { NodeServices } from "@effect/platform-node";
import { Effect, Stream } from "effect";
import { ChildProcess } from "effect/unstable/process";

export class GitCommandError extends Error {
  readonly args: readonly string[];
  readonly exitCode: number;
  readonly stderr: string;

  constructor(args: readonly string[], exitCode: number, stderr: string) {
    super(
      `git ${args.join(" ")} exited with code ${exitCode}${
        stderr ? `:\n${stderr.trim()}` : ""
      }`,
    );
    this.name = "GitCommandError";
    this.args = args;
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

const captureStream = <E, R>(stream: Stream.Stream<Uint8Array, E, R>) =>
  stream.pipe(
    Stream.decodeText(),
    Stream.runFold(
      () => "",
      (output, chunk) => output + chunk,
    ),
  );

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));

/**
 * Runs a command and captures its stdout, failing on unexpected exit codes.
 * For git, the repo path is passed via `git -C` instead of a working directory
 * to keep the invocation explicit.
 */
export const runCommand = (
  command: string,
  args: readonly string[],
  options?: {
    /** Extra exit codes to treat as success (e.g. 1 for `git grep` with no matches). */
    readonly okExitCodes?: readonly number[];
    readonly cwd?: string;
  },
): Effect.Effect<string, Error> =>
  Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* ChildProcess.make(command, [...args], {
        stdin: "ignore",
        ...(options?.cwd === undefined ? {} : { cwd: options.cwd }),
      });

      const { stdout, stderr, exitCode } = yield* Effect.all(
        {
          stdout: captureStream(handle.stdout),
          stderr: captureStream(handle.stderr),
          exitCode: handle.exitCode,
        },
        { concurrency: "unbounded" },
      );

      const code = Number(exitCode);
      if (code !== 0 && !options?.okExitCodes?.includes(code)) {
        return yield* Effect.fail(
          new GitCommandError([command, ...args], code, stderr),
        );
      }

      return stdout;
    }),
  ).pipe(Effect.mapError(toError), Effect.provide(NodeServices.layer));

export const runGit = (
  args: readonly string[],
  options?: { readonly okExitCodes?: readonly number[] },
): Effect.Effect<string, Error> => runCommand("git", args, options);
