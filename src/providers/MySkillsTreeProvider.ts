import * as vscode from 'vscode';
import { SkillManager } from '../managers/SkillManager';
import { Skill } from '../models/types';

export class MySkillTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly skill?: Skill,
    public readonly isCategory?: boolean
  ) {
    super(label, collapsibleState);
    
    if (skill) {
      this.description = skill.description || '';
      this.tooltip = new vscode.MarkdownString(
        `**${skill.name}**\n\n${skill.description || 'No description'}\n\n` +
        `${skill.tags?.length ? `Tags: ${skill.tags.join(', ')}\n\n` : ''}` +
        `Path: \`${skill.path}\`\n\nMD5: \`${skill.md5}\``
      );
      this.iconPath = new vscode.ThemeIcon('file-code');
      this.contextValue = 'skill';
      
      // Add command to open skill file
      this.command = {
        command: 'skillsWizard.openSkill',
        title: 'Open Skill',
        arguments: [skill.id]
      };
      
      // Add tags as resource URI for potential decoration
      if (skill.tags && skill.tags.length > 0) {
        this.resourceUri = vscode.Uri.parse(`skill://tags/${skill.tags.join(',')}`);
      }
    } else if (isCategory) {
      this.iconPath = new vscode.ThemeIcon('tag');
      this.contextValue = 'category';
    }
  }
}

export class MySkillsTreeProvider implements vscode.TreeDataProvider<MySkillTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<MySkillTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  
  private importedSkills: Skill[] = [];
  private groupByTags = false;
  
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
  
  getTreeItem(element: MySkillTreeItem): vscode.TreeItem {
    return element;
  }
  
  async getChildren(element?: MySkillTreeItem): Promise<MySkillTreeItem[]> {
    if (!element) {
      // Root level
      if (this.importedSkills.length === 0) {
        return [];
      }
      
      if (this.groupByTags) {
        // Group by tags
        const tagMap = new Map<string, Skill[]>();
        const untagged: Skill[] = [];
        
        for (const skill of this.importedSkills) {
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
        // Show all skills directly
        return this.importedSkills.map(skill => new MySkillTreeItem(
          skill.name,
          vscode.TreeItemCollapsibleState.None,
          skill
        )).sort((a, b) => a.label.localeCompare(b.label));
      }
    } else if (element.isCategory) {
      // Show skills in this category
      const categoryName = element.label.replace(/\s*\(\d+\)$/, '');
      
      if (categoryName === 'Untagged') {
        const untagged = this.importedSkills.filter(s => !s.tags || s.tags.length === 0);
        return untagged.map(skill => new MySkillTreeItem(
          skill.name,
          vscode.TreeItemCollapsibleState.None,
          skill
        )).sort((a, b) => a.label.localeCompare(b.label));
      } else {
        const tagged = this.importedSkills.filter(s => s.tags?.includes(categoryName));
        return tagged.map(skill => new MySkillTreeItem(
          skill.name,
          vscode.TreeItemCollapsibleState.None,
          skill
        )).sort((a, b) => a.label.localeCompare(b.label));
      }
    }
    
    return [];
  }
}
