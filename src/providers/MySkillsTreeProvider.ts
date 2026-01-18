import * as vscode from 'vscode';
import { SkillManager } from '../managers/SkillManager';
import { Skill } from '../models/types';
import { BaseSkillTreeItem, SkillTreeItemFactory } from './common/SkillTreeItemFactory';

export class MySkillTreeItem extends BaseSkillTreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    skill?: Skill,
    isCategory?: boolean,
    isDetailItem?: boolean
  ) {
    super(label, collapsibleState, skill, isCategory, isDetailItem);
    
    if (isCategory) {
      this.iconPath = new vscode.ThemeIcon('tag');
      this.contextValue = 'category';
    }
  }
}

export class MySkillsTreeProvider implements vscode.TreeDataProvider<MySkillTreeItem | vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<MySkillTreeItem | vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  
  private importedSkills: Skill[] = [];
  private groupByTags = false;
  private searchQuery: string = '';
  
  constructor(private readonly skillManager: SkillManager) {}
  
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
  
  async loadSkills(): Promise<void> {
    const { imported } = await this.skillManager.scanForSkills();
    this.importedSkills = imported;
    this.refresh();
  }
  
  toggleGrouping(): void {
    this.groupByTags = !this.groupByTags;
    this.refresh();
  }
  
  setSearchQuery(query: string): void {
    this.searchQuery = query.toLowerCase();
    this.refresh();
  }
  
  private filterSkills(skills: Skill[]): Skill[] {
    if (!this.searchQuery) {
      return skills;
    }
    return skills.filter(skill => 
      skill.name.toLowerCase().includes(this.searchQuery) ||
      (skill.description && skill.description.toLowerCase().includes(this.searchQuery))
    );
  }
  
  getTreeItem(element: MySkillTreeItem | vscode.TreeItem): vscode.TreeItem {
    return element;
  }
  
  async getChildren(element?: MySkillTreeItem | vscode.TreeItem): Promise<Array<MySkillTreeItem | vscode.TreeItem>> {
    if (!element) {
      // Root level
      const filteredSkills = this.filterSkills(this.importedSkills);
      
      if (filteredSkills.length === 0) {
        return [];
      }
      
      if (this.groupByTags) {
        // Group by tags
        const tagMap = new Map<string, Skill[]>();
        const untagged: Skill[] = [];
        
        for (const skill of filteredSkills) {
          if (skill.tags && skill.tags.length > 0) {
            for (const tag of skill.tags) {
              if (!tagMap.has(tag)) {
                tagMap.set(tag, []);
              }
              tagMap.get(tag)!.push(skill);
            }
          } else {
            untagged.push(skill);
          }
        }
        
        const items: MySkillTreeItem[] = [];
        
        // Add tag categories
        for (const [tag, skills] of tagMap) {
          items.push(new MySkillTreeItem(
            `${tag} (${skills.length})`,
            vscode.TreeItemCollapsibleState.Collapsed,
            undefined,
            true
          ));
        }
        
        // Add untagged category if exists
        if (untagged.length > 0) {
          items.push(new MySkillTreeItem(
            `Untagged (${untagged.length})`,
            vscode.TreeItemCollapsibleState.Collapsed,
            undefined,
            true
          ));
        }
        
        return items.sort((a, b) => a.label.localeCompare(b.label));
      } else {
        // Show all skills directly using shared factory
        return filteredSkills.map(skill => {
          const item = SkillTreeItemFactory.createSkillItem(skill, '');
          return Object.assign(new MySkillTreeItem(
            skill.name,
            vscode.TreeItemCollapsibleState.Collapsed,
            skill
          ), item);
        }).sort((a, b) => a.label!.toString().localeCompare(b.label!.toString()));
      }
    } else if (element instanceof MySkillTreeItem && element.isCategory) {
      // Show skills in this category
      const categoryName = element.label.replace(/\s*\(\d+\)$/, '');
      const filteredSkills = this.filterSkills(this.importedSkills);
      
      let categorySkills: Skill[];
      if (categoryName === 'Untagged') {
        categorySkills = filteredSkills.filter(s => !s.tags || s.tags.length === 0);
      } else {
        categorySkills = filteredSkills.filter(s => s.tags?.includes(categoryName));
      }
      
      return categorySkills.map(skill => {
        const item = SkillTreeItemFactory.createSkillItem(skill, '');
        return Object.assign(new MySkillTreeItem(
          skill.name,
          vscode.TreeItemCollapsibleState.Collapsed,
          skill
        ), item);
      }).sort((a, b) => a.label!.toString().localeCompare(b.label!.toString()));
    } else if (element instanceof MySkillTreeItem && element.skill && !element.isDetailItem) {
      // Show skill details using shared factory
      return SkillTreeItemFactory.createSkillDetailItems(element.skill, '');
    }
    
    return [];
  }
}
