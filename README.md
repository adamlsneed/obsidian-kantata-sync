# KantataSync with AI Time Entry

> 🔄 Seamlessly sync your Obsidian notes with Kantata + **AI-powered automatic time entries**

This is an extended version of [obsidian-kantata-sync](https://github.com/adamlsneed/obsidian-kantata-sync) that adds AI-powered automatic time entry creation when notes sync to Kantata.

## 🆕 AI Time Entry Feature

When you sync a note to Kantata, the plugin can automatically:
1. **Analyze your note** using Claude AI
2. **Generate a summary** (1 sentence, action-oriented)
3. **Estimate hours** based on work described
4. **Select category** from project's available categories
5. **Create a time entry** in Kantata with all this data

### Setup

1. **Enable AI Time Entry** in plugin settings
2. **Configure Anthropic Auth** (choose one):
   - **API Key**: Get from [console.anthropic.com](https://console.anthropic.com) → API Keys
   - **OAuth Token**: Run `claude setup-token` in terminal (for Pro/Max subscribers)
3. **Test Connection** to verify credentials
4. **Sync a note** - time entry will be created automatically!

### Authentication Options

| Method | Token Format | Best For |
|--------|-------------|----------|
| API Key | `sk-ant-api03-...` | Pay-as-you-go users |
| OAuth Token | `sk-ant-oat01-...` | Claude Pro/Max subscribers |

### How It Works

```
Note Sync → AI Analyzes Content → Time Entry Created
                  ↓
         {
           "summary": "Configured AD integration...",
           "category": "Consulting",
           "hours": 1.5,
           "notes": "Worked with customer on..."
         }
```

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

### ⏱️ AI Time Entry (NEW)
- Automatic time entry creation on note sync
- AI-powered analysis for summary, hours, category
- Support for Anthropic API key or OAuth token

## Installation

1. Copy `main.js` and `manifest.json` to `.obsidian/plugins/kantata-sync/`
2. Enable in Obsidian Settings → Community plugins
3. Configure Kantata token and (optionally) Anthropic credentials

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
