import * as vscode from 'vscode';
import { SkillManager } from '../managers/SkillManager';
import { Preset, Skill } from '../models/types';
import { BaseSkillTreeItem, SkillTreeItemFactory } from './common/SkillTreeItemFactory';

export class PresetTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly preset?: Preset,
    public readonly skill?: Skill,
    public readonly isDetailItem?: boolean
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
    }
  }
}

export class PresetsTreeProvider implements vscode.TreeDataProvider<PresetTreeItem | vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<PresetTreeItem | vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  
  private presets: Preset[] = [];
  private allSkills: Skill[] = [];
  private searchQuery: string = '';
  
  constructor(private readonly skillManager: SkillManager) {}
  
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
  
  async loadPresets(): Promise<void> {
    console.log('[PresetsTreeProvider] Loading presets...');
    this.presets = this.skillManager.getPresets();
    console.log(`[PresetsTreeProvider] Loaded ${this.presets.length} presets`);
    
    const { imported } = await this.skillManager.scanForSkills();
    this.allSkills = imported;
    console.log(`[PresetsTreeProvider] Loaded ${imported.length} imported skills`);
    
    // Debug: print preset skill IDs and available skill IDs
    for (const preset of this.presets) {
      console.log(`[PresetsTreeProvider] Preset "${preset.name}" has skill IDs: ${preset.skillIds.join(', ')}`);
      const availableSkills = preset.skillIds
        .map(id => this.allSkills.find(s => s.id === id))
        .filter(s => s !== undefined);
      console.log(`[PresetsTreeProvider] Found ${availableSkills.length}/${preset.skillIds.length} skills for preset "${preset.name}"`);
    }
    
    this.refresh();
  }
  
  setSearchQuery(query: string): void {
    this.searchQuery = query.toLowerCase();
    this.refresh();
  }
  
  private filterPresets(presets: Preset[]): Preset[] {
    if (!this.searchQuery) {
      return presets;
    }
    return presets.filter(preset => 
      preset.name.toLowerCase().includes(this.searchQuery) ||
      (preset.description && preset.description.toLowerCase().includes(this.searchQuery))
    );
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
  
  getTreeItem(element: PresetTreeItem | vscode.TreeItem): vscode.TreeItem {
    return element;
  }
  
  async getChildren(element?: PresetTreeItem | vscode.TreeItem): Promise<Array<PresetTreeItem | vscode.TreeItem>> {
    if (!element) {
      // Root level: show all presets
      const filteredPresets = this.filterPresets(this.presets);
      
      if (filteredPresets.length === 0) {
        return [];
      }
      
      return filteredPresets.map(preset => new PresetTreeItem(
        preset.name,
        vscode.TreeItemCollapsibleState.Collapsed,
        preset
      )).sort((a, b) => a.label!.toString().localeCompare(b.label!.toString()));
    } else if (element instanceof PresetTreeItem && element.preset) {
      // Show skills in this preset using shared factory
      const preset = element.preset;
      const skills = preset.skillIds
        .map(id => this.allSkills.find(s => s.id === id))
        .filter((s): s is Skill => s !== undefined);
      
      const filteredSkills = this.filterSkills(skills);
      
      return filteredSkills.map(skill => {
        const item = SkillTreeItemFactory.createSkillItem(skill, 'preset');
        const presetItem = new PresetTreeItem(
          skill.name,
          vscode.TreeItemCollapsibleState.Collapsed,
          undefined,
          skill
        );
        return Object.assign(presetItem, item);
      }).sort((a, b) => a.label!.toString().localeCompare(b.label!.toString()));
    } else if (element instanceof PresetTreeItem && element.skill && !element.isDetailItem) {
      // Show skill details using shared factory
      return SkillTreeItemFactory.createSkillDetailItems(element.skill, 'preset');
    }
    
    return [];
  }
}
