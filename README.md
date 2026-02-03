# KantataSync with AI Time Entry

> 🔄 Seamlessly sync your Obsidian notes with Kantata + **AI-powered automatic time entries**

This is an extended version of [obsidian-kantata-sync](https://github.com/adamlsneed/obsidian-kantata-sync) that adds AI-powered automatic time entry creation when notes sync to Kantata.

## 🆕 AI Features

### 📝 AI: Organize Notes into Template

Transform rough notes into a structured Work Session template:

**Command:** `KantataSync: AI: Organize notes into template`

**Features:**
- Converts rough bullet points into professional structured notes
- Applies Work Session template format automatically
- **Vision support:** Extracts attendee names from meeting screenshots
- **Backup:** Original content saved to `_Backups/` folder for undo
- **Auto-rename:** Renames file to `YYYY-MM-DD Work Session.md`
- **Empty notes:** Provides blank template instantly (no AI call needed)

**Template Structure:**
```markdown
==**Meeting Details**==
**Customer:** [from folder name]
**Work Session:** [date] @ [time] CST
**Netwrix Attendees:** Adam Sneed
**[Customer] Attendees:** [from images or notes]

==**Activities/Notes**==

**Accomplishments:**
[AI elaborates on your notes]

**Issues:**
[if mentioned]

**Blockers:**
[if mentioned]

**Next Session:**
[if mentioned]

**Next Steps:**
[if mentioned]

---

<u>Internal Notes</u>
```

**Backup & Undo:**
- Before AI processes, original content is saved to `_Backups/{filename}.backup.md`
- To undo: copy content from backup file back to the original note

### ⏱️ AI: Create Time Entry

Automatically create Kantata time entries from your notes:

**Command:** `KantataSync: AI: Create time entry for current note`

**Features:**
- AI analyzes note content and generates summary
- Smart time estimation (defaults to 1 hour unless specified)
- Matches content to project tasks/categories
- Creates time entry with proper markdown formatting
- **Undo:** Use `KantataSync: Undo last time entry` command

**How It Works:**
```
Note Content → AI Analyzes → Time Entry Created
                   ↓
          {
            "summary": "Configured AD integration...",
            "category": "Implementation/Deployment",
            "hours": 1.5,
            "notes": "Worked with customer on..."
          }
```

### AI Behavior Rules

- **Accomplishments:** AI elaborates and expands into professional sentences
- **Other fields:** Only filled if explicitly mentioned in notes
- **No hallucination:** AI never invents information not in your notes
- **Image support:** Extracts visible attendee names from screenshots
- **All fields present:** Template always shows all sections (blank if no content)

## Setup

### Kantata Configuration
1. Get Kantata API token from your account settings
2. Enter in plugin settings → **Kantata Token**

### AI Configuration (Optional)
1. **Enable AI Time Entry** in plugin settings
2. **Choose AI Provider:** Anthropic, OpenAI, Google, OpenRouter, or Ollama
3. **Enter API Key** for your chosen provider
4. **Test Connection** to verify credentials

### Supported AI Providers

| Provider | Models | API Key Source |
|----------|--------|----------------|
| Anthropic | Claude Opus, Sonnet, Haiku | [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| OpenAI | GPT-4o, GPT-4 | [platform.openai.com](https://platform.openai.com) |
| Google | Gemini Pro, Flash | [aistudio.google.com](https://aistudio.google.com) |
| OpenRouter | Many models | [openrouter.ai](https://openrouter.ai) |
| Ollama | Local models | No API key needed |

## ✨ All Features

### 📁 Automatic Folder Sync
- Auto-create folders from Kantata workspaces
- Polling to check for new workspaces
- Smart linking and filtering

### 📊 Project Dashboards
- Status badges with color-coded indicators
- Progress bars, budget tracking, team roster
- Visual warnings for overdue projects and budget status

### 📝 Note Syncing
- One-click sync to Kantata activity feeds
- Status bar shows sync state
- Conflict detection

### 🗄️ Auto-Archive & Unarchive
- Automatically organize projects based on Kantata status

### 🤖 AI Features
- **Organize notes into template** with vision support
- **Automatic time entry creation** on demand
- **Undo time entry** command
- **Backup original notes** before AI processing

## Commands

| Command | Description |
|---------|-------------|
| `AI: Organize notes into template` | Transform rough notes into structured template |
| `AI: Create time entry for current note` | Create Kantata time entry from note |
| `Undo last time entry` | Delete the last created time entry |
| `Sync current note to Kantata` | Sync note to Kantata activity feed |
| `Link folder to workspace` | Connect folder to Kantata project |
| `Refresh all dashboards` | Update all project dashboard notes |

## Installation

1. Copy `main.js` and `manifest.json` to `.obsidian/plugins/kantata-sync/`
2. Enable in Obsidian Settings → Community plugins
3. Configure Kantata token and (optionally) AI provider credentials

## Development

```bash
git clone https://github.com/adamlsneed/obsidian-kantata-ai-time.git
cd obsidian-kantata-ai-time
npm install
npm run build
npm run deploy  # Copy to Obsidian plugins folder
```

## Upstream

This repo extends: https://github.com/adamlsneed/obsidian-kantata-sync

To sync with upstream:
```bash
git remote add upstream https://github.com/adamlsneed/obsidian-kantata-sync.git
git fetch upstream
git merge upstream/main
```

## License

MIT
