import * as vscode from 'vscode';
import { SkillManager } from './managers/SkillManager';
import { ImportTreeProvider } from './providers/ImportTreeProvider';
import { MySkillsTreeProvider } from './providers/MySkillsTreeProvider';
import { PresetsTreeProvider } from './providers/PresetsTreeProvider';
import { registerCommands } from './commands';

export async function activate(context: vscode.ExtensionContext) {
	console.log('Skills Wizard is now active!');

	const skillManager = new SkillManager(context);
	
	// Create tree data providers
	const importProvider = new ImportTreeProvider(skillManager);
	const mySkillsProvider = new MySkillsTreeProvider(skillManager);
	const presetsProvider = new PresetsTreeProvider(skillManager);
	
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
	
	context.subscriptions.push(importView, mySkillsView, presetsView);
	
	// Register all commands
	registerCommands(context, skillManager, importProvider, mySkillsProvider, presetsProvider);
	
	// Initial load
	await Promise.all([
		importProvider.loadSkills(),
		mySkillsProvider.loadSkills(),
		presetsProvider.loadPresets()
	]);
	
	console.log('Skills Wizard activated successfully!');
}

export function deactivate() {}
