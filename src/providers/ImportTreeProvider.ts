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
      source: discovered.isRemote ? 'global' : 'workspace',
      isImported: false,
      originalDiscovered: discovered
    };
  }
  
  async getChildren(element?: ImportTreeItem | vscode.TreeItem): Promise<Array<ImportTreeItem | vscode.TreeItem>> {
    if (!element) {
      // Root level: show categories
      if (this.scannedSkills.length === 0) {
        return [];
      }
      
      // Group by source location
      const grouped = new Map<string, DiscoveredSkill[]>();
      
      for (const skill of this.scannedSkills) {
        const location = skill.isRemote ? 'GitHub' : skill.sourceLocation;
        if (!grouped.has(location)) {
          grouped.set(location, []);
        }
        grouped.get(location)!.push(skill);
      }
      
      const items: ImportTreeItem[] = [];
      
      for (const [location, skills] of grouped) {
        items.push(new ImportTreeItem(
          `${location} (${skills.length})`,
          vscode.TreeItemCollapsibleState.Collapsed,
          undefined,
          true
        ));
      }
      
      return items.sort((a, b) => a.label!.toString().localeCompare(b.label!.toString()));
    } else if (element instanceof ImportTreeItem && element.isCategory) {
      // Show skills in this category
      const categoryLabel = element.label!.toString();
      const locationMatch = categoryLabel.match(/^(.+?)\s*\(\d+\)$/);
      const location = locationMatch ? locationMatch[1] : categoryLabel;
      
      const skills = this.scannedSkills.filter(s => {
        const skillLocation = s.isRemote ? 'GitHub' : s.sourceLocation;
        return skillLocation === location;
      });
      
      // Use shared factory to create skill items
      return skills.map(discoveredSkill => {
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
      }).sort((a, b) => a.label!.toString().localeCompare(b.label!.toString()));
    } else if (element instanceof ImportTreeItem && element.skill && !element.isDetailItem) {
      // Show skill details using shared factory
      const skill = this.convertDiscoveredToSkill(element.skill);
      return SkillTreeItemFactory.createSkillDetailItems(skill, 'import');
    }
    
    return [];
  }
}
