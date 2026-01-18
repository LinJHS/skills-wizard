/**
 * TreeView provider for Skills
 */

import * as vscode from 'vscode';
import { SkillManager } from '../managers/SkillManager';
import { Skill } from '../models/types';

export type SkillTreeElement = SkillTreeItem | SkillDetailItem | SkillActionItem;

export class SkillsTreeProvider implements vscode.TreeDataProvider<SkillTreeElement> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SkillTreeElement | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private skillManager: SkillManager) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SkillTreeElement): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: SkillTreeElement): Promise<SkillTreeElement[]> {
    if (!element) {
      // Root level - show imported skills
      const { imported } = await this.skillManager.scanForSkills();
      return imported.map(skill => new SkillTreeItem(
        skill,
        vscode.TreeItemCollapsibleState.Collapsed
      ));
    } else if (element instanceof SkillTreeItem) {
      // Show skill details (tags, actions)
      return this.getSkillDetails(element.skill);
    }
    return [];
  }

  private getSkillDetails(skill: Skill): SkillTreeElement[] {
    const items: SkillTreeItem[] = [];

    // Description
    if (skill.description) {
      items.push(new SkillDetailItem('description', skill.description, skill));
    }

    // Tags
    if (skill.tags && skill.tags.length > 0) {
      items.push(new SkillDetailItem('tags', `Tags: ${skill.tags.join(', ')}`, skill));
    }

    // Actions
    items.push(new SkillActionItem('export', 'Export to Workspace', skill, 'export'));
    items.push(new SkillActionItem('open', 'View Files', skill, 'file-code'));
    items.push(new SkillActionItem('edit', 'Edit Tags', skill, 'tag'));
    items.push(new SkillActionItem('delete', 'Delete', skill, 'trash'));

    return items;
  }
}

export class SkillTreeItem extends vscode.TreeItem {
  constructor(
    public readonly skill: Skill,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(skill.name, collapsibleState);
    
    this.description = skill.description || '';
    this.tooltip = this.getTooltip();
    this.contextValue = 'skill';
    this.iconPath = new vscode.ThemeIcon('file-code');
  }

  getTooltip(): string {
    let tooltip = `**${this.skill.name}**\n\n`;
    if (this.skill.description) {
      tooltip += `${this.skill.description}\n\n`;
    }
    if (this.skill.tags && this.skill.tags.length > 0) {
      tooltip += `Tags: ${this.skill.tags.join(', ')}`;
    }
    return tooltip;
  }
}

export class SkillDetailItem extends vscode.TreeItem {
  constructor(
    public readonly type: string,
    public readonly text: string,
    public readonly skill: Skill
  ) {
    super(text, vscode.TreeItemCollapsibleState.None);
    
    this.contextValue = `skill-detail-${type}`;
    this.iconPath = this.getIcon();
  }

  private getIcon(): vscode.ThemeIcon {
    switch (this.type) {
      case 'description':
        return new vscode.ThemeIcon('info');
      case 'tags':
        return new vscode.ThemeIcon('tag');
      default:
        return new vscode.ThemeIcon('circle-outline');
    }
  }
}

export class SkillActionItem extends vscode.TreeItem {
  constructor(
    public readonly action: string,
    public readonly text: string,
    public readonly skill: Skill,
    iconName: string
  ) {
    super(text, vscode.TreeItemCollapsibleState.None);
    
    this.contextValue = `skill-action-${action}`;
    this.iconPath = new vscode.ThemeIcon(iconName);
    this.command = {
      command: `skills-wizard.skill.${action}`,
      title: text,
      arguments: [skill]
    };
  }
}
