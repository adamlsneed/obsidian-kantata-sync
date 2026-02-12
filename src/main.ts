import { App, FuzzySuggestModal, MarkdownView, Menu, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder, requestUrl, AbstractInputSuggest } from 'obsidian';

interface RetryableError extends Error {
    retryable: boolean;
    status: number;
}

// API response interfaces for type safety
interface AnthropicResponse {
    content?: Array<{ text?: string }>;
    error?: { message?: string };
    message?: string;
}

interface OpenAIResponse {
    choices?: Array<{ message?: { content?: string } }>;
}

interface GeminiResponse {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

interface OllamaResponse {
    response?: string;
}

interface KantataErrorResponse {
    errors?: Array<string | { message?: string }>;
}

interface KantataWorkspaceRaw {
    id: string;
    title: string;
    status?: { message?: string; color?: string };
}


interface TimeEntryParsed {
    summary: string;
    category: string;
    hours: number;
    notes: string;
}

// Folder suggester for autocomplete
class FolderSuggest extends AbstractInputSuggest<TFolder> {
    private inputEl: HTMLInputElement;

    constructor(app: App, inputEl: HTMLInputElement) {
        super(app, inputEl);
        this.inputEl = inputEl;
    }

    getSuggestions(inputStr: string): TFolder[] {
        const folders: TFolder[] = [];
        const lowerInput = inputStr.toLowerCase();
        
        this.app.vault.getAllLoadedFiles().forEach(file => {
            if (file instanceof TFolder) {
                if (file.path.toLowerCase().includes(lowerInput) || file.name.toLowerCase().includes(lowerInput)) {
                    folders.push(file);
                }
            }
        });
        
        // Also suggest creating the folder if it doesn't exist
        return folders.slice(0, 10);
    }

    renderSuggestion(folder: TFolder, el: HTMLElement): void {
        el.setText(folder.path || '/');
    }

    selectSuggestion(folder: TFolder): void {
        this.inputEl.value = folder.path;
        this.inputEl.trigger('input');
        this.close();
    }
}

interface Workspace {
    id: string;
    title: string;
    status?: string;
    statusColor?: string;
}

interface WorkspaceDetails {
    id: string;
    title: string;
    description?: string;
    status: string;
    statusColor: string;
    startDate?: string;
    dueDate?: string;
    budgeted: boolean;
    price?: string;
    budgetUsed?: string;
    budgetRemaining?: string;
    percentBudgetUsed: number;
    percentageComplete: number;
    participants: { id: string; name: string; role?: string }[];
    primaryMaven?: { id: string; name: string };
    createdAt?: string;
    updatedAt?: string;
    currencySymbol: string;
    deleted?: boolean;
}

interface WorkspaceCacheEntry {
    workspaceId: string;
    workspaceTitle: string;
    workspaceStatus?: string;
    workspaceStatusColor?: string;
    cachedAt: string;
}

interface KantataSettings {
    kantataToken: string;
    apiBaseUrl: string;
    customersFolder: string;
    includeArchived: boolean;
    autoSyncFoldersOnStartup: boolean;
    enablePolling: boolean;
    pollingIntervalMinutes: number;
    // Filter & Ignore
    filterByStatus: boolean;
    allowedStatuses: string[];  // Whitelist of statuses to include
    ignorePatterns: string[];   // Glob patterns for workspace names to skip
    // Dashboard
    createDashboardNote: boolean;
    dashboardNoteName: string;
    showWorkspaceStatusInStatusBar: boolean;
    showRibbonIcons: boolean;
    refreshDashboardsOnPoll: boolean;
    // Auto-archive
    enableAutoArchive: boolean;
    archiveFolderName: string;
    archiveStatuses: string[];
    enableAutoUnarchive: boolean;
    // AI time entry
    enableAiTimeEntry: boolean;
    customTemplate: string;
    customStatuses: string;
    proofreadNotes: boolean;
    aiProvider: 'anthropic' | 'openai' | 'google' | 'openrouter' | 'ollama' | 'manual';
    // Anthropic
    anthropicApiKey: string;
    anthropicModel: string;
    // OpenAI
    openaiApiKey: string;
    openaiModel: string;
    // Google AI
    googleApiKey: string;
    googleModel: string;
    // OpenRouter
    openrouterApiKey: string;
    openrouterModel: string;
    // Ollama (local)
    ollamaEndpoint: string;
    ollamaModel: string;
    // Manual mode
    manualDefaultHours: number;
    manualDefaultCategory: string;
    // Menu Options
    menuShowAiOrganize: boolean;
    menuShowSyncNote: boolean;
    menuShowAiTimeEntry: boolean;
    menuShowManualTimeEntry: boolean;
    menuShowChangeStatus: boolean;
    menuShowOpenInKantata: boolean;
    menuShowDeleteFromKantata: boolean;
    menuOrder: string[];
}

const DEFAULT_SETTINGS: KantataSettings = {
    kantataToken: '',
    apiBaseUrl: 'https://api.mavenlink.com/api/v1',
    customersFolder: '.',
    includeArchived: false,
    autoSyncFoldersOnStartup: false,
    enablePolling: false,
    pollingIntervalMinutes: 30,
    // Filter & Ignore
    filterByStatus: false,
    allowedStatuses: ['Active', 'In Progress', 'Not Started'],
    ignorePatterns: [],
    // Dashboard
    createDashboardNote: true,
    dashboardNoteName: '_index.md',
    showWorkspaceStatusInStatusBar: true,
    showRibbonIcons: false,
    refreshDashboardsOnPoll: false,
    // Auto-archive
    enableAutoArchive: false,
    archiveFolderName: '_Archive',
    archiveStatuses: ['Archived', 'Closed', 'Cancelled', 'Cancelled Confirmed', 'Completed', 'Delivered', 'Done', 'Submitted'],
    enableAutoUnarchive: false,
    // AI time entry
    enableAiTimeEntry: false,
    customTemplate: `==**Meeting Details**==
**Customer:** {{customer}}
**Work Session:** {{date}} @ {{time}}
**Our Attendees:**
**{{customer}} Attendees:**

==**Activities/Notes**==

**Accomplishments:**

**Issues:**

**Blockers:**

**Next Session:**
**Next Steps:**

---

<u>Internal Notes</u>
`,
    customStatuses: `gray:Approved,Confirmed,Contingent,Okay to Start,Pending,Ready,Scheduled,Tech Setup,Not Started
green:In Progress,UAT
yellow:At Risk,Issue,On Hold,Over Budget,Quality Control
red:Alert,Blocked,Cancelled - Change Order,Concern,Suspended,Terminated,Rejected
blue:Closed,Cancelled,Cancelled Confirmed,Completed,Delivered,Done,Submitted`,
    proofreadNotes: true,
    aiProvider: 'anthropic',
    // Anthropic
    anthropicApiKey: '',
    anthropicModel: 'claude-sonnet-4-20250514',
    // OpenAI
    openaiApiKey: '',
    openaiModel: 'gpt-4o',
    // Google AI
    googleApiKey: '',
    googleModel: 'gemini-2.0-flash',
    // OpenRouter
    openrouterApiKey: '',
    openrouterModel: 'anthropic/claude-sonnet-4',
    // Ollama
    ollamaEndpoint: 'http://localhost:11434',
    ollamaModel: 'llama3.2',
    // Manual
    manualDefaultHours: 1.0,
    manualDefaultCategory: 'Consulting',
    // Menu Options (all enabled by default)
    menuShowAiOrganize: true,
    menuShowSyncNote: true,
    menuShowAiTimeEntry: true,
    menuShowManualTimeEntry: true,
    menuShowChangeStatus: true,
    menuShowOpenInKantata: true,
    menuShowDeleteFromKantata: true,
    menuOrder: ['aiOrganize', 'syncNote', 'aiTimeEntry', 'manualTimeEntry', 'changeStatus', 'separator-1', 'openInKantata', 'deleteFromKantata'],
};

class WorkspacePickerModal extends FuzzySuggestModal<Workspace> {
    private workspaces: Workspace[];
    private customerName: string;
    public selectedWorkspace: Workspace | null = null;
    private resolvePromise: ((value: Workspace | null) => void) | null = null;

    constructor(app: App, workspaces: Workspace[], customerName: string) {
        super(app);
        this.workspaces = workspaces;
        this.customerName = customerName;
        this.setPlaceholder(`Select workspace for "${customerName}"...`);
    }

    getItems(): Workspace[] {
        return this.workspaces;
    }

    getItemText(item: Workspace): string {
        return item.title;
    }

    onChooseItem(item: Workspace, evt: MouseEvent | KeyboardEvent): void {
        this.selectedWorkspace = item;
    }

    onClose(): void {
        super.onClose();
        setTimeout(() => {
            if (this.resolvePromise) {
                this.resolvePromise(this.selectedWorkspace);
            }
        }, 50);
    }

    waitForSelection(): Promise<Workspace | null> {
        return new Promise((resolve) => {
            this.resolvePromise = resolve;
            this.open();
        });
    }
}

// Confirmation Modal (replaces native confirm() for Obsidian compliance)
class ConfirmModal extends Modal {
    private message: string;
    private onConfirm: () => void;
    private confirmText: string;
    private cancelText: string;

