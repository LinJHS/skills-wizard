/**
 * Skill Manager - Main coordinator using modular managers
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { StorageManager } from './StorageManager';
import { SkillImporter } from './SkillImporter';
import { SkillExporter } from './SkillExporter';
import { PresetManager } from './PresetManager';
import { SkillScanner, ScanResult } from './SkillScanner';
import { Skill, Preset, SkillMetadata, DiscoveredSkill } from '../models/types';
import { getDefaultSkillsWizardStoragePath, resolvePath } from '../utils/paths';

export class SkillManager {
  private storage: StorageManager;
  private importer: SkillImporter;
  private exporter: SkillExporter;
  private presetManager: PresetManager;
  private scanner: SkillScanner;
  private ready: Promise<void>;

  constructor(private context: vscode.ExtensionContext) {
    const storagePath = this.getStoragePathFromSettings();
    this.storage = new StorageManager(storagePath);
    this.importer = new SkillImporter(this.storage);
    this.exporter = new SkillExporter(this.storage);
    this.presetManager = new PresetManager(this.storage);
    this.scanner = new SkillScanner();
    this.ready = this.init();
  }

  private getStoragePathFromSettings(): string {
    const custom = vscode.workspace.getConfiguration('skillsWizard').get<string>('storagePath')?.trim();
    if (custom) {
      return resolvePath(custom);
    }
    return getDefaultSkillsWizardStoragePath();
  }

  private async init(): Promise<void> {
    await this.storage.init();
  }

  private async ensureReady(): Promise<void> {
    await this.ready;
  }

  /**
   * Scan for skills in default paths
   */
  async scanForSkills(): Promise<{ discovered: DiscoveredSkill[]; imported: Skill[] }> {
    await this.ensureReady();
    const discovered = await this.scanner.scanDefaultPaths();
    const imported = await this.importer.getAllSkills();
    return { discovered, imported };
  }

  /**
   * Scan custom path
   */
  async scanCustomPath(customPath: string): Promise<ScanResult> {
    await this.ensureReady();
    return await this.scanner.scanCustomPath(customPath);
  }

  /**
   * Scan GitHub repository
   */
  async scanGitHub(url: string): Promise<ScanResult> {
    await this.ensureReady();
    return await this.scanner.scanGitHub(url);
  }

  /**
   * Import a skill
   */
  async importSkill(skill: DiscoveredSkill): Promise<string> {
    await this.ensureReady();
    return await this.importer.importSkill(skill);
  }

  /**
   * Delete a skill
   */
  async deleteSkill(skillId: string): Promise<void> {
    await this.ensureReady();
    await this.importer.deleteSkill(skillId);
  }

  /**
   * Update skill metadata
   */
  async updateSkillMetadata(skillId: string, updates: Partial<SkillMetadata>): Promise<void> {
    await this.ensureReady();
    await this.importer.updateMetadata(skillId, updates);
  }

  /**
   * Export skill to workspace
   */
  async exportSkillToWorkspace(skillId: string, targetPath?: string): Promise<void> {
    await this.ensureReady();
    await this.exporter.exportToWorkspace(skillId, targetPath);
  }

  /**
   * Export skills to zip
   */
  async exportSkillsToZip(skillIds: string[], zipPath: string): Promise<void> {
    await this.ensureReady();
    await this.exporter.exportToZip(skillIds, zipPath);
  }

  /**
   * Get skill file path
   */
  async getSkillFilePath(skillId: string): Promise<string | null> {
    await this.ensureReady();
    const skillPath = this.storage.getSkillPath(skillId);
    return path.join(skillPath, 'SKILL.md');
  }

  /**
   * Get effective storage path
   */
  async getEffectiveStoragePath(): Promise<string> {
    return this.getStoragePathFromSettings();
  }

  /**
   * Update storage path
   */
  updateStoragePath(newPath: string): void {
    // This would require recreating all managers
    vscode.window.showInformationMessage('Please reload VS Code to apply storage path changes.');
  }

  /**
   * Update default export path
   */
  updateDefaultExportPath(path: string): void {
    vscode.workspace.getConfiguration('skillsWizard').update('defaultExportPath', path, vscode.ConfigurationTarget.Global);
  }

  // Preset methods
  
  getPresets(): Preset[] {
    return this.presetManager.getPresets();
  }

  async savePreset(preset: Preset, options?: { allowOverwrite?: boolean }): Promise<void> {
    await this.ensureReady();
    await this.presetManager.savePreset(preset, options);
  }

  async deletePreset(presetId: string): Promise<void> {
    await this.ensureReady();
    await this.presetManager.deletePreset(presetId);
  }

  async removeSkillsFromPreset(presetId: string, skillIds: string[]): Promise<void> {
    await this.ensureReady();
    await this.presetManager.removeSkillsFromPreset(presetId, skillIds);
  }

  async applyPreset(presetId: string, mode: 'merge' | 'replace'): Promise<void> {
    await this.ensureReady();
    await this.presetManager.applyPreset(presetId, mode);
  }

  async exportPresetsToZip(ids: string[] | 'all', zipPath: string): Promise<void> {
    await this.ensureReady();
    await this.exporter.exportPresetsToZip(ids, zipPath);
  }

  async importBundle(bundlePath: string, allowOverwrite: boolean, importPresetsAsIs: boolean): Promise<{
    imported: number;
    overwritten: number;
    skipped: number;
    totalSkills: number;
    presetsImported: number;
    presetsOverwritten: number;
    presetsSkipped: number;
  }> {
    await this.ensureReady();
    return await this.exporter.importBundle(bundlePath, allowOverwrite, importPresetsAsIs);
  }
}
