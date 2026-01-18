import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { SkillManager } from '../managers/SkillManager';
import { Preset } from '../models/types';

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export class SkillWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewTypeImport = 'skillsWizard.importView';
  public static readonly viewTypeMySkills = 'skillsWizard.mySkillsView';
  public static readonly viewTypePresets = 'skillsWizard.presetsView';
  public static readonly viewTypeSettings = 'skillsWizard.settingsView';

  private _view?: vscode.WebviewView;
  private readonly _viewType: string;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _skillManager: SkillManager,
    viewType: string
  ) {
    this._viewType = viewType;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this._extensionUri,
        vscode.Uri.joinPath(this._extensionUri, 'media'),
        vscode.Uri.joinPath(this._extensionUri, 'node_modules'),
      ],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, this._viewType);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'webviewReady': // Handle the ready signal from webview
            await this.refresh();
            break;
        case 'refresh':
            await this.refresh();
            break;
        case 'error':
            vscode.window.showErrorMessage(`Webview Error (${this._viewType}): ${data.message}`);
            break;
        case 'scanCustomPath':
            const uris = await vscode.window.showOpenDialog({ 
                canSelectFiles: false, 
                canSelectFolders: true, 
                canSelectMany: false,
                openLabel: 'Scan for Skills'
            });
            if (uris && uris[0]) {
                const result = await this._skillManager.scanCustomPath(uris[0].fsPath);
                if (result.total === 0) {
                  vscode.window.showWarningMessage('No skills found in selected folder.');
                } else {
                  vscode.window.showInformationMessage(`Found ${result.total} skill(s) (${result.added} new).`);
                }
                await this.refresh();
            }
            break;
        case 'importBundle': {
            const uris = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Import bundle (.zip or folder)',
                filters: { 'Zip Files': ['zip'] }
            });
            if (!uris || !uris[0]) {
              break;
            }
            const choice = await vscode.window.showWarningMessage(
              'If names conflict, how should we handle them?',
              { modal: true },
              'Overwrite',
              'Skip conflicts'
            );
            if (!choice) {
              break;
            }
            const allowOverwrite = choice === 'Overwrite';
            const importMode = await vscode.window.showInformationMessage(
              'Choose preset import mode',
              { modal: true },
              'Import by name',
              'Import as-is'
            );
            if (!importMode) {
              break;
            }
            const importPresetsAsIs = importMode === 'Import as-is';
            try {
              const result = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Importing bundle...',
                cancellable: false
              }, async () => {
                return await this._skillManager.importBundle(uris[0].fsPath, allowOverwrite, importPresetsAsIs);
              });
              vscode.window.showInformationMessage(
                `Imported ${result.imported}/${result.totalSkills} skill(s)` +
                `, overwritten ${result.overwritten}, skipped ${result.skipped}. ` +
                `Presets: +${result.presetsImported}, overwritten ${result.presetsOverwritten}, skipped ${result.presetsSkipped}.`
              );
              await this.refreshAll();
            } catch (e: any) {
              vscode.window.showErrorMessage(e?.message || 'Failed to import bundle');
            }
            break;
        }
        case 'scanGitHub':
            try {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "Scanning GitHub Repository...",
                    cancellable: false
                }, async () => {
                    const result = await this._skillManager.scanGitHub(data.url);
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
                });
                await this.refresh();
            } catch (e: any) {
                vscode.window.showErrorMessage("GitHub Scan Failed: " + e.message);
            }
            break;
        case 'importSkill':
            {
              const { imported } = await this._skillManager.scanForSkills();
              const conflict = imported.find(s =>
                s.name.trim().toLowerCase() === String(data.skill?.name || '').trim().toLowerCase() &&
                s.md5 !== data.skill?.md5
              );
              if (conflict) {
                const res = await vscode.window.showWarningMessage(
                  `Skill name "${data.skill.name}" already exists. Overwrite it?`,
                  { modal: true },
                  'Overwrite'
                );
                if (res !== 'Overwrite') {
                  break;
                }
              }
              await vscode.window.withProgress({
                  location: vscode.ProgressLocation.Notification,
                  title: "Importing Skill...",
                  cancellable: false
              }, async () => {
                  const importedId = await this._skillManager.importSkill(data.skill);
                  if (Array.isArray(data.tags)) {
                    await this._skillManager.updateSkillMetadata(importedId, { tags: data.tags });
                  }
              });
              if (data.isSingle) {
                vscode.window.showInformationMessage(`Skill "${data.skill.name}" imported successfully`);
              }
              await this.refreshAll();
              break;
            }
            break;
        case 'batchImportSkills':
            if (Array.isArray(data.items)) {
                const { imported } = await this._skillManager.scanForSkills();
                const existingByName = new Map(imported.map(s => [s.name.trim().toLowerCase(), s]));
                const conflicts = data.items.filter((item: any) => {
                  const name = String(item?.skill?.name || '').trim().toLowerCase();
                  const existing = existingByName.get(name);
                  return existing && existing.md5 !== item?.skill?.md5;
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
                    break;
                  }
                  allowOverwrite = res === 'Overwrite';
                }
                const itemsToImport = conflicts.length > 0 && !allowOverwrite
                  ? data.items.filter((item: any) => {
                      const name = String(item?.skill?.name || '').trim().toLowerCase();
                      const existing = existingByName.get(name);
                      return !(existing && existing.md5 !== item?.skill?.md5);
                    })
                  : data.items;
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `Importing ${itemsToImport.length} Skills...`,
                    cancellable: false
                }, async () => {
                    for (const item of itemsToImport) {
                        if (item.skill) {
                            const importedId = await this._skillManager.importSkill(item.skill);
                            if (Array.isArray(item.tags)) {
                                await this._skillManager.updateSkillMetadata(importedId, { tags: item.tags });
                            }
                        }
                    }
                });
                vscode.window.showInformationMessage(`Successfully imported ${itemsToImport.length} skills`);
            }
            await this.refreshAll();
            break;
        case 'requestDeleteSkill': {
            const res = await vscode.window.showWarningMessage(
              'Delete this skill?',
              { modal: true },
              'Delete'
            );
            if (res === 'Delete') {
              await this._skillManager.deleteSkill(data.id);
            await this.refresh();
            }
            break;
        }
        case 'deleteSkill': // For bulk delete (legacy)
            await this._skillManager.deleteSkill(data.id);
            await this.refresh();
            break;
        case 'batchDeleteSkills': {
            // Sequential delete
            if (Array.isArray(data.ids)) {
              for (const id of data.ids) {
                await this._skillManager.deleteSkill(id);
              }
              vscode.window.showInformationMessage(`Deleted ${data.ids.length} skills`);
            }
            await this.refreshAll();
            break;
        }
        case 'requestBatchDeleteSkills': {
            if (!Array.isArray(data.ids) || data.ids.length === 0) {
              break;
            }
            const res = await vscode.window.showWarningMessage(
              `Delete ${data.ids.length} skill(s)?`,
              { modal: true },
              'Delete'
            );
            if (res === 'Delete') {
              for (const id of data.ids) {
                await this._skillManager.deleteSkill(id);
              }
              vscode.window.showInformationMessage(`Deleted ${data.ids.length} skills`);
              await this.refreshAll();
            }
            break;
        }
        case 'requestEditSkillTags': {
            // This is now mainly a fallback or invoked by logic, 
            // but for inline edit the JS might send direct updateSkillMetadata
            const current = typeof data.current === 'string' ? data.current : '';
            const input = await vscode.window.showInputBox({
              title: 'Edit tags',
              prompt: 'Comma-separated tags',
              value: current
            });
            if (input !== undefined) {
              const tags = input.split(',').map((t: string) => t.trim()).filter(Boolean);
              await this._skillManager.updateSkillMetadata(data.id, { tags });
              await this.refresh();
            }
            break;
        }
        case 'requestEditSkillDescription': {
            // Fallback for non-inline edit environments
            const current = typeof data.current === 'string' ? data.current : '';
            const input = await vscode.window.showInputBox({
              title: 'Edit description',
              prompt: 'Skill description (stored in Skills Wizard config)',
              value: current
            });
            if (input !== undefined) {
              await this._skillManager.updateSkillMetadata(data.id, { customDescription: input });
              await this.refresh();
            }
            break;
        }
        case 'addToWorkspace':
            try {
                await this._skillManager.exportSkillToWorkspace(data.id);
                vscode.window.showInformationMessage('Skill added');
            } catch (e: any) {
                vscode.window.showErrorMessage('Failed to add skill: ' + e.message);
            }
            break;
        case 'openSkillFile': {
            try {
              const filePath = await this._skillManager.getSkillFilePath(data.id);
              if (!filePath) {
                vscode.window.showErrorMessage('SKILL.md not found for this skill');
                break;
              }
              await vscode.window.showTextDocument(vscode.Uri.file(filePath), { preview: false });
            } catch (e: any) {
              vscode.window.showErrorMessage(e?.message || 'Failed to open skill file');
            }
            break;
        }
        case 'createPreset':
             try {
             const newPreset: Preset = {
                 id: Date.now().toString(),
                 name: data.name,
                 skillIds: []
             };
             await this._skillManager.savePreset(newPreset);
             await this.refresh();
             } catch (e: any) {
               const msg = e?.message || 'Failed to create preset';
               if (msg.includes('already exists')) {
                 const res = await vscode.window.showWarningMessage(
                   `Preset "${data.name}" already exists. Overwrite it?`,
                   { modal: true },
                   'Overwrite'
                 );
                 if (res === 'Overwrite') {
                   await this._skillManager.savePreset({
                     id: Date.now().toString(),
                     name: data.name,
                     skillIds: []
                   }, { allowOverwrite: true });
                   await this.refreshAll();
                   break;
                 }
               }
               vscode.window.showErrorMessage(msg);
             }
             break;
        case 'createPresetWithSkills':
             try {
              const newPreset: Preset = {
                  id: Date.now().toString(),
                  name: data.name,
                  skillIds: Array.isArray(data.skillIds) ? data.skillIds : []
              };
              await this._skillManager.savePreset(newPreset);
              vscode.window.showInformationMessage(`Preset "${data.name}" created with ${newPreset.skillIds.length} skills`);
              await this.refreshAll();
             } catch (e: any) {
               const msg = e?.message || 'Failed to create preset';
               if (msg.includes('already exists')) {
                 const res = await vscode.window.showWarningMessage(
                   `Preset "${data.name}" already exists. Overwrite it?`,
                   { modal: true },
                   'Overwrite'
                 );
                 if (res === 'Overwrite') {
                   await this._skillManager.savePreset({
                     id: Date.now().toString(),
                     name: data.name,
                     skillIds: Array.isArray(data.skillIds) ? data.skillIds : []
                   }, { allowOverwrite: true });
                   await this.refreshAll();
                   break;
                 }
               }
               vscode.window.showErrorMessage(msg);
             }
             break;
        case 'updatePreset':
            try {
            await this._skillManager.savePreset(data.preset);
              await this.refreshAll();
            } catch (e: any) {
              const msg = e?.message || 'Failed to update preset';
              if (msg.includes('already exists')) {
                const res = await vscode.window.showWarningMessage(
                  `Preset "${data.preset?.name}" already exists. Overwrite it?`,
                  { modal: true },
                  'Overwrite'
                );
                if (res === 'Overwrite') {
                  await this._skillManager.savePreset(data.preset, { allowOverwrite: true });
                  await this.refreshAll();
                  break;
                }
              }
              vscode.window.showErrorMessage(msg);
            }
            break;
        case 'requestRemoveFromPreset': {
            if (!Array.isArray(data.skillIds) || data.skillIds.length === 0 || typeof data.presetId !== 'string') {
              break;
            }
            const res = await vscode.window.showWarningMessage(
              `Remove ${data.skillIds.length} skill(s) from this preset?`,
              { modal: true },
              'Remove'
            );
            if (res === 'Remove') {
              await this._skillManager.removeSkillsFromPreset(data.presetId, data.skillIds);
              await this.refreshAll();
            }
            break;
        }
        case 'requestDeletePreset': {
            const res = await vscode.window.showWarningMessage(
              'Delete this preset?',
              { modal: true },
              'Delete'
            );
            if (res === 'Delete') {
            await this._skillManager.deletePreset(data.id);
            await this.refresh();
            }
            break;
        }
        case 'requestBatchDeletePresets': {
            if (!Array.isArray(data.ids) || data.ids.length === 0) {
              break;
            }
            const res = await vscode.window.showWarningMessage(
              `Delete ${data.ids.length} preset(s)?`,
              { modal: true },
              'Delete'
            );
            if (res === 'Delete') {
              for (const id of data.ids) {
                await this._skillManager.deletePreset(id);
              }
              vscode.window.showInformationMessage(`Deleted ${data.ids.length} preset(s)`);
              await this.refreshAll();
            }
            break;
        }
        case 'applyPreset':
            try {
                await this._skillManager.applyPreset(data.id, data.mode);
                vscode.window.showInformationMessage('Preset applied');
            } catch (e: any) {
                vscode.window.showErrorMessage('Failed to apply preset: ' + e.message);
            }
            break;
        case 'exportSkillsZip': {
            try {
              const uri = await vscode.window.showSaveDialog({
                filters: { 'Zip Files': ['zip'] },
                saveLabel: 'Export skills zip',
                defaultUri: vscode.Uri.file(path.join(os.homedir(), 'skills-wizard-skills.zip'))
              });
              if (!uri) {
                break;
              }
              await this._skillManager.exportSkillsToZip(Array.isArray(data.ids) ? data.ids : [], uri.fsPath);
              vscode.window.showInformationMessage('Skills exported to zip');
            } catch (e: any) {
              vscode.window.showErrorMessage(e?.message || 'Failed to export skills zip');
            }
            break;
        }
        case 'exportPresetsZip': {
            try {
              const uri = await vscode.window.showSaveDialog({
                filters: { 'Zip Files': ['zip'] },
                saveLabel: 'Export presets zip',
                defaultUri: vscode.Uri.file(path.join(os.homedir(), 'skills-wizard-presets.zip'))
              });
              if (!uri) {
                break;
              }
              const ids = data?.all ? 'all' : (Array.isArray(data.ids) ? data.ids : []);
              await this._skillManager.exportPresetsToZip(ids, uri.fsPath);
              vscode.window.showInformationMessage('Presets exported to zip');
            } catch (e: any) {
              vscode.window.showErrorMessage(e?.message || 'Failed to export presets zip');
            }
            break;
        }
        case 'updateSettings':
            if (typeof data.defaultExportPath === 'string') {
                this._skillManager.updateDefaultExportPath(data.defaultExportPath);
            }
            if (typeof data.storagePath === 'string') {
              this._skillManager.updateStoragePath(data.storagePath);
            }
            await this.refresh();
            break;
        case 'updateSkillMetadata':
            try {
              await this._skillManager.updateSkillMetadata(data.id, { 
                  tags: data.tags, 
                  customDescription: data.customDescription,
                  customName: data.customName
              });
              await this.refreshAll();
            } catch (e: any) {
              vscode.window.showErrorMessage(e?.message || 'Failed to update skill');
            }
            break;
      }
    });
    
    // Initial load
    this.refresh();
  }
  
  public async refresh() {
      if (!this._view) {
        return;
      }
      const { discovered, imported } = await this._skillManager.scanForSkills();
      const presets = this._skillManager.getPresets();
      const defaultExportPath = vscode.workspace.getConfiguration('skillsWizard').get('defaultExportPath') || '.claude/skills/';
      const storagePath = await this._skillManager.getEffectiveStoragePath();
      
      this._view.webview.postMessage({
          type: 'state',
          discovered,
          imported,
          presets,
          defaultExportPath,
          storagePath
      });
  }

  // Refresh all views (call this when data changes globally)
  public async refreshAll() {
    await this.refresh();
    // Notify extension to refresh all other providers
    vscode.commands.executeCommand('skills-wizard.refresh');
  }

  private _getHtmlForWebview(webview: vscode.Webview, viewType: string) {
    const nonce = getNonce();
    const mainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
    const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'styles.css'));
    const codiconsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css')
    );
    const codiconsFontUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.ttf')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <link href="${codiconsUri}" rel="stylesheet" />
  <link href="${stylesUri}" rel="stylesheet" />
  <style nonce="${nonce}">
    @font-face {
      font-family: 'codicon';
      src: url('${codiconsFontUri}') format('truetype');
    }
  </style>
  <title>Skills Wizard</title>
</head>
<body data-view="${viewType}">
  <div class="content" id="app-root"></div>
  <script nonce="${nonce}" src="${mainUri}"></script>
</body>
</html>`;
  }
}
