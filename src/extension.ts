import * as vscode from 'vscode';
import { SkillManager } from './managers/SkillManager';
import { SkillWebviewProvider } from './ui/SkillWebviewProvider';

export function activate(context: vscode.ExtensionContext) {
	console.log('Skills Wizard is now active!');

	const skillManager = new SkillManager(context);
	
	const importProvider = new SkillWebviewProvider(context.extensionUri, skillManager, SkillWebviewProvider.viewTypeImport);
	const mySkillsProvider = new SkillWebviewProvider(context.extensionUri, skillManager, SkillWebviewProvider.viewTypeMySkills);
	const presetsProvider = new SkillWebviewProvider(context.extensionUri, skillManager, SkillWebviewProvider.viewTypePresets);
	const settingsProvider = new SkillWebviewProvider(context.extensionUri, skillManager, SkillWebviewProvider.viewTypeSettings);
	
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(SkillWebviewProvider.viewTypeImport, importProvider),
		vscode.window.registerWebviewViewProvider(SkillWebviewProvider.viewTypeMySkills, mySkillsProvider),
		vscode.window.registerWebviewViewProvider(SkillWebviewProvider.viewTypePresets, presetsProvider),
		vscode.window.registerWebviewViewProvider(SkillWebviewProvider.viewTypeSettings, settingsProvider)
	);

    // Register a command to refresh all views manually
	context.subscriptions.push(
		vscode.commands.registerCommand('skills-wizard.refresh', () => {
			importProvider.refresh();
			mySkillsProvider.refresh();
			presetsProvider.refresh();
			settingsProvider.refresh();
		})
	);
}

export function deactivate() {}
