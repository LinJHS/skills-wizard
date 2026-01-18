import * as vscode from 'vscode';
import { Skill } from '../../models/types';

export type SkillItemType = 'skill' | 'name' | 'description' | 'tags' | 'file';

/**
 * Shared factory for creating skill tree items with consistent structure.
 * This ensures skills are displayed identically across all views.
 */
export class SkillTreeItemFactory {
  /**
   * Create the main skill item (collapsible to show details).
   */
  static createSkillItem(skill: Skill, contextPrefix: string = ''): vscode.TreeItem {
    const item = new vscode.TreeItem(
      skill.name,
      vscode.TreeItemCollapsibleState.Collapsed
    );
    
    // Show tags in description if available
    item.description = skill.tags && skill.tags.length > 0 
      ? `${skill.tags.map(t => `#${t}`).join(' ')}`
      : '';
    
    item.tooltip = new vscode.MarkdownString(
      `**${skill.name}**\n\n${skill.description || 'No description'}\n\n` +
      `${skill.tags?.length ? `Tags: ${skill.tags.join(', ')}` : ''}`
    );
    
    item.iconPath = new vscode.ThemeIcon('file-code');
    item.contextValue = contextPrefix ? `${contextPrefix}Skill` : 'skill';
    
    return item;
  }
  
  /**
   * Create detail items (children) for a skill.
   */
  static createSkillDetailItems(skill: Skill, contextPrefix: string = ''): vscode.TreeItem[] {
    const items: vscode.TreeItem[] = [];
    
    // Name item
    const nameItem = new vscode.TreeItem(
      `Name: ${skill.name}`,
      vscode.TreeItemCollapsibleState.None
    );
    nameItem.iconPath = new vscode.ThemeIcon('edit');
    nameItem.contextValue = contextPrefix ? `${contextPrefix}SkillName` : 'skillName';
    nameItem.command = {
      command: 'skillsWizard.editSkillName',
      title: 'Edit Name',
      arguments: [skill.id]
    };
    items.push(nameItem);
    
    // Description item
    const descItem = new vscode.TreeItem(
      `Description: ${skill.description || '(none)'}`,
      vscode.TreeItemCollapsibleState.None
    );
    descItem.iconPath = new vscode.ThemeIcon('note');
    descItem.contextValue = contextPrefix ? `${contextPrefix}SkillDescription` : 'skillDescription';
    descItem.command = {
      command: 'skillsWizard.editSkillDescription',
      title: 'Edit Description',
      arguments: [skill.id]
    };
    items.push(descItem);
    
    // Tags item
    const tagsItem = new vscode.TreeItem(
      `Tags: ${skill.tags?.length ? skill.tags.join(', ') : '(none)'}`,
      vscode.TreeItemCollapsibleState.None
    );
    tagsItem.iconPath = new vscode.ThemeIcon('tag');
    tagsItem.contextValue = contextPrefix ? `${contextPrefix}SkillTags` : 'skillTags';
    tagsItem.command = {
      command: 'skillsWizard.editTags',
      title: 'Edit Tags',
      arguments: [skill.id]
    };
    items.push(tagsItem);
    
    // Open SKILL.md item
    const skillMdItem = new vscode.TreeItem(
      'Open SKILL.md',
      vscode.TreeItemCollapsibleState.None
    );
    skillMdItem.iconPath = new vscode.ThemeIcon('file-code');
    skillMdItem.contextValue = contextPrefix ? `${contextPrefix}SkillMd` : 'skillMd';
    skillMdItem.command = {
      command: 'skillsWizard.openSkillMd',
      title: 'Open SKILL.md',
      arguments: [{
        id: skill.id, 
        path: skill.path, 
        isRemote: skill.source === 'global',
        name: skill.name
      }]
    };
    items.push(skillMdItem);

    // Open Skill Dir item
    const skillDirItem = new vscode.TreeItem(
      'Open Skill Dir',
      vscode.TreeItemCollapsibleState.None
    );
    skillDirItem.iconPath = new vscode.ThemeIcon('folder-opened');
    skillDirItem.contextValue = contextPrefix ? `${contextPrefix}SkillDir` : 'skillDir';
    skillDirItem.command = {
      command: 'skillsWizard.openSkillDir',
      title: 'Open Skill Directory',
      arguments: [{
        id: skill.id, 
        path: skill.path, 
        isRemote: skill.source === 'global',
        name: skill.name
      }]
    };
    items.push(skillDirItem);
    
    return items;
  }
}

/**
 * Base class for tree items that contain skills.
 */
export class BaseSkillTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly skill?: Skill,
    public readonly isCategory?: boolean,
    public readonly isDetailItem?: boolean
  ) {
    super(label, collapsibleState);
  }
}
