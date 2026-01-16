import * as vscode from 'vscode';
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
        case 'refresh':
            await this.refresh();
            break;
        case 'scanCustomPath':
            const uris = await vscode.window.showOpenDialog({ 
                canSelectFiles: false, 
                canSelectFolders: true, 
                canSelectMany: false,
                openLabel: 'Scan for Skills'
            });
            if (uris && uris[0]) {
                await this._skillManager.scanCustomPath(uris[0].fsPath);
                await this.refresh();
            }
            break;
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
                      vscode.window.showInformationMessage('No new skills discovered (they may already be imported or discovered).');
                    }
                });
                await this.refresh();
            } catch (e: any) {
                vscode.window.showErrorMessage("GitHub Scan Failed: " + e.message);
            }
            break;
        case 'importSkill':
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
            await this.refresh();
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
        case 'deleteSkill': // For bulk delete
            await this._skillManager.deleteSkill(data.id);
            await this.refresh();
            break;
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
               vscode.window.showErrorMessage(e?.message || 'Failed to create preset');
             }
             break;
        case 'updatePreset':
            try {
              await this._skillManager.savePreset(data.preset);
              await this.refresh();
            } catch (e: any) {
              vscode.window.showErrorMessage(e?.message || 'Failed to update preset');
            }
            break;
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
        case 'applyPreset':
            try {
                await this._skillManager.applyPreset(data.id, data.mode);
                vscode.window.showInformationMessage('Preset applied');
            } catch (e: any) {
                vscode.window.showErrorMessage('Failed to apply preset: ' + e.message);
            }
            break;
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
            await this._skillManager.updateSkillMetadata(data.id, { tags: data.tags, customDescription: data.customDescription });
            await this.refresh();
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

  private _getHtmlForWebview(webview: vscode.Webview, viewType: string) {
    const nonce = getNonce();
    const toolkitUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'webview-ui-toolkit', 'dist', 'toolkit.min.js')
    );
    const mainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
    const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'styles.css'));

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
  <link href="${stylesUri}" rel="stylesheet" />
  <title>Skills Wizard</title>
</head>
<body data-view="${viewType}">
  <div class="content" id="app-root"></div>
  <script type="module" nonce="${nonce}" src="${toolkitUri}"></script>
  <script type="module" nonce="${nonce}" src="${mainUri}"></script>
</body>
</html>`;
  }
}
