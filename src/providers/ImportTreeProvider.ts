import * as vscode from 'vscode';
import { SkillManager } from '../managers/SkillManager';
import { DiscoveredSkill, Skill } from '../models/types';
import { SkillTreeItemFactory } from './common/SkillTreeItemFactory';

export class ImportTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly skill?: DiscoveredSkill,
    public readonly isCategory?: boolean,
    public readonly isDetailItem?: boolean
  ) {
    super(label, collapsibleState);
    
    if (isCategory) {
      this.iconPath = new vscode.ThemeIcon('folder');
      this.contextValue = 'category';
    }
  }
}

export class ImportTreeProvider implements vscode.TreeDataProvider<ImportTreeItem | vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ImportTreeItem | vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  
  private scannedSkills: DiscoveredSkill[] = [];
  private importedMd5s: Set<string> = new Set();
  private searchQuery: string = '';
  
  constructor(private readonly skillManager: SkillManager) {}
  
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
  
  async loadSkills(): Promise<void> {
    const { allDiscovered, imported } = await this.skillManager.scanForSkills();
    this.scannedSkills = allDiscovered || [];
    this.importedMd5s = new Set(imported.map(s => s.md5));
    this.refresh();
  }
  
  setSearchQuery(query: string): void {
    this.searchQuery = query.toLowerCase();
    this.refresh();
  }
  
  private filterSkills(skills: DiscoveredSkill[]): DiscoveredSkill[] {
    if (!this.searchQuery) {
      return skills;
    }
    return skills.filter(skill => 
      skill.name.toLowerCase().includes(this.searchQuery) ||
      (skill.description && skill.description.toLowerCase().includes(this.searchQuery))
    );
  }
  
  getSkill(id: string): DiscoveredSkill | undefined {
    return this.scannedSkills.find(s => s.md5 === id);
  }
  
  getTreeItem(element: ImportTreeItem | vscode.TreeItem): vscode.TreeItem {
    return element;
  }
  
  private convertDiscoveredToSkill(discovered: DiscoveredSkill): Skill & { originalDiscovered: DiscoveredSkill } {
    return {
      id: discovered.md5,
      name: discovered.name,
      path: discovered.path,
      description: discovered.description,
      tags: [],
      md5: discovered.md5,
      source: discovered.source,
      isImported: false,
      originalDiscovered: discovered
    };
  }
  
  async getChildren(element?: ImportTreeItem | vscode.TreeItem): Promise<Array<ImportTreeItem | vscode.TreeItem>> {
    if (!element) {
      // Root level: show all skills directly (no folder grouping), sorted alphabetically
      const filteredSkills = this.filterSkills(this.scannedSkills);
      
      if (filteredSkills.length === 0) {
        return [];
      }
      
      // Use shared factory to create skill items
      const items = filteredSkills.map(discoveredSkill => {
        const skill = this.convertDiscoveredToSkill(discoveredSkill);
        const isImported = this.importedMd5s.has(discoveredSkill.md5);
        const item = SkillTreeItemFactory.createSkillItem(skill, 'import');
        const importItem = new ImportTreeItem(
          skill.name,
          vscode.TreeItemCollapsibleState.Collapsed,
          discoveredSkill,
          false,
          false
        );
        // Mark imported skills
        if (isImported) {
          importItem.description = '✓ Imported';
          importItem.contextValue = 'importedSkill';
        }
        return Object.assign(importItem, item);
      });
      
      // Sort alphabetically by name
      return items.sort((a, b) => a.label!.toString().localeCompare(b.label!.toString()));
    } else if (element instanceof ImportTreeItem && element.skill && !element.isDetailItem) {
      // Show skill details using shared factory
      const skill = this.convertDiscoveredToSkill(element.skill);
      return SkillTreeItemFactory.createSkillDetailItems(skill, 'import');
    }
    
    return [];
  }
}