    constructor(app: App, message: string, onConfirm: () => void, confirmText = 'Confirm', cancelText = 'Cancel') {
        super(app);
        this.message = message;
        this.onConfirm = onConfirm;
        this.confirmText = confirmText;
        this.cancelText = cancelText;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('kantata-confirm-modal-content');

        contentEl.createEl('p', { text: this.message, cls: 'kantata-confirm-modal-message' });

        const buttonContainer = contentEl.createDiv({ cls: 'kantata-confirm-modal-buttons' });

        const cancelBtn = buttonContainer.createEl('button', { text: this.cancelText });
        cancelBtn.addEventListener('click', () => this.close());

        const confirmBtn = buttonContainer.createEl('button', { text: this.confirmText, cls: 'mod-warning' });
        confirmBtn.addEventListener('click', () => {
            this.onConfirm();
            this.close();
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// Manual time entry Modal
interface TaskOption {
    id: string;
    title: string;
}

class ManualTimeEntryModal extends Modal {
    private plugin: KantataSync;
    private workspaceId: string;
    private tasks: TaskOption[] = [];
    private selectedTaskId: string = '';
    private selectedHours: number = 1;
    private notes: string = '';
    private isEditMode: boolean = false;
    private existingEntryId: string = '';
    private onSubmit: (taskId: string, hours: number, notes: string) => void;
    private onUpdate: ((taskId: string, hours: number, notes: string) => void) | null = null;
    private onDelete: (() => void) | null = null;

    constructor(
        app: App, 
        plugin: KantataSync, 
        workspaceId: string, 
        tasks: TaskOption[], 
        onSubmit: (taskId: string, hours: number, notes: string) => void,
        existingEntry?: { id: string; hours: number; notes: string; storyId: string },
        onUpdate?: (taskId: string, hours: number, notes: string) => void,
        onDelete?: () => void
    ) {
        super(app);
        this.plugin = plugin;
        this.workspaceId = workspaceId;
        this.tasks = tasks;
        this.onSubmit = onSubmit;
        
        if (existingEntry) {
            this.isEditMode = true;
            this.existingEntryId = existingEntry.id;
            this.selectedHours = existingEntry.hours;
            this.notes = existingEntry.notes || '';
            this.selectedTaskId = existingEntry.storyId;
            this.onUpdate = onUpdate || null;
            this.onDelete = onDelete || null;
        } else if (tasks.length > 0) {
            this.selectedTaskId = tasks[0].id;
        }
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('kantata-time-entry-modal');

        contentEl.createDiv().createEl('div', { 
            text: this.isEditMode ? 'Edit time entry' : 'Create time entry',
            cls: 'modal-title'
        });

        // Task selection
        const taskSetting = contentEl.createDiv({ cls: 'setting-item' });
        taskSetting.createEl('div', { cls: 'setting-item-info' }).createEl('div', { cls: 'setting-item-name', text: 'Task' });
        const taskControl = taskSetting.createDiv({ cls: 'setting-item-control' });
        const taskSelect = taskControl.createEl('select', { cls: 'dropdown' });
        for (const task of this.tasks) {
            const option = taskSelect.createEl('option', { value: task.id, text: task.title });
            if (task.id === this.selectedTaskId) {
                option.selected = true;
            }
        }
        taskSelect.addEventListener('change', (e) => {
            this.selectedTaskId = (e.target as HTMLSelectElement).value;
        });

        // Time selection (15-minute increments)
        const timeSetting = contentEl.createDiv({ cls: 'setting-item' });
        timeSetting.createEl('div', { cls: 'setting-item-info' }).createEl('div', { cls: 'setting-item-name', text: 'Time' });
        const timeControl = timeSetting.createDiv({ cls: 'setting-item-control' });
        const timeSelect = timeControl.createEl('select', { cls: 'dropdown' });
        const timeOptions = [
            { value: 0.25, label: '15 minutes' },
            { value: 0.5, label: '30 minutes' },
            { value: 0.75, label: '45 minutes' },
            { value: 1, label: '1 hour' },
            { value: 1.25, label: '1 hr 15 min' },
            { value: 1.5, label: '1 hr 30 min' },
            { value: 1.75, label: '1 hr 45 min' },
            { value: 2, label: '2 hours' },
            { value: 2.5, label: '2 hr 30 min' },
            { value: 3, label: '3 hours' },
            { value: 3.5, label: '3 hr 30 min' },
            { value: 4, label: '4 hours' },
            { value: 4.5, label: '4 hr 30 min' },
            { value: 5, label: '5 hours' },
            { value: 5.5, label: '5 hr 30 min' },
            { value: 6, label: '6 hours' },
            { value: 6.5, label: '6 hr 30 min' },
            { value: 7, label: '7 hours' },
            { value: 7.5, label: '7 hr 30 min' },
            { value: 8, label: '8 hours' },
        ];
        for (const opt of timeOptions) {
            const option = timeSelect.createEl('option', { value: String(opt.value), text: opt.label });
            if (opt.value === this.selectedHours) {
                option.selected = true;
            }
        }
        timeSelect.addEventListener('change', (e) => {
            this.selectedHours = parseFloat((e.target as HTMLSelectElement).value);
        });

        // Notes field
        const notesSetting = contentEl.createDiv({ cls: 'setting-item' });
        const notesInfo = notesSetting.createEl('div', { cls: 'setting-item-info' });
        notesInfo.createEl('div', { cls: 'setting-item-name', text: 'Notes' });
        const notesControl = notesSetting.createDiv({ cls: 'setting-item-control' });
        const notesInput = notesControl.createEl('textarea', { 
            cls: 'kantata-notes-input kantata-modal-notes-input',
            attr: { rows: '4', placeholder: 'Describe work completed...' }
        });
        notesInput.value = this.notes; // Set existing value for edit mode
        notesInput.addEventListener('input', (e) => {
            this.notes = (e.target as HTMLTextAreaElement).value;
        });

        // AI Enhance button (only if AI is enabled)
        if (this.plugin.settings.enableAiTimeEntry && this.plugin.hasAiCredentials()) {
            const aiButtonContainer = contentEl.createDiv({ cls: 'setting-item kantata-modal-ai-button-container' });
            const aiBtn = aiButtonContainer.createEl('button', { text: '✨ AI: enhance notes', cls: 'kantata-modal-ai-button' });
            aiBtn.addEventListener('click', () => {
                if (!this.notes.trim()) {
                    new Notice('Enter some notes first');
                    return;
                }
                aiBtn.disabled = true;
                aiBtn.textContent = '✨ enhancing...';
                void (async () => {
                    try {
                        const enhanced = await this.plugin.proofreadForKantata(this.notes);
                        this.notes = enhanced;
                        notesInput.value = enhanced;
                        new Notice('✅ notes enhanced!');
                    } catch (err) {
                        const e = err as Error;
                        new Notice(`❌ AI failed: ${e.message}`);
                    } finally {
                        aiBtn.disabled = false;
                        aiBtn.textContent = '✨ AI: enhance notes';
                    }
                })();
            });
        }

        // Submit button
        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container kantata-modal-button-container' });

        // Delete button (edit mode only)
        if (this.isEditMode && this.onDelete) {
            const deleteBtn = buttonContainer.createEl('button', { text: 'Delete', cls: 'mod-warning' });
            deleteBtn.addClass('kantata-modal-delete-btn');
            deleteBtn.addEventListener('click', () => {
                new ConfirmModal(this.app, 'Delete this time entry? This cannot be undone.', () => {
                    this.onDelete!();
                    this.close();
                }, 'Delete', 'Cancel').open();
            });
        }

        const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
        cancelBtn.addEventListener('click', () => this.close());

        const submitBtn = buttonContainer.createEl('button', { 
            text: this.isEditMode ? 'Update time entry' : 'Create time entry', 
            cls: 'mod-cta' 
        });
        submitBtn.addEventListener('click', () => {
            if (!this.selectedTaskId) {
                new Notice('Please select a task');
                return;
            }
            if (!this.notes.trim()) {
                new Notice('Please enter notes');
                return;
            }
            if (this.isEditMode && this.onUpdate) {
                this.onUpdate(this.selectedTaskId, this.selectedHours, this.notes.trim());
            } else {
                this.onSubmit(this.selectedTaskId, this.selectedHours, this.notes.trim());
            }
            this.close();
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// Status Change Modal
interface StatusOption {
    key: string;
    message: string;
    color: string;
}

class StatusChangeModal extends Modal {
    private statuses: StatusOption[] = [];
    private currentStatus: string = '';
    private onSelect: (status: StatusOption) => void;

    constructor(app: App, statuses: StatusOption[], currentStatus: string, onSelect: (status: StatusOption) => void) {
        super(app);
        this.statuses = statuses;
        this.currentStatus = currentStatus;
        this.onSelect = onSelect;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createDiv().createEl('div', { 
            text: 'Change project status',
            cls: 'modal-title'
        });
        contentEl.createEl('p', { text: `Current: ${this.currentStatus}`, cls: 'setting-item-description' });

        const listEl = contentEl.createDiv({ cls: 'kantata-status-list kantata-workspace-list' });

        for (const status of this.statuses) {
            const btn = listEl.createEl('button', { 
                text: `${this.getStatusEmoji(status.color)} ${status.message}`,
                cls: `kantata-workspace-btn ${status.message === this.currentStatus ? 'mod-cta' : ''}`
            });
            btn.addEventListener('click', () => {
                this.onSelect(status);
                this.close();
            });
        }
    }

    getStatusEmoji(color: string): string {
        switch (color?.toLowerCase()) {
            case 'green': return '🟢';
            case 'yellow': return '🟡';
            case 'red': return '🔴';
            case 'blue': return '🔵';
            case 'orange': return '🟠';
            case 'purple': return '🟣';
            default: return '⚪';
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export default class KantataSync extends Plugin {
    settings: KantataSettings;
    workspaceCache: Record<string, WorkspaceCacheEntry> = {};
    statusBarItem: HTMLElement;
    private pollingIntervalId: ReturnType<typeof setInterval> | null = null;
    private ribbonNoteIcon: HTMLElement | null = null;
    private ribbonTimeIcon: HTMLElement | null = null;
    private lastTimeEntry: { id: string; workspaceId: string; data: Record<string, unknown> } | null = null;
    private isSyncing = false;  // Prevent duplicate submissions
    private debounceTimeout: ReturnType<typeof setTimeout> | null = null;
    
    // Cache TTL: 24 hours
    private readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000;

    // Secret storage keys
    private readonly SECRET_KEYS = {
        kantataToken: 'kantata-token',
        anthropicApiKey: 'anthropic-api-key',
        openaiApiKey: 'openai-api-key',
        googleApiKey: 'google-api-key',
        openrouterApiKey: 'openrouter-api-key',
    } as const;

    /**
     * Get a secret from SecretStorage
     */
    getSecret(key: keyof typeof this.SECRET_KEYS): string | null {
        return this.app.secretStorage.getSecret(this.SECRET_KEYS[key]);
    }

    /**
     * Set a secret in SecretStorage
     */
    setSecret(key: keyof typeof this.SECRET_KEYS, value: string): void {
        if (value) {
            this.app.secretStorage.setSecret(this.SECRET_KEYS[key], value);
        }
    }

    /**
     * Migrate API keys from settings to SecretStorage (one-time migration)
     */
    private async migrateSecretsToStorage(): Promise<void> {
        let migrated = false;
        
        for (const [settingsKey, storageKey] of Object.entries(this.SECRET_KEYS)) {
            const settingsValue = (this.settings as Record<string, unknown>)[settingsKey] as string;
            const storedValue = this.app.secretStorage.getSecret(storageKey);
            
            if (settingsValue && !storedValue) {
                this.app.secretStorage.setSecret(storageKey, settingsValue);
                (this.settings as Record<string, unknown>)[settingsKey] = '';
                migrated = true;
                console.debug(`[KantataSync] Migrated ${settingsKey} to SecretStorage`);
            }
        }
        
        if (migrated) {
            await this.saveSettings();
            // eslint-disable-next-line obsidianmd/ui/sentence-case
            new Notice('🔐 KantataSync: API keys migrated to secure storage');
        }
    }

    /**
     * Check if a cache entry is still valid (not expired)
     */
    private isCacheValid(entry: WorkspaceCacheEntry): boolean {
        if (!entry.cachedAt) return false;
        const age = Date.now() - new Date(entry.cachedAt).getTime();
        return age < this.CACHE_TTL_MS;
    }

    /**
     * Sanitize workspace name for use as folder name
     * Removes/replaces characters that are invalid in file paths
     */
    private sanitizeFolderName(name: string): string {
        return name
            .replace(/[/\\:*?"<>|]/g, '-')  // Replace invalid path chars with dash
            .replace(/\.+$/g, '')             // Remove trailing dots (Windows issue)
            .replace(/\s+/g, ' ')             // Normalize whitespace
            .trim();
    }

    async onload(): Promise<void> {
        await this.loadSettings();
        await this.migrateSecretsToStorage();
        await this.loadWorkspaceCache();
        await this.cleanupStaleCache();  // Remove entries for deleted folders

        // Setup ribbon icons if enabled
        this.setupRibbonIcons();

        // Commands
        this.addCommand({
            id: 'sync-current-note',
            // eslint-disable-next-line obsidianmd/ui/sentence-case
            name: 'Sync current note to Kantata',
            editorCallback: (editor, view) => {
                void this.syncCurrentNote();
            }
        });

        this.addCommand({
            id: 'open-in-kantata',
            // eslint-disable-next-line obsidianmd/ui/sentence-case
            name: 'Open workspace in Kantata',
            callback: () => {
                void this.openInKantata();
            }
        });

        this.addCommand({
            id: 'link-folder',
            name: 'Link folder to workspace',
            callback: () => {
                void this.linkFolder();
            }
        });

        this.addCommand({
            id: 'unlink-folder',
            name: 'Unlink folder from workspace',
            callback: () => {
                void this.unlinkFolder();
            }
        });

        this.addCommand({
            id: 'sync-workspaces',
            // eslint-disable-next-line obsidianmd/ui/sentence-case
            name: 'Sync workspaces from Kantata',
            callback: () => {
                void this.syncWorkspaces(true);
            }
        });

        this.addCommand({
            id: 'refresh-dashboard',
            name: 'Refresh dashboard for current folder',
            callback: () => {
                void this.refreshCurrentDashboard();
            }
        });

        this.addCommand({
            id: 'refresh-all-dashboards',
            name: 'Refresh all dashboards',
            callback: () => {
                void this.refreshAllDashboards();
            }
        });

        this.addCommand({
            id: 'create-time-entry',
            name: 'AI: create time entry for current note',
            editorCallback: (editor, view) => {
                void this.createTimeEntryForCurrentNote();
            }
        });

        this.addCommand({
            id: 'undo-time-entry',
            name: 'Undo last time entry',
            callback: () => {
                void this.undoLastTimeEntry();
            }
        });

        this.addCommand({
            id: 'manual-time-entry',
            name: 'Time entry (create/edit)',
            callback: () => {
                void this.openManualTimeEntryModal();
            }
        });

        this.addCommand({
            id: 'organize-notes',
            name: 'AI: organize notes into template',
            editorCallback: (editor, view) => {
                void this.organizeCurrentNote(editor);
            }
        });

        // Status bar
        this.statusBarItem = this.addStatusBarItem();
        this.statusBarItem.addClass('obsidianlink-status');
        this.statusBarItem.onClickEvent((evt: MouseEvent) => { void (async () => {
            // Get current file state for context-aware menu
            const file = this.app.workspace.getActiveFile();
            let isSynced = false;
            let hasTimeEntry = false;
            
            if (file && file.extension === 'md') {
                try {
                    const content = await this.app.vault.read(file);
                    const { frontmatter } = this.parseFrontmatter(content);
                    isSynced = frontmatter.kantata_synced === true || frontmatter.kantata_synced === 'true';
                    hasTimeEntry = !!frontmatter.kantata_time_entry_id;
                } catch { /* ignore */ }
            }
            
            // Show menu with context-aware options
            const menu = new Menu();
            
            // Menu item builders - each returns true if item was added
            const menuBuilders: Record<string, () => boolean> = {
                aiOrganize: () => {
                    if (this.settings.menuShowAiOrganize && this.settings.enableAiTimeEntry) {
                        menu.addItem((item) => {
                            item.setTitle('✨ AI: organize notes')
                                .onClick(() => {
                                    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                                    if (view?.editor) {
                                        void this.organizeCurrentNote(view.editor);
                                    } else {
                                        new Notice('Open a Markdown file first');
                                    }
                                });
                        });
                        return true;
                    }
                    return false;
                },
                syncNote: () => {
                    if (this.settings.menuShowSyncNote) {
                        menu.addItem((item) => {
                            const title = isSynced ? '📝 Update in Kantata' : '📝 Sync in Kantata';
                            item.setTitle(title)
                                .onClick(() => {
                                    void this.syncCurrentNote();
                                });
                        });
                        return true;
                    }
                    return false;
                },
                aiTimeEntry: () => {
                    if (this.settings.menuShowAiTimeEntry && this.settings.enableAiTimeEntry) {
                        if (hasTimeEntry) {
                            menu.addItem((item) => {
                                item.setTitle('⏱️ AI: update time entry')
                                    .onClick(() => {
                                        void this.updateTimeEntryWithAI();
                                    });
                            });
                        } else {
                            menu.addItem((item) => {
                            item.setTitle('⏱️ AI: create time entry')
                                    .onClick(() => {
                                        void this.createTimeEntryForCurrentNote();
                                    });
                            });
                        }
                        return true;
                    }
                    return false;
                },
                manualTimeEntry: () => {
                    if (this.settings.menuShowManualTimeEntry) {
                        menu.addItem((item) => {
                            const title = hasTimeEntry ? '⏱️ Edit time entry' : '⏱️ Create time entry';
                            item.setTitle(title)
                                .onClick(() => {
                                    void this.openManualTimeEntryModal();
                                });
                        });
                        return true;
                    }
                    return false;
                },
                changeStatus: () => {
                    if (this.settings.menuShowChangeStatus) {
                        menu.addItem((item) => {
                            item.setTitle('🎯 change project status')
                                .onClick(() => {
                                    void this.openStatusChangeModal();
                                });
                        });
                        return true;
                    }
                    return false;
                },
                openInKantata: () => {
                    if (this.settings.menuShowOpenInKantata) {
                        menu.addItem((item) => {
                            // eslint-disable-next-line obsidianmd/ui/sentence-case
                            item.setTitle('🔗 open in Kantata')
                                .onClick(() => {
                                    void this.openInKantata();
                                });
                        });
                        return true;
                    }
                    return false;
                },
                deleteFromKantata: () => {
                    if (this.settings.menuShowDeleteFromKantata && isSynced) {
                        menu.addItem((item) => {
                            // eslint-disable-next-line obsidianmd/ui/sentence-case
                            item.setTitle('🗑️ delete from Kantata')
                                .onClick(() => {
                                    void this.deleteFromKantata();
                                });
                        });
                        return true;
                    }
                    return false;
                },
            };

            // Build menu in user-defined order
            const order = this.settings.menuOrder || Object.keys(menuBuilders);
            for (const key of order) {
                if (key.startsWith('separator-')) {
                    menu.addSeparator();
                } else if (menuBuilders[key]) {
                    menuBuilders[key]();
                }
            }
            
            menu.showAtMouseEvent(evt);
        })(); });
        void this.updateStatusBar('Note ⚪ · Time ⚪', 'Click for options');

        // File event handlers
        this.registerEvent(this.app.workspace.on('file-open', (file) => {
            void (async () => {
                await this.updateStatusBarForFile(file);
                await this.updateRibbonIcons(file);
            })();
        }));

        this.registerEvent(this.app.vault.on('modify', (file) => {
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile && file.path === activeFile.path) {
                if (this.debounceTimeout) clearTimeout(this.debounceTimeout);
                this.debounceTimeout = setTimeout(() => {
                    void (async () => {
                        await this.updateStatusBarForFile(activeFile);
                        await this.updateRibbonIcons(activeFile);
                    })();
                }, 1000);
            }
        }));

        // Settings tab
        this.addSettingTab(new KantataSettingTab(this.app, this));

        // Auto-sync on startup
        if (this.settings.autoSyncFoldersOnStartup && this.getSecret('kantataToken')) {
            setTimeout(() => {
                void this.autoSyncFolders();
            }, 3000);
        }

        // Start polling if enabled
        this.setupPolling();
    }

    onunload(): void {
        this.stopPolling();
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
            this.debounceTimeout = null;
        }
    }

    // ==================== POLLING ====================

    setupPolling(): void {
        this.stopPolling();
        
        if (this.settings.enablePolling && this.getSecret('kantataToken')) {
            const intervalMs = this.settings.pollingIntervalMinutes * 60 * 1000;
            console.debug(`[KantataSync] Starting polling every ${this.settings.pollingIntervalMinutes} minutes`);
            
            this.pollingIntervalId = setInterval(() => {
                void this.syncWorkspaces(false);
            }, intervalMs);
        }
    }

    stopPolling(): void {
        if (this.pollingIntervalId) {
            clearInterval(this.pollingIntervalId);
            this.pollingIntervalId = null;
            console.debug('[KantataSync] Polling stopped');
        }
    }

    // ==================== FILTERING ====================

    /**
     * Check if a workspace name matches any ignore pattern
     * Supports wildcards: * (any chars), ? (single char)
     * Variables: {status} replaced with workspace status
     */
    matchesIgnorePattern(workspaceName: string, status: string): boolean {
        for (const pattern of this.settings.ignorePatterns) {
            if (!pattern.trim()) continue;
            
            // Replace variables
            let processedPattern = pattern
                .replace(/\{status\}/gi, status)
                .trim();
            
            // Convert glob to regex: * -> .*, ? -> .
            const regexPattern = processedPattern
                .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape regex special chars except * and ?
                .replace(/\*/g, '.*')
                .replace(/\?/g, '.');
            
            const regex = new RegExp(`^${regexPattern}$`, 'i');
            if (regex.test(workspaceName)) {
                console.debug(`[KantataSync] Ignoring "${workspaceName}" - matches pattern "${pattern}"`);
                return true;
            }
        }
        return false;
    }

    /**
     * Check if a workspace should be included based on filters
     */
    shouldIncludeWorkspace(workspace: Workspace): boolean {
        const status = workspace.status || 'No Status';
        
        // Check status filter
        if (this.settings.filterByStatus) {
            if (!this.settings.allowedStatuses.includes(status)) {
                console.debug(`[KantataSync] Skipping "${workspace.title}" - status "${status}" not in allowed list`);
                return false;
            }
        }
        
        // Check ignore patterns
        if (this.matchesIgnorePattern(workspace.title, status)) {
            return false;
        }
        
        return true;
    }

    async syncWorkspaces(showNotice = false): Promise<void> {
        if (!this.getSecret('kantataToken')) {
            // eslint-disable-next-line obsidianmd/ui/sentence-case
            if (showNotice) new Notice('❌ no Kantata token configured');
            console.debug('[KantataSync] Sync skipped - no token');
            return;
        }

        if (showNotice) {
            // eslint-disable-next-line obsidianmd/ui/sentence-case
            new Notice('Syncing workspaces from Kantata...');
            void this.updateStatusBar('📝 Note Sync: ⏳ Syncing...', 'Fetching workspaces from Kantata');
        }
        console.debug('[KantataSync] Syncing workspaces...');
        
        try {
            // Clean up stale cache entries first
            await this.cleanupStaleCache();
            
            const workspaces = await this.fetchAllWorkspaces();
            
            // Get existing folder names (lowercase for comparison)
            const existingFolders = new Set<string>();
            const baseFolder = this.settings.customersFolder === '.' 
                ? this.app.vault.getRoot() 
                : this.app.vault.getAbstractFileByPath(this.settings.customersFolder);
            
            if (baseFolder instanceof TFolder && baseFolder.children) {
                for (const child of baseFolder.children) {
                    if (child instanceof TFolder) {
                        existingFolders.add(child.name.toLowerCase());
                    }
                }
            } else if (this.settings.customersFolder === '.') {
                // Fallback for root
                const root = this.app.vault.getRoot();
                if (root.children) {
                    for (const child of root.children) {
                        if (child instanceof TFolder) {
                            existingFolders.add(child.name.toLowerCase());
                        }
                    }
                }
            }

            let created = 0;
            let linked = 0;
            let alreadyLinked = 0;
            let filtered = 0;

            // Build a map of workspace IDs to their cache paths (for validation)
            const linkedWorkspaceIds = new Map<string, string>(); // workspaceId -> folderPath
            for (const [folderPath, cached] of Object.entries(this.workspaceCache)) {
                linkedWorkspaceIds.set(cached.workspaceId, folderPath);
            }

            for (const workspace of workspaces) {
                // Apply filters
                if (!this.shouldIncludeWorkspace(workspace)) {
                    filtered++;
                    continue;
                }
                
                const folderName = this.sanitizeFolderName(workspace.title);
                const folderNameLower = folderName.toLowerCase();

                // Check if workspace is already linked to any folder (including archived)
                if (linkedWorkspaceIds.has(workspace.id)) {
                    const cachedFolderPath = linkedWorkspaceIds.get(workspace.id)!;
                    
                    // Verify the folder actually exists
                    const folderExists = this.app.vault.getAbstractFileByPath(cachedFolderPath) instanceof TFolder;
                    
                    if (folderExists) {
                        alreadyLinked++;
                        // Update status in cache for this workspace
                        const cached = this.workspaceCache[cachedFolderPath];
                        if (cached) {
                            cached.workspaceStatus = workspace.status;
                            cached.workspaceStatusColor = workspace.statusColor;
                        }
                        continue;
                    } else {
                        // Folder was deleted - remove orphan cache entry
                        console.debug(`[KantataSync] Removing orphan cache entry for "${cachedFolderPath}" (folder no longer exists)`);
                        delete this.workspaceCache[cachedFolderPath];
                        linkedWorkspaceIds.delete(workspace.id);
                        // Fall through to create the folder
                    }
                }

                if (existingFolders.has(folderNameLower)) {
                    // Folder exists but not linked - link it
                    // Build full path with customersFolder prefix
                    const fullFolderPath = this.settings.customersFolder === '.' 
                        ? folderName 
                        : `${this.settings.customersFolder}/${folderName}`;
                    
                    this.workspaceCache[fullFolderPath] = {
                        workspaceId: workspace.id,
                        workspaceTitle: workspace.title,
                        workspaceStatus: workspace.status,
                        workspaceStatusColor: workspace.statusColor,
                        cachedAt: new Date().toISOString()
                    };
                    linkedWorkspaceIds.set(workspace.id, fullFolderPath);
                    linked++;
                    continue;
                }

                // Create new folder
                try {
                    // Build full path with customersFolder prefix
                    const fullFolderPath = this.settings.customersFolder === '.' 
                        ? folderName 
                        : `${this.settings.customersFolder}/${folderName}`;
                    
                    await this.app.vault.createFolder(fullFolderPath);
                    existingFolders.add(folderNameLower);
                    
                    // Create dashboard note
                    await this.createDashboardNote(fullFolderPath, workspace.id);
                    this.workspaceCache[fullFolderPath] = {
                        workspaceId: workspace.id,
                        workspaceTitle: workspace.title,
                        workspaceStatus: workspace.status,
                        workspaceStatusColor: workspace.statusColor,
                        cachedAt: new Date().toISOString()
                    };
                    linkedWorkspaceIds.set(workspace.id, fullFolderPath);
                    created++;
                    console.debug(`[KantataSync] Created folder: ${fullFolderPath}`);
                } catch {
                    // Folder might already exist with different case
                }
            }

            await this.saveWorkspaceCache();

            // Build result message
            const parts: string[] = [];
            if (created > 0) parts.push(`${created} created and linked`);
            if (linked > 0) parts.push(`${linked} existing folder(s) linked`);
            if (alreadyLinked > 0) parts.push(`${alreadyLinked} already linked`);
            if (filtered > 0) parts.push(`${filtered} filtered out`);

            if (showNotice) {
                if (parts.length > 0) {
                    new Notice(`✅ Sync complete: ${parts.join(', ')}`);
                } else {
                    new Notice('✅ sync complete: no changes');
                }
                void this.updateStatusBar('📝 Note Sync: ✅ Complete', 'Workspace sync complete');
                setTimeout(() => {
                    const file = this.app.workspace.getActiveFile();
                    void this.updateStatusBarForFile(file);
                }, 3000);
            } else if (created > 0 || linked > 0) {
                new Notice(`📁 KantataSync: ${parts.filter(p => !p.includes('already') && !p.includes('filtered')).join(', ')}`);
            }
            
            console.debug(`[KantataSync] Sync complete: ${parts.join(', ')}`);

            // Refresh dashboards if enabled (with delay to prevent layout thrashing)
            if (this.settings.refreshDashboardsOnPoll && this.settings.createDashboardNote) {
                console.debug('[KantataSync] Refreshing dashboards...');
                let refreshed = 0;
                const entries = Object.entries(this.workspaceCache);
                for (let i = 0; i < entries.length; i++) {
                    const [folderName, cached] = entries[i];
                    const success = await this.updateDashboardNote(folderName, cached.workspaceId);
                    if (success) refreshed++;
                    // Small delay between updates to prevent forced reflow
                    if (i < entries.length - 1) {
                        await new Promise(r => setTimeout(r, 50));
                    }
                }
                if (refreshed > 0) {
                    console.debug(`[KantataSync] Refreshed ${refreshed} dashboards`);
                }
            }

            // Auto-archive folders with matching statuses
            if (this.settings.enableAutoArchive && this.settings.archiveStatuses.length > 0) {
                await this.checkAndArchiveFolders(showNotice);
            }
        } catch (err) { const e = err as Error;
            console.warn('[KantataSync] Sync failed:', e);
            if (showNotice) {
                new Notice(`❌ Sync failed: ${e.message}`);
                void this.updateStatusBar('📝 Note Sync: ❌ Failed', 'Workspace sync failed');
            }
        }
    }

    // ==================== AUTO-ARCHIVE ====================

    async fetchWorkspaceStatus(workspaceId: string): Promise<{ status: string; statusColor: string; deleted?: boolean; isArchived?: boolean } | null> {
        try {
            const response = await this.apiRequest(`/workspaces/${workspaceId}.json`);
            const workspace = Object.values(response.workspaces || {})[0] as Record<string, unknown> | undefined;
            if (!workspace) return null;
            const wsStatus = workspace.status as Record<string, string> | undefined;
            return {
                status: wsStatus?.message || 'Active',
                statusColor: wsStatus?.color || 'gray',
                isArchived: workspace.archived === true  // Kantata's archived boolean flag
            };
        } catch (err) { const e = err as Error;
            // 404 means workspace was deleted from Kantata
            if ((e as Record<string, unknown>).status === 404) {
                console.debug(`[KantataSync] Workspace ${workspaceId} was deleted from Kantata (404)`);
                return { status: 'DELETED', statusColor: 'gray', deleted: true };
            }
            console.warn(`[KantataSync] Could not fetch status for workspace ${workspaceId}:`, e);
            return null;
        }
    }

    async checkAndArchiveFolders(showNotice: boolean): Promise<void> {
        console.debug('[KantataSync] Checking for folders to archive/unarchive...');
        
        const archiveFolder = this.settings.archiveFolderName;
        let archived = 0;
        let unarchived = 0;

        // Ensure archive folder exists
        const archiveFolderExists = await this.app.vault.adapter.exists(archiveFolder);
        if (!archiveFolderExists) {
            try {
                await this.app.vault.createFolder(archiveFolder);
                console.debug(`[KantataSync] Created archive folder: ${archiveFolder}`);
            } catch (e) {
                console.warn(`[KantataSync] Could not create archive folder:`, e);
                return;
            }
        }

        // Check each cached workspace
        const entries = Object.entries(this.workspaceCache);
        for (const [folderName, cached] of entries) {
            const isInArchive = folderName.startsWith(archiveFolder + '/');
            
            // Check if folder exists
            const folderExists = await this.app.vault.adapter.exists(folderName);
            if (!folderExists) {
                continue;
            }

            // Fetch current status from Kantata
            const statusInfo = await this.fetchWorkspaceStatus(cached.workspaceId);
            if (!statusInfo) continue;

            // Handle deleted workspaces: archive folder and remove linkage
            if (statusInfo.deleted) {
                const newPath = isInArchive ? folderName : `${archiveFolder}/${folderName}`;
                
                try {
                    // Move to archive if not already there
                    if (!isInArchive) {
                        await this.app.vault.rename(
                            this.app.vault.getAbstractFileByPath(folderName)!,
                            newPath
                        );
                        console.debug(`[KantataSync] Archived deleted workspace: ${folderName} → ${newPath}`);
                        archived++;
                    }
                    
                    // Remove linkage from cache
                    delete this.workspaceCache[folderName];
                    console.debug(`[KantataSync] Unlinked deleted workspace: ${cached.workspaceTitle} (${cached.workspaceId})`);
                } catch (e) {
                    console.warn(`[KantataSync] Could not handle deleted workspace "${folderName}":`, e);
                }
                continue;
            }

            // Update cache with current status
            cached.workspaceStatus = statusInfo.status;
            cached.workspaceStatusColor = statusInfo.statusColor;

            // Check both: Kantata's archived flag OR status in our archive list
            const shouldBeArchived = statusInfo.isArchived || this.settings.archiveStatuses.includes(statusInfo.status);

            // Archive: folder not in archive but should be (archived flag or status match)
            if (!isInArchive && shouldBeArchived) {
                const newPath = `${archiveFolder}/${folderName}`;
                
                try {
                    // Move the folder
                    await this.app.vault.rename(
                        this.app.vault.getAbstractFileByPath(folderName)!,
                        newPath
                    );
                    
                    // Update cache with new path
                    delete this.workspaceCache[folderName];
                    this.workspaceCache[newPath] = {
                        ...cached,
                        cachedAt: new Date().toISOString()
                    };
                    
                    archived++;
                    const reason = statusInfo.isArchived ? 'archived in Kantata' : `status: ${statusInfo.status}`;
                    console.debug(`[KantataSync] Archived: ${folderName} → ${newPath} (${reason})`);
                } catch (e) {
                    console.warn(`[KantataSync] Could not archive folder "${folderName}":`, e);
                }
            }
            // Unarchive: folder in archive but shouldn't be (not archived and status not in list)
            else if (isInArchive && !shouldBeArchived && this.settings.enableAutoUnarchive) {
                // Extract original folder name from archive path
                const originalName = folderName.replace(archiveFolder + '/', '');
                
                try {
                    // Move the folder back out of archive
                    await this.app.vault.rename(
                        this.app.vault.getAbstractFileByPath(folderName)!,
                        originalName
                    );
                    
                    // Update cache with new path
                    delete this.workspaceCache[folderName];
                    this.workspaceCache[originalName] = {
                        ...cached,
                        cachedAt: new Date().toISOString()
                    };
                    
                    unarchived++;
                    console.debug(`[KantataSync] Unarchived: ${folderName} → ${originalName} (status: ${statusInfo.status})`);
                } catch (e) {
                    console.warn(`[KantataSync] Could not unarchive folder "${folderName}":`, e);
                }
            }
        }

        await this.saveWorkspaceCache();

        const messages: string[] = [];
        if (archived > 0) {
            messages.push(`📦 Archived ${archived} folder(s)`);
        }
        if (unarchived > 0) {
            messages.push(`📂 Unarchived ${unarchived} folder(s)`);
        }
        
        if (messages.length > 0) {
            const msg = messages.join(', ');
            if (showNotice) {
                new Notice(msg);
            }
            console.debug(`[KantataSync] ${msg}`);
        } else {
            console.debug('[KantataSync] No folders to archive/unarchive');
        }
    }

    async fetchAllStatusesFromLinkedWorkspaces(): Promise<string[]> {
        const statuses = new Set<string>();
        
        for (const [, cached] of Object.entries(this.workspaceCache)) {
            const statusInfo = await this.fetchWorkspaceStatus(cached.workspaceId);
            if (statusInfo) {
                statuses.add(statusInfo.status);
            }
        }
        
        // Also fetch from all workspaces API to get statuses we might not have locally
        try {
            // Fetch with include_archived to get all possible statuses
            const response = await this.apiRequest('/workspaces.json?per_page=200&include_archived=true');
            const workspaces = Object.values(response.workspaces || {}) as KantataWorkspaceRaw[];
            for (const w of workspaces) {
                if (w.status?.message) {
                    statuses.add(w.status.message);
                }
            }
        } catch (e) {
            console.warn('[KantataSync] Could not fetch all statuses:', e);
        }
        
        return [...statuses].sort();
    }

    // ==================== SETTINGS ====================

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<typeof DEFAULT_SETTINGS>);
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }

    // ==================== CACHE ====================

    async loadWorkspaceCache(): Promise<void> {
        try {
            const exists = await this.app.vault.adapter.exists('.kantatasync-cache.json');
            if (exists) {
                const data = await this.app.vault.adapter.read('.kantatasync-cache.json');
                this.workspaceCache = JSON.parse(data) as Record<string, { workspaceId: string; workspaceTitle: string; cachedAt: string }>;
                console.debug('[KantataSync] Cache loaded:', Object.keys(this.workspaceCache).length, 'entries');
            }
        } catch (e) {
            console.warn('[KantataSync] Failed to load cache:', e);
            this.workspaceCache = {};
        }
    }

    async saveWorkspaceCache(): Promise<void> {
        const data = JSON.stringify(this.workspaceCache, null, 2);
        try {
            await this.app.vault.adapter.write('.kantatasync-cache.json', data);
        } catch (e) {
            console.warn('[KantataSync] Could not persist workspace cache:', e);
        }
    }

    /**
     * Remove cache entries where the folder no longer exists.
     * Called on load and before sync to keep cache clean.
     */
    async cleanupStaleCache(): Promise<number> {
        let removed = 0;
        const entries = Object.entries(this.workspaceCache);
        
        for (const [folderPath] of entries) {
            const folderExists = await this.app.vault.adapter.exists(folderPath);
            if (!folderExists) {
                console.debug(`[KantataSync] Removing stale cache entry: "${folderPath}" (folder no longer exists)`);
                delete this.workspaceCache[folderPath];
                removed++;
            }
        }
        
        if (removed > 0) {
            await this.saveWorkspaceCache();
            console.debug(`[KantataSync] Cleaned up ${removed} stale cache entries`);
        }
        
        return removed;
    }

    // ==================== STATUS BAR ====================

    updateStatusBar(text: string, tooltip?: string): void {
        this.statusBarItem.setText(text);
        if (tooltip) {
            this.statusBarItem.setAttr('aria-label', tooltip);
        }
    }

    /**
     * Setup ribbon icons (if enabled in settings)
     */
    setupRibbonIcons(): void {
        // Remove existing ribbon icons
        if (this.ribbonNoteIcon) {
            this.ribbonNoteIcon.remove();
            this.ribbonNoteIcon = null;
        }
        if (this.ribbonTimeIcon) {
            this.ribbonTimeIcon.remove();
            this.ribbonTimeIcon = null;
        }

        if (!this.settings.showRibbonIcons) {
            return;
        }

        // Note sync icon
        // eslint-disable-next-line obsidianmd/ui/sentence-case
        this.ribbonNoteIcon = this.addRibbonIcon('file-up', 'Sync note to Kantata', () => {
            void this.syncCurrentNote();
        });
        this.ribbonNoteIcon.addClass('kantata-ribbon-icon', 'kantata-ribbon-note');

        // Time entry icon
        this.ribbonTimeIcon = this.addRibbonIcon('clock', 'Time entry (create/edit)', () => {
            void this.openManualTimeEntryModal();
        });
        this.ribbonTimeIcon.addClass('kantata-ribbon-icon', 'kantata-ribbon-time');

        // Initial update
        const file = this.app.workspace.getActiveFile();
        void this.updateRibbonIcons(file);
    }

    /**
     * Update ribbon icon colors based on file status
     */
    async updateRibbonIcons(file: TFile | null): Promise<void> {
        if (!this.settings.showRibbonIcons) return;
        if (!this.ribbonNoteIcon || !this.ribbonTimeIcon) return;

        // Default: gray (no file or not in linked folder)
        let noteStatus: 'synced' | 'pending' | 'none' = 'none';
        let timeStatus: 'logged' | 'none' = 'none';

        if (file && file.extension === 'md') {
            try {
                const content = await this.app.vault.read(file);
                const { frontmatter } = this.parseFrontmatter(content);
                
                const isSynced = frontmatter.kantata_synced === true || frontmatter.kantata_synced === 'true';
                const syncedAt = frontmatter.kantata_synced_at as string | undefined;
                const hasTimeEntry = !!frontmatter.kantata_time_entry_id;

                if (isSynced && syncedAt) {
                    const syncTime = new Date(syncedAt).getTime();
                    noteStatus = file.stat.mtime > syncTime + 2000 ? 'pending' : 'synced';
                }
                
                timeStatus = hasTimeEntry ? 'logged' : 'none';
            } catch {
                // Ignore errors
            }
        }

        // Update note icon
        this.ribbonNoteIcon.removeClass('kantata-status-synced', 'kantata-status-pending', 'kantata-status-none');
        this.ribbonNoteIcon.addClass(`kantata-status-${noteStatus}`);
        this.ribbonNoteIcon.setAttr('aria-label', `Sync note (${noteStatus === 'synced' ? '✅ Synced' : noteStatus === 'pending' ? '🔄 Pending' : '⚪ Not synced'})`);

        // Update time icon
        this.ribbonTimeIcon.removeClass('kantata-status-logged', 'kantata-status-none');
        this.ribbonTimeIcon.addClass(`kantata-status-${timeStatus === 'logged' ? 'synced' : 'none'}`);
        this.ribbonTimeIcon.setAttr('aria-label', `Time entry (${timeStatus === 'logged' ? '✅ Logged' : '⚪ No entry'})`);
    }

    async updateStatusBarForFile(file: TFile | null): Promise<void> {
        if (!file || file.extension !== 'md') {
            void this.updateStatusBar('📝 Note Sync: ⚪', 'No note open');
            return;
        }

        if (file.path.includes('aaaTemplates')) {
            void this.updateStatusBar('📝 Note Sync: ⚪', 'Template file');
            return;
        }

        try {
            const content = await this.app.vault.read(file);
            const { frontmatter } = this.parseFrontmatter(content);

            const isSynced = frontmatter.kantata_synced === true || frontmatter.kantata_synced === 'true';
            const syncedAt = frontmatter.kantata_synced_at as string | undefined;
            
            // Time entry status (always show - manual entry always available)
            const hasTimeEntry = !!frontmatter.kantata_time_entry_id;
            const timeStatus = hasTimeEntry ? '✅' : '⚪';
            const timeStatusText = ` · Time ${timeStatus}`;
            const timeTooltip = hasTimeEntry ? ' | Time logged' : ' | No time entry';

            // Get workspace status if enabled
            let projectStatusText = '';
            if (this.settings.showWorkspaceStatusInStatusBar) {
                const cacheResult = this.findCacheEntry(file);
                if (cacheResult?.entry.workspaceStatus) {
                    const statusEmoji = this.getStatusEmoji(cacheResult.entry.workspaceStatusColor || 'gray');
                    projectStatusText = ` · ${statusEmoji} ${cacheResult.entry.workspaceStatus}`;
                }
            }

            let noteStatus: string;
            let tooltip: string;
            
            if (isSynced && syncedAt) {
                const syncTime = new Date(syncedAt).getTime();
                if (file.stat.mtime > syncTime + 2000) {
                    noteStatus = '🔄';
                    tooltip = 'Note has pending changes';
                } else {
                    noteStatus = '✅';
                    tooltip = 'Note synced';
                }
            } else {
                noteStatus = '⚪';
                tooltip = 'Note not synced';
            }

            this.updateStatusBar(
                `Note ${noteStatus}${timeStatusText}${projectStatusText}`,
                `${tooltip}${timeTooltip}`
            );
        } catch {
            void this.updateStatusBar('Note ⚪ · Time ⚪', 'Ready');
        }
    }

    // ==================== KANTATA COMMANDS ====================

    openInKantata(): void {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
            new Notice('No active file');
            return;
        }

        const cacheResult = this.findCacheEntry(file);
        if (!cacheResult) {
            const customerName = this.getCustomerName(file);
            new Notice(`Folder "${customerName}" is not linked to a workspace yet. Sync first.`);
            return;
        }

        const url = `${this.settings.apiBaseUrl.replace('/api/v1', '')}/workspaces/${cacheResult.entry.workspaceId}`;
        window.open(url, '_blank');
        new Notice(`Opening ${cacheResult.entry.workspaceTitle} in Kantata...`);
    }

    async linkFolder(): Promise<void> {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
            new Notice('No active file - open a note in the folder you want to link');
            return;
        }

        const folderName = this.getCustomerName(file);
        if (!folderName) {
            new Notice('Could not determine folder');
            return;
        }

        // Check if already linked
        const existing = this.workspaceCache[folderName];
        if (existing) {
            new Notice(`Folder "${folderName}" is already linked to "${existing.workspaceTitle}". Unlink first to change.`);
            return;
        }

        // Fetch workspaces and show picker
        try {
            new Notice('Fetching workspaces...');
            const workspaces = await this.fetchAllWorkspaces();
            
            // Filter out already-linked workspaces
            const linkedIds = new Set(Object.values(this.workspaceCache).map(c => c.workspaceId));
            const available = workspaces.filter(w => !linkedIds.has(w.id));

            if (available.length === 0) {
                new Notice('No available workspaces to link (all are already linked)');
                return;
            }

            const modal = new WorkspacePickerModal(this.app, available, folderName);
            const selected = await modal.waitForSelection();

            if (selected) {
                this.workspaceCache[folderName] = {
                    workspaceId: selected.id,
                    workspaceTitle: selected.title,
                    workspaceStatus: selected.status,
                    workspaceStatusColor: selected.statusColor,
                    cachedAt: new Date().toISOString()
                };
                await this.saveWorkspaceCache();
                
                // Create dashboard if enabled
                if (this.settings.createDashboardNote) {
                    await this.createDashboardNote(folderName, selected.id);
                }
                
                new Notice(`🔗 Linked "${folderName}" → "${selected.title}"`);
                
                // Update status bar
                await this.updateStatusBarForFile(file);
            }
        } catch (err) { const e = err as Error;
            new Notice(`❌ Failed to fetch workspaces: ${e.message}`);
        }
    }

    async unlinkFolder(): Promise<void> {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
            new Notice('No active file');
            return;
        }

        const cacheResult = this.findCacheEntry(file);
        if (!cacheResult) {
            const customerName = this.getCustomerName(file);
            new Notice(`Folder "${customerName}" is not linked to any workspace`);
            return;
        }

        delete this.workspaceCache[cacheResult.path];
        await this.saveWorkspaceCache();
        new Notice(`🔓 Unlinked "${cacheResult.path}" from "${cacheResult.entry.workspaceTitle}"`);
        
        // Refresh status bar and ribbon icons
        await this.updateStatusBarForFile(file);
        await this.updateRibbonIcons(file);
    }

    async autoSyncFolders(): Promise<void> {
        await this.syncWorkspaces(false);
    }

    // ==================== API ====================

    private lastApiCall = 0;
    private readonly API_RATE_LIMIT_MS = 100; // Minimum ms between API calls

    private async rateLimitedDelay(): Promise<void> {
        const now = Date.now();
        const elapsed = now - this.lastApiCall;
        if (elapsed < this.API_RATE_LIMIT_MS) {
            await new Promise(resolve => setTimeout(resolve, this.API_RATE_LIMIT_MS - elapsed));
        }
        this.lastApiCall = Date.now();
    }

    async apiRequest(endpoint: string, method = 'GET', body?: Record<string, unknown>): Promise<Record<string, unknown>> {
        // Check for network connectivity
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            throw new Error('No internet connection. Please check your network and try again.');
        }
        
        await this.rateLimitedDelay();
        if (!this.getSecret('kantataToken')) {
            throw new Error('Kantata token not configured. Go to Settings → KantataSync');
        }

        const options = {
            url: `${this.settings.apiBaseUrl}${endpoint}`,
            method,
            headers: {
                'Authorization': `Bearer ${this.getSecret('kantataToken')}`,
                'Content-Type': 'application/json'
            }
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        try {
            const response = await requestUrl(options);
            // DELETE requests may return empty body
            if (method === 'DELETE') {
                return { success: true };
            }
            return response.json as Record<string, unknown>;
        } catch (err) {
            const e = err instanceof Error ? err : new Error(String(err));
            const errRecord = err as Record<string, unknown>;
            const status = (typeof errRecord.status === 'number' ? errRecord.status : 0) || 'unknown';
            let errorMsg = `Kantata API error (${String(status)})`;
            
            // Try to parse error response body
            try {
                const rawErr: unknown = errRecord.response ?? errRecord.text ?? e.message ?? '';
                const errorText = String(rawErr);
                const errorData: KantataErrorResponse | null = typeof errorText === 'string' && errorText.startsWith('{') 
                    ? JSON.parse(errorText) as KantataErrorResponse
                    : null;
                console.warn('[KantataSync] Kantata error response:', errorData ?? errorText);
                
                if (errorData?.errors) {
                    // Kantata errors can be array of strings or objects
                    const errors = Array.isArray(errorData.errors)
                        ? errorData.errors.map((errItem: string | { message?: string }) => 
                            typeof errItem === 'string' ? errItem : (errItem.message ?? JSON.stringify(errItem))
                          ).join(', ')
                        : JSON.stringify(errorData.errors);
                    errorMsg = `${errorMsg}: ${errors}`;
                }
            } catch {
                // Couldn't parse, use raw message
                if (e.message) errorMsg = `${errorMsg}: ${e.message}`;
            }
            
            // Enhanced error handling with specific status codes (merged from main v0.5.0)
            if (status === 401) {
                throw new Error('Authentication failed. Check your Kantata token in Settings.');
            } else if (status === 403) {
                throw new Error('Permission denied. Your token may not have access to this resource.');
            } else if (status === 404) {
                throw new Error('Resource not found. It may have been deleted.');
            } else if (status === 429) {
                // Will be retried by apiRequestWithRetry
                const retryError: RetryableError = Object.assign(new Error('Rate limit exceeded. Please wait before trying again.'), { retryable: true, status: 429 });
                throw retryError;
            } else if (status >= 500) {
                // Will be retried by apiRequestWithRetry
                const retryError: RetryableError = Object.assign(new Error('Kantata server error. Please try again later.'), { retryable: true, status: status as number });
                throw retryError;
            }
            throw new Error(errorMsg);
        }
    }

    /**
     * API request with automatic retry for transient failures (429, 5xx)
     * Uses exponential backoff: 1s, 2s, 4s
     */
    async apiRequestWithRetry(endpoint: string, method = 'GET', body?: Record<string, unknown>, maxRetries = 3): Promise<Record<string, unknown>> {
        let lastError: Error | null = null;
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await this.apiRequest(endpoint, method, body);
            } catch (err) { const e = err as Error;
                lastError = e;
                
                // Only retry on retryable errors (429, 5xx)
                if ((e as RetryableError).retryable && attempt < maxRetries - 1) {
                    const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
                    console.debug(`[KantataSync] Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries}): ${e.message}`);
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }
                throw e;
            }
        }
        
        throw lastError ?? new Error('All retries exhausted');
    }

    // ==================== AI TIME ENTRY ====================

    /**
     * Call AI provider based on settings
     */
    async callAI(prompt: string, images?: Array<{ base64: string; mediaType: string }>): Promise<string> {
        switch (this.settings.aiProvider) {
            case 'anthropic':
                return this.callAnthropic(prompt, images);
            case 'openai':
                return this.callOpenAI(prompt); // TODO: add image support
            case 'google':
                return this.callGoogle(prompt); // TODO: add image support
            case 'openrouter':
                return this.callOpenRouter(prompt); // TODO: add image support
            case 'ollama':
                return this.callOllama(prompt);
            case 'manual':
                throw new Error('Manual mode does not use AI');
            default:
                throw new Error(`Unknown AI provider: ${String(this.settings.aiProvider)}`);
        }
    }
    /**
     * Extract image paths from note content (Obsidian format)
     */
    extractImagePaths(content: string, file: TFile): string[] {
        const images: string[] = [];
        
        // Match ![[image.png]] or ![[folder/image.png]]
        const wikiLinkRegex = /!\[\[([^\]]+\.(png|jpg|jpeg|gif|webp))\]\]/gi;
        let match;
        while ((match = wikiLinkRegex.exec(content)) !== null) {
            images.push(match[1]);
        }
        
        // Match ![alt](path.png)
        const mdLinkRegex = /!\[[^\]]*\]\(([^)]+\.(png|jpg|jpeg|gif|webp))\)/gi;
        while ((match = mdLinkRegex.exec(content)) !== null) {
            images.push(match[1]);
        }
        
        return images;
    }

    /**
     * Read image file as base64
     */
    async readImageAsBase64(imagePath: string, noteFile: TFile): Promise<{ base64: string; mediaType: string } | null> {
        try {
            // Resolve path relative to note's folder or vault root
            let fullPath = imagePath;
            if (!imagePath.startsWith('/')) {
                // Try note's folder first (for Attachments subfolder)
                const noteFolder = noteFile.parent?.path || '';
                const possiblePaths = [
                    `${noteFolder}/${imagePath}`,
                    `${noteFolder}/Attachments/${imagePath}`,
                    imagePath
                ];
                
                for (const path of possiblePaths) {
                    const file = this.app.vault.getAbstractFileByPath(path);
                    if (file) {
                        fullPath = path;
                        break;
                    }
                }
            }
            
            const imageFile = this.app.vault.getAbstractFileByPath(fullPath);
            if (!imageFile) {
                console.debug(`[KantataSync] Image not found: ${fullPath}`);
                return null;
            }
            
            if (!(imageFile instanceof TFile)) {
                console.debug(`[KantataSync] Not a file: ${fullPath}`);
                return null;
            }
            const arrayBuffer = await this.app.vault.readBinary(imageFile);
            const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
            
            const ext = imagePath.split('.').pop()?.toLowerCase() || 'png';
            const mediaType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
            
            return { base64, mediaType };
        } catch (e) {
            console.warn(`[KantataSync] Failed to read image: ${imagePath}`, e);
            return null;
        }
    }

    async callAnthropic(prompt: string, images?: Array<{ base64: string; mediaType: string }>): Promise<string> {
        if (!this.getSecret('anthropicApiKey')) {
            throw new Error('Anthropic API key not configured');
        }

        const headers: Record<string, string> = {
            'content-type': 'application/json',
            'anthropic-version': '2023-06-01',
            'x-api-key': this.getSecret('anthropicApiKey')
        };

        // Build message content - text and optional images
        const content: Array<Record<string, unknown>> = [];
        
        // Add images first if provided
        if (images && images.length > 0) {
            for (const img of images) {
                content.push({
                    type: 'image',
                    source: {
                        type: 'base64',
                        media_type: img.mediaType,
                        data: img.base64
                    }
                });
            }
        }
        
        // Add text prompt
        content.push({ type: 'text', text: prompt });

        // Use throw: false so we can read error response body
        const response = await requestUrl({
            url: 'https://api.anthropic.com/v1/messages',
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: this.settings.anthropicModel || 'claude-sonnet-4-20250514',
                max_tokens: 1000,
                messages: [{ role: 'user', content }]
            }),
            throw: false
        });

