# KantataSync for Obsidian

> 🔄 Seamlessly sync your Obsidian notes with Kantata (Mavenlink) workspaces

![Version](https://img.shields.io/badge/version-0.4.0-blue)
![Obsidian](https://img.shields.io/badge/Obsidian-1.0.0+-purple)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-beta-orange)

KantataSync bridges your Obsidian vault with Kantata project management, automatically creating folders for workspaces, generating project dashboards, syncing notes to activity feeds, and keeping everything organized.

## ✨ Features

### 📁 Automatic Folder Sync
- **Auto-create folders** from Kantata workspaces
- **Polling** to check for new workspaces on a schedule
- **Smart linking** matches existing folders by name
- **Manual linking** for custom folder names that differ from workspace names
- **Filter by status** to only sync active projects
- **Ignore patterns** to skip specific workspaces (wildcards supported)

### 🔗 Manual Folder Linking
Link any folder to any workspace, regardless of name matching:
- Use command `Link folder to workspace` to manually link
- Prevents duplicate folder creation during sync
- Works with archive/unarchive functionality
- Use `Unlink folder from workspace` to remove link

### 📊 Project Dashboards
Beautiful auto-generated `_index.md` (or custom name) files for each project with:
- Status badges with color-coded indicators (🟢🟡🔴⚪🔵)
- Progress bars for completion percentage
- Budget tracking with remaining/used amounts
- Team roster with roles and lead designation
- Quick links to Kantata views (workspace, tasks, activity, time)
- Auto-refresh option on polling

### 📝 Note Syncing
- **One-click sync** to Kantata activity feeds
- **Status bar** shows sync state:
  - `📝 Note Sync: ✅ Synced` — all changes synced
  - `📝 Note Sync: 🔄 Pending` — local changes to sync
  - `📝 Note Sync: ⭕ Not Synced` — never synced
  - `📝 Note Sync: ❌ Failed` — sync error
- **Project status** shown alongside: `Project Status: 🟢 Active`
- **Conflict detection** warns if post was edited in Kantata
- **Auto-updates** existing posts when you re-sync

### 🗄️ Auto-Archive & Unarchive
Automatically organize projects based on Kantata status:
- **Auto-archive**: Move folders to `_Archive/` when status changes to Completed, Closed, Cancelled, etc.
- **Auto-unarchive**: Return folders from archive when status changes back to active
- **Configurable statuses**: Choose which statuses trigger archiving
- **Custom archive folder**: Use any folder name for archives
- Works with manually linked folders (tracks by workspace ID)

## 📖 Commands

| Command | Description |
|---------|-------------|
| `Sync workspaces from Kantata` | Fetch workspaces, create/link folders, archive/unarchive |
| `Sync current note to Kantata` | Push note content to Kantata activity feed |
| `Link folder to workspace` | Manually link current folder to a workspace |
| `Unlink folder from workspace` | Remove folder-workspace link |
| `Refresh dashboard for current folder` | Update current project's dashboard |
| `Refresh all dashboards` | Update all project dashboards |
| `Open workspace in Kantata` | Open current project in browser |

## 🚀 Installation

### Manual Installation
1. Download `main.js` and `manifest.json` from the [latest release](https://github.com/adamlsneed/obsidian-kantata-sync/releases)
2. Create folder: `<vault>/.obsidian/plugins/kantata-sync/`
3. Copy files into the folder
4. Enable plugin in Obsidian Settings → Community Plugins

### From Source
```bash
git clone https://github.com/adamlsneed/obsidian-kantata-sync.git
cd obsidian-kantata-sync
npm install
npm run build
npm run deploy  # If you have VAULT_PATH configured
```

## ⚙️ Configuration

### 1. Get Your Kantata API Token
1. Log into Kantata
2. Go to Settings → API → Personal Access Tokens (or OAuth)
3. Create a new token with workspace access
4. Copy the access token

### 2. Configure the Plugin
Open Obsidian Settings → KantataSync

#### API Settings
| Setting | Description | Default |
|---------|-------------|---------|
| **API Token** | Your Kantata OAuth/PAT token | Required |
| **API Base URL** | Kantata API endpoint | `https://api.mavenlink.com/api/v1` |
| **Include Archived** | Search archived workspaces | Off |

#### Folder Sync
| Setting | Description | Default |
|---------|-------------|---------|
| **Auto-sync on startup** | Create folders when Obsidian opens | Off |
| **Enable polling** | Periodically check for new workspaces | Off |
| **Polling interval** | Minutes between checks (min: 5) | 30 |

#### Filtering
| Setting | Description | Default |
|---------|-------------|---------|
| **Filter by status** | Only sync certain statuses | Off |
| **Allowed statuses** | Comma-separated list | Active, In Progress, Not Started |
| **Ignore patterns** | Skip workspaces matching patterns | Empty |

Ignore patterns support wildcards:
- `Test*` — skip workspaces starting with "Test"
- `*Template` — skip workspaces ending with "Template"
- `Internal*` — skip internal projects

#### Dashboard & Status
| Setting | Description | Default |
|---------|-------------|---------|
| **Create dashboard note** | Generate index file in folders | On |
| **Dashboard note name** | Filename for dashboard | `_index.md` |
| **Show workspace status** | Display project status in status bar | On |
| **Refresh dashboards on poll** | Auto-update dashboards | Off |

#### Auto-Archive
| Setting | Description | Default |
|---------|-------------|---------|
| **Enable auto-archive** | Move completed projects | Off |
| **Archive folder name** | Destination folder | `_Archive` |
| **Archive statuses** | Statuses that trigger archiving | Closed, Cancelled, Completed, Done, etc. |
| **Enable auto-unarchive** | Return projects when status changes back | Off |

## 🔧 How It Works

### Folder Linking
```
Automatic (name match):
  Kantata: "Acme Corp - Redesign"  →  Folder: /Acme Corp - Redesign/

Manual (custom name):
  Kantata: "Acme Corp - Redesign"  →  Folder: /Acme Project/
  (via "Link folder to workspace" command)
```

### Archive Flow
```
Status changes to "Completed":
  /Acme Project/  →  /_Archive/Acme Project/

Status changes back to "Active":
  /_Archive/Acme Project/  →  /Acme Project/
```

### Note Sync Flow
```
Obsidian Note                    Kantata Activity Feed
┌─────────────────┐             ┌─────────────────────┐
│ ## Meeting Notes│  ──sync──►  │ 📝 Meeting Notes    │
│ - Discussed...  │             │ - Discussed...      │
│ - Action items  │             │ Posted by You       │
└─────────────────┘             └─────────────────────┘

Frontmatter after sync:
---
kantata_synced: true
kantata_post_id: '12345678'
kantata_workspace_id: '98765432'
kantata_synced_at: '2026-01-31T03:00:00.000Z'
---
```

### Status Bar
```
📝 Note Sync: ✅ Synced  •  Project Status: 🟢 Active
     ↑                              ↑
     Note sync state                Kantata workspace status
```

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Submit a PR

### Development
```bash
npm install          # Install dependencies
npm run dev          # Watch mode (rebuilds on change)
npm run build        # Production build
npm run deploy       # Build + copy to plugin folder
```

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

**Made with ❤️ for the Obsidian community**

[Report Bug](https://github.com/adamlsneed/obsidian-kantata-sync/issues) · [Request Feature](https://github.com/adamlsneed/obsidian-kantata-sync/issues)
