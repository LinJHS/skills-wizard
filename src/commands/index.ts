import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs-extra';
import { SkillManager } from '../managers/SkillManager';
import { ImportTreeProvider, ImportTreeItem } from '../providers/ImportTreeProvider';
import { MySkillsTreeProvider, MySkillTreeItem } from '../providers/MySkillsTreeProvider';
import { PresetsTreeProvider, PresetTreeItem } from '../providers/PresetsTreeProvider';
import { SettingsTreeProvider } from '../providers/SettingsTreeProvider';
import { Preset } from '../models/types';

export function registerCommands(
  context: vscode.ExtensionContext,
  skillManager: SkillManager,
  importProvider: ImportTreeProvider,
  mySkillsProvider: MySkillsTreeProvider,
  presetsProvider: PresetsTreeProvider,
  settingsProvider: SettingsTreeProvider
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
  
  // Scan for skills (both workspace and global paths)
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.scan', async () => {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Scanning workspace and global paths for skills...',
        cancellable: false
      }, async () => {
        await importProvider.loadSkills();
        const { discovered } = await skillManager.scanForSkills();
        if (discovered.length === 0) {
          vscode.window.showWarningMessage('No new skills found. All discovered skills are already imported.');
        } else {
          vscode.window.showInformationMessage(`Found ${discovered.length} skill(s) ready to import`);
        }
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
    vscode.commands.registerCommand('skillsWizard.openSkill', async (arg: any) => {
      const skillId = extractSkillId(arg);
      if (!skillId) {
        return;
      }
      
      try {
        // 1. Try to get local path (imported)
        const localPath = await skillManager.getSkillFilePath(skillId);
        if (localPath) {
          await vscode.window.showTextDocument(vscode.Uri.file(localPath), { preview: false });
          return;
        }

        // 2. Try to get discovered skill (for GitHub links)
        const discovered = importProvider.getSkill(skillId);
        if (discovered && discovered.isRemote && discovered.path) {
           // It's a GitHub API URL. Open it in browser (convert to HTML if possible)
           const webUrl = convertGitHubApiUrlToHtml(discovered.path, false); // false = not specific file? Discovered path is Directory usually.
           // However, openSkill usually implies Source File. For remote, maybe the dir?
           // Or the SKILL.md in that dir?
           // Discovered path is the dir.
           
           // If user wants "Open Source File" for GitHub, they likely mean the SKILL.md online or the folder.
           // Let's default to folder for "Source File" if it's a dir, or SKILL.md if we can guess.
           // Actually, let's open the SKILL.md blob if we can.
           const skillMdUrl = convertGitHubApiUrlToHtml(discovered.path + '/SKILL.md', true);
           await vscode.env.openExternal(vscode.Uri.parse(skillMdUrl));
           return;
        } else if (discovered && !discovered.isRemote) {
            // Local discovered (custom path)
            const p = path.join(discovered.path, 'SKILL.md');
            if (await fs.pathExists(p)) {
                await vscode.window.showTextDocument(vscode.Uri.file(p));
                return;
            }
        }

        vscode.window.showErrorMessage('SKILL.md not found for this skill');
      } catch (e: any) {
        vscode.window.showErrorMessage(e?.message || 'Failed to open skill file');
      }
    })
  );

  // Open SKILL.md (Explicit)
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.openSkillMd', async (arg: any) => {
      const skillId = extractSkillId(arg);
      if (!skillId) {
        return;
      }

      try {
        // Priority: Use provided skill object in CLI args if available (Fixes opening duplicate imported skills locally)
        // If the tree item passed the original discovered path, we should use it.
        if (arg?.path && arg?.name) {
           // If it's a remote skill or specifically marked regular path
           if (arg.isRemote) {
             const skillMdUrl = convertGitHubApiUrlToHtml(arg.path, true, 'SKILL.md');
             await vscode.env.openExternal(vscode.Uri.parse(skillMdUrl));
             return;
           } else {
             // It's a local path from the argument
             const p = path.join(arg.path, 'SKILL.md');
             if (await fs.pathExists(p)) {
               await vscode.window.showTextDocument(vscode.Uri.file(p));
               return;
             }
           }
        }

        // Fallback: Lookup by ID
        // 1. Local (Imported)
        const localPath = await skillManager.getSkillFilePath(skillId);
        if (localPath) {
          await vscode.window.showTextDocument(vscode.Uri.file(localPath));
          return;
        }
        
        // 2. Remote (Discovered via Import Provider)
        const discovered = importProvider.getSkill(skillId);
        if (discovered && discovered.isRemote && discovered.path) {
           const skillMdUrl = convertGitHubApiUrlToHtml(discovered.path, true, 'SKILL.md');
           await vscode.env.openExternal(vscode.Uri.parse(skillMdUrl));
           return;
        } else if (discovered && !discovered.isRemote) {
            const p = path.join(discovered.path, 'SKILL.md');
            if (await fs.pathExists(p)) {
                await vscode.window.showTextDocument(vscode.Uri.file(p));
                return;
            }
        }
        vscode.window.showErrorMessage('SKILL.md not found');
      } catch (e: any) {
         vscode.window.showErrorMessage('Failed to open SKILL.md: ' + e.message);
      }
    })
  );

  // Open Skill Directory
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.openSkillDir', async (arg: any) => {
      const skillId = extractSkillId(arg);
      if (!skillId) {
        return;
      }

      try {
        // Priority: Use provided skill object in CLI args
        if (arg?.path) {
           if (arg.isRemote) {
             const webUrl = convertGitHubApiUrlToHtml(arg.path, false);
             await vscode.env.openExternal(vscode.Uri.parse(webUrl));
             return;
           } else {
              if (await fs.pathExists(arg.path)) {
                await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(arg.path));
                return;
              }
           }
        }

        // Fallback: Lookup by ID
        // 1. Local
        const localPath = await skillManager.getSkillFilePath(skillId);
        if (localPath) {
          const dir = path.dirname(localPath);
          await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(dir));
          return;
        }
        
        // 2. Remote
        const discovered = importProvider.getSkill(skillId);
        if (discovered && discovered.isRemote && discovered.path) {
           const webUrl = convertGitHubApiUrlToHtml(discovered.path, false);
           await vscode.env.openExternal(vscode.Uri.parse(webUrl));
           return;
        } else if (discovered && !discovered.isRemote) {
            await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(discovered.path));
            return;
        }
         vscode.window.showErrorMessage('Directory not found');
      } catch (e: any) {
         vscode.window.showErrorMessage('Failed to open directory: ' + e.message);
      }
    })
  );
  
  // Helper to extract ID
  const extractSkillId = (arg: any): string | undefined => {
      if (typeof arg === 'string') {
        return arg;
      }
      if (arg?.skill?.id) {
        return arg.skill.id;
      }
      if (arg?.skill?.md5) {
        return arg.skill.md5;
      }
      if (arg?.id) {
        return arg.id; // Fallback
      }
      return undefined;
  };
  
  // Helper to convert GitHub API URL to HTML URL
  const convertGitHubApiUrlToHtml = (apiUrl: string, isFile: boolean, appendFile?: string): string => {
      // API: https://api.github.com/repos/:owner/:repo/contents/:path?ref=:branch
      // HTML: https://github.com/:owner/:repo/tree/:branch/:path (dir)
      // HTML: https://github.com/:owner/:repo/blob/:branch/:path (file)
      
      try {
        const u = new URL(apiUrl);
        if (u.hostname !== 'api.github.com') {
          return apiUrl;
        }
        
        const pathParts = u.pathname.split('/').filter(p => p);
        // pathParts: ['repos', owner, repo, 'contents', ...path]
        if (pathParts.length < 5) {
          return apiUrl;
        }
        
        const owner = pathParts[1];
        const repo = pathParts[2];
        const initialContentPath = pathParts.slice(4).join('/');
        let contentPath = initialContentPath;
        
        if (appendFile) {
            // appendFile (SKILL.md) should be appended to the contentPath
            contentPath = contentPath ? `${contentPath}/${appendFile}` : appendFile;
        }

        const ref = u.searchParams.get('ref') || 'main'; // default to main if no ref
        
        const typeSegment = isFile ? 'blob' : 'tree';
        return `https://github.com/${owner}/${repo}/${typeSegment}/${ref}/${contentPath}`;
      } catch {
          return apiUrl;
      }
  };

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
    vscode.commands.registerCommand('skillsWizard.editTags', async (skillIdOrItem: string | MySkillTreeItem | any) => {
      let skillId: string | undefined;
      
      if (typeof skillIdOrItem === 'string') {
        skillId = skillIdOrItem;
      } else if (skillIdOrItem?.skill) {
        skillId = skillIdOrItem.skill.id;
      }
      
      if (!skillId) {
        return;
      }
      
      const { imported } = await skillManager.scanForSkills();
      const skill = imported.find(s => s.id === skillId);
      if (!skill) {
        return;
      }
      
      const current = skill.tags?.join(', ') || '';
      const input = await vscode.window.showInputBox({
        title: `Edit tags for "${skill.name}"`,
        prompt: 'Comma-separated tags',
        value: current
      });
      
      if (input !== undefined) {
        const tags = input.split(',').map(t => t.trim()).filter(Boolean);
        await skillManager.updateSkillMetadata(skillId, { tags });
        await Promise.all([
          mySkillsProvider.loadSkills(),
          presetsProvider.loadPresets()
        ]);
        vscode.window.showInformationMessage('Tags updated');
      }
    })
  );
  
  // Edit skill name
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.editSkillName', async (skillIdOrItem: string | any) => {
      let skillId: string | undefined;
      
      if (typeof skillIdOrItem === 'string') {
        skillId = skillIdOrItem;
      } else if (skillIdOrItem?.skill) {
        skillId = skillIdOrItem.skill.id;
      }
      
      if (!skillId) {
        return;
      }
      
      const { imported } = await skillManager.scanForSkills();
      const skill = imported.find(s => s.id === skillId);
      if (!skill) {
        return;
      }
      
      const input = await vscode.window.showInputBox({
        title: 'Edit skill name',
        prompt: 'Enter new name',
        value: skill.name,
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Name cannot be empty';
          }
          return null;
        }
      });
      
      if (input && input !== skill.name) {
        await skillManager.updateSkillName(skillId, input);
        vscode.window.showInformationMessage('Skill name updated. Refreshing...');
        // Wait a bit for file watcher to trigger, or force refresh
        setTimeout(async () => {
          await Promise.all([
            mySkillsProvider.loadSkills(),
            presetsProvider.loadPresets()
          ]);
        }, 600);
      }
    })
  );
  
  // Edit skill description
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.editSkillDescription', async (skillIdOrItem: string | any) => {
      let skillId: string | undefined;
      
      if (typeof skillIdOrItem === 'string') {
        skillId = skillIdOrItem;
      } else if (skillIdOrItem?.skill) {
        skillId = skillIdOrItem.skill.id;
      }
      
      if (!skillId) {
        return;
      }
      
      const { imported } = await skillManager.scanForSkills();
      const skill = imported.find(s => s.id === skillId);
      if (!skill) {
        return;
      }
      
      const input = await vscode.window.showInputBox({
        title: 'Edit skill description',
        prompt: 'Enter new description',
        value: skill.description || ''
      });
      
      if (input !== undefined && input !== skill.description) {
        await skillManager.updateSkillDescription(skillId, input);
        vscode.window.showInformationMessage('Skill description updated. Refreshing...');
        // Wait a bit for file watcher to trigger, or force refresh
        setTimeout(async () => {
          await Promise.all([
            mySkillsProvider.loadSkills(),
            presetsProvider.loadPresets()
          ]);
        }, 600);
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
  
  // Export skills to zip (interactive selection)
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
      
      const timestamp = new Date().toISOString().split('T')[0];
      const defaultName = selected.length === 1
        ? `skill-${selected[0].skill.name.replace(/[^a-zA-Z0-9-_]/g, '-')}-${timestamp}.zip`
        : `skills-${selected.length}-${timestamp}.zip`;
      
      const uri = await vscode.window.showSaveDialog({
        filters: { 'Zip Files': ['zip'] },
        saveLabel: 'Export skills zip',
        defaultUri: vscode.Uri.file(path.join(os.homedir(), defaultName))
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
  
  // Create preset (empty or with single skill from context menu)
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.createPreset', async (item?: MySkillTreeItem) => {
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
          const presets = skillManager.getPresets();
          if (presets.some(p => p.name.toLowerCase() === value.toLowerCase())) {
            return 'A preset with this name already exists';
          }
          return null;
        }
      });
      
      if (!name) {
        return;
      }
      
      try {
        // If called from a skill context menu, include that skill
        const skillIds = item?.skill ? [item.skill.id] : [];
        
        const newPreset: Preset = {
          id: Date.now().toString(),
          name,
          skillIds
        };
        
        await skillManager.savePreset(newPreset);
        await presetsProvider.loadPresets();
        
        if (skillIds.length > 0) {
          vscode.window.showInformationMessage(`Preset "${name}" created with skill "${item!.skill!.name}"`);
        } else {
          vscode.window.showInformationMessage(`Empty preset "${name}" created`);
        }
      } catch (e: any) {
        vscode.window.showErrorMessage(e?.message || 'Failed to create preset');
      }
    })
  );
  
  // Create preset from multiple skills (checkbox selection)
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.createPresetFromSelection', async () => {
      const { imported } = await skillManager.scanForSkills();
      
      if (imported.length === 0) {
        vscode.window.showWarningMessage('No skills available');
        return;
      }
      
      // First, let user select skills with checkboxes
      const selected = await vscode.window.showQuickPick(
        imported.map(s => ({
          label: s.name,
          description: s.description || '',
          picked: false,
          skill: s
        })),
        {
          canPickMany: true,
          placeHolder: 'Select skills for the new preset (Space to check, Enter to confirm)'
        }
      );
      
      if (!selected || selected.length === 0) {
        vscode.window.showWarningMessage('No skills selected');
        return;
      }
      
      // Then ask for preset name
      const name = await vscode.window.showInputBox({
        prompt: 'Enter preset name',
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Preset name cannot be empty';
          }
          const presets = skillManager.getPresets();
          if (presets.some(p => p.name.toLowerCase() === value.toLowerCase())) {
            return 'A preset with this name already exists';
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
  
  // Add skills to existing preset (from My Skills)
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.addToExistingPreset', async (item?: MySkillTreeItem) => {
      const presets = skillManager.getPresets();
      
      if (presets.length === 0) {
        vscode.window.showWarningMessage('No presets available. Create a preset first.');
        return;
      }
      
      // Get skills to add
      let skillsToAdd: string[];
      if (item?.skill) {
        // Single skill from context menu
        skillsToAdd = [item.skill.id];
      } else {
        // Multi-select from quick pick
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
            placeHolder: 'Select skills to add to preset'
          }
        );
        
        if (!selected || selected.length === 0) {
          return;
        }
        
        skillsToAdd = selected.map(s => s.skill.id);
      }
      
      // Select preset
      const selectedPreset = await vscode.window.showQuickPick(
        presets.map(p => ({
          label: p.name,
          description: `${p.skillIds.length} skills`,
          preset: p
        })),
        { placeHolder: 'Select preset to add skills to' }
      );
      
      if (!selectedPreset) {
        return;
      }
      
      // Filter out skills already in preset
      const newSkillIds = skillsToAdd.filter(id => !selectedPreset.preset.skillIds.includes(id));
      
      if (newSkillIds.length === 0) {
        vscode.window.showInformationMessage('Selected skills are already in this preset');
        return;
      }
      
      const updated: Preset = {
        ...selectedPreset.preset,
        skillIds: [...selectedPreset.preset.skillIds, ...newSkillIds]
      };
      
      await skillManager.savePreset(updated);
      await presetsProvider.loadPresets();
      vscode.window.showInformationMessage(
        `Added ${newSkillIds.length} skill(s) to preset "${selectedPreset.preset.name}"`
      );
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
      
      const timestamp = new Date().toISOString().split('T')[0];
      const safeName = item.preset.name.replace(/[^a-zA-Z0-9-_]/g, '-');
      const defaultName = `preset-${safeName}-${item.preset.skillIds.length}skills-${timestamp}.zip`;
      
      const uri = await vscode.window.showSaveDialog({
        filters: { 'Zip Files': ['zip'] },
        saveLabel: 'Export preset zip',
        defaultUri: vscode.Uri.file(path.join(os.homedir(), defaultName))
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
  
  // Export single skill to zip
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.exportSkillZip', async (item?: MySkillTreeItem) => {
      if (!item?.skill) {
        return;
      }
      
      const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const safeName = item.skill.name.replace(/[^a-zA-Z0-9-_]/g, '-');
      const defaultName = `skill-${safeName}-${timestamp}.zip`;
      
      const uri = await vscode.window.showSaveDialog({
        filters: { 'Zip Files': ['zip'] },
        saveLabel: 'Export skill zip',
        defaultUri: vscode.Uri.file(path.join(os.homedir(), defaultName))
      });
      
      if (!uri) {
        return;
      }
      
      try {
        await skillManager.exportSkillsToZip([item.skill.id], uri.fsPath);
        vscode.window.showInformationMessage('Skill exported to zip');
      } catch (e: any) {
        vscode.window.showErrorMessage(e?.message || 'Failed to export skill zip');
      }
    })
  );
  
  // Export all presets to zip
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.exportAllPresetsZip', async () => {
      const presets = skillManager.getPresets();
      const timestamp = new Date().toISOString().split('T')[0];
      const defaultName = `all-presets-${presets.length}-${timestamp}.zip`;
      
      const uri = await vscode.window.showSaveDialog({
        filters: { 'Zip Files': ['zip'] },
        saveLabel: 'Export all presets zip',
        defaultUri: vscode.Uri.file(path.join(os.homedir(), defaultName))
      });
      
      if (!uri) {
        return;
      }
      
      try {
        await skillManager.exportPresetsToZip('all', uri.fsPath);
        vscode.window.showInformationMessage('All presets exported to zip');
      } catch (e: any) {
        vscode.window.showErrorMessage(e?.message || 'Failed to export all presets zip');
      }
    })
  );
  
  // Update storage path
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.updateStoragePath', async () => {
      const config = vscode.workspace.getConfiguration('skillsWizard');
      const currentPath = config.get<string>('storagePath') || '';
      
      const input = await vscode.window.showInputBox({
        prompt: 'Enter storage path (absolute path, leave empty for default)',
        value: currentPath,
        placeHolder: '~/.config/skills-wizard or leave empty for default'
      });
      
      if (input !== undefined) {
        await config.update('storagePath', input, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage('Storage path updated. Please reload the window for changes to take effect.');
        settingsProvider.refresh();
      }
    })
  );
  
  // Update default export path
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.updateDefaultExportPath', async () => {
      const config = vscode.workspace.getConfiguration('skillsWizard');
      const currentPath = config.get<string>('defaultExportPath') || '.claude/skills/';
      
      const input = await vscode.window.showInputBox({
        prompt: 'Enter default export path (relative to workspace root)',
        value: currentPath,
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Path cannot be empty';
          }
          return null;
        }
      });
      
      if (input !== undefined) {
        await config.update('defaultExportPath', input, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage('Default export path updated');
        settingsProvider.refresh();
      }
    })
  );
  
  // Batch import skills
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.batchImportSkills', async () => {
      await importProvider.loadSkills();
      const { discovered, imported } = await skillManager.scanForSkills();
      
      if (discovered.length === 0) {
        vscode.window.showWarningMessage('No skills found to import.');
        return;
      }
      
      const existingByName = new Map(imported.map(s => [s.name.trim().toLowerCase(), s]));
      
      const selected = await vscode.window.showQuickPick(
        discovered.map(skill => {
          const existing = existingByName.get(skill.name.trim().toLowerCase());
          const isConflict = existing && existing.md5 !== skill.md5;
          return {
            label: skill.name,
            description: skill.description || '',
            detail: isConflict ? '⚠️ Will overwrite existing skill with different content' : skill.sourceLocation,
            picked: false,
            skill
          };
        }),
        {
          canPickMany: true,
          placeHolder: 'Select skills to import (use Space to select, Enter to confirm)'
        }
      );
      
      if (!selected || selected.length === 0) {
        return;
      }
      
      const conflicts = selected.filter(s => {
        const existing = existingByName.get(s.skill.name.trim().toLowerCase());
        return existing && existing.md5 !== s.skill.md5;
      });
      
      let allowOverwrite = true;
      if (conflicts.length > 0) {
        const res = await vscode.window.showWarningMessage(
          `${conflicts.length} skill(s) will overwrite existing ones. Continue?`,
          { modal: true },
          'Continue',
          'Cancel'
        );
        if (res !== 'Continue') {
          return;
        }
      }
      
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Importing ${selected.length} skills...`,
        cancellable: false
      }, async () => {
        for (const item of selected) {
          await skillManager.importSkill(item.skill);
        }
      });
      
      vscode.window.showInformationMessage(`Successfully imported ${selected.length} skills`);
      
      await Promise.all([
        importProvider.loadSkills(),
        mySkillsProvider.loadSkills()
      ]);
    })
  );
  
  // Select all skills (conceptual - opens batch delete/export)
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.selectAllSkills', async () => {
      const { imported } = await skillManager.scanForSkills();
      
      if (imported.length === 0) {
        vscode.window.showWarningMessage('No skills to select');
        return;
      }
      
      const action = await vscode.window.showQuickPick(
        [
          { label: 'Delete All', value: 'delete' as const },
          { label: 'Export All to Zip', value: 'export' as const },
          { label: 'Cancel', value: 'cancel' as const }
        ],
        { placeHolder: `Select action for all ${imported.length} skills` }
      );
      
      if (!action || action.value === 'cancel') {
        return;
      }
      
      if (action.value === 'delete') {
        const res = await vscode.window.showWarningMessage(
          `Delete all ${imported.length} skills?`,
          { modal: true },
          'Delete All'
        );
        
        if (res === 'Delete All') {
          await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Deleting ${imported.length} skills...`,
            cancellable: false
          }, async () => {
            for (const skill of imported) {
              await skillManager.deleteSkill(skill.id);
            }
          });
          
          await Promise.all([
            mySkillsProvider.loadSkills(),
            presetsProvider.loadPresets()
          ]);
          vscode.window.showInformationMessage(`Deleted ${imported.length} skills`);
        }
      } else if (action.value === 'export') {
        const timestamp = new Date().toISOString().split('T')[0];
        const defaultName = `all-skills-${imported.length}-${timestamp}.zip`;
        
        const uri = await vscode.window.showSaveDialog({
          filters: { 'Zip Files': ['zip'] },
          saveLabel: 'Export all skills zip',
          defaultUri: vscode.Uri.file(path.join(os.homedir(), defaultName))
        });
        
        if (uri) {
          try {
            await skillManager.exportSkillsToZip(imported.map(s => s.id), uri.fsPath);
            vscode.window.showInformationMessage(`Exported ${imported.length} skills to zip`);
          } catch (e: any) {
            vscode.window.showErrorMessage(e?.message || 'Failed to export skills');
          }
        }
      }
    })
  );
  
  // Batch delete skills
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.batchDeleteSkills', async () => {
      const { imported } = await skillManager.scanForSkills();
      
      if (imported.length === 0) {
        vscode.window.showWarningMessage('No skills to delete');
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
          placeHolder: 'Select skills to delete (use Space to select, Enter to confirm)'
        }
      );
      
      if (!selected || selected.length === 0) {
        return;
      }
      
      const res = await vscode.window.showWarningMessage(
        `Delete ${selected.length} skill(s)?`,
        { modal: true },
        'Delete'
      );
      
      if (res === 'Delete') {
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: `Deleting ${selected.length} skills...`,
          cancellable: false
        }, async () => {
          for (const item of selected) {
            await skillManager.deleteSkill(item.skill.id);
          }
        });
        
        await Promise.all([
          mySkillsProvider.loadSkills(),
          presetsProvider.loadPresets()
        ]);
        vscode.window.showInformationMessage(`Deleted ${selected.length} skills`);
      }
    })
  );
  
  // Batch export skills
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.batchExportSkills', async () => {
      const { imported } = await skillManager.scanForSkills();
      
      if (imported.length === 0) {
        vscode.window.showWarningMessage('No skills to export');
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
          placeHolder: 'Select skills to export (use Space to select, Enter to confirm)'
        }
      );
      
      if (!selected || selected.length === 0) {
        return;
      }
      
      const timestamp = new Date().toISOString().split('T')[0];
      const defaultName = `skills-batch-${selected.length}-${timestamp}.zip`;
      
      const uri = await vscode.window.showSaveDialog({
        filters: { 'Zip Files': ['zip'] },
        saveLabel: 'Export skills zip',
        defaultUri: vscode.Uri.file(path.join(os.homedir(), defaultName))
      });
      
      if (!uri) {
        return;
      }
      
      try {
        await skillManager.exportSkillsToZip(selected.map(s => s.skill.id), uri.fsPath);
        vscode.window.showInformationMessage(`Exported ${selected.length} skills to zip`);
      } catch (e: any) {
        vscode.window.showErrorMessage(e?.message || 'Failed to export skills');
      }
    })
  );
  
  // Batch delete presets
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.batchDeletePresets', async () => {
      const presets = skillManager.getPresets();
      
      if (presets.length === 0) {
        vscode.window.showWarningMessage('No presets to delete');
        return;
      }
      
      const selected = await vscode.window.showQuickPick(
        presets.map(p => ({
          label: p.name,
          description: `${p.skillIds.length} skills`,
          picked: false,
          preset: p
        })),
        {
          canPickMany: true,
          placeHolder: 'Select presets to delete (use Space to select, Enter to confirm)'
        }
      );
      
      if (!selected || selected.length === 0) {
        return;
      }
      
      const res = await vscode.window.showWarningMessage(
        `Delete ${selected.length} preset(s)?`,
        { modal: true },
        'Delete'
      );
      
      if (res === 'Delete') {
        for (const item of selected) {
          await skillManager.deletePreset(item.preset.id);
        }
        await presetsProvider.loadPresets();
        vscode.window.showInformationMessage(`Deleted ${selected.length} presets`);
      }
    })
  );
  
  // Batch export presets
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.batchExportPresets', async () => {
      const presets = skillManager.getPresets();
      
      if (presets.length === 0) {
        vscode.window.showWarningMessage('No presets to export');
        return;
      }
      
      const selected = await vscode.window.showQuickPick(
        presets.map(p => ({
          label: p.name,
          description: `${p.skillIds.length} skills`,
          picked: false,
          preset: p
        })),
        {
          canPickMany: true,
          placeHolder: 'Select presets to export (use Space to select, Enter to confirm)'
        }
      );
      
      if (!selected || selected.length === 0) {
        return;
      }
      
      const timestamp = new Date().toISOString().split('T')[0];
      const defaultName = `presets-batch-${selected.length}-${timestamp}.zip`;
      
      const uri = await vscode.window.showSaveDialog({
        filters: { 'Zip Files': ['zip'] },
        saveLabel: 'Export presets zip',
        defaultUri: vscode.Uri.file(path.join(os.homedir(), defaultName))
      });
      
      if (!uri) {
        return;
      }
      
      try {
        await skillManager.exportPresetsToZip(selected.map(s => s.preset.id), uri.fsPath);
        vscode.window.showInformationMessage(`Exported ${selected.length} presets to zip`);
      } catch (e: any) {
        vscode.window.showErrorMessage(e?.message || 'Failed to export presets');
      }
    })
  );
  
  // Search skills
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.searchSkills', async () => {
      const query = await vscode.window.showInputBox({
        prompt: 'Search skills by name or description',
        placeHolder: 'Enter search term...'
      });
      
      if (query !== undefined) {
        mySkillsProvider.setSearchQuery(query);
        if (query) {
          vscode.window.showInformationMessage(`Searching for: "${query}"`);
        }
      }
    })
  );
  
  // Clear skills search
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.clearSkillsSearch', () => {
      mySkillsProvider.setSearchQuery('');
      vscode.window.showInformationMessage('Search cleared');
    })
  );
  
  // Search presets
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.searchPresets', async () => {
      const query = await vscode.window.showInputBox({
        prompt: 'Search presets or skills by name or description',
        placeHolder: 'Enter search term...'
      });
      
      if (query !== undefined) {
        presetsProvider.setSearchQuery(query);
        if (query) {
          vscode.window.showInformationMessage(`Searching for: "${query}"`);
        }
      }
    })
  );
  
  // Clear presets search
  context.subscriptions.push(
    vscode.commands.registerCommand('skillsWizard.clearPresetsSearch', () => {
      presetsProvider.setSearchQuery('');
      vscode.window.showInformationMessage('Search cleared');
    })
  );
}
