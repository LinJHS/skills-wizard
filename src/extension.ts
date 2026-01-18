import * as vscode from 'vscode';
import { SkillManager } from './managers/SkillManager';
import { SkillsTreeProvider } from './providers/SkillsTreeProvider';
import { PresetsTreeProvider } from './providers/PresetsTreeProvider';
import { ImportTreeProvider } from './providers/ImportTreeProvider';
import { Skill, Preset } from './models/types';

export function activate(context: vscode.ExtensionContext) {
	console.log('Skills Wizard is now active!');

	const skillManager = new SkillManager(context);
	
	// Create tree providers
	const skillsProvider = new SkillsTreeProvider(skillManager);
	const presetsProvider = new PresetsTreeProvider(skillManager);
	const importProvider = new ImportTreeProvider(skillManager);
	
	// Register tree views
	const skillsTreeView = vscode.window.createTreeView('skillsWizard.mySkillsView', {
		treeDataProvider: skillsProvider,
		showCollapseAll: true
	});
	
	const presetsTreeView = vscode.window.createTreeView('skillsWizard.presetsView', {
		treeDataProvider: presetsProvider,
		showCollapseAll: true
	});
	
	const importTreeView = vscode.window.createTreeView('skillsWizard.importView', {
		treeDataProvider: importProvider,
		showCollapseAll: false
	});
	
	context.subscriptions.push(skillsTreeView, presetsTreeView, importTreeView);

    // Helper function to refresh all views
	const refreshAll = () => {
		importProvider.refresh();
		skillsProvider.refresh();
		presetsProvider.refresh();
	};

    // Register commands
	context.subscriptions.push(
		vscode.commands.registerCommand('skills-wizard.refresh', refreshAll),
		
		vscode.commands.registerCommand('skills-wizard.importSkill', async () => {
			const uris = await vscode.window.showOpenDialog({
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				openLabel: 'Select Skill Folder',
				title: 'Import Skill from Folder'
			});
			if (uris && uris[0]) {
				const result = await skillManager.scanCustomPath(uris[0].fsPath);
				if (result.total === 0) {
					vscode.window.showWarningMessage('No skills found in selected folder.');
				} else {
					vscode.window.showInformationMessage(`Found ${result.total} skill(s) (${result.added} new).`);
					refreshAll();
				}
			}
		}),
		
		vscode.commands.registerCommand('skills-wizard.importSkillFromTree', async (skill: any) => {
			try {
				await skillManager.importSkill(skill);
				vscode.window.showInformationMessage(`Skill "${skill.name}" imported successfully`);
				refreshAll();
			} catch (e: any) {
				vscode.window.showErrorMessage(`Failed to import skill: ${e.message}`);
			}
		}),
		
		vscode.commands.registerCommand('skills-wizard.exportSkill', async () => {
			const skills = await skillManager.scanForSkills();
			if (skills.imported.length === 0) {
				vscode.window.showWarningMessage('No imported skills to export.');
				return;
			}
			const skillNames = skills.imported.map(s => ({
				label: s.name,
				description: s.description,
				id: s.id
			}));
			const selected = await vscode.window.showQuickPick(skillNames, {
				title: 'Select Skill to Export',
				placeHolder: 'Choose a skill to export to workspace'
			});
			if (selected) {
				try {
					await skillManager.exportSkillToWorkspace(selected.id);
					vscode.window.showInformationMessage(`Skill "${selected.label}" exported to workspace.`);
				} catch (e: any) {
					vscode.window.showErrorMessage(`Failed to export skill: ${e.message}`);
				}
			}
		}),
		
		vscode.commands.registerCommand('skills-wizard.scanWorkspace', async () => {
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: 'Scanning workspace for skills...',
				cancellable: false
			}, async () => {
				const result = await skillManager.scanForSkills();
					vscode.window.showInformationMessage(
					`Found ${result.discovered.length} skill(s) in workspace and global paths.`
				);
				refreshAll();
			});
		}),
		
		vscode.commands.registerCommand('skills-wizard.scanGitHub', async () => {
			const url = await vscode.window.showInputBox({
				title: 'Import from GitHub',
				prompt: 'Enter GitHub repository URL',
				placeHolder: 'https://github.com/owner/repo',
				validateInput: (value) => {
					if (!value.includes('github.com')) {
						return 'Please enter a valid GitHub URL';
					}
					return null;
				}
			});
			if (url) {
				try {
					await vscode.window.withProgress({
						location: vscode.ProgressLocation.Notification,
						title: 'Scanning GitHub repository...',
						cancellable: false
					}, async () => {
						const result = await skillManager.scanGitHub(url);
						if (result.total === 0) {
							vscode.window.showWarningMessage('No skills found in this repository.');
						} else {
							vscode.window.showInformationMessage(`Found ${result.total} skill(s) (${result.added} new).`);
						}
					});
					refreshAll();
				} catch (e: any) {
					vscode.window.showErrorMessage(`GitHub scan failed: ${e.message}`);
				}
			}
		}),
		
		vscode.commands.registerCommand('skills-wizard.createPreset', async () => {
			const skills = await skillManager.scanForSkills();
			if (skills.imported.length === 0) {
				vscode.window.showWarningMessage('No imported skills. Import some skills first.');
				return;
			}
			const presetName = await vscode.window.showInputBox({
				title: 'Create Preset',
				prompt: 'Enter preset name',
				placeHolder: 'My Preset'
			});
			if (presetName) {
				try {
					await skillManager.savePreset({
						id: Date.now().toString(),
						name: presetName,
						skillIds: []
					});
					vscode.window.showInformationMessage(`Preset "${presetName}" created.`);
					refreshAll();
				} catch (e: any) {
					vscode.window.showErrorMessage(`Failed to create preset: ${e.message}`);
				}
			}
		}),
		
		vscode.commands.registerCommand('skills-wizard.openSettings', () => {
			vscode.commands.executeCommand('workbench.action.openSettings', 'skillsWizard');
		}),
		
		// Skill actions
		vscode.commands.registerCommand('skills-wizard.skill.export', async (skill: Skill) => {
			try {
				await skillManager.exportSkillToWorkspace(skill.id);
				vscode.window.showInformationMessage(`Skill "${skill.name}" exported to workspace.`);
			} catch (e: any) {
				vscode.window.showErrorMessage(`Failed to export skill: ${e.message}`);
			}
		}),
		
		vscode.commands.registerCommand('skills-wizard.skill.open', async (skill: Skill) => {
			try {
				const filePath = await skillManager.getSkillFilePath(skill.id);
				if (filePath) {
					await vscode.window.showTextDocument(vscode.Uri.file(filePath));
				}
			} catch (e: any) {
				vscode.window.showErrorMessage(`Failed to open skill file: ${e.message}`);
			}
		}),
		
		vscode.commands.registerCommand('skills-wizard.skill.edit', async (skill: Skill) => {
			const tagsInput = await vscode.window.showInputBox({
				title: 'Edit Tags',
				prompt: 'Enter comma-separated tags',
				value: skill.tags?.join(', ') || '',
				placeHolder: 'tag1, tag2, tag3'
			});
			if (tagsInput !== undefined) {
				const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
				await skillManager.updateSkillMetadata(skill.id, { tags });
				refreshAll();
			}
		}),
		
		vscode.commands.registerCommand('skills-wizard.skill.delete', async (skill: Skill) => {
			const confirm = await vscode.window.showWarningMessage(
				`Delete skill "${skill.name}"?`,
				{ modal: true },
				'Delete'
			);
			if (confirm === 'Delete') {
				await skillManager.deleteSkill(skill.id);
				vscode.window.showInformationMessage(`Skill "${skill.name}" deleted.`);
				refreshAll();
			}
		}),
		
		// Preset actions
		vscode.commands.registerCommand('skills-wizard.preset.apply-merge', async (preset: Preset) => {
			try {
				await skillManager.applyPreset(preset.id, 'merge');
				vscode.window.showInformationMessage(`Preset "${preset.name}" applied (merged).`);
			} catch (e: any) {
				vscode.window.showErrorMessage(`Failed to apply preset: ${e.message}`);
			}
		}),
		
		vscode.commands.registerCommand('skills-wizard.preset.apply-replace', async (preset: Preset) => {
			const confirm = await vscode.window.showWarningMessage(
				`Replace all skills in workspace with preset "${preset.name}"?`,
				{ modal: true },
				'Replace'
			);
			if (confirm === 'Replace') {
				try {
					await skillManager.applyPreset(preset.id, 'replace');
					vscode.window.showInformationMessage(`Preset "${preset.name}" applied (replaced).`);
				} catch (e: any) {
					vscode.window.showErrorMessage(`Failed to apply preset: ${e.message}`);
				}
			}
		}),
		
		vscode.commands.registerCommand('skills-wizard.preset.export', async (preset: Preset) => {
			const uri = await vscode.window.showSaveDialog({
				filters: { 'Zip Files': ['zip'] },
				saveLabel: 'Export preset',
				defaultUri: vscode.Uri.file(`${preset.name}.zip`)
			});
			if (uri) {
				try {
					await skillManager.exportPresetsToZip([preset.id], uri.fsPath);
					vscode.window.showInformationMessage(`Preset "${preset.name}" exported.`);
				} catch (e: any) {
					vscode.window.showErrorMessage(`Failed to export preset: ${e.message}`);
				}
			}
		}),
		
		vscode.commands.registerCommand('skills-wizard.preset.delete', async (preset: Preset) => {
			const confirm = await vscode.window.showWarningMessage(
				`Delete preset "${preset.name}"?`,
				{ modal: true },
				'Delete'
			);
			if (confirm === 'Delete') {
				await skillManager.deletePreset(preset.id);
				vscode.window.showInformationMessage(`Preset "${preset.name}" deleted.`);
				refreshAll();
			}
		})
	);
}

export function deactivate() {}
