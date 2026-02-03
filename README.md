# KantataSync

> 🔄 Full-featured Kantata integration for Obsidian with AI-powered time entries

Sync notes, create time entries, manage project status, and more — all from Obsidian.

## ✨ Features

### 📁 Workspace Sync
- Auto-create folders from Kantata workspaces
- Smart filtering by project status
- Polling for new workspaces

### 📝 Note Syncing
- Sync notes to Kantata activity feeds
- Update existing posts
- Delete synced posts
- Status bar shows sync state

### ⏱️ Time Entries
- **AI-powered** — Analyze notes and create entries automatically
- **Manual** — Create/edit entries with task selection
- **Full CRUD** — Create, update, delete time entries

### 🤖 AI Features
- **Organize Notes** — Transform rough notes into structured templates
- **AI Time Entry** — Smart time estimation and categorization
- **Vision Support** — Extract attendee names from screenshots
- **Multiple Providers** — Anthropic, OpenAI, Google, OpenRouter, Ollama

### 📊 Project Dashboards
- Status badges with color-coded indicators
- Progress bars and budget tracking
- Visual warnings for overdue/over-budget

### 🗄️ Auto-Archive
- Automatically organize projects based on Kantata status

### 🔐 Security
- API keys stored in Obsidian's encrypted SecretStorage
- Auto-migration from plain settings on upgrade

## Installation

### Option 1: Manual Install
1. Download `main.js` and `manifest.json` from [Releases](https://github.com/adamlsneed/obsidian-kantata-sync/releases)
2. Create folder: `.obsidian/plugins/kantata-sync/`
3. Copy both files into that folder
4. Restart Obsidian
5. Enable in Settings → Community Plugins

### Option 2: Build from Source
```bash
git clone https://github.com/adamlsneed/obsidian-kantata-sync.git
cd obsidian-kantata-sync
npm install
npm run build
```
Then copy `main.js` and `manifest.json` to your vault's `.obsidian/plugins/kantata-sync/`

## Setup

### 1. Kantata Token
1. Get your Kantata API token from your account settings
2. Open plugin settings → enter **Kantata API Token**
3. Click **Test Connection**

### 2. AI Features (Optional)
1. Enable **AI Time Entry** toggle
2. Choose **AI Provider**: Anthropic, OpenAI, Google, OpenRouter, or Ollama
3. Enter API key for your chosen provider

| Provider | Models | Get API Key |
|----------|--------|-------------|
| Anthropic | Claude Opus, Sonnet, Haiku | [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| OpenAI | GPT-4o, GPT-4 | [platform.openai.com](https://platform.openai.com) |
| Google | Gemini Pro, Flash | [aistudio.google.com](https://aistudio.google.com) |
| OpenRouter | Many models | [openrouter.ai](https://openrouter.ai) |
| Ollama | Local models | No API key needed |

## Usage

### Status Bar Menu
Click the status bar to access all actions:
- ✨ AI: Organize Notes
- 📝 Sync/Update in Kantata
- ⏱️ AI/Manual Time Entry
- 🎯 Change Project Status
- 🔗 Open in Kantata
- 🗑️ Delete from Kantata

Menu items are **draggable** in settings — reorder and add separators as needed.

### Commands
| Command | Description |
|---------|-------------|
| `AI: Organize notes into template` | Structure rough notes with AI |
| `AI: Create time entry` | Auto-create time entry from note |
| `Sync current note` | Sync note to Kantata |
| `Link folder to workspace` | Connect folder to project |
| `Unlink folder` | Disconnect folder |
| `Refresh dashboards` | Update all project dashboards |

## License

MIT
