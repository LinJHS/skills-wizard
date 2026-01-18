/**
 * TreeView provider for importing skills
 */

import * as vscode from 'vscode';
import { SkillManager } from '../managers/SkillManager';
import { DiscoveredSkill } from '../models/types';

export class ImportTreeProvider implements vscode.TreeDataProvider<ImportTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ImportTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private skillManager: SkillManager) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ImportTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ImportTreeItem): Promise<ImportTreeItem[]> {
    if (!element) {
      const { discovered, imported } = await this.skillManager.scanForSkills();
      
      return discovered.map(skill => {
        const alreadyImported = imported.find(s => s.md5 === skill.md5);
        return new DiscoveredSkillItem(skill, !!alreadyImported);
      });
    }
    return [];
  }
}

export type ImportTreeItem = DiscoveredSkillItem;

export class DiscoveredSkillItem extends vscode.TreeItem {
  constructor(
    public readonly skill: DiscoveredSkill,
    public readonly isImported: boolean
  ) {
    super(skill.name, vscode.TreeItemCollapsibleState.None);
    
    this.description = skill.description || '';
    this.tooltip = this.getTooltip();
    this.contextValue = isImported ? 'discovered-skill-imported' : 'discovered-skill';
    this.iconPath = this.getIcon();
    
    // Set command to import when clicked
    if (!isImported) {
      this.command = {
        command: 'skills-wizard.importSkillFromTree',
        title: 'Import Skill',
        arguments: [skill]
      };
    }
  }

  private getTooltip(): string {
    let tooltip = `**${this.skill.name}**\n\n`;
    if (this.skill.description) {
      tooltip += `${this.skill.description}\n\n`;
    }
    if (this.skill.isRemote) {
      tooltip += 'Source: GitHub\n';
    }
    if (this.isImported) {
      tooltip += '\n✓ Already imported';
    }
    return tooltip;
  }

  private getIcon(): vscode.ThemeIcon {
    if (this.isImported) {
      return new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
    }
    if (this.skill.isRemote) {
      return new vscode.ThemeIcon('cloud-download');
    }
    return new vscode.ThemeIcon('file-code');
  }
}
