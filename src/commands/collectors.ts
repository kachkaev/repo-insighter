import { Console, Effect } from "effect";
import { Command } from "effect/unstable/cli";

import { builtInCollectors } from "../lib/collectors/roster.ts";
import { samplingLabel } from "../lib/sampling.ts";

export const collectorsCommand = Command.make("collectors").pipe(
  Command.withDescription(
    "List available collectors, their versions, strategies and default sampling",
  ),
  Command.withHandler(() =>
    Effect.gen(function* () {
      for (const collector of builtInCollectors) {
        yield* Console.log(
          [
            `${collector.name} (v${collector.version})`,
            `  strategy: ${collector.strategy}, sampling: ${samplingLabel(collector.defaultSampling)}`,
            `  ${collector.description}`,
          ].join("\n"),
        );
      }
    }),
  ),
);