        // Check for errors
        if (response.status >= 400) {
            let errorMsg = `Anthropic API error (${String(response.status)})`;
            try {
                const errorData = response.json as AnthropicResponse;
                console.warn('[KantataSync] Anthropic error response:', errorData);
                if (errorData?.error?.message) {
                    errorMsg = `${errorMsg}: ${errorData.error.message}`;
                } else if (errorData?.message) {
                    errorMsg = `${errorMsg}: ${errorData.message}`;
                } else {
                    errorMsg = `${errorMsg}: ${response.text?.slice(0, 200) ?? 'Unknown error'}`;
                }
            } catch {
                errorMsg = `${errorMsg}: ${response.text?.slice(0, 200) ?? 'Unknown error'}`;
            }
            throw new Error(errorMsg);
        }

        const data = response.json as AnthropicResponse;
        if (data.content?.[0]?.text) {
            return data.content[0].text;
        }
        throw new Error('Unexpected Anthropic API response format');
    }

    /**
     * Call OpenAI API
     */
    async callOpenAI(prompt: string): Promise<string> {
        if (!this.getSecret('openaiApiKey')) {
            throw new Error('OpenAI API key not configured');
        }

        const response = await requestUrl({
            url: 'https://api.openai.com/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.getSecret('openaiApiKey')}`
            },
            body: JSON.stringify({
                model: this.settings.openaiModel || 'gpt-4o',
                max_tokens: 500,
                messages: [{ role: 'user', content: prompt }]
            })
        });

