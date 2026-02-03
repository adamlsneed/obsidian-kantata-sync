# KantataSync Full Documentation

> Complete guide to all features, commands, and settings

## Table of Contents
- [Overview](#overview)
- [Installation](#installation)
- [Configuration](#configuration)
- [Commands Reference](#commands-reference)
- [AI Features](#ai-features)
- [Note Syncing](#note-syncing)
- [Workspace Management](#workspace-management)
- [Dashboard Notes](#dashboard-notes)
- [Auto-Archive](#auto-archive)
- [Status Bar](#status-bar)
- [Troubleshooting](#troubleshooting)

---

## Overview

KantataSync connects your Obsidian vault to Kantata (formerly Mavenlink), enabling:
- Automatic folder creation from Kantata workspaces
- Note syncing to Kantata activity feeds
- AI-powered note organization and time entry creation
- Project dashboard generation with status tracking
- Auto-archive based on project status

---

## Installation

### From Release
1. Download `main.js` and `manifest.json` from releases
2. Create folder: `.obsidian/plugins/kantata-sync/`
3. Copy files into the folder
4. Enable in Obsidian → Settings → Community Plugins

### From Source
```bash
git clone https://github.com/adamlsneed/obsidian-kantata-ai-time.git
cd obsidian-kantata-ai-time
npm install
npm run build
# Copy main.js and manifest.json to your vault's plugins folder
```

---

## Configuration

### Kantata Settings

| Setting | Description | Required |
|---------|-------------|----------|
| **Kantata Token** | API token from Kantata account | ✅ Yes |
| **API Base URL** | Default: `https://api.mavenlink.com/api/v1` | No |
| **Customers Folder** | Root folder for customer notes (default: `.`) | No |

### Sync Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **Include Archived** | Show archived workspaces | Off |
| **Auto-sync on Startup** | Sync folders when Obsidian opens | Off |
| **Enable Polling** | Periodically check for new workspaces | Off |
| **Polling Interval** | Minutes between polls | 30 |

### Filter Settings

| Setting | Description |
|---------|-------------|
| **Filter by Status** | Only show workspaces with specific statuses |
| **Allowed Statuses** | List of statuses to include |
| **Ignore Patterns** | Folder patterns to skip |

### Dashboard Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **Create Dashboard Note** | Auto-create Project Info.md in linked folders | On |
| **Dashboard Note Name** | Filename for dashboard | `Project Info.md` |
| **Show Status in Status Bar** | Display project status | On |
| **Refresh Dashboards on Poll** | Update dashboards during polling | Off |

### Auto-Archive Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **Enable Auto-Archive** | Move folders based on status | Off |
| **Archive Folder Name** | Where to move archived projects | `_Archived` |
| **Archive Statuses** | Statuses that trigger archiving | Closed, Completed, etc. |
| **Enable Auto-Unarchive** | Restore folders when status changes | Off |

### AI Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **Enable AI Time Entry** | Allow AI-powered time entries | Off |
| **Enhance Notes** | AI proofreads/templates notes before time entry | On |
| **AI Provider** | Which AI service to use | Anthropic |

#### Provider-Specific Settings

**Anthropic:**
- API Key (from console.anthropic.com)
- Model selection (Opus, Sonnet, Haiku)

**OpenAI:**
- API Key (from platform.openai.com)
- Model selection (GPT-4o, GPT-4, etc.)

**Google AI:**
- API Key (from aistudio.google.com)
- Model selection (Gemini Pro, Flash)

**OpenRouter:**
- API Key (from openrouter.ai)
- Model selection

**Ollama:**
- Endpoint URL (default: http://localhost:11434)
- Model name

---

## Commands Reference

### AI Commands

#### `AI: Organize notes into template`
**Purpose:** Transform rough notes into structured Work Session format

**Behavior:**
- If note is empty (< 10 chars): Creates blank template instantly (no AI)
- If note has content: AI organizes into template structure

**Actions:**
1. Saves original content to `_Backups/{filename}.backup.md`
2. Extracts images and sends to AI (vision support)
3. AI organizes content into template sections
4. Renames file to `YYYY-MM-DD Work Session.md`

**Template Output:**
```markdown
==**Meeting Details**==
**Customer:** [folder name]
**Work Session:** [date] @ [time] CST
**Our Attendees:** [your name]
**[Customer] Attendees:** [from notes/images]

==**Activities/Notes**==

**Accomplishments:**
[elaborated content]

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

---

#### `AI: Create time entry for current note`
**Purpose:** Create a Kantata time entry from note content

**Requirements:**
- Note must be in a linked workspace folder
- Workspace must have at least one task/story
- AI credentials must be configured

**Process:**
1. Reads note content
2. AI analyzes and extracts:
   - Summary (1 line, action-oriented)
   - Category (matched to workspace tasks)
   - Hours (estimated, defaults to 1 hour)
   - Notes (professional summary)
3. Creates time entry in Kantata
4. Updates frontmatter with time entry ID

**Time Estimation Rules:**
- Meetings/calls: Use mentioned duration
- Quick tasks: 0.25-0.5 hours
- Default: 1 hour
- Uses 15-minute increments (0.25, 0.5, 0.75, 1, etc.)

---

#### `Undo last time entry`
**Purpose:** Delete the most recently created time entry

**Behavior:**
- Deletes the time entry from Kantata
- Only works for entries created in current session
- Clears after plugin reload

---

### Sync Commands

#### `Sync current note to Kantata`
**Purpose:** Push note content to Kantata activity feed

**Process:**
1. Reads note content (strips Internal Notes section)
2. Creates or updates post in Kantata workspace
3. Updates frontmatter with sync status

**Frontmatter Updated:**
```yaml
kantata_synced: true
kantata_post_id: "12345"
kantata_workspace_id: "67890"
kantata_synced_at: "2026-02-02T20:30:00.000Z"
```

---

#### `Sync workspaces from Kantata`
**Purpose:** Fetch all workspaces and create/update folder links

**Actions:**
- Fetches workspaces matching filter criteria
- Creates folders for new workspaces
- Updates cache with workspace metadata
- Triggers dashboard refresh if enabled

---

### Workspace Commands

#### `Link folder to workspace`
**Purpose:** Manually connect a folder to a Kantata workspace

**Process:**
1. Opens workspace picker modal
2. User selects workspace
3. Creates link in cache
4. Generates dashboard note (if enabled)

---

#### `Unlink folder from workspace`
**Purpose:** Remove connection between folder and workspace

---

#### `Open workspace in Kantata`
**Purpose:** Open the linked Kantata workspace in browser

---

### Dashboard Commands

#### `Refresh all dashboards`
**Purpose:** Update all Project Info.md files with latest Kantata data

---

#### `Refresh dashboard for current folder`
**Purpose:** Update dashboard for the active note's folder

---

## AI Features

### Vision Support

The AI can extract information from images embedded in notes:

**Supported Formats:**
- `![[image.png]]` (Obsidian wiki links)
- `![alt](path/image.png)` (Markdown links)

**Image Locations Checked:**
1. Same folder as note
2. `Attachments/` subfolder
3. Vault root

**Use Cases:**
- Extract attendee names from meeting screenshots
- Read information from shared screens
- Process any relevant images (up to 5 per note)

---

### Backup System

**Location:** `_Backups/` folder in same directory as note

**When Created:** Before AI organizes a note (not for blank templates)

**Filename:** `{original-filename}.backup.md`

**To Restore:**
1. Open backup file from `_Backups/` folder
2. Copy content
3. Paste into original note

---

### AI Behavior Rules

1. **Accomplishments:** Always elaborated into professional sentences
2. **Other sections:** Only filled if explicitly mentioned
3. **No hallucination:** AI never invents information
4. **All fields present:** Template always includes all sections
5. **No dashes:** Empty sections left blank (not `-`)
6. **Markdown support:** Time entries use proper markdown for Kantata

---

## Note Syncing

### Frontmatter Fields

| Field | Description |
|-------|-------------|
| `kantata_synced` | Whether note is synced (true/false) |
| `kantata_post_id` | Kantata post/activity ID |
| `kantata_workspace_id` | Linked workspace ID |
| `kantata_synced_at` | Last sync timestamp |
| `kantata_time_entry_id` | Time entry ID (if created) |
| `kantata_time_synced_at` | Time entry timestamp |

### Content Handling

**Included in sync:**
- All content before `<u>Internal Notes</u>` marker

**Excluded from sync:**
- Internal Notes section
- Frontmatter (YAML)
- Kantata callout blocks

---

## Workspace Management

### Cache System

Workspace links are cached in `.kantatasync-cache.json`:

```json
{
  "Customer Name": {
    "workspaceId": "12345",
    "workspaceTitle": "Customer Name - Project",
    "workspaceStatus": "Active",
    "workspaceStatusColor": "green",
    "cachedAt": "2026-02-02T20:30:00.000Z"
  }
}
```

### Folder Mappings

Manual links stored in `.kantata-mappings.json`:

```json
{
  "Customer Folder": {
    "workspace_id": "12345",
    "workspace_title": "Customer Name - Project",
    "selected_at": "2026-02-02T20:30:00.000Z"
  }
}
```

---

## Dashboard Notes

### Auto-Generated Content

Project Info.md includes:
- Workspace title and status
- Budget information (if available)
- Due date with warnings
- Team roster
- Quick links to Kantata

### Status Colors

| Color | Emoji | Meaning |
|-------|-------|---------|
| Green | 🟢 | Active/On Track |
| Yellow | 🟡 | Warning/At Risk |
| Red | 🔴 | Critical/Overdue |
| Gray | ⚪ | Not Started/Unknown |

---

## Auto-Archive

### How It Works

1. During workspace sync, checks each folder's workspace status
2. If status matches archive list → moves to `_Archived/` folder
3. If auto-unarchive enabled and status changes → moves back

### Default Archive Statuses
- Archived
- Closed
- Cancelled
- Completed
- Delivered
- Done
- Submitted

---

## Status Bar

### Display Format
```
Note ✅ · Time ✅ · 🟢 Active
```

### Status Icons

**Note Sync:**
- ✅ Synced
- 🔄 Has pending changes
- ⚪ Not synced
- ❌ Sync failed

**Time Entry:**
- ✅ Time logged
- ⚪ No time entry

### Click Actions

Clicking status bar opens menu with quick actions.

---

## Troubleshooting

### Common Issues

**"No tasks found in workspace"**
- Workspace needs at least one task/story to log time against
- Create a task in Kantata first

**"Authentication failed"**
- Check Kantata token is valid
- Token may have expired - regenerate in Kantata

**AI not responding**
- Verify API key is correct
- Check provider status
- Try "Test Connection" button in settings

**Note shows "out of sync" after time entry**
- This is normal - frontmatter was modified
- Fixed in recent versions - update plugin

**Images not being read**
- Check image is in supported format (png, jpg, gif, webp)
- Verify image path is correct
- Check console for `[KantataSync] Image not found` errors

### Debug Logging

Open Obsidian Developer Console (Cmd+Option+I) to see:
- `[KantataSync]` prefixed log messages
- API responses and errors
- AI analysis results

### Reset Plugin

1. Disable plugin
2. Delete `.kantatasync-cache.json` and `.kantata-mappings.json`
3. Re-enable plugin
4. Re-link folders

---

## API Reference

### Kantata API
- Base URL: `https://api.mavenlink.com/api/v1`
- Auth: Bearer token
- [Kantata API Docs](https://developer.kantata.com/)

### AI Providers
- [Anthropic](https://docs.anthropic.com/)
- [OpenAI](https://platform.openai.com/docs/)
- [Google AI](https://ai.google.dev/docs)
- [OpenRouter](https://openrouter.ai/docs)
- [Ollama](https://github.com/ollama/ollama)

---

## Version History

### Current (feature/ai-time-entries)
- AI: Organize notes into template
- Vision support for attendee extraction
- Backup system for undo
- Auto-rename to Work Session format
- AI: Create time entry command
- Undo time entry command
- Enhanced notes with proper markdown
- All template fields always present

---

*Last updated: 2026-02-02*
