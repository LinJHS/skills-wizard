/**
 * TreeView provider for Presets
 */

import * as vscode from 'vscode';
import { SkillManager } from '../managers/SkillManager';
import { Preset, Skill } from '../models/types';

export class PresetsTreeProvider implements vscode.TreeDataProvider<PresetTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<PresetTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private skillManager: SkillManager) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: PresetTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: PresetTreeItem): Promise<PresetTreeItem[]> {
    if (!element) {
      // Root level - show all presets
      const presets = this.skillManager.getPresets();
      return presets.map(preset => new PresetItem(preset));
    } else if (element instanceof PresetItem) {
      // Show skills in this preset + actions
      return this.getPresetChildren(element.preset);
    }
    return [];
  }

  private async getPresetChildren(preset: Preset): Promise<PresetTreeItem[]> {
    const items: PresetTreeItem[] = [];
    const { imported } = await this.skillManager.scanForSkills();
    
    // Add skills in preset
    const skills = imported.filter(s => preset.skillIds.includes(s.id));
    items.push(...skills.map(skill => new PresetSkillItem(skill, preset)));

    // Add actions
    items.push(new PresetActionItem('apply-merge', 'Apply (Merge)', preset, 'layers'));
    items.push(new PresetActionItem('apply-replace', 'Apply (Replace)', preset, 'replace'));
    items.push(new PresetActionItem('export', 'Export', preset, 'export'));
    items.push(new PresetActionItem('delete', 'Delete', preset, 'trash'));

    return items;
  }
}

export type PresetTreeItem = PresetItem | PresetSkillItem | PresetActionItem;

export class PresetItem extends vscode.TreeItem {
  constructor(public readonly preset: Preset) {
    super(preset.name, vscode.TreeItemCollapsibleState.Collapsed);
    
    this.description = `${preset.skillIds.length} skills`;
    this.tooltip = `Preset: ${preset.name}\n${preset.skillIds.length} skill(s)`;
    this.contextValue = 'preset';
    this.iconPath = new vscode.ThemeIcon('layers');
  }
}

export class PresetSkillItem extends vscode.TreeItem {
  constructor(
    public readonly skill: Skill,
    public readonly preset: Preset
  ) {
    super(skill.name, vscode.TreeItemCollapsibleState.None);
    
    this.description = skill.description || '';
    this.tooltip = skill.description;
    this.contextValue = 'preset-skill';
    this.iconPath = new vscode.ThemeIcon('file-code');
  }
}

export class PresetActionItem extends vscode.TreeItem {
  constructor(
    public readonly action: string,
    public readonly text: string,
    public readonly preset: Preset,
    iconName: string
  ) {
    super(text, vscode.TreeItemCollapsibleState.None);
    
    this.contextValue = `preset-action-${action}`;
    this.iconPath = new vscode.ThemeIcon(iconName);
    this.command = {
      command: `skills-wizard.preset.${action}`,
      title: text,
      arguments: [preset]
    };
  }
}
