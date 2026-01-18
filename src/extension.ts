import * as vscode from 'vscode';
import { SkillManager } from './managers/SkillManager';
import { ImportTreeProvider } from './providers/ImportTreeProvider';
import { MySkillsTreeProvider } from './providers/MySkillsTreeProvider';
import { PresetsTreeProvider } from './providers/PresetsTreeProvider';
import { SettingsTreeProvider } from './providers/SettingsTreeProvider';
import { registerCommands } from './commands';

export async function activate(context: vscode.ExtensionContext) {
	console.log('Skills Wizard is now active!');

	const skillManager = new SkillManager(context);
	
	// Create tree data providers
	const importProvider = new ImportTreeProvider(skillManager);
	const mySkillsProvider = new MySkillsTreeProvider(skillManager);
	const presetsProvider = new PresetsTreeProvider(skillManager);
	const settingsProvider = new SettingsTreeProvider(skillManager);
	
	// Register tree views
	const importView = vscode.window.createTreeView('skillsWizard.importView', {
		treeDataProvider: importProvider,
		showCollapseAll: true
	});
	
	const mySkillsView = vscode.window.createTreeView('skillsWizard.mySkillsView', {
		treeDataProvider: mySkillsProvider,
		showCollapseAll: true
	});
	
	const presetsView = vscode.window.createTreeView('skillsWizard.presetsView', {
		treeDataProvider: presetsProvider,
		showCollapseAll: true
	});
	
	const settingsView = vscode.window.createTreeView('skillsWizard.settingsView', {
		treeDataProvider: settingsProvider,
		showCollapseAll: false
	});
	
	context.subscriptions.push(importView, mySkillsView, presetsView, settingsView);
	
	// Setup file watcher for SKILL.md files to auto-update
	const storagePath = await skillManager.getEffectiveStoragePath();
	const skillsPattern = new vscode.RelativePattern(storagePath, '**/SKILL.md');
	const skillFileWatcher = vscode.workspace.createFileSystemWatcher(skillsPattern);
	
	// Debounce function to avoid too frequent updates
	let updateTimeout: NodeJS.Timeout | undefined;
	const debounceUpdate = () => {
		if (updateTimeout) {
			clearTimeout(updateTimeout);
		}
		updateTimeout = setTimeout(async () => {
			console.log('[Extension] File watcher triggered, starting synchronization...');
			
			// First, synchronize skill IDs (handle MD5 changes from external edits)
			const hadMigrations = await skillManager.synchronizeSkillIds();
			console.log(`[Extension] Synchronization complete, had migrations: ${hadMigrations}`);
			
			// Then refresh the views
			console.log('[Extension] Refreshing views...');
			await Promise.all([
				mySkillsProvider.loadSkills(),
				presetsProvider.loadPresets()
			]);
			console.log('[Extension] Views refreshed');
		}, 500);
	};
	
	skillFileWatcher.onDidChange(debounceUpdate);
	skillFileWatcher.onDidCreate(debounceUpdate);
	skillFileWatcher.onDidDelete(debounceUpdate);
	
	context.subscriptions.push(skillFileWatcher);
	
	// Register all commands
	registerCommands(context, skillManager, importProvider, mySkillsProvider, presetsProvider, settingsProvider);
	
	// Initial load
	await Promise.all([
		importProvider.loadSkills(),
		mySkillsProvider.loadSkills(),
		presetsProvider.loadPresets()
	]);
	
	console.log('Skills Wizard activated successfully!');
}

export function deactivate() {}