        const data = response.json as OpenAIResponse;
        if (data.choices?.[0]?.message?.content) {
            return data.choices[0].message.content;
        }
        throw new Error('Unexpected OpenAI API response format');
    }

    /**
     * Call Google AI (Gemini) API
     */
    async callGoogle(prompt: string): Promise<string> {
        if (!this.getSecret('googleApiKey')) {
            throw new Error('Google AI API key not configured');
        }

        const model = this.settings.googleModel || 'gemini-1.5-flash';
        const response = await requestUrl({
            url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.getSecret('googleApiKey')}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { maxOutputTokens: 500 }
            })
        });

        const data = response.json as GeminiResponse;
        if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
            return data.candidates[0].content.parts[0].text;
        }
        throw new Error('Unexpected Google AI API response format');
    }

    /**
     * Call OpenRouter API - access to many models with one API key
     */
    async callOpenRouter(prompt: string): Promise<string> {
        if (!this.getSecret('openrouterApiKey')) {
            throw new Error('OpenRouter API key not configured');
        }

        const response = await requestUrl({
            url: 'https://openrouter.ai/api/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.getSecret('openrouterApiKey')}`,
                'HTTP-Referer': 'https://obsidian.md',
                'X-Title': 'KantataSync'
            },
            body: JSON.stringify({
                model: this.settings.openrouterModel || 'anthropic/claude-sonnet-4',
                max_tokens: 500,
                messages: [{ role: 'user', content: prompt }]
            })
        });

        const data = response.json as OpenAIResponse;
        if (data.choices?.[0]?.message?.content) {
            return data.choices[0].message.content;
        }
        throw new Error('Unexpected OpenRouter API response format');
    }

    /**
     * Call Ollama (local) API - no API key needed!
     */
    async callOllama(prompt: string): Promise<string> {
        const endpoint = this.settings.ollamaEndpoint || 'http://localhost:11434';
        const model = this.settings.ollamaModel || 'llama3.2';

        const response = await requestUrl({
            url: `${endpoint}/api/generate`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                prompt: prompt,
                stream: false
            })
        });

        const data = response.json as OllamaResponse;
        if (data.response) {
            return data.response;
        }
        throw new Error('Unexpected Ollama API response format');
    }

    /**
     * Manual mode - extract basic info without AI
     */
    manualAnalysis(noteContent: string, availableCategories: string[]): { summary: string; category: string; hours: number; notes: string } {
        // Simple extraction: first line as summary, default hours, first category
        const lines = noteContent.split('\n').filter(l => l.trim());
        const firstLine = lines[0] || 'Work session';
        
        return {
            summary: firstLine.slice(0, 100),
            category: this.settings.manualDefaultCategory || availableCategories[0] || 'Consulting',
            hours: this.settings.manualDefaultHours || 1.0,
            notes: lines.slice(0, 3).join(' ').slice(0, 200)
        };
    }

    /**
     * Fetch available stories/tasks from Kantata workspace that can have time logged
     */
    async fetchBillableStories(workspaceId: string): Promise<Array<{ id: string; title: string }>> {
        try {
            // Fetch stories (tasks) that are active and can have time logged
            const response = await this.apiRequest(
                `/stories.json?workspace_id=${workspaceId}&per_page=50&include=workspace`
            );
            const stories = Object.values(response.stories || {}) as Record<string, unknown>[];
            
            // Filter to stories that can have time logged (not archived, has budget or is billable)
            const billable = stories
                .filter((s: Record<string, unknown>) => s.state !== 'archived' && s.state !== 'deleted')
                .map((s: Record<string, unknown>) => ({
                    id: String(s.id),
                    title: s.title || s.name || 'Untitled Task'
                }));
            
            console.debug(`[KantataSync] Found ${billable.length} billable stories in workspace`);
            return billable;
        } catch (e) {
            console.warn('[KantataSync] Could not fetch stories:', e);
            return [];
        }
    }

    /**
     * Legacy: Fetch time categories (fallback if no stories)
     */
    async fetchTimeCategories(workspaceId: string): Promise<string[]> {
        const stories = await this.fetchBillableStories(workspaceId);
        if (stories.length > 0) {
            return stories.map(s => s.title);
        }
        // Fallback defaults
        return ['Consulting', 'Development', 'Meeting', 'Documentation', 'Support'];
    }

    /**
     * Analyze note content with AI to generate time entry data
     */
    // Max content length for AI analysis (~2500 tokens)
    private readonly MAX_AI_CONTENT_LENGTH = 10000;

    async analyzeNoteForTimeEntry(
        noteContent: string,
        availableCategories: string[]
    ): Promise<{ summary: string; category: string; hours: number; notes: string }> {
        // Manual mode - no AI call
        if (this.settings.aiProvider === 'manual') {
            return this.manualAnalysis(noteContent, availableCategories);
        }

        // Truncate very long content to avoid AI token limits
        let content = noteContent;
        if (content.length > this.MAX_AI_CONTENT_LENGTH) {
            content = content.slice(0, this.MAX_AI_CONTENT_LENGTH) + '\n\n[Content truncated for analysis...]';
            console.debug(`[KantataSync] Truncated note content from ${noteContent.length} to ${this.MAX_AI_CONTENT_LENGTH} chars`);
        }

        const prompt = `Convert this work note into a time entry. Return JSON only.

TASKS (pick one): ${availableCategories.join(' | ')}

CRITICAL - NO HALLUCINATION:
- ONLY use information explicitly in the note
- Do NOT make up or invent ANY details
- If unsure, keep it brief and factual

RULES:
- summary: What was done (1 line, verb, max 100 chars) - ONLY what's stated
- category: MUST match one task above exactly
- hours: Default 1 hour. Only change if time is explicitly mentioned.
- notes: Brief factual summary (2-3 sentences) - NO invented details

NOTE:
${content}

JSON:`;

        const responseText = await this.callAI(prompt);
        
        // Extract JSON from response (handle potential markdown wrapping)
        let jsonStr = responseText.trim();
        if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
        }
        
        try {
            const parsed = JSON.parse(jsonStr) as TimeEntryParsed;
            // Round hours to nearest 15-minute increment (0.25)
            const rawHours = Number(parsed.hours) || 1;
            const roundedHours = Math.round(rawHours * 4) / 4;
            
            return {
                summary: String(parsed.summary || '').slice(0, 100),
                category: parsed.category || availableCategories[0] || 'General',
                hours: Math.max(0.25, roundedHours), // Minimum 15 minutes
                notes: String(parsed.notes || '')
            };
        } catch {
            console.warn('[KantataSync] Failed to parse AI response:', responseText);
            throw new Error('Failed to parse AI response as JSON');
        }
    }

    /**
     * Proofread notes for Kantata - clean text only, no template
     */
    async proofreadForKantata(notes: string): Promise<string> {
        // Strip markdown from input first
        const cleanInput = notes
            .replace(/==\*\*[^*]+\*\*==/g, '')  // Remove ==**headers**==
            .replace(/\*\*[^*]+:\*\*/g, '')     // Remove **Label:**
            .replace(/\*\*/g, '')               // Remove remaining **
            .replace(/<u>[^<]*<\/u>/g, '')      // Remove <u>tags</u>
            .replace(/^-\s*/gm, '')             // Remove bullet points
            .replace(/\n{3,}/g, '\n\n')         // Collapse multiple newlines
            .trim();

        const prompt = `Summarize this work session as a brief time entry note.

RULES:
- Plain text only - NO markdown, NO formatting
- 2-4 sentences summarizing what was accomplished
- Professional tone
- NO bold, NO bullets, NO headers

INPUT:
${cleanInput}

OUTPUT (plain text only):`;

        const result = await this.callAI(prompt);
        // Extra cleanup - remove any markdown the AI might have added
        return result.trim()
            .replace(/\*\*/g, '')
            .replace(/\*/g, '')
            .replace(/^#+\s*/gm, '')
            .replace(/^-\s*/gm, '');
    }

    /**
     * Smart AI enhancement: proofread, apply template if needed, expand if brief
     */
    async enhanceNotes(notes: string, customerName: string = 'Customer'): Promise<string> {
        const now = new Date();
        const minutes = now.getMinutes();
        const roundedMinutes = Math.round(minutes / 30) * 30;
        now.setMinutes(roundedMinutes);
        const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

        const prompt = `Organize these work notes into the template below.

RULES:
- Accomplishments: ELABORATE and expand into professional sentences
- ALWAYS include ALL sections (Issues, Blockers, Next Session, Next Steps) - leave blank if no content
- NEVER invent information

ROUGH NOTES:
${notes}

OUTPUT FORMAT (OMIT empty sections):

==**Meeting Details**==
**Customer:** ${customerName}
**Work Session:** ${dateStr} @ ${timeStr}
**Our Attendees:**
**${customerName} Attendees:** [if mentioned]

==**Activities/Notes**==

**Accomplishments:**
[ELABORATE: expand work notes into professional sentences]

[ALWAYS include these sections - leave blank if nothing mentioned:]
**Issues:** [content]
**Blockers:** [content]
**Next Session:** [content]
**Next Steps:** [content]

---

<u>Internal Notes</u>

OUTPUT:`;

        const enhanced = await this.callAI(prompt);
        return enhanced.trim();
    }

    /**
     * Full template organization with meeting details
     */
    async organizeNotesWithTemplate(roughNotes: string, customerName: string, originalNotes?: string, images?: Array<{ base64: string; mediaType: string }>): Promise<string> {
        const now = new Date();
        const minutes = now.getMinutes();
        const roundedMinutes = Math.round(minutes / 30) * 30;
        now.setMinutes(roundedMinutes);
        const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

        // Truncate very long content
        let notes = roughNotes;
        if (notes.length > this.MAX_AI_CONTENT_LENGTH) {
            notes = notes.slice(0, this.MAX_AI_CONTENT_LENGTH) + '\n\n[Content truncated...]';
        }

        const imageNote = images && images.length > 0 
            ? `\n\nIMAGES: ${images.length} attached. Extract attendee names you can clearly see.`
            : '';

        const prompt = `Organize these work notes into the template below.${imageNote}

RULES:
- Accomplishments: ELABORATE and expand into professional sentences
- Attendees: Extract from images if visible, otherwise leave blank
- ALWAYS include ALL sections - leave blank if no content (do NOT omit any section)
- NEVER invent information

ROUGH NOTES:
${notes}

OUTPUT FORMAT (include ALL sections, leave blank if no content):

==**Meeting Details**==
**Customer:** ${customerName}
**Work Session:** ${dateStr} @ ${timeStr}
**Our Attendees:**
**${customerName} Attendees:** [from images/notes or leave blank]

==**Activities/Notes**==

**Accomplishments:**
[ELABORATE: expand work notes into full professional sentences]

[ALWAYS include these sections - leave blank if nothing mentioned:]
**Issues:** [content]
**Blockers:** [content]
**Next Session:** [content]
**Next Steps:** [content]

---

<u>Internal Notes</u>


OUTPUT:`;

        let formatted = await this.callAI(prompt, images);
        formatted = formatted.trim();
        
        // Original notes are saved to backup file, not Internal Notes
        
        return formatted;
    }

    /**
     * Delete a time entry (for undo)
     */
    async deleteTimeEntry(timeEntryId: string): Promise<void> {
        await this.apiRequest(`/time_entries/${timeEntryId}.json`, 'DELETE');
        console.debug(`[KantataSync] Deleted time entry: ${timeEntryId}`);
    }

    /**
     * Create a time entry in Kantata for the given workspace
     */
    async createTimeEntry(
        workspaceId: string,
        userId: string,
        storyId: string | null,
        data: { date: string; hours: number; notes: string }
    ): Promise<string> {
        const timeEntryData = {
            workspace_id: workspaceId,
            user_id: userId,
            date_performed: data.date,
            time_in_minutes: Math.round(data.hours * 60),
            notes: data.notes,
            billable: true
        };
        
        if (storyId) {
            timeEntryData.story_id = storyId;
        }

        console.debug('[KantataSync] Creating time entry:', { 
            workspace_id: timeEntryData.workspace_id, 
            time_in_minutes: timeEntryData.time_in_minutes,
            date: timeEntryData.date_performed,
            story_id: String(timeEntryData.story_id ?? 'none')
        });

        const response = await this.apiRequest('/time_entries.json', 'POST', {
            time_entry: timeEntryData
        });
        
        const entries = Object.values(response.time_entries || {}) as Array<{ id: string }>;
        if (entries.length > 0) {
            console.debug(`[KantataSync] Created time entry: ${entries[0].id}`);
            return entries[0].id;
        }
        throw new Error('Time entry created but no ID returned');
    }

    /**
     * Find the best matching story for a category name
     */
    findMatchingStory(category: string, stories: Array<{ id: string; title: string }>): string | null {
        if (stories.length === 0) return null;
        
        const categoryLower = category.toLowerCase();
        
        // Exact match
        const exact = stories.find(s => s.title.toLowerCase() === categoryLower);
        if (exact) return exact.id;
        
        // Partial match
        const partial = stories.find(s => 
            s.title.toLowerCase().includes(categoryLower) || 
            categoryLower.includes(s.title.toLowerCase())
        );
        if (partial) return partial.id;
        
        // Fallback to first story
        console.debug(`[KantataSync] No match for "${category}", using first story: ${stories[0].title}`);
        return stories[0].id;
    }

    /**
     * Get current user ID from Kantata
     */
    async getCurrentUserId(): Promise<string> {
        const response = await this.apiRequest('/users/me.json');
        const users = Object.values(response.users || {}) as Record<string, unknown>[];
        if (users.length > 0) {
            return users[0].id;
        }
        throw new Error('Could not determine current user ID');
    }

    /**
     * Check if any AI provider is configured
     */
    hasAiCredentials(): boolean {
        switch (this.settings.aiProvider) {
            case 'anthropic':
                return !!this.getSecret('anthropicApiKey');
            case 'openai':
                return !!this.getSecret('openaiApiKey');
            case 'google':
                return !!this.getSecret('googleApiKey');
            case 'openrouter':
                return !!this.getSecret('openrouterApiKey');
            case 'ollama':
                return true; // No API key needed
            case 'manual':
                return true; // No AI needed
            default:
                return false;
        }
    }

    /**
     * Process AI time entry after successful note sync
     */
    async processAiTimeEntry(workspaceId: string, noteContent: string, customerName: string = 'Customer'): Promise<{ success: boolean; timeEntryId?: string; error?: string }> {
        if (!this.settings.enableAiTimeEntry) {
            return { success: true }; // Feature disabled, silently succeed
        }

        if (!this.hasAiCredentials()) {
            return { success: false, error: `${this.settings.aiProvider} credentials not configured` };
        }

        try {
            // Get available stories/tasks from workspace
            const stories = await this.fetchBillableStories(workspaceId);
            
            if (stories.length === 0) {
                throw new Error('No tasks found in workspace. Create at least one task in Kantata to log time against.');
            }
            
            const storyTitles = stories.map(s => s.title);
            
            // Analyze note with AI
            console.debug('[KantataSync] Analyzing note for time entry...');
            console.debug(`[KantataSync] Available tasks: ${storyTitles.join(', ')}`);
            const analysis = await this.analyzeNoteForTimeEntry(noteContent, storyTitles);
            console.debug('[KantataSync] AI analysis:', analysis);
            
            // Match AI's category to actual story_id
            const storyId = this.findMatchingStory(analysis.category, stories);
            if (storyId) {
                const matchedStory = stories.find(s => s.id === storyId);
                console.debug(`[KantataSync] Matched category "${analysis.category}" to story: ${matchedStory?.title} (${storyId})`);
            }
            
            // Get current user ID
            const userId = await this.getCurrentUserId();
            
            // For Kantata: always clean to plain text (Kantata doesn't render markdown)
            let finalNotes = `${analysis.summary}\n\n${analysis.notes}`;
            console.debug('[KantataSync] Proofreading notes for Kantata...');
            finalNotes = await this.proofreadForKantata(finalNotes);
            console.debug('[KantataSync] Proofread result:', finalNotes);
            
            // Create time entry
            const today = new Date().toISOString().split('T')[0];
            const timeEntryData = {
                date: today,
                hours: analysis.hours,
                notes: finalNotes
            };
            const timeEntryId = await this.createTimeEntry(workspaceId, userId, storyId, timeEntryData);
            
            // Store for undo
            this.lastTimeEntry = {
                id: timeEntryId,
                workspaceId,
                data: { ...timeEntryData, storyId, userId }
            };
            
            return { success: true, timeEntryId };
        } catch (err) { const e = err as Error;
            console.warn('[KantataSync] AI time entry failed:', e);
            return { success: false, error: e.message };
        }
    }

    async searchWorkspace(customerName: string): Promise<{ id: string; title: string } | null> {
        const cached = this.workspaceCache[customerName];
        if (cached && this.isCacheValid(cached)) {
            return {
                id: cached.workspaceId,
                title: cached.workspaceTitle
            };
        }

        const params = new URLSearchParams({
            search: `title:'${customerName}'`,
            per_page: '50'
        });

        if (this.settings.includeArchived) {
            params.append('include_archived', 'true');
        }

        const response = await this.apiRequest(`/workspaces.json?${params.toString()}`);
        const workspaces = Object.values(response.workspaces || {}) as KantataWorkspaceRaw[];
        const exact = workspaces.find(w => w.title.toLowerCase() === customerName.toLowerCase());

        if (exact) {
            this.workspaceCache[customerName] = {
                workspaceId: exact.id,
                workspaceTitle: exact.title,
                cachedAt: new Date().toISOString()
            };
            await this.saveWorkspaceCache();
            return { id: exact.id, title: exact.title };
        }

        return await this.showWorkspacePicker(customerName);
    }

    async fetchAllWorkspaces(): Promise<Workspace[]> {
        const allWorkspaces: Workspace[] = [];
        let page = 1;
        const perPage = 200;
        
        while (true) {
            const params = new URLSearchParams({
                per_page: perPage.toString(),
                page: page.toString(),
                has_participation: 'true'
            });

            if (this.settings.includeArchived) {
                params.append('include_archived', 'true');
            }

            const response = await this.apiRequest(`/workspaces.json?${params.toString()}`);
            const workspaces = Object.values(response.workspaces || {}) as KantataWorkspaceRaw[];
            
            if (workspaces.length === 0) break;
            
            for (const w of workspaces) {
                allWorkspaces.push({
                    id: w.id,
                    title: w.title,
                    status: w.status?.message || 'Active',
                    statusColor: w.status?.color || 'gray'
                });
            }
            
            // If we got fewer than perPage, we've reached the end
            if (workspaces.length < perPage) break;
            
            page++;
            
            // Safety limit to prevent infinite loops
            if (page > 50) {
                console.warn('[KantataSync] Hit pagination safety limit (10,000 workspaces)');
                break;
            }
        }
        
        console.debug(`[KantataSync] Fetched ${allWorkspaces.length} workspaces (${page} page(s))`);
        return allWorkspaces;
    }

    async fetchWorkspaceDetails(workspaceId: string): Promise<WorkspaceDetails | null> {
        try {
            const response = await this.apiRequest(`/workspaces/${workspaceId}.json?include=participants`);
            const workspace = Object.values(response.workspaces || {})[0] as Record<string, unknown> | undefined;
            if (!workspace) return null;

            const users = (response.users || {}) as Record<string, Record<string, string>>;
            const participants = ((workspace.participant_ids || []) as string[]).map((id: string) => {
                const user = users[id];
                return {
                    id,
                    name: user?.full_name || 'Unknown',
                    role: user?.headline || ''
                };
            });

            // Get primary maven details
            const primaryMavenUser = workspace.primary_maven_id ? users[workspace.primary_maven_id as string] : null;

            return {
                id: workspace.id as string,
                title: workspace.title as string,
                description: (workspace.description as string) || '',
                status: (workspace.status as Record<string, string>)?.message || 'Active',
                statusColor: (workspace.status as Record<string, string>)?.color || 'gray',
                startDate: workspace.start_date || '',
                dueDate: workspace.due_date || workspace.effective_due_date || '',
                budgeted: workspace.budgeted || false,
                price: workspace.price || '',
                budgetUsed: workspace.budget_used || '',
                budgetRemaining: workspace.budget_remaining || '',
                percentBudgetUsed: workspace.percent_of_budget_used || 0,
                percentageComplete: workspace.percentage_complete || 0,
                participants,
                primaryMaven: primaryMavenUser ? { id: workspace.primary_maven_id, name: primaryMavenUser.full_name } : undefined,
                createdAt: workspace.created_at || '',
                updatedAt: workspace.updated_at || '',
                currencySymbol: workspace.currency_symbol || '$'
            };
        } catch (err) { const e = err as Error;
            // 404 means workspace was deleted from Kantata
            if ((e as Record<string, unknown>).status === 404) {
                console.debug(`[KantataSync] Workspace ${workspaceId} was deleted from Kantata (404)`);
                return {
                    id: workspaceId,
                    title: 'Deleted Workspace',
                    status: 'DELETED',
                    statusColor: 'gray',
                    budgeted: false,
                    percentBudgetUsed: 0,
                    percentageComplete: 0,
                    participants: [],
                    currencySymbol: '$',
                    deleted: true
                };
            }
            console.warn('[KantataSync] Failed to fetch workspace details:', e);
            return null;
        }
    }

    getStatusEmoji(statusColor: string): string {
        switch (statusColor.toLowerCase()) {
            case 'green': return '🟢';
            case 'yellow': return '🟡';
            case 'red': return '🔴';
            case 'blue': return '🔵';
            case 'gray':
            case 'grey':
            default: return '⚪';
        }
    }

    generateProgressBar(percent: number, width: number = 10): string {
        // Clamp percent to 0-100 range to avoid negative repeat counts
        const clampedPercent = Math.max(0, Math.min(100, percent || 0));
        const filled = Math.round((clampedPercent / 100) * width);
        const empty = width - filled;
        return '█'.repeat(filled) + '░'.repeat(empty);
    }

    formatDate(dateStr?: string): string {
        if (!dateStr) return 'Not set';
        try {
            // Parse date-only strings (YYYY-MM-DD) as local time, not UTC
            // This prevents timezone offset from showing the wrong day
            let date: Date;
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                // Date-only format: parse as local time by adding T12:00:00
                date = new Date(dateStr + 'T12:00:00');
            } else {
                date = new Date(dateStr);
            }
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        } catch {
            return dateStr || 'Not set';
        }
    }

    generateDashboardContent(details: WorkspaceDetails, workspaceId: string, includeRefreshTime: boolean = false): string {
        const statusEmoji = this.getStatusEmoji(details.statusColor);
        const baseUrl = this.settings.apiBaseUrl.replace('/api/v1', '');
        const kantataUrl = `${baseUrl}/workspaces/${workspaceId}`;
        
        // Build team section
        const teamMembers = details.participants.length > 0
            ? details.participants.map(p => {
                const isPrimary = details.primaryMaven && p.id === details.primaryMaven.id;
                return `| ${p.name} | ${p.role || '-'} | ${isPrimary ? '⭐ Lead' : 'Member'} |`;
              }).join('\n')
            : '| No participants | - | - |';

        // Progress bar for completion
        const progressBar = this.generateProgressBar(details.percentageComplete);
        
        // Due date warning logic
        let dueDisplay = this.formatDate(details.dueDate);
        let dueWarning = '';
        if (details.dueDate) {
            const dueDate = new Date(details.dueDate + 'T23:59:59');
            const now = new Date();
            const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            
            if (daysUntilDue < 0) {
                dueDisplay = `🔴 **${this.formatDate(details.dueDate)}** ⚠️ OVERDUE by ${Math.abs(daysUntilDue)} days`;
                dueWarning = '\n\n> [!danger] ⚠️ Project Overdue\n> This project is past its due date!';
            } else if (daysUntilDue <= 7) {
                dueDisplay = `🟡 **${this.formatDate(details.dueDate)}** (${daysUntilDue} days left)`;
            } else if (daysUntilDue <= 14) {
                dueDisplay = `🟢 ${this.formatDate(details.dueDate)} (${daysUntilDue} days left)`;
            }
        }
        
        // Budget section with warning colors
        let budgetSection = '';
        if (details.budgeted && details.price && details.price !== 'TBD') {
            const budgetBar = this.generateProgressBar(details.percentBudgetUsed);
            const budgetPercent = details.percentBudgetUsed || 0;
            
            let budgetStatus = '';
            let budgetCallout = 'example'; // default callout type
            if (budgetPercent >= 100) {
                budgetStatus = '🔴 **OVER BUDGET**';
                budgetCallout = 'danger';
            } else if (budgetPercent >= 90) {
                budgetStatus = '🔴 Critical';
                budgetCallout = 'warning';
            } else if (budgetPercent >= 75) {
                budgetStatus = '🟡 Warning';
                budgetCallout = 'warning';
            } else {
                budgetStatus = '🟢 Healthy';
            }
            
            budgetSection = `
> [!${budgetCallout}] 💰 Budget ${budgetStatus}
> **${details.price}** budgeted
> 
> \`${budgetBar}\` ${budgetPercent}% used
> 
> | Spent | Remaining |
> |-------|-----------|
> | ${details.budgetUsed || '$0'} | ${details.budgetRemaining || 'N/A'} |
`;
        } else if (details.budgeted) {
            budgetSection = `
> [!example] 💰 Budget
> Budget: **TBD**
`;
        }

        const refreshLine = includeRefreshTime 
            ? `\n*Last synced: ${new Date().toLocaleString()}*` 
            : '';

        return `---
kantata_workspace_id: '${workspaceId}'
kantata_status: '${details.status}'
kantata_dashboard: true
tags:
  - kantata
  - project
${details.status ? `  - status/${details.status.toLowerCase().replace(/\s+/g, '-')}` : ''}
---

# ${details.title}

> [!tip] ${statusEmoji} ${details.status}
> ${details.description || '*No description*'}

## 📊 Overview

| | |
|---|---|
| **Status** | ${statusEmoji} ${details.status} |
| **Progress** | \`${progressBar}\` ${details.percentageComplete}% |
| **Start** | ${this.formatDate(details.startDate)} |
| **Due** | ${dueDisplay} |
| **Lead** | ${details.primaryMaven?.name || 'Unassigned'} |
${dueWarning}
${budgetSection}
## 👥 Team

| Name | Role | Type |
|------|------|------|
${teamMembers}

## 🔗 Quick Links

| | |
|---|---|
| 🏠 [Workspace](${kantataUrl}) | 📋 [Tasks](${kantataUrl}/tracker) |
| 💬 [Activity](${kantataUrl}/activity) | ⏱️ [Time & Expenses](${kantataUrl}/time) |

---

## 📝 Notes

*Add your notes about this project here...*



---

<small>

| Created | Updated | Synced |
|---------|---------|--------|
| ${this.formatDate(details.createdAt)} | ${this.formatDate(details.updatedAt)} | ${new Date().toLocaleString()} |

*Auto-generated by KantataSync*${refreshLine}

</small>
`;
    }

    async createDashboardNote(folderName: string, workspaceId: string): Promise<void> {
        if (!this.settings.createDashboardNote) return;

        const details = await this.fetchWorkspaceDetails(workspaceId);
        if (!details) {
            console.warn('[KantataSync] Could not fetch details for dashboard note');
            return;
        }

        const content = this.generateDashboardContent(details, workspaceId, false);
        const notePath = `${folderName}/${this.settings.dashboardNoteName}`;
        
        try {
            const exists = await this.app.vault.adapter.exists(notePath);
            if (!exists) {
                await this.app.vault.create(notePath, content);
                console.debug(`[KantataSync] Created dashboard: ${notePath}`);
            }
        } catch (e) {
            console.warn(`[KantataSync] Could not create dashboard note:`, e);
        }
    }

    async updateDashboardNote(folderName: string, workspaceId: string): Promise<boolean> {
        // Check if folder exists first
        const folderExists = await this.app.vault.adapter.exists(folderName);
        if (!folderExists) {
            console.debug(`[KantataSync] Skipping dashboard update - folder doesn't exist: ${folderName}`);
            return false;
        }

        const details = await this.fetchWorkspaceDetails(workspaceId);
        if (!details) {
            console.warn('[KantataSync] Could not fetch details for dashboard update');
            return false;
        }

        // Skip dashboard update for deleted workspaces (they're handled by archive logic)
        if (details.deleted) {
            console.debug(`[KantataSync] Skipping dashboard update - workspace was deleted: ${folderName}`);
            return false;
        }

        const content = this.generateDashboardContent(details, workspaceId, true);

        const notePath = `${folderName}/${this.settings.dashboardNoteName}`;
        
        try {
            const file = this.app.vault.getAbstractFileByPath(notePath);
            if (file instanceof TFile) {
                await this.app.vault.modify(file, content);
                console.debug(`[KantataSync] Updated dashboard: ${notePath}`);
                return true;
            } else {
                // Dashboard doesn't exist, create it
                await this.app.vault.create(notePath, content);
                console.debug(`[KantataSync] Created dashboard: ${notePath}`);
                return true;
            }
        } catch (e) {
            console.warn(`[KantataSync] Could not update dashboard note:`, e);
            return false;
        }
    }

    async refreshCurrentDashboard(): Promise<void> {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
            new Notice('No active file');
            return;
        }

        const cacheResult = this.findCacheEntry(file);
        if (!cacheResult) {
            const customerName = this.getCustomerName(file);
            new Notice(`Folder "${customerName}" is not linked to a workspace`);
            return;
        }

        new Notice('Refreshing dashboard...');
        const success = await this.updateDashboardNote(cacheResult.path, cacheResult.entry.workspaceId);
        
        if (success) {
            // Also update cache with fresh status
            const workspaces = await this.fetchAllWorkspaces();
            const workspace = workspaces.find(w => w.id === cacheResult.entry.workspaceId);
            if (workspace) {
                this.workspaceCache[cacheResult.path].workspaceStatus = workspace.status;
                this.workspaceCache[cacheResult.path].workspaceStatusColor = workspace.statusColor;
                await this.saveWorkspaceCache();
            }
            new Notice(`✅ Dashboard refreshed for "${cacheResult.path}"`);
        } else {
            new Notice(`❌ failed to refresh dashboard`);
        }
    }

    async refreshAllDashboards(): Promise<void> {
        const entries = Object.entries(this.workspaceCache);
        if (entries.length === 0) {
            new Notice('No linked workspaces to refresh');
            return;
        }

        new Notice(`Refreshing ${entries.length} dashboards...`);
        let updated = 0;
        let failed = 0;

        for (const [folderName, cached] of entries) {
            const success = await this.updateDashboardNote(folderName, cached.workspaceId);
            if (success) {
                updated++;
            } else {
                failed++;
            }
        }

        // Refresh workspace statuses in cache
        try {
            const workspaces = await this.fetchAllWorkspaces();
            for (const workspace of workspaces) {
                const folderName = Object.keys(this.workspaceCache).find(
                    k => this.workspaceCache[k].workspaceId === workspace.id
                );
                if (folderName) {
                    this.workspaceCache[folderName].workspaceStatus = workspace.status;
                    this.workspaceCache[folderName].workspaceStatusColor = workspace.statusColor;
                }
            }
            await this.saveWorkspaceCache();
        } catch (e) {
            console.warn('[KantataSync] Could not refresh status cache:', e);
        }

        new Notice(`✅ Dashboards refreshed: ${updated} updated, ${failed} failed`);
    }

    async showWorkspacePicker(customerName: string): Promise<{ id: string; title: string } | null> {
        try {
            const workspaces = await this.fetchAllWorkspaces();
            const linkedIds = new Set(Object.values(this.workspaceCache).map(c => c.workspaceId));
            const unlinked = workspaces.filter(w => !linkedIds.has(w.id));

            if (unlinked.length === 0) {
                new Notice('No available workspaces to link (all are already linked to other folders)');
                return null;
            }

            const modal = new WorkspacePickerModal(this.app, unlinked, customerName);
            const selected = await modal.waitForSelection();

            if (selected) {
                this.workspaceCache[customerName] = {
                    workspaceId: selected.id,
                    workspaceTitle: selected.title,
                    cachedAt: new Date().toISOString()
                };
                await this.saveWorkspaceCache();
                new Notice(`✅ Linked "${customerName}" → "${selected.title}"`);
                return { id: selected.id, title: selected.title };
            }

            return null;
        } catch (err) { const e = err as Error;
            console.warn('Workspace picker error:', e);
            new Notice(`Error selecting workspace: ${e.message}`);
            return null;
        }
    }

    // ==================== SYNC ====================

    async checkForConflict(postId: string, syncedAt: string): Promise<boolean> {
        try {
            const response = await this.apiRequest(`/posts/${postId}.json`);
            const posts = Object.values(response.posts || {}) as Record<string, unknown>[];
            if (posts.length === 0) return false;

            const post = posts[0];
            const remoteTime = new Date(post.updated_at).getTime();
            const localTime = new Date(syncedAt).getTime();
            return remoteTime > localTime;
        } catch (e) {
            console.warn('Could not check for conflict:', e);
            return false;
        }
    }

    async createPost(workspaceId: string, message: string): Promise<string> {
        const response = await this.apiRequest('/posts.json', 'POST', {
            post: {
                workspace_id: workspaceId,
                message
            }
        });

        const posts = Object.values(response.posts || {}) as Array<{ id: string }>;
        if (posts.length > 0) {
            return posts[0].id;
        }
        const results = response.results as Array<{ id: string }> | undefined;
        if (results && results.length > 0) {
            return results[0].id;
        }
        throw new Error('Failed to get post ID from response');
    }

    async updatePost(postId: string, message: string): Promise<void> {
        await this.apiRequest(`/posts/${postId}.json`, 'PUT', {
            post: { message }
        });
    }

    async deletePost(postId: string): Promise<void> {
        await this.apiRequest(`/posts/${postId}.json`, 'DELETE');
    }

    /**
     * Delete the synced post from Kantata
     */
    async deleteFromKantata(): Promise<void> {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
            new Notice('❌ no active file');
            return;
        }

        const content = await this.app.vault.read(file);
        const { frontmatter } = this.parseFrontmatter(content);
        
        if (!frontmatter.kantata_post_id) {
            // eslint-disable-next-line obsidianmd/ui/sentence-case
            new Notice('❌ this note has not been synced to Kantata');
            return;
        }

        // Confirm deletion using modal
        new ConfirmModal(this.app, 'Delete this post from Kantata? This cannot be undone.', () => {
            void (async () => {
                try {
                    // eslint-disable-next-line obsidianmd/ui/sentence-case
                    new Notice('🗑️ deleting from Kantata...');
                    await this.deletePost(frontmatter.kantata_post_id);
                    
                    // Clear sync frontmatter
                    await this.updateFrontmatter(file, {
                        kantata_synced: false,
                        kantata_post_id: null,
                        kantata_synced_at: null
                    });
                    
                    // eslint-disable-next-line obsidianmd/ui/sentence-case
                    new Notice('✅ post deleted from Kantata');
                    
                    // Refresh status bar
                    await this.updateStatusBarForFile(file);
                    await this.updateRibbonIcons(file);
                } catch (e) {
                    const error = e as Error;
                    new Notice(`❌ Failed to delete: ${error.message}`);
                }
            })();
        }, 'Delete', 'Cancel').open();
    }

    parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
        if (!content.startsWith('---')) {
            return { frontmatter: {}, body: content };
        }

        const lines = content.split('\n');
        let endIndex = -1;

        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() === '---') {
                endIndex = i;
                break;
            }
        }

        if (endIndex === -1) {
            return { frontmatter: {}, body: content };
        }

        const fmContent = lines.slice(1, endIndex).join('\n');
        const body = lines.slice(endIndex + 1).join('\n').trim();
        const frontmatter: Record<string, unknown> = {};

        for (const line of fmContent.split('\n')) {
            const match = line.match(/^(\w+):\s*(.*)$/);
            if (match) {
                let value = match[2].trim();
                if (value === 'true') value = true;
                else if (value === 'false') value = false;
                else if (value.startsWith("'") && value.endsWith("'")) {
                    value = value.slice(1, -1);
                }
                frontmatter[match[1]] = value;
            }
        }

        return { frontmatter, body };
    }

    async updateFrontmatter(file: TFile, updates: Record<string, unknown>): Promise<void> {
        const content = await this.app.vault.read(file);
        const { frontmatter, body } = this.parseFrontmatter(content);
        
        // Apply updates, removing keys with null values
        for (const [key, value] of Object.entries(updates)) {
            if (value === null || value === undefined) {
                delete frontmatter[key];
            } else {
                frontmatter[key] = value;
            }
        }

        const fmString = Object.entries(frontmatter)
            .map(([k, v]) => {
                if (typeof v === 'string') {
                    // Escape quotes and use appropriate quoting style
                    if (v.includes("'") && v.includes('"')) {
                        // Both quote types - escape single quotes and use single quotes
                        return `${k}: '${v.replace(/'/g, "''")}'`;
                    } else if (v.includes("'")) {
                        // Single quotes - use double quotes
                        return `${k}: "${v}"`;
                    } else {
                        // No single quotes - use single quotes
                        return `${k}: '${String(v)}'`;
                    }
                }
                return `${k}: ${String(v)}`;
            })
            .join('\n');

        const newContent = `---\n${fmString}\n---\n\n${body}`;
        await this.app.vault.modify(file, newContent);
    }

    getCustomerName(file: TFile): string {
        const parts = file.path.split('/');
        if (parts.length >= 2) {
            return parts[parts.length - 2];
        }
        return file.parent?.name || '';
    }

    /**
     * Get template with placeholders replaced
     * Placeholders: {{customer}}, {{date}}, {{time}}, {{attendees}}
     */
    getTemplate(customerName: string, dateStr: string, timeStr: string): string {
        const defaultTemplate = `==**Meeting Details**==
**Customer:** {{customer}}
**Work Session:** {{date}} @ {{time}}
**Our Attendees:**
**{{customer}} Attendees:**

==**Activities/Notes**==

**Accomplishments:**

**Issues:**

**Blockers:**

**Next Session:**
**Next Steps:**

---

<u>Internal Notes</u>
`;
        
        const template = this.settings.customTemplate?.trim() || defaultTemplate;
        
        return template
            .replace(/\{\{customer\}\}/g, customerName)
            .replace(/\{\{date\}\}/g, dateStr)
            .replace(/\{\{time\}\}/g, timeStr);
    }

    /**
     * Find the cache entry for a file, handling archived folder paths.
     * Checks multiple possible paths: direct parent folder, archived path, and full path variations.
     */
    findCacheEntry(file: TFile): { path: string; entry: WorkspaceCacheEntry } | null {
        const parts = file.path.split('/');
        if (parts.length < 2) return null;

        // Get the folder containing this file
        const folderPath = parts.slice(0, -1).join('/');
        const folderName = parts[parts.length - 2];
        
        // Try direct folder path first
        if (this.workspaceCache[folderPath]) {
            return { path: folderPath, entry: this.workspaceCache[folderPath] };
        }
        
        // Try just the folder name (for backwards compatibility)
        if (this.workspaceCache[folderName]) {
            return { path: folderName, entry: this.workspaceCache[folderName] };
        }
        
        // Try with archive prefix if not already archived
        const archiveFolder = this.settings.archiveFolderName;
        if (!folderPath.startsWith(archiveFolder + '/')) {
            const archivedPath = `${archiveFolder}/${folderName}`;
            if (this.workspaceCache[archivedPath]) {
                return { path: archivedPath, entry: this.workspaceCache[archivedPath] };
            }
        }
        
        // Try customersFolder variations
        if (this.settings.customersFolder !== '.') {
            const withPrefix = `${this.settings.customersFolder}/${folderName}`;
            if (this.workspaceCache[withPrefix]) {
                return { path: withPrefix, entry: this.workspaceCache[withPrefix] };
            }
        }
        
        return null;
    }

    stripForSync(content: string): string {
        let result = content;
        result = result.replace(/^>\s*\[!kantata\][^\n]*\n?/gm, '');

        const internalMarkers = [
            '<u>Internal Notes</u>',
            '## Internal Notes',
            '### Internal Notes',
            '**Internal Notes**'
        ];

        for (const marker of internalMarkers) {
            if (result.includes(marker)) {
                result = result.split(marker)[0];
            }
        }

        return result.trim();
    }

    async addWorkspaceBanner(file: TFile, workspaceId: string, workspaceTitle: string): Promise<void> {
        const content = await this.app.vault.read(file);
        const { frontmatter, body } = this.parseFrontmatter(content);
        const baseUrl = this.settings.apiBaseUrl.replace('/api/v1', '');
        const banner = `> [!kantata] 📁 [${workspaceTitle}](${baseUrl}/workspaces/${workspaceId})`;

        let newBody: string;
        if (body.includes('[!kantata]')) {
            newBody = body.replace(/^>\s*\[!kantata\][^\n]*\n?/m, banner + '\n');
        } else {
            newBody = `${banner}\n\n${body}`;
        }

        const fmString = Object.entries(frontmatter)
            .map(([k, v]) => typeof v === 'string' ? `${k}: '${v}'` : `${k}: ${String(v)}`)
            .join('\n');

        const newContent = `---\n${fmString}\n---\n\n${newBody}`;
        await this.app.vault.modify(file, newContent);
    }

    async syncNote(file: TFile): Promise<{ success: boolean; error?: string; postId?: string; updated?: boolean }> {
        try {
            const content = await this.app.vault.read(file);
            const { frontmatter, body } = this.parseFrontmatter(content);
            const cleanBody = this.stripForSync(body);

            if (!cleanBody.trim()) {
                return { success: false, error: 'Note is empty after processing' };
            }

            const message = `## ${file.basename}\n\n${cleanBody}`;

            if (message.length > 10000) {
                return { success: false, error: `Note exceeds 10000 char limit (${message.length} chars)` };
            }

            // Update existing post
            if (frontmatter.kantata_synced === true && frontmatter.kantata_post_id) {
                if (frontmatter.kantata_synced_at && await this.checkForConflict(frontmatter.kantata_post_id, frontmatter.kantata_synced_at)) {
                    return {
                        success: false,
                        error: '⚠️ Conflict: Post was modified in Kantata since last sync. Check Kantata before updating.',
                        postId: frontmatter.kantata_post_id
                    };
                }

                await this.updatePost(frontmatter.kantata_post_id, message);
                await this.updateFrontmatter(file, {
                    kantata_synced_at: new Date().toISOString()
                });
                return { success: true, postId: frontmatter.kantata_post_id, updated: true };
            }

            // Create new post
            const customerName = this.getCustomerName(file);
            if (!customerName) {
                return { success: false, error: 'Could not determine customer from path' };
            }

            const workspace = await this.searchWorkspace(customerName);
            if (!workspace) {
                return { success: false, error: `No workspace found for '${customerName}'` };
            }

            const postId = await this.createPost(workspace.id, message);
            await this.updateFrontmatter(file, {
                kantata_synced: true,
                kantata_post_id: postId,
                kantata_workspace_id: workspace.id,
                kantata_synced_at: new Date().toISOString()
            });
            await this.addWorkspaceBanner(file, workspace.id, workspace.title);

            return { success: true, postId };
        } catch (err) { const e = err as Error;
            console.warn('[KantataSync] syncNote ERROR:', e);
            return { success: false, error: e.message };
        }
    }

    async syncCurrentNote(): Promise<void> {
        // Prevent duplicate submissions
        if (this.isSyncing) {
            new Notice('⏳ sync already in progress...');
            return;
        }

        const file = this.app.workspace.getActiveFile();
        if (!file) {
            new Notice('No active file');
            return;
        }

        if (file.extension !== 'md') {
            new Notice('Not a Markdown file');
            return;
        }

        this.isSyncing = true;
        void this.updateStatusBar('📝 Note Sync: ⏳', 'Syncing to Kantata...');
        // eslint-disable-next-line obsidianmd/ui/sentence-case
        new Notice('Syncing to Kantata...');

        try {
            const result = await this.syncNote(file);

            if (result.success && result.updated) {
                new Notice(`🔄 Updated in Kantata! post ID: ${result.postId}`);
                void this.updateStatusBar('📝 Note Sync: ✅ Updated', 'Note synced to Kantata');
            } else if (result.success && result.postId) {
                new Notice(`✅ Synced to Kantata! post ID: ${result.postId}`);
                void this.updateStatusBar('📝 Note Sync: ✅ Synced', 'Note synced to Kantata');
            } else {
                new Notice(`❌ Sync failed: ${result.error}`);
                void this.updateStatusBar('📝 Note Sync: ❌ Failed', 'Sync failed');
            }

            setTimeout(() => { void this.updateStatusBarForFile(file); }, 3000);
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Create AI time entry for the current note (separate from note sync)
     */
    async createTimeEntryForCurrentNote(): Promise<void> {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
            new Notice('No active file');
            return;
        }

        if (file.extension !== 'md') {
            new Notice('Not a Markdown file');
            return;
        }

        // Check if AI time entry is enabled
        if (!this.settings.enableAiTimeEntry) {
            new Notice('⚠️ AI time entry is disabled. Enable it in settings.');
            return;
        }

        // Check credentials
        if (!this.hasAiCredentials()) {
            new Notice(`⚠️ ${this.settings.aiProvider} credentials not configured`);
            return;
        }

        // Read note content
        const content = await this.app.vault.read(file);
        const { frontmatter, body } = this.parseFrontmatter(content);
        const cleanBody = this.stripForSync(body);

        if (!cleanBody.trim()) {
            new Notice('Note is empty');
            return;
        }

        // Check if time entry already exists
        if (frontmatter.kantata_time_entry_id) {
            const entryId = typeof frontmatter.kantata_time_entry_id === 'string' 
                ? frontmatter.kantata_time_entry_id 
                : JSON.stringify(frontmatter.kantata_time_entry_id);
            new Notice(`⚠️ Time entry already exists: ${entryId}`);
            return;
        }

        // Get customer name from folder
        const customerName = this.getCustomerName(file) || 'Customer';

        // Get workspace ID - either from frontmatter or search
        let workspaceId = frontmatter.kantata_workspace_id;
        if (!workspaceId) {
            if (!customerName || customerName === 'Customer') {
                new Notice('Could not determine customer from path');
                return;
            }
            const workspace = await this.searchWorkspace(customerName);
            if (!workspace) {
                new Notice(`No workspace found for '${customerName}'`);
                return;
            }
            workspaceId = workspace.id;
        }

        // Create time entry
        void this.updateStatusBar('⏱️ Time: ⏳', 'Creating time entry...');
        new Notice('🤖 analyzing note and creating time entry...');

        const result = await this.processAiTimeEntry(workspaceId, cleanBody, customerName);

        if (result.success && result.timeEntryId) {
            // Save time entry ID to frontmatter (also update synced_at to prevent "out of sync" status)
            await this.updateFrontmatter(file, {
                kantata_time_entry_id: result.timeEntryId,
                kantata_time_synced_at: new Date().toISOString(),
                kantata_synced_at: new Date().toISOString()
            });
            new Notice(`✅ Time entry created! ID: ${result.timeEntryId}`);
            void this.updateStatusBar('⏱️ Time: ✅', 'Time entry created');
        } else {
            new Notice(`❌ Time entry failed: ${result.error}`);
            void this.updateStatusBar('⏱️ Time: ❌', 'Time entry failed');
        }

        setTimeout(() => { void this.updateStatusBarForFile(file); }, 3000);
    }

    /**
     * Update existing time entry with AI-analyzed content from current note
     */
    async updateTimeEntryWithAI(): Promise<void> {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
            new Notice('No active file');
            return;
        }

        if (file.extension !== 'md') {
            new Notice('Not a Markdown file');
            return;
        }

        // Check if AI time entry is enabled
        if (!this.settings.enableAiTimeEntry) {
            new Notice('⚠️ AI time entry is disabled. Enable it in settings.');
            return;
        }

        // Check credentials
        if (!this.hasAiCredentials()) {
            new Notice(`⚠️ ${this.settings.aiProvider} credentials not configured`);
            return;
        }

        // Read note content
        const content = await this.app.vault.read(file);
        const { frontmatter, body } = this.parseFrontmatter(content);
        const cleanBody = this.stripForSync(body);

        if (!cleanBody.trim()) {
            new Notice('Note is empty');
            return;
        }

        // Check if time entry exists
        const timeEntryId = frontmatter.kantata_time_entry_id;
        if (!timeEntryId) {
            new Notice('⚠️ no time entry to update. Create one first.');
            return;
        }

        // Get workspace ID
        let workspaceId = frontmatter.kantata_workspace_id;
        if (!workspaceId) {
            const cacheResult = this.findCacheEntry(file);
            if (cacheResult) {
                workspaceId = cacheResult.entry.workspaceId;
            } else {
                new Notice('Could not determine workspace');
                return;
            }
        }

        // Analyze note with AI
        void this.updateStatusBar('⏱️ Time: ⏳', 'Updating time entry...');
        new Notice('🤖 analyzing note and updating time entry...');

        try {
            // Get available stories/tasks
            const stories = await this.fetchBillableStories(workspaceId);
            const storyTitles = stories.map(s => s.title);
            
            if (storyTitles.length === 0) {
                storyTitles.push('General'); // Fallback
            }
            
            // Analyze with AI
            const analysis = await this.analyzeNoteForTimeEntry(cleanBody, storyTitles);
            
            // Proofread notes for Kantata
            let finalNotes = `${analysis.summary}\n\n${analysis.notes}`;
            finalNotes = await this.proofreadForKantata(finalNotes);
            
            // Find matching story
            const storyId = this.findMatchingStory(analysis.category, stories);
            
            // Update the time entry
            await this.updateTimeEntry(timeEntryId, {
                time_in_minutes: Math.round(analysis.hours * 60),
                notes: finalNotes,
                story_id: storyId || undefined
            });
            
            // Update frontmatter timestamps (both time and note sync to prevent "out of sync" status)
            await this.updateFrontmatter(file, {
                kantata_time_synced_at: new Date().toISOString(),
                kantata_synced_at: new Date().toISOString()
            });
            
            new Notice(`✅ Time entry updated! (${analysis.hours}h)`);
            void this.updateStatusBar('⏱️ Time: ✅', 'Time entry updated');
        } catch (err) { const e = err as Error;
            new Notice(`❌ Update failed: ${e.message}`);
            void this.updateStatusBar('⏱️ Time: ❌', 'Update failed');
        }

        setTimeout(() => { void this.updateStatusBarForFile(file); }, 3000);
    }

    /**
     * Undo the last time entry
     */
    async undoLastTimeEntry(): Promise<void> {
        if (!this.lastTimeEntry) {
            new Notice('❌ no time entry to undo');
            return;
        }

        try {
            new Notice('🔄 undoing time entry...');
            await this.deleteTimeEntry(this.lastTimeEntry.id);
            new Notice(`✅ Time entry ${this.lastTimeEntry.id} deleted`);
            
            // Clear the stored entry
            this.lastTimeEntry = null;
        } catch (err) { const e = err as Error;
            new Notice(`❌ Failed to undo: ${e.message}`);
        }
    }

    /**
     * Open manual time entry modal
     */
    async openManualTimeEntryModal(): Promise<void> {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
            new Notice('❌ no active file - open a note in a linked folder');
            return;
        }

        // Find linked workspace
        const cacheResult = this.findCacheEntry(file);
        if (!cacheResult) {
            // eslint-disable-next-line obsidianmd/ui/sentence-case
            new Notice('❌ folder not linked to Kantata workspace');
            return;
        }

        const workspaceId = cacheResult.entry.workspaceId;
        
        // Check for existing time entry
        const content = await this.app.vault.read(file);
        const { frontmatter } = this.parseFrontmatter(content);
        const existingEntryId = frontmatter.kantata_time_entry_id as string | undefined;
        
        new Notice(existingEntryId ? '📋 Loading time entry...' : '📋 Loading tasks...');

        try {
            // Fetch tasks/stories for this workspace
            const tasks = await this.getWorkspaceTasks(workspaceId);
            
            if (tasks.length === 0) {
                // eslint-disable-next-line obsidianmd/ui/sentence-case
                new Notice('❌ no tasks found in workspace - create a task in Kantata first');
                return;
            }

            // Check if editing existing entry
            let existingEntry: { id: string; hours: number; notes: string; storyId: string } | undefined;
            if (existingEntryId) {
                try {
                    const entry = await this.getTimeEntry(existingEntryId);
                    if (entry) {
                        existingEntry = {
                            id: existingEntryId,
                            hours: parseFloat(entry.time_in_minutes) / 60 || 1,
                            notes: entry.notes || '',
                            storyId: entry.story_id?.toString() || tasks[0].id
                        };
                    }
                } catch {
                    console.debug('[KantataSync] Could not load existing time entry, showing create form');
                }
            }

            // Open modal
            const modal = new ManualTimeEntryModal(
                this.app,
                this,
                workspaceId,
                tasks,
                (taskId, hours, notes) => {
                    void (async () => {
                        try {
                            new Notice('⏱️ creating time entry...');
                            const userId = await this.getCurrentUserId();
                            const today = new Date().toISOString().split('T')[0];
                            
                            const timeEntryId = await this.createTimeEntry(workspaceId, userId, taskId, {
                                date: today,
                                hours: hours,
                                notes: notes
                            });

                            // Store for undo
                            this.lastTimeEntry = {
                                id: timeEntryId,
                                workspaceId: workspaceId,
                                data: { taskId, hours, notes }
                            };

                            new Notice(`✅ Time entry created! ${hours} hours logged`);

                            // Update frontmatter if we have an active file
                            const activeFile = this.app.workspace.getActiveFile();
                            if (activeFile) {
                                await this.updateFrontmatter(activeFile, {
                                    kantata_time_entry_id: timeEntryId,
                                    kantata_time_synced_at: new Date().toISOString(),
                                    kantata_synced_at: new Date().toISOString()
                                });
                                setTimeout(() => { void this.updateStatusBarForFile(activeFile); }, 1000);
                            }
                        } catch (err) { const e = err as Error;
                            new Notice(`❌ Failed to create time entry: ${e.message}`);
                        }
                    })();
                },
                existingEntry,
                (taskId, hours, notes) => {
                    // Update callback for edit mode
                    void (async () => {
                        try {
                            new Notice('⏱️ updating time entry...');
                            await this.updateTimeEntry(existingEntryId!, { 
                                time_in_minutes: Math.round(hours * 60),
                                notes: notes,
                                story_id: taskId
                            });
                            new Notice(`✅ Time entry updated! ${hours} hours`);
                            
                            // Update frontmatter timestamp
                            const activeFile = this.app.workspace.getActiveFile();
                            if (activeFile) {
                                await this.updateFrontmatter(activeFile, {
                                    kantata_time_synced_at: new Date().toISOString(),
                                    kantata_synced_at: new Date().toISOString()
                                });
                                setTimeout(() => { void this.updateStatusBarForFile(activeFile); }, 1000);
                                setTimeout(() => { void this.updateRibbonIcons(activeFile); }, 1000);
                            }
                        } catch (err) { const e = err as Error;
                            new Notice(`❌ Failed to update time entry: ${e.message}`);
                        }
                    })();
                },
                () => {
                    // Delete callback for edit mode
                    void (async () => {
                        try {
                            new Notice('🗑️ deleting time entry...');
                            await this.deleteTimeEntry(existingEntryId!);
                            new Notice('✅ time entry deleted');
                            
                            // Clear time entry frontmatter (keep note sync status)
                            const activeFile = this.app.workspace.getActiveFile();
                            if (activeFile) {
                                await this.updateFrontmatter(activeFile, {
                                    kantata_time_entry_id: null,
                                    kantata_time_synced_at: null,
                                    kantata_synced_at: new Date().toISOString() // Preserve note sync status
                                });
                                setTimeout(() => { void this.updateStatusBarForFile(activeFile); }, 1000);
                                setTimeout(() => { void this.updateRibbonIcons(activeFile); }, 1000);
                            }
                        } catch (err) { const e = err as Error;
                            new Notice(`❌ Failed to delete time entry: ${e.message}`);
                        }
                    })();
                }
            );
            modal.open();
        } catch (err) { const e = err as Error;
            new Notice(`❌ Failed to load tasks: ${e.message}`);
        }
    }

    /**
     * Get tasks/stories for a workspace
     */
    async getWorkspaceTasks(workspaceId: string): Promise<TaskOption[]> {
        const response = await this.apiRequest(`/stories.json?workspace_id=${workspaceId}&per_page=100`);
        // Kantata returns stories as an object keyed by ID, not an array
        const storiesObj = (response.stories || {}) as Record<string, Record<string, unknown>>;
        const stories = Object.values(storiesObj);
        
        return stories.map((story) => ({
            id: String(story.id),
            title: (story.title as string) || `Task ${String(story.id)}`
        }));
    }

    /**
     * Get time entry details by ID
     */
    async getTimeEntry(timeEntryId: string): Promise<Record<string, unknown> | null> {
        const response = await this.apiRequest(`/time_entries/${timeEntryId}.json`);
        const entries = Object.values(response.time_entries || {}) as Record<string, unknown>[];
        return entries[0] || null;
    }

    /**
     * Update an existing time entry
     */
    async updateTimeEntry(timeEntryId: string, data: { time_in_minutes?: number; notes?: string; story_id?: string }): Promise<void> {
        await this.apiRequest(`/time_entries/${timeEntryId}.json`, 'PUT', {
            time_entry: data
        });
        console.debug(`[KantataSync] Updated time entry: ${timeEntryId}`);
    }

    /**
     * Open modal to change workspace status
     */
    openStatusChangeModal(): void {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
            new Notice('❌ no active file - open a note in a linked folder');
            return;
        }

        const cacheResult = this.findCacheEntry(file);
        if (!cacheResult) {
            // eslint-disable-next-line obsidianmd/ui/sentence-case
            new Notice('❌ folder not linked to Kantata workspace');
            return;
        }

        const workspaceId = cacheResult.entry.workspaceId;
        const currentStatus = cacheResult.entry.workspaceStatus || 'Unknown';
        
        new Notice('🎯 loading statuses...');

        try {
            // Fetch available statuses from Kantata
            const statuses = this.getWorkspaceStatuses();
            
            if (statuses.length === 0) {
                new Notice('❌ no statuses available');
                return;
            }

            const modal = new StatusChangeModal(
                this.app,
                statuses,
                currentStatus,
                (status) => {
                    void (async () => {
                        try {
                            new Notice(`🔄 Changing status to ${status.message}...`);
                            await this.updateWorkspaceStatus(workspaceId, status.key);
                            
                            // Update cache
                            cacheResult.entry.workspaceStatus = status.message;
                            cacheResult.entry.workspaceStatusColor = status.color;
                            await this.saveWorkspaceCache();
                            
                            // Refresh status bar
                            await this.updateStatusBarForFile(file);
                            
                            new Notice(`✅ Status changed to ${status.message}`);
                        } catch (err) { const e = err as Error;
                            new Notice(`❌ Failed to change status: ${e.message}`);
                        }
                    })();
                }
            );
            modal.open();
        } catch (err) { const e = err as Error;
            new Notice(`❌ Failed to load statuses: ${e.message}`);
        }
    }

    /**
     * Get available workspace statuses from official Kantata status list
     * Source: https://knowledge.kantata.com/hc/en-us/articles/115005042433-Project-Status#Project-Status-List
     * Note: Account admins can disable some statuses, but cannot create custom ones
     */
    getWorkspaceStatuses(): StatusOption[] {
        // Official Kantata project status list (canonical source)
        // Organized by color category
        return [
            // Gray - Not yet started
            { key: '100', message: 'Backlog', color: 'gray' },
            { key: '105', message: 'Bid Stage', color: 'gray' },
            { key: '107', message: 'Contingent', color: 'gray' },
            { key: '110', message: 'Estimate', color: 'gray' },
            { key: '115', message: 'In Planning', color: 'gray' },
            { key: '120', message: 'In Setup', color: 'gray' },
            { key: '125', message: 'Inactive', color: 'gray' },
            { key: '130', message: 'Not Started', color: 'gray' },
            { key: '135', message: 'On Hold', color: 'gray' },
            { key: '138', message: 'Pipeline', color: 'gray' },
            { key: '140', message: 'Proposed', color: 'gray' },
            { key: '143', message: 'Prospect', color: 'gray' },
            { key: '145', message: 'Quality Control', color: 'gray' },
            // Light Green - Close to starting
            { key: '200', message: 'Approved', color: 'light_green' },
            { key: '205', message: 'Confirmed', color: 'light_green' },
            { key: '207', message: 'Contingent', color: 'light_green' },
            { key: '210', message: 'Okay to Start', color: 'light_green' },
            { key: '213', message: 'Pending', color: 'light_green' },
            { key: '215', message: 'Ready', color: 'light_green' },
            { key: '220', message: 'Scheduled', color: 'light_green' },
            { key: '225', message: 'Quality Control', color: 'light_green' },
            { key: '234', message: 'Smart Start', color: 'light_green' },
            { key: '235', message: 'Tech Setup', color: 'light_green' },
            { key: '255', message: 'Not Started', color: 'light_green' },
            // Green - In progress
            { key: '300', message: 'Active', color: 'green' },
            { key: '305', message: 'In Development', color: 'green' },
            { key: '310', message: 'In Progress', color: 'green' },
            { key: '315', message: 'In Testing', color: 'green' },
            { key: '317', message: 'Live', color: 'green' },
            { key: '320', message: 'On Track', color: 'green' },
            { key: '325', message: 'Ready for Testing', color: 'green' },
            { key: '330', message: 'Started', color: 'green' },
            { key: '335', message: 'Quality Control', color: 'green' },
            { key: '340', message: 'UAT', color: 'green' },
            // Yellow - In progress with pending action
            { key: '400', message: 'Alert', color: 'yellow' },
            { key: '401', message: 'Active', color: 'yellow' },
            { key: '403', message: 'At Risk', color: 'yellow' },
            { key: '405', message: 'Issue', color: 'yellow' },
            { key: '410', message: 'Keep Watch', color: 'yellow' },
            { key: '415', message: 'Late', color: 'yellow' },
            { key: '420', message: 'Needs Review', color: 'yellow' },
            { key: '423', message: 'On Hold', color: 'yellow' },
            { key: '425', message: 'Over Budget', color: 'yellow' },
            { key: '430', message: 'Past Due', color: 'yellow' },
            { key: '435', message: 'Pending Approval', color: 'yellow' },
            { key: '440', message: 'Priority', color: 'yellow' },
            { key: '445', message: 'Requires Feedback', color: 'yellow' },
            { key: '450', message: 'Requires Follow-up', color: 'yellow' },
            { key: '455', message: 'Requires Research', color: 'yellow' },
            { key: '459', message: 'Quality Control', color: 'yellow' },
            { key: '465', message: 'UAT', color: 'yellow' },
            // Red - Blocked or ended
            { key: '500', message: 'Alert', color: 'red' },
            { key: '501', message: 'Active', color: 'red' },
            { key: '505', message: 'Blocked', color: 'red' },
            { key: '510', message: 'Canceled', color: 'red' },
            { key: '513', message: 'Canceled - Change Order', color: 'red' },
            { key: '515', message: 'Concern', color: 'red' },
            { key: '520', message: 'Late Payment', color: 'red' },
            { key: '525', message: 'On Hold', color: 'red' },
            { key: '530', message: 'Suspended', color: 'red' },
            { key: '535', message: 'Terminated', color: 'red' },
            { key: '540', message: 'Rejected', color: 'red' },
            { key: '545', message: 'Quality Control', color: 'red' },
            { key: '555', message: 'UAT', color: 'red' },
            // Blue - Finished
            { key: '600', message: 'Closed', color: 'blue' },
            { key: '601', message: 'Canceled', color: 'blue' },
            { key: '602', message: 'Canceled Confirmed', color: 'blue' },
            { key: '605', message: 'Completed', color: 'blue' },
            { key: '610', message: 'Delivered', color: 'blue' },
            { key: '615', message: 'Done', color: 'blue' },
            { key: '620', message: 'Shipped', color: 'blue' },
            { key: '625', message: 'Submitted', color: 'blue' },
            { key: '630', message: 'Quality Control', color: 'blue' },
        ];
    }

    /**
     * Update workspace status in Kantata using status_key
     */
    async updateWorkspaceStatus(workspaceId: string, statusKey: string): Promise<void> {
        // Kantata API uses status_key field
        await this.apiRequest(`/workspaces/${workspaceId}.json`, 'PUT', {
            workspace: {
                status_key: statusKey
            }
        });
        console.debug(`[KantataSync] Updated workspace ${workspaceId} status_key to: ${statusKey}`);
    }

    /**
     * Organize current note using AI template
     */
    async organizeCurrentNote(editor: { getValue(): string; setValue(value: string): void }): Promise<void> {
        console.debug('[KantataSync] organizeCurrentNote called!');
        new Notice('🔍 starting organize...');
        
        const file = this.app.workspace.getActiveFile();
        if (!file) {
            new Notice('❌ no active file');
            return;
        }

        // Get customer name from folder
        const folderPath = file.parent?.path || '';
        const customerName = folderPath.split('/').pop() || 'Customer';

        // Get current content (excluding frontmatter)
        const content = editor.getValue();
        const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n/);
        const frontmatter = frontmatterMatch ? frontmatterMatch[0] : '';
        const body = frontmatterMatch ? content.slice(frontmatter.length) : content;

        // If empty, just provide blank template (no AI needed)
        const bodyTrimmed = body.trim();
        const isEmpty = !bodyTrimmed || bodyTrimmed.length < 10;
        
        console.debug(`[KantataSync] Body length: ${bodyTrimmed.length}, isEmpty: ${isEmpty}`);

        // Only check AI credentials if we need AI (not empty)
        if (!isEmpty && !this.hasAiCredentials()) {
            new Notice(`❌ ${this.settings.aiProvider} credentials not configured`);
            return;
        }

        try {
            let organized: string;
            
            if (isEmpty) {
                // Provide blank template
                console.debug('[KantataSync] Note is empty, creating blank template');
                new Notice('📝 creating blank template...');
                const now = new Date();
                const roundedMinutes = Math.round(now.getMinutes() / 30) * 30;
                now.setMinutes(roundedMinutes);
                const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
                
                organized = this.getTemplate(customerName, dateStr, timeStr);
            } else {
                new Notice('🤖 organizing notes with AI...');
                
                // Save backup before AI processing
                const backupFolder = file.parent ? `${file.parent.path}/_Backups` : '_Backups';
                const backupFileName = `${file.basename}.backup.md`;
                const backupPath = `${backupFolder}/${backupFileName}`;
                
                try {
                    // Create backup folder if needed
                    if (!this.app.vault.getAbstractFileByPath(backupFolder)) {
                        await this.app.vault.createFolder(backupFolder);
                    }
                    // Save original content
                    await this.app.vault.create(backupPath, content);
                    console.debug(`[KantataSync] Backup saved: ${backupPath}`);
                } catch (e) {
                    // Backup already exists or failed - continue anyway
                    console.debug(`[KantataSync] Backup skipped: ${e}`);
                }
                
                // Extract and read images from note
                const imagePaths = this.extractImagePaths(body, file);
                const images: Array<{ base64: string; mediaType: string }> = [];
                
                if (imagePaths.length > 0) {
                    console.debug(`[KantataSync] Found ${imagePaths.length} images in note`);
                    for (const imgPath of imagePaths.slice(0, 5)) { // Limit to 5 images
                        const imgData = await this.readImageAsBase64(imgPath, file);
                        if (imgData) {
                            images.push(imgData);
                            console.debug(`[KantataSync] Loaded image: ${imgPath}`);
                        }
                    }
                }
                
                // Organize with AI (no longer passing original for Internal Notes)
                organized = await this.organizeNotesWithTemplate(body, customerName, undefined, images);
            }
            
            // Replace content (keep frontmatter)
            console.debug('[KantataSync] Setting editor value, organized length:', organized.length);
            editor.setValue(frontmatter + organized);
            console.debug('[KantataSync] Editor value set successfully');
            
            // Rename file to Work Session format: YYYY-MM-DD Work Session
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            const baseName = `${today} Work Session`;
            const folder = file.parent;
            
            if (folder) {
                // Check if file already has correct name
                const currentName = file.basename;
                if (!currentName.includes('Work Session')) {
                    // Find unique filename
                    let newName = baseName;
                    let counter = 2;
                    while (this.app.vault.getAbstractFileByPath(`${folder.path}/${newName}.md`)) {
                        newName = `${baseName} ${counter}`;
                        counter++;
                    }
                    
                    // Rename file
                    const newPath = `${folder.path}/${newName}.md`;
                    await this.app.fileManager.renameFile(file, newPath);
                    new Notice(`✅ Notes organized! renamed to: ${newName}`);
                } else {
                    new Notice('✅ notes organized!');
                }
            } else {
                new Notice('✅ notes organized!');
            }
        } catch (err) { const e = err as Error;
            new Notice(`❌ Failed to organize: ${e.message}`);
        }
    }
}

