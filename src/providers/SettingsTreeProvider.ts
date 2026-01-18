import * as vscode from 'vscode';
import { SkillManager } from '../managers/SkillManager';

export class SettingsTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly settingKey?: string,
    public readonly currentValue?: string
  ) {
    super(label, collapsibleState);
    
    if (settingKey) {
      this.description = currentValue || '';
      this.tooltip = `Click to edit: ${settingKey}`;
      this.iconPath = new vscode.ThemeIcon('settings');
      this.contextValue = 'setting';
      
      // Add command to edit setting
      this.command = {
        command: settingKey === 'storagePath' ? 'skillsWizard.updateStoragePath' : 'skillsWizard.updateDefaultExportPath',
        title: 'Edit Setting',
        arguments: []
      };
    }
  }
}

export class SettingsTreeProvider implements vscode.TreeDataProvider<SettingsTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SettingsTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  
  constructor(private readonly skillManager: SkillManager) {}
  
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
  
  getTreeItem(element: SettingsTreeItem): vscode.TreeItem {
    return element;
  }
  
  async getChildren(element?: SettingsTreeItem): Promise<SettingsTreeItem[]> {
    if (!element) {
      // Root level: show all settings
      const storagePath = await this.skillManager.getEffectiveStoragePath();
      const config = vscode.workspace.getConfiguration('skillsWizard');
      const defaultExportPath = config.get<string>('defaultExportPath') || '.claude/skills/';
      
      return [
        new SettingsTreeItem(
          'Storage Path',
          vscode.TreeItemCollapsibleState.None,
          'storagePath',
          storagePath
        ),
        new SettingsTreeItem(
          'Default Export Path',
          vscode.TreeItemCollapsibleState.None,
          'defaultExportPath',
          defaultExportPath
        )
      ];
    }
    
    return [];
  }
}
