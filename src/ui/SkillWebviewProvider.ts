import * as vscode from 'vscode';
import { SkillManager } from '../managers/SkillManager';
import { DiscoveredSkill, Preset, Skill } from '../models/types';

export class SkillWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'skillsWizard.sidebarView';
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _skillManager: SkillManager
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'refresh':
            await this.refresh();
            break;
        case 'importSkill':
            await this._skillManager.importSkill(data.skill);
            await this.refresh();
            break;
        case 'deleteSkill':
            await this._skillManager.deleteSkill(data.id);
            await this.refresh();
            break;
        case 'addToWorkspace':
            try {
                await this._skillManager.exportSkillToWorkspace(data.id);
                vscode.window.showInformationMessage('Skill added to workspace');
            } catch (e: any) {
                vscode.window.showErrorMessage('Failed to add skill: ' + e.message);
            }
            break;
        case 'createPreset':
             const newPreset: Preset = {
                 id: Date.now().toString(),
                 name: data.name,
                 skillIds: []
             };
             await this._skillManager.savePreset(newPreset);
             await this.refresh();
             break;
        case 'updatePreset':
            await this._skillManager.savePreset(data.preset);
            await this.refresh();
            break;
        case 'deletePreset':
            await this._skillManager.deletePreset(data.id);
            await this.refresh();
            break;
        case 'applyPreset':
            try {
                await this._skillManager.applyPreset(data.id, data.mode);
                vscode.window.showInformationMessage('Preset applied');
            } catch (e: any) {
                vscode.window.showErrorMessage('Failed to apply preset: ' + e.message);
            }
            break;
        case 'updateSettings':
            if (data.defaultExportPath) {
                this._skillManager.updateDefaultExportPath(data.defaultExportPath);
                await this.refresh();
            }
            break;
        case 'updateSkillMetadata':
            await this._skillManager.updateSkillMetadata(data.id, { tags: data.tags, customName: data.customName });
            await this.refresh();
            break;
      }
    });
    
    // Initial load
    this.refresh();
  }
  
  public async refresh() {
      if (!this._view) return;
      const { discovered, imported } = await this._skillManager.scanForSkills();
      const presets = this._skillManager.getPresets();
      const defaultExportPath = vscode.workspace.getConfiguration('skillsWizard').get('defaultExportPath') || '.claude/skills/';
      
      this._view.webview.postMessage({
          type: 'state',
          discovered,
          imported,
          presets,
          defaultExportPath
      });
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Skills Wizard</title>
    <style>
        body { font-family: var(--vscode-font-family); padding: 10px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background); }
        h2, h3 { margin-bottom: 10px; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 5px; }
        .section { margin-bottom: 20px; }
        .item { padding: 5px; border: 1px solid var(--vscode-panel-border); margin-bottom: 5px; display: flex; flex-direction: column; }
        .item-header { display: flex; justify-content: space-between; align-items: center; }
        .item-actions { display: flex; gap: 5px; margin-top: 5px; }
        button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 8px; cursor: pointer; }
        button:hover { background: var(--vscode-button-hoverBackground); }
        button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
        input { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 4px; }
        .tag { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 2px 5px; border-radius: 3px; font-size: 0.8em; margin-right: 5px; }
        .hidden { display: none; }
    </style>
