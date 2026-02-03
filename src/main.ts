import { App, FuzzySuggestModal, Menu, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder, TextComponent, requestUrl, AbstractInputSuggest } from 'obsidian';

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
    refreshDashboardsOnPoll: boolean;
    // Auto-archive
    enableAutoArchive: boolean;
    archiveFolderName: string;
    archiveStatuses: string[];
    enableAutoUnarchive: boolean;
    // AI Time Entry
    enableAiTimeEntry: boolean;
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
    refreshDashboardsOnPoll: false,
    // Auto-archive
    enableAutoArchive: false,
    archiveFolderName: '_Archive',
    archiveStatuses: ['Archived', 'Closed', 'Cancelled', 'Cancelled Confirmed', 'Completed', 'Delivered', 'Done', 'Submitted'],
    enableAutoUnarchive: false,
    // AI Time Entry
    enableAiTimeEntry: false,
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

    async waitForSelection(): Promise<Workspace | null> {
        return new Promise((resolve) => {
            this.resolvePromise = resolve;
            this.open();
        });
    }
}

export default class KantataSync extends Plugin {
    settings!: KantataSettings;
    workspaceCache: Record<string, WorkspaceCacheEntry> = {};
    statusBarItem!: HTMLElement;
    private pollingIntervalId: ReturnType<typeof setInterval> | null = null;
    private lastTimeEntry: { id: string; workspaceId: string; data: any } | null = null;

    async onload(): Promise<void> {
        await this.loadSettings();
        await this.loadWorkspaceCache();
        await this.cleanupStaleCache();  // Remove entries for deleted folders

        // Ribbon icon
        this.addRibbonIcon('upload', 'Sync to Kantata', async () => {
            await this.syncCurrentNote();
        });

        // Commands
        this.addCommand({
            id: 'sync-current-note',
            name: 'Sync current note to Kantata',
            editorCallback: async (editor, view) => {
                await this.syncCurrentNote();
            }
        });

        this.addCommand({
            id: 'open-in-kantata',
            name: 'Open workspace in Kantata',
            callback: async () => {
                await this.openInKantata();
            }
        });

        this.addCommand({
            id: 'link-folder',
            name: 'Link folder to workspace',
            callback: async () => {
                await this.linkFolder();
            }
        });

        this.addCommand({
            id: 'unlink-folder',
            name: 'Unlink folder from workspace',
            callback: async () => {
                await this.unlinkFolder();
            }
        });

        this.addCommand({
            id: 'sync-workspaces',
            name: 'Sync workspaces from Kantata',
            callback: async () => {
                await this.syncWorkspaces(true);
            }
        });

        this.addCommand({
            id: 'refresh-dashboard',
            name: 'Refresh dashboard for current folder',
            callback: async () => {
                await this.refreshCurrentDashboard();
            }
        });

        this.addCommand({
            id: 'refresh-all-dashboards',
            name: 'Refresh all dashboards',
            callback: async () => {
                await this.refreshAllDashboards();
            }
        });

        this.addCommand({
            id: 'create-time-entry',
            name: 'Create AI time entry for current note',
            editorCallback: async (editor, view) => {
                await this.createTimeEntryForCurrentNote();
            }
        });

        this.addCommand({
            id: 'undo-time-entry',
            name: 'Undo last time entry',
            callback: async () => {
                await this.undoLastTimeEntry();
            }
        });

        this.addCommand({
            id: 'organize-notes',
            name: 'AI: Organize notes into template',
            editorCallback: async (editor, view) => {
                await this.organizeCurrentNote(editor);
            }
        });

        // Status bar
        this.statusBarItem = this.addStatusBarItem();
        this.statusBarItem.addClass('obsidianlink-status');
        this.statusBarItem.onClickEvent(async (evt: MouseEvent) => {
            // Show menu with options
            const menu = new Menu();
            
            menu.addItem((item) => {
                item.setTitle('📝 Sync Note to Kantata')
                    .onClick(async () => {
                        await this.syncCurrentNote();
                    });
            });
            
            menu.addItem((item) => {
                item.setTitle('⏱️ Create Time Entry')
                    .onClick(async () => {
                        await this.createTimeEntryForCurrentNote();
                    });
            });
            
            menu.addSeparator();
            
            menu.addItem((item) => {
                item.setTitle('🔗 Open in Kantata')
                    .onClick(async () => {
                        await this.openInKantata();
                    });
            });
            
            menu.showAtMouseEvent(evt);
        });
        this.updateStatusBar('Note ⚪ · Time ⚪', 'Click for options');

        // File event handlers
        this.registerEvent(this.app.workspace.on('file-open', async (file) => {
            await this.updateStatusBarForFile(file);
        }));

        let debounceTimeout: ReturnType<typeof setTimeout> | null = null;
        this.registerEvent(this.app.vault.on('modify', async (file) => {
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile && file.path === activeFile.path) {
                if (debounceTimeout) clearTimeout(debounceTimeout);
                debounceTimeout = setTimeout(async () => {
                    await this.updateStatusBarForFile(activeFile);
                }, 1000);
            }
        }));

        // Settings tab
        this.addSettingTab(new KantataSettingTab(this.app, this));

        // Auto-sync on startup
        if (this.settings.autoSyncFoldersOnStartup && this.settings.kantataToken) {
            setTimeout(async () => {
                await this.autoSyncFolders();
            }, 3000);
        }

