import * as vscode from 'vscode';
import { SkillManager } from './managers/SkillManager';
import { SkillWebviewProvider } from './ui/SkillWebviewProvider';

export function activate(context: vscode.ExtensionContext) {
	console.log('Skills Wizard is now active!');

	const skillManager = new SkillManager(context);
	
	const sidebarProvider = new SkillWebviewProvider(context.extensionUri, skillManager);
	
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			SkillWebviewProvider.viewType,
			sidebarProvider
		)
	);

    // Register a command to refresh the view manually if needed
	context.subscriptions.push(
		vscode.commands.registerCommand('skills-wizard.refresh', () => {
			sidebarProvider.refresh();
		})
	);
}

export function deactivate() {}