</head>
<body>
    <div class="section" id="import-section">
        <h3>Import Skills</h3>
        <div id="discovered-list"></div>
    </div>
    
    <div class="section" id="skills-section">
        <h3>My Skills</h3>
        <div id="imported-list"></div>
    </div>
    
    <div class="section" id="presets-section">
        <h3>Presets</h3>
        <div class="item">
            <input type="text" id="new-preset-name" placeholder="New Preset Name" />
            <button id="btn-create-preset">Create Preset</button>
        </div>
        <div id="presets-list"></div>
    </div>
    
    <div class="section" id="settings-section">
        <h3>Settings</h3>
        <label>Default Export Path:</label>
        <input type="text" id="setting-export-path" value=".claude/skills/" />
        <button id="btn-save-settings">Save</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let state = { discovered: [], imported: [], presets: [] };

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'state') {
                state = message;
                if (document.getElementById('setting-export-path')) {
                     document.getElementById('setting-export-path').value = state.defaultExportPath || '.claude/skills/';
                }
                render();
            }
        });

        function render() {
            renderDiscovered();
            renderImported();
            renderPresets();
        }

        function renderDiscovered() {
            const container = document.getElementById('discovered-list');
            container.innerHTML = '';
            
            // Filter out already imported ones logic could be here, or visually indicate
            // For now, list all discovered
            
            state.discovered.forEach(skill => {
                const isImported = state.imported.some(s => s.md5 === skill.md5);
                const el = document.createElement('div');
                el.className = 'item';
                el.innerHTML = \`
                    <div class="item-header">
                        <strong>\${skill.name}</strong>
                        \${isImported ? '<span class="tag">Imported</span>' : ''}
                    </div>
                    <div class="item-details">Source: \${skill.sourceLocation}</div>
                    <div class="item-actions">
                        \${!isImported ? \`<button onclick="importSkill('\${skill.path.replace(/\\\\/g, '/')}', '\${skill.name}', '\${skill.md5}', '\${skill.sourceLocation.replace(/\\\\/g, '/')}')">Import</button>\` : \`<button class="secondary" onclick="importSkill('\${skill.path.replace(/\\\\/g, '/')}', '\${skill.name}', '\${skill.md5}', '\${skill.sourceLocation.replace(/\\\\/g, '/')}')">Re-Import/Overwrite</button>\`}
                    </div>
                \`;
                container.appendChild(el);
            });
        }

        function renderImported() {
            const container = document.getElementById('imported-list');
            container.innerHTML = '';
            
            state.imported.forEach(skill => {
                const el = document.createElement('div');
                el.className = 'item';
                // Tag editing is simple prompt for now
                const tagsHtml = skill.tags.map(t => \`<span class="tag">\${t}</span>\`).join('');
                el.innerHTML = \`
                    <div class="item-header">
                        <strong>\${skill.name}</strong>
                    </div>
                    <div>\${tagsHtml}</div>
                    <div class="item-actions">
                        <button onclick="addToWorkspace('\${skill.id}')">Add to Workspace</button>
                        <button class="secondary" onclick="editTags('\${skill.id}', '\${skill.tags.join(',')}')">Edit Tags</button>
                        <button class="secondary" style="background: var(--vscode-errorForeground)" onclick="deleteSkill('\${skill.id}')">Delete</button>
                    </div>
                \`;
                container.appendChild(el);
            });
        }
        
        function renderPresets() {
             const container = document.getElementById('presets-list');
             container.innerHTML = '';
             
             state.presets.forEach(preset => {
                 const el = document.createElement('div');
                 el.className = 'item';
                 const skillCount = preset.skillIds.length;
                 
                 // Create skill selection checkboxes
                 let skillsSelection = '<div style="margin: 5px 0; max-height: 100px; overflow-y: auto; border: 1px solid #333; padding: 5px;">';
                 state.imported.forEach(s => {
                     const checked = preset.skillIds.includes(s.id) ? 'checked' : '';
                     skillsSelection += \`<div><input type="checkbox" onchange="togglePresetSkill('\${preset.id}', '\${s.id}', this.checked)" \${checked}> \${s.name}</div>\`;
                 });
                 skillsSelection += '</div>';

                 el.innerHTML = \`
                    <div class="item-header"><strong>\${preset.name}</strong> (\${skillCount} skills)</div>
                    <div class="item-content">
                        \${skillsSelection}
                    </div>
                    <div class="item-actions">
                        <button onclick="applyPreset('\${preset.id}', 'merge')">Apply (Merge)</button>
                        <button onclick="applyPreset('\${preset.id}', 'replace')">Apply (Replace)</button>
                        <button class="secondary" onclick="deletePreset('\${preset.id}')">Delete</button>
                    </div>
                 \`;
                 container.appendChild(el);
             });
        }

        // Actions
        window.importSkill = (path, name, md5, sourceLocation) => {
            vscode.postMessage({ type: 'importSkill', skill: { path, name, md5, sourceLocation } });
        };
        
        window.deleteSkill = (id) => {
            if(confirm('Delete this skill?')) {
                vscode.postMessage({ type: 'deleteSkill', id });
            }
        };

        window.addToWorkspace = (id) => {
            vscode.postMessage({ type: 'addToWorkspace', id });
        };
        
        window.editTags = (id, currentTags) => {
            const newTags = prompt('Enter tags (comma separated)', currentTags);
            if (newTags !== null) {
                const tags = newTags.split(',').map(t => t.trim()).filter(t => t);
                vscode.postMessage({ type: 'updateSkillMetadata', id, tags });
            }
        };
        
        document.getElementById('btn-create-preset').onclick = () => {
            const name = document.getElementById('new-preset-name').value;
            if (name) {
                vscode.postMessage({ type: 'createPreset', name });
                document.getElementById('new-preset-name').value = '';
            }
        };
        
        window.deletePreset = (id) => {
            if(confirm('Delete preset?')) {
                vscode.postMessage({ type: 'deletePreset', id });
            }
        };
        
        window.togglePresetSkill = (presetId, skillId, checked) => {
            const preset = state.presets.find(p => p.id === presetId);
            if (preset) {
                if (checked) {
                    if (!preset.skillIds.includes(skillId)) preset.skillIds.push(skillId);
                } else {
                    preset.skillIds = preset.skillIds.filter(id => id !== skillId);
                }
                vscode.postMessage({ type: 'updatePreset', preset });
            }
        };

        window.applyPreset = (id, mode) => {
             vscode.postMessage({ type: 'applyPreset', id, mode });
        };
        
        document.getElementById('btn-save-settings').onclick = () => {
             const val = document.getElementById('setting-export-path').value;
             vscode.postMessage({ type: 'updateSettings', defaultExportPath: val });
        };

        // Init
        // vscode.postMessage({ type: 'refresh' });
    </script>
</body>
</html>`;
  }
}
