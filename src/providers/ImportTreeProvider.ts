import * as vscode from 'vscode';
import { SkillManager } from '../managers/SkillManager';
import { DiscoveredSkill } from '../models/types';

export class ImportTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly skill?: DiscoveredSkill,
    public readonly isCategory?: boolean
  ) {
    super(label, collapsibleState);
    
    if (skill) {
      this.description = skill.description || '';
      this.tooltip = new vscode.MarkdownString(
        `**${skill.name}**\n\n${skill.description || 'No description'}\n\n` +
        `Path: \`${skill.path}\`\n\nMD5: \`${skill.md5}\``
      );
      this.iconPath = new vscode.ThemeIcon('file-code');
      this.contextValue = 'skill';
      
      // Add badge for source
      if (skill.isRemote) {
        this.resourceUri = vscode.Uri.parse(`skill://remote/${skill.name}`);
      }
    } else if (isCategory) {
      this.iconPath = new vscode.ThemeIcon('folder');
      this.contextValue = 'category';
    }
  }
}

export class ImportTreeProvider implements vscode.TreeDataProvider<ImportTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ImportTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  
  private scannedSkills: DiscoveredSkill[] = [];
  
  constructor(private readonly skillManager: SkillManager) {}
  
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
  
  async loadSkills(): Promise<void> {
    const { discovered } = await this.skillManager.scanForSkills();
    this.scannedSkills = discovered;
    this.refresh();
  }
  
  getTreeItem(element: ImportTreeItem): vscode.TreeItem {
    return element;
  }
  
  async getChildren(element?: ImportTreeItem): Promise<ImportTreeItem[]> {
    if (!element) {
      // Root level: show categories or all skills
      if (this.scannedSkills.length === 0) {
        return [];
      }
      
      // Group by source (local workspace vs remote)
      const local = this.scannedSkills.filter(s => !s.isRemote);
      const remote = this.scannedSkills.filter(s => s.isRemote);
      
      const items: ImportTreeItem[] = [];
      
      if (local.length > 0) {
        items.push(new ImportTreeItem(
          `Local Skills (${local.length})`,
          vscode.TreeItemCollapsibleState.Expanded,
          undefined,
          true
        ));
      }
      
      if (remote.length > 0) {
        items.push(new ImportTreeItem(
          `Remote Skills (${remote.length})`,
          vscode.TreeItemCollapsibleState.Collapsed,
          undefined,
          true
        ));
      }
      
      return items;
    } else if (element.isCategory) {
      // Show skills in this category
      const isRemoteCategory = element.label.startsWith('Remote');
      const skills = this.scannedSkills.filter(s => s.isRemote === isRemoteCategory);
      
      return skills.map(skill => new ImportTreeItem(
        skill.name,
        vscode.TreeItemCollapsibleState.None,
        skill
      ));
    }
    
    return [];
  }
}
