// eslint.config.mjs
import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "@typescript-eslint/eslint-plugin";

export default defineConfig([
  ...obsidianmd.configs.recommendedWithLocalesEn,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json" },
      globals: {
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        window: "readonly",
        navigator: "readonly",
        btoa: "readonly",
        requestAnimationFrame: "readonly",
        createFragment: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      "obsidianmd/sample-names": "off",
      "obsidianmd/ui/sentence-case": ["error", { allowAutoFix: true }],
      // TypeScript strict rules the bot checks
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/only-throw-error": "error",
    },
  },
]);
