import * as vscode from 'vscode';
import { SkillManager } from '../managers/SkillManager';
import { Preset, Skill } from '../models/types';

export class PresetTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly preset?: Preset,
    public readonly skill?: Skill
  ) {
    super(label, collapsibleState);
    
    if (preset) {
      this.description = `${preset.skillIds.length} skills`;
      this.tooltip = new vscode.MarkdownString(
        `**${preset.name}**\n\n` +
        `Skills: ${preset.skillIds.length}\n\n` +
        `ID: \`${preset.id}\``
      );
      this.iconPath = new vscode.ThemeIcon('package');
      this.contextValue = 'preset';
    } else if (skill) {
      this.description = skill.description || '';
      this.tooltip = skill.description || skill.name;
      this.iconPath = new vscode.ThemeIcon('file-code');
      this.contextValue = 'presetSkill';
      
      // Add command to open skill file
      this.command = {
        command: 'skillsWizard.openSkill',
        title: 'Open Skill',
        arguments: [skill.id]
      };
    }
  }
}

export class PresetsTreeProvider implements vscode.TreeDataProvider<PresetTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<PresetTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  
  private presets: Preset[] = [];
  private allSkills: Skill[] = [];
  
  constructor(private readonly skillManager: SkillManager) {}
  
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
  
  async loadPresets(): Promise<void> {
    this.presets = this.skillManager.getPresets();
    const { imported } = await this.skillManager.scanForSkills();
    this.allSkills = imported;
    this.refresh();
  }
  
  getTreeItem(element: PresetTreeItem): vscode.TreeItem {
    return element;
  }
  
  async getChildren(element?: PresetTreeItem): Promise<PresetTreeItem[]> {
    if (!element) {
      // Root level: show all presets
      if (this.presets.length === 0) {
        return [];
      }
      
      return this.presets.map(preset => new PresetTreeItem(
        preset.name,
        vscode.TreeItemCollapsibleState.Collapsed,
        preset
      )).sort((a, b) => a.label.localeCompare(b.label));
    } else if (element.preset) {
      // Show skills in this preset
      const preset = element.preset;
      const skills = preset.skillIds
        .map(id => this.allSkills.find(s => s.id === id))
        .filter((s): s is Skill => s !== undefined);
      
      return skills.map(skill => new PresetTreeItem(
        skill.name,
        vscode.TreeItemCollapsibleState.None,
        undefined,
        skill
      )).sort((a, b) => a.label.localeCompare(b.label));
    }
    
    return [];
  }
}
