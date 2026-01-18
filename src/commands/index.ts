import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { SkillManager } from '../managers/SkillManager';
import { ImportTreeProvider, ImportTreeItem } from '../providers/ImportTreeProvider';
import { MySkillsTreeProvider, MySkillTreeItem } from '../providers/MySkillsTreeProvider';
import { PresetsTreeProvider, PresetTreeItem } from '../providers/PresetsTreeProvider';
import { Preset } from '../models/types';

export function registerCommands(
  context: vscode.ExtensionContext,
  skillManager: SkillManager,
  importProvider: ImportTreeProvider,
  mySkillsProvider: MySkillsTreeProvider,
  presetsProvider: PresetsTreeProvider
): void {
  
  // Refresh all views
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.refresh', async () => {
      await Promise.all([
        importProvider.loadSkills(),
        mySkillsProvider.loadSkills(),
        presetsProvider.loadPresets()
      ]);
      vscode.window.showInformationMessage('Skills Wizard refreshed');
    })
  );
  
  // Scan workspace
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.scanWorkspace', async () => {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Scanning workspace for skills...',
        cancellable: false
      }, async () => {
        await importProvider.loadSkills();
      });
    })
  );
  
  // Scan custom path
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.scanCustomPath', async () => {
      const uris = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Scan for Skills'
      });
      
      if (uris && uris[0]) {
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: 'Scanning for skills...',
          cancellable: false
        }, async () => {
          const result = await skillManager.scanCustomPath(uris[0].fsPath);
          if (result.total === 0) {
            vscode.window.showWarningMessage('No skills found in selected folder.');
          } else {
            vscode.window.showInformationMessage(`Found ${result.total} skill(s) (${result.added} new).`);
          }
          await importProvider.loadSkills();
        });
      }
    })
  );
  
  // Scan GitHub
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.scanGitHub', async () => {
      const url = await vscode.window.showInputBox({
        prompt: 'Enter GitHub repository URL',
        placeHolder: 'https://github.com/username/repo or https://github.com/username/repo/tree/branch/path',
        validateInput: (value) => {
          if (!value || !value.includes('github.com')) {
            return 'Please enter a valid GitHub URL';
          }
          return null;
        }
      });
      
      if (!url) {
        return;
      }
      
      try {
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: 'Scanning GitHub repository...',
          cancellable: false
        }, async () => {
          const result = await skillManager.scanGitHub(url);
          if (result.total === 0) {
            vscode.window.showWarningMessage(
              'No skills found in this repo. Tip: this extension scans common skill folders (e.g. `.claude/skills/` and `skills/`). ' +
              'If your repo stores skills in another subfolder, try a URL like: https://github.com/<owner>/<repo>/tree/<branch>/<path>.'
            );
          } else if (result.added === 0) {
            vscode.window.showInformationMessage(`Found ${result.total} skill(s) in repo (0 new).`);
          } else {
            vscode.window.showInformationMessage(`Found ${result.total} skill(s) in repo (${result.added} new).`);
          }
          await importProvider.loadSkills();
        });
      } catch (e: any) {
        vscode.window.showErrorMessage('GitHub Scan Failed: ' + e.message);
      }
    })
  );
  
  // Import bundle
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.importBundle', async () => {
      const uris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Import bundle (.zip or folder)',
        filters: { 'Zip Files': ['zip'] }
      });
      
      if (!uris || !uris[0]) {
        return;
      }
      
      const choice = await vscode.window.showWarningMessage(
        'If names conflict, how should we handle them?',
        { modal: true },
        'Overwrite',
        'Skip conflicts'
      );
      
      if (!choice) {
        return;
      }
      
      const allowOverwrite = choice === 'Overwrite';
      
      const importMode = await vscode.window.showInformationMessage(
        'Choose preset import mode',
        { modal: true },
        'Import by name',
        'Import as-is'
      );
      
      if (!importMode) {
        return;
      }
      
      const importPresetsAsIs = importMode === 'Import as-is';
      
      try {
        const result = await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: 'Importing bundle...',
          cancellable: false
        }, async () => {
          return await skillManager.importBundle(uris[0].fsPath, allowOverwrite, importPresetsAsIs);
        });
        
        vscode.window.showInformationMessage(
          `Imported ${result.imported}/${result.totalSkills} skill(s)` +
          `, overwritten ${result.overwritten}, skipped ${result.skipped}. ` +
          `Presets: +${result.presetsImported}, overwritten ${result.presetsOverwritten}, skipped ${result.presetsSkipped}.`
        );
        
        await Promise.all([
          importProvider.loadSkills(),
          mySkillsProvider.loadSkills(),
          presetsProvider.loadPresets()
        ]);
      } catch (e: any) {
        vscode.window.showErrorMessage(e?.message || 'Failed to import bundle');
      }
    })
  );
  
  // Import skill
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.importSkill', async (item?: ImportTreeItem) => {
      if (!item?.skill) {
        return;
      }
      
      const { imported } = await skillManager.scanForSkills();
      const conflict = imported.find(s =>
        s.name.trim().toLowerCase() === item.skill!.name.trim().toLowerCase() &&
        s.md5 !== item.skill!.md5
      );
      
      if (conflict) {
        const res = await vscode.window.showWarningMessage(
          `Skill name "${item.skill.name}" already exists. Overwrite it?`,
          { modal: true },
          'Overwrite'
        );
        if (res !== 'Overwrite') {
          return;
        }
      }
      
      // Ask for tags
      const tagsInput = await vscode.window.showInputBox({
        prompt: 'Add tags (comma-separated, optional)',
        placeHolder: 'tag1, tag2, tag3'
      });
      
      const tags = tagsInput
        ? tagsInput.split(',').map(t => t.trim()).filter(Boolean)
        : [];
      
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Importing skill "${item.skill.name}"...`,
        cancellable: false
      }, async () => {
        const importedId = await skillManager.importSkill(item.skill!);
        if (tags.length > 0) {
          await skillManager.updateSkillMetadata(importedId, { tags });
        }
      });
      
      vscode.window.showInformationMessage(`Skill "${item.skill.name}" imported successfully`);
      
      await Promise.all([
        importProvider.loadSkills(),
        mySkillsProvider.loadSkills()
      ]);
    })
  );
  
  // Import all skills
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.importAllSkills', async () => {
      await importProvider.loadSkills();
      const { discovered, imported } = await skillManager.scanForSkills();
      
      if (discovered.length === 0) {
        vscode.window.showWarningMessage('No skills found to import.');
        return;
      }
      
      const existingByName = new Map(imported.map(s => [s.name.trim().toLowerCase(), s]));
      const conflicts = discovered.filter(skill => {
        const existing = existingByName.get(skill.name.trim().toLowerCase());
        return existing && existing.md5 !== skill.md5;
      });
      
      let allowOverwrite = false;
      if (conflicts.length > 0) {
        const res = await vscode.window.showWarningMessage(
          `${conflicts.length} skill(s) have name conflicts. Overwrite them?`,
          { modal: true },
          'Overwrite',
          'Skip conflicts'
        );
        if (!res) {
          return;
        }
        allowOverwrite = res === 'Overwrite';
      }
      
      const skillsToImport = conflicts.length > 0 && !allowOverwrite
        ? discovered.filter(skill => {
            const existing = existingByName.get(skill.name.trim().toLowerCase());
            return !(existing && existing.md5 !== skill.md5);
          })
        : discovered;
      
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Importing ${skillsToImport.length} skills...`,
        cancellable: false
      }, async () => {
        for (const skill of skillsToImport) {
          await skillManager.importSkill(skill);
        }
      });
      
      vscode.window.showInformationMessage(`Successfully imported ${skillsToImport.length} skills`);
      
      await Promise.all([
        importProvider.loadSkills(),
        mySkillsProvider.loadSkills()
      ]);
    })
  );
  
  // Open skill file
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.openSkill', async (skillIdOrItem: string | MySkillTreeItem | PresetTreeItem) => {
      let skillId: string | undefined;
      
      if (typeof skillIdOrItem === 'string') {
        skillId = skillIdOrItem;
      } else if (skillIdOrItem instanceof MySkillTreeItem && skillIdOrItem.skill) {
        skillId = skillIdOrItem.skill.id;
      } else if (skillIdOrItem instanceof PresetTreeItem && skillIdOrItem.skill) {
        skillId = skillIdOrItem.skill.id;
      }
      
      if (!skillId) {
        return;
      }
      
      try {
        const filePath = await skillManager.getSkillFilePath(skillId);
        if (!filePath) {
          vscode.window.showErrorMessage('SKILL.md not found for this skill');
          return;
        }
        await vscode.window.showTextDocument(vscode.Uri.file(filePath), { preview: false });
      } catch (e: any) {
        vscode.window.showErrorMessage(e?.message || 'Failed to open skill file');
      }
    })
  );
  
  // Add to workspace
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.addToWorkspace', async (item?: MySkillTreeItem) => {
      if (!item?.skill) {
        return;
      }
      
      try {
        await skillManager.exportSkillToWorkspace(item.skill.id);
        vscode.window.showInformationMessage(`Skill "${item.skill.name}" added to workspace`);
      } catch (e: any) {
        vscode.window.showErrorMessage('Failed to add skill: ' + e.message);
      }
    })
  );
  
  // Edit tags
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.editTags', async (item?: MySkillTreeItem) => {
      if (!item?.skill) {
        return;
      }
      
      const current = item.skill.tags?.join(', ') || '';
      const input = await vscode.window.showInputBox({
        title: `Edit tags for "${item.skill.name}"`,
        prompt: 'Comma-separated tags',
        value: current
      });
      
      if (input !== undefined) {
        const tags = input.split(',').map(t => t.trim()).filter(Boolean);
        await skillManager.updateSkillMetadata(item.skill.id, { tags });
        await mySkillsProvider.loadSkills();
        vscode.window.showInformationMessage('Tags updated');
      }
    })
  );
  
  // Delete skill
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.deleteSkill', async (item?: MySkillTreeItem) => {
      if (!item?.skill) {
        return;
      }
      
      const res = await vscode.window.showWarningMessage(
        `Delete skill "${item.skill.name}"?`,
        { modal: true },
        'Delete'
      );
      
      if (res === 'Delete') {
        await skillManager.deleteSkill(item.skill.id);
        await Promise.all([
          mySkillsProvider.loadSkills(),
          presetsProvider.loadPresets()
        ]);
        vscode.window.showInformationMessage('Skill deleted');
      }
    })
  );
  
  // Toggle group by tags
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.toggleGroupByTags', () => {
      mySkillsProvider.toggleGrouping();
    })
  );
  
  // Export skills to zip
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.exportSkillsZip', async () => {
      const { imported } = await skillManager.scanForSkills();
      
      if (imported.length === 0) {
        vscode.window.showWarningMessage('No skills to export');
        return;
      }
      
      // Ask user to select skills
      const selected = await vscode.window.showQuickPick(
        imported.map(s => ({
          label: s.name,
          description: s.description || '',
          picked: false,
          skill: s
        })),
        {
          canPickMany: true,
          placeHolder: 'Select skills to export'
        }
      );
      
      if (!selected || selected.length === 0) {
        return;
      }
      
      const uri = await vscode.window.showSaveDialog({
        filters: { 'Zip Files': ['zip'] },
        saveLabel: 'Export skills zip',
        defaultUri: vscode.Uri.file(path.join(os.homedir(), 'skills-wizard-skills.zip'))
      });
      
      if (!uri) {
        return;
      }
      
      try {
        await skillManager.exportSkillsToZip(selected.map(s => s.skill.id), uri.fsPath);
        vscode.window.showInformationMessage('Skills exported to zip');
      } catch (e: any) {
        vscode.window.showErrorMessage(e?.message || 'Failed to export skills zip');
      }
    })
  );
  
  // Create preset
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.createPreset', async () => {
      const { imported } = await skillManager.scanForSkills();
      
      if (imported.length === 0) {
        vscode.window.showWarningMessage('Import at least one skill before creating a preset');
        return;
      }
      
      const name = await vscode.window.showInputBox({
        prompt: 'Enter preset name',
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Preset name cannot be empty';
          }
          return null;
        }
      });
      
      if (!name) {
        return;
      }
      
      try {
        const newPreset: Preset = {
          id: Date.now().toString(),
          name,
          skillIds: []
        };
        
        await skillManager.savePreset(newPreset);
        await presetsProvider.loadPresets();
        vscode.window.showInformationMessage(`Preset "${name}" created`);
      } catch (e: any) {
        const msg = e?.message || 'Failed to create preset';
        if (msg.includes('already exists')) {
          const res = await vscode.window.showWarningMessage(
            `Preset "${name}" already exists. Overwrite it?`,
            { modal: true },
            'Overwrite'
          );
          if (res === 'Overwrite') {
            await skillManager.savePreset({
              id: Date.now().toString(),
              name,
              skillIds: []
            }, { allowOverwrite: true });
            await presetsProvider.loadPresets();
          }
        } else {
          vscode.window.showErrorMessage(msg);
        }
      }
    })
  );
  
  // Create preset from selection
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.createPresetFromSelection', async () => {
      const { imported } = await skillManager.scanForSkills();
      
      if (imported.length === 0) {
        vscode.window.showWarningMessage('No skills available');
        return;
      }
      
      const selected = await vscode.window.showQuickPick(
        imported.map(s => ({
          label: s.name,
          description: s.description || '',
          picked: false,
          skill: s
        })),
        {
          canPickMany: true,
          placeHolder: 'Select skills for the preset'
        }
      );
      
      if (!selected || selected.length === 0) {
        return;
      }
      
      const name = await vscode.window.showInputBox({
        prompt: 'Enter preset name',
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Preset name cannot be empty';
          }
          return null;
        }
      });
      
      if (!name) {
        return;
      }
      
      try {
        const newPreset: Preset = {
          id: Date.now().toString(),
          name,
          skillIds: selected.map(s => s.skill.id)
        };
        
        await skillManager.savePreset(newPreset);
        await presetsProvider.loadPresets();
        vscode.window.showInformationMessage(`Preset "${name}" created with ${selected.length} skills`);
      } catch (e: any) {
        vscode.window.showErrorMessage(e?.message || 'Failed to create preset');
      }
    })
  );
  
  // Rename preset
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.renamePreset', async (item?: PresetTreeItem) => {
      if (!item?.preset) {
        return;
      }
      
      const newName = await vscode.window.showInputBox({
        prompt: 'Enter new preset name',
        value: item.preset.name,
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Preset name cannot be empty';
          }
          return null;
        }
      });
      
      if (!newName || newName === item.preset.name) {
        return;
      }
      
      try {
        const updated = { ...item.preset, name: newName };
        await skillManager.savePreset(updated);
        await presetsProvider.loadPresets();
        vscode.window.showInformationMessage('Preset renamed');
      } catch (e: any) {
        vscode.window.showErrorMessage(e?.message || 'Failed to rename preset');
      }
    })
  );
  
  // Delete preset
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.deletePreset', async (item?: PresetTreeItem) => {
      if (!item?.preset) {
        return;
      }
      
      const res = await vscode.window.showWarningMessage(
        `Delete preset "${item.preset.name}"?`,
        { modal: true },
        'Delete'
      );
      
      if (res === 'Delete') {
        await skillManager.deletePreset(item.preset.id);
        await presetsProvider.loadPresets();
        vscode.window.showInformationMessage('Preset deleted');
      }
    })
  );
  
  // Apply preset
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.applyPreset', async (item?: PresetTreeItem) => {
      if (!item?.preset) {
        return;
      }
      
      const mode = await vscode.window.showQuickPick(
        [
          { label: 'Merge', description: 'Keep existing skills, add new ones', value: 'merge' as const },
          { label: 'Replace', description: 'Remove all existing skills, add preset skills', value: 'replace' as const }
        ],
        { placeHolder: 'Choose how to apply preset to workspace' }
      );
      
      if (!mode) {
        return;
      }
      
      try {
        await skillManager.applyPreset(item.preset.id, mode.value);
        vscode.window.showInformationMessage(`Preset "${item.preset.name}" applied to workspace`);
      } catch (e: any) {
        vscode.window.showErrorMessage('Failed to apply preset: ' + e.message);
      }
    })
  );
  
  // Add skills to preset
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.addSkillsToPreset', async (item?: PresetTreeItem) => {
      if (!item?.preset) {
        return;
      }
      
      const { imported } = await skillManager.scanForSkills();
      const available = imported.filter(s => !item.preset!.skillIds.includes(s.id));
      
      if (available.length === 0) {
        vscode.window.showInformationMessage('All skills are already in this preset');
        return;
      }
      
      const selected = await vscode.window.showQuickPick(
        available.map(s => ({
          label: s.name,
          description: s.description || '',
          picked: false,
          skill: s
        })),
        {
          canPickMany: true,
          placeHolder: 'Select skills to add to preset'
        }
      );
      
      if (!selected || selected.length === 0) {
        return;
      }
      
      const updated: Preset = {
        ...item.preset,
        skillIds: [...item.preset.skillIds, ...selected.map(s => s.skill.id)]
      };
      
      await skillManager.savePreset(updated);
      await presetsProvider.loadPresets();
      vscode.window.showInformationMessage(`Added ${selected.length} skill(s) to preset`);
    })
  );
  
  // Remove from preset
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.removeFromPreset', async (item?: PresetTreeItem) => {
      if (!item?.skill) {
        return;
      }
      
      // Find parent preset
      const presets = skillManager.getPresets();
      const parentPreset = presets.find(p => p.skillIds.includes(item.skill!.id));
      
      if (!parentPreset) {
        return;
      }
      
      const res = await vscode.window.showWarningMessage(
        `Remove "${item.skill.name}" from preset "${parentPreset.name}"?`,
        { modal: true },
        'Remove'
      );
      
      if (res === 'Remove') {
        await skillManager.removeSkillsFromPreset(parentPreset.id, [item.skill.id]);
        await presetsProvider.loadPresets();
        vscode.window.showInformationMessage('Skill removed from preset');
      }
    })
  );
  
  // Export preset to zip
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.exportPresetZip', async (item?: PresetTreeItem) => {
      if (!item?.preset) {
        return;
      }
      
      const uri = await vscode.window.showSaveDialog({
        filters: { 'Zip Files': ['zip'] },
        saveLabel: 'Export preset zip',
        defaultUri: vscode.Uri.file(path.join(os.homedir(), `preset-${item.preset.name}.zip`))
      });
      
      if (!uri) {
        return;
      }
      
      try {
        await skillManager.exportPresetsToZip([item.preset.id], uri.fsPath);
        vscode.window.showInformationMessage('Preset exported to zip');
      } catch (e: any) {
        vscode.window.showErrorMessage(e?.message || 'Failed to export preset zip');
      }
    })
  );
}
