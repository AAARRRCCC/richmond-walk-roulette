import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "design_handoff_walk_roulette",
      "iter-log.html",
      // Vendored lint plugin: third-party source, not this project's to lint.
      "tools/oxlint/anti-slop",
    ],
  },
  js.configs.recommended,
  // Type-checked tier: catches floating promises, unsafe `any` flow, and
  // misused thenables — the failures that only show up with types in hand.
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ["**/*.{ts,tsx,mjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  // node:test registers each case with the runner and returns a promise the
  // runner itself awaits. Awaiting it at the call site would serialise the
  // suite and is not how the API is meant to be used.
  {
    files: ["**/*.test.ts"],
    rules: { "@typescript-eslint/no-floating-promises": "off" },
  },
  // Plain JavaScript carries no project types, so the type-checked rules have
  // nothing to run against here.
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
