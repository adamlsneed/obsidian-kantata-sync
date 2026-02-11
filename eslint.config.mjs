// eslint.config.mjs
import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "@typescript-eslint/eslint-plugin";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json" },
      globals: {
        // Browser globals
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
      // Obsidian-specific
      "obsidianmd/sample-names": "off",
      "obsidianmd/ui/sentence-case": ["error", {
        brands: [
          // OS
          "iOS", "iPadOS", "macOS", "Windows", "Android", "Linux",
          // Obsidian
          "Obsidian", "Obsidian Sync", "Obsidian Publish",
          // Cloud & comms
          "Google Drive", "Dropbox", "OneDrive", "iCloud Drive",
          "YouTube", "Slack", "Discord", "Telegram", "WhatsApp", "Twitter", "X",
          // Tools
          "Readwise", "Zotero", "Excalidraw", "Mermaid",
          "Markdown", "LaTeX", "JavaScript", "TypeScript", "Node.js",
          "npm", "pnpm", "Yarn", "Git", "GitHub", "GitLab",
          "Notion", "Evernote", "Roam Research", "Logseq", "Anki", "Reddit",
          "VS Code", "Visual Studio Code", "IntelliJ IDEA", "WebStorm", "PyCharm",
          // Custom: Kantata plugin brands
          "Kantata", "Mavenlink",
          "Anthropic", "Claude", "Opus", "Sonnet", "Haiku",
          "OpenAI", "GPT",
          "Gemini", "Flash", "Pro",
          "OpenRouter",
          "Ollama", "Llama",
          "Mistral",
          "DeepSeek",
          "Turbo", "Mini", "Lite",
        ],
        ignoreRegex: [
          "^sk-",           // API key placeholders
          "^https?://",     // URLs
          "^AIza",          // Google API key placeholders
          "^llama\\d",      // Model identifiers
          "^console\\.",    // Domain names
          "^gray:|^green:|^yellow:|^red:|^blue:",  // Color-coded config
          "^_",             // Underscore-prefixed values
          "^Test\\*",       // Glob patterns
        ],
      }],

      // TypeScript strict rules the bot checks
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/only-throw-error": "error",
    },
  },
]);
