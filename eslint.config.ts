import { generateBaseConfigs } from "@kachkaev/eslint-config-base";
import { defineConfig } from "eslint/config";

export default defineConfig([
  ...generateBaseConfigs({ tsconfigRootDir: import.meta.dirname }),

  {
    ignores: [".husky/**", "dist/**"],
  },

  {
    files: ["dashboard/**/*.ts", "dashboard/**/*.tsx"],
    rules: {
      "@typescript-eslint/consistent-type-assertions": "off", // The fetched dashboard.json crosses a trusted local boundary; a single cast beats hand-validating every series.
      "@typescript-eslint/explicit-module-boundary-types": "off", // React components and hooks are fine with inferred return types.
      "func-style": "off", // Small local helpers read naturally as const arrows next to component bodies.
      "import/no-default-export": "off", // Vite config files must default-export.
      "import/no-extraneous-dependencies": "off", // The dashboard is bundled by Vite, so its packages live in devDependencies by design.
      "unicorn/no-array-callback-reference": "off", // Passing named pure helpers to map/filter is idiomatic in the chart-shaping code.
    },
  },

  {
    files: ["src/**/*.ts"],
    rules: {
      "@typescript-eslint/explicit-module-boundary-types": "off", // Effect-heavy APIs infer large Effect<Success, Error, Requirements> signatures; repeating them adds noise.
      "func-style": "off", // Effect code is typically composed from const-bound helpers that are easy to pass around and pipe.
      "unicorn/no-array-callback-reference": "off", // False positive for Effect.forEach(iterable, effect), which is not Array#forEach(callback, thisArg).
      "unicorn/no-array-method-this-argument": "off", // False positive for Effect.forEach(iterable, effect), which reuses array method names with different argument positions.
    },
  },
]);
