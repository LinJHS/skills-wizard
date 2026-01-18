/**
 * Preset Manager - Handles preset operations
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { Preset } from '../models/types';
import { StorageManager } from './StorageManager';

export class PresetManager {
  constructor(private storage: StorageManager) {}

  /**
   * Get all presets
   */
  getPresets(): Preset[] {
    const config = this.storage.getConfig();
    return config.presets || [];
  }

  /**
   * Save or update a preset
   */
  async savePreset(preset: Preset, options?: { allowOverwrite?: boolean }): Promise<void> {
    const config = this.storage.getConfig();
    const existingIndex = config.presets.findIndex(p => p.name === preset.name && p.id !== preset.id);

    if (existingIndex >= 0) {
      if (!options?.allowOverwrite) {
        throw new Error(`Preset "${preset.name}" already exists`);
      }
      config.presets[existingIndex] = preset;
    } else {
      const updateIndex = config.presets.findIndex(p => p.id === preset.id);
      if (updateIndex >= 0) {
        config.presets[updateIndex] = preset;
      } else {
        config.presets.push(preset);
      }
    }

    await this.storage.saveConfig(config);
  }

  /**
   * Delete a preset
   */
  async deletePreset(presetId: string): Promise<void> {
    const config = this.storage.getConfig();
    config.presets = config.presets.filter(p => p.id !== presetId);
    await this.storage.saveConfig(config);
  }

  /**
   * Remove skills from preset
   */
  async removeSkillsFromPreset(presetId: string, skillIds: string[]): Promise<void> {
    const config = this.storage.getConfig();
    const preset = config.presets.find(p => p.id === presetId);
    
    if (!preset) {
      throw new Error('Preset not found');
    }

    preset.skillIds = preset.skillIds.filter(id => !skillIds.includes(id));
    await this.storage.saveConfig(config);
  }

  /**
   * Apply preset to workspace
   */
  async applyPreset(presetId: string, mode: 'merge' | 'replace'): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      throw new Error('No workspace folder open');
    }

    const config = this.storage.getConfig();
    const preset = config.presets.find(p => p.id === presetId);
    if (!preset) {
      throw new Error('Preset not found');
    }

    const defaultExportPath = vscode.workspace.getConfiguration('skillsWizard').get<string>('defaultExportPath') || '.claude/skills/';
    const targetDir = path.join(workspaceFolders[0].uri.fsPath, defaultExportPath);

    // In replace mode, remove existing skills first
    if (mode === 'replace' && await fs.pathExists(targetDir)) {
      await fs.remove(targetDir);
    }

    await fs.ensureDir(targetDir);

    // Copy each skill in the preset
    for (const skillId of preset.skillIds) {
      const skillDir = this.storage.getSkillPath(skillId);
      if (await fs.pathExists(skillDir)) {
        const skillName = path.basename(skillDir);
        const targetPath = path.join(targetDir, skillName);
        await fs.copy(skillDir, targetPath, { overwrite: true });
      }
    }
  }
}