// ==================== SETTINGS TAB ====================

class KantataSettingTab extends PluginSettingTab {
    plugin: KantataSync;

    constructor(app: App, plugin: KantataSync) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl).setHeading();

        // API Settings
        new Setting(containerEl)
            .setName('Kantata API token')
            // eslint-disable-next-line obsidianmd/ui/sentence-case
            .setDesc('Your Kantata/Mavenlink OAUTH token (stored securely)')
            .addText(text => {
                text.setPlaceholder('Enter your token')
                    .setValue(this.plugin.getSecret('kantataToken') || '')
                    .onChange((value) => {
                        this.plugin.setSecret('kantataToken', value);
                    });
                text.inputEl.type = 'password';
            });

        new Setting(containerEl)
            .setName('API base URL')
            .setDesc('Kantata API endpoint (usually leave as default)')
            .addText(text => text
                .setValue(this.plugin.settings.apiBaseUrl)
                .onChange((value) => {
                    this.plugin.settings.apiBaseUrl = value;
                    void this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            // eslint-disable-next-line obsidianmd/ui/sentence-case
            .setName('Test Kantata connection')
            // eslint-disable-next-line obsidianmd/ui/sentence-case
            .setDesc('Verify your Kantata token works')
            .addButton(button => button
                .setButtonText('Test')
                .onClick(() => {
                    void (async () => {
                        try {
                            const response = await this.plugin.apiRequest('/users/me.json');
                            const users = Object.values(response.users || {}) as Array<{full_name: string}>;
                            if (users.length > 0) {
                                new Notice(`✅ Kantata connected as: ${users[0].full_name}`);
                            }
                        } catch (err) {
                            const e = err as Error;
                            new Notice(`❌ Kantata connection failed: ${e.message}`);
                        }
                    })();
                }));

        // Folder sync Settings
        new Setting(containerEl).setName('Folder sync').setHeading();

        new Setting(containerEl)
            .setName('Auto-sync folders on startup')
            // eslint-disable-next-line obsidianmd/ui/sentence-case
            .setDesc('Automatically create folders for new Kantata projects when Obsidian opens')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoSyncFoldersOnStartup)
                .onChange((value) => {
                    this.plugin.settings.autoSyncFoldersOnStartup = value;
                    void this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Enable folder polling')
            // eslint-disable-next-line obsidianmd/ui/sentence-case
            .setDesc('Periodically check for new Kantata workspaces and create folders')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enablePolling)
                .onChange((value) => {
                    this.plugin.settings.enablePolling = value;
                    void this.plugin.saveSettings();
                    this.plugin.setupPolling();
                }));

        new Setting(containerEl)
            .setName('Polling interval (minutes)')
            .setDesc('How often to check for new workspaces (minimum 5 minutes)')
            .addText(text => text
                .setValue(String(this.plugin.settings.pollingIntervalMinutes))
                .onChange((value) => {
                    const num = parseInt(value, 10);
                    if (!isNaN(num) && num >= 5) {
                        this.plugin.settings.pollingIntervalMinutes = num;
                        void this.plugin.saveSettings();
                        this.plugin.setupPolling();
                    }
                }));

        // Filtering
        new Setting(containerEl).setName('Workspace sync filtering').setHeading();

        new Setting(containerEl)
            .setName('Filter by status')
            .setDesc('Only create folders for workspaces with specific statuses')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.filterByStatus)
                .onChange((value) => {
                    this.plugin.settings.filterByStatus = value;
                    void this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Allowed statuses')
            .setDesc('Comma-separated list of statuses to include (e.g., active, in progress, not started)')
            .addText(text => text
                .setPlaceholder('Active, in progress, not started')
                .setValue(this.plugin.settings.allowedStatuses.join(', '))
                .onChange((value) => {
                    this.plugin.settings.allowedStatuses = value
                        .split(',')
                        .map(s => s.trim())
                        .filter(s => s.length > 0);
                    void this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Fetch and populate allowed statuses')
            // eslint-disable-next-line obsidianmd/ui/sentence-case
            .setDesc('Fetch all statuses from Kantata and populate the allowed list (then remove ones you don\'t want)')
            .addButton(button => button
                .setButtonText('Fetch & fill')
                .onClick(() => {
                    void (async () => {
                        try {
                            const workspaces = await this.plugin.fetchAllWorkspaces();
                            const statuses = [...new Set(workspaces.map(w => w.status || 'No Status'))].sort();
                            this.plugin.settings.allowedStatuses = statuses;
                            void this.plugin.saveSettings();
                            new Notice(`✅ Found ${statuses.length} statuses: ${statuses.join(', ')}`);
                            console.debug('[KantataSync] Populated allowed statuses:', statuses);
                            // Refresh the settings display to show updated value (preserve scroll)
                            const scrollParent = this.containerEl.closest('.vertical-tab-content') || this.containerEl;
                            const scrollTop = scrollParent.scrollTop;
                            this.display();
                            requestAnimationFrame(() => {
                                scrollParent.scrollTop = scrollTop;
                            });
                        } catch (err) {
                            const e = err as Error;
                            new Notice(`❌ Failed to fetch: ${e.message}`);
                        }
                    })();
                }));

        new Setting(containerEl)
            .setName('Ignore patterns')
            .setDesc('Workspace names matching these patterns will be skipped. One pattern per line. Use * for wildcard. Variable: {status}')
            .addTextArea(text => text
                .setPlaceholder('Test*\nInternal*\n*Template')
                .setValue(this.plugin.settings.ignorePatterns.join('\n'))
                .onChange((value) => {
                    this.plugin.settings.ignorePatterns = value
                        .split('\n')
                        .map(s => s.trim())
                        .filter(s => s.length > 0);
                    void this.plugin.saveSettings();
                }));

        // Dashboard & Status
        new Setting(containerEl).setName('Dashboard and status').setHeading();

        new Setting(containerEl)
            .setName('Create dashboard note')
            .setDesc('Auto-create an index note in each folder with workspace details (team, dates, budget)')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.createDashboardNote)
                .onChange((value) => {
                    this.plugin.settings.createDashboardNote = value;
                    void this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Dashboard note name')
            .setDesc('Name of the dashboard note file (e.g., _index.md, readme.md)')
            .addText(text => text
                .setPlaceholder('_index.md')
                .setValue(this.plugin.settings.dashboardNoteName)
                .onChange((value) => {
                    this.plugin.settings.dashboardNoteName = value || '_index.md';
                    void this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Show workspace status in status bar')
            .setDesc('Display workspace status (🟢 active, 🟡 on hold, etc.) alongside sync status')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showWorkspaceStatusInStatusBar)
                .onChange((value) => {
                    this.plugin.settings.showWorkspaceStatusInStatusBar = value;
                    void this.plugin.saveSettings();
                    // Refresh status bar
                    const file = this.plugin.app.workspace.getActiveFile();
                    void this.plugin.updateStatusBarForFile(file);
                }));

        new Setting(containerEl)
            .setName('Show ribbon icons')
            .setDesc('Display colored icons in the left ribbon for note sync and time entry status')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showRibbonIcons)
                .onChange((value) => {
                    this.plugin.settings.showRibbonIcons = value;
                    void this.plugin.saveSettings();
                    this.plugin.setupRibbonIcons();
                }));

        new Setting(containerEl)
            .setName('Refresh dashboards on poll')
            .setDesc('Update all dashboard notes with latest workspace data when polling runs')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.refreshDashboardsOnPoll)
                .onChange((value) => {
                    this.plugin.settings.refreshDashboardsOnPoll = value;
                    void this.plugin.saveSettings();
                }));

        // Auto-archive
        new Setting(containerEl).setName('Auto-archive').setHeading();

        new Setting(containerEl)
            .setName('Enable auto-archive')
            .setDesc('Automatically move folders to archive when workspace status matches')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableAutoArchive)
                .onChange((value) => {
                    this.plugin.settings.enableAutoArchive = value;
                    void this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Archive folder name')
            .setDesc('Folder to move archived projects to (type to search existing folders)')
            .addText(text => {
                text.setPlaceholder('_Archive')
                    .setValue(this.plugin.settings.archiveFolderName)
                    .onChange((value) => {
                        this.plugin.settings.archiveFolderName = value || '_Archive';
                        void this.plugin.saveSettings();
                    });
                // Add folder autocomplete
                new FolderSuggest(this.app, text.inputEl);
            });

        new Setting(containerEl)
            .setName('Archive statuses')
            // eslint-disable-next-line obsidianmd/ui/sentence-case
            .setDesc('Manually enter statuses that trigger archiving (comma-separated). Check your Kantata workspace status dropdown for available values.')
            .addText(text => text
                .setPlaceholder('Closed, cancelled, completed, done')
                .setValue(this.plugin.settings.archiveStatuses.join(', '))
                .onChange((value) => {
                    this.plugin.settings.archiveStatuses = value
                        .split(',')
                        .map(s => s.trim())
                        .filter(s => s.length > 0);
                    void this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Enable auto-unarchive')
            .setDesc('Automatically move folders back out of archive when workspace status changes to a non-archive status')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableAutoUnarchive)
                .onChange((value) => {
                    this.plugin.settings.enableAutoUnarchive = value;
                    void this.plugin.saveSettings();
                }));

        // AI features
        new Setting(containerEl).setName('AI features').setHeading();

        new Setting(containerEl)
            .setName('Enable AI features')
            .setDesc('Enable AI-powered note organization and time entry creation')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableAiTimeEntry)
                .onChange((value) => {
                    this.plugin.settings.enableAiTimeEntry = value;
                    void this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('AI provider')
            .setDesc('Choose AI provider for time entry analysis')
            .addDropdown(dropdown => dropdown
                // eslint-disable-next-line obsidianmd/ui/sentence-case
                .addOption('anthropic', 'Anthropic (Claude)')
                // eslint-disable-next-line obsidianmd/ui/sentence-case
                .addOption('openai', 'OpenAI (GPT)')
                // eslint-disable-next-line obsidianmd/ui/sentence-case
                .addOption('google', 'Google AI (Gemini)')
                // eslint-disable-next-line obsidianmd/ui/sentence-case
                .addOption('openrouter', 'OpenRouter (many models)')
                .addOption('ollama', 'Ollama (local - free)')
                .addOption('manual', 'Manual (no AI)')
                .setValue(this.plugin.settings.aiProvider)
                .onChange((value: 'anthropic' | 'openai' | 'google' | 'openrouter' | 'ollama' | 'manual') => {
                    this.plugin.settings.aiProvider = value;
                    void this.plugin.saveSettings();
                    // Save scroll position before redraw
                    const scrollParent = this.containerEl.closest('.vertical-tab-content') || this.containerEl;
                    const scrollTop = scrollParent.scrollTop;
                    this.display();
                    requestAnimationFrame(() => {
                        scrollParent.scrollTop = scrollTop;
                    });
                }));

        // Provider-specific settings
        const provider = this.plugin.settings.aiProvider;

        if (provider === 'anthropic') {
            new Setting(containerEl)
                .setName('Anthropic API key')
                .setDesc(createFragment(frag => {
                    frag.appendText('Get from ');
                    frag.createEl('a', {
                        text: 'console.anthropic.com',
                        href: 'https://console.anthropic.com/settings/keys'
                    });
                    frag.appendText(' (stored securely)');
                }))
                .addText(text => text
                    .setPlaceholder('sk-ant-api03-...')
                    .setValue(this.plugin.getSecret('anthropicApiKey') || '')
                    .onChange((value) => {
                        this.plugin.setSecret('anthropicApiKey', value);
                    })
                    .inputEl.type = 'password');

            new Setting(containerEl)
                .setName('Claude model')
                .addDropdown(dropdown => dropdown
                    // eslint-disable-next-line obsidianmd/ui/sentence-case
                    .addOption('claude-opus-4-20250514', 'Claude Opus 4.5')
                    // eslint-disable-next-line obsidianmd/ui/sentence-case
                    .addOption('claude-sonnet-4-20250514', 'Claude Sonnet 4.5')
                    // eslint-disable-next-line obsidianmd/ui/sentence-case
                    .addOption('claude-sonnet-4-20250514', 'Claude Sonnet 4')
                    // eslint-disable-next-line obsidianmd/ui/sentence-case
                    .addOption('claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet')
                    // eslint-disable-next-line obsidianmd/ui/sentence-case
                    .addOption('claude-3-haiku-20240307', 'Claude 3 Haiku (faster)')
                    .setValue(this.plugin.settings.anthropicModel)
                    .onChange((value) => {
                        this.plugin.settings.anthropicModel = value;
                        void this.plugin.saveSettings();
                    }));
        }

        if (provider === 'openai') {
            new Setting(containerEl)
                // eslint-disable-next-line obsidianmd/ui/sentence-case
                .setName('OpenAI API key')
                // eslint-disable-next-line obsidianmd/ui/sentence-case
                .setDesc('Get from platform.OpenAI.com (stored securely)')
                .addText(text => text
                    .setPlaceholder('sk-...')
                    .setValue(this.plugin.getSecret('openaiApiKey') || '')
                    .onChange((value) => {
                        this.plugin.setSecret('openaiApiKey', value);
                    })
                    .inputEl.type = 'password');

            new Setting(containerEl)
                // eslint-disable-next-line obsidianmd/ui/sentence-case
                .setName('OpenAI model')
                .addDropdown(dropdown => dropdown
                    // eslint-disable-next-line obsidianmd/ui/sentence-case
                    .addOption('gpt-4o', 'GPT-4o (recommended)')
                    // eslint-disable-next-line obsidianmd/ui/sentence-case
                    .addOption('gpt-4o-mini', 'GPT-4o Mini (faster)')
                    // eslint-disable-next-line obsidianmd/ui/sentence-case
                    .addOption('gpt-4-turbo', 'GPT-4 Turbo')
                    // eslint-disable-next-line obsidianmd/ui/sentence-case
                    .addOption('gpt-3.5-turbo', 'GPT-3.5 Turbo (cheapest)')
                    .setValue(this.plugin.settings.openaiModel)
                    .onChange((value) => {
                        this.plugin.settings.openaiModel = value;
                        void this.plugin.saveSettings();
                    }));
        }

        if (provider === 'google') {
            new Setting(containerEl)
                .setName('Google AI API key')
                .setDesc('Get from aistudio.google.com (stored securely)')
                .addText(text => text
                    .setPlaceholder('AIza...')
                    .setValue(this.plugin.getSecret('googleApiKey') || '')
                    .onChange((value) => {
                        this.plugin.setSecret('googleApiKey', value);
                    })
                    .inputEl.type = 'password');

            new Setting(containerEl)
                .setName('Gemini model')
                .addDropdown(dropdown => dropdown
                    // eslint-disable-next-line obsidianmd/ui/sentence-case
                    .addOption('gemini-2.5-pro-preview-06-05', 'Gemini 3 Pro (latest)')
                    // eslint-disable-next-line obsidianmd/ui/sentence-case
                    .addOption('gemini-2.0-flash', 'Gemini 2.0 Flash')
                    // eslint-disable-next-line obsidianmd/ui/sentence-case
                    .addOption('gemini-2.0-flash-lite', 'Gemini 2.0 Flash Lite (fastest)')
                    // eslint-disable-next-line obsidianmd/ui/sentence-case
                    .addOption('gemini-1.5-pro', 'Gemini 1.5 Pro')
                    // eslint-disable-next-line obsidianmd/ui/sentence-case
                    .addOption('gemini-1.5-flash', 'Gemini 1.5 Flash')
                    .setValue(this.plugin.settings.googleModel)
                    .onChange((value) => {
                        this.plugin.settings.googleModel = value;
                        void this.plugin.saveSettings();
                    }));
        }

        if (provider === 'openrouter') {
            new Setting(containerEl)
                // eslint-disable-next-line obsidianmd/ui/sentence-case
                .setName('OpenRouter API key')
                .setDesc('Get from openrouter.ai/keys (stored securely)')
                .addText(text => text
                    .setPlaceholder('sk-or-v1-...')
                    .setValue(this.plugin.getSecret('openrouterApiKey') || '')
                    .onChange((value) => {
                        this.plugin.setSecret('openrouterApiKey', value);
                    })
                    .inputEl.type = 'password');

            new Setting(containerEl)
                // eslint-disable-next-line obsidianmd/ui/sentence-case
                .setName('OpenRouter model')
                // eslint-disable-next-line obsidianmd/ui/sentence-case
                .setDesc('Access Claude, GPT, Gemini, Llama, and more with one API key')
                .addDropdown(dropdown => dropdown
                    // Anthropic
                    // eslint-disable-next-line obsidianmd/ui/sentence-case
                    .addOption('anthropic/claude-opus-4', 'Claude Opus 4.5')
                    // eslint-disable-next-line obsidianmd/ui/sentence-case
                    .addOption('anthropic/claude-sonnet-4', 'Claude Sonnet 4.5')
                    // eslint-disable-next-line obsidianmd/ui/sentence-case
                    .addOption('anthropic/claude-3.5-sonnet', 'Claude 3.5 Sonnet')
                    // eslint-disable-next-line obsidianmd/ui/sentence-case
                    .addOption('anthropic/claude-3-haiku', 'Claude 3 Haiku')
                    // OpenAI
                    // eslint-disable-next-line obsidianmd/ui/sentence-case
                    .addOption('openai/gpt-4o', 'GPT-4o')
                    // eslint-disable-next-line obsidianmd/ui/sentence-case
                    .addOption('openai/gpt-4o-mini', 'GPT-4o Mini')
                    // eslint-disable-next-line obsidianmd/ui/sentence-case
                    .addOption('openai/gpt-4-turbo', 'GPT-4 Turbo')
                    // Google
                    // eslint-disable-next-line obsidianmd/ui/sentence-case
                    .addOption('google/gemini-2.5-pro-preview', 'Gemini 3 Pro')
                    // eslint-disable-next-line obsidianmd/ui/sentence-case
                    .addOption('google/gemini-2.0-flash-001', 'Gemini 2.0 Flash')
                    // eslint-disable-next-line obsidianmd/ui/sentence-case
                    .addOption('google/gemini-flash-1.5', 'Gemini 1.5 Flash')
                    // Meta
                    .addOption('meta-llama/llama-3.3-70b-instruct', 'Llama 3.3 70b')
                    .addOption('meta-llama/llama-3.1-8b-instruct', 'Llama 3.1 8b (cheap)')
                    // Mistral
                    .addOption('mistralai/mistral-large-2411', 'Mistral large')
                    .addOption('mistralai/mistral-small-2503', 'Mistral small')
                    // DeepSeek
                    .addOption('deepseek/deepseek-chat-v3-0324', 'DeepSeek v3')
                    .addOption('deepseek/deepseek-r1', 'DeepSeek r1')
                    .setValue(this.plugin.settings.openrouterModel)
                    .onChange((value) => {
                        this.plugin.settings.openrouterModel = value;
                        void this.plugin.saveSettings();
                    }));
        }

        if (provider === 'ollama') {
            new Setting(containerEl)
                .setName('Ollama endpoint')
                // eslint-disable-next-line obsidianmd/ui/sentence-case
                .setDesc('Local Ollama server URL (no API key needed!)')
                .addText(text => text
                    .setPlaceholder('http://localhost:11434')
                    .setValue(this.plugin.settings.ollamaEndpoint)
                    .onChange((value) => {
                        this.plugin.settings.ollamaEndpoint = value || 'http://localhost:11434';
                        void this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('Ollama model')
                // eslint-disable-next-line obsidianmd/ui/sentence-case
                .setDesc('Model name (run "Ollama list" to see available)')
                .addText(text => text
                    .setPlaceholder('llama3.2')
                    .setValue(this.plugin.settings.ollamaModel)
                    .onChange((value) => {
                        this.plugin.settings.ollamaModel = value || 'llama3.2';
                        void this.plugin.saveSettings();
                    }));
        }

        if (provider === 'manual') {
            new Setting(containerEl)
                .setName('Default hours')
                .setDesc('Default hours for time entry (no AI analysis)')
                .addText(text => text
                    .setPlaceholder('1.0')
                    .setValue(String(this.plugin.settings.manualDefaultHours))
                    .onChange((value) => {
                        this.plugin.settings.manualDefaultHours = parseFloat(value) || 1.0;
                        void this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('Default category')
                .setDesc('Default category for time entry')
                .addText(text => text
                    .setPlaceholder('Consulting')
                    .setValue(this.plugin.settings.manualDefaultCategory)
                    .onChange((value) => {
                        this.plugin.settings.manualDefaultCategory = value || 'Consulting';
                        void this.plugin.saveSettings();
                    }));
        }

        // Test button (right after provider settings, not for manual mode)
        if (provider !== 'manual') {
            new Setting(containerEl)
                .setName('Test AI connection')
                .setDesc(`Verify ${provider} credentials`)
                .addButton(button => button
                    .setButtonText('Test')
                    .onClick(() => {
                        void (async () => {
                            try {
                                const response = await this.plugin.callAI('Reply with just: OK');
                                if (response.toLowerCase().includes('ok')) {
                                    new Notice(`✅ ${provider} connected!`);
                                } else {
                                    new Notice(`✅ Connected: ${response.slice(0, 50)}`);
                                }
                            } catch (err) {
                                const e = err as Error;
                                new Notice(`❌ ${provider} failed: ${e.message}`);
                            }
                        })();
                    }));
        }

        // Custom template
        new Setting(containerEl)
            .setName('Custom template')
            .setDesc('Custom template for notes. Use {{customer}}, {{date}}, {{time}} as placeholders.')
            .addTextArea(text => {
                text.setPlaceholder('Leave empty for default template...')
                    .setValue(this.plugin.settings.customTemplate)
                    .onChange((value) => {
                        this.plugin.settings.customTemplate = value;
                        void this.plugin.saveSettings();
                    });
                text.inputEl.rows = 10;
                text.inputEl.addClass('kantata-settings-token-input');
            });

        // Custom statuses
        new Setting(containerEl)
            .setName('Project statuses')
            .setDesc('Define statuses by color. Format: color:status1,status2,status3 (one color per line)')
            .addTextArea(text => {
                text.setPlaceholder('gray:Not Started,Pending\ngreen:In Progress\nyellow:On Hold\nred:At Risk\nblue:Completed')
                    .setValue(this.plugin.settings.customStatuses)
                    .onChange((value) => {
                        this.plugin.settings.customStatuses = value;
                        void this.plugin.saveSettings();
                    });
                text.inputEl.rows = 6;
                text.inputEl.addClass('kantata-settings-token-input');
            });

        // Menu Options
        new Setting(containerEl).setName('Status bar menu').setHeading();
        containerEl.createEl('p', { 
            text: 'Choose which options appear when you click the status bar. Drag to reorder.',
            cls: 'setting-item-description'
        });

        // Menu item definitions
        const menuItems: Record<string, { name: string; desc: string; key: keyof KantataSettings }> = {
            aiOrganize: { name: 'AI: Organize notes', desc: 'Organize notes with AI template', key: 'menuShowAiOrganize' },
            syncNote: { name: 'Sync/update note', desc: 'Sync note to Kantata', key: 'menuShowSyncNote' },
            aiTimeEntry: { name: 'AI: Time entry', desc: 'Create/update time entry with AI', key: 'menuShowAiTimeEntry' },
            manualTimeEntry: { name: 'Manual time entry', desc: 'Create/edit time entry manually', key: 'menuShowManualTimeEntry' },
            changeStatus: { name: 'Change project status', desc: 'Change workspace status', key: 'menuShowChangeStatus' },
            openInKantata: { name: 'Open in Kantata', desc: 'Open workspace in Kantata', key: 'menuShowOpenInKantata' },
            deleteFromKantata: { name: 'Delete from Kantata', desc: 'Delete synced post from Kantata', key: 'menuShowDeleteFromKantata' },
        };

        // Ensure menuOrder contains all menu items (migration safety)
        const allMenuKeys = Object.keys(menuItems);
        for (const key of allMenuKeys) {
            if (!this.plugin.settings.menuOrder.includes(key)) {
                this.plugin.settings.menuOrder.push(key);
            }
        }

        // Create sortable container
        const sortableContainer = containerEl.createDiv({ cls: 'kantata-menu-sortable kantata-sortable-container' });

        let draggedEl: HTMLElement | null = null;

        const renderMenuItems = () => {
            sortableContainer.empty();
            
            for (const itemKey of this.plugin.settings.menuOrder) {
                const isSeparator = itemKey.startsWith('separator-');
                const item = menuItems[itemKey];
                
                // Skip unknown non-separator items
                if (!isSeparator && !item) continue;

                const row = sortableContainer.createDiv({ cls: 'kantata-menu-row setting-item kantata-sortable-row' });
                row.draggable = true;
                row.dataset.key = itemKey;

                // Drag handle
                const handle = row.createSpan({ cls: 'kantata-drag-handle kantata-sortable-handle' });
                handle.textContent = '⋮⋮';

                if (isSeparator) {
                    // Separator row
                    const textContainer = row.createDiv({ cls: 'setting-item-info kantata-sortable-text-container' });
                    textContainer.createEl('hr', { cls: 'kantata-sortable-separator-line' });
                    textContainer.createSpan({ text: 'Separator', cls: 'setting-item-description' });
                    
                    // Delete button for separator
                    const deleteBtn = row.createEl('button', { text: '✕', cls: 'kantata-sortable-delete-btn' });
                    deleteBtn.onclick = (e) => {
                        e.stopPropagation();
                        this.plugin.settings.menuOrder = this.plugin.settings.menuOrder.filter(k => k !== itemKey);
                        void this.plugin.saveSettings();
                        renderMenuItems();
                    };
                } else {
                    // Regular menu item
                    const textContainer = row.createDiv({ cls: 'setting-item-info kantata-sortable-text-container-simple' });
                    textContainer.createDiv({ cls: 'setting-item-name', text: item.name });
                    textContainer.createDiv({ cls: 'setting-item-description', text: item.desc });

                    // Toggle
                    const toggleContainer = row.createDiv({ cls: 'setting-item-control' });
                    const toggle = toggleContainer.createEl('div', { cls: 'checkbox-container kantata-sortable-toggle' });
                    toggle.classList.toggle('is-enabled', Boolean(this.plugin.settings[item.key]));
                    toggle.onclick = (e) => {
                        e.stopPropagation();
                        const newValue = !this.plugin.settings[item.key];
                        (this.plugin.settings as Record<string, unknown>)[item.key] = newValue;
                        toggle.classList.toggle('is-enabled', newValue);
                        void this.plugin.saveSettings();
                    };
                }

                // Drag events
                row.ondragstart = (e) => {
                    draggedEl = row;
                    row.addClass('dragging');
                    e.dataTransfer?.setData('text/plain', itemKey);
                };

                row.ondragend = () => {
                    row.removeClass('dragging');
                    draggedEl = null;
                };

                row.ondragover = (e) => {
                    e.preventDefault();
                };

                row.ondragleave = () => {
                    row.removeClass('drag-over-top');
                    row.removeClass('drag-over-bottom');
                };

                row.ondrop = (e) => {
                    e.preventDefault();
                    row.removeClass('drag-over-top');
                    row.removeClass('drag-over-bottom');
                    if (!draggedEl || draggedEl === row) return;

                    const draggedKey = draggedEl.dataset.key!;
                    const targetKey = row.dataset.key!;
                    const order = [...this.plugin.settings.menuOrder];
                    const draggedIdx = order.indexOf(draggedKey);
                    
                    // Determine if dropping on top or bottom half
                    const rect = row.getBoundingClientRect();
                    const dropOnBottom = e.clientY > rect.top + rect.height / 2;

                    // Remove dragged item first
                    order.splice(draggedIdx, 1);
                    
                    // Find new target index (after removal)
                    let newTargetIdx = order.indexOf(targetKey);
                    if (dropOnBottom) {
                        newTargetIdx += 1; // Insert after target
                    }
                    
                    order.splice(newTargetIdx, 0, draggedKey);

                    this.plugin.settings.menuOrder = order;
                    void this.plugin.saveSettings();
                    renderMenuItems();
                };

                // Also show bottom indicator when hovering lower half
                row.addEventListener('dragover', (e) => {
                    if (!draggedEl || draggedEl === row) return;
                    const rect = row.getBoundingClientRect();
                    const onBottom = e.clientY > rect.top + rect.height / 2;
                    row.toggleClass('drag-over-top', !onBottom);
                    row.toggleClass('drag-over-bottom', onBottom);
                });
            }
        };

        renderMenuItems();

        // Add separator button
        const addSeparatorBtn = containerEl.createEl('button', { text: '➕ add separator', cls: 'kantata-add-separator-btn' });
        addSeparatorBtn.onclick = () => {
            // Generate unique separator ID
            let num = 1;
            while (this.plugin.settings.menuOrder.includes(`separator-${num}`)) {
                num++;
            }
            this.plugin.settings.menuOrder.push(`separator-${num}`);
            void this.plugin.saveSettings();
            renderMenuItems();
        };

        // Cache Management
        new Setting(containerEl).setName('Cache management').setHeading();

        new Setting(containerEl)
            .setName('Clear workspace cache')
            .setDesc('⚠️ use with caution: removes all cached customer → workspace mappings. You will need to re-link folders.')
            .addButton(button => button
                .setButtonText('Clear cache')
                .setWarning()
                .onClick(() => {
                    this.plugin.workspaceCache = {};
                    void this.plugin.saveWorkspaceCache();
                    new Notice('Workspace cache cleared');
                }));

        }
}