        // Start polling if enabled
        this.setupPolling();
    }

    onunload(): void {
        this.stopPolling();
    }

    // ==================== POLLING ====================

    setupPolling(): void {
        this.stopPolling();
        
        if (this.settings.enablePolling && this.settings.kantataToken) {
            const intervalMs = this.settings.pollingIntervalMinutes * 60 * 1000;
            console.log(`[KantataSync] Starting polling every ${this.settings.pollingIntervalMinutes} minutes`);
            
            this.pollingIntervalId = setInterval(async () => {
                await this.syncWorkspaces(false);
            }, intervalMs);
        }
    }

    stopPolling(): void {
        if (this.pollingIntervalId) {
            clearInterval(this.pollingIntervalId);
            this.pollingIntervalId = null;
            console.log('[KantataSync] Polling stopped');
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
                console.log(`[KantataSync] Ignoring "${workspaceName}" - matches pattern "${pattern}"`);
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
                console.log(`[KantataSync] Skipping "${workspace.title}" - status "${status}" not in allowed list`);
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
        if (!this.settings.kantataToken) {
            if (showNotice) new Notice('❌ No Kantata token configured');
            console.log('[KantataSync] Sync skipped - no token');
            return;
        }

        if (showNotice) {
            new Notice('Syncing workspaces from Kantata...');
            this.updateStatusBar('📝 Note Sync: ⏳ Syncing...', 'Fetching workspaces from Kantata');
        }
        console.log('[KantataSync] Syncing workspaces...');
        
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
                
                const folderName = workspace.title;
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
                        console.log(`[KantataSync] Removing orphan cache entry for "${cachedFolderPath}" (folder no longer exists)`);
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
                    console.log(`[KantataSync] Created folder: ${fullFolderPath}`);
                } catch (e) {
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
                    new Notice('✅ Sync complete: No changes');
                }
                this.updateStatusBar('📝 Note Sync: ✅ Complete', 'Workspace sync complete');
                setTimeout(() => {
                    const file = this.app.workspace.getActiveFile();
                    this.updateStatusBarForFile(file);
                }, 3000);
            } else if (created > 0 || linked > 0) {
                new Notice(`📁 KantataSync: ${parts.filter(p => !p.includes('already') && !p.includes('filtered')).join(', ')}`);
            }
            
            console.log(`[KantataSync] Sync complete: ${parts.join(', ')}`);

            // Refresh dashboards if enabled (with delay to prevent layout thrashing)
            if (this.settings.refreshDashboardsOnPoll && this.settings.createDashboardNote) {
                console.log('[KantataSync] Refreshing dashboards...');
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
                    console.log(`[KantataSync] Refreshed ${refreshed} dashboards`);
                }
            }

            // Auto-archive folders with matching statuses
            if (this.settings.enableAutoArchive && this.settings.archiveStatuses.length > 0) {
                await this.checkAndArchiveFolders(showNotice);
            }
        } catch (e: any) {
            console.warn('[KantataSync] Sync failed:', e);
            if (showNotice) {
                new Notice(`❌ Sync failed: ${e.message}`);
                this.updateStatusBar('📝 Note Sync: ❌ Failed', 'Workspace sync failed');
            }
        }
    }

    // ==================== AUTO-ARCHIVE ====================

    async fetchWorkspaceStatus(workspaceId: string): Promise<{ status: string; statusColor: string; deleted?: boolean; isArchived?: boolean } | null> {
        try {
            const response = await this.apiRequest(`/workspaces/${workspaceId}.json`);
            const workspace = Object.values(response.workspaces || {})[0] as any;
            if (!workspace) return null;
            return {
                status: workspace.status?.message || 'Active',
                statusColor: workspace.status?.color || 'gray',
                isArchived: workspace.archived === true  // Kantata's archived boolean flag
            };
        } catch (e: any) {
            // 404 means workspace was deleted from Kantata
            if (e.status === 404) {
                console.log(`[KantataSync] Workspace ${workspaceId} was deleted from Kantata (404)`);
                return { status: 'DELETED', statusColor: 'gray', deleted: true };
            }
            console.warn(`[KantataSync] Could not fetch status for workspace ${workspaceId}:`, e);
            return null;
        }
    }

    async checkAndArchiveFolders(showNotice: boolean): Promise<void> {
        console.log('[KantataSync] Checking for folders to archive/unarchive...');
        
        const archiveFolder = this.settings.archiveFolderName;
        let archived = 0;
        let unarchived = 0;

        // Ensure archive folder exists
        const archiveFolderExists = await this.app.vault.adapter.exists(archiveFolder);
        if (!archiveFolderExists) {
            try {
                await this.app.vault.createFolder(archiveFolder);
                console.log(`[KantataSync] Created archive folder: ${archiveFolder}`);
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
                        console.log(`[KantataSync] Archived deleted workspace: ${folderName} → ${newPath}`);
                        archived++;
                    }
                    
                    // Remove linkage from cache
                    delete this.workspaceCache[folderName];
                    console.log(`[KantataSync] Unlinked deleted workspace: ${cached.workspaceTitle} (${cached.workspaceId})`);
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
                    console.log(`[KantataSync] Archived: ${folderName} → ${newPath} (${reason})`);
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
                    console.log(`[KantataSync] Unarchived: ${folderName} → ${originalName} (status: ${statusInfo.status})`);
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
            console.log(`[KantataSync] ${msg}`);
        } else {
            console.log('[KantataSync] No folders to archive/unarchive');
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
            const workspaces = Object.values(response.workspaces || {}) as any[];
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
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
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
                this.workspaceCache = JSON.parse(data);
                console.log('[KantataSync] Cache loaded:', Object.keys(this.workspaceCache).length, 'entries');
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
        
        for (const [folderPath, cached] of entries) {
            const folderExists = await this.app.vault.adapter.exists(folderPath);
            if (!folderExists) {
                console.log(`[KantataSync] Removing stale cache entry: "${folderPath}" (folder no longer exists)`);
                delete this.workspaceCache[folderPath];
                removed++;
            }
        }
        
        if (removed > 0) {
            await this.saveWorkspaceCache();
            console.log(`[KantataSync] Cleaned up ${removed} stale cache entries`);
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

    async updateStatusBarForFile(file: TFile | null): Promise<void> {
        if (!file || file.extension !== 'md') {
            this.updateStatusBar('📝 Note Sync: ⚪', 'No note open');
            return;
        }

        if (file.path.includes('aaaTemplates')) {
            this.updateStatusBar('📝 Note Sync: ⚪', 'Template file');
            return;
        }

        try {
            const content = await this.app.vault.read(file);
            const { frontmatter } = this.parseFrontmatter(content);

            const isSynced = frontmatter.kantata_synced === true || frontmatter.kantata_synced === 'true';
            const syncedAt = frontmatter.kantata_synced_at as string | undefined;
            
            // Time entry status
            const hasTimeEntry = !!frontmatter.kantata_time_entry_id;
            const timeStatus = hasTimeEntry ? '✅' : '⚪';

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

            const timeTooltip = hasTimeEntry ? 'Time logged' : 'No time entry - click to create';
            this.updateStatusBar(
                `Note ${noteStatus} · Time ${timeStatus}${projectStatusText}`,
                `${tooltip} | ${timeTooltip}`
            );
        } catch (e) {
            this.updateStatusBar('Note ⚪ · Time ⚪', 'Ready');
        }
    }

    // ==================== KANTATA COMMANDS ====================

    async openInKantata(): Promise<void> {
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
        } catch (e: any) {
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

    async apiRequest(endpoint: string, method = 'GET', body?: any): Promise<any> {
        await this.rateLimitedDelay();
        if (!this.settings.kantataToken) {
            throw new Error('Kantata token not configured. Go to Settings → KantataSync');
        }

        const options: any = {
            url: `${this.settings.apiBaseUrl}${endpoint}`,
            method,
            headers: {
                'Authorization': `Bearer ${this.settings.kantataToken}`,
                'Content-Type': 'application/json'
            }
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        try {
            const response = await requestUrl(options);
            return response.json;
        } catch (e: any) {
            const status = e.status || 'unknown';
            let errorMsg = `Kantata API error (${status})`;
            
            // Try to parse error response body
            try {
                const errorText = e.response || e.text || e.message || '';
                const errorData = typeof errorText === 'string' && errorText.startsWith('{') 
                    ? JSON.parse(errorText) 
                    : errorText;
                console.error('[KantataSync] Kantata error response:', errorData);
                
                if (errorData?.errors) {
                    // Kantata errors can be array of strings or objects
                    const errors = Array.isArray(errorData.errors)
                        ? errorData.errors.map((err: any) => 
                            typeof err === 'string' ? err : (err.message || JSON.stringify(err))
                          ).join(', ')
                        : JSON.stringify(errorData.errors);
                    errorMsg = `${errorMsg}: ${errors}`;
                }
            } catch {
                // Couldn't parse, use raw message
                if (e.message) errorMsg = `${errorMsg}: ${e.message}`;
            }
            
            if (status === 401) {
                throw new Error('Authentication failed. Check your Kantata token.');
            }
            throw new Error(errorMsg);
        }
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
                throw new Error(`Unknown AI provider: ${this.settings.aiProvider}`);
        }
    }
    /**
     * Extract image paths from note content (Obsidian format)
     */
    extractImagePaths(content: string, file: any): string[] {
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
    async readImageAsBase64(imagePath: string, noteFile: any): Promise<{ base64: string; mediaType: string } | null> {
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
                console.log(`[KantataSync] Image not found: ${fullPath}`);
                return null;
            }
            
            const arrayBuffer = await this.app.vault.readBinary(imageFile as any);
            const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
            
            const ext = imagePath.split('.').pop()?.toLowerCase() || 'png';
            const mediaType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
            
            return { base64, mediaType };
        } catch (e) {
            console.error(`[KantataSync] Failed to read image: ${imagePath}`, e);
            return null;
        }
    }

    async callAnthropic(prompt: string, images?: Array<{ base64: string; mediaType: string }>): Promise<string> {
        if (!this.settings.anthropicApiKey) {
            throw new Error('Anthropic API key not configured');
        }

        const headers: Record<string, string> = {
            'content-type': 'application/json',
            'anthropic-version': '2023-06-01',
            'x-api-key': this.settings.anthropicApiKey
        };

        // Build message content - text and optional images
        const content: any[] = [];
        
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
            let errorMsg = `Anthropic API error (${response.status})`;
            try {
                const errorData = response.json;
                console.error('[KantataSync] Anthropic error response:', errorData);
                if (errorData?.error?.message) {
                    errorMsg = `${errorMsg}: ${errorData.error.message}`;
                } else if (errorData?.message) {
                    errorMsg = `${errorMsg}: ${errorData.message}`;
                } else {
                    errorMsg = `${errorMsg}: ${response.text?.slice(0, 200) || 'Unknown error'}`;
                }
            } catch {
                errorMsg = `${errorMsg}: ${response.text?.slice(0, 200) || 'Unknown error'}`;
            }
            throw new Error(errorMsg);
        }

        const data = response.json;
        if (data.content && data.content[0] && data.content[0].text) {
            return data.content[0].text;
        }
        throw new Error('Unexpected Anthropic API response format');
    }

    /**
     * Call OpenAI API
     */
    async callOpenAI(prompt: string): Promise<string> {
        if (!this.settings.openaiApiKey) {
            throw new Error('OpenAI API key not configured');
        }

        const response = await requestUrl({
            url: 'https://api.openai.com/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.settings.openaiApiKey}`
            },
            body: JSON.stringify({
                model: this.settings.openaiModel || 'gpt-4o',
                max_tokens: 500,
                messages: [{ role: 'user', content: prompt }]
            })
        });

        const data = response.json;
        if (data.choices && data.choices[0] && data.choices[0].message) {
            return data.choices[0].message.content;
        }
        throw new Error('Unexpected OpenAI API response format');
    }

    /**
     * Call Google AI (Gemini) API
     */
    async callGoogle(prompt: string): Promise<string> {
        if (!this.settings.googleApiKey) {
            throw new Error('Google AI API key not configured');
        }

        const model = this.settings.googleModel || 'gemini-1.5-flash';
        const response = await requestUrl({
            url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.settings.googleApiKey}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { maxOutputTokens: 500 }
            })
        });

        const data = response.json;
        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            const parts = data.candidates[0].content.parts;
            if (parts && parts[0] && parts[0].text) {
                return parts[0].text;
            }
        }
        throw new Error('Unexpected Google AI API response format');
    }

    /**
     * Call OpenRouter API - access to many models with one API key
     */
    async callOpenRouter(prompt: string): Promise<string> {
        if (!this.settings.openrouterApiKey) {
            throw new Error('OpenRouter API key not configured');
        }

        const response = await requestUrl({
            url: 'https://openrouter.ai/api/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.settings.openrouterApiKey}`,
                'HTTP-Referer': 'https://obsidian.md',
                'X-Title': 'KantataSync'
            },
            body: JSON.stringify({
                model: this.settings.openrouterModel || 'anthropic/claude-sonnet-4',
                max_tokens: 500,
                messages: [{ role: 'user', content: prompt }]
            })
        });

        const data = response.json;
        if (data.choices && data.choices[0] && data.choices[0].message) {
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

        const data = response.json;
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
            const stories = Object.values(response.stories || {}) as any[];
            
            // Filter to stories that can have time logged (not archived, has budget or is billable)
            const billable = stories
                .filter((s: any) => s.state !== 'archived' && s.state !== 'deleted')
                .map((s: any) => ({
                    id: String(s.id),
                    title: s.title || s.name || 'Untitled Task'
                }));
            
            console.log(`[KantataSync] Found ${billable.length} billable stories in workspace`);
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
    async analyzeNoteForTimeEntry(
        noteContent: string,
        availableCategories: string[]
    ): Promise<{ summary: string; category: string; hours: number; notes: string }> {
        // Manual mode - no AI call
        if (this.settings.aiProvider === 'manual') {
            return this.manualAnalysis(noteContent, availableCategories);
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
${noteContent}

JSON:`;

        const responseText = await this.callAI(prompt);
        
        // Extract JSON from response (handle potential markdown wrapping)
        let jsonStr = responseText.trim();
        if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
        }
        
        try {
            const parsed = JSON.parse(jsonStr);
            // Round hours to nearest 15-minute increment (0.25)
            const rawHours = Number(parsed.hours) || 1;
            const roundedHours = Math.round(rawHours * 4) / 4;
            
            return {
                summary: String(parsed.summary || '').slice(0, 100),
                category: parsed.category || availableCategories[0] || 'General',
                hours: Math.max(0.25, roundedHours), // Minimum 15 minutes
                notes: String(parsed.notes || '')
            };
        } catch (e) {
            console.error('[KantataSync] Failed to parse AI response:', responseText);
            throw new Error('Failed to parse AI response as JSON');
        }
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

CRITICAL - DO NOT HALLUCINATE:
- NEVER make up or invent ANY information
- ONLY use facts explicitly stated in the notes
- If info is missing, use "-" (dash) - do NOT guess
- Rephrase for clarity but do NOT add new information
- Do NOT assume or infer things not explicitly stated

ROUGH NOTES:
${notes}

OUTPUT FORMAT (use "-" for missing info):

==**Meeting Details**==
**Customer:** ${customerName}
**Work Session:** ${dateStr} @ ${timeStr} CST
**Netwrix Attendees:** Adam Sneed
**${customerName} Attendees:** [ONLY if explicitly mentioned, otherwise "-"]

==**Activities/Notes**==

**Accomplishments:**
[ONLY rephrase what's explicitly stated as done]

**Issues:**
[ONLY problems explicitly mentioned, otherwise "-"]

**Blockers:**
[ONLY if explicitly stated, otherwise "-"]

**Next Session:**
[ONLY if explicitly mentioned, otherwise "-"]

**Next Steps:**
[ONLY if explicitly stated, otherwise "-"]

---

<u>Internal Notes</u>
-

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

        const imageNote = images && images.length > 0 
            ? `\n\nIMAGES ATTACHED: ${images.length} image(s). Extract ONLY what you can clearly see (attendee names, etc).`
            : '';

        const prompt = `Organize these work notes into the template below.${imageNote}

CRITICAL RULES:
- NEVER make up or invent ANY information
- ONLY include facts explicitly stated in the notes or clearly visible in images
- If information is not present, use "-" (dash)
- Do NOT guess, assume, or fill in blanks creatively
- Do NOT add details that aren't in the source material

ROUGH NOTES:
${roughNotes}

OUTPUT FORMAT (use "-" if info not explicitly provided):

==**Meeting Details**==
**Customer:** ${customerName}
**Work Session:** ${dateStr} @ ${timeStr} CST
**Netwrix Attendees:** Adam Sneed
**${customerName} Attendees:** [ONLY names clearly visible in images or mentioned in notes, otherwise "-"]

==**Activities/Notes**==

**Accomplishments:**
[ONLY what's explicitly stated as done]

**Issues:**
[ONLY problems explicitly mentioned]

**Blockers:**
[ONLY if explicitly stated, otherwise "-"]

**Next Session:**
[ONLY if explicitly mentioned, otherwise "-"]

**Next Steps:**
[ONLY if explicitly stated, otherwise "-"]

---

<u>Internal Notes</u>
[LEAVE EMPTY]

OUTPUT:`;

        let formatted = await this.callAI(prompt, images);
        formatted = formatted.trim();
        
        // Append original notes to Internal Notes section
        if (originalNotes) {
            const internalNotesMarker = '<u>Internal Notes</u>';
            if (formatted.includes(internalNotesMarker)) {
                const parts = formatted.split(internalNotesMarker);
                formatted = parts[0] + internalNotesMarker + '\n' + originalNotes;
            } else {
                formatted += '\n\n---\n\n<u>Internal Notes</u>\n' + originalNotes;
            }
        }
        
        return formatted;
    }

    /**
     * Delete a time entry (for undo)
     */
    async deleteTimeEntry(timeEntryId: string): Promise<void> {
        await this.apiRequest(`/time_entries/${timeEntryId}.json`, 'DELETE');
        console.log(`[KantataSync] Deleted time entry: ${timeEntryId}`);
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
        const timeEntryData: any = {
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

        console.log('[KantataSync] Creating time entry with data:', JSON.stringify(timeEntryData, null, 2));

        const response = await this.apiRequest('/time_entries.json', 'POST', {
            time_entry: timeEntryData
        });
        
        const entries = Object.values(response.time_entries || {}) as any[];
        if (entries.length > 0) {
            console.log(`[KantataSync] Created time entry: ${entries[0].id}`);
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
        console.log(`[KantataSync] No match for "${category}", using first story: ${stories[0].title}`);
        return stories[0].id;
    }

    /**
     * Get current user ID from Kantata
     */
    async getCurrentUserId(): Promise<string> {
        const response = await this.apiRequest('/users/me.json');
        const users = Object.values(response.users || {}) as any[];
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
                return !!(this.settings.anthropicApiKey || this.settings.anthropicOAuthToken);
            case 'openai':
                return !!this.settings.openaiApiKey;
            case 'google':
                return !!this.settings.googleApiKey;
            case 'openrouter':
                return !!this.settings.openrouterApiKey;
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
            console.log('[KantataSync] Analyzing note for time entry...');
            console.log(`[KantataSync] Available tasks: ${storyTitles.join(', ')}`);
            const analysis = await this.analyzeNoteForTimeEntry(noteContent, storyTitles);
            console.log('[KantataSync] AI analysis:', analysis);
            
            // Match AI's category to actual story_id
            const storyId = this.findMatchingStory(analysis.category, stories);
            if (storyId) {
                const matchedStory = stories.find(s => s.id === storyId);
                console.log(`[KantataSync] Matched category "${analysis.category}" to story: ${matchedStory?.title} (${storyId})`);
            }
            
            // Get current user ID
            const userId = await this.getCurrentUserId();
            
            // Enhance notes if enabled (proofread + template + expand)
            let finalNotes = `${analysis.summary}\n\n${analysis.notes}`;
            if (this.settings.proofreadNotes) {
                console.log('[KantataSync] Enhancing notes (proofread/template/expand)...');
                finalNotes = await this.enhanceNotes(finalNotes, customerName);
                console.log('[KantataSync] Enhanced result:', finalNotes);
            }
            
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
        } catch (e: any) {
            console.error('[KantataSync] AI time entry failed:', e);
            return { success: false, error: e.message };
        }
    }

    async searchWorkspace(customerName: string): Promise<{ id: string; title: string } | null> {
        if (this.workspaceCache[customerName]) {
            return {
                id: this.workspaceCache[customerName].workspaceId,
                title: this.workspaceCache[customerName].workspaceTitle
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
        const workspaces = Object.values(response.workspaces || {}) as any[];
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
            const workspaces = Object.values(response.workspaces || {}) as any[];
            
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
        
        console.log(`[KantataSync] Fetched ${allWorkspaces.length} workspaces (${page} page(s))`);
        return allWorkspaces;
    }

    async fetchWorkspaceDetails(workspaceId: string): Promise<WorkspaceDetails | null> {
        try {
            const response = await this.apiRequest(`/workspaces/${workspaceId}.json?include=participants`);
            const workspace = Object.values(response.workspaces || {})[0] as any;
            if (!workspace) return null;

            const users = response.users || {};
            const participants = (workspace.participant_ids || []).map((id: string) => {
                const user = users[id];
                return {
                    id,
                    name: user?.full_name || 'Unknown',
                    role: user?.headline || ''
                };
            });

            // Get primary maven details
            const primaryMavenUser = workspace.primary_maven_id ? users[workspace.primary_maven_id] : null;

            return {
                id: workspace.id,
                title: workspace.title,
                description: workspace.description || '',
                status: workspace.status?.message || 'Active',
                statusColor: workspace.status?.color || 'gray',
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
        } catch (e: any) {
            // 404 means workspace was deleted from Kantata
            if (e.status === 404) {
                console.log(`[KantataSync] Workspace ${workspaceId} was deleted from Kantata (404)`);
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
                console.log(`[KantataSync] Created dashboard: ${notePath}`);
            }
        } catch (e) {
            console.warn(`[KantataSync] Could not create dashboard note:`, e);
        }
    }

    async updateDashboardNote(folderName: string, workspaceId: string): Promise<boolean> {
        // Check if folder exists first
        const folderExists = await this.app.vault.adapter.exists(folderName);
        if (!folderExists) {
            console.log(`[KantataSync] Skipping dashboard update - folder doesn't exist: ${folderName}`);
            return false;
        }

        const details = await this.fetchWorkspaceDetails(workspaceId);
        if (!details) {
            console.warn('[KantataSync] Could not fetch details for dashboard update');
            return false;
        }

        // Skip dashboard update for deleted workspaces (they're handled by archive logic)
        if (details.deleted) {
            console.log(`[KantataSync] Skipping dashboard update - workspace was deleted: ${folderName}`);
            return false;
        }

        const content = this.generateDashboardContent(details, workspaceId, true);

        const notePath = `${folderName}/${this.settings.dashboardNoteName}`;
        
        try {
            const file = this.app.vault.getAbstractFileByPath(notePath);
            if (file instanceof TFile) {
                await this.app.vault.modify(file, content);
                console.log(`[KantataSync] Updated dashboard: ${notePath}`);
                return true;
            } else {
                // Dashboard doesn't exist, create it
                await this.app.vault.create(notePath, content);
                console.log(`[KantataSync] Created dashboard: ${notePath}`);
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
            new Notice(`❌ Failed to refresh dashboard`);
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
        } catch (e: any) {
            console.error('Workspace picker error:', e);
            new Notice(`Error selecting workspace: ${e.message}`);
            return null;
        }
    }

    // ==================== SYNC ====================

    async checkForConflict(postId: string, syncedAt: string): Promise<boolean> {
        try {
            const response = await this.apiRequest(`/posts/${postId}.json`);
            const posts = Object.values(response.posts || {}) as any[];
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

        const posts = Object.values(response.posts || {}) as any[];
        if (posts.length > 0) {
            return posts[0].id;
        }
        if (response.results && response.results.length > 0) {
            return response.results[0].id;
        }
        throw new Error('Failed to get post ID from response');
    }

    async updatePost(postId: string, message: string): Promise<void> {
        await this.apiRequest(`/posts/${postId}.json`, 'PUT', {
            post: { message }
        });
    }

    parseFrontmatter(content: string): { frontmatter: Record<string, any>; body: string } {
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
        const frontmatter: Record<string, any> = {};

        for (const line of fmContent.split('\n')) {
            const match = line.match(/^(\w+):\s*(.*)$/);
            if (match) {
                let value: any = match[2].trim();
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

    async updateFrontmatter(file: TFile, updates: Record<string, any>): Promise<void> {
        const content = await this.app.vault.read(file);
        const { frontmatter, body } = this.parseFrontmatter(content);
        Object.assign(frontmatter, updates);

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
                        return `${k}: '${v}'`;
                    }
                }
                return `${k}: ${v}`;
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
            .map(([k, v]) => typeof v === 'string' ? `${k}: '${v}'` : `${k}: ${v}`)
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
        } catch (e: any) {
            console.error('[KantataSync] syncNote ERROR:', e);
            return { success: false, error: e.message };
        }
    }

    async syncCurrentNote(): Promise<void> {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
            new Notice('No active file');
            return;
        }

        if (file.extension !== 'md') {
            new Notice('Not a markdown file');
            return;
        }

        this.updateStatusBar('📝 Note Sync: ⏳', 'Syncing to Kantata...');
        new Notice('Syncing to Kantata...');

        const result = await this.syncNote(file);

        if (result.success && result.updated) {
            new Notice(`🔄 Updated in Kantata! Post ID: ${result.postId}`);
            this.updateStatusBar('📝 Note Sync: ✅ Updated', 'Note synced to Kantata');
        } else if (result.success && result.postId) {
            new Notice(`✅ Synced to Kantata! Post ID: ${result.postId}`);
            this.updateStatusBar('📝 Note Sync: ✅ Synced', 'Note synced to Kantata');
        } else {
            new Notice(`❌ Sync failed: ${result.error}`);
            this.updateStatusBar('📝 Note Sync: ❌ Failed', 'Sync failed');
        }

        setTimeout(() => this.updateStatusBarForFile(file), 3000);
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
            new Notice('Not a markdown file');
            return;
        }

        // Check if AI time entry is enabled
        if (!this.settings.enableAiTimeEntry) {
            new Notice('⚠️ AI Time Entry is disabled. Enable it in settings.');
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
            new Notice(`⚠️ Time entry already exists: ${frontmatter.kantata_time_entry_id}`);
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
        this.updateStatusBar('⏱️ Time: ⏳', 'Creating time entry...');
        new Notice('🤖 Analyzing note and creating time entry...');

        const result = await this.processAiTimeEntry(workspaceId, cleanBody, customerName);

        if (result.success && result.timeEntryId) {
            // Save time entry ID to frontmatter
            await this.updateFrontmatter(file, {
                kantata_time_entry_id: result.timeEntryId,
                kantata_time_synced_at: new Date().toISOString()
            });
            new Notice(`✅ Time entry created! ID: ${result.timeEntryId}`);
            this.updateStatusBar('⏱️ Time: ✅', 'Time entry created');
        } else {
            new Notice(`❌ Time entry failed: ${result.error}`);
            this.updateStatusBar('⏱️ Time: ❌', 'Time entry failed');
        }

        setTimeout(() => this.updateStatusBarForFile(file), 3000);
    }

    /**
     * Undo the last time entry
     */
    async undoLastTimeEntry(): Promise<void> {
        if (!this.lastTimeEntry) {
            new Notice('❌ No time entry to undo');
            return;
        }

        try {
            new Notice('🔄 Undoing time entry...');
            await this.deleteTimeEntry(this.lastTimeEntry.id);
            new Notice(`✅ Time entry ${this.lastTimeEntry.id} deleted`);
            
            // Clear the stored entry
            this.lastTimeEntry = null;
        } catch (e: any) {
            new Notice(`❌ Failed to undo: ${e.message}`);
        }
    }

    /**
     * Organize current note using AI template
     */
    async organizeCurrentNote(editor: any): Promise<void> {
        if (!this.hasAiCredentials()) {
            new Notice(`❌ ${this.settings.aiProvider} credentials not configured`);
            return;
        }

        const file = this.app.workspace.getActiveFile();
        if (!file) {
            new Notice('❌ No active file');
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

        if (!body.trim()) {
            new Notice('❌ No content to organize');
            return;
        }

        try {
            new Notice('🤖 Organizing notes with AI...');
            
            // Extract and read images from note
            const imagePaths = this.extractImagePaths(body, file);
            const images: Array<{ base64: string; mediaType: string }> = [];
            
            if (imagePaths.length > 0) {
                console.log(`[KantataSync] Found ${imagePaths.length} images in note`);
                for (const imgPath of imagePaths.slice(0, 5)) { // Limit to 5 images
                    const imgData = await this.readImageAsBase64(imgPath, file);
                    if (imgData) {
                        images.push(imgData);
                        console.log(`[KantataSync] Loaded image: ${imgPath}`);
                    }
                }
            }
            
            // Organize with AI, passing original notes and images
            const organized = await this.organizeNotesWithTemplate(body, customerName, body.trim(), images);
            
            // Replace content (keep frontmatter)
            editor.setValue(frontmatter + organized);
            
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
                    new Notice(`✅ Notes organized! Renamed to: ${newName}`);
                } else {
                    new Notice('✅ Notes organized!');
                }
            } else {
                new Notice('✅ Notes organized!');
            }
        } catch (e: any) {
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

        containerEl.createEl('h2', { text: 'KantataSync Settings' });

        // API Settings
        new Setting(containerEl)
            .setName('Kantata API Token')
            .setDesc('Your Kantata/Mavenlink OAuth token')
            .addText(text => text
                .setPlaceholder('Enter your token')
                .setValue(this.plugin.settings.kantataToken)
                .onChange(async (value) => {
                    this.plugin.settings.kantataToken = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('API Base URL')
            .setDesc('Kantata API endpoint (usually leave as default)')
            .addText(text => text
                .setValue(this.plugin.settings.apiBaseUrl)
                .onChange(async (value) => {
                    this.plugin.settings.apiBaseUrl = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Include Archived Workspaces')
            .setDesc('Search archived workspaces when resolving customer names')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeArchived)
                .onChange(async (value) => {
                    this.plugin.settings.includeArchived = value;
                    await this.plugin.saveSettings();
                }));

        // Folder Sync Settings
        containerEl.createEl('h3', { text: 'Folder Sync' });

        new Setting(containerEl)
            .setName('Auto-sync folders on startup')
            .setDesc('Automatically create folders for new Kantata projects when Obsidian opens')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoSyncFoldersOnStartup)
                .onChange(async (value) => {
                    this.plugin.settings.autoSyncFoldersOnStartup = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Enable folder polling')
            .setDesc('Periodically check for new Kantata workspaces and create folders')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enablePolling)
                .onChange(async (value) => {
                    this.plugin.settings.enablePolling = value;
                    await this.plugin.saveSettings();
                    this.plugin.setupPolling();
                }));

        new Setting(containerEl)
            .setName('Polling interval (minutes)')
            .setDesc('How often to check for new workspaces (minimum 5 minutes)')
            .addText(text => text
                .setValue(String(this.plugin.settings.pollingIntervalMinutes))
                .onChange(async (value) => {
                    const num = parseInt(value, 10);
                    if (!isNaN(num) && num >= 5) {
                        this.plugin.settings.pollingIntervalMinutes = num;
                        await this.plugin.saveSettings();
                        this.plugin.setupPolling();
                    }
                }));

        // Filtering
        containerEl.createEl('h3', { text: 'Filtering' });

        new Setting(containerEl)
            .setName('Filter by status')
            .setDesc('Only create folders for workspaces with specific statuses')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.filterByStatus)
                .onChange(async (value) => {
                    this.plugin.settings.filterByStatus = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Allowed statuses')
            .setDesc('Comma-separated list of statuses to include (e.g., Active, In Progress, Not Started)')
            .addText(text => text
                .setPlaceholder('Active, In Progress, Not Started')
                .setValue(this.plugin.settings.allowedStatuses.join(', '))
                .onChange(async (value) => {
                    this.plugin.settings.allowedStatuses = value
                        .split(',')
                        .map(s => s.trim())
                        .filter(s => s.length > 0);
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Fetch & Populate Allowed Statuses')
            .setDesc('Fetch all statuses from Kantata and populate the allowed list (then remove ones you don\'t want)')
            .addButton(button => button
                .setButtonText('Fetch & Fill')
                .onClick(async () => {
                    try {
                        const workspaces = await this.plugin.fetchAllWorkspaces();
                        const statuses = [...new Set(workspaces.map(w => w.status || 'No Status'))].sort();
                        this.plugin.settings.allowedStatuses = statuses;
                        await this.plugin.saveSettings();
                        new Notice(`✅ Found ${statuses.length} statuses: ${statuses.join(', ')}`);
                        console.log('[KantataSync] Populated allowed statuses:', statuses);
                        // Refresh the settings display to show updated value
                        this.display();
                    } catch (e: any) {
                        new Notice(`❌ Failed to fetch: ${e.message}`);
                    }
                }));

        new Setting(containerEl)
            .setName('Ignore patterns')
            .setDesc('Workspace names matching these patterns will be skipped. One pattern per line. Use * for wildcard. Variable: {status}')
            .addTextArea(text => text
                .setPlaceholder('Test*\nInternal*\n*Template')
                .setValue(this.plugin.settings.ignorePatterns.join('\n'))
                .onChange(async (value) => {
                    this.plugin.settings.ignorePatterns = value
                        .split('\n')
                        .map(s => s.trim())
                        .filter(s => s.length > 0);
                    await this.plugin.saveSettings();
                }));

        // Dashboard & Status
        containerEl.createEl('h3', { text: 'Dashboard & Status' });

        new Setting(containerEl)
            .setName('Create dashboard note')
            .setDesc('Auto-create an index note in each folder with workspace details (team, dates, budget)')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.createDashboardNote)
                .onChange(async (value) => {
                    this.plugin.settings.createDashboardNote = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Dashboard note name')
            .setDesc('Name of the dashboard note file (e.g., _index.md, README.md)')
            .addText(text => text
                .setPlaceholder('_index.md')
                .setValue(this.plugin.settings.dashboardNoteName)
                .onChange(async (value) => {
                    this.plugin.settings.dashboardNoteName = value || '_index.md';
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Show workspace status in status bar')
            .setDesc('Display workspace status (🟢 Active, 🟡 On Hold, etc.) alongside sync status')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showWorkspaceStatusInStatusBar)
                .onChange(async (value) => {
                    this.plugin.settings.showWorkspaceStatusInStatusBar = value;
                    await this.plugin.saveSettings();
                    // Refresh status bar
                    const file = this.plugin.app.workspace.getActiveFile();
                    this.plugin.updateStatusBarForFile(file);
                }));

        new Setting(containerEl)
            .setName('Refresh dashboards on poll')
            .setDesc('Update all dashboard notes with latest workspace data when polling runs')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.refreshDashboardsOnPoll)
                .onChange(async (value) => {
                    this.plugin.settings.refreshDashboardsOnPoll = value;
                    await this.plugin.saveSettings();
                }));

        // Auto-Archive
        containerEl.createEl('h3', { text: 'Auto-Archive' });

        new Setting(containerEl)
            .setName('Enable auto-archive')
            .setDesc('Automatically move folders to archive when workspace status matches')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableAutoArchive)
                .onChange(async (value) => {
                    this.plugin.settings.enableAutoArchive = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Archive folder name')
            .setDesc('Folder to move archived projects to (type to search existing folders)')
            .addText(text => {
                text.setPlaceholder('_Archive')
                    .setValue(this.plugin.settings.archiveFolderName)
                    .onChange(async (value) => {
                        this.plugin.settings.archiveFolderName = value || '_Archive';
                        await this.plugin.saveSettings();
                    });
                // Add folder autocomplete
                new FolderSuggest(this.app, text.inputEl);
            });

        new Setting(containerEl)
            .setName('Archive statuses')
            .setDesc('Manually enter statuses that trigger archiving (comma-separated). Check your Kantata workspace status dropdown for available values.')
            .addText(text => text
                .setPlaceholder('Closed, Cancelled, Completed, Done')
                .setValue(this.plugin.settings.archiveStatuses.join(', '))
                .onChange(async (value) => {
                    this.plugin.settings.archiveStatuses = value
                        .split(',')
                        .map(s => s.trim())
                        .filter(s => s.length > 0);
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Enable auto-unarchive')
            .setDesc('Automatically move folders back out of archive when workspace status changes to a non-archive status')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableAutoUnarchive)
                .onChange(async (value) => {
                    this.plugin.settings.enableAutoUnarchive = value;
                    await this.plugin.saveSettings();
                }));

        // AI Time Entry
        containerEl.createEl('h3', { text: 'AI Time Entry' });

        new Setting(containerEl)
            .setName('Enable AI Time Entry')
            .setDesc('Automatically create time entries when notes sync to Kantata')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableAiTimeEntry)
                .onChange(async (value) => {
                    this.plugin.settings.enableAiTimeEntry = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Enhance Notes')
            .setDesc('AI proofreads, applies template structure, and expands brief notes before submitting')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.proofreadNotes)
                .onChange(async (value) => {
                    this.plugin.settings.proofreadNotes = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('AI Provider')
            .setDesc('Choose AI provider for time entry analysis')
            .addDropdown(dropdown => dropdown
                .addOption('anthropic', 'Anthropic (Claude)')
                .addOption('openai', 'OpenAI (GPT)')
                .addOption('google', 'Google AI (Gemini)')
                .addOption('openrouter', 'OpenRouter (Many Models)')
                .addOption('ollama', 'Ollama (Local - Free)')
                .addOption('manual', 'Manual (No AI)')
                .setValue(this.plugin.settings.aiProvider)
                .onChange(async (value: 'anthropic' | 'openai' | 'google' | 'openrouter' | 'ollama' | 'manual') => {
                    this.plugin.settings.aiProvider = value;
                    await this.plugin.saveSettings();
                    this.display(); // Refresh to show provider-specific fields
                }));

        // Provider-specific settings
        const provider = this.plugin.settings.aiProvider;

        if (provider === 'anthropic') {
            new Setting(containerEl)
                .setName('Anthropic API Key')
                .setDesc(createFragment(frag => {
                    frag.appendText('Get from ');
                    frag.createEl('a', {
                        text: 'console.anthropic.com',
                        href: 'https://console.anthropic.com/settings/keys'
                    });
                    frag.appendText(' (starts with sk-ant-api03-...)');
                }))
                .addText(text => text
                    .setPlaceholder('sk-ant-api03-...')
                    .setValue(this.plugin.settings.anthropicApiKey)
                    .onChange(async (value) => {
                        this.plugin.settings.anthropicApiKey = value;
                        await this.plugin.saveSettings();
                    })
                    .inputEl.type = 'password');

            new Setting(containerEl)
                .setName('Claude Model')
                .addDropdown(dropdown => dropdown
                    .addOption('claude-opus-4-20250514', 'Claude Opus 4.5')
                    .addOption('claude-sonnet-4-20250514', 'Claude Sonnet 4.5')
                    .addOption('claude-sonnet-4-20250514', 'Claude Sonnet 4')
                    .addOption('claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet')
                    .addOption('claude-3-haiku-20240307', 'Claude 3 Haiku (faster)')
                    .setValue(this.plugin.settings.anthropicModel)
                    .onChange(async (value) => {
                        this.plugin.settings.anthropicModel = value;
                        await this.plugin.saveSettings();
                    }));
        }

        if (provider === 'openai') {
            new Setting(containerEl)
                .setName('OpenAI API Key')
                .setDesc('Get from platform.openai.com (starts with sk-...)')
                .addText(text => text
                    .setPlaceholder('sk-...')
                    .setValue(this.plugin.settings.openaiApiKey)
                    .onChange(async (value) => {
                        this.plugin.settings.openaiApiKey = value;
                        await this.plugin.saveSettings();
                    })
                    .inputEl.type = 'password');

            new Setting(containerEl)
                .setName('OpenAI Model')
                .addDropdown(dropdown => dropdown
                    .addOption('gpt-4o', 'GPT-4o (recommended)')
                    .addOption('gpt-4o-mini', 'GPT-4o Mini (faster)')
                    .addOption('gpt-4-turbo', 'GPT-4 Turbo')
                    .addOption('gpt-3.5-turbo', 'GPT-3.5 Turbo (cheapest)')
                    .setValue(this.plugin.settings.openaiModel)
                    .onChange(async (value) => {
                        this.plugin.settings.openaiModel = value;
                        await this.plugin.saveSettings();
                    }));
        }

        if (provider === 'google') {
            new Setting(containerEl)
                .setName('Google AI API Key')
                .setDesc('Get from aistudio.google.com')
                .addText(text => text
                    .setPlaceholder('AIza...')
                    .setValue(this.plugin.settings.googleApiKey)
                    .onChange(async (value) => {
                        this.plugin.settings.googleApiKey = value;
                        await this.plugin.saveSettings();
                    })
                    .inputEl.type = 'password');

            new Setting(containerEl)
                .setName('Gemini Model')
                .addDropdown(dropdown => dropdown
                    .addOption('gemini-2.5-pro-preview-06-05', 'Gemini 3 Pro (latest)')
                    .addOption('gemini-2.0-flash', 'Gemini 2.0 Flash')
                    .addOption('gemini-2.0-flash-lite', 'Gemini 2.0 Flash Lite (fastest)')
                    .addOption('gemini-1.5-pro', 'Gemini 1.5 Pro')
                    .addOption('gemini-1.5-flash', 'Gemini 1.5 Flash')
                    .setValue(this.plugin.settings.googleModel)
                    .onChange(async (value) => {
                        this.plugin.settings.googleModel = value;
                        await this.plugin.saveSettings();
                    }));
        }

        if (provider === 'openrouter') {
            new Setting(containerEl)
                .setName('OpenRouter API Key')
                .setDesc('Get from openrouter.ai/keys')
                .addText(text => text
                    .setPlaceholder('sk-or-v1-...')
                    .setValue(this.plugin.settings.openrouterApiKey)
                    .onChange(async (value) => {
                        this.plugin.settings.openrouterApiKey = value;
                        await this.plugin.saveSettings();
                    })
                    .inputEl.type = 'password');

            new Setting(containerEl)
                .setName('OpenRouter Model')
                .setDesc('Access Claude, GPT, Gemini, Llama, and more with one API key')
                .addDropdown(dropdown => dropdown
                    // Anthropic
                    .addOption('anthropic/claude-opus-4', 'Claude Opus 4.5')
                    .addOption('anthropic/claude-sonnet-4', 'Claude Sonnet 4.5')
                    .addOption('anthropic/claude-3.5-sonnet', 'Claude 3.5 Sonnet')
                    .addOption('anthropic/claude-3-haiku', 'Claude 3 Haiku')
                    // OpenAI
                    .addOption('openai/gpt-4o', 'GPT-4o')
                    .addOption('openai/gpt-4o-mini', 'GPT-4o Mini')
                    .addOption('openai/gpt-4-turbo', 'GPT-4 Turbo')
                    // Google
                    .addOption('google/gemini-2.5-pro-preview', 'Gemini 3 Pro')
                    .addOption('google/gemini-2.0-flash-001', 'Gemini 2.0 Flash')
                    .addOption('google/gemini-flash-1.5', 'Gemini 1.5 Flash')
                    // Meta
                    .addOption('meta-llama/llama-3.3-70b-instruct', 'Llama 3.3 70B')
                    .addOption('meta-llama/llama-3.1-8b-instruct', 'Llama 3.1 8B (cheap)')
                    // Mistral
                    .addOption('mistralai/mistral-large-2411', 'Mistral Large')
                    .addOption('mistralai/mistral-small-2503', 'Mistral Small')
                    // DeepSeek
                    .addOption('deepseek/deepseek-chat-v3-0324', 'DeepSeek V3')
                    .addOption('deepseek/deepseek-r1', 'DeepSeek R1')
                    .setValue(this.plugin.settings.openrouterModel)
                    .onChange(async (value) => {
                        this.plugin.settings.openrouterModel = value;
                        await this.plugin.saveSettings();
                    }));
        }

        if (provider === 'ollama') {
            new Setting(containerEl)
                .setName('Ollama Endpoint')
                .setDesc('Local Ollama server URL (no API key needed!)')
                .addText(text => text
                    .setPlaceholder('http://localhost:11434')
                    .setValue(this.plugin.settings.ollamaEndpoint)
                    .onChange(async (value) => {
                        this.plugin.settings.ollamaEndpoint = value || 'http://localhost:11434';
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('Ollama Model')
                .setDesc('Model name (run "ollama list" to see available)')
                .addText(text => text
                    .setPlaceholder('llama3.2')
                    .setValue(this.plugin.settings.ollamaModel)
                    .onChange(async (value) => {
                        this.plugin.settings.ollamaModel = value || 'llama3.2';
                        await this.plugin.saveSettings();
                    }));
        }

        if (provider === 'manual') {
            new Setting(containerEl)
                .setName('Default Hours')
                .setDesc('Default hours for time entry (no AI analysis)')
                .addText(text => text
                    .setPlaceholder('1.0')
                    .setValue(String(this.plugin.settings.manualDefaultHours))
                    .onChange(async (value) => {
                        this.plugin.settings.manualDefaultHours = parseFloat(value) || 1.0;
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('Default Category')
                .setDesc('Default category for time entry')
                .addText(text => text
                    .setPlaceholder('Consulting')
                    .setValue(this.plugin.settings.manualDefaultCategory)
                    .onChange(async (value) => {
                        this.plugin.settings.manualDefaultCategory = value || 'Consulting';
                        await this.plugin.saveSettings();
                    }));
        }

        // Test button (not for manual mode)
        if (provider !== 'manual') {
            new Setting(containerEl)
                .setName('Test AI Connection')
                .setDesc(`Verify ${provider} credentials`)
                .addButton(button => button
                    .setButtonText('Test')
                    .onClick(async () => {
                        try {
                            const response = await this.plugin.callAI('Reply with just: OK');
                            if (response.toLowerCase().includes('ok')) {
                                new Notice(`✅ ${provider} connected!`);
                            } else {
                                new Notice(`✅ Connected: ${response.slice(0, 50)}`);
                            }
                        } catch (e: any) {
                            new Notice(`❌ ${provider} failed: ${e.message}`);
                        }
                    }));
        }

        // Cache Management
        containerEl.createEl('h3', { text: 'Cache Management' });

        new Setting(containerEl)
            .setName('Clear Workspace Cache')
            .setDesc('⚠️ USE WITH CAUTION: Removes all cached customer → workspace mappings. You will need to re-link folders.')
            .addButton(button => button
                .setButtonText('Clear Cache')
                .setWarning()
                .onClick(async () => {
                    this.plugin.workspaceCache = {};
                    await this.plugin.saveWorkspaceCache();
                    new Notice('Workspace cache cleared');
                }));

        // Test Connection
        containerEl.createEl('h3', { text: 'Test Connection' });

        new Setting(containerEl)
            .setName('Validate API Connection')
            .setDesc('Test that your token works')
            .addButton(button => button
                .setButtonText('Test')
                .onClick(async () => {
                    try {
                        const response = await this.plugin.apiRequest('/users/me.json');
                        const users = Object.values(response.users || {}) as any[];
                        if (users.length > 0) {
                            new Notice(`✅ Connected as: ${users[0].full_name}`);
                        }
                    } catch (e: any) {
                        new Notice(`❌ Connection failed: ${e.message}`);
                    }
                }));
    }
}
