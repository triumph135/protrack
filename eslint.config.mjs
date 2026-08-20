import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Pre-existing `any` usage across the codebase (~25 call sites as of
      // Aug 2026) predates lint being wired into CI as a blocking gate.
      // Downgraded to a warning so CI can enforce lint going forward
      // without bundling an unrelated type-safety refactor into unrelated
      // PRs. Tracked as follow-up cleanup work, not silenced permanently.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];

export default eslintConfig;
