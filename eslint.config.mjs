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
      "obsidianmd/ui/sentence-case": ["error", {
        allowAutoFix: true,
        brands: [
          // Default brands from eslint-plugin-obsidianmd
          "iOS", "iPadOS", "macOS", "Windows", "Android", "Linux",
          "Obsidian", "Obsidian Sync", "Obsidian Publish",
          "Google Drive", "Dropbox", "OneDrive", "iCloud Drive",
          "YouTube", "Slack", "Discord", "Telegram", "WhatsApp", "Twitter", "X",
          "Readwise", "Zotero", "Excalidraw", "Mermaid",
          "Markdown", "LaTeX", "JavaScript", "TypeScript", "Node.js",
          "npm", "pnpm", "Yarn", "Git", "GitHub",
          "GitLab", "Notion", "Evernote", "Roam Research", "Logseq",
          "Anki", "Reddit", "VS Code", "Visual Studio Code",
          "IntelliJ IDEA", "WebStorm", "PyCharm",
          // Plugin-specific brands (AI providers and products)
          "Kantata", "Mavenlink", "Claude", "Gemini", "Ollama", "Llama",
        ],
        acronyms: [
          // Default acronyms from eslint-plugin-obsidianmd
          "API", "HTTP", "HTTPS", "URL", "DNS", "TCP", "IP", "SSH", "TLS", "SSL",
          "FTP", "SFTP", "SMTP", "JSON", "XML", "HTML", "CSS", "PDF", "CSV",
          "YAML", "SQL", "PNG", "JPG", "JPEG", "GIF", "SVG",
          "2FA", "MFA", "OAuth", "JWT", "LDAP", "SAML",
          "SDK", "IDE", "CLI", "GUI", "CRUD", "REST", "SOAP",
          "CPU", "GPU", "RAM", "SSD", "USB", "UI", "OK",
          "RSS", "S3", "WebDAV", "ID", "UUID", "GUID", "SHA", "MD5",
          "ASCII", "UTF-8", "UTF-16", "DOM", "CDN", "FAQ", "AI", "ML",
          // Plugin-specific acronyms
          "GPT", "OAUTH",
        ],
        // Model family/variant names that are proper nouns
        ignoreWords: [
          "Opus", "Sonnet", "Haiku", "Mini", "Turbo", "Flash", "Lite", "Pro",
          "Not", "Started", "In", "Progress", "On", "Hold", "At", "Risk", "Completed",
        ],
        // Placeholders and config-format strings
        ignoreRegex: [
          "^sk-", "^Sk-", "^http://", "^https://",
          "^console\\.", "^llama\\d", "^_",
          "^Test\\*", "^gray:", "^green:", "^yellow:", "^red:", "^blue:",
          "^GPT-",
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
